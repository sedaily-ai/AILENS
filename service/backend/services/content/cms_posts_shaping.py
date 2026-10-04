"""CMS 글 채널별 응답 shaping.

채널별로 응답 모양이 다르다. 프론트가 기존 응답과 병합할 수 있도록
'letters' 는 ApiLetter 모양으로, 'paper' 는 front-page article 모양으로 변환한다.
"""
from __future__ import annotations

from typing import Any, Dict, List

# editor_id 가 NULL 인 글의 표시 명의. 프론트 todayLettersApi.ts DEFAULT_META.editorName 과 일치시킨다.
DEFAULT_EDITOR = "AI LENS"


def _body_paragraphs(post: Dict[str, Any]) -> List[str]:
    return [p for p in (post.get("body_inline") or {}).get("body", []) if p]


def shape_letter(post: Dict[str, Any]) -> Dict[str, Any]:
    """ApiLetter 모양 (shared/lib/todayLettersApi.ts 와 1:1)."""
    b = post.get("body_inline") or {}
    return {
        "id": post["slug"],
        "editor_id": post.get("editor_id") or DEFAULT_EDITOR,
        "article_id": "",
        "secondary_article_ids": [],
        "archetype": None,
        "theme": None,
        "headline": post.get("headline") or "",
        "subtitle": post.get("subtitle"),
        "closing_line": post.get("closing_line"),
        # 전체 레터 목록(/letters)의 날짜별 그룹핑에 필요하다(채널 조회는 여러 날짜가 섞여 나온다).
        "publish_date": post.get("publish_date"),
        # 마지막 수정 시각. admin repo가 생성·수정 시 채우는 필드를 그대로 전달한다.
        "updated_at": post.get("updated_at"),
        # 발행 완료 시각(ISO, UTC, 초 단위). 프론트가 KST 시:분으로 표기한다(shared/lib/date.ts kstDateTimeLabel).
        "published_at": post.get("published_at"),
        "body": _body_paragraphs(post),
        # Tiptap 리치텍스트 결과. 있으면 프론트가 body[] 대신 렌더한다(admin PostForm "post" 모드에서만 채움).
        "body_html": b.get("body_html"),
        "key_points": b.get("key_points") or [],
        "keywords": b.get("keywords") or [],
        # 배경자료 수치 인포그래픽을 프론트(LetterChartBlock)가 자체 스타일로 재구성하기 위한 데이터.
        "chart": b.get("chart"),
        "images": b.get("images") or [],
        # 피드 카드 썸네일. 없으면 None이며 프론트가 에디터 아바타로 대체한다.
        "cover_image_url": post.get("cover_image_url") or None,
        # 원문 기사 URL. 없으면 None이며 프론트는 값이 있을 때만 "원문 보기"를 노출한다.
        "source_url": post.get("source_url") or None,
        # 유튜브 등 웹 링크. 있으면 홈 하단 플레이어가 TTS 대신 임베드 재생한다.
        "media_embed_url": post.get("media_embed_url") or None,
        # /letters 아카이브의 "트렌드"/"인기 칼럼" 필터용 태그.
        "section": b.get("section"),
        # section 이 trend/column 일 때 홈 카드 상단 라벨(예: "증시", "투자 인사이트").
        "category": b.get("category") or None,
        "is_cms": True,
    }


def shape_paper(post: Dict[str, Any]) -> Dict[str, Any]:
    """front-page article 모양으로 변환한다."""
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
        "author_name": post.get("editor_id") or DEFAULT_EDITOR,
        "published_at": post.get("published_at"),
        "url": "",
        "image_url": post.get("cover_image_url") or "",
        "is_top": False,
        "content": "\n\n".join(paras),
        "content_blocks": blocks,
        "is_cms": True,
    }


