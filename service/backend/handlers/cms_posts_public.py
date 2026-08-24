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
        # 마지막 수정 시각(2026-08-18, GEO 점검 — en.sedaily.com 대비
        # dateModified가 항상 datePublished와 같은 값이던 문제) — DDB
        # item엔 admin repo가 생성·수정마다 이미 채워온 필드가 있었다
        # (admin/backend/repo/posts_repo.py create()/update() 참조), 공개
        # 응답에만 안 실려 있었을 뿐이라 그대로 통과시킨다.
        "updated_at": post.get("updated_at"),
        "body": _body_paragraphs(post),
        # Tiptap 리치텍스트 결과 — 있으면 프론트가 body[] 대신 이걸 렌더한다
        # (admin PostForm 이 "post" 모드에서 이 필드만 채운다. AI 레터는 없음).
        "body_html": b.get("body_html"),
        "key_points": b.get("key_points") or [],
        "keywords": b.get("keywords") or [],
        # 배경자료의 수치 인포그래픽을 AI LENS 자체 스타일로 재구성할 때 씀
        # (LetterChartBlock, frontend). 원본 이미지가 아니라 데이터만 가져온다.
        "chart": b.get("chart"),
        "images": b.get("images") or [],
        # 피드 카드 썸네일 — admin에서 지정 안 하면 None, 프론트가 에디터
        # 아바타로 폴백한다 (todayLettersApi.ts::toTodayLetterCard).
        "cover_image_url": post.get("cover_image_url") or None,
        # 원문 기사 URL — 서울경제 원본 취재 기사 링크(2026-08-13, SEO/GEO/AEO
        # 감사). admin이 안 채우면 None, 프론트는 있을 때만 "원문 보기" 노출.
        "source_url": post.get("source_url") or None,
        # 유튜브 등 웹 링크 — 있으면 홈 하단 플레이어가 TTS 대신 이걸 임베드
        # 재생한다(2026-08-16, shared/lib/todayLettersApi.ts::toTodayLetterCard).
        "media_embed_url": post.get("media_embed_url") or None,
        # 전체 레터라도 /letters 아카이브에서 "트렌드"/"인기 칼럼" 필터에 걸리고
        # 싶을 수 있다 — channel 을 trend_card 로 바꾸면 본문·퀴즈가 요약 카드로
        # 축소되니, 대신 가벼운 태그만 얹는다(글 자체는 여전히 상세 페이지 그대로).
        "section": b.get("section"),
        # section 이 trend/column 일 때 홈 카드 상단 라벨(예: "증시", "투자
        # 인사이트") — admin PostForm 이 "post" 모드에서도 이제 이 값을 받는다
        # (mode="trend_card" 의 category 필드와 동일 규약, 2026-08-07).
        "category": b.get("category") or None,
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
        # 시리즈 제목(2026-08-21) — "여러 개의 독립된 웹툰 시리즈"로 재구조화
        # (사용자 요청: 화수 나열이 아니라 카카오페이지식 시리즈 진열대).
        # 시리즈 마스터 테이블을 새로 만들지 않고, 매 편(=post)에 자유 텍스트
        # 시리즈명을 중복 저장하는 가장 얕은 방법을 택했다 — category와 같은
        # 저장 위치(body_inline)를 재사용해 새 최상위 컬럼·새 GSI를 만들지
        # 않는다. 프론트는 이 문자열로 편들을 그룹핑한다(같은 문자열 = 같은
        # 시리즈). 비어 있으면(과거 발행분) 편 자체를 제목으로 쓰는 "단편"
        # 시리즈로 프론트가 폴백한다.
        "series_title": (b.get("series_title") or "").strip() or None,
        # category 추가(2026-08-21) — 발행량이 매일 단위로 늘어날 예정이라
        # /webtoon 목록에 카테고리로 골라보는 길이 필요해졌다. letters/lens/
        # home_player 와 같은 저장 위치(body_inline.category, ECON_CATEGORIES
        # 값)를 그대로 재사용한다 — 새 필드도, 새 GSI도 만들지 않고 admin
        # WebtoonMode 에 카테고리 선택만 추가하면 끝나는 구조.
        # 기존 발행분은 값이 없다(None) — 프론트는 실제로 값이 있는 카테고리만
        # 칩으로 그리므로 백필 전에는 칩 바가 아예 안 나온다.
        "category": b.get("category") or None,
        # display_order 추가(2026-08-21) — /webtoon 목록의 "편집국 추천" 순서.
        #
        # 요청은 "인기 소식" 섹션이었지만 인기를 계산할 지표가 시스템에 하나도
        # 없다(GA4는 trackEvent.ts 단방향 전송이라 다시 읽어올 경로가 없고,
        # 조회수 카운터·좋아요도 없다). 그 상태로 최신순에 "인기" 라벨을 붙이면
        # 홈의 "요즘 가장 많이 읽힌 글"(HotLettersRail, 실제로는 최신순)과 같은
        # 문제를 하나 더 만드는 것이다. 그래서 지표 대신 **편집자가 직접 고른
        # 순서**를 쓴다 — 근거를 설명할 수 있는 순위다.
        #
        # 새 필드를 만들지 않았다: display_order 는 이미 최상위 스키마에 있고
        # _UPDATABLE 에도 들어 있다(admin/backend/repo/posts_repo.py, 원래
        # home_player 재생 순서용). 오름차순이 앞자리다.
        "display_order": post.get("display_order"),
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


