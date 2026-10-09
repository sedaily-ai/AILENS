"""관리자 비동기 작업 상태 — PostgreSQL 상시 서버(lens-cms-api) 경유 (v1.36).

config_repo.py(v1.28)와 같은 패턴. 실제 저장 로직은 service/lens-cms-api/admin_jobs_repo.py 가 갖고 있다.
옛 DynamoDB admin-config 테이블의 WEBTOONLAB/PROMPTTEST job 을 대체한다. 호출부(routes/webtoon/jobs.py, routes/prompts.py)는
JOBS_BACKEND=pg 일 때만 이 모듈을 쓴다(기본 ddb → 검증 후 pg).

옛 코드는 job 항목의 필드를 최상위에 자유롭게 덧붙였다(status·error 외에 image_url·output·cut 등). 서버는 status/error 와
입력(payload)/결과(result)를 분리해 저장하므로, 여기서 옛 모양(평평한 dict)으로 되돌려 호출부가 바뀌지 않게 한다.
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request

from shared.ssm_client import get_secure

_API_URL = os.environ.get("LENS_CMS_API_URL", "http://13.223.179.151")
_TOKEN_PARAM = os.environ.get("LENS_CMS_API_TOKEN_PARAM", "/sedaily-mbti/admin/lens-cms-api-token")
_TIMEOUT_SECONDS = 8

# 옛 job 항목에서 "결과"로 취급하는 필드. 나머지(cut, prompt, scene 등)는 입력(payload)이다.
_RESULT_FIELDS = ("image_url", "bg_url", "output")
_SKIP_FIELDS = ("pk", "sk", "status", "error", "created_at", "updated_at")


def _request(method: str, path: str, body: dict | None = None) -> dict:
    req = urllib.request.Request(
        f"{_API_URL}{path}",
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Content-Type": "application/json", "X-Internal-Token": get_secure(_TOKEN_PARAM)},
        method=method,
    )
    with urllib.request.urlopen(req, timeout=_TIMEOUT_SECONDS) as res:
        return json.loads(res.read())


def _path(kind: str, job_id: str) -> str:
    return f"/internal/admin-jobs/{urllib.parse.quote(kind)}/{urllib.parse.quote(job_id)}"


def put_job(kind: str, job_id: str, item: dict) -> None:
    payload = {k: v for k, v in item.items() if k not in _SKIP_FIELDS and k not in _RESULT_FIELDS}
    _request("POST", "/internal/admin-jobs", {"kind": kind, "job_id": job_id, "payload": payload})


def update_job(kind: str, job_id: str, updates: dict) -> None:
    body: dict = {"result": {k: v for k, v in updates.items() if k in _RESULT_FIELDS}}
    if "status" in updates:
        body["status"] = updates["status"]
    if "error" in updates:
        body["error"] = updates["error"]
    _request("PATCH", _path(kind, job_id), body)


def get_job(kind: str, job_id: str) -> dict | None:
    """옛 DynamoDB 항목과 같은 평평한 dict(status·error·created_at·updated_at + 입력 + 결과)로 돌려준다. 없으면 None."""
    try:
        job = _request("GET", _path(kind, job_id))["job"]
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise
    item = {**job["payload"], **job["result"], "status": job["status"], "created_at": job["created_at"], "updated_at": job["updated_at"]}
    if job.get("error"):
        item["error"] = job["error"]
    return item
