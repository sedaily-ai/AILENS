"""PRISM 일괄 제작 — CMS "PRISM 제작" 화면 백엔드(2026-10-22).

사용자 요청: 편집자가 그날 그룹별 기사 파일(1~12개)을 한 번에 끌어다 놓으면 대본 → 영상까지 동시에 자동으로.
파일 1개 = video-lab ECS 태스크 1개다. 작업 정의(entryPoint=render_from_script.py)는 영상 랩 그대로 쓰고 인자만
다르게 준다(--prism-article-s3-key …) — 새 ECS family·IAM 없이 기존 RunTask 권한으로 돈다.

저장은 전부 S3 media/prism-batch/ (DB 테이블 없음, 영상 랩과 같은 방식):
  {batch_id}/input/{NN}.txt       기사 원본(브라우저가 서명 URL로 직접 PUT)
  {batch_id}/manifest.json        이 라우트가 쓴다 — 파일 이름·그룹·날짜·job_id
  {batch_id}/{NN}.status.json     태스크가 쓴다 — stage(queued/script/scene/render/done/error)
  {batch_id}/{NN}.script.txt      태스크가 쓴다 — 영어 대본(EL Script + Block D)
  index.json                      최근 배치 목록(화면의 "지난 제작")
admin Lambda는 이 버킷에 GetObject 권한이 없어(routes/video_lab.py 참고) 읽기는 공개 URL GET으로 한다.
렌더 진행률·mp4는 영상 랩과 같은 media/video-lab/{job_id}.*라 화면은 GET /admin/video-lab/{job_id}를 그대로 쓴다.
"""
from __future__ import annotations

import datetime as dt
import json
import logging
import re
import uuid

from shared import response
from routes import video_lab
from routes.chat_ws import (
    _VIDEO_LAB_CLUSTER, _VIDEO_LAB_CONTAINER, _VIDEO_LAB_SECURITY_GROUPS, _VIDEO_LAB_SUBNETS,
    _VIDEO_LAB_TASK_DEFINITION, _ecs,
)
from routes.webtoon import jobs as webtoon_jobs

logger = logging.getLogger(__name__)

# pipelines/video/prism_batch.py::GROUPS, 화면 PrismBatchPage의 표와 같다(대본 작성 지침의 12개 카테고리).
GROUPS = {
    "SG1": "Students & Grads", "SG2": "Early Careers", "SG3": "Founders", "SG4": "Global Investors",
    "SG5": "CEO", "SG6": "Retail Investors", "SG7": "Real Estate", "SG8": "Stock Investors",
    "PG1": "Front Page Daily", "PG2": "Securities Daily", "PG3": "Industry Daily", "PG4": "Finance Daily",
}
_PREFIX = "media/prism-batch"
_MAX_FILES = 12
_UPLOAD_URL_TTL_SECONDS = 900
_INDEX_KEEP = 60
_BATCH_ID_RE = re.compile(r"^[0-9]{8}-[0-9]{4}-[0-9a-f]{6}$")
_KST = dt.timezone(dt.timedelta(hours=9))


def _public_base() -> str:
    return f"https://{webtoon_jobs.bucket()}.s3.us-east-1.amazonaws.com"


def _read_json(key: str) -> dict | None:
    raw = video_lab._get_text(f"{_public_base()}/{key}")
    if raw is None:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return None


def _write_json(key: str, body: dict) -> None:
    webtoon_jobs.s3().put_object(
        Bucket=webtoon_jobs.bucket(), Key=key, ContentType="application/json",
        Body=json.dumps(body, ensure_ascii=False).encode("utf-8"),
        CacheControl="no-cache",  # 화면이 몇 초마다 다시 읽는다
    )


