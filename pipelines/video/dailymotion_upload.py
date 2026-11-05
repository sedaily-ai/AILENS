"""PRISM 데일리모션 자동 업로드(2026-11-05) — 사용자 요청: "데일리모션 자동업로드도 연결해야 하는데".

Dailymotion API v2를 urllib로 직접 부른다(youtube_upload.py와 같은 이유 — 이미지에 SDK를 더 넣지 않으려고).
1) POST /v2/files/upload_sessions → upload_url  2) upload_url에 multipart(file) POST → 파일 url
3) POST /v2/profiles/{profile_id}/videos {title, description, tags, visibility, is_for_kids, source.file_url}
문서: https://developers.dailymotion.com/v2/docs/upload-videos

로그인은 Studio에서 만든 비공개 API 키(client_credentials). 시크릿 ai-labs/prism-dailymotion (JSON):
{"api_key", "api_secret", "profile_id"(선택, 기본 x5gordq = Seoul Economic Daily 채널), "visibility"(선택, 기본 public)}
키 권한: 동영상 업로드·읽기·편집, 프로필 읽기(삭제 없음). /v2/me는 account:read가 없어 쓰지 않는다.
시크릿이 없거나 읽을 권한이 없으면 load_credentials()가 None — 일괄 제작은 데일리모션만 건너뛴다.
계정 한도(문서 rate-limiting): 일반 계정 하루 15편·10시간.
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

import boto3

SECRET_ID = os.environ.get("PRISM_DAILYMOTION_SECRET_ID", "ai-labs/prism-dailymotion")
_DEFAULT_PROFILE_ID = "x5gordq"  # https://www.dailymotion.com/SeoulEconomicDaily (2026-11-05 공개 API로 확인)
_TOKEN_URL = "https://oauth2.dailymotion.com/v2/token"
_API = "https://api.dailymotion.com/v2"
_SCOPE = "video.manage"
_TITLE_MAX = 255
_DESCRIPTION_MAX = 3000
_UA = "ailens-prism-uploader"


def load_credentials() -> dict | None:
    try:
        raw = boto3.client("secretsmanager", region_name="us-east-1").get_secret_value(SecretId=SECRET_ID)["SecretString"]
        creds = json.loads(raw)
    except Exception as e:  # noqa: BLE001 — 시크릿이 없거나 권한이 없으면 업로드만 건너뛴다
        print(f"[dailymotion] 연결 정보 없음 — 업로드 건너뜀({type(e).__name__})")
        return None
    if not (creds.get("api_key") and creds.get("api_secret")):
        print("[dailymotion] 연결 정보가 비어 있음 — 업로드 건너뜀")
        return None
    return creds


def _request(url: str, *, data: bytes | None = None, headers: dict | None = None, method: str = "GET",
             timeout: int = 60) -> dict:
    req = urllib.request.Request(url, data=data, method=method, headers={"User-Agent": _UA, **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            body = res.read()
            return json.loads(body) if body else {}
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"Dailymotion {e.code} {url.split('?')[0]}: {e.read().decode('utf-8', 'replace')[:500]}") from e


def _access_token(creds: dict) -> str:
    data = urllib.parse.urlencode({
        "grant_type": "client_credentials", "client_id": creds["api_key"],
        "client_secret": creds["api_secret"], "scope": _SCOPE,
    }).encode()
    return _request(_TOKEN_URL, data=data, method="POST", timeout=30)["access_token"]


def _send_file(upload_url: str, mp4_path: Path) -> str:
    """upload_url에 multipart/form-data(필드 file)로 올리고 파일 url을 돌려준다."""
    boundary = uuid.uuid4().hex
    head = (f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{mp4_path.name}\"\r\n"
            "Content-Type: video/mp4\r\n\r\n").encode()
    body = head + mp4_path.read_bytes() + f"\r\n--{boundary}--\r\n".encode()
    res = _request(upload_url, data=body, method="POST", timeout=900,
                   headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
    if not res.get("url"):
        raise RuntimeError(f"Dailymotion 파일 업로드 응답에 url 없음: {json.dumps(res)[:300]}")
    return res["url"]


def upload(mp4_path: Path, meta: dict, creds: dict) -> dict:
    """mp4를 올려 채널에 영상을 만든다 → {"video_id", "url"}. meta는 youtube_upload.metadata_from_script()와 같은 모양.
    실패하면 예외(HTTP 응답 본문 포함)."""
    token = _access_token(creds)
    auth = {"Authorization": f"Bearer {token}"}
    session = _request(f"{_API}/files/upload_sessions", method="POST", headers=auth)
    file_url = _send_file(session["upload_url"], mp4_path)
    profile_id = creds.get("profile_id") or _DEFAULT_PROFILE_ID
    body = {
        "title": meta["title"][:_TITLE_MAX],
        "description": (meta.get("description") or "")[:_DESCRIPTION_MAX],
        "tags": meta.get("tags") or [],
        "visibility": creds.get("visibility") or "public",
        "is_for_kids": False,
        "language": "en",
        "source": {"file_url": file_url},
    }
    video = _request(f"{_API}/profiles/{profile_id}/videos", method="POST", data=json.dumps(body).encode(),
                     headers={**auth, "Content-Type": "application/json", "Accept": "application/json"})
    video_id = video["video_id"]
    return {"video_id": video_id, "url": video.get("video_url") or f"https://www.dailymotion.com/video/{video_id}"}
