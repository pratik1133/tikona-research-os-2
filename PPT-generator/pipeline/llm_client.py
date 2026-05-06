"""Provider-agnostic LLM client focused on JSON output.

Supports Anthropic, OpenRouter, and Gemini. Chooses based on env:
  - ANTHROPIC_API_KEY  -> Anthropic (default)
  - OPENROUTER_API_KEY -> OpenRouter
  - GEMINI_API_KEY     -> Gemini
Set LLM_PROVIDER=openrouter|anthropic|gemini to force a specific one.

The client exposes one method: `generate_json(system, user, schema_hint)`.
It asks the model for JSON only, strips markdown fences, and returns a dict.
"""

from __future__ import annotations

import json
import os
import random
import re
import time
from dataclasses import dataclass
from typing import Any

import requests


class LLMTruncatedError(Exception):
    """Raised when the LLM response was cut short by max_tokens."""
    def __init__(self, provider: str, text_preview: str):
        self.provider = provider
        self.text_preview = text_preview
        super().__init__(
            f"LLM output truncated (provider={provider}, max_tokens hit). "
            f"Partial output tail: ...{text_preview[-200:]}"
        )


DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-5"
DEFAULT_OPENROUTER_MODEL = "anthropic/claude-sonnet-4.6"
DEFAULT_GEMINI_MODEL = "gemini-2.5-pro"


@dataclass
class LLMResult:
    text: str
    model: str
    usage: dict[str, Any]


def _strip_fences(text: str) -> str:
    t = text.strip()
    t = re.sub(r"^```(?:json)?\s*", "", t)
    t = re.sub(r"\s*```$", "", t)
    return t.strip()


def _extract_json(text: str) -> dict:
    t = _strip_fences(text)
    try:
        return json.loads(t)
    except json.JSONDecodeError:
        pass
    # Fallback: find first balanced {...}
    start = t.find("{")
    if start == -1:
        raise ValueError(f"No JSON object found in model output:\n{text[:500]}")
    depth = 0
    in_str = False
    esc = False
    for i in range(start, len(t)):
        c = t[i]
        if esc:
            esc = False
            continue
        if c == "\\":
            esc = True
            continue
        if c == '"':
            in_str = not in_str
            continue
        if in_str:
            continue
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return json.loads(t[start : i + 1])
    raise ValueError(f"Unbalanced JSON in model output:\n{text[:500]}")


