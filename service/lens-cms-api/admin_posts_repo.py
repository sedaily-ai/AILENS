"""admin CMS 글 쓰기(CRUD) — Postgres 버전 (v1.21).

admin/backend/repo/posts_repo.py(DynamoDB)와 같은 계약(create/get/
list_posts/update/set_status/soft_delete, 동일 반환 dict 모양)을
제공한다. admin Lambda는 이 모듈을 직접 import하지 않고, 이 파일이
노출하는 HTTP 엔드포인트(main.py의 /admin/posts*)를 통해 호출한다 —
admin Lambda가 RDS에 직접 붙으면(오늘 해결한) Lambda+RDS 문제가 admin
쪽에서도 재발하기 때문(VPC 붙이면 CloudWatch/EventBridge/SSM/webhook
등 다른 인터넷 접근이 깨짐).

설계: admin이 실제로 쓰는 CmsPost 문서는 "채널 하나 = 문서 하나"다
(같은 source_url을 공유하는 형제 채널도 각자 독립 문서 — admin_extra
JSONB 전체를 admin의 원본 body_inline 그대로 보존해 완벽한 라운드트립을
보장하고, renditions/webtoon_panels/media_assets/rendition_blocks는
공개 읽기 API(cms_posts_repo.py)만을 위한 파생 프로젝션으로 별도
생성한다 — 두 표현을 쓰기 시점에 동시에 만들 뿐, 진실의 원천은
admin_extra 쪽이다.
"""
from __future__ import annotations

import json
import re
import uuid
from typing import Any, Dict, List, Optional

from db import get_cursor

_VALID_STATUS = ("draft", "published", "archived")

_CHANNEL_TO_FORMAT = {
    "letters": "letter",
    "feed": "letter",
    "webtoon": "webtoon",
    "video": "video",
    "home_player": "podcast",
}
_LENS_LABEL_TO_FORMAT = {
    "레터": "letter",
    "웹툰": "webtoon",
    "팟캐스트": "podcast",
    "영상": "video",
}

_MAX_SLUG_LEN = 80
_NON_SLUG = re.compile(r"[^0-9A-Za-z가-힣]+")


def slugify(publish_date: str, headline: str) -> str:
    """admin/backend/shared/slug.py와 동일 로직(포팅)."""
    tail = _NON_SLUG.sub("-", (headline or "").strip()).strip("-")
    base = f"{publish_date}-{tail}" if tail else publish_date
    return base[:_MAX_SLUG_LEN].rstrip("-")


def _unique_slug(cur, publish_date: str, headline: str) -> str:
    base = slugify(publish_date, headline)
    cur.execute("SELECT slug FROM publications WHERE slug LIKE %s", (base + "%",))
    existing = {r["slug"] for r in cur.fetchall()}
    if base not in existing:
        return base
    n = 2
    while f"{base}-{n}" in existing:
        n += 1
    return f"{base}-{n}"


def _write_format_body(cur, rendition_id: int, fmt: str, source: Dict[str, Any],
                        media_embed_url: Optional[str], position_offset: int) -> int:
    """source(=body_inline 또는 lens 항목 하나)에서 fmt에 맞는 자식 행을 쓴다.
    반환값은 다음에 이어 쓸 position(관점 라벨이 같은 포맷에 누적될 때 씀)."""
    if fmt == "letter":
        paragraphs = source.get("paragraphs") or source.get("body") or []
        pos = position_offset
        for text in paragraphs:
            if not text:
                continue
            cur.execute(
                "INSERT INTO rendition_blocks (rendition_id, position, block_type, content) "
                "VALUES (%s,%s,'text',%s)",
                (rendition_id, pos, text),
            )
            pos += 1
        return pos
    if fmt == "webtoon":
        images = source.get("images") or []
        pos = position_offset
        for img in images:
            url = (img or {}).get("url")
            if not url:
                continue
            cur.execute(
                "INSERT INTO webtoon_panels (rendition_id, position, image_url, dialogue) "
                "VALUES (%s,%s,%s,%s)",
                (rendition_id, pos, url, (img or {}).get("caption")),
            )
            pos += 1
        return pos
    if fmt == "video":
        video_url = source.get("video_url")
        if video_url:
            # v1.31 — thumbnail_url(진짜 영상 프레임 캡처)도 같이 쓴다. 컬럼은
            # 원래 스키마에 있었지만 이 INSERT가 한 번도 값을 넣은 적이 없어
            # 죽어있었다(v1.30에서 읽기 경로만 먼저 연결, 쓰기는 이번에 마저).
            cur.execute(
                "INSERT INTO media_assets (rendition_id, media_type, file_url, thumbnail_url, transcript) "
                "VALUES (%s,'video',%s,%s,%s) ON CONFLICT (rendition_id) DO NOTHING",
                (rendition_id, video_url, source.get("thumbnail_url"), source.get("transcript")),
            )
        return position_offset
    if fmt == "podcast":
        audio_url = media_embed_url or source.get("media_url")
        if audio_url:
            cur.execute(
                "INSERT INTO media_assets (rendition_id, media_type, file_url, transcript) "
                "VALUES (%s,'audio',%s,%s) ON CONFLICT (rendition_id) DO NOTHING",
                (rendition_id, audio_url, source.get("transcript")),
            )
        return position_offset
    return position_offset


