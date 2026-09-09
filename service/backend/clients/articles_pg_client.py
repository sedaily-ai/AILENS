"""뉴스 기사(articles) — PostgreSQL 상시 서버(lens-cms-api) 경유 (v1.25).

quiz_questions_ddb_client.py(v1.22)/personal_pg_client.py(v1.24)와 같은
패턴 — 공개 조회는 토큰 없이, 수집기 쓰기 경로만 내부 토큰으로 보호.

⚠️ article-dev/search-dev/chatbot-dev/question-dev/article-collector-dev
Lambda는 모두 `sedaily-mbti-lambda-execution-dev`라는, AI LENS 밖의 다른
프로젝트(bigkinds/ga4 등)와 공유하는 광범위 실행 역할을 쓴다(personal_pg_
client.py 도입 때 archive-dev/user-dev에서 이미 확인된 것과 동일 역할).
이 역할에 SSM 권한을 추가하면 영향 범위가 이 프로젝트 밖으로 새므로,
쓰기 토큰은 SSM 미경유 평문 환경변수(LENS_CMS_API_TOKEN)로 직접 주입한다
(dev 단계 리스크 허용 범위로 판단).

DynamoDB는 본문을 S3에 분리 저장했지만(get_article이 DDB 메타데이터+S3
바디를 merge), Postgres articles.body는 이미 100% 백필돼 있어 그
인다이렉션이 필요 없다 — get_article()이 항상 완전한 본문을 바로 반환.
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, List, Optional

_API_URL = os.environ.get("LENS_CMS_API_URL", "http://13.223.179.151")
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


def get_article(article_no: str) -> Optional[Dict[str, Any]]:
    try:
        resp = _get(f"/api/v2/articles/{urllib.parse.quote(article_no)}")
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise
    return resp.get("article")


def get_transformed_articles_by_date(date_str: str, limit: int = 30) -> List[Dict[str, Any]]:
    resp = _get("/api/v2/articles", query={"date": date_str, "limit": limit})
    return resp.get("articles", [])


def get_recent_articles(category: str, limit: int = 3) -> List[Dict[str, Any]]:
    resp = _get("/api/v2/articles", query={"category": category, "limit": limit})
    return resp.get("articles", [])


def category_query(category: str, keywords_any: Optional[List[str]] = None,
                    since: Optional[str] = None, limit: int = 20) -> List[Dict[str, Any]]:
    resp = _get("/api/v2/articles/category-query", query={
        "category": category,
        "keywords": ",".join(keywords_any) if keywords_any else None,
        "since": since,
        "limit": limit,
    })
    return resp.get("articles", [])


def search_paged(categories: Optional[List[str]], query: Optional[str],
                  published_from: Optional[str], published_until: Optional[str],
                  page: int = 1, page_size: int = 10) -> Dict[str, Any]:
    url = f"{_API_URL}/api/v2/articles/search"
    body = json.dumps({
        "categories": categories, "query": query,
        "published_from": published_from, "published_until": published_until,
        "page": page, "page_size": page_size,
    }).encode()
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=_TIMEOUT_SECONDS) as res:
        return json.loads(res.read())


def batch_check_exists(article_nos: List[str]) -> List[str]:
    if not article_nos:
        return []
    resp = _internal("POST", "/internal/articles/exists", body={"article_nos": article_nos})
    return resp.get("existing", [])


def batch_get_hash(article_nos: List[str]) -> Dict[str, Dict[str, Any]]:
    if not article_nos:
        return {}
    resp = _internal("POST", "/internal/articles/hashes", body={"article_nos": article_nos})
    return resp.get("hashes", {})


def save_article(article_no: str, article: Dict[str, Any]) -> bool:
    resp = _internal("PUT", f"/internal/articles/{urllib.parse.quote(article_no)}", body=article)
    return bool(resp.get("ok"))
