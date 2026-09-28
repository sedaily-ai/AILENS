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


# 2026-09-26 — "다운로드" 버튼이 실제로 다운로드를 안 하고 새 탭에 이미지만
# 열던 문제(사용자 리포트: "다운로드 버튼을 클릭하면 실제로 이미지가
# 다운로드가 되면 좋겠습니다") 원인: 이 버킷 CORS는 PUT만 허용해서(위
# handle_presign, 업로드 전용) 프론트가 fetch()로 blob을 못 읽고, HTML
# <a download> 속성도 크로스오리진 URL에서는 대부분 브라우저가 무시한다
# (같은 origin이거나 blob:/data: URL에만 적용됨) — 그래서 그냥 새 탭에서
# 이미지를 여는 걸로 조용히 실패하고 있었다.
#
# presigned GET URL 자체에 ResponseContentDisposition을 실어 보내면 S3가
# 응답 헤더에 그걸 그대로 얹어준다 — CORS·<a download> 둘 다 필요 없이,
# 브라우저가 그 URL로 이동하는 순간 서버(S3)가 다운로드를 강제한다.
_DOWNLOAD_EXPIRES = 60


def handle_download_url(body: dict, path_params: dict, query_params: dict) -> dict:
    url = ((query_params or {}).get("url") or "").strip()
    filename = ((query_params or {}).get("filename") or "download").strip()

    bucket = _bucket()
    if not bucket:
        return response.err("CMS_MEDIA_BUCKET not configured", 500)

    prefix = f"https://{bucket}.s3.us-east-1.amazonaws.com/"
    if not url.startswith(prefix):
        return response.err("url must be a CMS media URL", 400)
    key = url[len(prefix):]

    # _safe_name()은 저장용 키를 만드는 함수(uuid 접두사를 붙임)라 여기
    # 그대로 쓰면 사용자가 받는 파일명이 "a1b2c3d4-cut-1.png"처럼 지저분해
    # 진다 — 다운로드 파일명은 그냥 헤더 인젝션만 막으면 된다(따옴표·
    # 줄바꿈 제거).
    safe_filename = filename.replace('"', "").replace("\n", "").replace("\r", "") or "download"
    download_url = _s3().generate_presigned_url(
        "get_object",
        Params={
            "Bucket": bucket,
            "Key": key,
            "ResponseContentDisposition": f'attachment; filename="{safe_filename}"',
        },
        ExpiresIn=_DOWNLOAD_EXPIRES,
    )
    return response.ok({"download_url": download_url, "expires_in": _DOWNLOAD_EXPIRES})
