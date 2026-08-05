"""이미지 업로드용 presigned PUT 발급 (CMS spec §5.3).

브라우저가 S3 로 직접 올린다 — Lambda 를 경유하면 API Gateway 페이로드 한계(6MB)에
이미지 한 장에 막힌다.

버킷은 media/ prefix 만 public read 이고 CORS 는 admin 도메인만 PUT 을 허용한다.
"""
from __future__ import annotations

import logging
import os
import re
import time
import uuid

import boto3

from shared import audit, response

logger = logging.getLogger(__name__)

_ALLOWED_IMAGE = {"image/jpeg", "image/png", "image/webp", "image/gif"}
_ALLOWED_AUDIO = {"audio/mpeg", "audio/mp4", "audio/wav", "audio/x-wav"}
_ALLOWED = _ALLOWED_IMAGE | _ALLOWED_AUDIO
_MAX_BYTES_IMAGE = 10 * 1024 * 1024
_MAX_BYTES_AUDIO = 60 * 1024 * 1024  # 팟캐스트 mp3 — 128kbps 기준 약 1시간 분량까지
_EXPIRES = 300
_SAFE = re.compile(r"[^a-z0-9.]+")

_client = None


def _s3():
    global _client
    if _client is None:
        _client = boto3.client("s3", region_name="us-east-1")
    return _client


def _bucket() -> str:
    return os.environ.get("CMS_MEDIA_BUCKET", "")


def _safe_name(filename: str) -> str:
    """소문자 ASCII 파일명 + uuid 접두사.

    한글 파일명은 ASCII 로 남는 글자가 없어 확장자만 남는다. 그때는 stem 을 'img'
    로 대체해 ``<uuid>-img.png`` 형태를 만든다 — ``<uuid>-.png`` 같은 이름을 피한다.
    """
    name = (filename or "").lower()
    dot = name.rfind(".")
    stem, ext = (name[:dot], name[dot + 1:]) if dot > 0 else (name, "")

    stem = _SAFE.sub("-", stem).strip("-.")
    ext = _SAFE.sub("", ext)

    if not stem:
        stem = "img"
    return f"{uuid.uuid4().hex[:12]}-{stem[-60:]}" + (f".{ext}" if ext else "")


def handle_presign(body: dict, path_params: dict, query_params: dict) -> dict:
    filename = ((body or {}).get("filename") or "").strip()
    content_type = ((body or {}).get("content_type") or "").strip()
    size = (body or {}).get("size") or 0

    if not filename:
        return response.err("filename is required", 400)
    if content_type not in _ALLOWED:
        return response.err(
            f"unsupported content_type: {content_type} (image/* or audio/* only)", 400
        )
    is_audio = content_type in _ALLOWED_AUDIO
    max_bytes = _MAX_BYTES_AUDIO if is_audio else _MAX_BYTES_IMAGE
    try:
        size = int(size)
    except (TypeError, ValueError):
        return response.err("size must be a number", 400)
    if size <= 0 or size > max_bytes:
        return response.err(f"size must be 1..{max_bytes} bytes", 400)

    bucket = _bucket()
    if not bucket:
        return response.err("CMS_MEDIA_BUCKET not configured", 500)

    prefix = "media/podcast" if is_audio else "media"
    key = f"{prefix}/{time.strftime('%Y/%m')}/{_safe_name(filename)}"
    upload_url = _s3().generate_presigned_url(
        "put_object",
        Params={"Bucket": bucket, "Key": key, "ContentType": content_type},
        ExpiresIn=_EXPIRES,
    )
    logger.info(f"presign issued: {key}")
    audit.log("media-presign", {"key": key, "content_type": content_type})
    return response.ok({
        "upload_url": upload_url,
        "public_url": f"https://{bucket}.s3.us-east-1.amazonaws.com/{key}",
        "key": key,
        "expires_in": _EXPIRES,
    })
