"""웹툰 3단계(이미지 생성) 실험 — Bedrock Stable Diffusion 전용.

2026-09-05 신설. admin 콘솔 프롬프트 드로어의 "이미지 실험" 탭이 호출한다.
API Gateway HTTP API 통합 타임아웃은 30초 고정인데 Bedrock 이미지 생성은
30초~9분 걸릴 수 있어(pipelines/webtoon/pipeline.py의
`_IMAGE_TIMEOUT_SECONDS` 참고) 동기 응답이 불가능하다 — 그래서 "작업
생성"(POST .../generate)과 "상태 조회"(GET .../{job_id})로 나뉜다.

프롬프트 조립·Bedrock 호출 로직은 `pipelines/common/webtoon_image.py`를
그대로 쓴다(`admin/backend/deploy-admin-api.sh`가 배포 시 그 디렉터리를
zip에 복사한다 — `service/backend/common/`을 복사하던 것과 같은 패턴).
여기 새로 복사하면 오늘 세션 내내 겪은 "복사본 하나만 고치고 하나는 안
고치는" 문제를 또 만드는 것이다.

⚠️ 비동기 실행 방식 — 로컬 개발과 실제 Lambda 배포가 다르다: 로컬
개발 서버(`admin/backend/local_server.py`)는 프로세스가 계속 떠 있으므로
백그라운드 스레드로 안전하게 끝까지 돈다. 실제 Lambda는 호출이 끝나는
순간 컨테이너가 얼려질 수 있어 스레드가 안 끝날 위험이 있다 — 프로덕션
배포 전에 Lambda 비동기 self-invoke(`InvocationType="Event"`)나 Step
Functions로 바꿔야 한다(아직 안 함, 로컬 실험용으로만 스레드 사용).

⚠️ 라우트 자체(`/admin/webtoon-lab/*`)도 API Gateway에 아직 없다 —
`.clauderules`상 deploy 스크립트는 라우트를 안 만든다, 프로덕션에 실제로
연결하려면 기존 라우트(`/admin/drivers/{id}` 등)와 같은 방식으로 콘솔/CLI
에서 수동으로 추가해야 한다."""
from __future__ import annotations

import datetime as dt
import logging
import os
import threading
import uuid

import boto3
from boto3.dynamodb.conditions import Key

from shared import audit, ddb_client, response
import webtoon_image  # pipelines/common/ — 배포 시 zip에 복사됨(위 docstring 참고)

logger = logging.getLogger(__name__)

_JOB_PK = "WEBTOONLAB"
_MAX_SCENE_BYTES = 4000
_MAX_TEXT_BYTES = 20000  # style/character 필드 상한 — 오남용(과금 폭주) 방지
_HISTORY_LIMIT = 24

_s3_client = None


def _s3():
    global _s3_client
    if _s3_client is None:
        _s3_client = boto3.client("s3", region_name="us-east-1")
    return _s3_client


def _bucket() -> str:
    return os.environ.get("CMS_MEDIA_BUCKET", "")


def _now_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _job_table():
    # 별도 테이블을 새로 만들지 않고 기존 admin config 테이블을 재사용한다
    # (drivers.py가 pk="CONFIG", auth.py가 pk="AUTH"를 쓰는 것과 같은 방식
    # — 새 pk 네임스페이스만 하나 더 늘어난다). 실험 데이터가 쌓이는 게
    # 걱정되면 TTL 속성을 테이블에 추가 설정하고 여기 expires_at을 채우면
    # 되는데, 테이블에 TTL이 이미 켜져 있는지 확인 안 된 상태라 지금은
    # 수동 정리 대상으로만 남겨둔다.
    return ddb_client.config_table()


def _put_job(job_id: str, item: dict) -> None:
    """전체 레코드 생성 — `handle_generate`의 최초 1회 쓰기 전용.
    `put_item`은 항목 전체를 덮어쓴다는 점에 주의: 이후 상태 갱신에는
    반드시 `_update_job`(부분 갱신)을 써야 한다(로컬 스모크테스트에서
    `_run_generation`이 실수로 `_put_job`을 재사용해 scene/camera/
    prompt_preview/created_at이 통째로 사라지는 걸 실제로 확인했다)."""
    row = {"pk": _JOB_PK, "sk": f"job/{job_id}", **item}
    _job_table().put_item(Item=row)


def _update_job(job_id: str, updates: dict) -> None:
    """부분 갱신 — 지정한 필드만 바꾸고 나머지(scene/camera/style 등)는 보존한다."""
    expr_names = {f"#{k}": k for k in updates}
    expr_values = {f":{k}": v for k, v in updates.items()}
    update_expr = "SET " + ", ".join(f"#{k} = :{k}" for k in updates)
    _job_table().update_item(
        Key={"pk": _JOB_PK, "sk": f"job/{job_id}"},
        UpdateExpression=update_expr,
        ExpressionAttributeNames=expr_names,
        ExpressionAttributeValues=expr_values,
    )


def _get_job(job_id: str) -> dict | None:
    resp = _job_table().get_item(Key={"pk": _JOB_PK, "sk": f"job/{job_id}"})
    return resp.get("Item")


