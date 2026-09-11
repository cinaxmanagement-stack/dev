"""EmergentUniversalKeyProvider — real LLMProvider backed by Emergent's Universal Key.

One Universal Key (`EMERGENT_UNIVERSAL_KEY`, or the encrypted `emergent_universal_key` secret)
gives access to GPT / Claude / Gemini model families through Emergent's integration proxy. This
class implements the full LLMProvider surface so it is a drop-in `ModelRegistry` entry — nothing in
agents/ or orchestration changes.

Transport: the `emergentintegrations` package (Emergent's own CDN wheel, not PyPI). It is an
OPTIONAL runtime dependency (see backend/requirements-devstudio.txt) imported lazily via `_sdk()`,
exactly like `anthropic`/`openai` elsewhere, so the app boots and its deterministic tests pass
without it installed.

Model discovery: `emergentintegrations` exposes no live model-list endpoint, so `list_models()`
returns a curated static catalog of the model IDs the Universal Key actually serves (per Emergent's
published supported-model list) — matching the same static-registry pattern the Anthropic/OpenAI
providers use. Capability flags are only set where they are genuinely true for the family; nothing
is fabricated.

See docs/EMERGENT_INTEGRATION_HANDOFF.md for the integration boundary this file satisfies.
"""
from __future__ import annotations

import time
import uuid
from typing import Any, AsyncIterator, Dict, List, Optional

from .base import (
    LLMProvider,
    LLMResult,
    LLMUsage,
    ModelInfo,
    ProviderError,
    ProviderNotConfigured,
)

# Curated catalog of Universal-Key-served models across the three families. IDs are the exact
# strings the proxy routes on. `family` is the litellm provider used for `.with_model(family, id)`;
# it is not surfaced as ModelInfo.provider (that stays "emergent" so these appear under the Emergent
# selector). Capability flags mirror each vendor's own current catalog (the same source the sibling
# providers used) — set only where genuinely supported.
_CATALOG: List[Dict[str, Any]] = [
    # --- OpenAI family ---
    {"id": "gpt-6-astra", "family": "openai", "label": "GPT-6 Astra (Universal Key)",
     "tools": True, "vision": True, "reasoning": True, "ctx": 400_000,
     "notes": "OpenAI flagship via Emergent Universal Key."},
    {"id": "gpt-5.6-terra", "family": "openai", "label": "GPT-5.6 Terra (Universal Key)",
     "tools": True, "vision": True, "reasoning": True, "ctx": 256_000,
     "notes": "OpenAI balanced tier via Emergent Universal Key."},
    {"id": "gpt-5.4", "family": "openai", "label": "GPT-5.4 (Universal Key)",
     "tools": True, "vision": True, "reasoning": True, "ctx": 400_000,
     "notes": "OpenAI general-purpose (recommended) via Emergent Universal Key."},
    {"id": "gpt-5.4-mini", "family": "openai", "label": "GPT-5.4 Mini (Universal Key)",
     "tools": True, "vision": True, "reasoning": False, "ctx": 128_000,
     "notes": "OpenAI budget tier via Emergent Universal Key."},
    # --- Anthropic family ---
    {"id": "claude-fable-5-1", "family": "anthropic", "label": "Claude Fable 5.1 (Universal Key)",
     "tools": True, "vision": True, "reasoning": True, "ctx": 200_000,
     "notes": "Anthropic agentic flagship via Emergent Universal Key."},
    {"id": "claude-opus-5", "family": "anthropic", "label": "Claude Opus 5 (Universal Key)",
     "tools": True, "vision": True, "reasoning": True, "ctx": 200_000,
     "notes": "Anthropic highest-accuracy tier via Emergent Universal Key."},
    {"id": "claude-sonnet-5", "family": "anthropic", "label": "Claude Sonnet 5 (Universal Key)",
     "tools": True, "vision": True, "reasoning": True, "ctx": 200_000,
     "notes": "Anthropic balanced tier via Emergent Universal Key."},
    {"id": "claude-sonnet-4-6", "family": "anthropic", "label": "Claude Sonnet 4.6 (Universal Key)",
     "tools": True, "vision": True, "reasoning": True, "ctx": 200_000,
     "notes": "Anthropic (recommended) via Emergent Universal Key."},
    # --- Gemini family ---
    {"id": "gemini-3.1-pro-preview", "family": "gemini", "label": "Gemini 3.1 Pro (Universal Key)",
     "tools": True, "vision": True, "reasoning": True, "ctx": 1_000_000,
     "notes": "Gemini long-context multimodal (recommended) via Emergent Universal Key."},
    {"id": "gemini-3-flash-preview", "family": "gemini", "label": "Gemini 3 Flash (Universal Key)",
     "tools": True, "vision": True, "reasoning": False, "ctx": 1_000_000,
     "notes": "Gemini fast multimodal via Emergent Universal Key."},
    {"id": "gemini-2.5-pro", "family": "gemini", "label": "Gemini 2.5 Pro (Universal Key)",
     "tools": True, "vision": True, "reasoning": True, "ctx": 1_000_000,
     "notes": "Gemini 2.5 Pro via Emergent Universal Key."},
    {"id": "gemini-2.5-flash", "family": "gemini", "label": "Gemini 2.5 Flash (Universal Key)",
     "tools": True, "vision": True, "reasoning": False, "ctx": 1_000_000,
     "notes": "Gemini 2.5 Flash via Emergent Universal Key."},
]