def _run_item(batch_id: str, item: dict) -> None:
    command = [
        "--job-id", item["job_id"],
        "--prism-article-s3-key", item["input_key"],
        "--prism-batch-id", batch_id,
        "--prism-item-id", item["item_id"],
        "--prism-type", item["type"],
        "--prism-recording-date", item["recording_date"],
    ]
    _ecs().run_task(
        cluster=_VIDEO_LAB_CLUSTER,
        taskDefinition=_VIDEO_LAB_TASK_DEFINITION,
        launchType="FARGATE",
        networkConfiguration={
            "awsvpcConfiguration": {
                "subnets": _VIDEO_LAB_SUBNETS,
                "securityGroups": _VIDEO_LAB_SECURITY_GROUPS,
                "assignPublicIp": "ENABLED",
            }
        },
        overrides={"containerOverrides": [{"name": _VIDEO_LAB_CONTAINER, "command": command}]},
    )
    _write_json(f"{_PREFIX}/{batch_id}/{item['item_id']}.status.json", {"stage": "queued", "job_id": item["job_id"]})


def _upload_urls(body: dict) -> dict:
    count = body.get("count")
    if not isinstance(count, int) or not 1 <= count <= _MAX_FILES:
        return response.err(f"파일은 1~{_MAX_FILES}개까지 올릴 수 있습니다", 400)
    now = dt.datetime.now(_KST)
    batch_id = f"{now:%Y%m%d-%H%M}-{uuid.uuid4().hex[:6]}"
    uploads = []
    for i in range(count):
        key = f"{_PREFIX}/{batch_id}/input/{i + 1:02d}.txt"
        url = webtoon_jobs.s3().generate_presigned_url(
            "put_object",
            Params={"Bucket": webtoon_jobs.bucket(), "Key": key, "ContentType": "text/plain; charset=utf-8"},
            ExpiresIn=_UPLOAD_URL_TTL_SECONDS,
        )
        uploads.append({"key": key, "url": url})
    return response.ok({"batch_id": batch_id, "uploads": uploads})


def _start(body: dict) -> dict:
    batch_id = body.get("batch_id") or ""
    raw_items = body.get("items") or []
    if not _BATCH_ID_RE.match(batch_id) or not isinstance(raw_items, list) or not 1 <= len(raw_items) <= _MAX_FILES:
        return response.err("요청이 올바르지 않습니다", 400)
    items: list[dict] = []
    for i, raw in enumerate(raw_items, start=1):
        type_code = raw.get("type")
        recording_date = raw.get("recording_date") or ""
        input_key = raw.get("input_key") or ""
        if type_code not in GROUPS:
            return response.err(f"{raw.get('file_name')}: 그룹을 골라 주세요", 400)
        try:
            dt.date.fromisoformat(recording_date)
        except ValueError:
            return response.err(f"{raw.get('file_name')}: 날짜가 올바르지 않습니다", 400)
        if not input_key.startswith(f"{_PREFIX}/{batch_id}/input/"):
            return response.err("업로드 경로가 올바르지 않습니다", 400)
        item_id = f"{i:02d}"
        items.append({
            "item_id": item_id, "file_name": str(raw.get("file_name") or "")[:120], "type": type_code,
            "group": GROUPS[type_code], "recording_date": recording_date, "input_key": input_key,
            "job_id": f"prism-{batch_id}-{item_id}",
        })
    created_at = dt.datetime.now(_KST).isoformat(timespec="seconds")
    manifest = {"batch_id": batch_id, "created_at": created_at, "items": items}
    _write_json(f"{_PREFIX}/{batch_id}/manifest.json", manifest)

    failed: list[str] = []
    for item in items:
        try:
            _run_item(batch_id, item)
        except Exception as e:  # noqa: BLE001 — 한 편의 시작 실패가 나머지를 막지 않게
            logger.exception(f"PRISM 일괄 제작 RunTask 실패({item['file_name']})")
            failed.append(item["file_name"])
            _write_json(f"{_PREFIX}/{batch_id}/{item['item_id']}.status.json",
                        {"stage": "error", "job_id": item["job_id"], "message": f"작업 시작 실패: {e}"[:500]})

    index = _read_json(f"{_PREFIX}/index.json") or {"batches": []}
    entry = {"batch_id": batch_id, "created_at": created_at, "count": len(items),
             "groups": [item["group"] for item in items]}
    index["batches"] = [entry, *[b for b in index.get("batches", []) if b.get("batch_id") != batch_id]][:_INDEX_KEEP]
    _write_json(f"{_PREFIX}/index.json", index)
    return response.ok({"batch_id": batch_id, "started": len(items) - len(failed), "failed": failed})