def _shape_lens(post: Dict[str, Any]) -> Dict[str, Any]:
    """"오늘의 이슈, 4가지 시선" 슬롯 — 2026-08-19부터 실제로는 4개 출력
    포맷(레터/웹툰/팟캐스트/영상, admin/frontend LensMode.tsx 참조)을 담는
    자리다. admin이 직접 작성(AI 생성은 프롬프트 테스트 실행 보조 — CmsPost
    자체는 여전히 수동 저장, body_inline.lenses 4개를 그대로 저장)."""
    b = post.get("body_inline") or {}
    lenses = [
        {
            "label": item.get("label") or "",
            "question": item.get("question") or "",
            "bullets": [x for x in (item.get("bullets") or []) if x],
            # "레터" 포맷 전용 문단 산문(2026-08-19) — 나머지 세 포맷은
            # bullets만 쓰므로 대개 빈 배열.
            "paragraphs": [x for x in (item.get("paragraphs") or []) if x],
            # "웹툰" 포맷 전용 컷(이미지+캡션, 2026-08-19) — webtoon 채널
            # 글의 body_inline.images와 같은 모양({url, caption}), 저장
            # 위치만 이 슬롯.
            "images": [
                {"url": img.get("url") or "", "caption": img.get("caption") or ""}
                for img in (item.get("images") or [])
                if img.get("url")
            ],
            # "영상" 포맷 전용 YouTube 등 임베드 URL(2026-08-19).
            "video_url": item.get("video_url") or None,
            # "영상" 포맷 전용 썸네일(2026-08-20) — YouTube 링크는
            # resolveVideo()가 자동으로 썸네일을 뽑아주지만, 우리 파이프라인이
            # 렌더링해 S3에 올린 mp4 원본은 그 자동 추출이 안 된다(URL 패턴
            # 기반 판별이라). 렌더된 영상 자체에서 프레임을 떠서 미리
            # 채워두는 필드 — 없으면 프론트가 기사 사진으로 폴백한다(사용자
            # 지적: "영상 목록에 기사 사진 말고 영상 프레임 같은 썸네일이
            # 있어야죠").
            "thumbnail_url": item.get("thumbnail_url") or None,
            # "팟캐스트" 포맷 전용 오디오/영상 링크(2026-08-19) — home_player
            # 채널의 media_embed_url과 같은 성격, 저장 위치만 이 슬롯.
            "media_url": item.get("media_url") or None,
        }
        for item in (b.get("lenses") or [])
    ]
    return {
        "id": post["slug"],
        "editor_id": post.get("editor_id") or _DEFAULT_EDITOR,
        "headline": post.get("headline") or "",
        "context": post.get("subtitle") or "",
        "date": post.get("publish_date") or "",
        "updated_at": post.get("updated_at"),
        "cover_image_url": post.get("cover_image_url") or None,
        # 텍스트가 없는 순수 기사 사진(2026-08-14 신설). cover_image_url 은
        # 인스타 카드뉴스용 완성형 그래픽(1080x1350)이라 헤드라인·날짜·"lens"
        # 라벨이 픽셀에 박혀 있다 — 웹 카드의 사진 칸에 그걸 쓰면 우리 HTML
        # 헤드라인과 텍스트가 중복되고, 광고 문구·인포그래픽까지 같이 노출된다.
        # 그래서 카드 그래픽과 별개로 "사진만" 있는 이미지를 따로 받는다.
        # 최상위 스키마를 건드리지 않도록 body_inline 에 담는다.
        "photo_image_url": b.get("photo_image_url") or None,
        "source_url": post.get("source_url") or None,
        # letters와 같은 저장 위치(body_inline.category, 6개 경제 카테고리
        # 라벨 문자열)를 그대로 읽는다 — lens 글도 /markets 등 카테고리별
        # 페이지에 letters와 함께 노출하기 위해 2026-08-20 추가.
        "category": b.get("category") or None,
        "lenses": lenses,
        "is_cms": True,
    }


