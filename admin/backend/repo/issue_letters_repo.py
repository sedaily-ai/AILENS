"""이슈 레터(모아쓰기 레터) 관리 — lens-cms-api(PostgreSQL 상시 서버)의 /admin/issue-letters* 를 호출한다.

quiz_repo.py·posts_repo.py 와 같은 패턴(admin Lambda 는 RDS 에 직접 붙지 않는다). 규칙 검증(발행 규칙·중립 원칙·출처 연결)은 전부 서버가 한다.
이 모듈은 서버의 응답을 (상태 코드, 본문)으로 그대로 돌려줘서 라우트가 검증 실패 사유를 관리자 화면까지 전달할 수 있게 한다
(다른 repo 와 달리 4xx 를 예외로 삼키지 않는다 — 입력 오류 사유가 이 화면의 핵심 정보다).
설계: docs/architecture/lens-erd-src/17-이슈레터-설계.md
"""
from __future__ import annotations

import json
import logging
import os
import urllib.error
import urllib.parse
import urllib.request

from shared.ssm_client import get_secure

logger = logging.getLogger(__name__)

_API_URL = os.environ.get("LENS_CMS_API_URL", "http://13.223.179.151")
_TOKEN_PARAM = os.environ.get("LENS_CMS_API_TOKEN_PARAM", "/sedaily-mbti/admin/lens-cms-api-token")
_TIMEOUT_SECONDS = 15

# 지금 관리자는 공유 계정 하나(JWT sub="admin")라 개인을 구분할 수 없다. 개인 로그인이 생기면 이 값을 로그인한 사람으로 바꾼다(v1.39).
ACTOR = {"employee_no": "admin", "role": "admin"}


def _call(method: str, path: str, body: dict | None = None, query: dict | None = None) -> tuple[int, dict]:
    url = f"{_API_URL}{path}"
    if query:
        qs = "&".join(f"{k}={urllib.parse.quote(str(v))}" for k, v in query.items() if v is not None)
        if qs:
            url = f"{url}?{qs}"
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Content-Type": "application/json", "X-Internal-Token": get_secure(_TOKEN_PARAM)},
        method=method,
    )
    try:
        with urllib.request.urlopen(req, timeout=_TIMEOUT_SECONDS) as res:
            return res.status, json.loads(res.read() or b"{}")
    except urllib.error.HTTPError as e:
        raw = e.read().decode(errors="replace")
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            payload = {"detail": raw[:300]}
        if e.code >= 500:
            logger.error("lens-cms-api %s %s -> %s: %s", method, path, e.code, raw[:500])
        return e.code, payload


def save_archives(articles: list) -> tuple[int, dict]:
    """빅카인즈 검색 결과에서 고른 서울경제 기사를 보관한다(레터 출처 후보). 보관된 기사만 레터 출처가 될 수 있다."""
    return _call("POST", "/admin/issue-letters/archives", body={"articles": articles})


def list_letters(status: str | None, limit: int) -> tuple[int, dict]:
    return _call("GET", "/admin/issue-letters", query={"status": status, "limit": limit})


def get_letter(letter_id: int) -> tuple[int, dict]:
    return _call("GET", f"/admin/issue-letters/{int(letter_id)}")


def create_letter(data: dict) -> tuple[int, dict]:
    return _call("POST", "/admin/issue-letters", body={"data": data, "actor": ACTOR})


def update_letter(letter_id: int, data: dict) -> tuple[int, dict]:
    return _call("PUT", f"/admin/issue-letters/{int(letter_id)}", body={"data": data, "actor": ACTOR})


def submit_letter(letter_id: int) -> tuple[int, dict]:
    return _call("POST", f"/admin/issue-letters/{int(letter_id)}/submit", body={})


def publish_letter(letter_id: int) -> tuple[int, dict]:
    return _call("POST", f"/admin/issue-letters/{int(letter_id)}/publish", body={"actor": ACTOR})


def archive_letter(letter_id: int) -> tuple[int, dict]:
    return _call("POST", f"/admin/issue-letters/{int(letter_id)}/archive", body={})
