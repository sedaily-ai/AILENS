"""cms_posts 공개 조회 — Postgres 버전 (cms_posts_ddb_client.py의 드롭인 대체).

lens-postgres-migration-dev(Aurora PostgreSQL, 2026-09 이관)를 사용한다.
드라이버는 pg8000(순수 Python, deploy.sh가 이미 Lambda용으로 패키징하는
의존성 — psycopg2 같은 C 확장 빌드 문제가 없다). 반환 shape은 기존
DynamoDB 아이템과 최대한 동일하게 맞춰 cms_posts_shaping.py를 그대로
재사용할 수 있게 한다.

알려진 차이(2026-09-09 문서화, docs/architecture/db-changelog/postgres/
v1.10·v1.12·v1.17·v1.18 참조):
- 'lens' 채널 lenses[] 콘텐츠는 v1.12에서 백필, v1.17에서 단건 조회
  (`get_published_post_by_slug(slug, channel='lens')`)에서 실제로
  조립해 반환하도록 연결(포맷 라벨 방식은 포맷별 렌디션 그대로,
  관점 라벨 방식은 letter 렌디션 텍스트 블록 하나로 — 완벽한 구조
  재현은 아님). 목록 조회(`list_published_posts('lens', ...)`)는
  v1.18부터 라벨만 배치 조회해 붙인다(전체 콘텐츠는 여전히 단건
  조회에서만).
- DynamoDB 원본은 이 대체를 작성한 시점에도 계속 변경되는 라이브
  테이블이라, 이관된 Postgres 데이터는 2026-09-08~09 스냅샷 기준이다.
"""
from __future__ import annotations

import json
import os
from utils.date_validation import KST as _KST
from typing import Any, Dict, List, Optional

import pg8000.dbapi

# 2026-09-29 — service/lens-cms-api/cms_posts_repo.py와 동일 버그·동일
# 수정(그쪽 주석 참고: UTC 세션 타임존에서 published_at.date()가 KST
# 00:00~08:59 발행 글을 "전날"로 잘못 묶던 문제). 두 파일은 쿼리·로직이
# 동일해야 한다는 이 파일 docstring의 원칙대로 같이 고친다.

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
    """발행된 CMS 글. 삭제분(deleted_at)과 초안은 제외한다 — DynamoDB
    버전과 동일 계약."""
    conn = _conn()
    try:
        cur = conn.cursor()
        if channel == "lens":
            # 'lens' 채널도 v1.12부터 다른 채널과 동일하게 renditions를
            # 가진다(format='letter', 관점 텍스트 백필분 포함). 목록은
            # publications 메타데이터 위주로 조회하고, 각 발행물의 렌디션
            # 라벨만 별도로 배치 조회해 붙인다(아래 lens_labels_by_pub,
            # v1.18) — 전체 콘텐츠는 단건 조회(v1.17)에서만 조립한다.
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
            # 2026-09-10 — bullets(핵심 요약)가 목록에서도 항상 빈 배열이던
            # 버그 수정(get_published_post_by_slug와 같은 원인: bullets는
            # admin_extra JSONB에만 있고 renditions 스키마엔 없음). 목록
            # 응답이 무거워져 6MB 한도를 넘겼던 예전 장애(shape_lens_summary
            # 참조)의 원인은 paragraphs/images/transcript 같은 큰 필드였지
            # bullets가 아니다 — 그래서 admin_extra 전체를 끌어오는 대신
            # jsonb_array_elements + `- 'paragraphs' - 'images'`로 무거운
            # 키를 DB단에서 미리 떼어내고 label/question/bullets만 가볍게
            # 배치 조회한다.
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
                # 목록은 라벨만 필요(shape_lens_summary가 label/question/
                # bullets만 남기고 나머지는 버림) — 렌디션당 전체 콘텐츠를
                # 끌어오는 N+1 쿼리 대신, 위에서 한 번에 모은 라벨·메타만
                # 채운다. 무거운 실제 콘텐츠(paragraphs/images/video_url 등)는
                # 단건 조회(get_published_post_by_slug, v1.17)에서만 조립한다.
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
    """publication의 모든 렌디션을 shape_lens()가 기대하는 lenses[] 항목
    (label/question/bullets/paragraphs/images/video_url/media_url/transcript)
    으로 재구성한다.

    v1.12에서 두 원본 구조를 이관했다 — (a) "포맷 라벨"(레터/웹툰/팟캐스트/
    영상 각각 별도 렌디션, 2건)은 여기서 포맷별로 정확히 복원된다.
    (b) "관점 라벨"(4가지 분석 관점, 48건)은 하나의 letter 렌디션에 4개
    텍스트 블록으로 뭉쳐 이관됐던 것이라, 여기서도 하나의 '레터' 항목
    (paragraphs 4개)으로만 나온다.

    2026-09-10 — bullets(핵심 요약, "30초 핵심" 카드)가 렌디션 재구성
    으로는 항상 빈 배열이었던 버그 수정. `rendition_blocks`엔 문단
    텍스트(block_type='text')만 있고 bullets를 담을 컬럼 자체가 없다 —
    반면 lens-cms-api가 발행 시 쓰는 `publications.admin_extra` JSONB엔
    포맷별 bullets/question까지 원본 그대로 남아있다(admin_posts_repo.py
    참조, 이 함수가 읽던 렌디션 테이블과는 완전히 다른 저장 경로). label로
    매칭해서 있으면 덮어쓴다 — 레터/팟캐스트/영상/웹툰 4개 포맷 렌디션
    (a)엔 항상 있고, admin_extra 자체가 없는 옛 (b) 48건은 매칭 안 돼
    기존 동작(빈 배열) 그대로 유지된다."""
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
    """slug로 발행물을 조회한다.

    publications.slug에서 못 찾으면 publication_slug_history로 폴백한다
    (v1.13/v1.15 참조 — 마이그레이션 당시 형제 채널의 slug가 UNIQUE(slug)
    제약 때문에 대표 채널 slug에 밀려 유실됐는데, 그 옛 slug로 들어오는
    북마크·검색엔진 색인 URL을 살리기 위함).

    한 발행물에 여러 포맷 렌디션이 있을 수 있어(v1.4 마이그레이션이
    형제 채널들을 하나의 publications 행에 묶었다), `channel`을 받으면
    그 채널에 대응하는 format으로 렌디션을 필터링해 정확한 것을
    돌려준다 — 프론트엔드는 실제로 단건 조회마다 `?channel=` 을 항상
    붙인다(2026-09-09 라우팅 조사 확인, webtoon/[slug]·video/[slug]·
    letters/[id] 각각 자기 채널로 스코프된 fetch만 함). `channel`이
    없거나 그 채널에 해당하는 렌디션이 없으면(드묾 — v1.12로 모든
    publications가 최소 1개 렌디션을 가짐) 기존과 동일하게
    `ORDER BY r.id LIMIT 1`로 임의 선택한다.

    'lens'는 포맷이 아니라 최대 4개 렌디션(레터/웹툰/팟캐스트/영상)을
    한 응답에 조합해야 하는 별도 UI(FormatPicker)라 별도 처리한다 —
    모든 렌디션을 `body_inline.lenses[]`로 재구성해서 돌려준다
    (`_fetch_lens_items` 참조, 관점 라벨 48건의 구조적 한계는 그대로).
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
