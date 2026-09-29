from typing import Dict, Any

class NeuroSymbolicVerifier:
    """
    Phase 2 & 4: Neuro-symbolic verification and Conflict Handling.
    Intercepts LLM claims and strictly verifies them against raw execution data.
    Ensures agents don't hallucinate test passes or time complexity.
    """
    
    @classmethod
    def verify_agent_claim(cls, 
                           agent_name: str, 
                           agent_claim_passed: bool, 
                           actual_execution_passed: bool,
                           agent_claim_complexity: str,
                           actual_ast_complexity: str) -> Dict[str, Any]:
        
        conflicts = []
        
        # 1. Verify Execution Correctness
        if agent_claim_passed and not actual_execution_passed:
            conflicts.append(f"VIOLATION: {agent_name} hallucinated success. Code actually failed test cases.")
            
        if not agent_claim_passed and actual_execution_passed:
            conflicts.append(f"VIOLATION: {agent_name} falsely rejected working code.")
            
        # 2. Verify AST Time Complexity
        if agent_claim_complexity and actual_ast_complexity:
            # Strip spaces and formatting for raw string comparison
            claim_clean = agent_claim_complexity.replace(" ", "").lower()
            actual_clean = actual_ast_complexity.replace(" ", "").lower()
            
            if claim_clean != actual_clean and "unknown" not in claim_clean:
                conflicts.append(f"VIOLATION: {agent_name} hallucinated complexity '{agent_claim_complexity}'. AST confirms it is actually '{actual_ast_complexity}'.")
                
        return {
            "verified": len(conflicts) == 0,
            "conflicts": conflicts
        }