def _shape_home_player_item(post: Dict[str, Any]) -> Dict[str, Any]:
    """홈 화면 하단 플레이 카드("오늘의 핵심 뉴스") 재생목록 항목(2026-08-16).
    기사와 무관하게 관리자가 직접 "제목 + 유튜브 링크"로 만드는 독립
    콘텐츠 — admin/frontend home-player 화면 전용, TodayNewsPlayer.tsx가
    display_order 오름차순으로 재생한다.

    date/excerpt 추가(2026-08-21) — 전용 목록/상세 페이지(/listen) 신설로
    검색엔진에 노출시키면서 다른 채널 shaper(_shape_video 등)와 필드를
    맞췄다. 지금까지 이 채널은 홈 위젯 전용이라 발행일이 필요 없었다.

    category 추가(2026-08-21) — 홈 오디오 섹션 카드에 "팟캐스트"/"영상"
    (미디어 형식)만 뜨고 실제 내용 분류가 없다는 지적. lens/letters와
    같은 저장 위치(body_inline.category, ECON_CATEGORIES 값)를 그대로
    재사용 — 새 필드·새 admin 화면 없이 admin/frontend home-player
    페이지에 카테고리 선택만 추가하면 끝나는 구조."""
    return {
        "id": post["slug"],
        "title": post.get("headline") or "",
        "excerpt": post.get("subtitle") or "",
        "date": post.get("publish_date") or "",
        "media_embed_url": post.get("media_embed_url") or "",
        "display_order": post.get("display_order") if post.get("display_order") is not None else 0,
        "category": (post.get("body_inline") or {}).get("category") or None,
    }


_SHAPERS = {
    "letters": _shape_letter,
    "paper": _shape_paper,
    # feed 는 개인화 랭킹 대상이 아니라 상단 고정 카드로 쓰인다 (spec §2.4).
    # 모양은 letters 와 같게 두고 프론트가 고정 배치한다.
    "feed": _shape_letter,
    "webtoon": _shape_webtoon,
    "video": _shape_video,
    "lens": _shape_lens,
    "home_player": _shape_home_player_item,
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
            "posts": [_SHAPERS[channel](r) for r in rows],
        }

    resp = success_response(payload)
    resp["headers"] = {**resp["headers"], "Cache-Control": _CACHE_CONTROL}
    return resp
