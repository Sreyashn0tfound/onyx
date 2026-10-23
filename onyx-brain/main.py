import os
os.environ["PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION"] = "python"
os.environ["TF_ENABLE_ONEDNN_OPTS"] = "0"
import io
import wave
import base64
import asyncio
import re
import cv2
import json
import threading
from contextlib import asynccontextmanager
from functools import lru_cache
import numpy as np
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Dict, Any, Optional, List
import uvicorn

import mediapipe as mp
try:
    from pykokoro import KokoroPipeline, PipelineConfig
    _KOKORO_AVAILABLE = True
except Exception as _kokoro_err:
    KokoroPipeline = None  # type: ignore
    PipelineConfig = None  # type: ignore
    _KOKORO_AVAILABLE = False
    print(f"[Onyx Warning] PyKokoro unavailable (audio TTS disabled): {_kokoro_err}")

# Lazy-load DeepFace to avoid hard TF import crash on startup.
# The /api/cv/analyze endpoint already has a try/except so it degrades gracefully.
try:
    from deepface import DeepFace
    _DEEPFACE_AVAILABLE = True
except Exception as _deepface_err:
    DeepFace = None  # type: ignore
    _DEEPFACE_AVAILABLE = False
    print(f"[Onyx Warning] DeepFace unavailable (emotion detection disabled): {_deepface_err}")

# 🔥 IMPORT OUR MODULAR GRAPH, PERSONAS, AND PARSER
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage
from config import ONYX_BRAIN_SECRET, ALLOWED_ORIGINS, HOST, PORT, DEV_RELOAD
from llm import get_llm, message_text, parse_json_response, MODEL_FAST, MODEL_DEEP
from graph import swarm_app, PANEL_MEMBERS
from personas.diva_tutor import diva_tutor_node
from parser_service import parser_service
from execution_engine import ExecutionEngine, SANDBOX_MODE
from scoring_engine import DeterministicScorer
from verification_engine import NeuroSymbolicVerifier
from personas.amazon_q import amazon_q_node
from ast_engine import analyze_code_complexity, feedback_for
from complexity import is_quadratic_or_worse

# --- VOICE MAPPINGS ---
PERSONA_VOICES = {
    "Tech Lead": "am_adam",        # Shaun
    "Architect": "bm_george",      # Jacob (key must match panel_satisfaction key)
    "HR": "af_sarah",              # Asha
    "Diva": "af_bella",            # Diva (Tutor)
    "Onyx Core": "am_michael",     # Fallback
    "System": "am_michael",
    "Amazon Q Assistant": "am_michael"
}

KOKORO_PIPELINES: Dict[str, Any] = {}
_KOKORO_LOCKS: Dict[str, threading.Lock] = {}
_KOKORO_INIT_LOCK = threading.Lock()

def get_tts_pipeline(voice_id: str):
    if not _KOKORO_AVAILABLE or KokoroPipeline is None or PipelineConfig is None:
        return None, None
    with _KOKORO_INIT_LOCK:
        if voice_id not in KOKORO_PIPELINES:
            print(f"[Onyx TTS] Initializing voice: {voice_id}")
            KOKORO_PIPELINES[voice_id] = KokoroPipeline(PipelineConfig(voice=voice_id))
            _KOKORO_LOCKS[voice_id] = threading.Lock()
        return KOKORO_PIPELINES[voice_id], _KOKORO_LOCKS[voice_id]


def _warmup_models():
    """Runs in a background thread so the server accepts requests immediately.
    Initialising every voice up-front removes the multi-second 'first time this
    persona speaks' stall; a dummy DeepFace call loads its weights once."""
    if _KOKORO_AVAILABLE:
        for voice in dict.fromkeys(PERSONA_VOICES.values()):
            try:
                pipe, lock = get_tts_pipeline(voice)
                if pipe and lock:
                    with lock:
                        pipe.run("Ready.")
            except Exception as e:
                print(f"[Onyx TTS] Warmup failed for {voice}: {e}")
    if _DEEPFACE_AVAILABLE and DeepFace is not None:
        try:
            DeepFace.analyze(np.zeros((48, 48, 3), dtype=np.uint8), actions=["emotion"],
                             enforce_detection=False, silent=True)
        except Exception:
            pass
    print("[Onyx Engine] Warmup complete: all voices + vision models loaded.")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    print("[Onyx Engine] Booting Systems...")
    print(f"[Onyx Engine] LLM fast={MODEL_FAST} deep={MODEL_DEEP} | sandbox={SANDBOX_MODE}")
    if not ONYX_BRAIN_SECRET:
        print("[Onyx WARNING] ONYX_BRAIN_SECRET not set -> brain API is OPEN. Set it in production.")
    if SANDBOX_MODE != "docker":
        print("[Onyx WARNING] SANDBOX_MODE=local -> candidate code runs on this host. Use docker in production.")
    threading.Thread(target=_warmup_models, daemon=True).start()
    yield


