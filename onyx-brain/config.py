import os
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables from onyx-brain/.env regardless of the working directory.
load_dotenv(Path(__file__).resolve().parent / ".env")

# --- LLM provider (Gemini). Model names live in llm.py / env. ---
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")

# Legacy (no longer used by the brain; kept so old imports don't break).
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY")
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"

# --- Service security ---
# Shared secret the Next.js server sends as `X-Onyx-Key`. If unset, the brain
# runs open (dev only) and prints a warning at startup.
ONYX_BRAIN_SECRET = os.environ.get("ONYX_BRAIN_SECRET", "")

# Comma-separated list of browser origins allowed by CORS.
ALLOWED_ORIGINS = [
    o.strip()
    for o in os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",")
    if o.strip()
]

# --- Server ---
HOST = os.environ.get("ONYX_HOST", "127.0.0.1")
PORT = int(os.environ.get("PORT", os.environ.get("ONYX_PORT", "8000")))
DEV_RELOAD = os.environ.get("ONYX_RELOAD", "false").lower() == "true"
