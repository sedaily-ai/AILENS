"""cms_posts 공개 조회 — 상시 서버(psycopg2 커넥션 풀) 버전.

service/backend/clients/cms_posts_pg_client.py(Lambda·pg8000)와 쿼리·로직은
동일하다 — 드라이버만 psycopg2로 바꾸고(진짜 커넥션 풀 사용 가능),
RealDictCursor가 dict를 직접 돌려주므로 _dictfetchall/_dictfetchone 같은
수동 변환 헬퍼가 필요 없다.

v1.20: Lambda+RDS 조합(호출마다 새 커넥션, VPC 붙이면 NAT/엔드포인트 필요)의
근본 문제를 피하기 위해 상시 프로세스로 이전(docs/architecture/db-changelog/
postgres/v1.20 참조).
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from db import get_cursor

_FORMAT_TO_CHANNEL = {
    "webtoon": "webtoon",
    "video": "video",
    "podcast": "home_player",
    "letter": "letters",
}
_CHANNEL_TO_FORMAT = {v: k for k, v in _FORMAT_TO_CHANNEL.items()}
_FORMAT_TO_LENS_LABEL = {
    "letter": "레터",
    "webtoon": "웹툰",
    "podcast": "팟캐스트",
    "video": "영상",
}


def _row_to_post(row: Dict[str, Any]) -> Dict[str, Any]:
    channel = row.get("channel")
    body_inline: Dict[str, Any] = {
        "body": row.get("body_paragraphs") or [],
        "images": row.get("images") or [],
        "key_points": [],
        "keywords": [],
        "lenses": [],
    }
    media_embed_url = None
    if channel == "video" and row.get("video_url"):
        body_inline["video_url"] = row["video_url"]
    elif channel == "home_player" and row.get("video_url"):
        media_embed_url = row["video_url"]
    if row.get("transcript"):
        body_inline["transcript"] = row["transcript"]

    return {
        "id": str(row["publication_id"]),
        "headline": row.get("title") or "",
        "subtitle": row.get("subtitle"),
        "slug": row["slug"],
        "channel": channel,
        "channels": [channel] if channel else [],
        "status": row.get("status"),
        "cover_image_url": row.get("cover_image_url"),
        "source_url": row.get("source_url"),
        "media_embed_url": media_embed_url,
        "publish_date": row["published_at"].date().isoformat() if row.get("published_at") else None,
        "published_at": row["published_at"].isoformat() if row.get("published_at") else None,
        "created_at": row["created_at"].isoformat() if row.get("created_at") else None,
        "updated_at": row["updated_at"].isoformat() if row.get("updated_at") else None,
        "display_order": None,
        "editor_id": None,
        "closing_line": None,
        "body_inline": body_inline,
        "is_cms": True,
    }


_BASE_SELECT = """
    SELECT
        p.id AS publication_id, p.slug, p.title, p.subtitle, p.cover_image_url,
        p.source_url, p.status, p.published_at, p.created_at, p.updated_at,
        r.format,
        ma.file_url AS video_url, ma.transcript,
        (
            SELECT jsonb_agg(jsonb_build_object('url', wp.image_url, 'caption', wp.dialogue) ORDER BY wp.position)
            FROM webtoon_panels wp WHERE wp.rendition_id = r.id
        ) AS images_json,
        (
            SELECT jsonb_agg(rb.content ORDER BY rb.position)
            FROM rendition_blocks rb WHERE rb.rendition_id = r.id
        ) AS body_json
    FROM publications p
    LEFT JOIN renditions r ON r.publication_id = p.id AND r.format = %s
    LEFT JOIN media_assets ma ON ma.rendition_id = r.id
"""

_LENS_RENDITIONS_SELECT = """
    SELECT r.format,
           ma.file_url AS media_url, ma.transcript,
           (SELECT jsonb_agg(jsonb_build_object('url', wp.image_url, 'caption', wp.dialogue) ORDER BY wp.position)
            FROM webtoon_panels wp WHERE wp.rendition_id = r.id) AS images_json,
           (SELECT jsonb_agg(rb.content ORDER BY rb.position)
            FROM rendition_blocks rb WHERE rb.rendition_id = r.id) AS body_json
    FROM renditions r
    LEFT JOIN media_assets ma ON ma.rendition_id = r.id
    WHERE r.publication_id = %s
    ORDER BY r.id
