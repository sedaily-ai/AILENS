"""GET /api/v2/posts — 관리자가 작성한 글의 공개 조회 API (CMS spec §5.1.1).

채널별로 응답 모양이 다르다. 프론트가 기존 응답과 머지할 수 있도록,
'letters' 는 ApiLetter 모양으로, 'paper' 는 front-page article 모양으로 shaping 한다.

Query: ?channel=letters|paper|feed (기본 letters) &date=YYYY-MM-DD (옵션)
Path : /api/v2/posts/{slug}

응답에 envelope 은 없다 (today-letters·front-page 와 동일 규약).
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from config.constants import CORS_HEADERS
from core.decorators import lambda_handler as handler_decorator
from core.response import error_response, success_response

from clients import cms_posts_ddb_client as posts_client

logger = logging.getLogger(__name__)
logging.getLogger().setLevel(logging.INFO)

_VALID_CHANNELS = ("letters", "paper", "feed", "trend_card", "webtoon", "video")
_CACHE_CONTROL = "public, max-age=300"
# editor_id 가 NULL 인 글의 표시 명의 (spec §5.1.1) — "편집팀"처럼 딱딱한
# 직함 대신 짧게. 프론트 todayLettersApi.ts DEFAULT_META.editorName 과 맞춘다.
_DEFAULT_EDITOR = "AI LENS"


def _body_paragraphs(post: Dict[str, Any]) -> List[str]:
    return [p for p in (post.get("body_inline") or {}).get("body", []) if p]


def _shape_letter(post: Dict[str, Any]) -> Dict[str, Any]:
    """ApiLetter 모양 (shared/lib/todayLettersApi.ts 와 1:1)."""
    b = post.get("body_inline") or {}
    return {
        "id": post["slug"],
        "editor_id": post.get("editor_id") or _DEFAULT_EDITOR,
        "mbti_group": post.get("mbti_group"),
        "article_id": "",
        "secondary_article_ids": [],
        "archetype": None,
        "theme": None,
        "headline": post.get("headline") or "",
        "subtitle": post.get("subtitle"),
        "closing_line": post.get("closing_line"),
        # 전체 레터 목록(/letters)이 날짜별로 묶어 보여주려면 필요 — today-letters
        # 는 호출자가 이미 date 를 알고 있어 안 쓰지만, 채널 조회는 여러 날짜가
        # 섞여 나오므로 각 글에 날짜가 실려 있어야 한다.
        "publish_date": post.get("publish_date"),
        "body": _body_paragraphs(post),
        # Tiptap 리치텍스트 결과 — 있으면 프론트가 body[] 대신 이걸 렌더한다
        # (admin PostForm 이 "post" 모드에서 이 필드만 채운다. AI 레터는 없음).
        "body_html": b.get("body_html"),
        "key_points": b.get("key_points") or [],
        "keywords": b.get("keywords") or [],
        "images": b.get("images") or [],
        # 피드 카드 썸네일 — admin에서 지정 안 하면 None, 프론트가 에디터
        # 아바타로 폴백한다 (todayLettersApi.ts::toTodayLetterCard).
        "cover_image_url": post.get("cover_image_url") or None,
        # 전체 레터라도 /letters 아카이브에서 "트렌드"/"인기 칼럼" 필터에 걸리고
        # 싶을 수 있다 — channel 을 trend_card 로 바꾸면 본문·퀴즈가 요약 카드로
        # 축소되니, 대신 가벼운 태그만 얹는다(글 자체는 여전히 상세 페이지 그대로).
        "section": b.get("section"),
        "is_cms": True,
    }


def _shape_paper(post: Dict[str, Any]) -> Dict[str, Any]:
    """front-page article 모양 (v2/handlers/front_page.py 와 1:1)."""
    paras = _body_paragraphs(post)
    blocks: List[Dict[str, Any]] = [{"type": "text", "text_ko": p} for p in paras]
    for img in (post.get("body_inline") or {}).get("images", []):
        url = (img or {}).get("url")
        if url:
            blocks.append({"type": "image", "url": url})
    return {
        "news_id": post["slug"],
        "title": post.get("headline") or "",
        "sub_title": post.get("subtitle") or "",
        "category": "",
        "author_name": post.get("editor_id") or _DEFAULT_EDITOR,
        "published_at": post.get("published_at"),
        "url": "",
        "image_url": post.get("cover_image_url") or "",
        "is_top": False,
        "content": "\n\n".join(paras),
        "content_blocks": blocks,
        "is_cms": True,
    }


def _shape_trend_card(post: Dict[str, Any]) -> Dict[str, Any]:
    """홈 피드 "요즘 화제의 경제 이슈"/"이번 주 인기 칼럼" 카드 모양
    (TrendingEconomySection/ColumnPreviewSection 의 MockArticle/MockColumn 과 1:1).

    letters/paper 와 달리 리치텍스트 본문이 없다 — 제목+짧은 요약뿐인 카드라
    body_inline 에 section/category 만 얹는다 (admin PostForm mode="trend_card").
    """
    b = post.get("body_inline") or {}
    return {
        "id": post["slug"],
        "section": b.get("section") or "trend",
        "category": b.get("category") or "",
        "title": post.get("headline") or "",
        "excerpt": post.get("subtitle") or "",
        "date": post.get("publish_date") or "",
        "is_cms": True,
    }


def _shape_webtoon(post: Dict[str, Any]) -> Dict[str, Any]:
    """연재 웹툰 파일럿(2026-08-06) — 컷(이미지+캡션) 나열뿐인 가벼운 포맷이라
    새 필드를 만들지 않고 기존 body_inline.images(url+caption)를 컷 목록으로
    그대로 쓴다. 그림은 admin에서 외부 생성(GPT 등) 후 업로드만 한다."""
    b = post.get("body_inline") or {}
    panels = [
        {"url": img.get("url"), "caption": (img.get("caption") or "").strip()}
        for img in (b.get("images") or [])
        if img.get("url")
    ]
    return {
        "id": post["slug"],
        "editor_id": post.get("editor_id") or _DEFAULT_EDITOR,
        "title": post.get("headline") or "",
        "excerpt": post.get("subtitle") or "",
        "date": post.get("publish_date") or "",
        "cover_image_url": post.get("cover_image_url") or (panels[0]["url"] if panels else None),
        "panels": panels,
        "is_cms": True,
    }


def _shape_video(post: Dict[str, Any]) -> Dict[str, Any]:
    """영상 콘텐츠(2026-08-06) — 외부(YouTube 등) 임베드 URL 하나만 있으면
    되는 가벼운 포맷. admin이 body_inline.video_url 을 채운다. 썸네일은
    admin이 직접 지정 안 하면 프론트가 YouTube URL에서 자동 추출한다."""
    b = post.get("body_inline") or {}
    return {
        "id": post["slug"],
        "title": post.get("headline") or "",
        "excerpt": post.get("subtitle") or "",
        "date": post.get("publish_date") or "",
        "video_url": b.get("video_url") or "",
        "thumbnail_url": post.get("cover_image_url") or None,
        "is_cms": True,
    }


_SHAPERS = {
    "letters": _shape_letter,
    "paper": _shape_paper,
    # feed 는 개인화 랭킹 대상이 아니라 상단 고정 카드로 쓰인다 (spec §2.4).
    # 모양은 letters 와 같게 두고 프론트가 고정 배치한다.
    "feed": _shape_letter,
    "trend_card": _shape_trend_card,
    "webtoon": _shape_webtoon,
    "video": _shape_video,
}


@handler_decorator
async def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    method = (
        event.get("httpMethod")
        or (event.get("requestContext") or {}).get("http", {}).get("method")
        or "GET"
    )
    if method == "OPTIONS":
        return {"statusCode": 200, "headers": CORS_HEADERS, "body": ""}

    path_params = event.get("pathParameters") or {}
    qs = event.get("queryStringParameters") or {}
    slug: Optional[str] = path_params.get("slug")

    if slug:
        post = posts_client.get_published_post_by_slug(slug)
        if not post:
            return error_response("post not found", status_code=404, code="NOT_FOUND")
        channel = (post.get("channels") or ["letters"])[0]
        shaper = _SHAPERS.get(channel, _shape_letter)
        payload: Dict[str, Any] = {"post": shaper(post)}
    else:
        channel = qs.get("channel") or "letters"
        if channel not in _VALID_CHANNELS:
            return error_response(
                f"invalid channel: {channel}", status_code=400, code="VALIDATION"
            )
        date = qs.get("date")
        try:
            limit = max(1, min(int(qs.get("limit", 20)), 100))
        except (TypeError, ValueError):
            limit = 20
        rows = posts_client.list_published_posts(channel, date, limit=limit)
        payload = {
            "channel": channel,
            "date": date,
            "posts": [_SHAPERS[channel](r) for r in rows],
        }

    resp = success_response(payload)
    resp["headers"] = {**resp["headers"], "Cache-Control": _CACHE_CONTROL}
    return resp