def _retry(body: dict) -> dict:
    batch_id = body.get("batch_id") or ""
    item_id = body.get("item_id") or ""
    if not _BATCH_ID_RE.match(batch_id):
        return response.err("요청이 올바르지 않습니다", 400)
    manifest = _read_json(f"{_PREFIX}/{batch_id}/manifest.json")
    item = next((x for x in (manifest or {}).get("items", []) if x.get("item_id") == item_id), None)
    if not item:
        return response.err("해당 편을 찾을 수 없습니다", 404)
    # 렌더 결과(media/video-lab/{job_id}.*)가 이전 시도와 섞이지 않게 job_id를 새로 만든다.
    item["job_id"] = f"prism-{batch_id}-{item_id}-r{uuid.uuid4().hex[:4]}"
    try:
        _run_item(batch_id, item)
    except Exception as e:  # noqa: BLE001
        logger.exception("PRISM 일괄 제작 재시도 RunTask 실패")
        return response.err(f"작업 시작 실패: {e}", 500)
    _write_json(f"{_PREFIX}/{batch_id}/manifest.json", manifest)
    return response.ok({"job_id": item["job_id"]})


def handle_post(body: dict, path_params: dict, query_params: dict) -> dict:
    """`POST /admin/prism-batch` — action: upload_urls(서명 URL 발급) | start(제작 시작) | retry(한 편 다시)."""
    action = (body or {}).get("action")
    if action == "upload_urls":
        return _upload_urls(body)
    if action == "start":
        return _start(body)
    if action == "retry":
        return _retry(body)
    return response.err("알 수 없는 요청입니다", 400)


def handle_list(body: dict, path_params: dict, query_params: dict) -> dict:
    """`GET /admin/prism-batch` — 최근 배치 목록."""
    index = _read_json(f"{_PREFIX}/index.json") or {"batches": []}
    return response.ok({"batches": index.get("batches", [])})


def handle_get(body: dict, path_params: dict, query_params: dict) -> dict:
    """`GET /admin/prism-batch/{batch_id}` — 편별 상태. 렌더 진행률·영상 주소는 영상 랩 파일에서 같이 읽는다."""
    batch_id = (path_params or {}).get("batch_id", "")
    if not _BATCH_ID_RE.match(batch_id):
        return response.err("batch_id가 올바르지 않습니다", 400)
    manifest = _read_json(f"{_PREFIX}/{batch_id}/manifest.json")
    if not manifest:
        return response.err("제작 기록을 찾을 수 없습니다", 404)
    base = _public_base()
    items = []
    for item in manifest.get("items", []):
        status = _read_json(f"{_PREFIX}/{batch_id}/{item['item_id']}.status.json") or {"stage": "queued"}
        row = {**item, "stage": status.get("stage"), "message": status.get("message"), "title": status.get("title")}
        if row["stage"] in ("scene", "render", "done"):  # 대본은 장면 단계에 들어갈 때 저장된다
            row["script_url"] = f"{base}/{_PREFIX}/{batch_id}/{item['item_id']}.script.txt"
        if status.get("job_id") and status.get("job_id") != item.get("job_id"):
            row["stage"] = "queued"  # 재시도 직후 — 새 태스크가 아직 상태를 안 썼다
        if row["stage"] == "render":
            row["progress"] = _read_json(f"media/video-lab/{item['job_id']}.progress.json")
        if row["stage"] == "done":
            row["video_url"] = f"{base}/media/video-lab/{item['job_id']}.mp4"
            row["thumb_url"] = f"{base}/media/video-lab/{item['job_id']}.jpg"
        items.append(row)
    return response.ok({"batch_id": batch_id, "created_at": manifest.get("created_at"), "items": items})
