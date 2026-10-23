import ast
import re

from complexity import normalize, UNKNOWN

_SORT_FUNCS = {"sorted"}
_SORT_METHODS = {"sort"}
_HEAP_FUNCS = {"heapify", "nsmallest", "nlargest"}


def _loop_complexity(depth: int) -> str:
    if depth == 0:
        return "O(1)"
    if depth == 1:
        return "O(n)"
    return f"O(n^{depth})"


def _analyze_python(code_string: str) -> dict:
    try:
        tree = ast.parse(code_string)
    except SyntaxError as e:
        return {
            "valid_syntax": False,
            "error_message": f"Syntax Error: {str(e)}",
            "time_complexity": UNKNOWN,
            "loop_depth": 0,
            "uses_sort": False,
            "recursive_functions": [],
        }

    max_depth = 0
    uses_sort = False
    recursive_functions = set()

    def walk(node, depth, func_name=None):
        nonlocal max_depth, uses_sort

        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            # A nested function body is analyzed at depth 0 of its own scope.
            for child in ast.iter_child_nodes(node):
                walk(child, 0, node.name)
            return

        here = depth
        if isinstance(node, (ast.For, ast.AsyncFor, ast.While)):
            here = depth + 1
        elif isinstance(node, (ast.ListComp, ast.SetComp, ast.DictComp, ast.GeneratorExp)):
            # each `for` clause in a comprehension is one more nesting level
            here = depth + len(node.generators)

        max_depth = max(max_depth, here)

        if isinstance(node, ast.Call):
            fn = node.func
            name = fn.id if isinstance(fn, ast.Name) else fn.attr if isinstance(fn, ast.Attribute) else None
            if (isinstance(fn, ast.Name) and name in _SORT_FUNCS) or \
               (isinstance(fn, ast.Attribute) and name in _SORT_METHODS | _HEAP_FUNCS):
                uses_sort = True
            if func_name and isinstance(fn, ast.Name) and name == func_name:
                recursive_functions.add(func_name)

        for child in ast.iter_child_nodes(node):
            walk(child, here, func_name)

    walk(tree, 0)

    complexity = _loop_complexity(max_depth)
    # A sort at top level dominates a single linear pass.
    if uses_sort and max_depth <= 1:
        complexity = "O(n log n)"

    return {
        "valid_syntax": True,
        "error_message": None,
        "time_complexity": normalize(complexity),
        "loop_depth": max_depth,
        "uses_sort": uses_sort,
        "recursive_functions": sorted(recursive_functions),
    }


_C_LIKE_LOOP = re.compile(r"\b(for|while)\s*\(|\.(forEach|map|filter|reduce)\s*\(")


def _analyze_c_like(code_string: str) -> dict:
    """Best-effort brace-depth heuristic for JS/TS/Java/C++ (no real parser)."""
    # strip strings and comments so 'for (' inside them doesn't count
    src = re.sub(r"//.*?$|/\*.*?\*/", "", code_string, flags=re.S | re.M)
    src = re.sub(r"(['\"`])(?:\\.|(?!\1).)*\1", "\"\"", src, flags=re.S)

    max_depth, stack, pending_loop = 0, [], False
    i = 0
    while i < len(src):
        m = _C_LIKE_LOOP.match(src, i)
        if m:
            pending_loop = True
            i = m.end()
            if m.group(1):  # for/while: skip the (...) header incl. its ';'
                paren = 1
                while i < len(src) and paren:
                    paren += {"(": 1, ")": -1}.get(src[i], 0)
                    i += 1
            continue
        ch = src[i]
        if ch == "{":
            stack.append(pending_loop)
            pending_loop = False
            max_depth = max(max_depth, sum(stack))
        elif ch == "}" and stack:
            stack.pop()
        elif ch == ";" and pending_loop and not stack:
            pending_loop = False
        i += 1

    uses_sort = bool(re.search(r"\.sort\s*\(|Arrays\.sort|std::sort|Collections\.sort", src))
    complexity = _loop_complexity(max_depth)
    if uses_sort and max_depth <= 1:
        complexity = "O(n log n)"
    return {
        "valid_syntax": True,  # unknown, we don't parse non-Python
        "error_message": None,
        "time_complexity": normalize(complexity),
        "loop_depth": max_depth,
        "uses_sort": uses_sort,
        "recursive_functions": [],
    }


def analyze_code_complexity(code_string: str, language: str = "python") -> dict:
    """
    Deterministically estimate time complexity from loop nesting depth.
    Returns canonical complexity strings (see complexity.py).
    """
    if not code_string or not code_string.strip():
        return {
            "valid_syntax": False,
            "error_message": "Empty code buffer.",
            "time_complexity": UNKNOWN,
            "loop_depth": 0,
            "uses_sort": False,
            "recursive_functions": [],
        }
    lang = (language or "python").lower()
    if lang in ("python", "py", "python3"):
        return _analyze_python(code_string)
    return _analyze_c_like(code_string)


def feedback_for(result: dict) -> str:
    if not result.get("valid_syntax"):
        return result.get("error_message") or "Code could not be parsed."
    depth = result.get("loop_depth", 0)
    notes = []
    if depth >= 2:
        notes.append(f"Nested iteration depth {depth} detected. Risk under scale.")
    elif depth == 1:
        notes.append("Single linear pass detected.")
    else:
        notes.append("No iteration detected.")
    if result.get("uses_sort"):
        notes.append("Sorting adds an O(n log n) floor.")
    if result.get("recursive_functions"):
        notes.append("Recursion detected; static estimate may understate cost.")
    return " ".join(notes)


# --- Quick Local Test ---
if __name__ == "__main__":
    sample_code = """
def two_sum(nums, target):
    for i in range(len(nums)):
        for j in range(i + 1, len(nums)):
            if nums[i] + nums[j] == target:
                return [i, j]
    """
    result = analyze_code_complexity(sample_code)
    print("AST Analysis Result:", result)