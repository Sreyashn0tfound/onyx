"""
Single source of truth for every LLM the Onyx brain talks to.

Provider: Google Gemini through its OpenAI-compatible endpoint, so the existing
LangChain `ChatOpenAI` + `bind_tools` persona code works unchanged.

Two tiers (set via env, no code edits needed to swap models):
  FAST  -> real-time / voiced turns (panel, Diva, Amazon Q, resume parsing)
  DEEP  -> one-off, high-stakes reasoning (Sam roadmap, Mahoraga remedial modules)

Clients are cached so every request reuses the same HTTP connection pool
(re-creating a client per request costs a fresh TLS handshake each turn).
"""
import os
from functools import lru_cache
from typing import Literal, Optional

from langchain_openai import ChatOpenAI

import config  # noqa: F401  (loads .env)

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_BASE_URL = os.environ.get(
    "GEMINI_BASE_URL", "https://generativelanguage.googleapis.com/v1beta/openai/"
)

MODEL_FAST = os.environ.get("GEMINI_MODEL_FAST", "gemini-3.5-flash")
MODEL_DEEP = os.environ.get("GEMINI_MODEL_DEEP", "gemini-4-argon")

# Thinking depth. "low" keeps voiced turns snappy; empty string = provider default.
REASONING_FAST = os.environ.get("GEMINI_REASONING_FAST", "low")
REASONING_DEEP = os.environ.get("GEMINI_REASONING_DEEP", "")

Tier = Literal["fast", "deep"]


@lru_cache(maxsize=32)
def get_llm(tier: Tier = "fast", temperature: float = 0.7, json_mode: bool = False) -> ChatOpenAI:
    """Return a cached chat model for the given tier.

    json_mode=True forces a JSON object response (no prose / ``` fences).
    """
    if not GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY is not set (onyx-brain/.env)")

    model = MODEL_DEEP if tier == "deep" else MODEL_FAST
    effort: Optional[str] = (REASONING_DEEP if tier == "deep" else REASONING_FAST) or None

    kwargs = dict(
        model=model,
        temperature=temperature,
        api_key=GEMINI_API_KEY,
        base_url=GEMINI_BASE_URL,
        timeout=float(os.environ.get("GEMINI_TIMEOUT_S", "120" if tier == "deep" else "45")),
        max_retries=2,
    )
    if effort:
        kwargs["reasoning_effort"] = effort

    llm = ChatOpenAI(**kwargs)
    if json_mode:
        llm = llm.bind(response_format={"type": "json_object"})
    return llm


def message_text(msg) -> str:
    """Extract plain text from an AIMessage (handles str or content-block lists)."""
    content = getattr(msg, "content", "")
    if isinstance(content, list):
        content = " ".join(b.get("text", "") if isinstance(b, dict) else str(b) for b in content)
    return (content or "").strip()


def parse_json_response(text: str) -> dict:
    """Parse a JSON object from an LLM reply, tolerating stray fences/prose."""
    import json
    import re

    text = (text or "").strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    m = re.search(r"```(?:json)?\s*(\{.*\})\s*```", text, re.DOTALL)
    if m:
        return json.loads(m.group(1))
    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end > start:
        return json.loads(text[start : end + 1])
    raise ValueError("LLM response did not contain a JSON object")
