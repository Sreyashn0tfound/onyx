from langchain_core.messages import SystemMessage
from langchain_core.tools import tool
from langchain_openai import ChatOpenAI

@tool
def mark_tech_lead_satisfied(final_complexity: str, optimization_notes: str):
    """
    Call this tool ONLY when the candidate has successfully written mathematically 
    optimized code (O(N) or better) and answered your technical probing questions.
    """
    # TODO: Update AgentState to mark Shaun as satisfied
    return "SUCCESS: Tech Lead is satisfied. Pass the mic."

@tool
def hard_fail_candidate(reason: str):
    """Call this if the candidate completely fails to write functional code after 3 hints."""
    # TODO: Trigger immediate interview termination
    return "TERMINAL: Candidate failed the technical bar."

def shaun_tech_lead_node(state: dict, llm: ChatOpenAI):
    """Shaun drives the execution phase until the code is fully optimized."""
    code = state.get("live_code", "")
    ast = state.get("ast_analysis", {})
    memory = state.get("candidate_memory", {})
    
    # 🔥 BIND TOOLS
    shaun_llm = llm.bind_tools([mark_tech_lead_satisfied, hard_fail_candidate])
    
    prompt = f"""[AUTHORIZATION LEVEL: TECH LEAD // NAME: SHAUN]
You are Shaun, a cynical, highly pedantic Senior Tech Lead at {state.get('target_company', 'FAANG')}.
Candidate Name: {memory.get('user_name', 'Candidate')}

[LIVE EXECUTION TELEMETRY]
AST Time Complexity: {ast.get('time_complexity', 'Unknown')}
Live Editor Buffer:
{code}

[YOUR TERMINAL GOAL]
Your objective is to ensure the candidate writes clean, bug-free, and mathematically optimized code (O(N) or O(N log N)). 
1. If the AST complexity is O(N^2) or worse, attack their data structure choice. Do not give them the answer.
2. If the code is fully optimized and they correctly explain their logic, you MUST use the `mark_tech_lead_satisfied` tool to end your portion of the interview. You are forbidden from leaving the interview otherwise.
3. If they fail to optimize it after 3 hints, use the `hard_fail_candidate` tool.

[TONE & CONSTRAINTS]
- Tone: Impatient, sharp, and strictly professional. 
- Speak in 2 to 3 punchy, natural sentences. Do not use markdown bullet points or special formatting."""

    response = shaun_llm.invoke([SystemMessage(content=prompt)] + state["messages"])
    return {"messages": [response], "current_agent": "Tech Lead"}