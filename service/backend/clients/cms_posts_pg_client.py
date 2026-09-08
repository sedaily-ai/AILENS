"""cms_posts 공개 조회 — Postgres 버전 (cms_posts_ddb_client.py의 드롭인 대체).

lens-postgres-migration-dev(Aurora PostgreSQL, 2026-09 이관)를 사용한다.
드라이버는 pg8000(순수 Python, deploy.sh가 이미 Lambda용으로 패키징하는
의존성 — psycopg2 같은 C 확장 빌드 문제가 없다). 반환 shape은 기존
DynamoDB 아이템과 최대한 동일하게 맞춰 cms_posts_shaping.py를 그대로
재사용할 수 있게 한다.

알려진 차이(2026-09-09 문서화, docs/architecture/db-changelog/postgres/
v1.10·v1.12 참조):
- 'lens' 채널 lenses[] 콘텐츠는 v1.12에서 백필 완료(포맷 라벨 방식은
  포맷별 렌디션으로, 관점 라벨 방식은 letter 렌디션 텍스트 블록으로
  — 완벽한 구조 재현은 아님).
- DynamoDB 원본은 이 대체를 작성한 시점에도 계속 변경되는 라이브
  테이블이라, 이관된 Postgres 데이터는 2026-09-08~09 스냅샷 기준이다.
"""
from __future__ import annotations

import os
from typing import Any, Dict, List, Optional

import pg8000.dbapi

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
    return pg8000.dbapi.connect(
        host=_PG_HOST, port=5432, database=_PG_DB,
        user=_PG_USER, password=_PG_PASSWORD,
        timeout=5,
    )


def _dictfetchall(cur) -> List[Dict[str, Any]]:
    cols = [c[0] for c in cur.description]
    return [dict(zip(cols, row)) for row in cur.fetchall()]


def _dictfetchone(cur) -> Optional[Dict[str, Any]]:
    cols = [c[0] for c in cur.description]
    row = cur.fetchone()
    return dict(zip(cols, row)) if row else None


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
        "lenses": [],  # v1.12에서 renditions로 구조 변환 이관됨(별도 필드 유지 안 함)
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


def list_published_posts(channel: str, date: Optional[str], limit: int = 20) -> List[Dict[str, Any]]:
    """발행된 CMS 글. 삭제분(deleted_at)과 초안은 제외한다 — DynamoDB
    버전과 동일 계약."""
    conn = _conn()
    try:
        cur = conn.cursor()
        if channel == "lens":
            # 'lens' 채널도 v1.12부터 다른 채널과 동일하게 renditions를
            # 가진다(format='letter', 관점 텍스트 백필분 포함) — 다만
            # 원래 'lens' 슬롯 자체를 채널로 조회하는 경우는 publications
            # 메타데이터 위주로 응답한다.
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
            fmt = next((f for f, ch in _FORMAT_TO_CHANNEL.items() if ch == channel), None)
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

        rows = _dictfetchall(cur)
        posts = []
        for row in rows:
            row["channel"] = channel
            row["images"] = row.pop("images_json", None) or []
            row["body_paragraphs"] = row.pop("body_json", None) or []
            posts.append(_row_to_post(row))
        return posts
    finally:
        conn.close()


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
    ORDER BY r.id
    LIMIT 1
"""


def get_published_post_by_slug(slug: str) -> Optional[Dict[str, Any]]:
    """slug로 발행물을 조회한다.

    publications.slug에서 못 찾으면 publication_slug_history로 폴백한다
    (v1.13/v1.15 참조 — 마이그레이션 당시 형제 채널의 slug가 UNIQUE(slug)
    제약 때문에 대표 채널 slug에 밀려 유실됐는데, 그 옛 slug로 들어오는
    북마크·검색엔진 색인 URL을 살리기 위함). 폴백 시에도 어떤 렌디션을
    돌려줄지는 기존과 동일하게 `ORDER BY r.id LIMIT 1`로 임의 선택한다 —
    포맷 구분 없이 조회하는 기존 한계(v1.13 문서화)를 그대로 유지할 뿐,
    이 백필로 새로 나빠지는 건 없다(이전엔 404였던 것이 조회는 되게 함).
    """
    conn = _conn()
    try:
        cur = conn.cursor()
        cur.execute("SELECT id FROM publications WHERE slug = %s", (slug,))
        row = cur.fetchone()
        pub_id = row[0] if row else None

        if pub_id is None:
            cur.execute(
                "SELECT publication_id FROM publication_slug_history WHERE old_slug = %s",
                (slug,),
            )
            hist_row = cur.fetchone()
            if not hist_row:
                return None
            pub_id = hist_row[0]

        cur.execute(_BY_PUBLICATION_ID_SELECT, (pub_id,))
        found = _dictfetchone(cur)
        if not found:
            return None
        found["channel"] = _FORMAT_TO_CHANNEL.get(found.get("format"), "lens")
        found["images"] = found.pop("images_json", None) or []
        found["body_paragraphs"] = found.pop("body_json", None) or []
        return _row_to_post(found)
    finally:
        conn.close()