app = FastAPI(title="Onyx Brain", version="5.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "X-Onyx-Key"],
)

_PUBLIC_PATHS = {"/health", "/docs", "/openapi.json"}


@app.middleware("http")
async def require_brain_key(request: Request, call_next):
    """Only the Next.js server (which holds ONYX_BRAIN_SECRET) may call the brain."""
    if ONYX_BRAIN_SECRET and request.method != "OPTIONS" and request.url.path not in _PUBLIC_PATHS:
        if request.headers.get("x-onyx-key") != ONYX_BRAIN_SECRET:
            return JSONResponse({"detail": "Unauthorized"}, status_code=401)
    return await call_next(request)


@app.get("/health")
async def health():
    return {"status": "ok", "voices_loaded": len(KOKORO_PIPELINES), "fast_model": MODEL_FAST, "deep_model": MODEL_DEEP}


_SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+")

def split_sentences(text: str, max_chars: int = 220) -> List[str]:
    """Split text into speakable chunks (sentence boundaries, capped length)."""
    clean = re.sub(r"[*#_`]", "", text or "").strip()
    chunks: List[str] = []
    for sent in _SENTENCE_SPLIT.split(clean):
        sent = sent.strip()
        while len(sent) > max_chars:
            cut = sent.rfind(" ", 0, max_chars)
            cut = cut if cut > 40 else max_chars
            chunks.append(sent[:cut].strip())
            sent = sent[cut:].strip()
        if sent:
            chunks.append(sent)
    return chunks


def synthesize_audio_b64(text: str, voice_id: str = "am_michael") -> Optional[str]:
    """Helper to convert short text to fast base64 WAV audio."""
    pipe, lock = get_tts_pipeline(voice_id)
    if not pipe or not lock:
        return None
    clean_text = re.sub(r'[*#_`]', '', text)[:600] 
    with lock:  # one synthesis per voice at a time (pipeline is not thread-safe)
        kokoro_result = pipe.run(clean_text)
    audio_int16 = np.clip(kokoro_result.audio * 32767, -32768, 32767).astype(np.int16)

    wav_io = io.BytesIO()
    with wave.open(wav_io, 'wb') as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(kokoro_result.sample_rate)
        wf.writeframes(audio_int16.tobytes())

    return base64.b64encode(wav_io.getvalue()).decode('utf-8')


# --- MEDIAPIPE INITIALIZATION ---
mp_face_mesh = mp.solutions.face_mesh
mp_pose = mp.solutions.pose
face_mesh = mp_face_mesh.FaceMesh(max_num_faces=1, refine_landmarks=True, min_detection_confidence=0.5, min_tracking_confidence=0.5)
pose_tracker = mp_pose.Pose(min_detection_confidence=0.5, min_tracking_confidence=0.5)
_CV_LOCK = threading.Lock()          # MediaPipe graphs are not thread-safe
_LAST_BIOMETRICS: Dict[str, Any] = {"stress_level": "Unknown"}


# --- PAYLOAD MODELS ---
class OnboardCandidateRequest(BaseModel):
    user_id: str
    user_email: str
    name: str
    target_role: str
    target_company: str
    current_year: str
    diagnostic_score: int

class ProfileIngestionRequest(BaseModel):
    github_url: str
    linkedin_url: str
    raw_resume: str

class ChatRequest(BaseModel):
    text: str
    module_context: str
    chat_history: List[Dict[str, Any]] = []        # [{role: "user"|"ai", text}] (E11)
    candidate_memory: Optional[Dict[str, Any]] = None
    defer_audio: bool = False                       # client fetches voice via /api/tts

class LectureRequest(BaseModel):
    chapter_title: str
    study_material: str
    defer_audio: bool = False

class TTSRequest(BaseModel):
    text: str
    agent: Optional[str] = None
    voice: Optional[str] = None

