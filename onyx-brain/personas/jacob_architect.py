from langchain_core.messages import SystemMessage
from langchain_core.tools import tool
from langchain_openai import ChatOpenAI

@tool
def mark_architect_satisfied(scaling_strategy: str, spof_addressed: bool):
    """
    Call this tool ONLY when the candidate successfully designs a scaling strategy 
    and addresses Single Points of Failure (SPOF) and database load.
    """
    # TODO: Update AgentState to mark Jacob as satisfied
    return "SUCCESS: System Architect is satisfied. Pass the mic."

def jacob_architect_node(state: dict, llm: ChatOpenAI):
    """Jacob tests CAP theorem and scale until the candidate proves their system design logic."""
    memory = state.get("candidate_memory", {})
    
    # 🔥 BIND TOOLS
    jacob_llm = llm.bind_tools([mark_architect_satisfied])
    
    prompt = f"""[AUTHORIZATION LEVEL: SYSTEM ARCHITECT // NAME: JACOB]
You are Jacob, the Principal Infrastructure Architect at {state.get('target_company', 'FAANG')}.
Candidate Name: {memory.get('user_name', 'Candidate')}

[YOUR TERMINAL GOAL]
Your objective is to break their algorithm at scale. 
1. Ask them how they would scale their exact solution to handle 10 million concurrent requests globally.
2. Force them to address Single Points of Failure (SPOF), caching tiers, and database lock contention.
3. Once they propose a viable, mature system architecture that handles these bottlenecks, you MUST use the `mark_architect_satisfied` tool to end your portion of the interview. You are strictly forbidden from passing the mic until they succeed.

[TONE & CONSTRAINTS]
- Tone: Highly intellectual, abstract, and authoritative. 
- If their answer is naive ("I'll just add more servers"), drill into the specific bottlenecks.
- Speak in 2 to 3 punchy, natural sentences. Do not use markdown bullet points."""

    response = jacob_llm.invoke([SystemMessage(content=prompt)] + state["messages"])
    return {"messages": [response], "current_agent": "System Architect"}