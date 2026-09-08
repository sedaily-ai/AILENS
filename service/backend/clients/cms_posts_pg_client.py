"""cms_posts 공개 조회 — Postgres 버전 (cms_posts_ddb_client.py의 드롭인 대체).

lens-postgres-migration-dev(Aurora PostgreSQL, 2026-09 이관)를 사용한다.
반환 shape은 기존 DynamoDB 아이템과 최대한 동일하게 맞춰
cms_posts_shaping.py를 그대로 재사용할 수 있게 한다.

알려진 차이(2026-09-09 문서화, docs/architecture/db-changelog/postgres/
v1.10 참조):
- 'lens' 채널의 body_inline.lenses[](4포맷 내장 콘텐츠)는 이관 범위에서
  제외됐다 — publications 메타데이터(headline/subtitle/cover_image 등)만
  반환하고 lenses는 빈 배열이다.
- DynamoDB 원본은 이 대체를 작성한 시점에도 계속 변경되는 라이브
  테이블이라, 이관된 Postgres 데이터는 2026-09-08 스냅샷 기준이다.
"""
from __future__ import annotations

import os
from typing import Any, Dict, List, Optional

import psycopg2
import psycopg2.extras

_PG_HOST = os.environ.get("LENS_PG_HOST", "lens-postgres-migration-dev.cluster-c83iuyksky7r.us-east-1.rds.amazonaws.com")
_PG_DB = os.environ.get("LENS_PG_DATABASE", "lens")
_PG_USER = os.environ.get("LENS_PG_USER", "lens_service_app")
_PG_PASSWORD = os.environ.get("LENS_PG_PASSWORD", "")

_FORMAT_TO_CHANNEL = {
    "webtoon": "webtoon",
    "video": "video",
    "podcast": "home_player",
    "letter": "letters",
}


def _conn():
    return psycopg2.connect(
        host=_PG_HOST, port=5432, dbname=_PG_DB,
        user=_PG_USER, password=_PG_PASSWORD,
        connect_timeout=5,
    )


def _row_to_post(row: Dict[str, Any]) -> Dict[str, Any]:
    """publications(+선택적 rendition 서브데이터) 행을 DynamoDB cms_posts
    아이템과 같은 dict 모양으로 변환한다.

    media_assets.file_url은 video/podcast 둘 다 채워지는 컬럼이라, 채널로
    구분해서 원본과 같은 위치에 넣는다 — video는 body_inline.video_url,
    home_player(podcast)는 최상위 media_embed_url(원본 cms-posts 아이템의
    실제 저장 위치, migrate_cms_posts.py의 매핑과 동일)."""
    channel = row.get("channel")
    body_inline: Dict[str, Any] = {
        "body": row.get("body_paragraphs") or [],
        "images": row.get("images") or [],
        "key_points": [],
        "keywords": [],
        "lenses": [],  # 2026-09-09: 이관 범위 밖 — 알려진 차이(위 docstring)
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
    LEFT JOIN renditions r ON r.publication_id = p.id AND r.format = %(format)s
    LEFT JOIN media_assets ma ON ma.rendition_id = r.id
"""


def list_published_posts(channel: str, date: Optional[str], limit: int = 20) -> List[Dict[str, Any]]:
    """발행된 CMS 글. 삭제분(deleted_at)과 초안은 제외한다 — DynamoDB
    버전과 동일 계약."""
    conn = _conn()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        if channel == "lens":
            # 'lens' 채널은 publications 자체 — renditions 조인 없음.
            # lenses[] 콘텐츠는 위 docstring 참조(이관 범위 밖).
            sql = """
                SELECT id AS publication_id, slug, title, subtitle, cover_image_url,
                       source_url, status, published_at, created_at, updated_at,
                       NULL AS video_url, NULL AS transcript,
                       NULL AS images_json, NULL AS body_json
                FROM publications
                WHERE status = 'published' AND deleted_at IS NULL
            """
            params: Dict[str, Any] = {}
            if date:
                sql += " AND published_at::date = %(date)s"
                params["date"] = date
            sql += " ORDER BY published_at DESC LIMIT %(limit)s"
            params["limit"] = limit
            cur.execute(sql, params)
        else:
            fmt = next((f for f, ch in _FORMAT_TO_CHANNEL.items() if ch == channel), None)
            if not fmt:
                return []
            sql = _BASE_SELECT + " WHERE p.status = 'published' AND p.deleted_at IS NULL AND r.id IS NOT NULL"
            params = {"format": fmt}
            if date:
                sql += " AND p.published_at::date = %(date)s"
                params["date"] = date
            sql += " ORDER BY p.published_at DESC LIMIT %(limit)s"
            params["limit"] = limit
            cur.execute(sql, params)

        rows = cur.fetchall()
        posts = []
        for row in rows:
            row = dict(row)
            row["channel"] = channel
            row["images"] = row.pop("images_json", None) or []
            row["body_paragraphs"] = row.pop("body_json", None) or []
            posts.append(_row_to_post(row))
        return posts
    finally:
        conn.close()


def get_published_post_by_slug(slug: str) -> Optional[Dict[str, Any]]:
    conn = _conn()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            "SELECT status, deleted_at FROM publications WHERE slug = %s",
            (slug,),
        )
        row = cur.fetchone()
        if not row or row["status"] != "published" or row["deleted_at"]:
            return None

        cur.execute(
            """
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
            WHERE p.slug = %s
            ORDER BY r.id
            LIMIT 1
            """,
            (slug,),
        )
        found = cur.fetchone()
        if not found:
            return None
        found = dict(found)
        found["channel"] = _FORMAT_TO_CHANNEL.get(found.get("format"), "lens")
        found["images"] = found.pop("images_json", None) or []
        found["body_paragraphs"] = found.pop("body_json", None) or []
        return _row_to_post(found)
    finally:
        conn.close()
