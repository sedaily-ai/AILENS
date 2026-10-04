"""커뮤니티 게시판 — PostgreSQL 상시 서버(lens-cms-api) 경유 (v1.26).

articles_pg_client.py(v1.25)/personal_pg_client.py(v1.24)와 같은 패턴 —
목록/댓글 조회는 공개(원본 DynamoDB 핸들러도 GET은 무인증이었다), 글쓰기/
투표/댓글 작성은 내부 토큰으로 보호.

⚠️ `sedaily-mbti-post-dev`도 `sedaily-mbti-lambda-execution-dev`(AI LENS
밖 다른 프로젝트와 공유하는 광범위 실행 역할)를 쓴다 — personal_pg_client.py/
articles_pg_client.py와 동일 이유로 SSM 미경유, 평문 환경변수
(LENS_CMS_API_TOKEN)로 토큰을 직접 주입한다.
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, List, Optional
from config.constants import LENS_CMS_API_DEFAULT_URL

_API_URL = os.environ.get("LENS_CMS_API_URL", LENS_CMS_API_DEFAULT_URL)
_TIMEOUT_SECONDS = 8
_TOKEN = os.environ.get("LENS_CMS_API_TOKEN", "")


def _get(path: str, query: Optional[dict] = None) -> Any:
    url = f"{_API_URL}{path}"
    if query:
        qs = "&".join(f"{k}={urllib.parse.quote(str(v))}" for k, v in query.items() if v is not None)
        if qs:
            url = f"{url}?{qs}"
    req = urllib.request.Request(url, method="GET")
    with urllib.request.urlopen(req, timeout=_TIMEOUT_SECONDS) as res:
        return json.loads(res.read())


def _internal(method: str, path: str, body: Optional[dict] = None) -> Any:
    url = f"{_API_URL}{path}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        url, data=data,
        headers={"Content-Type": "application/json", "X-Internal-Token": _TOKEN},
        method=method,
    )
    with urllib.request.urlopen(req, timeout=_TIMEOUT_SECONDS) as res:
        return json.loads(res.read())


def create_post(user_id: str, user_name: Optional[str], user_avatar: Optional[str],
                 archived_sentence: str, user_comment: Optional[str],
                 article_id: Optional[str], tags: Optional[List[str]]) -> Dict[str, Any]:
    resp = _internal("POST", "/internal/community/posts", body={
        "user_id": user_id, "user_name": user_name, "user_avatar": user_avatar,
        "archived_sentence": archived_sentence, "user_comment": user_comment,
        "article_id": article_id, "tags": tags,
    })
    return resp["post"]


def list_posts(date_str: str, limit: int = 30, tag: Optional[str] = None) -> List[Dict[str, Any]]:
    resp = _get("/api/v2/community/posts", query={"date": date_str, "limit": limit, "tag": tag})
    return resp.get("posts", [])


def vote_post(post_id: int, user_id: str, vote_type: str) -> Optional[int]:
    try:
        resp = _internal("POST", f"/internal/community/posts/{post_id}/vote", body={
            "user_id": user_id, "vote_type": vote_type,
        })
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise
    return resp.get("delta")


def add_comment(post_id: int, user_id: str, user_name: Optional[str],
                 user_avatar: Optional[str], text: str) -> Optional[Dict[str, Any]]:
    try:
        resp = _internal("POST", f"/internal/community/posts/{post_id}/comments", body={
            "user_id": user_id, "user_name": user_name, "user_avatar": user_avatar, "text": text,
        })
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise
    return resp.get("comment")


def list_comments(post_id: int, limit: int = 50) -> List[Dict[str, Any]]:
    resp = _get(f"/api/v2/community/posts/{post_id}/comments", query={"limit": limit})
    return resp.get("comments", [])
