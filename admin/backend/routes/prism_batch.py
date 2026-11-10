"""PRISM 일괄 제작 — CMS "PRISM 제작" 화면 백엔드(2026-10-22).

사용자 요청: 편집자가 그날 그룹별 기사 파일(1~12개)을 한 번에 끌어다 놓으면 대본 → 영상까지 동시에 자동으로.
파일 1개 = video-lab ECS 태스크 1개다. 작업 정의(entryPoint=render_from_script.py)는 영상 랩 그대로 쓰고 인자만
다르게 준다(--prism-article-s3-key …) — 새 ECS family·IAM 없이 기존 RunTask 권한으로 돈다.

저장은 전부 S3 media/prism-batch/ (DB 테이블 없음, 영상 랩과 같은 방식):
  {batch_id}/input/{NN}.txt       기사 원본(브라우저가 서명 URL로 직접 PUT)
  {batch_id}/manifest.json        이 라우트가 쓴다 — 파일 이름·그룹·날짜·job_id
  {batch_id}/{NN}.status.json     태스크가 쓴다 — stage(queued/script/scene/render/upload/done/error), youtube_url
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
import time
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


def _run_item(batch_id: str, item: dict, container_env: list[dict] | None = None) -> str:
    """video-lab 태스크를 켜고 태스크 ARN을 돌려준다. 자리 부족 등으로 못 켜면 예외."""
    command = [
        "--job-id", item["job_id"],
        "--prism-article-s3-key", item["input_key"],
        "--prism-batch-id", batch_id,
        "--prism-item-id", item["item_id"],
        "--prism-type", item["type"],
        "--prism-recording-date", item["recording_date"],
    ]
    override = {"name": _VIDEO_LAB_CONTAINER, "command": command}
    if container_env:  # 자동 제작 시험 모드 — 유튜브·슬랙 끄기(routes/prism_schedule.py)
        override["environment"] = container_env
    res = _ecs().run_task(
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
        overrides={"containerOverrides": [override]},
    )
    # RunTask는 못 켜도 예외 없이 failures로 돌려준다 — 안 보면 화면에 "대기 중"으로 남는다.
    if res.get("failures") or not res.get("tasks"):
        raise RuntimeError(f"RunTask 실패: {res.get('failures')}"[:300])
    _write_json(f"{_PREFIX}/{batch_id}/{item['item_id']}.status.json", {"stage": "queued", "job_id": item["job_id"]})
    return res["tasks"][0]["taskArn"]


def new_batch_id() -> str:
    return f"{dt.datetime.now(_KST):%Y%m%d-%H%M}-{uuid.uuid4().hex[:6]}"


def input_key(batch_id: str, n: int) -> str:
    return f"{_PREFIX}/{batch_id}/input/{n:02d}.txt"


def _upload_urls(body: dict) -> dict:
    count = body.get("count")
    if not isinstance(count, int) or not 1 <= count <= _MAX_FILES:
        return response.err(f"파일은 1~{_MAX_FILES}개까지 올릴 수 있습니다", 400)
    batch_id = new_batch_id()
    uploads = []
    for i in range(count):
        key = input_key(batch_id, i + 1)
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
        key = raw.get("input_key") or ""
        if type_code not in GROUPS:
            return response.err(f"{raw.get('file_name')}: 그룹을 골라 주세요", 400)
        try:
            dt.date.fromisoformat(recording_date)
        except ValueError:
            return response.err(f"{raw.get('file_name')}: 날짜가 올바르지 않습니다", 400)
        if not key.startswith(f"{_PREFIX}/{batch_id}/input/"):
            return response.err("업로드 경로가 올바르지 않습니다", 400)
        item_id = f"{i:02d}"
        items.append({
            "item_id": item_id, "file_name": str(raw.get("file_name") or "")[:120], "type": type_code,
            "group": GROUPS[type_code], "recording_date": recording_date, "input_key": key,
            "job_id": f"prism-{batch_id}-{item_id}",
        })
    failed = start_batch(batch_id, items)
    return response.ok({"batch_id": batch_id, "started": len(items) - len(failed), "failed": failed})


def start_batch(batch_id: str, items: list[dict], *, gap_seconds: float = 0,
                container_env: list[dict] | None = None) -> list[str]:
    """manifest·지난 제작 목록을 쓰고 편마다 video-lab 태스크를 켠다. 시작 못 한 편의 file_name 목록을 돌려준다.
    화면의 [제작 시작](_start)이 쓴다. 자동 제작은 나눠서 켜므로 create_batch + start_item을 직접 부른다.

    gap_seconds: 편 사이 간격. 8편을 한꺼번에 켜면 성우(Polly) 합성이 같은 때 몰려 "Rate exceeded"로 렌더가
    실패한다(2026-11-05 시험 8편 중 5편)."""
    create_batch(batch_id, items)
    failed: list[str] = []
    for n, item in enumerate(items):
        if n and gap_seconds:
            time.sleep(gap_seconds)
        if start_item(batch_id, item, container_env) is None:
            failed.append(item["file_name"])
    return failed


def create_batch(batch_id: str, items: list[dict], notes: list[str] | None = None) -> None:
    """manifest를 쓰고 지난 제작 목록에 올린다. notes는 완료 알림 끝 "📌 참고"에 붙는다(prism_notify.py)."""
    created_at = dt.datetime.now(_KST).isoformat(timespec="seconds")
    manifest = {"batch_id": batch_id, "created_at": created_at, "items": items}
    if notes:
        manifest["notes"] = notes
    _write_json(f"{_PREFIX}/{batch_id}/manifest.json", manifest)
    # 간격을 두면 다 켜는 데 시간이 걸린다 — 목록에는 먼저 올려 화면에서 바로 보이게 한다.
    index = _read_json(f"{_PREFIX}/index.json") or {"batches": []}
    entry = {"batch_id": batch_id, "created_at": created_at, "count": len(items),
             "groups": [item["group"] for item in items]}
    index["batches"] = [entry, *[b for b in index.get("batches", []) if b.get("batch_id") != batch_id]][:_INDEX_KEEP]
    _write_json(f"{_PREFIX}/index.json", index)


def start_item(batch_id: str, item: dict, container_env: list[dict] | None = None) -> str | None:
    """한 편을 켠다 → 태스크 ARN. 못 켜면 상태를 error로 쓰고 None(한 편의 실패가 나머지를 막지 않게)."""
    try:
        return _run_item(batch_id, item, container_env)
    except Exception as e:  # noqa: BLE001
        logger.exception(f"PRISM 일괄 제작 RunTask 실패({item['file_name']})")
        _write_json(f"{_PREFIX}/{batch_id}/{item['item_id']}.status.json",
                    {"stage": "error", "job_id": item["job_id"], "message": f"작업 시작 실패: {e}"[:500]})
        return None


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
        # 지금 작업 번호는 편마다 따로 있는 status.json을 기준으로 한다. [다시 시도]를 여러 편 거의 동시에 누르면
        # manifest.json을 동시에 고치다 한 편의 새 번호가 덮어써져, 화면이 그 편을 계속 '대기'로 보였다(2026-11-10 주식).
        # status.json은 [다시 시도] 때 새 번호의 queued로 바로 쓰이므로(_run_item) 재시도 직후도 '대기'로 보인다.
        item = {**item, "job_id": status.get("job_id") or item.get("job_id")}
        row = {**item, "stage": status.get("stage"), "message": status.get("message"), "title": status.get("title"),
               "youtube_url": status.get("youtube_url"), "youtube_error": status.get("youtube_error"),
               "dailymotion_url": status.get("dailymotion_url"), "dailymotion_error": status.get("dailymotion_error")}
        if row["stage"] in ("scene", "render", "done"):  # 대본은 장면 단계에 들어갈 때 저장된다
            row["script_url"] = f"{base}/{_PREFIX}/{batch_id}/{item['item_id']}.script.txt"
        if row["stage"] == "render":
            row["progress"] = _read_json(f"media/video-lab/{item['job_id']}.progress.json")
        if row["stage"] == "done":
            row["video_url"] = f"{base}/media/video-lab/{item['job_id']}.mp4"
            row["thumb_url"] = f"{base}/media/video-lab/{item['job_id']}.jpg"
        items.append(row)
    return response.ok({"batch_id": batch_id, "created_at": manifest.get("created_at"), "items": items})
