"""자동 선정 파이프라인의 "이미 본 후보 기사" 이력 — candidate_seen 테이블.

옛 DynamoDB sedaily-lens-mustknow-seen-dev 를 대체한다(설계: docs/architecture/lens-erd-src/16-ddb-잔여-이관-설계.md,
변경 이력: docs/architecture/db-changelog/postgres/v1.36-ddb-잔여-이관.md). 테이블은 이 코드가 아니라 마스터 계정으로 만든다
(lens_service_app 에는 DDL 권한이 없다 — selection_repo.py 와 같은 원칙).

접근 패턴은 둘뿐이다.
  1. 후보 N건이 이미 있는지 한 번에 확인한다(exists_keys) — 옛 코드는 후보마다 get_item 이었다.
  2. 판단이 끝난 후보를 기록한다(mark_seen). 같은 기사를 다시 기록하면 판단 내용만 덮어쓰고 처음 본 시각(seen_at)은 보존한다.
이관 스크립트는 bulk_import 로 옛 항목을 원래 seen_at 그대로 넣는다(재실행해도 안전: ON CONFLICT DO NOTHING).
"""
from __future__ import annotations

import json
from typing import Any, Dict, Iterable, List, Optional

from db import get_cursor

_MAX_KEYS = 500
_MAX_BULK = 500
_MAX_TEXT = 4000


def _clean_key(value: Any, limit: int, name: str) -> str:
    text = str(value or "").strip()
    if not text or len(text) > limit:
        raise ValueError(f"{name}은 1~{limit}자 문자열이어야 합니다")
    return text


def _clip(text: Optional[str]) -> Optional[str]:
    return text[:_MAX_TEXT] if isinstance(text, str) else text


def exists_keys(pipeline: str, keys: Iterable[str]) -> List[str]:
    """요청한 키 중 이미 기록된 것만 돌려준다(없는 키는 결과에 없음)."""
    pipeline = _clean_key(pipeline, 32, "pipeline")
    uniq = list(dict.fromkeys(str(k) for k in keys if k))
    if not uniq:
        return []
    if len(uniq) > _MAX_KEYS:
        raise ValueError(f"한 번에 {_MAX_KEYS}개까지만 확인할 수 있습니다")
    with get_cursor() as cur:
        cur.execute(
            "SELECT article_key FROM candidate_seen WHERE pipeline = %s AND article_key = ANY(%s)",
            (pipeline, uniq),
        )
        return [r["article_key"] for r in cur.fetchall()]


def mark_seen(
    pipeline: str,
    article_key: str,
    tab: Optional[str] = None,
    score: Optional[float] = None,
    reasoning: Optional[str] = None,
    is_manual: bool = False,
    excluded_from_general: bool = False,
    reason: Optional[str] = None,
    detail: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    pipeline = _clean_key(pipeline, 32, "pipeline")
    article_key = _clean_key(article_key, 64, "article_key")
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO candidate_seen
                (pipeline, article_key, seen_at, tab, score, reasoning, is_manual, excluded_from_general, reason, detail)
            VALUES (%s, %s, now(), %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (pipeline, article_key) DO UPDATE SET
                tab = EXCLUDED.tab,
                score = EXCLUDED.score,
                reasoning = EXCLUDED.reasoning,
                is_manual = EXCLUDED.is_manual,
                excluded_from_general = EXCLUDED.excluded_from_general,
                reason = EXCLUDED.reason,
                detail = EXCLUDED.detail
            RETURNING seen_at
            """,
            (pipeline, article_key, tab, score, _clip(reasoning), bool(is_manual),
             bool(excluded_from_general), _clip(reason), json.dumps(detail or {}, ensure_ascii=False)),
        )
        row = cur.fetchone()
    return {"pipeline": pipeline, "article_key": article_key, "seen_at": row["seen_at"].isoformat()}


def bulk_import(items: List[Dict[str, Any]], dry_run: bool = True) -> Dict[str, Any]:
    """옛 DynamoDB 항목을 원래 seen_at 그대로 넣는다. 이미 있는 키는 건너뛴다(재실행 안전)."""
    if not items or len(items) > _MAX_BULK:
        raise ValueError(f"items는 1~{_MAX_BULK}개")
    rows = []
    for it in items:
        rows.append((
            _clean_key(it.get("pipeline"), 32, "pipeline"),
            _clean_key(it.get("article_key"), 64, "article_key"),
            it.get("seen_at"),
            it.get("tab"),
            it.get("score"),
            _clip(it.get("reasoning")),
            bool(it.get("is_manual", False)),
            bool(it.get("excluded_from_general", False)),
            _clip(it.get("reason")),
            json.dumps(it.get("detail") or {}, ensure_ascii=False),
        ))
    if dry_run:
        return {"dry_run": True, "count": len(rows)}
    inserted = 0
    with get_cursor() as cur:
        for r in rows:
            cur.execute(
                """
                INSERT INTO candidate_seen
                    (pipeline, article_key, seen_at, tab, score, reasoning, is_manual, excluded_from_general, reason, detail)
                VALUES (%s, %s, COALESCE(%s::timestamptz, now()), %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (pipeline, article_key) DO NOTHING
                """,
                r,
            )
            inserted += cur.rowcount
    return {"dry_run": False, "count": len(rows), "inserted": inserted, "skipped": len(rows) - inserted}


def count(pipeline: Optional[str] = None) -> int:
    with get_cursor() as cur:
        if pipeline:
            cur.execute("SELECT count(*) AS n FROM candidate_seen WHERE pipeline = %s", (pipeline,))
        else:
            cur.execute("SELECT count(*) AS n FROM candidate_seen")
        return int(cur.fetchone()["n"])
