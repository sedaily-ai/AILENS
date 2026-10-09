"""관리자 비동기 작업 상태 — admin_jobs 테이블.

옛 DynamoDB sedaily-mbti-admin-config-dev 의 WEBTOONLAB/PROMPTTEST job 을 대체한다(설계: docs/architecture/lens-erd-src/
16-ddb-잔여-이관-설계.md, v1.36). 테이블은 마스터 계정으로 만든다(lens_service_app 에는 DDL 권한이 없다).

한 작업 = 한 행이고 상태가 pending → running → done|error 로 바뀐다. 입력은 payload, 결과는 result(JSONB)이며 작업 종류마다
모양이 달라도 테이블은 그대로다. 수명이 짧아 expires_at(기본 30일)이 지나면 정리한다 — 새 작업을 만들 때 기회 삼아 지운다.
옛 코드는 임의의 필드를 최상위에 마구 덧붙였으므로, 갱신 시 status/error 외의 필드는 result 에 병합한다.
"""
from __future__ import annotations

import json
import re
from typing import Any, Dict, Optional

from db import get_cursor

_VALID_STATUS = ("pending", "running", "done", "error")
_KIND_RE = re.compile(r"^[a-z0-9_]{1,32}$")
_JOB_ID_RE = re.compile(r"^[A-Za-z0-9_\-]{1,64}$")
_MAX_JSON_BYTES = 200_000


def _check_ids(kind: str, job_id: str) -> None:
    if not _KIND_RE.match(kind or ""):
        raise ValueError("kind는 영소문자·숫자·밑줄 1~32자")
    if not _JOB_ID_RE.match(job_id or ""):
        raise ValueError("job_id는 영문·숫자·-_ 1~64자")


def _dumps(value: Any) -> str:
    text = json.dumps(value or {}, ensure_ascii=False, default=str)
    if len(text.encode("utf-8")) > _MAX_JSON_BYTES:
        raise ValueError("payload/result가 너무 큽니다(200KB 상한). 큰 본문은 S3에 두고 URL만 저장하세요")
    return text


def _row_to_dict(r: Dict[str, Any]) -> Dict[str, Any]:
    def iso(v):
        return v.isoformat() if v else None
    return {
        "kind": r["kind"],
        "job_id": r["job_id"],
        "status": r["status"],
        "payload": r.get("payload") or {},
        "result": r.get("result") or {},
        "error": r.get("error"),
        "created_at": iso(r.get("created_at")),
        "updated_at": iso(r.get("updated_at")),
        "finished_at": iso(r.get("finished_at")),
    }


def create_job(kind: str, job_id: str, payload: Optional[Dict[str, Any]] = None, ttl_days: int = 30) -> Dict[str, Any]:
    _check_ids(kind, job_id)
    ttl_days = max(1, min(int(ttl_days), 365))
    with get_cursor() as cur:
        cur.execute("DELETE FROM admin_jobs WHERE expires_at < now()")  # 만료 정리(작은 테이블이라 비용 무시)
        cur.execute(
            """
            INSERT INTO admin_jobs (kind, job_id, status, payload, expires_at)
            VALUES (%s, %s, 'pending', %s, now() + (%s || ' days')::interval)
            ON CONFLICT (kind, job_id) DO NOTHING
            RETURNING kind, job_id, status, payload, result, error, created_at, updated_at, finished_at
            """,
            (kind, job_id, _dumps(payload), str(ttl_days)),
        )
        row = cur.fetchone()
    if not row:
        raise LookupError("이미 같은 kind/job_id 작업이 있습니다")
    return _row_to_dict(row)


def update_job(kind: str, job_id: str, status: Optional[str] = None, error: Optional[str] = None,
               result_merge: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
    """부분 갱신 — 지정한 값만 바꾸고 나머지(payload 등)는 보존한다. 없는 작업이면 None."""
    _check_ids(kind, job_id)
    if status is not None and status not in _VALID_STATUS:
        raise ValueError(f"status는 {_VALID_STATUS} 중 하나")
    with get_cursor() as cur:
        cur.execute(
            """
            UPDATE admin_jobs SET
                status      = COALESCE(%s, status),
                error       = COALESCE(%s, error),
                result      = result || %s::jsonb,
                updated_at  = now(),
                finished_at = CASE WHEN COALESCE(%s, status) IN ('done', 'error') THEN COALESCE(finished_at, now()) ELSE finished_at END
            WHERE kind = %s AND job_id = %s
            RETURNING kind, job_id, status, payload, result, error, created_at, updated_at, finished_at
            """,
            (status, (error or None) and error[:2000], _dumps(result_merge), status, kind, job_id),
        )
        row = cur.fetchone()
    return _row_to_dict(row) if row else None


def get_job(kind: str, job_id: str) -> Optional[Dict[str, Any]]:
    _check_ids(kind, job_id)
    with get_cursor() as cur:
        cur.execute(
            "SELECT kind, job_id, status, payload, result, error, created_at, updated_at, finished_at "
            "FROM admin_jobs WHERE kind = %s AND job_id = %s",
            (kind, job_id),
        )
        row = cur.fetchone()
    return _row_to_dict(row) if row else None
