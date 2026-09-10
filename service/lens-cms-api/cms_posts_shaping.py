"""CMS 글 채널별 응답 shaping — handlers/cms_posts_public.py에서 추출
(2026-08-24, 코드 리팩토링 감사 Track B, God 파일 분해).

채널별로 응답 모양이 다르다. 프론트가 기존 응답과 머지할 수 있도록,
'letters' 는 ApiLetter 모양으로, 'paper' 는 front-page article 모양으로 shaping 한다.
"""
from __future__ import annotations

from typing import Any, Dict, List

# editor_id 가 NULL 인 글의 표시 명의 (spec §5.1.1) — "편집팀"처럼 딱딱한
# 직함 대신 짧게. 프론트 todayLettersApi.ts DEFAULT_META.editorName 과 맞춘다.
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
        # 발행 완료 시각(ISO, UTC, 초 단위) — 2026-08-23, 사용자 요청: "이
        # 서비스에 있는 건 날짜만 말고 시간/분도 있어야 함". lens와 같은
        # 이유·같은 패턴(shared/lib/date.ts kstDateTimeLabel).
        "published_at": post.get("published_at"),
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
        # 텍스트 없는 순수 기사 사진(v1.32) — shape_lens와 같은 이유로 추가.
        # channel=letters 조회는 admin_channel='letters'뿐 아니라 letter
        # 포맷 rendition이 있는 모든 글(=거의 모든 lens 글)을 돌려주는데,
        # cover_image_url은 웹툰 첫 컷(있으면)이라 이 필드 없이는 홈
        # "최신 뉴스" 그리드가 letters 경로로 들어온 lens 글의 썸네일을
        # 웹툰 삽화로 잘못 표시한다(v1.30이 shape_video에서 고쳤던 것과
        # 동일 증상, 사용자 신고로 발견). 프론트는 이 값을 cover_image_url
        # 보다 우선한다(todayLettersApi.ts::toTodayLetterCard).
        "photo_image_url": b.get("photo_image_url") or None,
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


def shape_paper(post: Dict[str, Any]) -> Dict[str, Any]:
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
        "editor_id": post.get("editor_id") or DEFAULT_EDITOR,
        "title": post.get("headline") or "",
        "excerpt": post.get("subtitle") or "",
        "date": post.get("publish_date") or "",
        "published_at": post.get("published_at"),
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


def shape_video(post: Dict[str, Any]) -> Dict[str, Any]:
    """영상 콘텐츠(2026-08-06) — 외부(YouTube 등) 임베드 URL 하나만 있으면
    되는 가벼운 포맷. admin이 body_inline.video_url 을 채운다. 썸네일은
    admin이 직접 지정 안 하면 프론트가 YouTube URL에서 자동 추출한다.

    ⚠️ v1.30 — thumbnail_url 우선순위를 cover_image_url → media_assets.
    thumbnail_url → photo_image_url → cover_image_url로 바꿨다.
    cover_image_url은 lens 4포맷(레터/웹툰/팟캐스트/영상) 전체가 공유하는
    "인스타 카드뉴스" 그래픽인데(shape_lens 주석 참조), 그중 웹툰 포맷의
    첫 컷 이미지로 채워지는 경우가 대부분이라(파이프라인 로직) 영상 카드에
    쓰면 실제로는 웹툰 삽화가 뜬다(사용자 신고: "영상 부분도... 웹툰거를
    가져와서 쓰고 있네"). media_assets.thumbnail_url(진짜 영상 프레임
    캡처)은 쓰기 경로가 아직 채운 적이 없어 현재는 거의 항상 비어있지만
    스키마·읽기 경로는 미리 연결해 둔다 — photo_image_url("텍스트 없는
    순수 기사 사진")이 지금 실질적인 1차 폴백."""
    b = post.get("body_inline") or {}
    return {
        "id": post["slug"],
        "title": post.get("headline") or "",
        "excerpt": post.get("subtitle") or "",
        "date": post.get("publish_date") or "",
        "published_at": post.get("published_at"),
        "video_url": b.get("video_url") or "",
        "thumbnail_url": (
            post.get("media_thumbnail_url")
            or b.get("photo_image_url")
            or post.get("cover_image_url")
            or None
        ),
        "is_cms": True,
    }