def _get_or_create_rendition(cur, pub_id: int, fmt: str) -> int:
    cur.execute(
        "INSERT INTO renditions (publication_id, format, status) VALUES (%s,%s,'ready') "
        "ON CONFLICT (publication_id, format) DO NOTHING RETURNING id",
        (pub_id, fmt),
    )
    row = cur.fetchone()
    if row:
        return row["id"]
    cur.execute("SELECT id FROM renditions WHERE publication_id=%s AND format=%s", (pub_id, fmt))
    return cur.fetchone()["id"]


def _write_channel_content(cur, pub_id: int, channel: Optional[str],
                            body_inline: Dict[str, Any], media_embed_url: Optional[str]) -> None:
    """channel에 맞는 렌디션(들)을 파생 생성한다 — 공개 읽기 API 전용
    프로젝션, admin_extra가 이미 진실의 원천이라 실패해도 admin 쓰기
    자체를 막지 않는다(호출부에서 감쌀 것)."""
    body_inline = body_inline or {}
    if channel == "lens":
        position_by_format: Dict[str, int] = {}
        for item in (body_inline.get("lenses") or []):
            label = item.get("label") or ""
            fmt = _LENS_LABEL_TO_FORMAT.get(label, "letter")
            rendition_id = _get_or_create_rendition(cur, pub_id, fmt)
            offset = position_by_format.get(fmt, 0)
            position_by_format[fmt] = _write_format_body(cur, rendition_id, fmt, item, None, offset)
        return

    fmt = _CHANNEL_TO_FORMAT.get(channel)
    if not fmt:
        return  # paper 등 렌디션 없는 채널 — publications 메타데이터만
    rendition_id = _get_or_create_rendition(cur, pub_id, fmt)
    _write_format_body(cur, rendition_id, fmt, body_inline, media_embed_url, 0)


