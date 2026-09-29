"""선정 실험실 — lens-cms-api 내부 API HTTP 클라이언트 (posts_repo.py와
동일 패턴). 실제 SQL은 service/lens-cms-api/selection_repo.py가 갖고
있다 — 여기는 그 내부 API를 부르는 얇은 클라이언트일 뿐이다."""
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
_TIMEOUT_SECONDS = 8


def _request(method: str, path: str, body: dict | None = None, query: dict | None = None) -> dict:
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
            "X-Internal-Token": get_secure(_TOKEN_PARAM),
        },
        method=method,
    )
    try:
        with urllib.request.urlopen(req, timeout=_TIMEOUT_SECONDS) as res:
            return json.loads(res.read())
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return {}
        body_text = e.read().decode(errors="replace")
        logger.error(f"lens-cms-api {method} {path} -> {e.code}: {body_text}")
        if e.code == 400:
            try:
                detail = json.loads(body_text).get("detail", body_text)
            except (json.JSONDecodeError, AttributeError):
                detail = body_text
            raise ValueError(detail) from e
        raise


def list_dates(category: str = "general", limit: int = 30) -> list[str]:
    resp = _request("GET", "/admin/selection-runs/dates", query={"category": category, "limit": limit})
    return resp.get("dates", [])


def get_day(run_date: str, category: str = "general") -> dict:
    return _request("GET", "/admin/selection-runs", query={"date": run_date, "category": category})


def score_article(article_id: int, verdict: str | None, note: str | None, scored_by: str) -> dict | None:
    resp = _request(
        "PATCH", f"/admin/selection-articles/{article_id}/score",
        body={"verdict": verdict, "note": note, "scored_by": scored_by},
    )
    return resp.get("article")
