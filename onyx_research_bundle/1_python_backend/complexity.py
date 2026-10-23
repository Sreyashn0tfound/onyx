"""
Canonical Big-O handling for Onyx.

Every component (AST engine, verifier, scorer, router, personas) must speak the
same complexity language. Canonical forms (ordered best -> worst):

    O(1) < O(log n) < O(n) < O(n log n) < O(n^2) < O(n^3) < ... < O(2^n) < O(n!)

Use `normalize()` on ANY string coming from an LLM, user, or legacy code, and
`compare()` / `is_lte()` for goal checks (COMPLEXITY_LTE criteria).
"""
import re
from typing import Optional

UNKNOWN = "Unknown"

# Ordered ranks. Polynomial powers > 3 are ranked dynamically (see _rank).
_BASE_RANKS = {
    "O(1)": 0,
    "O(log n)": 1,
    "O(n)": 2,
    "O(n log n)": 3,
    "O(n^2)": 4,
    "O(n^3)": 5,
}
_EXP_RANK = 100
_FACT_RANK = 101


def normalize(raw: Optional[str]) -> str:
    """Map any reasonable Big-O spelling to its canonical form, or 'Unknown'."""
    if not raw or not isinstance(raw, str):
        return UNKNOWN

    s = raw.strip().lower()
    # Legacy ambiguous value from the old ast_engine -> treat as constant.
    if "o(1) or o(log n)" in s.replace("  ", " "):
        return "O(1)"

    # Pull out the first O(...) / Θ(...) group if the string has prose around it.
    m = re.search(r"[oθ]\s*\(([^)]*)\)", s)
    inner = m.group(1) if m else s
    inner = (inner.replace("²", "^2").replace("³", "^3")
                  .replace("**", "^").replace("·", " ").replace("*", " "))
    inner = re.sub(r"\s+", "", inner)          # drop whitespace entirely
    inner = re.sub(r"[mkv]", "n", inner)        # O(m), O(k), O(V) -> treat as n
    inner = inner.replace("lgn", "logn").replace("log(n)", "logn").replace("log2n", "logn")

    if inner in ("1", "c", "const", "constant"):
        return "O(1)"
    if inner == "logn":
        return "O(log n)"
    if inner in ("n", "n+n", "2n"):
        return "O(n)"
    if inner in ("nlogn", "logn n", "nlog n"):
        return "O(n log n)"
    if inner in ("n!", "factorial"):
        return "O(n!)"
    if re.fullmatch(r"\d\^n", inner):
        return "O(2^n)"

    poly = re.fullmatch(r"n\^(\d+)", inner)
    if poly:
        p = int(poly.group(1))
        return "O(1)" if p == 0 else "O(n)" if p == 1 else f"O(n^{p})"
    if re.fullmatch(r"n(n)+", inner):  # "nn" from "n*n"
        return f"O(n^{len(inner)})"

    # Plain-English fallbacks
    if "quadratic" in s: return "O(n^2)"
    if "cubic" in s: return "O(n^3)"
    if "linearithmic" in s: return "O(n log n)"
    if "linear" in s: return "O(n)"
    if "logarithmic" in s: return "O(log n)"
    if "constant" in s: return "O(1)"
    if "exponential" in s: return "O(2^n)"
    return UNKNOWN


def _rank(canonical: str) -> Optional[int]:
    if canonical in _BASE_RANKS:
        return _BASE_RANKS[canonical]
    poly = re.fullmatch(r"O\(n\^(\d+)\)", canonical)
    if poly:
        return 2 + int(poly.group(1))  # n^4 -> 6, n^5 -> 7 ...
    if canonical == "O(2^n)":
        return _EXP_RANK
    if canonical == "O(n!)":
        return _FACT_RANK
    return None


def compare(a: str, b: str) -> Optional[int]:
    """-1 if a is better than b, 0 equal, 1 worse. None if either is Unknown."""
    ra, rb = _rank(normalize(a)), _rank(normalize(b))
    if ra is None or rb is None:
        return None
    return (ra > rb) - (ra < rb)


def is_lte(actual: str, limit: str) -> bool:
    """True iff `actual` is provably no worse than `limit`. Unknown -> False."""
    c = compare(actual, limit)
    return c is not None and c <= 0


def is_quadratic_or_worse(c: str) -> bool:
    r = _rank(normalize(c))
    return r is not None and r >= _BASE_RANKS["O(n^2)"]
