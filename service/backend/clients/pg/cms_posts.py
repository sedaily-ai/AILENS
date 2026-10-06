"""cms_posts 공개 조회 — Postgres 구현 (clients/ddb/cms_posts.py 와 동일 인터페이스).

lens-postgres-migration-dev(Aurora PostgreSQL)에 pg8000(순수 Python 드라이버)으로 접속한다.
반환 형태는 DynamoDB 아이템과 최대한 동일하게 맞추어 cms_posts_shaping.py 를 그대로 재사용한다.

DynamoDB 구현과의 차이:
- 'lens' 채널의 lenses[] 전체 콘텐츠는 단건 조회(get_published_post_by_slug(slug, channel='lens'))
  에서만 조립한다. 포맷 라벨 방식은 포맷별 렌디션으로, 관점 라벨 방식은 letter 렌디션의
  텍스트 블록 하나로 복원되므로 원본 구조와 완전히 같지는 않다.
  목록 조회는 렌디션 라벨과 메타만 배치 조회하여 붙인다.
- Postgres 데이터는 DynamoDB 원본의 2026-09-08~09 시점 스냅샷 기준이다.
"""
from __future__ import annotations

import json
import os
from common.dates.validation import KST as _KST
from typing import Any, Dict, List, Optional

import pg8000.dbapi