def _to_dict(pub: Dict[str, Any], view_channel: Optional[str] = None) -> Dict[str, Any]:
    extra = pub.get("admin_extra") or {}
    admin_channel = pub.get("admin_channel")
    body_inline = extra.get("body_inline") or {}

    # 2026-09-11 — lens 번들(자동 파이프라인 발행물)을 웹툰/영상/홈플레이어
    # 관리 화면에서 열람할 때 대응 — admin_extra.body_inline은 4포맷이
    # lenses[] 배열에 중첩된 모양이라 그 화면들의 편집기(WebtoonMode.tsx 등)가
    # 기대하는 평평한 모양(top-level images/video_url/media_url/transcript)과
    # 안 맞는다. "웹툰 CMS에 데이터가 안 쌓인다"는 사용자 신고로 list_posts()의
    # admin_channel 완전일치 필터부터 고쳤는데(그것만으로는 목록에 나와도
    # 필드가 비어 보임), view_channel이 주어지고 이 글이 lens 번들이면 해당
    # 포맷 항목을 평평하게 얹어서 기존 편집기 코드를 안 건드리고 그대로
    # 읽게 한다 — lenses[] 원본은 그대로 남겨둔다(다른 소비처가 참조 가능).
    if admin_channel == "lens" and view_channel and view_channel != "lens":
        fmt = _CHANNEL_TO_FORMAT.get(view_channel)
        label = next((l for l, f in _LENS_LABEL_TO_FORMAT.items() if f == fmt), None) if fmt else None
        item = (
            next((it for it in (body_inline.get("lenses") or []) if it.get("label") == label), None)
            if label else None
        )
        if item:
            body_inline = {
                **body_inline,
                "images": item.get("images") or [],
                "video_url": item.get("video_url"),
                "media_url": item.get("media_url"),
                "transcript": item.get("transcript"),
                # series_title(2026-09-25 추가) — PostForm/WebtoonMode.tsx의
                # useExistingSeriesTitles가 list_posts() 응답에서 이 필드를
                # 읽는다(자동완성 제안용). lens 번들의 series_title은
                # lenses[].series_title에만 있고 이 평탄화 블록이 여태
                # 안 옮겨서, list_posts()가 lenses[] 원본을 빼면(아래 §413
                # 수정) 파이프라인 발행 웹툰의 자동완성만 조용히 비게 될
                # 뻔했다 — 여기서 같이 복사해 그 빈틈을 막는다.
                "series_title": item.get("series_title"),
            }

    return {
        "id": str(pub["admin_post_id"]),
        "slug": pub["slug"],
        "status": pub["status"],
        "channels": [admin_channel] if admin_channel else [],
        "channel": admin_channel,
        "publish_date": pub["admin_publish_date"].isoformat() if pub.get("admin_publish_date") else None,
        "editor_id": extra.get("editor_id"),
        "headline": pub.get("title") or "",
        "subtitle": pub.get("subtitle"),
        "closing_line": extra.get("closing_line"),
        "body_inline": body_inline,
        "cover_image_url": pub.get("cover_image_url") or "",
        "source_url": pub.get("source_url") or "",
        "media_embed_url": extra.get("media_embed_url"),
        "display_order": extra.get("display_order"),
        "created_by": extra.get("created_by"),
        "created_at": pub["created_at"].isoformat() if pub.get("created_at") else None,
        "updated_at": pub["updated_at"].isoformat() if pub.get("updated_at") else None,
        "published_at": pub["published_at"].isoformat() if pub.get("published_at") else None,
        # 2026-09-11 — true면 이 항목은 자동 파이프라인이 만든 4가지 시선
        # 번들의 한 포맷 슬라이스일 뿐이다. 프론트는 이 값이 true면 단일
        # 포맷 편집기(웹툰/영상/홈플레이어)에서 저장을 막아야 한다 — 저장
        # 시 body_inline 전체가 이 슬라이스 하나짜리 모양으로 덮여써져
        # 나머지 포맷이 유실된다(update()의 서버 쪽 안전장치가 한 번 더
        # 막지만, 프론트에서 먼저 잠그는 게 UX상 맞다).
        "is_lens_bundle": admin_channel == "lens",
    }


def create(data: Dict[str, Any], created_by: str) -> Dict[str, Any]:
    channels = data.get("channels") or []
    channel = channels[0] if channels else None
    publish_date = data["publish_date"]
    headline = data.get("headline", "")
    body_inline = data.get("body_inline") or {}
    admin_post_id = str(uuid.uuid4())
    extra = {
        "editor_id": data.get("editor_id"),
        "closing_line": data.get("closing_line"),
        "display_order": data.get("display_order"),
        "media_embed_url": data.get("media_embed_url"),
        "created_by": created_by,
        "body_inline": body_inline,
    }
    with get_cursor() as cur:
        slug = data.get("slug") or _unique_slug(cur, publish_date, headline)
        cur.execute(
            """
            INSERT INTO publications
                (admin_post_id, slug, title, subtitle, cover_image_url, source_url,
                 status, admin_channel, admin_publish_date, admin_extra,
                 created_at, updated_at)
            VALUES (%s,%s,%s,%s,%s,%s,'draft',%s,%s,%s, now(), now())
            RETURNING id
            """,
            (admin_post_id, slug, headline, data.get("subtitle"),
             data.get("cover_image_url"), data.get("source_url"),
             channel, publish_date, json.dumps(extra)),
        )
        pub_id = cur.fetchone()["id"]
        _write_channel_content(cur, pub_id, channel, body_inline, data.get("media_embed_url"))
    return get(admin_post_id)


