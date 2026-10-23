import subprocess
import tempfile
import time
import os
import sys
import json
import shutil
from typing import Dict, Any, List, Optional

# SANDBOX_MODE:
#   "docker" -> each run in a throwaway container: no network, read-only FS,
#               256 MB RAM, 0.5 CPU, 64 pids. REQUIRED for public production.
#   "local"  -> plain subprocess with a scrubbed env + POSIX rlimits (dev only).
SANDBOX_MODE = os.environ.get("SANDBOX_MODE", "local").lower()
SANDBOX_PY_IMAGE = os.environ.get("SANDBOX_PY_IMAGE", "python:3.11-alpine")
SANDBOX_NODE_IMAGE = os.environ.get("SANDBOX_NODE_IMAGE", "node:20-alpine")
MAX_OUTPUT_CHARS = 20_000


def _safe_env() -> Dict[str, str]:
    """Child processes get NO secrets (API keys, DB URLs) from the brain's env."""
    keep = {"PATH", "SYSTEMROOT", "TEMP", "TMP", "LANG", "PYTHONIOENCODING"}
    env = {k: v for k, v in os.environ.items() if k.upper() in keep}
    env["PYTHONIOENCODING"] = "utf-8"
    env["PYTHONDONTWRITEBYTECODE"] = "1"
    return env


def _posix_limits():  # pragma: no cover - POSIX only
    import resource
    resource.setrlimit(resource.RLIMIT_CPU, (3, 3))
    resource.setrlimit(resource.RLIMIT_AS, (512 * 1024 * 1024,) * 2)
    resource.setrlimit(resource.RLIMIT_FSIZE, (1 * 1024 * 1024,) * 2)
    resource.setrlimit(resource.RLIMIT_NPROC, (64, 64))
    os.setsid()


class ExecutionEngine:
    """
    Pure backend local code execution sandbox.
    Runs candidate code in isolated subprocesses without requiring an LLM.
    """
    TIMEOUT_SECONDS = 2.0  # Prevent infinite loops

    @classmethod
    def execute_python(cls, code: str) -> Dict[str, Any]:
        """Runs Python code and captures output."""
        return cls._run(code, "main.py", [sys.executable, "-I", "main.py"],
                        SANDBOX_PY_IMAGE, ["python", "-I", "/sandbox/main.py"])

    @classmethod
    def execute_javascript(cls, code: str) -> Dict[str, Any]:
        """Runs Javascript code using Node.js and captures output."""
        return cls._run(code, "main.js", ["node", "main.js"],
                        SANDBOX_NODE_IMAGE, ["node", "/sandbox/main.js"])

    @classmethod
    def _run(cls, code: str, filename: str, local_cmd: List[str], image: str, docker_cmd: List[str]) -> Dict[str, Any]:
        workdir = tempfile.mkdtemp(prefix="onyx_sbx_")
        try:
            with open(os.path.join(workdir, filename), "w", encoding="utf-8") as f:
                f.write(code)
            if SANDBOX_MODE == "docker":
                cmd = [
                    "docker", "run", "--rm", "-i", "--network", "none", "--read-only",
                    "--memory", "256m", "--cpus", "0.5", "--pids-limit", "64",
                    "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
                    "--user", "65534:65534", "-v", f"{workdir}:/sandbox:ro", image, *docker_cmd,
                ]
                # Container start-up overhead is not the candidate's fault.
                return cls._run_subprocess(cmd, cwd=None, timeout=cls.TIMEOUT_SECONDS + 5)
            return cls._run_subprocess(local_cmd, cwd=workdir, timeout=cls.TIMEOUT_SECONDS)
        finally:
            shutil.rmtree(workdir, ignore_errors=True)

    @classmethod
    def _run_subprocess(cls, cmd: List[str], cwd: Optional[str], timeout: float) -> Dict[str, Any]:
        start_time = time.time()
        try:
            process = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=timeout,
                cwd=cwd,
                env=_safe_env(),
                stdin=subprocess.DEVNULL,
                preexec_fn=_posix_limits if (os.name == "posix" and SANDBOX_MODE != "docker") else None,
            )
            execution_time = (time.time() - start_time) * 1000  # Convert to ms
            
            return {
                "success": process.returncode == 0,
                "stdout": process.stdout.strip()[:MAX_OUTPUT_CHARS],
                "stderr": process.stderr.strip()[:MAX_OUTPUT_CHARS],
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