class CVFrameRequest(BaseModel):
    image_base64: str

class ASTRequest(BaseModel):
    code: str
    language: Optional[str] = "python"

class HiveMindPayload(BaseModel):
    target_role: str
    target_company: str
    is_hr: bool
    live_code: str = ""
    language: Optional[str] = "python"
    whisper_transcript: str = ""
    chat_history: List[Dict[str, Any]] = []
    cv_telemetry: Dict[str, Any] = {}
    panel_satisfaction: Optional[Dict[str, bool]] = None
    candidate_memory: Optional[Dict[str, Any]] = None
    defer_audio: bool = False

class AmazonChatRequest(BaseModel):
    user_prompt: str
    current_code: str
    incident_id: str

class AmazonTestRequest(BaseModel):
    code: str
    incident_id: str

class AdaptationRequest(BaseModel):
    user_id: str
    target_role: str
    failed_topic: str
    consecutive_failures: int
    failure_context: str


# --- 0. SAM ORCHESTRATION ENDPOINTS ---
@app.post("/api/sam/onboard")
async def sam_onboard_candidate(req: OnboardCandidateRequest):
    """SAM'S DOMAIN: Generates the FAANG roadmap and returns the JSON to Next.js"""
    try:
        system_prompt = f"""You are Sam, the autonomous mediator for Onyx.
        Generate a 5-module FAANG placement curriculum for {req.target_role} at {req.target_company}.
        Diagnostic Score: {req.diagnostic_score}/100.
        Output STRICT JSON ONLY matching this schema:
        {{
            "jobProfile": {{
                "title": "string",
                "expectedSalary": "string",
                "description": "string",
                "requiredSkills": ["string"]
            }},
            "modules": [
                {{
                    "phase_id": 1,
                    "module_title": "string",
                    "chapters": [
                        {{
                            "title": "string",
                            "notes": "string",
                            "study_material": "string",
                            "assignment_prompts": ["string"]
                        }}
                    ]
                }}
            ]
        }}
        """
        # High-stakes, one-off -> DEEP tier (Argon) in strict JSON mode.
        llm = get_llm("deep", temperature=0.5, json_mode=True)
        response = await asyncio.to_thread(
            llm.invoke, 
            [SystemMessage(content=system_prompt), HumanMessage(content="Generate curriculum. Return ONLY raw JSON without markdown fences.")]
        )
        
        game_data = parse_json_response(message_text(response))
        if not isinstance(game_data.get("modules"), list) or not game_data["modules"]:
            raise ValueError("Roadmap JSON is missing 'modules'")
        
        print(f"[SAM] Successfully generated roadmap AI data for {req.user_email}")
        return {"success": True, "gameData": game_data}
    except Exception as e:
        print(f"[SAM CRITICAL ERROR]: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/sam/adapt")
async def sam_adapt_roadmap(req: AdaptationRequest):
    """SAM'S MAHORAGA ENGINE: Dynamically injects a new module based on candidate failures."""
    try:
        system_prompt = f"""You are Sam, the autonomous Mahoraga orchestration engine.
        Your ultimate goal is 100% FAANG placement.
        The candidate for {req.target_role} has failed the topic '{req.failed_topic}' {req.consecutive_failures} times.
        Failure Context: {req.failure_context}
        
        You must adapt to their weakness. Generate a SINGLE strict JSON module that we will inject into their roadmap right now to fix this deficiency.
        Schema:
        {{
            "module_title": "string",
            "chapters": [
                {{
                    "title": "string",
                    "study_material": "markdown string",
                    "assignment_prompts": ["string"]
                }}
            ]
        }}
        """
        
        llm = get_llm("deep", temperature=0.5, json_mode=True)
        response = await asyncio.to_thread(
            llm.invoke, 
            [SystemMessage(content=system_prompt), HumanMessage(content="Adapt the curriculum and save this candidate.")]
        )
        
        new_module_data = parse_json_response(message_text(response))
        print(f"[SAM MAHORAGA] Injected remedial module: {new_module_data.get('module_title')} for user {req.user_id}")
        
        return {"success": True, "adapted_module": new_module_data}
    except Exception as e:
        print(f"[SAM ADAPT ERROR]: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/profile/ingest")