def shape_webtoon(post: Dict[str, Any]) -> Dict[str, Any]:
    """연재 웹툰. body_inline.images(url+caption)를 컷 목록(panels)으로 사용한다."""
    b = post.get("body_inline") or {}
    panels = [
        {"url": img.get("url"), "caption": (img.get("caption") or "").strip()}
        for img in (b.get("images") or [])
        if img.get("url")
    ]
    return {
        "id": post["slug"],
        "editor_id": post.get("editor_id") or DEFAULT_EDITOR,
        "title": post.get("headline") or "",
        "excerpt": post.get("subtitle") or "",
        "date": post.get("publish_date") or "",
        "published_at": post.get("published_at"),
        "cover_image_url": post.get("cover_image_url") or (panels[0]["url"] if panels else None),
        "panels": panels,
        # 시리즈 제목. 같은 문자열의 글을 프론트가 한 시리즈로 묶으며, 비어 있으면 프론트가 편 자체를 단편 시리즈로 취급한다.
        "series_title": (b.get("series_title") or "").strip() or None,
        # 카테고리(body_inline.category, ECON_CATEGORIES 값). 값이 없는 글은 프론트가 카테고리 칩에서 제외한다.
        "category": b.get("category") or None,
        # "편집국 추천" 정렬 키(오름차순이 앞). 인기 지표가 없어 편집자가 지정한 순서를 사용한다.
        "display_order": post.get("display_order"),
        "is_cms": True,
    }


def shape_video(post: Dict[str, Any]) -> Dict[str, Any]:
    """영상 콘텐츠. body_inline.video_url 의 임베드 URL을 사용하며, 썸네일 미지정 시 프론트가 YouTube URL에서 추출한다."""
    b = post.get("body_inline") or {}
    return {
        "id": post["slug"],
        "title": post.get("headline") or "",
        "excerpt": post.get("subtitle") or "",
        "date": post.get("publish_date") or "",
        "published_at": post.get("published_at"),
        "video_url": b.get("video_url") or "",
        "thumbnail_url": post.get("cover_image_url") or None,
        "is_cms": True,
    }


def _shape_lens_item(item: Dict[str, Any]) -> Dict[str, Any]:
    """body_inline.lenses의 포맷 1개(레터/웹툰/팟캐스트/영상)를 응답 모양으로 변환한다."""
    return {
        "label": item.get("label") or "",
        "question": item.get("question") or "",
        "bullets": [x for x in (item.get("bullets") or []) if x],
        # "레터" 포맷 전용 문단 산문(나머지 포맷은 대개 빈 배열).
        "paragraphs": [x for x in (item.get("paragraphs") or []) if x],
        # "웹툰" 포맷 전용 컷({url, caption}).
        "images": [
            {"url": img.get("url") or "", "caption": img.get("caption") or ""}
            for img in (item.get("images") or [])
            if img.get("url")
        ],
        # "영상" 포맷 전용 임베드 URL.
        "video_url": item.get("video_url") or None,
        # "영상" 포맷 전용 썸네일. 자체 렌더 mp4는 URL 기반 자동 추출이 안 되므로 영상 프레임을 미리 채운다(없으면 프론트가 기사 사진 사용).
        "thumbnail_url": item.get("thumbnail_url") or None,
        # "팟캐스트" 포맷 전용 오디오/영상 링크.
        "media_url": item.get("media_url") or None,
        # "팟캐스트"·"영상" 포맷 전용 전체 대본(접근성용). 발행 시 mustknow_auto/frontpage_auto 가 채운다.
        "transcript": item.get("transcript") or None,
    }


def shape_lens(post: Dict[str, Any]) -> Dict[str, Any]:
    """"오늘의 이슈, 4가지 시선" 슬롯. body_inline.lenses 의 4개 출력 포맷(레터/웹툰/팟캐스트/영상)을 담는다."""
    b = post.get("body_inline") or {}
    lenses = [_shape_lens_item(item) for item in (b.get("lenses") or [])]
    return {
        "id": post["slug"],
        "editor_id": post.get("editor_id") or DEFAULT_EDITOR,
        "headline": post.get("headline") or "",
        "context": post.get("subtitle") or "",
        "date": post.get("publish_date") or "",
        "updated_at": post.get("updated_at"),
        # 발행 완료 시각(ISO, UTC, 초 단위). 프론트가 KST 시:분으로 표기하며 옛 글에는 없을 수 있다.
        "published_at": post.get("published_at"),
        "cover_image_url": post.get("cover_image_url") or None,
        # 텍스트가 없는 순수 기사 사진. cover_image_url 은 헤드라인이 박힌 카드뉴스 그래픽이라 웹 카드 사진 칸에 쓰면 텍스트가 중복되어 별도로 받는다.
        "photo_image_url": b.get("photo_image_url") or None,
        "source_url": post.get("source_url") or None,
        # body_inline.category(6개 경제 카테고리 라벨). 카테고리별 페이지 노출용.
        "category": b.get("category") or None,
        # "지면 특별 코너"(LensPreviewSection.tsx) 배치 필드이며 category 와 별개다.
        # 값은 "전체"/"증권"/"산업"/"시그널" 중 하나이고, 지정된 글만 해당 코너에 노출된다.
        "paper_section": b.get("paper_section") or None,
        # 지면 특별 코너 내 정렬 키(post 최상위 필드). 기본값을 채우지 않고 None 을 전달해,
        # 프론트가 명시 지정 글과 기존 publish_date/published_at 정렬을 따르는 글을 구분하게 한다.
        "display_order": post.get("display_order"),
        "lenses": lenses,
        "is_cms": True,
    }


