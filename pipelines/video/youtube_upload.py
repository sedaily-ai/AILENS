"""PRISM 유튜브 자동 업로드(2026-10-22) — 사용자 요청: "유튜브에 자동으로 올라가게 해주라".

YouTube Data API v3 videos.insert(재개 가능 업로드)를 urllib로 직접 부른다(이미지에 구글 SDK를 더 넣지 않으려고).
채널 권한은 채널 관리자가 한 번 동의해 받은 refresh token으로 매번 access token을 새로 받는다
(pipelines/scripts/prism_youtube_auth.py로 발급 → Secrets Manager에 저장).

시크릿 ai-labs/prism-youtube (JSON): {"client_id", "client_secret", "refresh_token", "privacy_status"(기본 public)}
시크릿이 없거나 읽을 권한이 없으면 load_credentials()가 None — 일괄 제작은 업로드만 건너뛰고 영상까지 만든다.

구글 API 심사(앱 인증)를 받기 전에는 API로 올린 영상이 privacy_status와 상관없이 비공개로 잠긴다.
제목·설명·태그는 대본 작성 응답의 Block D(지침 v6.3 "Block D 작성 원칙")에서 읽는다.
"""
from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

import boto3

SECRET_ID = os.environ.get("PRISM_YOUTUBE_SECRET_ID", "ai-labs/prism-youtube")
_TOKEN_URL = "https://oauth2.googleapis.com/token"
_UPLOAD_URL = "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status"
_NEWS_CATEGORY_ID = "25"  # News & Politics
_TITLE_MAX = 100  # YouTube 제목 상한
_DESCRIPTION_MAX = 4900  # 상한 5,000바이트 — 영어 위주라 글자 수로 여유를 둔다
_TAGS_MAX_CHARS = 450  # 태그 합계 상한 500자


def load_credentials() -> dict | None:
    try:
        raw = boto3.client("secretsmanager", region_name="us-east-1").get_secret_value(SecretId=SECRET_ID)["SecretString"]
        creds = json.loads(raw)
    except Exception as e:  # noqa: BLE001 — 시크릿이 아직 없으면(채널 연결 전) 업로드만 건너뛴다
        print(f"[youtube] 연결 정보 없음 — 업로드 건너뜀({type(e).__name__})")
        return None
    if not all(creds.get(k) for k in ("client_id", "client_secret", "refresh_token")):
        print("[youtube] 연결 정보가 비어 있음 — 업로드 건너뜀")
        return None
    return creds


def _section(text: str, label: str, next_labels: tuple[str, ...]) -> str:
    """Block D에서 "label:" 다음부터 다음 라벨 전까지."""
    m = re.search(rf"^{re.escape(label)}:\s*\n(.*?)(?=^(?:{'|'.join(map(re.escape, next_labels))}):|\Z)", text, re.S | re.M)
    return m.group(1).strip().strip("`").strip() if m else ""


def metadata_from_script(script_text: str, fallback_title: str) -> dict:
    """대본 작성 응답 → 유튜브 제목·설명·태그. <, >는 유튜브가 거부하므로 지운다."""
    block = script_text[script_text.find("Block D"):] if "Block D" in script_text else script_text
    labels = ("Episode Title", "Episode Description", "Sources", "About AI PRISM", "Tags", "Publish Date (KST)")
    title = _section(block, "Episode Title", labels[1:]).splitlines()[0:1]
    title = (title[0] if title else fallback_title).replace("<", "").replace(">", "").strip()[:_TITLE_MAX]
    description_parts = [
        _section(block, "Episode Description", labels[2:]),
        ("Sources:\n" + _section(block, "Sources", labels[3:])) if _section(block, "Sources", labels[3:]) else "",
        _section(block, "About AI PRISM", labels[4:]),
    ]
    description = "\n\n".join(p for p in description_parts if p).replace("<", "").replace(">", "")[:_DESCRIPTION_MAX]
    tags: list[str] = []
    for word in _section(block, "Tags", labels[5:]).split():
        tag = word.lstrip("#").strip(",")
        if tag and sum(len(t) + 1 for t in tags) + len(tag) <= _TAGS_MAX_CHARS:
            tags.append(tag)
    return {"title": title or fallback_title[:_TITLE_MAX], "description": description, "tags": tags}


def _access_token(creds: dict) -> str:
    data = urllib.parse.urlencode({
        "client_id": creds["client_id"], "client_secret": creds["client_secret"],
        "refresh_token": creds["refresh_token"], "grant_type": "refresh_token",
    }).encode()
    with urllib.request.urlopen(urllib.request.Request(_TOKEN_URL, data=data, method="POST"), timeout=30) as res:
        return json.loads(res.read())["access_token"]


def upload(mp4_path: Path, meta: dict, creds: dict) -> str:
    """mp4를 올리고 영상 ID를 돌려준다. 실패하면 예외(HTTP 응답 본문 포함)."""
    token = _access_token(creds)
    body = {
        "snippet": {
            "title": meta["title"], "description": meta["description"], "tags": meta["tags"],
            "categoryId": _NEWS_CATEGORY_ID, "defaultLanguage": "en", "defaultAudioLanguage": "en",
        },
        "status": {"privacyStatus": creds.get("privacy_status") or "public", "selfDeclaredMadeForKids": False},
    }
    size = mp4_path.stat().st_size
    init = urllib.request.Request(
        _UPLOAD_URL, data=json.dumps(body).encode(), method="POST",
        headers={
            "Authorization": f"Bearer {token}", "Content-Type": "application/json; charset=UTF-8",
            "X-Upload-Content-Type": "video/mp4", "X-Upload-Content-Length": str(size),
        },
    )
    try:
        with urllib.request.urlopen(init, timeout=60) as res:
            session_url = res.headers["Location"]
        with mp4_path.open("rb") as f:
            put = urllib.request.Request(
                session_url, data=f.read(), method="PUT",
                headers={"Authorization": f"Bearer {token}", "Content-Type": "video/mp4", "Content-Length": str(size)},
            )
        with urllib.request.urlopen(put, timeout=600) as res:
            return json.loads(res.read())["id"]
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"YouTube {e.code}: {e.read().decode('utf-8', 'replace')[:500]}") from e
