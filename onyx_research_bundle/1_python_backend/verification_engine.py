from typing import Dict, Any, Optional

from complexity import normalize, compare, is_lte, UNKNOWN


class NeuroSymbolicVerifier:
    """
    Phase 2 & 4: Neuro-symbolic verification and Conflict Handling.
    Intercepts LLM claims and strictly verifies them against raw execution data.
    Ensures agents don't hallucinate test passes or time complexity.

    Rule: the LLM PROPOSES, deterministic evidence DECIDES.
    """

    @classmethod
    def verify_agent_claim(cls,
                           agent_name: str,
                           agent_claim_passed: bool,
                           actual_execution_passed: Optional[bool],
                           agent_claim_complexity: str,
                           actual_ast_complexity: str,
                           required_complexity: Optional[str] = None) -> Dict[str, Any]:
        """
        actual_execution_passed: None means "no tests were run" (not evidence either way).
        required_complexity: if given, the ACTUAL complexity must be <= this bound.
        """
        conflicts = []
        notes = []

        # 1. Verify Execution Correctness
        if actual_execution_passed is not None:
            if agent_claim_passed and not actual_execution_passed:
                conflicts.append(f"VIOLATION: {agent_name} hallucinated success. Code actually failed test cases.")
            if not agent_claim_passed and actual_execution_passed:
                conflicts.append(f"VIOLATION: {agent_name} falsely rejected working code.")

        claim = normalize(agent_claim_complexity)
        actual = normalize(actual_ast_complexity)

        # 2. Hard goal: actual complexity must meet the bound
        if required_complexity:
            if actual == UNKNOWN:
                conflicts.append(
                    f"VIOLATION: {agent_name} approved code whose complexity could not be verified "
                    f"(code missing or unparseable). Required {normalize(required_complexity)} or better."
                )
            elif not is_lte(actual, required_complexity):
                conflicts.append(
                    f"VIOLATION: {agent_name} approved {actual} code. Goal requires "
                    f"{normalize(required_complexity)} or better."
                )

        # 3. Claim accuracy: only a conflict if the claim is OPTIMISTIC vs AST.
        #    (Static loop-depth can't see hashing/two-pointer tricks perfectly, but it
        #     never over-estimates nested loops, so a claim better than AST = hallucination.)
        if claim != UNKNOWN and actual != UNKNOWN:
            c = compare(claim, actual)
            if c is not None and c < 0:
                conflicts.append(
                    f"VIOLATION: {agent_name} claimed '{claim}' but static analysis confirms '{actual}'."
                )
            elif c is not None and c > 0:
                notes.append(f"{agent_name} claimed a worse bound ({claim}) than AST ({actual}); accepted.")

        return {
            "verified": len(conflicts) == 0,
            "conflicts": conflicts,
            "notes": notes,
            "claim_complexity": claim,
            "actual_complexity": actual,
        }
