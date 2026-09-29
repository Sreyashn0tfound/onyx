import os
import operator
from dotenv import load_dotenv
from typing import Annotated, Sequence, TypedDict, Dict, Any, Optional

from langchain_core.messages import BaseMessage, SystemMessage
from langgraph.graph import StateGraph, END
from langchain_groq import ChatGroq

# Load environment variables
load_dotenv()

# Initialize Groq LLM (Llama 3.3 70B is perfect for high-speed routing and reasoning)
llm = ChatGroq(model="openai/gpt-oss-120b", temperature=2)

# 1. THE HIVE MIND STATE
class AgentState(TypedDict):
    messages: Annotated[Sequence[BaseMessage], operator.add]
    target_role: str
    target_company: str
    diagnostic_score: int
    github_url: Optional[str]
    linkedin_url: Optional[str]
    live_code: str
    cv_telemetry: Dict[str, Any]
    ast_analysis: Dict[str, Any]
    current_agent: str
    module_context: Optional[str] # Tells us if they are learning or in an arena

# 2. THE DYNAMIC ROUTER
def router_node(state: AgentState):
    """Analyzes telemetry to decide which persona takes over."""
    
    live_code = state.get("live_code", "").strip()
    complexity = state.get("ast_analysis", {}).get("time_complexity", "O(1)")
    hesitation = state.get("cv_telemetry", {}).get("hesitation_count", 0)
    
    # CASE 1: Standard Learning / No Code Submitted
    if not live_code:
        return {"current_agent": "Onyx Core"}
    
    # CASE 2: Mathematical Inefficiency Detected
    if complexity in ["O(n^2)", "O(n^3)", "O(2^n)"]:
        return {"current_agent": "Tech Lead"}
    
    # CASE 3: Biometric Panic Detected
    if hesitation > 3:
        return {"current_agent": "HR"}
    
    # CASE 4: Efficient Code & Confident Delivery
    return {"current_agent": "Architect"}


# 3. SPECIALIZED NEURAL NODES

def onyx_core_node(state: AgentState):
    """The default AI Tutor for standard curriculum phases."""
    context = state.get('module_context', 'General Software Engineering')
    
    prompt = f"""You are Onyx Core, the primary mentor for a candidate targeting {state['target_role']} at {state['target_company']}.
    Current Phase Context: {context}
    Candidate Diagnostic Score: {state['diagnostic_score']}/100.
    
    Keep your response incredibly concise (2-3 sentences). Explain concepts using clear analogies. Do not break character."""
    
    response = llm.invoke([SystemMessage(content=prompt)] + state["messages"])
    return {"messages": [response], "current_agent": "Onyx Core"}

def tech_lead_node(state: AgentState):
    """Brutal code reviewer triggered by poor AST complexity."""
    prompt = f"""You are the brutal Tech Lead interviewing this candidate for {state['target_role']} at {state['target_company']}.
    Candidate's Live Code:
    {state['live_code']}
    
    AST Analysis Complexity: {state['ast_analysis'].get('time_complexity')}
    
    Do not ask generic questions. Point out a specific bottleneck causing this inefficiency. 
    Demand to know how they would optimize it using a superior data structure. Keep it under 3 sentences."""
    
    response = llm.invoke([SystemMessage(content=prompt)] + state["messages"])
    return {"messages": [response], "current_agent": "Tech Lead"}

def architect_node(state: AgentState):
    """System design focus triggered by highly optimized code submissions."""
    prompt = f"""You are the System Architect at {state['target_company']}.
    The candidate just wrote this optimized code:
    {state['live_code']}
    
    Do not ask them to write more code. Ask them a rapid-fire system design question about how they would scale this specific algorithm to handle 10 million concurrent requests. Keep it to 2 sentences."""
    
    response = llm.invoke([SystemMessage(content=prompt)] + state["messages"])
    return {"messages": [response], "current_agent": "Architect"}

def hr_node(state: AgentState):
    """Behavioral testing triggered by biometric hesitation."""
    prompt = f"""You are the Behavioral HR Director at {state['target_company']}.
    The candidate's telemetry shows they hesitated {state['cv_telemetry'].get('hesitation_count', 0)} times while speaking.
    
    Challenge their confidence. Ask them a sharp, 2-sentence behavioral question about how they handle intense pressure or deployment failures in a production environment."""
    
    response = llm.invoke([SystemMessage(content=prompt)] + state["messages"])
    return {"messages": [response], "current_agent": "HR"}


# 4. WEAVE THE GRAPH
workflow = StateGraph(AgentState)

# Add nodes
workflow.add_node("router", router_node)
workflow.add_node("Onyx Core", onyx_core_node)
workflow.add_node("Tech Lead", tech_lead_node)
workflow.add_node("Architect", architect_node)
workflow.add_node("HR", hr_node)

# Set entry point
workflow.set_entry_point("router")

# Conditional routing matrix
workflow.add_conditional_edges(
    "router",
    lambda x: x["current_agent"],
    {
        "Onyx Core": "Onyx Core",
        "Tech Lead": "Tech Lead",
        "Architect": "Architect",
        "HR": "HR"
    }
)

# All agents terminate after one response (FastAPI sends it back to the client)
workflow.add_edge("Onyx Core", END)
workflow.add_edge("Tech Lead", END)
workflow.add_edge("Architect", END)
workflow.add_edge("HR", END)

# Compile the engine
swarm_app = workflow.compile()