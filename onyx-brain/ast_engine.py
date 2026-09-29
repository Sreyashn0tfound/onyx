import ast

def analyze_code_complexity(code_string: str) -> dict:
    """
    Parses Python code and mathematically evaluates Time Complexity 
    based on nested loop depth.
    """
    try:
        # Attempt to parse the raw string into an Abstract Syntax Tree
        tree = ast.parse(code_string)
    except SyntaxError as e:
        # If the code is broken, we catch it immediately without asking an LLM
        return {
            "valid_syntax": False,
            "error_message": f"Syntax Error: {str(e)}",
            "time_complexity": "Unknown",
            "loop_depth": 0
        }

    max_depth = 0

    # Recursive function to walk the tree and count nested loops
    def walk_tree(node, current_depth):
        nonlocal max_depth
        
        # If we hit a loop, we go one level deeper
        if isinstance(node, (ast.For, ast.While)):
            current_depth += 1
            if current_depth > max_depth:
                max_depth = current_depth
        
        # Check all child nodes inside this block
        for child in ast.iter_child_nodes(node):
            walk_tree(child, current_depth)
            
        # As we exit the loop block, step back up
        if isinstance(node, (ast.For, ast.While)):
            current_depth -= 1

    # Start walking the tree from the root
    walk_tree(tree, 0)

    # Determine Big-O based on maximum depth
    if max_depth == 0:
        complexity = "O(1) or O(log n)" # Assuming no loops
    elif max_depth == 1:
        complexity = "O(n)"
    elif max_depth == 2:
        complexity = "O(n^2)"
    else:
        complexity = f"O(n^{max_depth})"

    return {
        "valid_syntax": True,
        "error_message": None,
        "time_complexity": complexity,
        "loop_depth": max_depth
    }

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