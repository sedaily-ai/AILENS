"""웹툰 실험 패널 전용 작업(job) 저장소·S3 헬퍼 — `routes/webtoon/generate.py`
가 컷 이미지 job 기록에, `routes/chat_ws.py`·`routes/chat_threads.py`·
`routes/video_lab.py`가 `s3()`/`bucket()`만 공용 S3 헬퍼로 쓴다.

2026-09-20 — `routes/webtoon_lab.py`(1035줄) 하나에 컷 이미지 생성·GPU
제어·참조 이미지 업로드·단계별 생성이 전부 섞여 있던 걸 기능별로 쪼갰다
(사용자 요청: "웹툰 관련한거는... 기능별로 코드파일들이 있기를
원하는데요"). 새 테이블을 만들지 않고 기존 admin config 테이블을
pk="WEBTOONLAB" 네임스페이스로 재사용하는 건 예전 그대로다.

2026-09-25 — gpu.py/stage.py 삭제(pipeline/style_guide 모델 삭제 후속)로
이 파일이 갖고 있던 self_invoke_async()·get_job()·job_payload()·
handle_status()(공유 폴링 라우트)가 전부 무호출이 돼 같이 삭제했다.
put_job/update_job/bucket/s3/job_table은 generate.py(컷 생성 job 기록)
와 다른 route들(S3 공용 헬퍼)이 계속 쓴다."""
from __future__ import annotations

import os

import boto3

from shared import ddb_client

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


