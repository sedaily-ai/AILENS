"""이미지 업로드용 presigned PUT 발급 (CMS spec §5.3).

브라우저가 S3 로 직접 올린다 — Lambda 를 경유하면 API Gateway 페이로드 한계(6MB)에
이미지 한 장에 막힌다.

버킷은 media/ prefix 만 public read 이고 CORS 는 admin 도메인만 PUT 을 허용한다.
"""
from __future__ import annotations

import io
import logging
import os
import re
import time
import uuid
import zipfile

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


_ZIP_MAX_FILES = 24
_ZIP_PREFIX = "media/webtoon-lab/"  # 이 폴더의 파일만 묶는다(임의 키를 서버가 읽지 않도록)


def handle_zip_download(body: dict, path_params: dict, query_params: dict) -> dict:
    """여러 컷 이미지를 컷 순서대로 이름 붙여 zip 하나로 묶어 내려받게 한다(2026-10-02, CMS "전체 다운로드").

    body = {"items": [{"url": 미디어 URL, "name": "컷1.png"}, ...], "zip_name": "웹툰_테스트1.zip"} — items 순서가 zip 안 순서다.
    브라우저가 버킷에서 직접 못 읽어서(CORS) 서버가 묶어 presigned URL로 돌려준다."""
    items = (body or {}).get("items") or []
    if not isinstance(items, list) or not items:
        return response.err("items가 필요합니다", 400)
    if len(items) > _ZIP_MAX_FILES:
        return response.err(f"한 번에 {_ZIP_MAX_FILES}장까지만 묶을 수 있습니다", 400)
    bucket = _bucket()
    if not bucket:
        return response.err("CMS_MEDIA_BUCKET not configured", 500)

    base = f"https://{bucket}.s3.us-east-1.amazonaws.com/"
    s3 = _s3()
    buf = io.BytesIO()
    used: set[str] = set()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_STORED) as zf:  # 이미지는 이미 압축돼 있어 저장만 한다
        for it in items:
            url = (it.get("url") or "").strip() if isinstance(it, dict) else ""
            if not url.startswith(base) or not url[len(base):].startswith(_ZIP_PREFIX) or ".." in url:
                return response.err("허용되지 않는 url", 400)
            name = re.sub(r'[\\/:*?"<>|\r\n]', "", str(it.get("name") or "").strip()) or url.rsplit("/", 1)[-1]
            if name in used:  # 같은 이름이면 번호를 붙인다
                stem, dot, ext = name.rpartition(".")
                name = f"{stem or name}_{len(used)}{dot}{ext}" if dot else f"{name}_{len(used)}"
            used.add(name)
            try:
                data = s3.get_object(Bucket=bucket, Key=url[len(base):])["Body"].read()
            except Exception:  # noqa: BLE001
                return response.err(f"이미지를 읽을 수 없습니다: {name}", 404)
            zf.writestr(name, data)

    key = f"{_ZIP_PREFIX}zips/{uuid.uuid4().hex}.zip"
    s3.put_object(Bucket=bucket, Key=key, Body=buf.getvalue(), ContentType="application/zip")
    zip_name = re.sub(r'[\\/:*?"<>|\r\n]', "", str((body or {}).get("zip_name") or "webtoon.zip")) or "webtoon.zip"
    if not zip_name.lower().endswith(".zip"):
        zip_name += ".zip"
    from urllib.parse import quote

    download_url = s3.generate_presigned_url(
        "get_object",
        Params={
            "Bucket": bucket,
            "Key": key,
            "ResponseContentDisposition": f"attachment; filename=\"webtoon.zip\"; filename*=UTF-8''{quote(zip_name)}",
        },
        ExpiresIn=_DOWNLOAD_EXPIRES,
    )
    audit.log("media-zip-download", {"files": len(items), "key": key})
    return response.ok({"download_url": download_url, "expires_in": _DOWNLOAD_EXPIRES, "files": len(items)})
