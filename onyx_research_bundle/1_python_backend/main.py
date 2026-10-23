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
import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, Any, Optional, List
import uvicorn
from dotenv import load_dotenv

import mediapipe as mp
from pykokoro import KokoroPipeline, PipelineConfig

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
from langchain_openai import ChatOpenAI
from graph import swarm_app, PANEL_MEMBERS
from personas.diva_tutor import diva_tutor_node
from parser_service import parser_service
from config import OPENROUTER_API_KEY, OPENROUTER_BASE_URL
from execution_engine import ExecutionEngine
from scoring_engine import DeterministicScorer
from verification_engine import NeuroSymbolicVerifier
from personas.amazon_q import amazon_q_node
from ast_engine import analyze_code_complexity, feedback_for
from complexity import is_quadratic_or_worse

app = FastAPI(title="Onyx Brain", version="4.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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

KOKORO_PIPELINES = {}

def get_tts_pipeline(voice_id: str):
    if voice_id not in KOKORO_PIPELINES:
        print(f"[Onyx TTS] Initializing voice: {voice_id}")
        KOKORO_PIPELINES[voice_id] = KokoroPipeline(PipelineConfig(voice=voice_id))
    return KOKORO_PIPELINES[voice_id]

# 🔥 LIFESPAN HOOKS: JUST TTS WARMUP (NO DATABASE)
@app.on_event("startup")
async def startup_event():
    print("[Onyx Engine] Booting Systems...")
    print("[Onyx Engine] Pre-warming PyKokoro audio engine...")
    get_tts_pipeline("af_bella")
    get_tts_pipeline("am_adam")

def synthesize_audio_b64(text: str, voice_id: str = "am_michael") -> str:
    """Helper to convert short text to fast base64 WAV audio."""
    clean_text = re.sub(r'[*#_`]', '', text)[:600] 
    pipe = get_tts_pipeline(voice_id)
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

class LectureRequest(BaseModel):
    chapter_title: str
    study_material: str

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
        
        llm = ChatOpenAI(
            model="anthropic/claude-3.5-sonnet",
            temperature=0.5,
            openai_api_key=OPENROUTER_API_KEY,
            openai_api_base=OPENROUTER_BASE_URL
        )
        response = await asyncio.to_thread(
            llm.invoke, 
            [SystemMessage(content=system_prompt), HumanMessage(content="Generate curriculum. Return ONLY raw JSON without markdown fences.")]
        )
        
        text = response.content
        import re
        try:
            game_data = json.loads(text)
        except json.JSONDecodeError:
            match = re.search(r'```(?:json)?\s*(\{.*\})\s*```', text, re.DOTALL)
            if match:
                game_data = json.loads(match.group(1))
            else:
                start = text.find('{')
                end = text.rfind('}')
                if start != -1 and end != -1:
                    game_data = json.loads(text[start:end+1])
                else:
                    raise ValueError("Failed to extract JSON from LLM response")
        
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
        
        llm = ChatOpenAI(
            model="anthropic/claude-3-opus",
            temperature=0.5,
            openai_api_key=OPENROUTER_API_KEY,
            openai_api_base=OPENROUTER_BASE_URL
        )
        response = await asyncio.to_thread(
            llm.invoke, 
            [SystemMessage(content=system_prompt), HumanMessage(content="Adapt the curriculum and save this candidate.")]
        )
        
        new_module_data = json.loads(response.content)
        print(f"[SAM MAHORAGA] Injected remedial module: {new_module_data.get('module_title')} for user {req.user_id}")
        
        return {"success": True, "adapted_module": new_module_data}
    except Exception as e:
        print(f"[SAM ADAPT ERROR]: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/profile/ingest")
async def ingest_candidate_profile(req: ProfileIngestionRequest):
    """Builds the Candidate Dossier using GitHub API and Groq."""
    try:
        dossier = await parser_service.compile_candidate_dossier(github_url=req.github_url, linkedin_url=req.linkedin_url, raw_resume=req.raw_resume)
        return {"status": "success", "dossier": dossier}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- 1. FCV BIOMETRIC ENDPOINT ---
@app.post("/api/cv/analyze")
async def analyze_video_frame(req: CVFrameRequest):
    try:
        encoded_data = req.image_base64.split(',')[1]
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

        return {"status": "success", "biometrics": telemetry}
    except Exception as e:
        return {"status": "error", "biometrics": {"stress_level": "Unknown"}}


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


# --- 3. LEARNING MODULE ENDPOINTS (DIVA'S DOMAIN) ---
@app.post("/api/lecture/start")
async def start_lecture(req: LectureRequest):
    opening_script = f"Welcome to {req.chapter_title}. Let's break this down. {req.study_material}"
    audio_b64 = await asyncio.to_thread(synthesize_audio_b64, opening_script, PERSONA_VOICES["Diva"])
    return {"lecture_text": opening_script, "audio_base64": audio_b64}

@app.post("/api/chat/message")
async def chat_message(req: ChatRequest):
    try:
        candidate_memory = {
            "user_name": "Candidate",
            "target_company": "FAANG",
            "target_role": "Software Engineer"
        }
        
        state = {
            "messages": [HumanMessage(content=req.text)],
            "module_context": req.module_context,
            "candidate_memory": candidate_memory
        }
        
        llm = ChatOpenAI(
            model="anthropic/claude-3.5-sonnet",
            temperature=0.7,
            openai_api_key=OPENROUTER_API_KEY,
            openai_api_base=OPENROUTER_BASE_URL
        )
        result = await asyncio.to_thread(diva_tutor_node, state, llm)
        ai_text = result["messages"][-1].content
        
        if not ai_text and result["messages"][-1].tool_calls:
            ai_text = "Great job. You've cleared the theory. Let's move to the assignment."

        audio_b64 = await asyncio.to_thread(synthesize_audio_b64, ai_text, PERSONA_VOICES["Diva"])
        return {"ai_text": ai_text, "agent": "Diva", "audio_base64": audio_b64}
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

        audio_b64 = await _safe_tts(ai_text, agent_name)
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
import os
def load_amazon_incidents():
    file_path = os.path.join(os.path.dirname(__file__), "data", "amazon_incidents.json")
    with open(file_path, "r") as f:
        return json.load(f)

@app.get("/api/amazon/incident")
async def get_amazon_incident():
    incidents = load_amazon_incidents()
    return incidents["prime_routing"]

@app.post("/api/amazon/assistant")
async def amazon_ai_assistant(req: AmazonChatRequest):
    incidents = load_amazon_incidents()
    incident_title = incidents.get(req.incident_id, {}).get("title", "Unknown Incident")
    
    llm = ChatOpenAI(
        model="anthropic/claude-3.5-sonnet", # Upgraded to Sonnet for better teaching
        temperature=0.5,
        openai_api_key=OPENROUTER_API_KEY,
        openai_api_base=OPENROUTER_BASE_URL
    )
    
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
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)