def shape_lens(post: Dict[str, Any]) -> Dict[str, Any]:
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
            # "팟캐스트"·"영상" 포맷 전용 전체 대본 텍스트(2026-08-23, 사용자
            # 요청 — 청각장애인 접근성용, 타임스탬프 동기화 없이 그냥 본문만).
            # mustknow_auto/frontpage_auto run.py가 발행 시 채운다 — 레터는
            # 이미 paragraphs가 그 역할을 하고, 웹툰은 images[].caption이
            # 컷별 대사를 이미 담고 있어서 별도로 안 채움.
            "transcript": item.get("transcript") or None,
        }
        for item in (b.get("lenses") or [])
    ]
    return {
        "id": post["slug"],
        "editor_id": post.get("editor_id") or DEFAULT_EDITOR,
        "headline": post.get("headline") or "",
        "context": post.get("subtitle") or "",
        "date": post.get("publish_date") or "",
        "updated_at": post.get("updated_at"),
        # 발행 완료 시각(ISO, UTC, 초 단위 — 2026-08-23, 사용자 지적: "날짜만
        # 나와서" — 지면 1면 그리드·상세 페이지 둘 다 날짜만 있고 시:분이
        # 없었다). mustknow_auto/frontpage_auto가 실제 발행 완료 시점에
        # 기록하는 published_at을 그대로 내려준다 — 프론트가 KST로 변환해
        # "입력 2026.08.23 16:37" 형태로 표기(shared/lib/date.ts
        # kstDateTimeLabel). 옛 글은 이 필드가 없을 수 있어 옵셔널.
        "published_at": post.get("published_at"),
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
        # "지면 특별 코너"(LensPreviewSection.tsx) 전용 배치 필드(2026-08-21
        # 신설) — 위 category와 완전히 별개다. 처음엔 지면 특별 코너의
        # "전체" 탭이 category 무관 최신순이었는데, 이후 발행된 산업/증권
        # 카테고리 글이 전부 "전체"에도 같이 떠버리는 문제가 생겼다(사용자
        # 지적: "산업 1면에만 올라가야 하는데 지면 1면에도 들어갔네요...
        # 지면 1면은 지면 1면 기사만 들어가는 겁니다. '전체'가 아니예요").
        # 원인은 category 필드 하나를 (a) /markets·/industry 같은 일반
        # 경제 카테고리 페이지, (b) 지면 특별 코너 4탭(전체/증권/산업/시그널)
        # 배치 — 서로 다른 두 목적에 같이 써서 겹친 것. 값은 "전체"/"증권"/
        # "산업"/"시그널" 중 하나(사람이 명시적으로 골라야 지면 특별
        # 코너에 뜬다 — 없으면 그 코너엔 아예 안 뜨고 카테고리 페이지에만
        # 남는다).
        "paper_section": b.get("paper_section") or None,
        # 지면 특별 코너 내 명시적 정렬 키(2026-08-21) — home_player 채널의
        # display_order와 같은 최상위 필드(posts_repo.py의 범용 _UPDATABLE
        # 목록에 이미 있어 쓰기 경로는 공용, body_inline이 아니라 post 최상위에
        # 저장). 그 전까지는 지면 순서를 맞추려면 published_at을 정렬 키인
        # 척 수동으로 재기록해야 했다(§2 등에서 4번 반복). home_player와
        # 달리 기본값을 0으로 채우지 않는다 — None을 그대로 넘겨서 프론트가
        # "명시적으로 순서를 지정한 글"과 "아직 지정 안 해서 기존
        # publish_date/published_at 정렬을 그대로 따라야 하는 글"을 구분할
        # 수 있게 한다(LensPreviewSection.tsx).
        "display_order": post.get("display_order"),
        "lenses": lenses,
        "is_cms": True,
    }


def shape_lens_summary(post: Dict[str, Any]) -> Dict[str, Any]:
    """목록(다건) 응답 전용 축약판(2026-09-03, 사용자 질문 "channel=lens가
    limit 300 근처에서 500 나는 원인이 뭐냐"로 조사 후 신설).

    원인: lens 글 하나가 4포맷(레터/웹툰/팟캐스트/영상) 전체 —
    paragraphs·webtoon 컷 이미지 배열·팟캐스트/영상 전체 대본(transcript)
    까지 — 를 통째로 담아서, webtoon/video 글보다 10~50배 무겁다. 목록
    API는 이걸 건수만큼 그대로 이어붙여 한 응답으로 돌려주는데, limit이
    300 근처만 돼도 AWS Lambda 동기 호출의 응답 payload 6MB 하드 리밋
    (MemorySize/Timeout과 무관하게 고정, 설정으로 못 늘림)을 넘겨서 500이
    났다 — webtoon/video는 글이 가벼워서 limit=1000에서도 안 넘긴다.

    `limit`이 이 문제를 만든 게 아니다 — DynamoDB 조회 자체는 limit과
    무관하게 항상 전체를 다 읽은 뒤 마지막에 자르므로(list_published_posts
    참조), limit을 낮춰도 DB 비용은 안 줄고 응답 크기만 줄어 증상이 가려질
    뿐이었다.

    그래서 진짜 수정은 응답 자체를 가볍게 만드는 것 — 목록에 필요한
    필드(label/question/bullets)만 남기고 무거운 필드(paragraphs/images/
    video_url/thumbnail_url/media_url/transcript)는 뺀다. 프론트 목록
    소비처(LensPreviewSection.tsx/LensListClient.tsx) 전부 label·question·
    bullets까지만 쓰는 걸 확인했다 — 4포맷 전체 콘텐츠가 실제로 필요한
    곳(온보딩 체험 화면, lens 상세 페이지)은 단건 조회
    (`/api/v2/posts/{id}?channel=lens`, shape_lens 그대로)로 이미 따로
    받는다(service/frontend의 fetchLensBySlug 참조 — 단건 조회는 이 축약
    대상이 아니다, cms_posts_public.py의 slug 분기는 여전히 shape_lens를
    쓴다)."""
    shaped = shape_lens(post)
    shaped["lenses"] = [
        {"label": item["label"], "question": item["question"], "bullets": item["bullets"]}
        for item in shaped["lenses"]
    ]
    return shaped