def shape_lens_summary(post: Dict[str, Any]) -> Dict[str, Any]:
    """목록(다건) 응답 전용 축약판.

    lens 글은 4포맷 전체(paragraphs·컷 이미지·전체 대본 등)를 담아 다른 채널보다 10~50배 무겁고,
    limit 300 근처에서 Lambda 동기 응답 6MB 한도를 넘겨 500이 발생한다.
    목록에 필요한 label/question/bullets 만 남기고 나머지는 제거한다.
    전체 콘텐츠는 단건 조회(`/api/v2/posts/{id}?channel=lens`, shape_lens)로 받는다.
    """
    shaped = shape_lens(post)
    shaped["lenses"] = [
        {"label": item["label"], "question": item["question"], "bullets": item["bullets"]}
        for item in shaped["lenses"]
    ]
    return shaped


def shape_webtoon_summary(post: Dict[str, Any]) -> Dict[str, Any]:
    """목록(다건) 응답 전용 축약판.

    webtoon 글은 컷 수십 장을 panels 에 담아 목록 응답이 Next.js data cache 2MB 상한을 넘는다.
    목록 소비처는 panels 를 사용하지 않으므로 비운다(cover_image_url 의 panels[0] 대체값은 비우기 전에 계산된다).
    컷 갤러리는 단건 조회(`/api/v2/posts/{slug}?channel=webtoon`, shape_webtoon)로 받는다.
    """
    shaped = shape_webtoon(post)
    shaped["panels"] = []
    return shaped


def shape_home_player_item(post: Dict[str, Any]) -> Dict[str, Any]:
    """홈 하단 플레이 카드("오늘의 핵심 뉴스") 재생목록 항목.

    기사와 무관하게 관리자가 "제목 + 유튜브 링크"로 만든 독립 콘텐츠이며,
    TodayNewsPlayer.tsx 가 display_order 오름차순으로 재생한다.
    """
    return {
        "id": post["slug"],
        "title": post.get("headline") or "",
        "excerpt": post.get("subtitle") or "",
        "date": post.get("publish_date") or "",
        "published_at": post.get("published_at"),
        "media_embed_url": post.get("media_embed_url") or "",
        "display_order": post.get("display_order") if post.get("display_order") is not None else 0,
        "category": (post.get("body_inline") or {}).get("category") or None,
        # 팟캐스트 전체 대본(접근성용).
        "transcript": (post.get("body_inline") or {}).get("transcript") or None,
    }


def shape_home_player_summary(post: Dict[str, Any]) -> Dict[str, Any]:
    """목록(다건) 응답 전용 축약판. 전체 대본(transcript)을 제거해 응답 크기를 줄인다.

    transcript 는 상세 페이지(/listen/{id})만 사용하며 단건 조회(shape_home_player_item)로 받는다.
    """
    shaped = shape_home_player_item(post)
    shaped["transcript"] = None
    return shaped


SHAPERS = {
    "letters": shape_letter,
    "paper": shape_paper,
    # feed 는 개인화 랭킹 대상이 아니라 상단 고정 카드이며, 모양은 letters 와 같다.
    "feed": shape_letter,
    "webtoon": shape_webtoon,
    "video": shape_video,
    "lens": shape_lens,
    "home_player": shape_home_player_item,
}
