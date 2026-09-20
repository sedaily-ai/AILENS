"""GPU(IP-Adapter) 인스턴스 켜기/끄기 — 2026-09-14, "테스트하는 동안은
계속 켜두고 작업자가 다 쓰면 수동으로 끄는" 방식(사용자 요청).
gpu_ipadapter.py의 활성 사용자 수 카운트(DynamoDB 원자적 ADD)를 그대로
재사용 — 프로덕션 파이프라인이 같은 GPU를 동시에 쓰는 중이어도 admin
세션이 자기 몫만 안전하게 켜고 끌 수 있다(gpu_ipadapter.py 모듈
docstring 참고)."""
from __future__ import annotations

import logging
import uuid

import boto3

from shared import audit, response, time_utils
from routes.webtoon import jobs
import gpu_ipadapter  # pipelines/common/ — GPU IP-Adapter 제어(2026-09-14)

logger = logging.getLogger(__name__)


def handle_gpu_status(body: dict, path_params: dict, query_params: dict) -> dict:
    ec2 = boto3.client("ec2", region_name=gpu_ipadapter.GPU_REGION)
    state = ec2.describe_instances(
        InstanceIds=[gpu_ipadapter.GPU_INSTANCE_ID]
    )["Reservations"][0]["Instances"][0]["State"]["Name"]
    return response.ok({"state": state})


def run_gpu_start(job_id: str, push=None) -> None:
    """`routes/webtoon/__init__.py::run_async_job`(self-invoke)와
    `routes/webtoon/chat_ws.py`(웹소켓 챗랩의 "GPU 켜기") 양쪽이 부른다."""
    try:
        gpu_ipadapter.ensure_gpu_running()
        jobs.update_job(job_id, {"status": "done", "updated_at": time_utils.now_iso()})
        if push:
            push({"type": "gpu_status", "state": "running"})
    except Exception as e:  # noqa: BLE001 — 비동기 invocation 최상위
        logger.exception(f"webtoon-lab gpu start failed: {job_id}")
        jobs.update_job(job_id, {"status": "error", "error": str(e)[:500], "updated_at": time_utils.now_iso()})
        if push:
            push({"type": "gpu_error", "error": str(e)[:500]})


def handle_gpu_start(body: dict, path_params: dict, query_params: dict) -> dict:
    """기동+SSM 온라인 대기까지 1~3분 걸릴 수 있어(gpu_ipadapter.ensure_gpu_running
    timeout_s=180) 30초 API Gateway 벽을 넘길 수 있다 — 컷 생성과 같은
    self-invoke 비동기 패턴. 폴링은 기존 GET .../{job_id}를 그대로 쓴다
    (이 job도 같은 테이블·같은 status/error 모양이라 별도 엔드포인트가
    필요 없다)."""
    job_id = uuid.uuid4().hex[:16]
    now = time_utils.now_iso()
    jobs.put_job(job_id, {"status": "pending", "created_at": now, "updated_at": now})
    jobs.self_invoke_async({"kind": "gpu_start", "job_id": job_id})
    audit.log("webtoon-lab-gpu-start", {"job_id": job_id})
    return response.ok({"job_id": job_id, "status": "pending"})


def handle_gpu_stop(body: dict, path_params: dict, query_params: dict) -> dict:
    """빠른 동기 호출(ec2:StopInstances 한 번, 대기 없음) — 다른 태스크가
    아직 쓰는 중이면 gpu_ipadapter.stop_gpu()가 알아서 실제 정지를
    보류한다."""
    try:
        gpu_ipadapter.stop_gpu()
        return response.ok({"stopping": True})
    except Exception as e:
        return response.err(str(e), 500)