async def ingest_candidate_profile(req: ProfileIngestionRequest):
    """Builds the Candidate Dossier using GitHub API and Gemini."""
    try:
        dossier = await parser_service.compile_candidate_dossier(github_url=req.github_url, linkedin_url=req.linkedin_url, raw_resume=req.raw_resume)
        return {"status": "success", "dossier": dossier}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- 1. FCV BIOMETRIC ENDPOINT ---
def _analyze_frame_sync(image_base64: str) -> Dict[str, Any]:
    encoded_data = image_base64.split(',')[1] if ',' in image_base64 else image_base64
    nparr = np.frombuffer(base64.b64decode(encoded_data), np.uint8)
    frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

    telemetry = {"gaze_status": "Unknown", "posture": "Unknown", "confidence_score": 50, "emotion": "Neutral", "lighting": "Nominal", "stress_level": "Nominal"}
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    if np.mean(gray) < 40: telemetry.update({"lighting": "Poor", "stress_level": "Elevated"})
    
    pose_results = pose_tracker.process(rgb_frame)
    if pose_results.pose_landmarks:
        l = pose_results.pose_landmarks.landmark
        if abs(l[11].y - l[12].y) > 0.08: telemetry.update({"posture": "Leaning", "stress_level": "Elevated"})

    try:
        if _DEEPFACE_AVAILABLE and DeepFace is not None:
            df_result = DeepFace.analyze(rgb_frame, actions=['emotion'], enforce_detection=False, silent=True)
            dom = df_result[0]['dominant_emotion']
            telemetry["emotion"] = dom.capitalize()
            if dom in ['fear', 'sad', 'disgust', 'angry']: telemetry.update({"confidence_score": 30, "stress_level": "Critical"})
    except Exception: pass
    return telemetry


@app.post("/api/cv/analyze")
async def analyze_video_frame(req: CVFrameRequest):
    """Vision runs in a worker thread (it used to run ON the event loop, freezing
    every other request - panel turns, Diva, TTS - for ~1s every 4s). If a frame
    is already being analysed we return the last result instead of queueing."""
    global _LAST_BIOMETRICS
    if not _CV_LOCK.acquire(blocking=False):
        return {"status": "success", "biometrics": _LAST_BIOMETRICS, "stale": True}
    try:
        telemetry = await asyncio.to_thread(_analyze_frame_sync, req.image_base64)
        _LAST_BIOMETRICS = telemetry
        return {"status": "success", "biometrics": telemetry}
    except Exception:
        return {"status": "error", "biometrics": {"stress_level": "Unknown"}}
    finally:
        _CV_LOCK.release()


# --- 2. AST CODE EVALUATOR ---
@app.post("/api/ast/analyze")
async def analyze_ast(req: ASTRequest):
    result = analyze_code_complexity(req.code, req.language or "python")
    return {
        "complexity": result["time_complexity"],
        "feedback": feedback_for(result),
        "valid_syntax": result["valid_syntax"],
        "loop_depth": result["loop_depth"],
    }


# --- 2b. VOICE (sentence-level TTS for fast time-to-first-audio) ---
@app.post("/api/tts")
async def tts(req: TTSRequest):
    """Synthesize ONE short chunk (the client splits replies into sentences and
    plays chunk 1 while chunk 2 is being synthesized)."""
    voice = req.voice or PERSONA_VOICES.get(req.agent or "", "am_michael")
    if voice not in set(PERSONA_VOICES.values()):
        voice = "am_michael"
    text = (req.text or "").strip()[:600]
    if not text:
        return {"audio_base64": None, "voice": voice}
    try:
        audio = await asyncio.to_thread(synthesize_audio_b64, text, voice)
        return {"audio_base64": audio, "voice": voice}
    except Exception as e:
        print(f"[Onyx TTS] /api/tts failed: {e}")
        return {"audio_base64": None, "voice": voice}


# --- 3. LEARNING MODULE ENDPOINTS (DIVA'S DOMAIN) ---
@app.post("/api/lecture/start")
async def start_lecture(req: LectureRequest):
    opening_script = f"Welcome to {req.chapter_title}. Let's break this down. {req.study_material}"
    if req.defer_audio:
        return {"lecture_text": opening_script, "audio_base64": None, "agent": "Diva"}
    audio_b64 = await asyncio.to_thread(synthesize_audio_b64, opening_script, PERSONA_VOICES["Diva"])
    return {"lecture_text": opening_script, "audio_base64": audio_b64, "agent": "Diva"}

