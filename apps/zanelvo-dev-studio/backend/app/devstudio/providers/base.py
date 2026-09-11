"""LLMProvider abstraction. Nothing in Dev Studio may call a specific vendor SDK directly —
every agent goes through this interface, so providers can be swapped/added without touching
orchestration code (see docs/EMERGENT_INTEGRATION_HANDOFF.md for how Emergent plugs in later).
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, AsyncIterator, Dict, List, Optional


@dataclass
class ModelInfo:
    id: str
    provider: str
    label: str
    supports_tools: bool = False
    supports_vision: bool = False
    supports_reasoning_levels: bool = False
    context_window: Optional[int] = None
    notes: Optional[str] = None


@dataclass
class LLMUsage:
    input_tokens: int = 0
    output_tokens: int = 0
    cache_tokens: int = 0
    cost_usd: Optional[float] = None
    duration_ms: Optional[int] = None


@dataclass
class LLMResult:
    text: str
    usage: LLMUsage = field(default_factory=LLMUsage)
    raw: Optional[Dict[str, Any]] = None
    model: Optional[str] = None
    provider: Optional[str] = None


class ProviderNotConfigured(Exception):
    """Raised when a provider is selected but lacks the credentials it needs to run.
    Callers classify this as 'Live but requires external credentials', never as a silent failure."""


class ProviderNotImplemented(Exception):
    """Raised by an intentional stub provider (e.g. Emergent) that has a real interface but no
    working backend yet. Distinct from ProviderNotConfigured: this is a missing integration, not
    a missing credential."""


class ProviderError(Exception):
    """Normalized provider/runtime failure. `code` is one of a small stable set
    (MODEL_UNAVAILABLE, RATE_LIMIT, CONTEXT_TOO_LARGE, INVALID_REQUEST, PROVIDER_TIMEOUT,
    PROVIDER_ERROR) so callers/UI can react uniformly regardless of vendor. Messages are kept
    secret-safe — never echo the API/Universal key or raw upstream payloads."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


class LLMProvider(ABC):
    """One implementation per vendor. Every method is real (never fakes success)."""

    name: str = "base"

    @abstractmethod
    def list_models(self) -> List[ModelInfo]:
        ...

    @abstractmethod
    async def generate(self, *, system: str, prompt: str, model: str,
                        max_tokens: int = 4096, temperature: float = 0.2,
                        reasoning_level: Optional[str] = None) -> LLMResult:
        ...

    @abstractmethod
    async def generate_structured(self, *, system: str, prompt: str, model: str,
                                   json_schema: Optional[Dict[str, Any]] = None,
                                   max_tokens: int = 4096) -> LLMResult:
        """Returns LLMResult.text containing a JSON string conforming to json_schema (best-effort;
        caller is responsible for parsing/validating — see services/execution schema helpers)."""
        ...

    @abstractmethod
    async def generate_with_vision(self, *, system: str, prompt: str, model: str,
                                    images_b64: List[str], max_tokens: int = 4096) -> LLMResult:
        ...

    @abstractmethod
    async def stream(self, *, system: str, prompt: str, model: str,
                      max_tokens: int = 4096) -> AsyncIterator[str]:
        ...

    def supports_tools(self, model: str) -> bool:
        return any(m.id == model and m.supports_tools for m in self.list_models())

    def supports_vision(self, model: str) -> bool:
        return any(m.id == model and m.supports_vision for m in self.list_models())

    def supports_reasoning_levels(self, model: str) -> bool:
        return any(m.id == model and m.supports_reasoning_levels for m in self.list_models())

    def get_usage(self, result: LLMResult) -> LLMUsage:
        return result.usage
