"""admin CMS 글 정리 작업 — 빈 옛 글 소프트 삭제, slug 기준 재분류, 단건 소프트 삭제.

2026-10-12 admin_posts_repo.py 에서 분리(리팩토링 6단계). 라우트(routes_admin_posts.py)가 이 모듈을 직접 부른다.
"""
from __future__ import annotations

from typing import Any, Dict, List

from db import get_cursor


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


# 분류 개편(2026-10-09) 대분류 9개. service/frontend/src/shared/constants/econCategories.ts·pipelines/common/publishing.py와 같은 값이다(의도적 복제).
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
