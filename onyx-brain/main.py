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
from graph import swarm_app, AgentState
from personas.diva_tutor import diva_tutor_node
from parser_service import parser_service
from config import OPENROUTER_API_KEY, OPENROUTER_BASE_URL
from execution_engine import ExecutionEngine
from scoring_engine import DeterministicScorer
from verification_engine import NeuroSymbolicVerifier
from personas.amazon_q import amazon_q_node

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
    "System Architect": "bm_george", # Jacob
    "HR": "af_sarah",              # Asha
    "Diva": "af_bella",            # Diva (Tutor)
    "Onyx Core": "am_michael",     # Fallback
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

class HiveMindPayload(BaseModel):
    target_role: str
    target_company: str
    is_hr: bool
    live_code: str
    whisper_transcript: str
    chat_history: List[Dict[str, Any]]  
    cv_telemetry: Dict[str, Any]
    panel_satisfaction: Optional[Dict[str, bool]] = {"Tech Lead": False, "Architect": False, "HR": False}
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
        Output STRICT JSON matching our database schema with 5 modules, containing chapters, study_material, and assignment_prompts.
        """
        
        llm = ChatOpenAI(
            model="anthropic/claude-3-opus",
            temperature=0.5,
            openai_api_key=OPENROUTER_API_KEY,
            openai_api_base=OPENROUTER_BASE_URL
        )
        response = await asyncio.to_thread(
            llm.invoke, 
            [SystemMessage(content=system_prompt), HumanMessage(content="Generate curriculum.")]
        )
        game_data = json.loads(response.content)
        
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
    loops = req.code.count("for ") + req.code.count("while ")
    if loops > 1: return {"complexity": "O(N²)", "feedback": "Nested iteration detected. Risk under scale."}
    elif loops == 1: return {"complexity": "O(N)", "feedback": "Linear pass detected."}
    return {"complexity": "O(1)", "feedback": "Constant time complexity."}


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
        
        stress_level = payload.cv_telemetry.get("stress_level", "Nominal")
        hesitation = payload.cv_telemetry.get("hesitation_count", 0)
        complexity = "O(n^2)" if payload.live_code.count("for") > 1 else "O(1)"

        formatted_messages = []
        for msg in payload.chat_history:
            if msg.get("role") == "user": formatted_messages.append(HumanMessage(content=msg.get("text", "")))
            else: formatted_messages.append(AIMessage(content=msg.get("text", "")))
        formatted_messages.append(HumanMessage(content=payload.whisper_transcript))

        state = {
            "messages": formatted_messages,
            "target_role": payload.target_role,
            "target_company": payload.target_company,
            "live_code": payload.live_code,
            "cv_telemetry": {"hesitation_count": hesitation, "stress_level": stress_level},
            "ast_analysis": {"time_complexity": complexity},
            "candidate_memory": candidate_memory,
            "panel_satisfaction": payload.panel_satisfaction,
            "current_agent": "HR" if payload.is_hr else ""
        }
        
        result = await asyncio.to_thread(swarm_app.invoke, state)
        
        if result.get("current_agent") == "__end__":
            # Trigger Deterministic Scoring Engine
            final_evaluation = DeterministicScorer.calculate_final_score(
                tests_passed=1, 
                total_tests=1, 
                time_complexity=complexity, 
                expected_complexity="O(N log N)", 
                stress_level=stress_level
            )
            return {
                "agent_routed": "System",
                "response": "Interview complete. Generating scorecard...",
                "panel_satisfaction": result.get("panel_satisfaction"),
                "is_complete": True,
                "scorecard": final_evaluation
            }

        agent_name = result.get("current_agent", "Architect")
        ai_text = result["messages"][-1].content
        
        if not ai_text and result["messages"][-1].tool_calls:
            tool_call = result["messages"][-1].tool_calls[0]
            agent_claim_complexity = tool_call.get("args", {}).get("final_complexity", "")
            
            verification = NeuroSymbolicVerifier.verify_agent_claim(
                agent_name=agent_name,
                agent_claim_passed=True, 
                actual_execution_passed=True,
                agent_claim_complexity=agent_claim_complexity,
                actual_ast_complexity=complexity
            )
            
            if not verification["verified"]:
                # Intercept the hallucination
                ai_text = f"[SYSTEM OVERRIDE] {agent_name} hallucinated. {verification['conflicts'][0]}"
                state["panel_satisfaction"][agent_name] = False
            else:
                ai_text = "I'm satisfied with this logic. I'll hand it over to the next interviewer."
                state["panel_satisfaction"][agent_name] = True
        voice_id = PERSONA_VOICES.get(agent_name, "bm_george")
        audio_b64 = await asyncio.to_thread(synthesize_audio_b64, ai_text, voice_id)

        return {
            "agent_routed": agent_name,
            "response": ai_text,
            "audio_base64": audio_b64,
            "panel_satisfaction": state.get("panel_satisfaction", payload.panel_satisfaction)
        }
    except Exception as e:
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