"""UploadService — task/project attachments. Images are exposed to vision-capable agents on
request only (never auto-injected into every context, per spec).

Blobs live in Emergent object storage (deployed pods have an ephemeral filesystem), not on local
disk. The Mongo `ds_uploads` record is the source of truth; `Upload.path` holds the canonical
storage path returned by the storage API.
"""
from __future__ import annotations

import base64
import uuid
from typing import List, Optional

from ...db import get_db
from ..models import Upload
from . import object_storage

_ALLOWED_TYPES = {
    "image/png": True, "image/jpeg": True, "image/webp": True,
    "application/pdf": False, "text/plain": False, "text/markdown": False,
    "application/json": False, "text/x-log": False, "text/csv": False,
}
_MAX_BYTES = 15 * 1024 * 1024


class UploadRejected(Exception):
    pass


async def save_upload(filename: str, content_type: str, data: bytes,
                       task_id: Optional[str] = None, project_id: Optional[str] = None) -> Upload:
    if content_type not in _ALLOWED_TYPES:
        raise UploadRejected(f"Content type not allowed: {content_type}")
    if len(data) > _MAX_BYTES:
        raise UploadRejected(f"File too large ({len(data)} bytes, max {_MAX_BYTES})")
    import os.path

    safe_name = f"{uuid.uuid4().hex}-{os.path.basename(filename)}"
    storage_path = object_storage.object_path(safe_name)
    result = await object_storage.put_object(storage_path, data, content_type)
    up = Upload(task_id=task_id, project_id=project_id, filename=filename, content_type=content_type,
                size_bytes=len(data), path=result.get("path", storage_path),
                is_image=_ALLOWED_TYPES[content_type])
    res = await get_db().ds_uploads.insert_one(up.to_mongo())
    up.id = str(res.inserted_id)
    return up


async def read_upload_bytes(upload: Upload) -> bytes:
    """Fetch an upload's raw bytes from object storage (used to serve downloads and to base64-encode
    images for vision-capable agents on request)."""
    data, _ = await object_storage.get_object(upload.path)
    return data


async def read_upload_image_b64(upload: Upload) -> str:
    """Base64-encode an image upload for a provider's generate_with_vision(images_b64=...)."""
    return base64.b64encode(await read_upload_bytes(upload)).decode()


async def list_uploads(task_id: str) -> List[Upload]:
    docs = get_db().ds_uploads.find({"task_id": task_id}).sort("created_at", -1)
    return [Upload.from_mongo(d) async for d in docs]


async def get_upload(upload_id: str) -> Optional[Upload]:
    from bson import ObjectId
    doc = await get_db().ds_uploads.find_one({"_id": ObjectId(upload_id)})
    return Upload.from_mongo(doc)