# service/lens-cms-api/cms_posts_repo.py 와 쿼리·로직을 동일하게 유지해야 한다.
# KST 기준 발행일 집계(UTC 세션에서 KST 00:00~08:59 발행 글이 전날로 묶이는 문제)도 양쪽에 동일하게 반영한다.

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
_CHANNEL_TO_FORMAT = {v: k for k, v in _FORMAT_TO_CHANNEL.items()}
_FORMAT_TO_LENS_LABEL = {
    "letter": "레터",
    "webtoon": "웹툰",
    "podcast": "팟캐스트",
    "video": "영상",
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
    """publications(+선택적 rendition 서브데이터) 행을 DynamoDB cms_posts 아이템 형태의 dict 로 변환한다.

    media_assets.file_url 은 video/podcast 모두 채워지므로 채널로 구분한다.
    video 는 body_inline.video_url, home_player(podcast)는 최상위 media_embed_url 에 담는다."""
    channel = row.get("channel")
    body_inline: Dict[str, Any] = {
        "body": row.get("body_paragraphs") or [],
        "images": row.get("images") or [],
        "key_points": [],
        "keywords": [],
        "lenses": [],  # renditions 로 이관되어 별도 필드로 유지하지 않음
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
        "publish_date": row["published_at"].astimezone(_KST).date().isoformat() if row.get("published_at") else None,
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
    """발행된 CMS 글. 삭제분(deleted_at)과 초안은 제외한다(DynamoDB 구현과 동일 계약)."""
    conn = _conn()
    try:
        cur = conn.cursor()
        if channel == "lens":
            # 'lens' 목록은 publications 메타데이터와 렌디션 라벨만 배치 조회한다(lens_labels_by_pub).
            # 전체 콘텐츠는 단건 조회에서만 조립한다.
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
                sql += " AND (published_at AT TIME ZONE 'Asia/Seoul')::date = %s"
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
                sql += " AND (p.published_at AT TIME ZONE 'Asia/Seoul')::date = %s"
                params.append(date)
            sql += " ORDER BY p.published_at DESC LIMIT %s"
            params.append(limit)
            cur.execute(sql, params)

        rows = _dictfetchall(cur)

        lens_labels_by_pub: Dict[int, List[str]] = {}
        lens_meta_by_pub: Dict[int, Dict[str, Dict[str, Any]]] = {}
        if channel == "lens" and rows:
            pub_ids = [r["publication_id"] for r in rows]
            cur.execute(
                "SELECT publication_id, format FROM renditions WHERE publication_id = ANY(%s) ORDER BY id",
                (pub_ids,),
            )
            for pub_id, fmt in cur.fetchall():
                lens_labels_by_pub.setdefault(pub_id, []).append(
                    _FORMAT_TO_LENS_LABEL.get(fmt, fmt or "")
                )
            # bullets 는 renditions 스키마가 아닌 publications.admin_extra JSONB 에만 있다.
            # 응답 크기 한도(6MB) 때문에 paragraphs/images 등 큰 키는 DB 에서 제거하고
            # label/question/bullets 만 배치 조회한다.
            cur.execute(
                """
                SELECT p.id,
                       jsonb_agg(elem - 'paragraphs' - 'images') AS lens_meta
                FROM publications p,
                     jsonb_array_elements(COALESCE(p.admin_extra->'body_inline'->'lenses', '[]'::jsonb)) AS elem
                WHERE p.id = ANY(%s)
                GROUP BY p.id
                """,
                (pub_ids,),
            )
            for pub_id, meta in cur.fetchall():
                items = json.loads(meta) if isinstance(meta, str) else (meta or [])
                lens_meta_by_pub[pub_id] = {
                    item["label"]: item for item in items if item.get("label")
                }

        posts = []
        for row in rows:
            row["channel"] = channel
            row["images"] = row.pop("images_json", None) or []
            row["body_paragraphs"] = row.pop("body_json", None) or []
            post = _row_to_post(row)
            if channel == "lens":
                # 목록은 label/question/bullets 만 필요하므로(shape_lens_summary),
                # 렌디션별 N+1 조회 없이 위에서 일괄 수집한 값만 채운다.
                pub_meta = lens_meta_by_pub.get(row["publication_id"], {})
                post["body_inline"]["lenses"] = [
                    {
                        "label": label,
                        "question": pub_meta.get(label, {}).get("question") or "",
                        "bullets": [b for b in (pub_meta.get(label, {}).get("bullets") or []) if b],
                    }
                    for label in lens_labels_by_pub.get(row["publication_id"], [])
                ]
            posts.append(post)
        return posts
    finally:
        conn.close()


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


def _fetch_lens_items(cur, pub_id: int, admin_extra: Any = None) -> List[Dict[str, Any]]:
    """publication 의 모든 렌디션을 shape_lens() 가 기대하는 lenses[] 항목으로 재구성한다.

    항목 키: label/question/bullets/paragraphs/images/video_url/media_url/transcript.
    - 포맷 라벨 방식(레터/웹툰/팟캐스트/영상 각각 별도 렌디션)은 포맷별로 복원된다.
    - 관점 라벨 방식(4가지 분석 관점)은 letter 렌디션 하나에 텍스트 블록 4개로 저장되어
      '레터' 항목 하나로만 반환된다.
    rendition_blocks 에는 문단 텍스트만 있으므로 bullets/question 은
    publications.admin_extra JSONB 에서 label 로 매칭해 채운다. 매칭되지 않으면 빈 값이다."""
    extra_by_label: Dict[str, Dict[str, Any]] = {}
    if admin_extra:
        try:
            extra = json.loads(admin_extra) if isinstance(admin_extra, str) else admin_extra
            for item in (extra.get("body_inline") or {}).get("lenses") or []:
                if item.get("label"):
                    extra_by_label[item["label"]] = item
        except (TypeError, ValueError, AttributeError):
            pass

    cur.execute(_LENS_RENDITIONS_SELECT, (pub_id,))
    items = []
    for row in _dictfetchall(cur):
        fmt = row["format"]
        label = _FORMAT_TO_LENS_LABEL.get(fmt, fmt or "")
        extra_item = extra_by_label.get(label) or {}
        items.append({
            "label": label,
            "question": extra_item.get("question") or "",
            "bullets": [b for b in (extra_item.get("bullets") or []) if b],
            "paragraphs": row.get("body_json") or [],
            "images": row.get("images_json") or [],
            "video_url": row["media_url"] if fmt == "video" else None,
            "thumbnail_url": None,
            "media_url": row["media_url"] if fmt == "podcast" else None,
            "transcript": row.get("transcript"),
        })
    return items


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
    """slug 로 발행물을 조회한다.

    publications.slug 에서 찾지 못하면 publication_slug_history 로 폴백한다
    (통합 과정에서 대표 채널 slug 에 밀린 옛 slug 의 북마크·검색 색인 URL 보존).

    한 발행물에 여러 포맷 렌디션이 있을 수 있으므로 channel 이 주어지면 해당 format 의
    렌디션만 선택한다. channel 이 없거나 일치하는 렌디션이 없으면 ORDER BY r.id LIMIT 1 로 선택한다.
    channel='lens' 는 모든 렌디션을 body_inline.lenses[] 로 재구성해 반환한다(_fetch_lens_items 참조).
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

        if channel == "lens":
            cur.execute(
                """
                SELECT id AS publication_id, slug, title, subtitle, cover_image_url,
                       source_url, status, published_at, created_at, updated_at, admin_extra
                FROM publications
                WHERE id = %s AND status = 'published' AND deleted_at IS NULL
                """,
                (pub_id,),
            )
            pub_row = _dictfetchone(cur)
            if not pub_row:
                return None
            admin_extra = pub_row.pop("admin_extra", None)
            pub_row["channel"] = "lens"
            pub_row["images"] = []
            pub_row["body_paragraphs"] = []
            post = _row_to_post(pub_row)
            post["body_inline"]["lenses"] = _fetch_lens_items(cur, pub_id, admin_extra)
            return post

        fmt = _CHANNEL_TO_FORMAT.get(channel) if channel else None
        found = None
        if fmt:
            cur.execute(_BY_PUBLICATION_ID_SELECT + " AND r.format = %s" + _ORDER_LIMIT_ONE, (pub_id, fmt))
            found = _dictfetchone(cur)
        if not found:
            cur.execute(_BY_PUBLICATION_ID_SELECT + _ORDER_LIMIT_ONE, (pub_id,))
            found = _dictfetchone(cur)
        if not found:
            return None
        found["channel"] = _FORMAT_TO_CHANNEL.get(found.get("format"), "lens")
        found["images"] = found.pop("images_json", None) or []
        found["body_paragraphs"] = found.pop("body_json", None) or []
        return _row_to_post(found)
    finally:
        conn.close()
