"""개인화(내 서랍·읽은 기록·프로필) 저장 — PostgreSQL 상시 서버(lens-cms-api) 경유 클라이언트.

저장만 lens-cms-api 에 위임하며, 비즈니스 로직은 repositories/personal_repository.py 와
services/user 에 둔다. `article_id` 는 news `articles` 테이블을 가리킨다(cms-posts publications 아님).
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

# 이 모듈의 호출 Lambda 가 쓰는 실행 역할(sedaily-mbti-lambda-execution-dev)은 다른 프로젝트와
# 공유되므로 SSM 권한을 추가하지 않고, 토큰을 환경변수로 직접 주입한다.
_TOKEN = os.environ.get("LENS_CMS_API_TOKEN", "")


def _request(method: str, path: str, body: Optional[dict] = None, query: Optional[dict] = None) -> Any:
    url = f"{_API_URL}{path}"
    if query:
        qs = "&".join(f"{k}={urllib.parse.quote(str(v))}" for k, v in query.items() if v is not None)
        if qs:
            url = f"{url}?{qs}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Content-Type": "application/json",
            "X-Internal-Token": _TOKEN,
        },
        method=method,
    )
    with urllib.request.urlopen(req, timeout=_TIMEOUT_SECONDS) as res:
        return json.loads(res.read())


def save_archived_sentence(user_id: str, text: str, article_no: Optional[str] = None) -> Dict[str, Any]:
    resp = _request("POST", "/internal/personal/archives", body={
        "user_id": user_id, "text": text, "article_no": article_no,
    })
    return resp["archive"]


def delete_archived_sentence(user_id: str, archive_id: str) -> bool:
    try:
        resp = _request("DELETE", f"/internal/personal/archives/{archive_id}", query={"user_id": user_id})
    except urllib.error.HTTPError:
        return False
    return bool(resp.get("ok"))


def list_archived_sentences(user_id: str, date_from: Optional[str] = None,
                             date_to: Optional[str] = None, limit: int = 100) -> List[Dict[str, Any]]:
    resp = _request("GET", "/internal/personal/archives", query={
        "user_id": user_id, "date_from": date_from, "date_to": date_to, "limit": limit,
    })
    return resp.get("archives", [])


def list_popular_archived_sentences(limit: int = 20) -> List[Dict[str, Any]]:
    resp = _request("GET", "/internal/personal/archives/popular")
    return resp.get("archives", [])[:limit]


def get_user_profile(user_id: str) -> Optional[Dict[str, Any]]:
    try:
        resp = _request("GET", f"/internal/personal/users/{user_id}")
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise
    return resp.get("user")


def get_or_create_user(user_id: str, email: Optional[str] = None,
                        name: Optional[str] = None, picture: Optional[str] = None) -> Dict[str, Any]:
    resp = _request("POST", f"/internal/personal/users/{user_id}", body={
        "email": email, "name": name, "picture": picture,
    })
    return resp["user"]


def update_user_profile(user_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    try:
        resp = _request("PUT", f"/internal/personal/users/{user_id}", body=updates)
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise
    return resp.get("user")


def save_reading_record(user_id: str, article_no: Optional[str] = None) -> Dict[str, Any]:
    resp = _request("POST", "/internal/personal/readings", body={
        "user_id": user_id, "article_no": article_no,
    })
    return resp["reading"]


def list_reading_history(user_id: str, limit: int = 50) -> List[Dict[str, Any]]:
    resp = _request("GET", "/internal/personal/readings", query={"user_id": user_id, "limit": limit})
    return resp.get("readings", [])