_DIVA_TOOL_FALLBACKS = {
    "mark_theory_cleared": "Great job. You've cleared the theory. Let's move to the assignment.",
}

@app.post("/api/chat/message")
async def chat_message(req: ChatRequest):
    try:
        candidate_memory = req.candidate_memory or {
            "user_name": "Candidate",
            "target_company": "FAANG",
            "target_role": "Software Engineer"
        }
        
        state = {
            "messages": _build_history(req.chat_history[-20:], req.text),
            "module_context": req.module_context,
            "candidate_memory": candidate_memory
        }
        
        llm = get_llm("fast", temperature=0.7)
        result = await asyncio.to_thread(diva_tutor_node, state, llm)
        last = result["messages"][-1]
        ai_text = message_text(last)
        tool_calls = getattr(last, "tool_calls", None) or []
        events = [c.get("name", "") for c in tool_calls]

        if not ai_text and tool_calls:
            call = tool_calls[0]
            if call.get("name") == "grade_node_assignment":
                args = call.get("args", {}) or {}
                ai_text = str(args.get("feedback") or ("Nice work, that passes." if args.get("passed") else "Not quite yet. Let's fix it."))
            else:
                ai_text = _DIVA_TOOL_FALLBACKS.get(call.get("name", ""), "Let's keep going.")
        if not ai_text:
            ai_text = "Could you say that another way?"

        audio_b64 = None if req.defer_audio else await asyncio.to_thread(synthesize_audio_b64, ai_text, PERSONA_VOICES["Diva"])
        return {"ai_text": ai_text, "agent": "Diva", "audio_base64": audio_b64, "events": events}
    except Exception as e:
        import traceback
        traceback.print_exc() # 🔥 This forces Python to print the exact line that crashed
        raise HTTPException(status_code=500, detail=str(e))


# --- 4. BOSS FIGHT ORCHESTRATION (THE PANEL'S DOMAIN) ---
# Goal per panel member (decided deterministically, never by LLM text alone):
#   Tech Lead : code parses AND AST complexity <= TECH_LEAD_REQUIRED_COMPLEXITY
#   Architect : agent asserts spof_addressed=True via its tool
#   HR        : STAR answer accepted by agent AND stress not Elevated/Critical
TECH_LEAD_REQUIRED_COMPLEXITY = "O(n log n)"
SCORECARD_EXPECTED_COMPLEXITY = "O(n log n)"

SATISFACTION_TOOLS = {
    "mark_tech_lead_satisfied": "Tech Lead",
    "mark_architect_satisfied": "Architect",
    "mark_hr_satisfied": "HR",
}
HANDOFF_LINE = "I'm satisfied. I'll hand you over to the next interviewer."


def _normalize_satisfaction(raw: Optional[Dict[str, Any]]) -> Dict[str, bool]:
    raw = raw or {}
    # Accept the legacy "System Architect" key from older clients.
    if "System Architect" in raw and "Architect" not in raw:
        raw = {**raw, "Architect": raw["System Architect"]}
    return {k: bool(raw.get(k, False)) for k in PANEL_MEMBERS}


def _is_stressed(stress_level: str) -> bool:
    s = (stress_level or "").lower()
    return "critical" in s or "elevated" in s


def _message_text(msg) -> str:
    content = getattr(msg, "content", "")
    if isinstance(content, list):  # content blocks
        content = " ".join(b.get("text", "") if isinstance(b, dict) else str(b) for b in content)
    return (content or "").strip()


def _build_history(chat_history: List[Dict[str, Any]], latest: str) -> list:
    """Text-only history -> LangChain messages. Drops empties, merges consecutive
    same-role turns, and guarantees the conversation starts with a user turn
    (Anthropic rejects assistant-first / empty / same-role-adjacent messages)."""
    turns = []
    for msg in chat_history or []:
        text = str(msg.get("text") or "").strip()
        if not text:
            continue
        role = "user" if msg.get("role") == "user" else "ai"
        turns.append((role, text))
    if latest and latest.strip():
        turns.append(("user", latest.strip()))

    merged = []
    for role, text in turns:
        if merged and merged[-1][0] == role:
            merged[-1] = (role, merged[-1][1] + "\n" + text)
        else:
            merged.append((role, text))

    if not merged or merged[0][0] != "user":
        merged.insert(0, ("user", "[Candidate joined the interview panel.]"))
    if merged[-1][0] != "user":
        merged.append(("user", "[Candidate is waiting for the next question.]"))

    return [HumanMessage(content=t) if r == "user" else AIMessage(content=t) for r, t in merged]