def get(admin_post_id: str, view_channel: Optional[str] = None) -> Optional[Dict[str, Any]]:
    with get_cursor() as cur:
        cur.execute(
            "SELECT * FROM publications WHERE admin_post_id = %s AND deleted_at IS NULL",
            (admin_post_id,),
        )
        pub = cur.fetchone()
        return _to_dict(pub, view_channel=view_channel) if pub else None


def find_by_source_url(source_url: str) -> Optional[Dict[str, Any]]:
    """source_url로 기존 발행물 찾기(자동 파이프라인 중복 발행 방지용, v1.32).

    list_posts()와 달리 admin_post_id IS NOT NULL 제한을 안 건다 — v1.4
    이관으로 들어온 admin_post_id 없는 글도 여기서 걸려야 파이프라인이
    "이미 있는 원문 기사"를 중복 발행하지 않는다. admin_post_id가 없으면
    _to_dict()가 못 쓰므로, 그런 경우는 최소 필드만 반환한다.
    """
    with get_cursor() as cur:
        cur.execute(
            "SELECT * FROM publications WHERE source_url = %s AND deleted_at IS NULL "
            "ORDER BY created_at DESC LIMIT 1",
            (source_url,),
        )
        pub = cur.fetchone()
        if not pub:
            return None
        if pub.get("admin_post_id"):
            return _to_dict(pub)
        return {"id": None, "slug": pub["slug"], "source_url": pub.get("source_url") or ""}


def list_posts(status: Optional[str], channel: Optional[str], limit: int,
                date: Optional[str]) -> List[Dict[str, Any]]:
    with get_cursor() as cur:
        sql = "SELECT * FROM publications WHERE admin_post_id IS NOT NULL AND deleted_at IS NULL"
        params: List[Any] = []
        if status:
            sql += " AND status = %s"
            params.append(status)
        if channel:
            fmt = _CHANNEL_TO_FORMAT.get(channel)
            if fmt:
                # 2026-09-11 — "웹툰 CMS에 데이터가 안 쌓인다" 사용자 신고로
                # 발견: 자동 파이프라인 발행물은 전부 admin_channel='lens'라
                # (실측: admin_post_id 있는 277건 전부) 완전일치 필터로는
                # 웹툰/영상/홈플레이어 관리 화면이 파이프라인 콘텐츠를
                # 영원히 못 찾았다. 공개 읽기 API(cms_posts_repo.py)가 이미
                # 쓰는 "채널=포맷 렌디션 존재 여부" 판정과 같은 원칙으로,
                # admin이 직접 그 채널로 쓴 글(admin_channel 완전일치) OR
                # 해당 포맷 렌디션을 가진 lens 번들도 같이 찾는다.
                sql += (
                    " AND (admin_channel = %s OR EXISTS ("
                    "SELECT 1 FROM renditions r "
                    "WHERE r.publication_id = publications.id AND r.format = %s"
                    "))"
                )
                params += [channel, fmt]
            else:
                sql += " AND admin_channel = %s"
                params.append(channel)
        if date:
            sql += " AND admin_publish_date = %s"
            params.append(date)
        sql += " ORDER BY admin_publish_date DESC NULLS LAST, created_at DESC LIMIT %s"
        params.append(limit)
        cur.execute(sql, params)
        posts = [_to_dict(r, view_channel=channel) for r in cur.fetchall()]

    # 2026-09-25 — GET /admin/posts가 Lambda 동기 응답 한도(6MB)를 넘겨
    # 413으로 매일 여러 번 죽고 있었다(admin/backend 로그 실측). 원인:
    # 목록 응답이 상세 조회와 같은 _to_dict()를 그대로 써서 lens 번들
    # (admin_post_id 있는 글 전부 — "277건 전부" 위 주석 참고)마다
    # body_inline.lenses[](4포맷 전체 — 이미지 배열+영상/팟캐스트
    # transcript 전문까지 중복 보유)를 통째로 실어 보냈다. 목록 화면
    # 어디서도 이 원본 배열을 직접 읽지 않는다(admin/frontend 조사 —
    # /posts는 body_inline.category만, /webtoon·/video·/home-player는
    # 위 _to_dict()가 이미 평탄화해 body_inline 최상위에 복사해둔
    # images/video_url/media_url/transcript/series_title만 읽는다) —
    # 그래서 이 무거운 원본만 목록 응답에서 뺀다. 저장 경로
    # (_update_lens_bundle_slice)는 클라이언트가 보낸 body_inline의
    # lenses를 신뢰하지 않고 DB에 저장된 lenses를 다시 읽어 그 포맷
    # 슬라이스 하나만 바꾸므로, 목록에서 lenses가 빠져도 저장 시
    # 데이터 유실이 없다. 상세 조회(get())는 이 함수를 안 거치므로
    # "4가지 시선" 편집기가 필요로 하는 전체 lenses[]를 그대로 받는다.
    for post in posts:
        body_inline = post.get("body_inline")
        if isinstance(body_inline, dict) and "lenses" in body_inline:
            body_inline.pop("lenses", None)
    return posts


