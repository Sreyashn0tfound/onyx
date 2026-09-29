from langchain_core.messages import SystemMessage, HumanMessage
from langchain_openai import ChatOpenAI
from langchain_core.tools import tool

@tool
def trigger_test_execution():
    """
    Call this tool when the candidate believes they have finished the code 
    and you want the backend to execute the tests.
    """
    return "TEST_EXECUTION_TRIGGERED"

def amazon_q_node(user_prompt: str, current_code: str, incident_title: str, llm: ChatOpenAI) -> str:
    """
    Amazon Q is an AI assistant designed to help candidates solve AWS-style incident tickets.
    It provides Socratic hints but never writes the code for the candidate.
    """
    
    q_llm = llm.bind_tools([trigger_test_execution])
    
    prompt = f"""[AUTHORIZATION LEVEL: AMAZON Q ASSISTANT]
You are Amazon Q, the AI coding companion for the Amazon SDE Crucible.
The candidate is currently working on: {incident_title}

[LIVE EDITOR BUFFER]
{current_code}

[YOUR DIRECTIVE]
1. Answer the candidate's question clearly but concisely (2-3 sentences max).
2. DO NOT write the exact code solution for them. Use Socratic questioning to guide them.
3. If they ask if their code is correct, use the `trigger_test_execution` tool to run the backend sandbox tests.
"""
    
    response = q_llm.invoke([SystemMessage(content=prompt), HumanMessage(content=user_prompt)])
    
    # If the LLM decided to call the test execution tool, we can intercept that
    if response.tool_calls:
        return "I am running the test cases against your code now..."
        
    return response.content