def _scorecard(satisfaction: Dict[str, bool], complexity: str, stress_level: str) -> Dict[str, Any]:
    # "Tests" for the panel = goals verifiably met. No fake 1/1.
    return DeterministicScorer.calculate_final_score(
        tests_passed=sum(satisfaction.values()),
        total_tests=len(satisfaction),
        time_complexity=complexity,
        expected_complexity=SCORECARD_EXPECTED_COMPLEXITY,
        stress_level=stress_level,
    )


async def _safe_tts(text: str, agent: str) -> Optional[str]:
    if not text:
        return None
    try:
        return await asyncio.to_thread(synthesize_audio_b64, text, PERSONA_VOICES.get(agent, "bm_george"))
    except Exception as tts_err:
        print(f"[Onyx TTS] Synthesis failed for {agent}: {tts_err}")
        return None


@app.post("/api/swarm")
async def process_interview(payload: HiveMindPayload):
    try:
        candidate_memory = payload.candidate_memory or {
            "user_name": "Candidate",
            "target_company": payload.target_company,
            "target_role": payload.target_role,
            "elo_rating": 1200,
            "weak_spots": ["Unknown"]
        }

        telemetry = payload.cv_telemetry or {}
        stress_level = str(telemetry.get("stress_level") or "Unknown")
        hesitation = telemetry.get("hesitation_count", 0)
        live_code = payload.live_code or ""

        ast_result = analyze_code_complexity(live_code, payload.language or "python")
        complexity = ast_result["time_complexity"]
        satisfaction = _normalize_satisfaction(payload.panel_satisfaction)
        events: List[str] = []

        # Goal re-verification: a Tech Lead approval is revoked if the code regressed.
        if satisfaction["Tech Lead"] and live_code.strip() and is_quadratic_or_worse(complexity):
            satisfaction["Tech Lead"] = False
            events.append("tech_lead_revoked_regression")

        base_response = {
            "panel_satisfaction": satisfaction,
            "ast_analysis": {"complexity": complexity, "valid_syntax": ast_result["valid_syntax"],
                             "feedback": feedback_for(ast_result)},
            "events": events,
        }

        # Already done? Don't burn an LLM call.
        if all(satisfaction.values()):
            return {**base_response, "agent_routed": "System", "is_complete": True, "passed": True,
                    "response": "All panel goals are met. Interview complete. Generating scorecard.",
                    "audio_base64": None, "scorecard": _scorecard(satisfaction, complexity, stress_level)}

        state = {
            "messages": _build_history(payload.chat_history, payload.whisper_transcript),
            "target_role": payload.target_role,
            "target_company": payload.target_company,
            "live_code": live_code,
            "cv_telemetry": {"hesitation_count": hesitation, "stress_level": stress_level},
            "ast_analysis": {"time_complexity": complexity},
            "candidate_memory": candidate_memory,
            "panel_satisfaction": dict(satisfaction),
            "current_agent": "HR" if payload.is_hr else ""
        }
        input_len = len(state["messages"])

        result = await asyncio.to_thread(swarm_app.invoke, state)
        messages_out = result.get("messages", [])
        agent_name = result.get("current_agent") or ""

        # Router ended without any agent speaking -> nothing left to do.
        if len(messages_out) <= input_len or agent_name not in PANEL_MEMBERS:
            return {**base_response, "agent_routed": "System", "is_complete": True,
                    "passed": all(satisfaction.values()),
                    "response": "Interview complete. Generating scorecard.", "audio_base64": None,
                    "scorecard": _scorecard(satisfaction, complexity, stress_level)}

        last = messages_out[-1]
        ai_text = _message_text(last)
        tool_calls = getattr(last, "tool_calls", None) or []
        hard_failed = False
        override_text = None

        # Honor tool calls whether or not the LLM also produced text.
        for call in tool_calls:
            name = call.get("name", "")
            args = call.get("args", {}) or {}

            if name == "hard_fail_candidate" and agent_name == "Tech Lead":
                hard_failed = True
                events.append("hard_fail")
                if not ai_text:
                    ai_text = f"We're done here. {args.get('reason', 'The technical bar was not met.')}"
                continue

            goal_key = SATISFACTION_TOOLS.get(name)
            if goal_key is None or goal_key != agent_name:
                continue  # unknown tool, or an agent trying to satisfy someone else's goal

            if goal_key == "Tech Lead":
                verification = NeuroSymbolicVerifier.verify_agent_claim(
                    agent_name=agent_name,
                    agent_claim_passed=True,
                    actual_execution_passed=None,  # no tests in the panel; don't fake a pass
                    agent_claim_complexity=str(args.get("final_complexity", "")),
                    actual_ast_complexity=complexity,
                    required_complexity=TECH_LEAD_REQUIRED_COMPLEXITY,
                )
                ok = verification["verified"] and ast_result["valid_syntax"]
                reason = verification["conflicts"][0] if verification["conflicts"] else (
                    ast_result.get("error_message") or "Code could not be verified.")
            elif goal_key == "Architect":
                ok = bool(args.get("spof_addressed", False))
                reason = "Single points of failure have not been addressed yet."
            else:  # HR
                ok = not _is_stressed(stress_level)
                reason = f"Biometric stress is still {stress_level}."

            if ok:
                satisfaction[goal_key] = True
                events.append(f"{goal_key}_satisfied")
            else:
                satisfaction[goal_key] = False
                events.append(f"{goal_key}_claim_rejected")
                override_text = f"System override. {agent_name}'s approval was rejected. {reason}"

        if override_text:
            ai_text = override_text  # never let the rejected 'I'm satisfied' speech through
        elif satisfaction.get(agent_name) and f"{agent_name}_satisfied" in events:
            ai_text = f"{ai_text} {HANDOFF_LINE}".strip() if ai_text else HANDOFF_LINE
        if not ai_text:
            ai_text = "Go on. Walk me through your reasoning."

        audio_b64 = None if payload.defer_audio else await _safe_tts(ai_text, agent_name)
        is_complete = hard_failed or all(satisfaction.values())

        response = {
            **base_response,
            "agent_routed": agent_name,
            "response": ai_text,
            "audio_base64": audio_b64,
            "panel_satisfaction": satisfaction,
            "is_complete": is_complete,
        }
        if is_complete:
            response["passed"] = (not hard_failed) and all(satisfaction.values())
            response["scorecard"] = _scorecard(satisfaction, complexity, stress_level)
            if hard_failed:
                response["scorecard"]["passed_threshold"] = False
        return response
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# --- 5. AMAZON SDE CRUCIBLE ENDPOINTS ---
@lru_cache(maxsize=1)
def load_amazon_incidents():
    file_path = os.path.join(os.path.dirname(__file__), "data", "amazon_incidents.json")
    with open(file_path, "r", encoding="utf-8") as f:
        return json.load(f)

