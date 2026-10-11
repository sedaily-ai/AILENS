"""커뮤니티 라우트.

main.py 분리(2026-10-12 리팩토링 5단계). 경로·응답은 분리 전과 같다.
"""
from __future__ import annotations

from fastapi import APIRouter
from typing import Any, Dict, Optional
from fastapi import Body, Header, HTTPException, Query
import community_repo
from route_guards import _check_admin_token

router = APIRouter()


# --- community 게시판 (v1.26) ---
# 목록/댓글 조회는 원본 DynamoDB 핸들러도 인증 없는 공개 GET이었다(post_handler.py
# 참조 — POST만 JWT 필요). 글쓰기/투표/댓글 작성은 user_id가 Lambda 쪽에서
# 이미 JWT로 검증된 값이라는 전제로 내부 토큰 라우트에 그대로 전달받는다.

@router.get("/api/v2/community/posts")
def community_list_posts(
    date: str = Query(...),
    limit: int = Query(default=30),
    tag: Optional[str] = Query(default=None),
):
    return {"posts": community_repo.list_posts(date, limit, tag)}


@router.get("/api/v2/community/posts/{post_id}/comments")
def community_list_comments(post_id: int, limit: int = Query(default=50)):
    return {"comments": community_repo.list_comments(post_id, limit)}


@router.post("/internal/community/posts")
def internal_community_create_post(payload: Dict[str, Any] = Body(...), x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    post = community_repo.create_post(
        user_id=payload["user_id"],
        user_name=payload.get("user_name"),
        user_avatar=payload.get("user_avatar"),
        archived_sentence=payload["archived_sentence"],
        user_comment=payload.get("user_comment"),
        article_id=payload.get("article_id"),
        tags=payload.get("tags"),
    )
    return {"post": post}


@router.post("/internal/community/posts/{post_id}/vote")
def internal_community_vote(post_id: int, payload: Dict[str, Any] = Body(...), x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    delta = community_repo.vote_post(post_id, payload["user_id"], payload.get("vote_type", "up"))
    if delta is None:
        raise HTTPException(status_code=404, detail="post not found")
    return {"post_id": post_id, "vote_type": payload.get("vote_type", "up"), "delta": delta}


@router.post("/internal/community/posts/{post_id}/comments")
def internal_community_add_comment(post_id: int, payload: Dict[str, Any] = Body(...), x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    comment = community_repo.add_comment(
        post_id, payload["user_id"], payload.get("user_name"), payload.get("user_avatar"), payload["text"],
    )
    if comment is None:
        raise HTTPException(status_code=404, detail="post not found")
    return {"comment": comment}
