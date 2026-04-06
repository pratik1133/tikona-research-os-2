"""
OpenRouter API client — drop-in replacement for Anthropic SDK.
Uses the OpenAI-compatible chat completions endpoint.
"""

import os
import re
import time
import httpx

OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"
DEFAULT_MODEL = os.environ.get("OPENROUTER_MODEL", "anthropic/claude-sonnet-4")


def _get_api_key() -> str:
    key = os.environ.get("OPENROUTER_API_KEY", "")
    if not key:
        raise RuntimeError("OPENROUTER_API_KEY not set")
    return key


def strip_fences(raw: str) -> str:
    """Remove markdown code fences from LLM output."""
    code = raw.strip()
    code = re.sub(r"^```(?:javascript|js)?\n?", "", code)
    code = re.sub(r"\n?```\s*$", "", code)
    return code.strip()


def call_openrouter(
    system_prompt: str,
    user_prompt: str,
    *,
    max_tokens: int = 12000,
    temperature: float = 0.3,
    model: str | None = None,
) -> tuple[str, float]:
    """
    Call OpenRouter chat completions API.
    Returns (content_text, cost_usd).
    """
    model = model or DEFAULT_MODEL

    t0 = time.time()
    with httpx.Client(timeout=180) as client:
        resp = client.post(
            OPENROUTER_API_URL,
            headers={
                "Authorization": f"Bearer {_get_api_key()}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "max_tokens": max_tokens,
                "temperature": temperature,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
            },
        )
        resp.raise_for_status()

    elapsed = round(time.time() - t0, 1)
    data = resp.json()

    content = data["choices"][0]["message"]["content"]
    usage = data.get("usage", {})
    itok = usage.get("prompt_tokens", 0)
    otok = usage.get("completion_tokens", 0)

    # Approximate cost (Claude Sonnet via OpenRouter)
    cost = round((itok / 1_000_000 * 3.0) + (otok / 1_000_000 * 15.0), 4)

    print(f"  OpenRouter [{model}] {elapsed}s | in:{itok} out:{otok} | ${cost}")

    return strip_fences(content), cost