"""


def _fetch_lens_items(cur, pub_id: int) -> List[Dict[str, Any]]:
    cur.execute(_LENS_RENDITIONS_SELECT, (pub_id,))
    items = []
    for row in cur.fetchall():
        fmt = row["format"]
        items.append({
            "label": _FORMAT_TO_LENS_LABEL.get(fmt, fmt or ""),
            "question": "",
            "bullets": [],
            "paragraphs": row.get("body_json") or [],
            "images": row.get("images_json") or [],
            "video_url": row["media_url"] if fmt == "video" else None,
            "thumbnail_url": None,
            "media_url": row["media_url"] if fmt == "podcast" else None,
            "transcript": row.get("transcript"),
        })
    return items


def list_published_posts(channel: str, date: Optional[str], limit: int = 20) -> List[Dict[str, Any]]:
    with get_cursor() as cur:
        if channel == "lens":
            sql = """
                SELECT id AS publication_id, slug, title, subtitle, cover_image_url,
                       source_url, status, published_at, created_at, updated_at,
                       NULL AS video_url, NULL AS transcript,
                       NULL AS images_json, NULL AS body_json
                FROM publications
                WHERE status = %s AND deleted_at IS NULL
            """
            params: List[Any] = ["published"]
            if date:
                sql += " AND published_at::date = %s"
                params.append(date)
            sql += " ORDER BY published_at DESC LIMIT %s"
            params.append(limit)
            cur.execute(sql, params)
        else:
            fmt = _CHANNEL_TO_FORMAT.get(channel)
            if not fmt:
                return []
            sql = _BASE_SELECT + " WHERE p.status = %s AND p.deleted_at IS NULL AND r.id IS NOT NULL"
            params = [fmt, "published"]
            if date:
                sql += " AND p.published_at::date = %s"
                params.append(date)
            sql += " ORDER BY p.published_at DESC LIMIT %s"
            params.append(limit)
            cur.execute(sql, params)

        rows = [dict(r) for r in cur.fetchall()]

        lens_labels_by_pub: Dict[int, List[str]] = {}
        if channel == "lens" and rows:
            pub_ids = [r["publication_id"] for r in rows]
            cur.execute(
                "SELECT publication_id, format FROM renditions WHERE publication_id = ANY(%s) ORDER BY id",
                (pub_ids,),
            )
            for r in cur.fetchall():
                lens_labels_by_pub.setdefault(r["publication_id"], []).append(
                    _FORMAT_TO_LENS_LABEL.get(r["format"], r["format"] or "")
                )

        posts = []
        for row in rows:
            row["channel"] = channel
            row["images"] = row.pop("images_json", None) or []
            row["body_paragraphs"] = row.pop("body_json", None) or []
            post = _row_to_post(row)
            if channel == "lens":
                post["body_inline"]["lenses"] = [
                    {"label": label, "question": "", "bullets": []}
                    for label in lens_labels_by_pub.get(row["publication_id"], [])
                ]
            posts.append(post)
        return posts


_BY_PUBLICATION_ID_SELECT = """
    SELECT p.id AS publication_id, p.slug, p.title, p.subtitle, p.cover_image_url,
           p.source_url, p.status, p.published_at, p.created_at, p.updated_at,
           r.format,
           ma.file_url AS video_url, ma.transcript,
           (SELECT jsonb_agg(jsonb_build_object('url', wp.image_url, 'caption', wp.dialogue) ORDER BY wp.position)
            FROM webtoon_panels wp WHERE wp.rendition_id = r.id) AS images_json,
           (SELECT jsonb_agg(rb.content ORDER BY rb.position)
            FROM rendition_blocks rb WHERE rb.rendition_id = r.id) AS body_json
    FROM publications p
    LEFT JOIN renditions r ON r.publication_id = p.id
    LEFT JOIN media_assets ma ON ma.rendition_id = r.id
    WHERE p.id = %s AND p.status = 'published' AND p.deleted_at IS NULL
"""
_ORDER_LIMIT_ONE = " ORDER BY r.id LIMIT 1"


def get_published_post_by_slug(slug: str, channel: Optional[str] = None) -> Optional[Dict[str, Any]]:
    with get_cursor() as cur:
        cur.execute("SELECT id FROM publications WHERE slug = %s", (slug,))
        row = cur.fetchone()
        pub_id = row["id"] if row else None

        if pub_id is None:
            cur.execute(
                "SELECT publication_id FROM publication_slug_history WHERE old_slug = %s",
                (slug,),
            )
            hist_row = cur.fetchone()
            if not hist_row:
                return None
            pub_id = hist_row["publication_id"]

        if channel == "lens":
            cur.execute(
                """
                SELECT id AS publication_id, slug, title, subtitle, cover_image_url,
                       source_url, status, published_at, created_at, updated_at
                FROM publications
                WHERE id = %s AND status = 'published' AND deleted_at IS NULL
                """,
                (pub_id,),
            )
            pub_row = cur.fetchone()
            if not pub_row:
                return None
            pub_row = dict(pub_row)
            pub_row["channel"] = "lens"
            pub_row["images"] = []
            pub_row["body_paragraphs"] = []
            post = _row_to_post(pub_row)
            post["body_inline"]["lenses"] = _fetch_lens_items(cur, pub_id)
            return post

        fmt = _CHANNEL_TO_FORMAT.get(channel) if channel else None
        found = None
        if fmt:
            cur.execute(_BY_PUBLICATION_ID_SELECT + " AND r.format = %s" + _ORDER_LIMIT_ONE, (pub_id, fmt))
            found = cur.fetchone()
        if not found:
            cur.execute(_BY_PUBLICATION_ID_SELECT + _ORDER_LIMIT_ONE, (pub_id,))
            found = cur.fetchone()
        if not found:
            return None
        found = dict(found)
        found["channel"] = _FORMAT_TO_CHANNEL.get(found.get("format"), "lens")
        found["images"] = found.pop("images_json", None) or []
        found["body_paragraphs"] = found.pop("body_json", None) or []
        return _row_to_post(found)
