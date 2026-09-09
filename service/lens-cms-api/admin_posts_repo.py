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


def _to_dict(pub: Dict[str, Any]) -> Dict[str, Any]:
    extra = pub.get("admin_extra") or {}
    return {
        "id": str(pub["admin_post_id"]),
        "slug": pub["slug"],
        "status": pub["status"],
        "channels": [pub["admin_channel"]] if pub.get("admin_channel") else [],
        "channel": pub.get("admin_channel"),
        "publish_date": pub["admin_publish_date"].isoformat() if pub.get("admin_publish_date") else None,
        "editor_id": extra.get("editor_id"),
        "headline": pub.get("title") or "",
        "subtitle": pub.get("subtitle"),
        "closing_line": extra.get("closing_line"),
        "body_inline": extra.get("body_inline") or {},
        "cover_image_url": pub.get("cover_image_url") or "",
        "source_url": pub.get("source_url") or "",
        "media_embed_url": extra.get("media_embed_url"),
        "display_order": extra.get("display_order"),
        "created_by": extra.get("created_by"),
        "created_at": pub["created_at"].isoformat() if pub.get("created_at") else None,
        "updated_at": pub["updated_at"].isoformat() if pub.get("updated_at") else None,
        "published_at": pub["published_at"].isoformat() if pub.get("published_at") else None,
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


def get(admin_post_id: str) -> Optional[Dict[str, Any]]:
    with get_cursor() as cur:
        cur.execute(
            "SELECT * FROM publications WHERE admin_post_id = %s AND deleted_at IS NULL",
            (admin_post_id,),
        )
        pub = cur.fetchone()
        return _to_dict(pub) if pub else None


def list_posts(status: Optional[str], channel: Optional[str], limit: int,
                date: Optional[str]) -> List[Dict[str, Any]]:
    with get_cursor() as cur:
        sql = "SELECT * FROM publications WHERE admin_post_id IS NOT NULL AND deleted_at IS NULL"
        params: List[Any] = []
        if status:
            sql += " AND status = %s"
            params.append(status)
        if channel:
            sql += " AND admin_channel = %s"
            params.append(channel)
        if date:
            sql += " AND admin_publish_date = %s"
            params.append(date)
        sql += " ORDER BY admin_publish_date DESC NULLS LAST, created_at DESC LIMIT %s"
        params.append(limit)
        cur.execute(sql, params)
        return [_to_dict(r) for r in cur.fetchall()]


def update(admin_post_id: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
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
