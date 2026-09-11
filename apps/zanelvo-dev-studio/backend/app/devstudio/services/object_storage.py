"""Emergent object storage client for task/project uploads.

Deployed Emergent apps have an ephemeral pod filesystem, so uploads must live in Emergent's managed
object storage, not on local disk. This module is a thin, lazily-initialized wrapper over the
storage HTTP API (see the Emergent object-storage playbook). The Mongo `ds_uploads` record remains
the source of truth; `Upload.path` holds the canonical storage path returned by the API.

Credentials/config stay server-side (EMERGENT_LLM_KEY + INTEGRATION_PROXY_URL) — never exposed to
the client. Blocking `requests` calls are run in a worker thread so they don't stall the event loop.
"""
from __future__ import annotations

import asyncio
import os
from typing import Tuple

import requests

_APP_PREFIX = "zanelvo-dev-studio"
_storage_key: str | None = None


class StorageNotConfigured(Exception):
    pass


class StorageError(Exception):
    pass


def _base_url() -> str:
    base = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
    return base.rstrip("/") + "/objstore/api/v1/storage"


def _emergent_key() -> str:
    key = os.environ.get("EMERGENT_LLM_KEY") or os.environ.get("EMERGENT_UNIVERSAL_KEY")
    if not key:
        raise StorageNotConfigured(
            "Object storage needs EMERGENT_LLM_KEY (or EMERGENT_UNIVERSAL_KEY) set server-side."
        )
    return key


def _init_sync(force: bool = False) -> str:
    global _storage_key
    if _storage_key and not force:
        return _storage_key
    resp = requests.post(f"{_base_url()}/init", json={"emergent_key": _emergent_key()}, timeout=30)
    if resp.status_code != 200:
        raise StorageError(f"Storage init failed ({resp.status_code}).")
    _storage_key = resp.json()["storage_key"]
    return _storage_key


def _put_sync(path: str, data: bytes, content_type: str) -> dict:
    key = _init_sync()
    resp = requests.put(f"{_base_url()}/objects/{path}",
                        headers={"X-Storage-Key": key, "Content-Type": content_type},
                        data=data, timeout=120)
    if resp.status_code == 404:  # stale/inactive storage_key — remint once and retry
        key = _init_sync(force=True)
        resp = requests.put(f"{_base_url()}/objects/{path}",
                            headers={"X-Storage-Key": key, "Content-Type": content_type},
                            data=data, timeout=120)
    if resp.status_code not in (200, 201):
        raise StorageError(f"Storage upload failed ({resp.status_code}).")
    return resp.json()


def _get_sync(path: str) -> Tuple[bytes, str]:
    key = _init_sync()
    resp = requests.get(f"{_base_url()}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    if resp.status_code == 404:
        key = _init_sync(force=True)
        resp = requests.get(f"{_base_url()}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    if resp.status_code != 200:
        raise StorageError(f"Storage download failed ({resp.status_code}).")
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


def object_path(unique_name: str) -> str:
    """Canonical, app-prefixed, no-leading-slash storage path for an upload."""
    return f"{_APP_PREFIX}/uploads/{unique_name}"


async def put_object(path: str, data: bytes, content_type: str) -> dict:
    return await asyncio.to_thread(_put_sync, path, data, content_type)


async def get_object(path: str) -> Tuple[bytes, str]:
    return await asyncio.to_thread(_get_sync, path)
