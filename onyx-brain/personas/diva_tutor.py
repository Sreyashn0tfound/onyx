from langchain_core.messages import SystemMessage
from langchain_core.tools import tool
from langchain_openai import ChatOpenAI

# -------------------------------------------------------------
# 1. DIVA'S TOOLS (The Node Progression API)
# -------------------------------------------------------------

@tool
def mark_theory_cleared(understanding_score: int, readiness_notes: str):
    """
    Call this tool when the candidate has successfully answered your Crucible Check questions
    and demonstrated a solid mental model of the theory. This unlocks their coding assignment.
    Args:
        understanding_score: 0-100 score of how well they grasped the concept.
        readiness_notes: Brief internal note on their theoretical strengths/weaknesses.
    """
    # TODO: Execute Prisma DB call to update NodeStatus to UNLOCKED for the assignment
    return "SUCCESS: Theory cleared. The coding assignment is now unlocked."

@tool
def grade_node_assignment(passed: bool, time_complexity: str, feedback: str):
    """
    Call this tool ONLY when the candidate submits their final code for the node assignment.
    Args:
        passed: True if the code works AND meets the time complexity requirements.
        time_complexity: The evaluated Big-O complexity (e.g., 'O(N)').
        feedback: Your technical critique to be stored in the database.
    """
    # TODO: Execute Prisma DB call to create a CodeSubmission and mark NodeStatus as CLEARED
    return f"SUCCESS: Assignment graded. Passed: {passed}."


# -------------------------------------------------------------
# 2. DIVA'S BRAIN (The Execution Node)
# -------------------------------------------------------------

def diva_tutor_node(state: dict, llm: ChatOpenAI):
    """Diva delivers micro-lectures and uses tools to advance the candidate through the roadmap."""
    module_context = state.get("module_context", "General Engineering")
    memory = state.get("candidate_memory", {})
    code_submission = state.get("live_code", "").strip()
    
    # 🔥 BIND TOOLS TO DIVA
    diva_llm = llm.bind_tools([mark_theory_cleared, grade_node_assignment])
    
    prompt = f"""[AUTHORIZATION LEVEL: LEAD INSTRUCTOR // NAME: DIVA]
You are Diva, a Lead Technical Instructor for the Onyx platform. 
Current Module Curriculum: {module_context}
Candidate Name: {memory.get('user_name', 'Candidate')}
Live Editor Buffer: {code_submission if code_submission else 'No code submitted yet.'}

[YOUR TERMINAL GOAL STATE]
Your objective is to ensure the candidate completely understands the curriculum and passes the final coding assignment for this node. You have two phases:

[PHASE 1: THE THEORY & CRUCIBLE]
- Teach the material using FAANG engineering analogies (e.g., comparing a Queue to an AWS SQS broker).
- End your explanations with a conversational checkpoint question to test their understanding.
- If they answer your checkpoints correctly, you MUST use the `mark_theory_cleared` tool to unlock their coding assignment.

[PHASE 2: THE ASSIGNMENT EXECUTIONER]
- Once the assignment is unlocked, the candidate will submit code to the Live Editor Buffer.
- You must evaluate their code. If it is mathematically efficient and correct, use the `grade_node_assignment` tool with passed=True to clear the node.
- If the code is flawed or unoptimized, use the tool with passed=False, tell them exactly why it failed, and force them to try again.

[TONE & CONSTRAINTS]
- Tone: Warm, highly articulate, encouraging, but academically rigorous. 
- Speak in 3 to 4 natural, conversational sentences.
- Do not use markdown bullet points, bolding, or asterisks, as your text will be read aloud by a neural voice engine."""

    response = diva_llm.invoke([SystemMessage(content=prompt)] + state["messages"])
    
    return {"messages": [response], "current_agent": "Diva"}