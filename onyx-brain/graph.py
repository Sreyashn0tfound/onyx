import operator
from typing import Annotated, Sequence, TypedDict, Dict, Any, Optional

from langchain_core.messages import BaseMessage
from langgraph.graph import StateGraph, END
from llm import get_llm
from complexity import is_quadratic_or_worse

# Canonical panel member keys. Persona nodes MUST return exactly these as current_agent.
PANEL_MEMBERS = ("Tech Lead", "Architect", "HR")

# Import the isolated persona brains
from personas.shaun_tech_lead import shaun_tech_lead_node
from personas.jacob_architect import jacob_architect_node
from personas.asha_hr import asha_hr_node

# Live voiced panel -> FAST tier (Gemini Flash, low thinking) for snappy turns.
llm = get_llm("fast", temperature=0.7)


# 1. THE HIVE MIND STATE
class AgentState(TypedDict):
    messages: Annotated[Sequence[BaseMessage], operator.add]
    target_role: str
    target_company: str
    diagnostic_score: int
    live_code: str
    cv_telemetry: Dict[str, Any]
    ast_analysis: Dict[str, Any]
    candidate_memory: Dict[str, Any]  # Injected from Sam's Database
    current_agent: str
    module_context: Optional[str]
    
    # 🔥 NEW: The Consensus Protocol Array
    # Tracks which interviewers have met their Goal State and tapped out.
    panel_satisfaction: Dict[str, bool]


# 2. THE DYNAMIC SUPERVISOR ROUTER
def swarm_router(state: AgentState) -> str:
    """Analyzes telemetry and satisfaction flags to decide exactly who gets the mic."""
    
    # Default state if not yet initialized in the payload; missing keys count as unsatisfied.
    raw = state.get("panel_satisfaction") or {}
    satisfaction = {k: bool(raw.get(k, False)) for k in PANEL_MEMBERS}
    
    # 🔥 THE KILL SCREEN: If all interviewers are satisfied, terminate the boss fight.
    if all(satisfaction.values()):
        return END

    stress_level = str(state.get("cv_telemetry", {}).get("stress_level", "Nominal") or "Nominal")
    live_code = (state.get("live_code") or "").strip()
    complexity = state.get("ast_analysis", {}).get("time_complexity", "Unknown")
    is_hr_flag = state.get("current_agent") == "HR"

    # CASE 1: HR Intercept
    # If HR is not satisfied yet, and either the UI forces it or critical panic is detected.
    if not satisfaction.get("HR", False) and (is_hr_flag or "Critical" in stress_level):
        return "HR"
    
    # CASE 2: The Code Executioner
    # If Shaun is not satisfied yet, and unoptimized code is detected.
    if not satisfaction.get("Tech Lead", False) and live_code and is_quadratic_or_worse(complexity):
        return "Tech Lead"
    
    # CASE 3: The Scaler
    # If Jacob is not satisfied yet, default to architecture scaling.
    if not satisfaction.get("Architect", False):
        return "Architect"
        
    # Fallback: Find the first agent who isn't satisfied
    for agent, is_satisfied in satisfaction.items():
        if not is_satisfied:
            return agent
            
    return END


# 3. WEAVE THE GRAPH
workflow = StateGraph(AgentState)

# Add the nodes (We use lambda to pass our centralized LLM instance into your persona files)
workflow.add_node("Tech Lead", lambda state: shaun_tech_lead_node(state, llm))
workflow.add_node("Architect", lambda state: jacob_architect_node(state, llm))
workflow.add_node("HR", lambda state: asha_hr_node(state, llm))

# Set the conditional entry point to our router
workflow.set_conditional_entry_point(
    swarm_router,
    {
        "Tech Lead": "Tech Lead",
        "Architect": "Architect",
        "HR": "HR",
        END: END  # Allow the router to end the graph natively
    }
)

# Terminate after one response so FastAPI can stream the audio back to the UI
workflow.add_edge("Tech Lead", END)
workflow.add_edge("Architect", END)
workflow.add_edge("HR", END)

# Compile the engine
swarm_app = workflow.compile()