def _update_lens_bundle_slice(
    cur, pub: Dict[str, Any], pub_id: int, extra: Dict[str, Any],
    edit_channel: str, data: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    """lens 번들(4가지 시선)의 한 포맷만 스코프해서 저장한다(2026-09-11
    신설) — 웹툰/영상/홈플레이어 편집기로 lens 번들을 열었을 때, 처음엔
    저장 자체를 막았는데(admin_extra.body_inline 전체를 그 포맷 하나짜리
    모양으로 덮어써 나머지 포맷이 유실되는 걸 막기 위함) 사용자가 "웹툰도
    따로 완성해서 저장할 수 있어야 한다"고 요청 — 통째로 덮어쓰는 대신
    body_inline.lenses[] 배열에서 이 포맷 항목 하나만 바꾸고 나머지
    (레터·팟캐스트·영상)는 그대로 보존한다. 파생 프로젝션(renditions/
    webtoon_panels/media_assets)도 이 포맷의 렌디션만 다시 쓴다."""
    fmt = _CHANNEL_TO_FORMAT.get(edit_channel)
    label = next((l for l, f in _LENS_LABEL_TO_FORMAT.items() if f == fmt), None)
    if not fmt or not label:
        raise ValueError(f"지원하지 않는 편집 채널입니다: {edit_channel}")

    body_inline = dict(extra.get("body_inline") or {})
    lenses = [dict(it) for it in (body_inline.get("lenses") or [])]
    idx = next((i for i, it in enumerate(lenses) if it.get("label") == label), None)
    item = dict(lenses[idx]) if idx is not None else {"label": label, "question": "", "bullets": []}

    incoming_body = data.get("body_inline") or {}
    if fmt == "webtoon":
        item["images"] = incoming_body.get("images") or []
        # 2026-09-20 — 이 스코프 저장 경로가 images만 바꾸고 pending은 건드리지
        # 않아서, 실제로 컷 이미지를 저장해도 사이트엔 "준비 중"으로 계속 떴다
        # (실사용 백필 중 실측 발견 — 이미지 8장 저장 후 재조회해도 pending
        # True 그대로). publish_utils.py의 자동 파이프라인 경로는 애초에
        # "pending": not webtoon_images로 매번 새로 계산해서 이 문제가 없었다
        # — 여기도 같은 규칙을 적용한다.
        item["pending"] = not item["images"]
        if "series_title" in incoming_body:
            item["series_title"] = incoming_body.get("series_title")
    elif fmt == "video":
        item["video_url"] = incoming_body.get("video_url")
        item["thumbnail_url"] = incoming_body.get("thumbnail_url")
        item["transcript"] = incoming_body.get("transcript")
    elif fmt == "podcast":
        # home-player 화면(홈 플레이어 Row)은 오디오/유튜브 링크를
        # body_inline.media_url이 아니라 최상위 media_embed_url로 보낸다
        # (home-player/page.tsx의 Row.save() 참조) — body_inline.media_url만
        # 보면 GET이 투영해 되돌려준 "저장 전" 값을 그대로 다시 저장해
        # admin_extra(진실의 원천)가 실제 방금 바뀐 URL과 어긋난다.
        item["media_url"] = data.get("media_embed_url") or incoming_body.get("media_url")
        item["transcript"] = incoming_body.get("transcript")

    if idx is not None:
        lenses[idx] = item
    else:
        lenses.append(item)
    body_inline["lenses"] = lenses
    # category는 lens 번들 전체(레터/웹툰/팟캐스트/영상 공통)에 적용되는
    # 사이트 카테고리다(display_category()가 읽는 자리와 동일) — 이
    # 편집기의 "카테고리" 필드가 실제로 이 top-level 키를 바꾼다.
    if "category" in incoming_body:
        body_inline["category"] = incoming_body["category"]
    # subcategory(하위 카테고리, 2026-10-01 신설) — category와 같은 자리에
    # 같은 패턴으로 저장. 카테고리 아카이브 페이지(/markets 등)의 2단 탭
    # (econSubcategories.ts)이 이 값으로 추가 필터링한다.
    if "subcategory" in incoming_body:
        body_inline["subcategory"] = incoming_body["subcategory"]
    extra["body_inline"] = body_inline

    set_clauses = ["admin_extra = %s"]
    params: List[Any] = [json.dumps(extra)]
    if "headline" in data:
        set_clauses.append("title = %s")
        params.append(data["headline"])
    if "subtitle" in data:
        set_clauses.append("subtitle = %s")
        params.append(data["subtitle"])
    if "cover_image_url" in data:
        set_clauses.append("cover_image_url = %s")
        params.append(data["cover_image_url"])
    if "publish_date" in data:
        set_clauses.append("admin_publish_date = %s")
        params.append(data["publish_date"])
    set_clauses.append("updated_at = now()")
    params.append(pub_id)
    cur.execute(f"UPDATE publications SET {', '.join(set_clauses)} WHERE id = %s", params)

    rendition_id = _get_or_create_rendition(cur, pub_id, fmt)
    if fmt == "webtoon":
        cur.execute("DELETE FROM webtoon_panels WHERE rendition_id = %s", (rendition_id,))
    elif fmt in ("video", "podcast"):
        cur.execute("DELETE FROM media_assets WHERE rendition_id = %s", (rendition_id,))
    _write_format_body(cur, rendition_id, fmt, item, data.get("media_embed_url"), 0)

    # get(...)로 재조회하면 새 커넥션(pool.getconn())을 새로 얻는데, 이
    # 함수는 아직 커밋 전(바깥 update()의 with get_cursor() 블록 안)이라
    # 다른 커넥션에서는 이 UPDATE가 안 보인다 — 응답이 방금 저장한 값이
    # 아니라 저장 전 값을 돌려주는 버그였다(로컬 실전 데이터 테스트로
    # 발견). 같은 트랜잭션(같은 cur)에서 바로 재조회해 해결.
    cur.execute("SELECT * FROM publications WHERE id = %s", (pub_id,))
    return _to_dict(cur.fetchone(), view_channel=edit_channel)


def update(admin_post_id: str, data: Dict[str, Any], edit_channel: Optional[str] = None) -> Optional[Dict[str, Any]]:
    with get_cursor() as cur:
        cur.execute(
            "SELECT * FROM publications WHERE admin_post_id = %s AND deleted_at IS NULL",
            (admin_post_id,),
        )
        pub = cur.fetchone()
        if not pub:
            return None
        pub_id = pub["id"]
        extra = dict(pub.get("admin_extra") or {})
        is_lens_bundle = pub.get("admin_channel") == "lens"

        # 2026-09-11 — edit_channel이 주어지면(웹툰/영상/홈플레이어 편집기가
        # ?channel=X로 자기 채널을 밝힌 경우) lens 번들의 그 포맷 슬라이스만
        # 스코프해서 저장한다 — _update_lens_bundle_slice() 참조.
        if is_lens_bundle and edit_channel and edit_channel != "lens":
            return _update_lens_bundle_slice(cur, pub, pub_id, extra, edit_channel, data)

        # 안전장치 — edit_channel 없이(구버전 프론트 등) lens 번들을 통째로
        # 덮어쓰려는 시도는 막는다. admin_extra.body_inline 전체가 단일
        # 포맷 모양으로 덮여써져 나머지 포맷이 유실되는 걸 방지(2026-09-11).
        if is_lens_bundle and ("channels" in data or "body_inline" in data):
            if data.get("channels") != ["lens"]:
                raise ValueError(
                    "이 글은 자동 파이프라인이 만든 '4가지 시선' 번들입니다 — "
                    "이 편집기로는 저장할 수 없습니다. '4가지 시선'에서 편집해 주세요."
                )

        set_clauses = []
        params: List[Any] = []
        if "headline" in data:
            set_clauses.append("title = %s")
            params.append(data["headline"])
        if "subtitle" in data:
            set_clauses.append("subtitle = %s")
            params.append(data["subtitle"])
        if "cover_image_url" in data:
            set_clauses.append("cover_image_url = %s")
            params.append(data["cover_image_url"])
        if "source_url" in data:
            set_clauses.append("source_url = %s")
            params.append(data["source_url"])
        if "publish_date" in data:
            set_clauses.append("admin_publish_date = %s")
            params.append(data["publish_date"])

        new_channel = pub.get("admin_channel")
        channel_or_body_changed = False
        if "channels" in data:
            channels = data["channels"] or []
            new_channel = channels[0] if channels else None
            set_clauses.append("admin_channel = %s")
            params.append(new_channel)
            channel_or_body_changed = True

        for key in ("editor_id", "closing_line", "display_order", "media_embed_url"):
            if key in data:
                extra[key] = data[key]
        if "body_inline" in data:
            extra["body_inline"] = data["body_inline"] or {}
            channel_or_body_changed = True

        set_clauses.append("admin_extra = %s")
        params.append(json.dumps(extra))
        set_clauses.append("updated_at = now()")
        params.append(pub_id)
        cur.execute(f"UPDATE publications SET {', '.join(set_clauses)} WHERE id = %s", params)

        if channel_or_body_changed:
            cur.execute("DELETE FROM renditions WHERE publication_id = %s", (pub_id,))
            _write_channel_content(cur, pub_id, new_channel, extra.get("body_inline") or {}, extra.get("media_embed_url"))
    return get(admin_post_id)


def set_status(admin_post_id: str, status: str) -> Optional[Dict[str, Any]]:
    if status not in _VALID_STATUS:
        raise ValueError(f"invalid status: {status}")
    with get_cursor() as cur:
        cur.execute(
            "SELECT id, published_at FROM publications WHERE admin_post_id = %s AND deleted_at IS NULL",
            (admin_post_id,),
        )
        pub = cur.fetchone()
        if not pub:
            return None
        if status == "published" and not pub.get("published_at"):
            cur.execute(
                "UPDATE publications SET status=%s, published_at=now(), updated_at=now() WHERE id=%s",
                (status, pub["id"]),
            )
        else:
            cur.execute(
                "UPDATE publications SET status=%s, updated_at=now() WHERE id=%s",
                (status, pub["id"]),
            )
    return get(admin_post_id)


def soft_delete_empty_by_slugs(slugs: List[str], dry_run: bool = True) -> Dict[str, Any]:
    """admin_post_id가 없는 옛 글(v1.4 이관 이전 테스트 글 등)을 slug로 소프트 삭제한다.

    soft_delete()는 admin_post_id로만 찾아서 이런 글을 못 지운다. 대신 범위를 좁게 막는다:
      - 요청한 slug가 DB에 전부 있어야 하고(오타·누락 방지),
      - 원문 링크(source_url)가 있는 글(실제 기사)이거나 이미 삭제된 글이 하나라도 섞여 있으면 아무것도 바꾸지 않는다.
    하나라도 어긋나면 ValueError를 던지고(get_cursor가 롤백), dry_run=True(기본)면 조회만 한다. 복구는 deleted_at을 NULL로 되돌리면 된다."""
    if not slugs or len(slugs) > 50 or len(set(slugs)) != len(slugs):
        raise ValueError("slugs는 1~50개, 중복 없이")
    with get_cursor() as cur:
        cur.execute(
            "SELECT id, slug, title, status, admin_post_id, source_url, deleted_at FROM publications WHERE slug = ANY(%s) ORDER BY slug",
            (slugs,),
        )
        rows = cur.fetchall()
        missing = sorted(set(slugs) - {r["slug"] for r in rows})
        blocked = sorted(r["slug"] for r in rows if r["source_url"] or r["deleted_at"])
        if missing or blocked:
            raise ValueError(f"조건 불일치: DB에 없음={missing}, 원문링크 있음/이미 삭제됨={blocked}")
        matched = [
            {"slug": r["slug"], "title": (r["title"] or "")[:40], "status": r["status"], "has_admin_post_id": bool(r["admin_post_id"])}
            for r in rows
        ]
        if dry_run:
            return {"dry_run": True, "matched": len(rows), "posts": matched}
        cur.execute(
            "UPDATE publications SET deleted_at = now(), updated_at = now() "
            "WHERE slug = ANY(%s) AND deleted_at IS NULL AND source_url IS NULL",
            (slugs,),
        )
        if cur.rowcount != len(slugs):
            raise ValueError(f"삭제 행 수 불일치: {cur.rowcount} != {len(slugs)}")
        return {"dry_run": False, "deleted": cur.rowcount, "posts": matched}


# 분류 개편(2026-10-09) 대분류 9개. service/frontend/src/shared/constants/econCategories.ts·pipelines/common/publish_utils.py와 같은 값이다(의도적 복제).
_NEW_CATEGORIES = {"시그널", "부동산", "경제", "금융", "산업", "정치", "사회", "국제", "문화"}


def reclassify_by_slugs(items: List[Dict[str, Any]], dry_run: bool = True) -> Dict[str, Any]:
    """글의 분류(category)·하위 분류(subcategory)를 slug 기준으로 바꾼다. admin_post_id가 없는 옛 글도 대상이다.

    저장 위치는 공개 읽기 경로(_apply_admin_extra)가 읽는 admin_extra.body_inline.category/subcategory 이며 다른 필드는 건드리지 않는다.
    dry_run=True(기본)면 바꿀 내용만 돌려준다. 하나라도 어긋나면(ValueError) 아무것도 바꾸지 않는다(get_cursor가 롤백):
      - 1~200건, slug 중복 없음, 대분류가 새 9개 중 하나, 하위 분류는 문자열 또는 null
      - 요청한 slug가 DB에 모두 있고 삭제되지 않은 글일 것"""
    if not items or len(items) > 200:
        raise ValueError("items는 1~200건")
    slugs = [it.get("slug") for it in items]
    if not all(isinstance(s, str) and s for s in slugs) or len(set(slugs)) != len(slugs):
        raise ValueError("slug는 비어 있지 않은 문자열이고 중복이 없어야 합니다")
    for it in items:
        if it.get("category") not in _NEW_CATEGORIES:
            raise ValueError(f"대분류가 새 체계에 없음: {it.get('slug')} → {it.get('category')!r}")
        sub = it.get("subcategory")
        if sub is not None and (not isinstance(sub, str) or len(sub) > 30):
            raise ValueError(f"하위 분류 형식 오류: {it.get('slug')}")
    with get_cursor() as cur:
        cur.execute(
            "SELECT id, slug, deleted_at, admin_extra->'body_inline'->>'category' AS category, "
            "admin_extra->'body_inline'->>'subcategory' AS subcategory FROM publications WHERE slug = ANY(%s)",
            (slugs,),
        )
        rows = {r["slug"]: r for r in cur.fetchall()}
        missing = sorted(set(slugs) - set(rows))
        gone = sorted(s for s, r in rows.items() if r["deleted_at"])
        if missing or gone:
            raise ValueError(f"조건 불일치: DB에 없음={missing}, 이미 삭제됨={gone}")
        changes = [
            {
                "slug": it["slug"],
                "before": {"category": rows[it["slug"]]["category"], "subcategory": rows[it["slug"]]["subcategory"]},
                "after": {"category": it["category"], "subcategory": it.get("subcategory")},
            }
            for it in items
        ]
        if dry_run:
            return {"dry_run": True, "count": len(changes), "changes": changes}
        for it in items:
            cur.execute(
                "UPDATE publications SET updated_at = now(), admin_extra = jsonb_set("
                "COALESCE(admin_extra, '{}'::jsonb), '{body_inline}', "
                "COALESCE(admin_extra->'body_inline', '{}'::jsonb) || jsonb_build_object('category', %s::text, 'subcategory', %s::text)) "
                "WHERE slug = %s AND deleted_at IS NULL",
                (it["category"], it.get("subcategory"), it["slug"]),
            )
            if cur.rowcount != 1:
                raise ValueError(f"갱신 실패(행 수 {cur.rowcount}): {it['slug']}")
        return {"dry_run": False, "count": len(changes), "changes": changes}


def soft_delete(admin_post_id: str) -> bool:
    with get_cursor() as cur:
        cur.execute(
            "SELECT id FROM publications WHERE admin_post_id = %s AND deleted_at IS NULL",
            (admin_post_id,),
        )
        pub = cur.fetchone()
        if not pub:
            return False
        cur.execute(
            "UPDATE publications SET deleted_at=now(), updated_at=now() WHERE id=%s",
            (pub["id"],),
        )
    return True
