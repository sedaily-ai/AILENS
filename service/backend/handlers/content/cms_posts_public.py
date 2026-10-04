"""GET /api/v2/posts — 관리자가 작성한 글의 공개 조회 API (CMS spec §5.1.1).

Query: ?channel=letters|paper|feed (기본 letters) &date=YYYY-MM-DD (옵션)
Path : /api/v2/posts/{slug}

응답에 envelope 은 없다 (today-letters·front-page 와 동일 규약).

채널별 응답 구성은 services/content/cms_posts_shaping.py 에 있으며,
이 파일은 HTTP 라우팅만 담당한다.
"""
from __future__ import annotations

import logging
import os
from typing import Any, Dict, Optional

from config.constants import CORS_HEADERS
from core.decorators import lambda_handler as handler_decorator
from core.response import error_response, success_response

# CMS_DB_BACKEND(Lambda 환경변수) 컷오버 스위치: 코드 배포와 실제 전환을 분리해
# 환경변수만으로 즉시 롤백할 수 있게 한다. 기본값은 DynamoDB 이다.
# "postgres" 로 전환하기 전에 clients/pg/cms_posts.py 상단의 알려진 차이
# (lens 채널 lenses[] 미이관 등)를 확인해야 한다.
if os.environ.get("CMS_DB_BACKEND") == "postgres":
    from clients.pg import cms_posts as posts_client
else:
    from clients.ddb import cms_posts as posts_client
from services.content.cms_posts_shaping import (
    SHAPERS,
    shape_letter,
    shape_lens_summary,
    shape_webtoon_summary,
    shape_home_player_summary,
)

logger = logging.getLogger(__name__)
logging.getLogger().setLevel(logging.INFO)

# 목록(?channel=...) 응답 전용 shaper. 단건 조회(/{slug})는 SHAPERS(전체)를 사용한다.
# lens/webtoon/home_player 는 응답이 무거워 축약판(shape_*_summary)을 쓰고,
# 나머지 채널은 목록과 단건의 구성이 같다.
_LIST_SHAPERS = {
    **SHAPERS,
    "lens": shape_lens_summary,
    "webtoon": shape_webtoon_summary,
    "home_player": shape_home_player_summary,
}

_VALID_CHANNELS = ("letters", "paper", "feed", "webtoon", "video", "lens", "home_player")
# 클라이언트 컴포넌트가 이 API 를 브라우저에서 직접 호출하므로 이 헤더가 브라우저 캐시를 결정한다.
# revalidateTag() 는 서버 캐시만 무효화하므로, 새로고침 시 항상 최신 응답을 보장하려면
# no-store 가 필요하다. 프론트 SSR 은 이 헤더를 무시하고 Next 의 revalidate 설정을 따른다.
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
        post = posts_client.get_published_post_by_slug(slug, channel=qs.get("channel"))
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
            # list_published_posts() 는 limit 과 무관하게 인덱스를 끝까지 읽은 뒤 마지막에 슬라이스하므로
            # 상한을 올려도 DB 읽기 비용은 같고 응답 크기만 늘어난다. sitemap 이 오래된 레터를 포함하도록 1000 으로 둔다.
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
