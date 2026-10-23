from typing import Dict, Any

from complexity import normalize, compare, is_quadratic_or_worse, UNKNOWN


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

        score = 0.0
        breakdown = {}

        # 1. Test Case Weight (50% of total score)
        tests_passed = max(0, min(tests_passed or 0, total_tests or 0))
        if total_tests and total_tests > 0:
            test_score = (tests_passed / total_tests) * 50
        else:
            test_score = 0
        score += test_score
        breakdown['test_cases'] = round(test_score, 2)

        # 2. Time Complexity Weight (30% of total score)
        actual = normalize(time_complexity)
        expected = normalize(expected_complexity)
        cmp = compare(actual, expected)
        if actual == UNKNOWN:
            complexity_score = 0           # no verifiable code -> no credit
        elif cmp is not None and cmp <= 0:
            complexity_score = 30          # meets or beats the target
        elif is_quadratic_or_worse(actual):
            complexity_score = 0           # heavy penalty for unoptimized nested loops
        elif cmp == 1:
            complexity_score = 15          # one step off (e.g. O(n log n) vs O(n))
        else:
            complexity_score = 10
        score += complexity_score
        breakdown['time_complexity'] = complexity_score

        # 3. Biometric / Behavioral Composure (20% of total score)
        level = (stress_level or "").strip().lower()
        if "critical" in level:
            composure_score = 5
        elif "elevated" in level:
            composure_score = 12
        else:
            composure_score = 20           # nominal / unknown / offline -> no penalty
        score += composure_score
        breakdown['composure'] = composure_score

        return {
            "final_score": round(score, 2),
            "passed_threshold": score >= 75.0,  # Strict 75% bar to pass
            "breakdown": breakdown,
            "actual_complexity": actual,
            "expected_complexity": expected,
        }
