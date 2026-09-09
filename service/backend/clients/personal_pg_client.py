"""개인화(내 서랍·읽은 기록·프로필) 저장 — PostgreSQL 상시 서버(lens-cms-api)
경유 (v1.24).

posts_repo.py(v1.21)/quiz_repo.py(v1.22)와 같은 패턴 — 저장만 lens-cms-api
로 위임하고, repositories/personal_repository.py의 비즈니스 로직(스트릭
계산 등은 services/user_service.py)은 그대로 둔다.

DynamoDB personal 테이블의 `article_id`는 실제로 news `articles` 테이블
(cms-posts publications가 아님)을 가리킨다 — v1.24 스키마 변경(article_no
exclusive-arc FK 추가) 참조.
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, List, Optional

from common.secrets import get_secret

_API_URL = os.environ.get("LENS_CMS_API_URL", "http://13.223.179.151")
_TOKEN_PARAM = os.environ.get("LENS_CMS_API_TOKEN_PARAM", "/sedaily-mbti/v2/lens-cms-api-token")
_TIMEOUT_SECONDS = 8


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
            "X-Internal-Token": get_secret(_TOKEN_PARAM),
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