def _run_generation(job_id: str, prompt: str) -> None:
    """백그라운드에서 실행 — Bedrock 호출 후 S3 업로드 + DDB 상태 갱신.
    실패해도 예외를 위로 던지지 않는다(백그라운드 스레드라 던져봐야 아무도
    안 받는다) — 대신 job 레코드에 error를 기록해 폴링 쪽이 보게 한다."""
    try:
        image_bytes = webtoon_image.generate_bedrock_image_bytes(prompt)
        bucket = _bucket()
        if not bucket:
            raise RuntimeError("CMS_MEDIA_BUCKET not configured")
        key = f"media/webtoon-lab/{job_id}.png"
        _s3().put_object(Bucket=bucket, Key=key, Body=image_bytes, ContentType="image/png")
        image_url = f"https://{bucket}.s3.us-east-1.amazonaws.com/{key}"
        _update_job(job_id, {"status": "done", "image_url": image_url, "updated_at": _now_iso()})
        audit.log("webtoon-lab-generate-done", {"job_id": job_id})
    except Exception as e:  # noqa: BLE001 — 백그라운드 스레드 최상위, 여기서 안 잡으면 조용히 사라짐
        logger.exception(f"webtoon-lab generate failed: {job_id}")
        _update_job(job_id, {"status": "error", "error": str(e)[:500], "updated_at": _now_iso()})


def handle_defaults(body: dict, path_params: dict, query_params: dict) -> dict:
    """프로덕션 기본 STYLE/FIXED_CHARACTERS 조회 — "직접 입력" 토글을 켰을 때
    빈 칸이 아니라 지금 실제로 쓰이는 프롬프트를 placeholder로 보여주기 위함
    (2026-09-04, admin 콘솔 실사용 피드백: 빈 textarea만 보여주면 뭘 고쳐야
    할지 기준이 없다). webtoon_image.py 하나가 정본이고 여기서 값을 복제하지
    않는다 — 프런트가 매번 이 엔드포인트로 최신값을 받아간다."""
    return response.ok({
        "style": webtoon_image.STYLE,
        "char_female": webtoon_image.FIXED_CHARACTERS["A (여성 기자, 설명자)"],
        "char_male": webtoon_image.FIXED_CHARACTERS["B (남성 청자)"],
    })


def handle_generate(body: dict, path_params: dict, query_params: dict) -> dict:
    body = body or {}
    scene = (body.get("scene") or "").strip()
    camera = (body.get("camera") or "").strip()
    if not scene:
        return response.err("scene is required", 400)
    if not camera:
        return response.err("camera is required", 400)
    if len(scene.encode("utf-8")) > _MAX_SCENE_BYTES:
        return response.err(f"scene too long (max {_MAX_SCENE_BYTES} bytes)", 400)

    style = (body.get("style") or webtoon_image.STYLE).strip()
    char_female = (body.get("char_female") or webtoon_image.FIXED_CHARACTERS["A (여성 기자, 설명자)"]).strip()
    char_male = (body.get("char_male") or webtoon_image.FIXED_CHARACTERS["B (남성 청자)"]).strip()
    for label, text in (("style", style), ("char_female", char_female), ("char_male", char_male)):
        if len(text.encode("utf-8")) > _MAX_TEXT_BYTES:
            return response.err(f"{label} too long (max {_MAX_TEXT_BYTES} bytes)", 400)

    scene_reinforce = bool(body.get("scene_reinforce", True))
    char_reinforce = bool(body.get("char_reinforce", True))

    characters = {
        "A (여성 기자, 설명자)": char_female,
        "B (남성 청자)": char_male,
    }
    prompt = webtoon_image.build_background_prompt(
        camera, scene, characters,
        style=style,
        include_scene_reinforcement=scene_reinforce,
        include_character_reinforcement=char_reinforce,
    )

    job_id = uuid.uuid4().hex[:16]
    now = _now_iso()
    _put_job(job_id, {
        "status": "pending",
        "scene": scene,
        "camera": camera,
        "style": style,
        "char_female": char_female,
        "char_male": char_male,
        "scene_reinforce": scene_reinforce,
        "char_reinforce": char_reinforce,
        "prompt_preview": prompt,
        "created_at": now,
        "updated_at": now,
    })

    threading.Thread(target=_run_generation, args=(job_id, prompt), daemon=True).start()

    audit.log("webtoon-lab-generate-start", {"job_id": job_id, "camera": camera})
    return response.ok({"job_id": job_id, "status": "pending"})


def _job_payload(job_id: str, item: dict) -> dict:
    return {
        "job_id": job_id,
        "status": item.get("status"),
        "image_url": item.get("image_url"),
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
    job_id = (path_params or {}).get("job_id", "")
    if not job_id:
        return response.err("job_id required", 400)
    item = _get_job(job_id)
    if not item:
        return response.err("job not found", 404)
    return response.ok(_job_payload(job_id, item))


def handle_history(body: dict, path_params: dict, query_params: dict) -> dict:
    """완료된 생성 이력(이 admin 계정 전체 공유) — 히스토리 갤러리용."""
    table = _job_table()
    items: list[dict] = []
    kwargs: dict = {
        "KeyConditionExpression": Key("pk").eq(_JOB_PK) & Key("sk").begins_with("job/"),
    }
    while True:
        resp = table.query(**kwargs)
        items.extend(resp.get("Items", []))
        last_key = resp.get("LastEvaluatedKey")
        if not last_key:
            break
        kwargs["ExclusiveStartKey"] = last_key

    done = [i for i in items if i.get("status") == "done"]
    done.sort(key=lambda i: i.get("created_at") or "", reverse=True)
    out = [
        {
            "job_id": i["sk"].split("/", 1)[1],
            "image_url": i.get("image_url"),
            "scene": i.get("scene"),
            "camera": i.get("camera"),
            "style": i.get("style"),
            "char_female": i.get("char_female"),
            "char_male": i.get("char_male"),
            "scene_reinforce": i.get("scene_reinforce"),
            "char_reinforce": i.get("char_reinforce"),
            "created_at": i.get("created_at"),
        }
        for i in done[:_HISTORY_LIMIT]
    ]
    return response.ok({"items": out})
