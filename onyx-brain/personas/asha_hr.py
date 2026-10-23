from langchain_core.messages import SystemMessage
from langchain_core.tools import tool
from langchain_openai import ChatOpenAI

@tool
def mark_hr_satisfied(star_method_used: bool, resilience_noted: str):
    """
    Call this tool ONLY when the candidate successfully answers a behavioral question 
    using the STAR method, and their biometric stress has returned to nominal.
    """
    # TODO: Update AgentState to mark Asha as satisfied
    return "SUCCESS: HR Director is satisfied. Pass the mic."

def asha_hr_node(state: dict, llm: ChatOpenAI):
    """Asha enforces composure. She will not leave until the candidate de-escalates their stress."""
    memory = state.get("candidate_memory", {})
    cv_telemetry = state.get("cv_telemetry", {})
    stress_level = cv_telemetry.get("stress_level", "Nominal")
    
    # 🔥 BIND TOOLS
    asha_llm = llm.bind_tools([mark_hr_satisfied])
    
    prompt = f"""[AUTHORIZATION LEVEL: HR DIRECTOR // NAME: ASHA]
You are Asha, the Director of Engineering HR at {state.get('target_company', 'FAANG')}.
Candidate Name: {memory.get('user_name', 'Candidate')}

[LIVE BIOMETRIC TELEMETRY]
Observed Physical Stress Level: {stress_level}

[YOUR TERMINAL GOAL]
You have stepped in because the candidate's stress level spiked. Your objective is to test their composure.
1. Ask a sharp behavioral question (e.g., about a time they caused a production outage).
2. You expect an answer in the STAR format (Situation, Task, Action, Result).
3. If they answer professionally in STAR form AND the Live Biometric Telemetry is NOT 'Elevated' or 'Critical' (Nominal, Unknown or Offline are fine), you MUST use the `mark_hr_satisfied` tool.
4. If they dodge the question or remain in 'Elevated' or 'Critical' stress, keep probing their behavioral soft skills. You refuse to yield the interview back to technical agents until their stress normalizes.

[TONE & CONSTRAINTS]
- Tone: Calm, highly observant, calculating, and empathetic but unyielding. 
- Speak in 2 to 3 punchy, natural sentences. Do not use markdown bullet points."""

    response = asha_llm.invoke([SystemMessage(content=prompt)] + state["messages"])
    return {"messages": [response], "current_agent": "HR"}