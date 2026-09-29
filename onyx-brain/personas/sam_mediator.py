from langchain_core.messages import SystemMessage
from langchain_core.tools import tool
from langchain_groq import ChatGroq

# -------------------------------------------------------------
# 1. SAM'S TOOLS (The API to the Database)
# -------------------------------------------------------------

@tool
def mutate_roadmap(action: str, node_title: str, sequence_index: int, focus_area: str):
    """
    Use this to dynamically inject or modify a learning node in the candidate's roadmap.
    Args:
        action: 'INJECT_REMEDIAL' or 'SKIP_AHEAD'
        node_title: The name of the new module (e.g., 'Advanced Pointer Mechanics')
        sequence_index: Where to insert this in their orbital map
        focus_area: The specific technical gap to cover
    """
    # TODO: Execute Prisma DB call to insert new RoadmapNode
    return f"SUCCESS: Roadmap mutated. {action} executed for '{node_title}'."

@tool
def issue_certification_alert(cert_name: str, reason: str, url: str):
    """
    Use this to push a high-priority certification or course recommendation to the user's dashboard.
    Args:
        cert_name: Specific cert (e.g., 'AWS Certified Solutions Architect')
        reason: Why they need it based on their target company
        url: Link to the certification
    """
    # TODO: Execute Prisma DB call to create a Notification
    return f"SUCCESS: Notification pushed for {cert_name}."

@tool
def evaluate_placement_readiness(is_ready: bool, confidence_score: int):
    """
    Call this ONLY to declare your absolute Goal State.
    Args:
        is_ready: True if the candidate is ready to face the Interview Panel.
        confidence_score: Your 0-100 confidence that they will get the offer.
    """
    # TODO: Update User Profile to unlock Phase 100 (The Boss Panel)
    return f"TERMINAL STATE REACHED. Placement readiness: {is_ready}."


# -------------------------------------------------------------
# 2. SAM'S BRAIN (The Execution Node)
# -------------------------------------------------------------

def sam_mediator_node(state: dict, llm: ChatGroq):
    """Sam operates asynchronously, invoking tools to shape the user's journey."""
    profile = state.get("candidate_memory", {})
    
    # 🔥 BIND TOOLS TO SAM: This gives him the power to act, not just speak.
    sam_llm = llm.bind_tools([mutate_roadmap, issue_certification_alert, evaluate_placement_readiness])
    
    prompt = f"""[AUTHORIZATION LEVEL: ORCHESTRATOR // NAME: SAM]
You are Sam, the autonomous mediator and placement architect for the Onyx platform.
Your absolute terminal goal: Get this candidate hired as a {profile.get('target_role', 'Software Engineer')} at {profile.get('target_company', 'FAANG')}.

[CANDIDATE DOSSIER]
Current Elo Rating: {profile.get('elo_rating', 1000)}
Recent Submission Fails: {profile.get('weak_spots', [])}
Completed Nodes: {profile.get('completed_nodes', 0)}

[OPERATIONAL DIRECTIVES]
1. GAP ANALYSIS: Look at their recent failures. If they are repeatedly failing AST complexity checks (e.g., O(N^2) loops), you MUST use the `mutate_roadmap` tool to inject a remedial data structures node before they proceed.
2. PORTFOLIO PUSH: If they lack specific enterprise skills required for their target company, use `issue_certification_alert` to aggressively recommend a specific, real-world credential.
3. THE GATEKEEPER: You control access to the Interview Panel (Shaun, Jacob, Asha). Only use `evaluate_placement_readiness` to unlock the final boss panel if their Elo and completion metrics mathematically prove they can survive a brutal technical interview.

You operate in the background. Do not output conversational filler or chat with the candidate. Evaluate the dossier and immediately execute the necessary tools to align them with their target role."""

    # Sam executes his tools based on the state
    response = sam_llm.invoke([SystemMessage(content=prompt)] + state["messages"])
    
    return {"messages": [response], "current_agent": "Sam"}