class LLMClient:
    def __init__(
        self,
        provider: str | None = None,
        model: str | None = None,
        max_tokens: int = 8192,
        temperature: float = 0.3,
    ):
        provider = (provider or os.environ.get("LLM_PROVIDER") or "").lower()
        if not provider:
            if os.environ.get("ANTHROPIC_API_KEY"):
                provider = "anthropic"
            elif os.environ.get("OPENROUTER_API_KEY"):
                provider = "openrouter"
            elif os.environ.get("GEMINI_API_KEY"):
                provider = "gemini"
            else:
                raise RuntimeError(
                    "No LLM provider configured. Set ANTHROPIC_API_KEY, OPENROUTER_API_KEY, or GEMINI_API_KEY."
                )
        self.provider = provider
        self.max_tokens = max_tokens
        self.temperature = temperature
        if provider == "anthropic":
            self.model = model or os.environ.get("ANTHROPIC_MODEL") or DEFAULT_ANTHROPIC_MODEL
            self.api_key = os.environ["ANTHROPIC_API_KEY"]
        elif provider == "openrouter":
            self.model = model or os.environ.get("OPENROUTER_MODEL") or DEFAULT_OPENROUTER_MODEL
            self.api_key = os.environ["OPENROUTER_API_KEY"]
        elif provider == "gemini":
            self.model = model or os.environ.get("GEMINI_MODEL") or DEFAULT_GEMINI_MODEL
            self.api_key = os.environ["GEMINI_API_KEY"]
            if temperature == 0.3 and "GEMINI_TEMPERATURE" not in os.environ:
                self.temperature = 1.0
            elif "GEMINI_TEMPERATURE" in os.environ:
                self.temperature = float(os.environ["GEMINI_TEMPERATURE"])
        else:
            raise ValueError(f"Unknown provider: {provider}")

    # ── public API ──

    def generate_json(self, system: str, user: str) -> tuple[dict, LLMResult]:
        """Ask the model for a JSON object. Returns (parsed_dict, raw_result)."""
        system = system.rstrip() + "\n\nReturn ONLY a valid JSON object. No prose, no markdown fences."
        result = self._call(system, user)
        parsed = _extract_json(result.text)
        return parsed, result

    # ── providers ──

    def _call(self, system: str, user: str) -> LLMResult:
        if self.provider == "anthropic":
            fn = self._call_anthropic
        elif self.provider == "openrouter":
            fn = self._call_openrouter
        else:
            fn = self._call_gemini
        last_err: Exception | None = None
        for attempt in range(5):
            try:
                return fn(system, user)
            except (requests.exceptions.ConnectionError,
                    requests.exceptions.ChunkedEncodingError,
                    requests.exceptions.Timeout,
                    requests.exceptions.HTTPError) as e:
                # Only retry 429/5xx HTTP errors
                if isinstance(e, requests.exceptions.HTTPError):
                    code = e.response.status_code if e.response is not None else 0
                    if code not in (408, 429, 500, 502, 503, 504):
                        raise
                last_err = e
                sleep = min(30.0, (2 ** attempt) + random.uniform(0, 0.5))
                time.sleep(sleep)
        assert last_err is not None
        raise last_err

    def _call_anthropic(self, system: str, user: str) -> LLMResult:
        resp = requests.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": self.api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": self.model,
                "max_tokens": self.max_tokens,
                "temperature": self.temperature,
                "system": system,
                "messages": [{"role": "user", "content": user}],
            },
            timeout=180,
        )
        resp.raise_for_status()
        data = resp.json()
        text = "".join(
            b.get("text", "") for b in data.get("content", []) if b.get("type") == "text"
        )
        if data.get("stop_reason") == "max_tokens":
            raise LLMTruncatedError("anthropic", text)
        return LLMResult(text=text, model=self.model, usage=data.get("usage", {}))

    def _call_openrouter(self, system: str, user: str) -> LLMResult:
        resp = requests.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": self.model,
                "max_tokens": self.max_tokens,
                "temperature": self.temperature,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                "response_format": {"type": "json_object"},
            },
            timeout=180,
        )
        resp.raise_for_status()
        data = resp.json()
        choice = data["choices"][0]
        text = choice["message"]["content"]
        if choice.get("finish_reason") == "length":
            raise LLMTruncatedError("openrouter", text)
        return LLMResult(text=text, model=self.model, usage=data.get("usage", {}))

    def _call_gemini(self, system: str, user: str) -> LLMResult:
        resp = requests.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:generateContent",
            params={"key": self.api_key},
            headers={
                "Content-Type": "application/json",
            },
            json={
                "systemInstruction": {
                    "parts": [{"text": system}],
                },
                "contents": [
                    {
                        "role": "user",
                        "parts": [{"text": user}],
                    }
                ],
                "generationConfig": {
                    "temperature": self.temperature,
                    "maxOutputTokens": self.max_tokens,
                    "responseMimeType": "application/json",
                },
            },
            timeout=180,
        )
        resp.raise_for_status()
        data = resp.json()
        candidates = data.get("candidates", [])
        if not candidates:
            raise ValueError(f"No Gemini candidates returned: {data}")
        candidate = candidates[0]
        parts = candidate.get("content", {}).get("parts", [])
        text = "".join(p.get("text", "") for p in parts)
        if candidate.get("finishReason") == "MAX_TOKENS":
            raise LLMTruncatedError("gemini", text)
        return LLMResult(
            text=text,
            model=self.model,
            usage=data.get("usageMetadata", {}),
        )