def shape_webtoon_summary(post: Dict[str, Any]) -> Dict[str, Any]:
    """목록(다건) 응답 전용 축약판(2026-09-07, 사이트 전역 응답 지연 조사 —
    shape_lens_summary와 같은 문제를 webtoon 채널에서도 발견).

    webtoon 글 하나가 컷(이미지+캡션) 수십 장을 `panels`에 통째로 담는다 —
    limit=1000 목록 응답이 706건 기준 실측 3.2MB로, Next.js data cache
    2MB 상한을 넘겨 캐시가 아예 안 붙는 원인이었다(cmsPostsApi.ts의
    cacheOpts 참조).

    목록 소비처(WebtoonListClient/WebtoonPreviewSection/SeriesViewClient/
    AllWebtoonsClient — 프론트가 이미 toWebtoonPreviewSummaries()/
    toWebtoonSeriesListPayload()로 panels를 지우고 쓰던 것과 동일 확인)는
    전부 panels를 안 읽는다 — cover_image_url만 쓰고, 실제 컷 갤러리는
    상세 페이지(`/api/v2/posts/{slug}?channel=webtoon`, shape_webtoon
    그대로)에서 단건으로 받는다. cover_image_url의 panels[0] 폴백은
    panels를 비우기 전에 이미 계산돼 있으므로 그대로 유지된다."""
    shaped = shape_webtoon(post)
    shaped["panels"] = []
    return shaped


def shape_home_player_item(post: Dict[str, Any]) -> Dict[str, Any]:
    """홈 화면 하단 플레이 카드("오늘의 핵심 뉴스") 재생목록 항목(2026-08-16).
    기사와 무관하게 관리자가 직접 "제목 + 유튜브 링크"로 만드는 독립
    콘텐츠 — admin/frontend home-player 화면 전용, TodayNewsPlayer.tsx가
    display_order 오름차순으로 재생한다.

    date/excerpt 추가(2026-08-21) — 전용 목록/상세 페이지(/listen) 신설로
    검색엔진에 노출시키면서 다른 채널 shaper(shape_video 등)와 필드를
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
        "published_at": post.get("published_at"),
        "media_embed_url": post.get("media_embed_url") or "",
        "display_order": post.get("display_order") if post.get("display_order") is not None else 0,
        "category": (post.get("body_inline") or {}).get("category") or None,
        # 팟캐스트 전체 대본(2026-08-23, 사용자 지적 — "들어갈 때 이것만
        # 있으니까 너무 허전한데, 텍스트 스크립트 표출하면 어떰?"). lens
        # 글의 팟캐스트 포맷이 이미 갖고 있던 접근성용 transcript를 이
        # 채널로 복제할 때 같이 옮겨온다(mustknow_auto/frontpage_auto
        # run.py 참조) — 청각장애인 접근성 겸 빈 화면 보완.
        "transcript": (post.get("body_inline") or {}).get("transcript") or None,
    }


def shape_home_player_summary(post: Dict[str, Any]) -> Dict[str, Any]:
    """목록(다건) 응답 전용 축약판(2026-09-07, shape_webtoon_summary와 같은
    조사에서 발견) — home_player 글은 팟캐스트/영상 전체 대본(transcript)을
    담는데, limit=1000 목록 응답이 실측 4.4MB까지 나갔다. `/listen/{id}`
    상세 페이지(ListenViewClient.tsx)만 transcript를 렌더하고, 그 페이지는
    fetchHomePlayerBySlug() 단건 조회(shape_home_player_item 그대로)로
    이미 따로 받는다 — 목록 소비처(ListenListClient/AudioPreviewSection/
    홈 위젯)는 title/date/media_embed_url/category까지만 쓴다."""
    shaped = shape_home_player_item(post)
    shaped["transcript"] = None
    return shaped


SHAPERS = {
    "letters": shape_letter,
    "paper": shape_paper,
    # feed 는 개인화 랭킹 대상이 아니라 상단 고정 카드로 쓰인다 (spec §2.4).
    # 모양은 letters 와 같게 두고 프론트가 고정 배치한다.
    "feed": shape_letter,
    "webtoon": shape_webtoon,
    "video": shape_video,
    "lens": shape_lens,
    "home_player": shape_home_player_item,
}
