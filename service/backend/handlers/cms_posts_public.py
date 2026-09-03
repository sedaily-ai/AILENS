"""GET /api/v2/posts — 관리자가 작성한 글의 공개 조회 API (CMS spec §5.1.1).

Query: ?channel=letters|paper|feed (기본 letters) &date=YYYY-MM-DD (옵션)
Path : /api/v2/posts/{slug}

응답에 envelope 은 없다 (today-letters·front-page 와 동일 규약).

2026-08-24 — 채널별 응답 shaping(_shape_letter 등 6개 함수)은
services/cms_posts_shaping.py로 뺐다(코드 리팩토링 감사 Track B, God
파일 분해). 이 파일은 이제 HTTP 라우팅만 담당한다.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from config.constants import CORS_HEADERS
from core.decorators import lambda_handler as handler_decorator
from core.response import error_response, success_response

from clients import cms_posts_ddb_client as posts_client
from services.cms_posts_shaping import SHAPERS, shape_letter, shape_lens_summary

logger = logging.getLogger(__name__)
logging.getLogger().setLevel(logging.INFO)

# 목록(다건, ?channel=... 응답) 전용 shaper — 단건 조회(/{slug})는 여전히
# SHAPERS(전체)를 그대로 쓴다. lens만 축약판으로 바꾼다(2026-09-03) —
# shape_lens_summary()의 docstring 참조. 다른 채널은 원래도 목록/단건이
# 똑같이 가벼워서 나눌 필요가 없었다.
_LIST_SHAPERS = {**SHAPERS, "lens": shape_lens_summary}

# trend_card 채널 폐기(2026-08-17) — "요즘 화제의 경제 이슈" 섹션을 "이슈
# 톡톡"에 흡수 통합. 실사용 데이터 0건 확인 후 제거(letters 채널 +
# section='trend' 태그로 이미 오래전에 대체돼 있었다).
_VALID_CHANNELS = ("letters", "paper", "feed", "webtoon", "video", "lens", "home_player")
# 2026-08-09: 300초(5분) → 5초 → no-store. 이 헤더는 프론트 SSR의 Next 캐시
# (revalidateTag, 5초 — service/frontend/src/shared/lib/cmsPostsApi.ts)와는
# 별개로, 클라이언트 컴포넌트(TrendingEconomySection 등 12곳, 'use client')가
# 이 API를 브라우저에서 직접 호출할 때 그 브라우저 캐시를 그대로 지배한다 —
# revalidateTag()는 서버 캐시만 지우고 이미 브라우저에 저장된 응답엔 손을 못
# 댄다. max-age=5로 줄여도 "저장 직전에 그 페이지를 이미 봤던 브라우저"는
# 5초 창 안에 새로고침하면 여전히 옛 응답을 그대로 쓰는 잔여 갭이 있었다 —
# "새로고침하면 언제나 최신"을 보장하려면 이 계열 자체를 무캐시로 만드는
# 수밖에 없다(트래픽 규모상 성능 손해는 무시 가능). SSR 쪽은 Next가 이
# 헤더를 안 보고 자기 next.revalidate/tags 설정만 따르므로 영향 없다.
_CACHE_CONTROL = "no-store"


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
        shaper = SHAPERS.get(channel, shape_letter)
        payload: Dict[str, Any] = {"post": shaper(post)}
    else:
        channel = qs.get("channel") or "letters"
        if channel not in _VALID_CHANNELS:
            return error_response(
                f"invalid channel: {channel}", status_code=400, code="VALIDATION"
            )
        date = qs.get("date")
        try:
            # 100 → 1000(2026-08-18, GEO 점검 — sitemap이 발행 14일 지난
            # 레터를 전부 잃는 문제의 원인). list_published_posts()는 limit과
            # 무관하게 DynamoDB status-publish_date-index를 항상 끝까지
            # 페이지네이션해서 다 읽은 뒤 마지막에만 슬라이스하므로(clients/
            # cms_posts_ddb_client.py 참조), 이 상한을 올려도 DB 읽기 비용은
            # 그대로다 — 응답 payload 크기만 커진다.
            limit = max(1, min(int(qs.get("limit", 20)), 1000))
        except (TypeError, ValueError):
            limit = 20
        rows = posts_client.list_published_posts(channel, date, limit=limit)
        payload = {
            "channel": channel,
            "date": date,
            "posts": [_LIST_SHAPERS[channel](r) for r in rows],
        }

    resp = success_response(payload)
    resp["headers"] = {**resp["headers"], "Cache-Control": _CACHE_CONTROL}
    return resp
