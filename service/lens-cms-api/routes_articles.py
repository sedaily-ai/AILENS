"""기사 원문 라우트.

main.py 분리(2026-10-12 리팩토링 5단계). 경로·응답은 분리 전과 같다.
"""
from __future__ import annotations

from fastapi import APIRouter
from typing import Any, Dict, Optional
from fastapi import Body, Header, HTTPException, Query
import articles_repo
from route_guards import _check_admin_token

router = APIRouter()


# --- articles (v1.25) ---
# 공개 조회는 article-dev/search-dev/chatbot-dev/question-dev Lambda가 호출,
# 인증 불필요(기존 DynamoDB 경로도 공개 API였음). 수집기(article-collector-dev)
# 쓰기 경로만 내부 토큰으로 보호.

@router.get("/api/v2/articles/{article_no}")
def get_article(article_no: str):
    article = articles_repo.get_article(article_no)
    if not article:
        raise HTTPException(status_code=404, detail="not found")
    return {"article": article}


@router.get("/api/v2/articles")
def list_articles(
    date: Optional[str] = Query(default=None, description="YYYYMMDD"),
    category: Optional[str] = Query(default=None),
    categories: Optional[str] = Query(default=None, description="comma-separated"),
    keyword: Optional[str] = Query(default=None),
    days: Optional[int] = Query(default=None),
    limit: int = Query(default=30),
):
    if date:
        return {"articles": articles_repo.list_articles_by_date(date, limit)}
    if category and not categories:
        return {"articles": articles_repo.get_recent_articles(category, limit)}
    cat_list = categories.split(",") if categories else None
    return {"articles": articles_repo.search_articles(cat_list, keyword, days, limit)}


@router.post("/internal/articles/exists")
def internal_articles_exists(payload: Dict[str, Any] = Body(...), x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    return {"existing": articles_repo.batch_check_exists(payload.get("article_nos") or [])}


@router.post("/internal/articles/hashes")
def internal_articles_hashes(payload: Dict[str, Any] = Body(...), x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    return {"hashes": articles_repo.batch_get_hash(payload.get("article_nos") or [])}


@router.put("/internal/articles/{article_no}")
def internal_save_article(article_no: str, payload: Dict[str, Any] = Body(...), x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    payload["news_id"] = article_no
    articles_repo.save_article(payload)
    return {"ok": True}