@app.get("/api/amazon/incident")
async def get_amazon_incident():
    incidents = load_amazon_incidents()
    return {"incident_id": "prime_routing", **incidents["prime_routing"]}

@app.post("/api/amazon/assistant")
async def amazon_ai_assistant(req: AmazonChatRequest):
    incidents = load_amazon_incidents()
    incident_title = incidents.get(req.incident_id, {}).get("title", "Unknown Incident")
    
    llm = get_llm("fast", temperature=0.5)
    
    response_text = await asyncio.to_thread(amazon_q_node, req.user_prompt, req.current_code, incident_title, llm)
    return {"reply": response_text}

@app.post("/api/amazon/run-tests")
async def run_amazon_tests(req: AmazonTestRequest):
    incidents = load_amazon_incidents()
    incident = incidents.get(req.incident_id)
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
        
    results = []
    all_passed = True
    
    for test in incident["tests"]:
        res = await asyncio.to_thread(
            ExecutionEngine.run_tests,
            base_code=req.code,
            language="python",
            function_call=test["function_call"],
            expected_output=test["expected"]
        )
        
        results.append({
            "name": test["name"],
            "passed": res["passed"],
            "actual_output": res["actual_output"],
            "expected_output": res["expected_output"],
            "execution_time_ms": res["execution_metrics"]["execution_time_ms"],
            "stderr": res["execution_metrics"]["stderr"]
        })
        
        if not res["passed"]:
            all_passed = False
            
    return {"success": True, "all_passed": all_passed, "results": results}

if __name__ == "__main__":
    uvicorn.run("main:app", host=HOST, port=PORT, reload=DEV_RELOAD)