"""ProviderHealth — records the last-observed runtime status of each LLM provider from REAL calls
(never a fabricated/estimated state). Powers the Universal Key balance banner: an emergent call that
fails with INSUFFICIENT_CREDIT or an auth error is recorded here and surfaced to the founder as a
clear banner instead of a generic provider error. A successful call clears it back to "ok".
"""
from __future__ import annotations

from typing import Optional

from ...db import get_db, utc_now_iso

# Statuses the UI treats as a blocking banner (vs. a transient "error" it ignores).
BANNER_STATUSES = {"insufficient_credit", "auth_error"}


def classify_exception(exc: Exception) -> tuple[str, str]:
    """Map an exception raised by a provider call onto a health status + short, secret-safe detail."""
    from ..providers.base import ProviderError, ProviderNotConfigured

    if isinstance(exc, ProviderError) and exc.code == "INSUFFICIENT_CREDIT":
        return "insufficient_credit", str(exc)
    if isinstance(exc, ProviderNotConfigured):
        return "auth_error", str(exc)
    return "error", f"{type(exc).__name__}"


async def record(provider: str, status: str, detail: Optional[str] = None) -> None:
    await get_db().ds_provider_health.update_one(
        {"provider": provider},
        {"$set": {"provider": provider, "status": status, "detail": (detail or "")[:300],
                  "checked_at": utc_now_iso()}},
        upsert=True,
    )


async def record_exception(provider: str, exc: Exception) -> None:
    status, detail = classify_exception(exc)
    await record(provider, status, detail)


async def get(provider: str) -> Optional[dict]:
    doc = await get_db().ds_provider_health.find_one({"provider": provider})
    if not doc:
        return None
    return {"provider": doc["provider"], "status": doc.get("status"),
            "detail": doc.get("detail", ""), "checked_at": doc.get("checked_at")}
