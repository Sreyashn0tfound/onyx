from typing import Dict, Any

class DeterministicScorer:
    """
    Phase 2 & 4: Deterministic Scoring Engine.
    Calculates a strict, mathematical score based on hard execution metrics, 
    bypassing LLM hallucinations or 'vibes'.
    """
    
    @classmethod
    def calculate_final_score(cls, 
                              tests_passed: int, 
                              total_tests: int, 
                              time_complexity: str, 
                              expected_complexity: str, 
                              stress_level: str) -> Dict[str, Any]:
        
        score = 0
        breakdown = {}
        
        # 1. Test Case Weight (50% of total score)
        if total_tests > 0:
            test_ratio = tests_passed / total_tests
            test_score = test_ratio * 50
            score += test_score
            breakdown['test_cases'] = test_score
        else:
            breakdown['test_cases'] = 0
            
        # 2. Time Complexity Weight (30% of total score)
        complexity_score = 0
        if time_complexity == expected_complexity:
            complexity_score = 30
        elif time_complexity == "O(N)" and expected_complexity == "O(1)":
            complexity_score = 15
        elif time_complexity in ["O(N^2)", "O(N^3)", "O(N²)"]:
            complexity_score = 0  # Heavy penalty for unoptimized nested loops
        else:
            complexity_score = 10
            
        score += complexity_score
        breakdown['time_complexity'] = complexity_score
        
        # 3. Biometric / Behavioral Composure (20% of total score)
        composure_score = 20
        if stress_level.lower() == "critical":
            composure_score = 5
        elif stress_level.lower() == "elevated":
            composure_score = 12
        elif stress_level.lower() == "nominal":
            composure_score = 20
            
        score += composure_score
        breakdown['composure'] = composure_score
        
        return {
            "final_score": round(score, 2),
            "passed_threshold": score >= 75.0,  # Strict 75% bar to pass
            "breakdown": breakdown
        }
