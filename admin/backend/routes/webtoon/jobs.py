"""웹툰 실험 패널 전용 작업(job) 저장소 — `routes/webtoon/` 하위 모든
모듈(generate.py/gpu.py/stage.py)이 공유한다.

2026-09-20 — `routes/webtoon_lab.py`(1035줄) 하나에 컷 이미지 생성·GPU
제어·참조 이미지 업로드·단계별 생성이 전부 섞여 있던 걸 기능별로 쪼갰다
(사용자 요청: "웹툰 관련한거는... 기능별로 코드파일들이 있기를
원하는데요"). 이 파일은 그 쪼갠 조각들이 공통으로 쓰는 job 테이블
읽기/쓰기·S3 업로드·self-invoke 헬퍼와, 모든 job 종류가 공유하는 단일
폴링 라우트(`GET /admin/webtoon-lab/{job_id}`)만 담는다 — 새 테이블을
만들지 않고 기존 admin config 테이블을 pk="WEBTOONLAB" 네임스페이스로
재사용하는 건 예전 그대로다."""
from __future__ import annotations

import json
import os

import boto3

from shared import ddb_client, response

JOB_PK = "WEBTOONLAB"
MAX_SCENE_BYTES = 4000
MAX_TEXT_BYTES = 20000  # style/character 필드 상한 — 오남용(과금 폭주) 방지

_s3_client = None


def s3():
    global _s3_client
    if _s3_client is None:
        _s3_client = boto3.client("s3", region_name="us-east-1")
    return _s3_client


def bucket() -> str:
    return os.environ.get("CMS_MEDIA_BUCKET", "")


def job_table():
    # 별도 테이블을 새로 만들지 않고 기존 admin config 테이블을 재사용한다
    # (drivers.py가 pk="CONFIG", auth.py가 pk="AUTH"를 쓰는 것과 같은 방식
    # — 새 pk 네임스페이스만 하나 더 늘어난다). 실험 데이터가 쌓이는 게
    # 걱정되면 TTL 속성을 테이블에 추가 설정하고 여기 expires_at을 채우면
    # 되는데, 테이블에 TTL이 이미 켜져 있는지 확인 안 된 상태라 지금은
    # 수동 정리 대상으로만 남겨둔다.
    return ddb_client.config_table()


def put_job(job_id: str, item: dict) -> None:
    """전체 레코드 생성 — 각 job 종류의 최초 1회 쓰기 전용. `put_item`은
    항목 전체를 덮어쓴다는 점에 주의: 이후 상태 갱신에는 반드시
    `update_job`(부분 갱신)을 써야 한다(로컬 스모크테스트에서 실수로
    `put_job`을 재사용해 scene/camera/prompt_preview/created_at이 통째로
    사라지는 걸 실제로 확인했다)."""
    row = {"pk": JOB_PK, "sk": f"job/{job_id}", **item}
    job_table().put_item(Item=row)


def update_job(job_id: str, updates: dict) -> None:
    """부분 갱신 — 지정한 필드만 바꾸고 나머지(scene/camera/style 등)는 보존한다."""
    expr_names = {f"#{k}": k for k in updates}
    expr_values = {f":{k}": v for k, v in updates.items()}
    update_expr = "SET " + ", ".join(f"#{k} = :{k}" for k in updates)
    job_table().update_item(
        Key={"pk": JOB_PK, "sk": f"job/{job_id}"},
        UpdateExpression=update_expr,
        ExpressionAttributeNames=expr_names,
        ExpressionAttributeValues=expr_values,
    )


def get_job(job_id: str) -> dict | None:
    resp = job_table().get_item(Key={"pk": JOB_PK, "sk": f"job/{job_id}"})
    return resp.get("Item")


def self_invoke_async(payload: dict) -> None:
    """자기 자신을 InvocationType="Event"로 다시 호출해 GPU/Bedrock 체인
    작업을 완전히 별개의 invocation에서 처리한다 — routes/prompts.py의
    같은 이름 헬퍼와 동일한 이유·동일한 패턴(그쪽 docstring 참고). 마커
    키만 "_async_webtoon_job"으로 달리해서 handler.py가 두 모듈의 비동기
    작업을 구분해 라우팅한다."""
    lambda_client = boto3.client("lambda")
    function_name = os.environ.get("AWS_LAMBDA_FUNCTION_NAME", "sedaily-mbti-admin-api-dev")
    lambda_client.invoke(
        FunctionName=function_name,
        InvocationType="Event",
        Payload=json.dumps({"_async_webtoon_job": payload}).encode("utf-8"),
    )


def job_payload(job_id: str, item: dict) -> dict:
    """`GET /admin/webtoon-lab/{job_id}` 응답 모양 — job 종류마다 필드가
    다를 수 있어(예: 단계별 생성은 stage/character/params) 존재하는 키만
    담아도 되게 `.get()`으로 느슨하게 읽는다."""
    return {
        "job_id": job_id,
        "status": item.get("status"),
        "image_url": item.get("image_url"),
        "s3_key": item.get("s3_key"),
        "error": item.get("error"),
        "scene": item.get("scene"),
        "camera": item.get("camera"),
        "style": item.get("style"),
        "char_female": item.get("char_female"),
        "char_male": item.get("char_male"),
        "scene_reinforce": item.get("scene_reinforce"),
        "char_reinforce": item.get("char_reinforce"),
        "prompt_preview": item.get("prompt_preview"),
        "created_at": item.get("created_at"),
    }


def handle_status(body: dict, path_params: dict, query_params: dict) -> dict:
    """`GET /admin/webtoon-lab/{job_id}` — 모든 job 종류(컷 생성/GPU 시작/
    단계별 생성)가 공유하는 단일 폴링 라우트. 종류별 전용 GET 라우트를
    따로 안 만든다(handler.py 등록 주석 참고)."""
    job_id = (path_params or {}).get("job_id", "")
    if not job_id:
        return response.err("job_id required", 400)
    item = get_job(job_id)
    if not item:
        return response.err("job not found", 404)
    return response.ok(job_payload(job_id, item))
