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
_THUMBNAIL_URL = "https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId={video_id}&uploadType=media"
_THUMBNAIL_MAX_BYTES = 2 * 1024 * 1024  # YouTube thumbnails.set 상한(2MB)
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


# ── v2 설명글(2026-11-18) — 영문 유튜브 v2(SEO·GEO 템플릿 적용 3편)와 같은 구성 ─────────────────────
# 요약 → (롱폼) 챕터 → 출처 → AI PRISM 소개·AI 제작 고지 → 한국어판·영문판 링크 → 해시태그 줄.
# 쇼츠는 챕터 대신 본편 링크. 제목·태그는 metadata_from_script 그대로(대본 Block D).
_EDITION_LINKS = "Korean edition: https://www.sedaily.com\nEnglish edition: https://en.sedaily.com"
_BRAND_TAG = "SeoulEconomicDaily"
_SKIP_HASHTAGS = {"aiprism", "seouleconomicdaily", "wanifra", "shorts"}
_CHAPTER_MIN_SEC = 10.0  # 유튜브 챕터 조건: 0:00 시작, 3개 이상, 각 10초 이상


def _mmss(sec: float) -> str:
    sec = int(sec)
    return f"{sec // 60}:{sec % 60:02d}"


def _cut_label(cut: dict, skip: set[str] | None = None) -> str:
    """챕터 이름 — 모건스탠리 편처럼 내용·숫자가 보이게. 숫자 컷은 "설명: 숫자", 그 밖은 화면 문구.
    날짜 컷·그룹 이름(skip)은 빈 문자열(챕터로 쓰지 않음)."""
    st = cut.get("style") or {}
    if st.get("scene") == "date":
        return ""
    cap = cut.get("caption")
    cap_text = cap if isinstance(cap, str) else " ".join(str(p.get("text", "")).strip() for p in (cap or []))
    k = st.get("kicker") if isinstance(st.get("kicker"), str) else ""
    if k and k.strip().lower() in (skip or set()):
        k = ""
    if cut.get("type") in ("stat", "donut", "compare") and cap_text:
        text = f"{k.strip()}: {cap_text}" if k else cap_text
    else:
        text = cap_text or k
    text = " ".join(text.replace("<", "").replace(">", "").split()).rstrip(".,:;")
    return text[:60]


def chapters_from_timing(script: dict, starts: list[float], total: float, max_chapters: int = 7) -> str:
    """컷 시작 시각으로 챕터 줄을 만든다. 조건(3개 이상, 각 10초 이상)을 못 맞추면 빈 문자열."""
    cuts = script.get("cuts", [])
    if not cuts or len(starts) != len(cuts) or total < _CHAPTER_MIN_SEC * 3:
        return ""
    target = max(_CHAPTER_MIN_SEC + 5, total / max_chapters)
    skip = {str(script.get(k, "")).strip().lower() for k in ("keyword", "brand")} - {""}
    marks: list[tuple[float, str]] = [(0.0, _cut_label(cuts[0], skip) or "Intro")]
    for i in range(1, len(cuts)):
        if cuts[i].get("type") == "closing":
            break
        t = starts[i]
        if t - marks[-1][0] >= target and total - t >= _CHAPTER_MIN_SEC:
            label = _cut_label(cuts[i], skip)
            if label and label.lower() != marks[-1][1].lower():
                marks.append((t, label))
    if len(marks) < 3:
        return ""
    return "\n".join(f"{_mmss(t)} {label}" for t, label in marks)


def _hashtag_line(tags: list[str], n: int = 4) -> str:
    picked = [t for t in tags if t.lower() not in _SKIP_HASHTAGS][:n]
    return " ".join(f"#{t}" for t in picked + [_BRAND_TAG])


_INVEST_NOTE = "This video is for information only and is not investment advice."


def v2_description(script_text: str, tags: list[str], *, chapters: str = "", full_video_url: str = "", shorts: bool = False,
                   investment: bool = False) -> str:
    """investment=True(주식·글로벌 투자자·개인투자자 그룹)면 투자 고지 한 줄을 넣는다(모건스탠리 편과 같음)."""
    block = script_text[script_text.find("Block D"):] if "Block D" in script_text else script_text
    labels = ("Episode Title", "Episode Description", "Sources", "About AI PRISM", "Tags", "Publish Date (KST)")
    sources = _section(block, "Sources", labels[3:])
    parts = [
        _section(block, "Episode Description", labels[2:]),
        f"Full video: {full_video_url}" if shorts and full_video_url else "",
        chapters if not shorts else "",
        ("Sources:\n" + sources) if sources else "",
        _section(block, "About AI PRISM", labels[4:]),
        _INVEST_NOTE if investment else "",
        _EDITION_LINKS,
        _hashtag_line(tags) + (f" {_SHORTS_TAG}" if shorts else ""),
    ]
    text = "\n\n".join(p for p in parts if p).replace("<", "").replace(">", "")
    if shorts:
        text = f"{_SHORTS_TAG}\n\n{text}"
    return text[:_DESCRIPTION_MAX]


_SHORTS_TAG = "#Shorts"


def shorts_metadata(meta: dict) -> dict:
    """가로 영상 메타를 쇼츠용으로 — 제목 끝과 설명 맨 앞에 #Shorts(유튜브가 세로 영상을 쇼츠로 분류하는 신호).
    제목은 상한 안에서 본문을 줄여 #Shorts가 잘리지 않게 한다. 원본 meta는 바꾸지 않는다."""
    suffix = f" {_SHORTS_TAG}"
    title = meta["title"][: _TITLE_MAX - len(suffix)].rstrip() + suffix
    description = f"{_SHORTS_TAG}\n\n{meta['description']}"[:_DESCRIPTION_MAX]
    return {**meta, "title": title, "description": description}


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


def set_thumbnail(video_id: str, thumb_path: Path, creds: dict) -> None:
    """영상에 썸네일 이미지를 단다(thumbnails.set, JPEG/PNG). 실패하면 예외(HTTP 응답 본문 포함).

    올린 영상은 그대로 두고 썸네일만 못 단 경우다 — 부르는 쪽(prism_batch)이 경고 로그·상태만 남기고
    영상 제작은 완료로 둔다(채널 권한 미인증·이미지 용량 초과 등으로 흔히 실패한다).
    '맞춤 썸네일' 권한이 없는 채널이면 403이 온다 — 그때는 유튜브가 영상 중간 프레임을 쓴다.
    """
    data = Path(thumb_path).read_bytes()
    if not data:
        raise RuntimeError(f"썸네일 파일이 비었습니다: {thumb_path}")
    if len(data) > _THUMBNAIL_MAX_BYTES:
        raise RuntimeError(f"썸네일이 2MB를 넘습니다({len(data)} bytes): {thumb_path}")
    content_type = "image/png" if Path(thumb_path).suffix.lower() == ".png" else "image/jpeg"
    token = _access_token(creds)
    req = urllib.request.Request(
        _THUMBNAIL_URL.format(video_id=urllib.parse.quote(video_id, safe="")), data=data, method="POST",
        headers={"Authorization": f"Bearer {token}", "Content-Type": content_type, "Content-Length": str(len(data))},
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as res:
            res.read()
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"YouTube 썸네일 {e.code}: {e.read().decode('utf-8', 'replace')[:500]}") from e