_FAMILY: Dict[str, str] = {m["id"]: m["family"] for m in _CATALOG}


def _sdk():
    """Lazy import — the app must boot without emergentintegrations installed."""
    try:
        import litellm  # emergentintegrations' transport; bundled with it

        # Different Universal-Key model families accept different param sets (e.g. GPT-5 models
        # only allow temperature=1, no reasoning_effort on some tiers). Let litellm silently drop
        # params a given model doesn't support instead of erroring — scoped to this path only,
        # since the native anthropic/openai/gemini providers use their own SDKs, not litellm.
        litellm.drop_params = True
        from emergentintegrations.llm.chat import (  # noqa: F401
            ChatError,
            ImageContent,
            LlmChat,
            UserMessage,
        )
        return LlmChat, UserMessage, ImageContent, ChatError
    except ImportError as e:  # noqa: BLE001
        raise ProviderNotConfigured(
            "The 'emergentintegrations' package is not installed in this environment. Install it "
            "via: pip install -r requirements-devstudio.txt (it ships from Emergent's CDN wheel "
            "index, see the file header)."
        ) from e


def _normalize_error(exc: Exception) -> Exception:
    """Map a raw provider/transport failure onto the app's provider error taxonomy without ever
    leaking the Universal Key or other secret material. Returns the exception to raise."""
    msg = str(exc)
    low = msg.lower()
    # Auth/credential problems are classified as 'requires_credentials' by the runner.
    if any(k in low for k in ("api key", "api_key", "unauthorized", "authentication",
                              "invalid key", "forbidden", "401", "403")):
        return ProviderNotConfigured(
            "Emergent Universal Key was rejected (authentication failed). Verify EMERGENT_UNIVERSAL_KEY "
            "or the stored emergent_universal_key secret is valid and has runtime balance."
        )
    if any(k in low for k in ("rate limit", "rate_limit", "429", "too many requests")):
        code = "RATE_LIMIT"
    elif any(k in low for k in ("context length", "context_length", "maximum context",
                                "too many tokens", "context window", "413")):
        code = "CONTEXT_TOO_LARGE"
    elif any(k in low for k in ("timeout", "timed out")):
        code = "PROVIDER_TIMEOUT"
    elif any(k in low for k in ("not found", "does not exist", "unknown model", "no such model",
                                "404")):
        code = "MODEL_UNAVAILABLE"
    elif any(k in low for k in ("invalid request", "bad request", "400", "unprocessable")):
        code = "INVALID_REQUEST"
    else:
        code = "PROVIDER_ERROR"
    # Strip anything that could echo a key back; keep only a short, safe classification.
    return ProviderError(code, f"Emergent provider call failed ({code}).")


