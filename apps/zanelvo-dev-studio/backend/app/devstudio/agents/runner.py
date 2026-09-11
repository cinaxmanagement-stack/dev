"""Shared LLM-call plumbing for every role agent: primary -> fallback, AgentRun + LLMInvocation
bookkeeping, and best-effort JSON parsing for structured steps. This is the one place agent code
touches ModelRegistry/AgentConfiguration, so role modules stay short and declarative.
"""
from __future__ import annotations

import json
import re
import time
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from ...db import get_db
from ..models import AgentConfiguration, AgentRole
from ..providers.base import LLMResult, ProviderNotConfigured, ProviderNotImplemented
from ..providers.registry import ModelRegistry
from ..services import activity_service, provider_health, usage_tracker


class AgentStepFailed(Exception):
    def __init__(self, message: str, classification: str = "error"):
        super().__init__(message)
        self.classification = classification  # "requires_credentials" | "not_implemented" | "error"


_JSON_FENCE = re.compile(r"```(?:json)?\s*(\{.*\}|\[.*\])\s*```", re.DOTALL)


def extract_json(raw: str) -> Any:
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass
    m = _JSON_FENCE.search(raw)
    if m:
        try:
            return json.loads(m.group(1))
        except json.JSONDecodeError:
            pass
    first, last = raw.find("{"), raw.rfind("}")
    if first != -1 and last > first:
        try:
            return json.loads(raw[first:last + 1])
        except json.JSONDecodeError:
            pass
    first, last = raw.find("["), raw.rfind("]")
    if first != -1 and last > first:
        try:
            return json.loads(raw[first:last + 1])
        except json.JSONDecodeError:
            pass
    raise AgentStepFailed("Model did not return parseable JSON")


async def _start_run(task_id: str, role: AgentRole, provider: str, model: str, action: str,
                      plan_item_id: Optional[str] = None) -> str:
    doc = {"task_id": task_id, "plan_item_id": plan_item_id, "role": role, "attempt": 1,
            "provider": provider, "model": model, "status": "running", "action": action,
            "started_at": datetime.now(timezone.utc).isoformat(),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()}
    res = await get_db().ds_agent_runs.insert_one(doc)
    await activity_service.emit(task_id, "agent_started",
                                  {"role": role, "provider": provider, "model": model, "action": action})
    return str(res.inserted_id)


async def _finish_run(run_id: str, task_id: str, role: AgentRole, status: str, summary: str,
                       duration_ms: int) -> None:
    await get_db().ds_agent_runs.update_one({"_id": __oid(run_id)}, {"$set": {
        "status": status, "result_summary": summary[:500], "duration_ms": duration_ms,
        "finished_at": datetime.now(timezone.utc).isoformat(),
    }})
    await activity_service.emit(task_id, "agent_finished",
                                  {"role": role, "status": status, "summary": summary[:300]})


def __oid(id_str: str):
    from bson import ObjectId
    return ObjectId(id_str)


async def call_structured(registry: ModelRegistry, config: AgentConfiguration, task_id: str,
                           role: AgentRole, system: str, prompt: str, action: str,
                           plan_item_id: Optional[str] = None,
                           max_tokens: int = 4096,
                           images_b64: Optional[list] = None) -> Dict[str, Any]:
    """Runs the primary model; on ANY failure (including not-configured), falls back once if
    automatic_fallback is set. Every attempt is logged; the final failure raises AgentStepFailed
    with a classification the Supervisor / capability report can use.

    If `images_b64` is supplied (task attachments flagged for vision) the call is sent as a
    vision request to any attempt whose model supports vision; models that don't get the normal
    text-only structured call, so a non-vision fallback still runs rather than hard-failing."""
    attempts = [(config.primary_provider, config.primary_model)]
    if config.automatic_fallback and config.fallback_provider and config.fallback_model:
        attempts.append((config.fallback_provider, config.fallback_model))

    last_err: Optional[Exception] = None
    classification = "error"
    for provider_name, model in attempts:
        run_id = await _start_run(task_id, role, provider_name, model, action, plan_item_id)
        t0 = time.monotonic()
        try:
            provider = registry.get(provider_name)
            if images_b64 and provider.supports_vision(model):
                strict = (system + "\n\nRespond with ONLY a single valid JSON object/array. No "
                          "prose, no markdown code fences.")
                result: LLMResult = await provider.generate_with_vision(
                    system=strict, prompt=prompt, model=model, images_b64=images_b64,
                    max_tokens=max_tokens)
                kind = "generate_with_vision"
                await activity_service.emit(task_id, "vision_used",
                                            {"role": role, "provider": provider_name,
                                             "model": model, "image_count": len(images_b64)})
            else:
                result = await provider.generate_structured(
                    system=system, prompt=prompt, model=model, max_tokens=max_tokens)
                kind = "generate_structured"
            duration_ms = int((time.monotonic() - t0) * 1000)
            await usage_tracker.record_invocation(task_id, role, result, agent_run_id=run_id,
                                                    kind=kind)
            await provider_health.record(provider_name, "ok")
            parsed = extract_json(result.text)
            await _finish_run(run_id, task_id, role, "succeeded", "ok", duration_ms)
            return parsed
        except ProviderNotConfigured as e:
            classification = "requires_credentials"
            last_err = e
            await provider_health.record_exception(provider_name, e)
            await _finish_run(run_id, task_id, role, "failed", str(e), int((time.monotonic() - t0) * 1000))
        except ProviderNotImplemented as e:
            classification = "not_implemented"
            last_err = e
            await _finish_run(run_id, task_id, role, "failed", str(e), int((time.monotonic() - t0) * 1000))
        except Exception as e:  # noqa: BLE001
            classification = "error"
            last_err = e
            await provider_health.record_exception(provider_name, e)
            await _finish_run(run_id, task_id, role, "failed", f"{type(e).__name__}: {e}",
                                int((time.monotonic() - t0) * 1000))
    raise AgentStepFailed(f"{role} step '{action}' failed on all configured models: {last_err}",
                           classification=classification)
