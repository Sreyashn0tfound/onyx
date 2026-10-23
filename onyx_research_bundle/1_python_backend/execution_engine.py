import subprocess
import tempfile
import time
import os
import json
from typing import Dict, Any, List

class ExecutionEngine:
    """
    Pure backend local code execution sandbox.
    Runs candidate code in isolated subprocesses without requiring an LLM.
    """
    TIMEOUT_SECONDS = 2.0  # Prevent infinite loops

    @classmethod
    def execute_python(cls, code: str) -> Dict[str, Any]:
        """Runs Python code locally and captures output."""
        with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False, encoding='utf-8') as f:
            f.write(code)
            temp_file_path = f.name
            
        return cls._run_subprocess(['python', temp_file_path], temp_file_path)

    @classmethod
    def execute_javascript(cls, code: str) -> Dict[str, Any]:
        """Runs Javascript code locally using Node.js and captures output."""
        with tempfile.NamedTemporaryFile(mode='w', suffix='.js', delete=False, encoding='utf-8') as f:
            f.write(code)
            temp_file_path = f.name
            
        # Assumes 'node' is in the system PATH
        return cls._run_subprocess(['node', temp_file_path], temp_file_path)

    @classmethod
    def _run_subprocess(cls, cmd: List[str], temp_file_path: str) -> Dict[str, Any]:
        start_time = time.time()
        try:
            process = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=cls.TIMEOUT_SECONDS
            )
            execution_time = (time.time() - start_time) * 1000  # Convert to ms
            
            return {
                "success": process.returncode == 0,
                "stdout": process.stdout.strip(),
                "stderr": process.stderr.strip(),
                "execution_time_ms": round(execution_time, 2),
                "error_type": None
            }
        except subprocess.TimeoutExpired:
            return {
                "success": False,
                "stdout": "",
                "stderr": f"Execution timed out after {cls.TIMEOUT_SECONDS} seconds. Possible infinite loop.",
                "execution_time_ms": cls.TIMEOUT_SECONDS * 1000,
                "error_type": "TimeoutError"
            }
        except Exception as e:
            return {
                "success": False,
                "stdout": "",
                "stderr": f"System execution error: {str(e)}",
                "execution_time_ms": 0,
                "error_type": "SystemError"
            }
        finally:
            if os.path.exists(temp_file_path):
                os.remove(temp_file_path)

    @classmethod
    def run_tests(cls, base_code: str, language: str, function_call: str, expected_output: Any) -> Dict[str, Any]:
        """
        Takes the candidate's base code, injects a function call, runs it, and compares output.
        Example: 
            function_call = "two_sum([2,7,11,15], 9)"
            expected_output = "[0, 1]"
        """
        if language.lower() in ['python', 'py', 'python3']:
            # We inject a print statement to capture the return value of the function
            injected_code = f"{base_code}\n\n# --- TEST INJECTION ---\nprint({function_call})"
            result = cls.execute_python(injected_code)
            
        elif language.lower() in ['javascript', 'js', 'node']:
            injected_code = f"{base_code}\n\n// --- TEST INJECTION ---\nconsole.log(JSON.stringify({function_call}));"
            result = cls.execute_javascript(injected_code)
            
        else:
            return {"success": False, "error_type": "UnsupportedLanguage", "stderr": f"Language {language} not supported."}

        # Verification step
        passed = False
        actual_output = result['stdout']
        
        if result['success']:
            # Normalizing strings for simple comparison
            if str(actual_output).strip().replace(" ", "") == str(expected_output).strip().replace(" ", ""):
                passed = True

        return {
            "passed": passed,
            "actual_output": actual_output,
            "expected_output": expected_output,
            "execution_metrics": result
        }

# --- Quick Test Block (Only runs if you execute this file directly) ---
if __name__ == "__main__":
    sample_code = """
def two_sum(nums, target):
    for i in range(len(nums)):
        for j in range(i + 1, len(nums)):
            if nums[i] + nums[j] == target:
                return [i, j]
    return []
"""
    print("Testing Python Execution Engine...")
    result = ExecutionEngine.run_tests(
        base_code=sample_code,
        language="python",
        function_call="two_sum([2, 7, 11, 15], 9)",
        expected_output="[0, 1]"
    )
    print(json.dumps(result, indent=2))