class EmergentUniversalKeyProvider(LLMProvider):
    name = "emergent"

    def __init__(self, universal_key: Optional[str] = None):
        self._universal_key = universal_key

    # --- discovery / capabilities -------------------------------------------------------------
    def list_models(self) -> List[ModelInfo]:
        return [
            ModelInfo(
                id=m["id"], provider=self.name, label=m["label"],
                supports_tools=m["tools"], supports_vision=m["vision"],
                supports_reasoning_levels=m["reasoning"], context_window=m["ctx"],
                notes=m["notes"],
            )
            for m in _CATALOG
        ]

    # --- internals ----------------------------------------------------------------------------
    def _require_key(self) -> str:
        if not self._universal_key:
            raise ProviderNotConfigured(
                "EMERGENT_UNIVERSAL_KEY is not configured. Set it in the environment or store it via "
                "Dev Studio Settings > Secrets (POST /api/devstudio/settings/secrets "
                '{"name": "emergent_universal_key", "value": "<key>"}).'
            )
        return self._universal_key

    def _family(self, model: str) -> str:
        fam = _FAMILY.get(model)
        if fam is None:
            raise ProviderError(
                "MODEL_UNAVAILABLE",
                f"Model '{model}' is not served by the Emergent Universal Key catalog.",
            )
        return fam

    def _chat(self, *, system: str, model: str):
        key = self._require_key()
        LlmChat, _UserMessage, _ImageContent, _ChatError = _sdk()
        family = self._family(model)
        session_id = f"devstudio-{uuid.uuid4().hex}"
        return LlmChat(api_key=key, session_id=session_id, system_message=system).with_model(
            family, model
        )

    @staticmethod
    def _usage(resp_usage, duration_ms: int) -> LLMUsage:
        # emergentintegrations returns a Usage(input_tokens, output_tokens, total_tokens).
        # No dollar cost and no cache-token breakdown are exposed → leave those unset (never faked).
        return LLMUsage(
            input_tokens=getattr(resp_usage, "input_tokens", 0) or 0,
            output_tokens=getattr(resp_usage, "output_tokens", 0) or 0,
            cache_tokens=0,
            cost_usd=None,
            duration_ms=duration_ms,
        )

    # --- generation ---------------------------------------------------------------------------
    async def generate(self, *, system: str, prompt: str, model: str,
                        max_tokens: int = 4096, temperature: float = 0.2,
                        reasoning_level: Optional[str] = None) -> LLMResult:
        _LlmChat, UserMessage, _ImageContent, ChatError = _sdk()
        chat = self._chat(system=system, model=model)
        family = self._family(model)
        # Gemini can spend a very small output budget entirely on internal reasoning and return no
        # visible text; give it a small floor so trivial/low-max_tokens calls still yield content.
        if family == "gemini":
            max_tokens = max(max_tokens, 64)
        params: Dict[str, Any] = {"max_tokens": max_tokens, "temperature": temperature}
        # reasoning_effort is a first-class Chat-Completions param on OpenAI-family reasoning models;
        # only attach it there to avoid non-reasoning models rejecting an unknown field.
        if (reasoning_level and self.supports_reasoning_levels(model)
                and family == "openai"):
            params["reasoning_effort"] = {"low": "low", "medium": "medium",
                                          "high": "high"}.get(reasoning_level, "medium")
        chat = chat.with_params(**params)
        t0 = time.monotonic()
        try:
            resp = await chat.send_message_with_tools(UserMessage(text=prompt))
        except ChatError as e:
            raise _normalize_error(e) from e
        dur = int((time.monotonic() - t0) * 1000)
        return LLMResult(text=resp.content or "", usage=self._usage(resp.usage, dur),
                         model=model, provider=self.name)

    async def generate_structured(self, *, system: str, prompt: str, model: str,
                                   json_schema: Optional[Dict[str, Any]] = None,
                                   max_tokens: int = 4096) -> LLMResult:
        # Strict-JSON prompting + the runner's extract_json repair — provider-agnostic and robust
        # across all three families behind the Universal Key (matches AnthropicProvider's approach).
        strict_system = (
            system
            + "\n\nRespond with ONLY a single valid JSON object/array. No prose, no markdown code "
              "fences, no explanation before or after the JSON."
        )
        if json_schema:
            strict_system += f"\n\nThe JSON MUST conform to this schema:\n{json_schema}"
        return await self.generate(system=strict_system, prompt=prompt, model=model,
                                   max_tokens=max_tokens, temperature=0.0)

    async def generate_with_vision(self, *, system: str, prompt: str, model: str,
                                    images_b64: List[str], max_tokens: int = 4096) -> LLMResult:
        if not self.supports_vision(model):
            raise ProviderError("INVALID_REQUEST",
                                f"Model '{model}' does not support vision input.")
        _LlmChat, UserMessage, ImageContent, ChatError = _sdk()
        if self._family(model) == "gemini":
            max_tokens = max(max_tokens, 64)
        chat = self._chat(system=system, model=model).with_params(max_tokens=max_tokens)
        user_msg = UserMessage(
            text=prompt,
            file_contents=[ImageContent(image_base64=img) for img in images_b64],
        )
        t0 = time.monotonic()
        try:
            resp = await chat.send_message_with_tools(user_msg)
        except ChatError as e:
            raise _normalize_error(e) from e
        dur = int((time.monotonic() - t0) * 1000)
        return LLMResult(text=resp.content or "", usage=self._usage(resp.usage, dur),
                         model=model, provider=self.name)

    async def stream(self, *, system: str, prompt: str, model: str,
                     max_tokens: int = 4096) -> AsyncIterator[str]:
        from emergentintegrations.llm.chat import TextDelta  # local — keeps module import lazy
        _LlmChat, UserMessage, _ImageContent, ChatError = _sdk()
        chat = self._chat(system=system, model=model).with_params(max_tokens=max_tokens)
        try:
            async for event in chat.stream_message(UserMessage(text=prompt)):
                if isinstance(event, TextDelta) and event.content:
                    yield event.content
        except ChatError as e:
            raise _normalize_error(e) from e
