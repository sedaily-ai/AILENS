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
순간 컨테이너가 얼려질 수 있어 스레드가 안 끝날 위험이 있다 — GPU/Bedrock
체인을 도는 나머지 작업(컷 이미지 합성 `_run_composed_generation`, GPU 기동
`_run_gpu_start`)은 2026-09-14~16 사이 Lambda 비동기 self-invoke
(`InvocationType="Event"`, `run_async_job`/`_self_invoke_async` 참고)로
옮겼다. `handle_generate`(3단계 이미지 실험실, Bedrock 단독 경로)만 아직
로컬 스레드 방식으로 남아있다 — 별도 확인 후 마이그레이션 필요.

`/admin/webtoon-lab/*` 라우트는 API Gateway에 등록돼 있다(`handler.py`의
HANDLERS 등록 주석 참고) — 새 라우트를 추가할 땐 거기 등록 + API Gateway에
`aws apigatewayv2 create-route`로 같은 integration을 붙이는 것 둘 다
필요하다(`.clauderules`상 deploy 스크립트는 라우트를 안 만든다)."""
from __future__ import annotations

import json
import logging
import os
import threading
import uuid
from pathlib import Path

import boto3
from boto3.dynamodb.conditions import Key

from shared import audit, ddb_client, response, time_utils
import webtoon_image  # pipelines/common/ — 배포 시 zip에 복사됨(위 docstring 참고)
import bedrock_client  # pipelines/common/ — QA 비전 호출용(2026-09-14)
import gpu_ipadapter  # pipelines/common/ — GPU IP-Adapter 제어(2026-09-14)
import rekognition_client  # pipelines/common/ — 말풍선 배치용 얼굴 감지(2026-09-14)
import compose_text  # pipelines/webtoon/ — 대사·캡션·내레이션 합성(2026-09-14)
import prompts  # pipelines/webtoon/ — QA 판정 프롬프트(VALIDATE_SYSTEM) 정본, 2026-09-16 deploy-admin-api.sh에 flat 복사 추가
from json_extract import extract_json_object  # pipelines/common/

logger = logging.getLogger(__name__)

_JOB_PK = "WEBTOONLAB"
_MAX_SCENE_BYTES = 4000
_MAX_TEXT_BYTES = 20000  # style/character 필드 상한 — 오남용(과금 폭주) 방지
_HISTORY_LIMIT = 24

# ─────────────────────────────────────────────────────────────
# "실제 발행본과 같은 품질" 컷 생성 (2026-09-14)
# ─────────────────────────────────────────────────────────────
#
# 배경: 기존 handle_generate()는 Stable Image Core 배경만 그리고 끝 —
# 실제 프로덕션(pipelines/webtoon/pipeline.py, IMAGE_PROVIDER=
# "bedrock-style-transfer")은 GPU IP-Adapter로 캐릭터 얼굴을 고정하고,
# 비전 모델 QA+Rekognition 얼굴 감지를 거쳐, compose_text.py로 대사·
# 캡션·내레이션까지 그려 넣는다. 사용자 요청("실제와 같은 품질을
# 원합니다")에 맞춰 그 전체 경로를 admin 컷별 이미지 생성에도 그대로
# 태운다 — 새 엔드포인트(POST .../generate-composed)로 분리해서 기존
# handle_generate()(이미지 실험실 3단계, style/char_female/char_male
# 자유 입력 계약)는 그대로 둔다(다른 화면·다른 입력 계약이라 합치면
# 오히려 둘 다 망가진다).
#
# QA·재시도 로직(_validate_and_detect)은 pipelines/webtoon/pipeline.py의
# _generate_and_qa_cut()과 같은 판정 기준(prompts.VALIDATE_SYSTEM)을 쓴다 —
# 2026-09-16까지는 그 상수 하나만 여기로 복사해뒀었는데(prompts.py 전체를
# 배포에 복사하기 부담스러워서), 리팩토링 감사로 정본 하나만 남기기로 하고
# prompts.py를 flat 복사 대상에 추가했다(deploy-admin-api.sh 참고).
_QA_MODEL = "arn:aws:bedrock:us-east-1:887078546492:application-inference-profile/yirjajon82n7"  # lens-webtoon-script-sonnet-46
_s3_client = None


def _s3():
    global _s3_client
    if _s3_client is None:
        _s3_client = boto3.client("s3", region_name="us-east-1")
    return _s3_client


def _bucket() -> str:
    return os.environ.get("CMS_MEDIA_BUCKET", "")


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
        _update_job(job_id, {"status": "done", "image_url": image_url, "updated_at": time_utils.now_iso()})
        audit.log("webtoon-lab-generate-done", {"job_id": job_id})
    except Exception as e:  # noqa: BLE001 — 백그라운드 스레드 최상위, 여기서 안 잡으면 조용히 사라짐
        logger.exception(f"webtoon-lab generate failed: {job_id}")
        _update_job(job_id, {"status": "error", "error": str(e)[:500], "updated_at": time_utils.now_iso()})


def _self_invoke_async(payload: dict) -> None:
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


def run_async_job(payload: dict) -> None:
    """handler.py가 self-invoke된 별도 invocation에서 직접 호출."""
    kind = payload.get("kind")
    job_id = payload.get("job_id")
    if kind == "gpu_start":
        _run_gpu_start(job_id)
    elif kind == "stage_character":
        _run_stage_character(job_id, payload.get("character"), payload.get("prompt"))


def _validate_and_detect(image_bytes: bytes, scene: str, no_people_expected: bool) -> dict:
    """생성된 배경 이미지 1장을 비전 모델로 검사 — pipeline.py의
    _validate_and_detect()와 동일 계약(실패해도 항상 "문제 없음"으로
    처리해 가용성을 우선한다)."""
    try:
        no_people_note = "\n\n[인물 없음 지시]: 이 장면은 인물이 없어야 합니다." if no_people_expected else ""
        user_msg = f"[SCENE 지문]\n{scene}{no_people_note}"
        raw = bedrock_client.call_vision(prompts.VALIDATE_SYSTEM, user_msg, image_bytes, model=_QA_MODEL, max_tokens=500)
        return extract_json_object(raw)
    except Exception as e:  # noqa: BLE001 — QA 실패가 생성 자체를 막으면 안 됨
        logger.warning(f"webtoon-lab QA 실패(통과 처리): {e}")
        return {"sageuk": False, "no_people_violated": False}


# 프롬프트 챗랩 이미지 모델 선택(2026-09-15, 사용자 요청: "다양하게
# 테스트를 해보려는게 목적.. 사용가능한것들은.. 입력창쪽에.. 모델
# 선택가능하도록", 이어서 "nova canvas도 모델을 올려두긴해야합니다..
# openai api도 연결을 해서.. 이미지 생성 가능하도록"). Nova Canvas는
# 예전(다른 기능)에서 막혔던 전례가 있어 처음엔 뺐었는데, 실측으로 직접
# 확인해보니 모델 자체 접근 거부가 아니라 이 Lambda 역할에 IAM 권한이
# 없었던 것뿐이었다 — 비용태깅용 application inference profile을 새로
# 만들고 권한을 추가해서 해결(2026-09-15). style_guide도 같은 조사 중에
# 이 Lambda 역할엔 애초에 권한이 없었다는 걸 발견해 같이 추가했다.
#
# 2026-09-16까지는 "pipeline"(기본)만 QA+얼굴감지+1회 재생성까지 프로덕션과
# 동일하게 돌고, 나머지 넷은 "이 모델 자체의 원본 출력"만 보는 게 목적이라
# QA 없이 바로 반환했다. 사용자 요청("다른 모델들도 동일한 로직을 돌게...
# 프롬프트만으로 제어")으로 다섯 모델 전부 같은 QA+재시도를 거치도록
# 통일했다(_generate_composed_with_qa/_generate_once 참고) — 비교 대상은
# 이제 "안전장치 유무"가 아니라 순수하게 "같은 지문을 모델마다 어떻게
# 표현하느냐"가 됐다.
_IMAGE_MODELS = {"pipeline", "stable_image_core", "sd35_large", "sd_ultra", "style_guide", "nova_canvas", "openai_dalle3"}


def _generate_once(
    camera: str,
    scene: str,
    model: str,
    apply_character_lock: bool,
    apply_style_transfer: bool,
) -> bytes:
    """model 하나로 이미지 1장 생성 — 모델별 프롬프트 조립 방식만 다르고,
    QA·재시도는 호출부(_generate_composed_with_qa)가 모델 구분 없이 공통
    으로 담당한다(아래 함수 docstring 참고)."""
    if model == "stable_image_core":
        chars = webtoon_image.get_fixed_characters()
        prompt = webtoon_image.build_background_prompt(
            camera, scene, chars, style=webtoon_image.get_style(),
            include_scene_reinforcement=True, include_character_reinforcement=True,
        )
        return webtoon_image.generate_bedrock_image_bytes(prompt)

    if model == "sd35_large":
        chars = webtoon_image.get_fixed_characters()
        prompt = webtoon_image.build_background_prompt(
            camera, scene, chars, style=webtoon_image.get_style(),
            include_scene_reinforcement=True, include_character_reinforcement=True,
        )
        return webtoon_image.generate_bedrock_sd35_image_bytes(prompt)

    if model == "sd_ultra":
        chars = webtoon_image.get_fixed_characters()
        prompt = webtoon_image.build_background_prompt(
            camera, scene, chars, style=webtoon_image.get_style(),
            include_scene_reinforcement=True, include_character_reinforcement=True,
        )
        return webtoon_image.generate_bedrock_sd_ultra_image_bytes(prompt)

    if model == "style_guide":
        prompt = webtoon_image.build_style_guide_prompt(camera, scene)
        return webtoon_image.generate_bedrock_style_guide_image_bytes(prompt)

    if model == "nova_canvas":
        # 참고 이미지 컨디셔닝이 없는 순수 text-to-image라 style_guide와
        # 같은(스타일 힌트가 포함된) 프롬프트를 그대로 재사용한다 —
        # 모델별로 다른 프롬프트를 쓰면 "같은 지문, 다른 모델" 비교가 아니게 된다.
        prompt = webtoon_image.build_style_guide_prompt(camera, scene)
        return webtoon_image.generate_nova_canvas_image_bytes(prompt)

    if model == "openai_dalle3":
        import openai_image  # admin/backend/ 루트 — lazy(이 모델을 안 쓰면 시크릿 fetch 비용 없음)

        prompt = webtoon_image.build_style_guide_prompt(camera, scene)
        return openai_image.generate_image_bytes(prompt)

    # "pipeline"(기본)
    scene_input = webtoon_image.build_style_transfer_scene_input(camera, scene)
    return webtoon_image.generate_bedrock_composed_image_bytes(
        scene_input, apply_character_lock=apply_character_lock, apply_style_transfer=apply_style_transfer
    )


def _generate_composed_with_qa(
    camera: str,
    scene: str,
    has_dialogue: bool,
    model: str = "pipeline",
    *,
    apply_character_lock: bool = True,
    apply_style_transfer: bool = True,
) -> tuple[bytes, list | None]:
    """이미지 1장 생성(_generate_once) + QA 검증 + (필요시) 1회 재생성 —
    pipeline.py::_generate_and_qa_cut()과 같은 판정 기준을 admin 컷별
    생성에도 그대로 적용한다.

    2026-09-16(같은 날 후속) — "다른 모델들도 동일한 로직을 돌면 좋겠다...
    프롬프트만으로 제어를 하려고 한다"는 요청으로, 예전엔 model=="pipeline"
    일 때만 거치던 이 QA+재시도를 다섯 모델 전부에 공통 적용하도록 바꿨다.
    모델별 프롬프트 조립(build_background_prompt/build_style_guide_prompt
    등, _generate_once 참고)은 그대로 다르게 둔다 — 사용자가 다르게
    하고 싶은 건 "결과를 검증·재시도하느냐"라는 공통 안전장치 쪽이지,
    모델마다 이미 다르게 튜닝된 프롬프트 조립 방식 자체가 아니기 때문이다.

    apply_character_lock/apply_style_transfer — 2026-09-16, "이미지(인물)
    고정·화풍 고정을 체크로 껐다 켰다 하고 싶다"는 요청으로 추가. model이
    "pipeline"일 때만 의미가 있다(다른 모델은 애초에 이 두 메커니즘 자체가
    없다) — _generate_once를 거쳐 webtoon_image.generate_bedrock_composed_image_bytes()
    로 그대로 전달된다."""
    image_bytes = _generate_once(camera, scene, model, apply_character_lock, apply_style_transfer)

    no_people_expected = any(p in scene for p in ("인물 없음", "인물 없이", "인물 없는", "인물이 없"))
    verdict = _validate_and_detect(image_bytes, scene, no_people_expected)
    faces = rekognition_client.detect_main_faces(image_bytes) or None
    extra_people = (
        has_dialogue and not no_people_expected
        and faces is not None and len(faces) > webtoon_image.MAX_EXPECTED_FACES
    )
    if verdict.get("sageuk") or verdict.get("no_people_violated") or extra_people:
        logger.info(f"webtoon-lab QA 실패({model}) — 재생성 1회 시도")
        image_bytes = _generate_once(camera, scene, model, apply_character_lock, apply_style_transfer)
        faces = rekognition_client.detect_main_faces(image_bytes) or None
    return image_bytes, faces


def _run_composed_generation(job_id: str, cut: dict, push=None, model: str = "pipeline") -> None:
    """전체 경로 — 배경 생성(GPU/Style Transfer)+QA+얼굴 감지+텍스트 합성.
    프로덕션(pipeline.py::run_article)과 같은 순서. 텍스트 합성이 실패해도
    배경 이미지는 남기고 발행을 막지 않는다(pipeline.py와 동일 원칙).

    push — 2026-09-14, 웹소켓 채팅(routes/chat_ws.py) 전용. 주어지면 완료/
    실패 시 DDB 기록과 별개로 이 콜백으로 즉시 결과를 밀어넣는다(폴링
    없이 실시간 통지).

    model — 2026-09-15, 프롬프트 챗랩의 이미지 모델 선택 드롭다운 전용.
    _IMAGE_MODELS에 없는 값이 오면 "pipeline"으로 취급한다(오타·구버전
    프론트가 보낸 값이어도 조용히 기본 동작).

    cut의 apply_character_lock/apply_style_transfer — 2026-09-16, "인물
    고정·화풍 고정 체크박스" 요청. 키가 아예 없으면(구버전 프론트) True로
    — 지금까지의 기본 동작 그대로."""
    if model not in _IMAGE_MODELS:
        model = "pipeline"
    try:
        camera = (cut.get("camera") or "").strip()
        scene = (cut.get("scene") or "").strip()
        has_dialogue = bool(cut.get("dialogue")) or cut.get("cut") == 1
        apply_character_lock = cut.get("apply_character_lock", True)
        apply_style_transfer = cut.get("apply_style_transfer", True)
        image_bytes, faces = _generate_composed_with_qa(
            camera, scene, has_dialogue, model=model,
            apply_character_lock=apply_character_lock, apply_style_transfer=apply_style_transfer,
        )

        tmp_path = Path(f"/tmp/webtoon-lab-{job_id}.png")
        tmp_path.write_bytes(image_bytes)
        try:
            compose_text.compose(tmp_path, cut, faces)
        except Exception as e:  # noqa: BLE001 — 배경은 유지, 합성 실패만 로그
            logger.warning(f"webtoon-lab 컷{cut.get('cut')} 텍스트 합성 실패(배경만 유지): {e}")
        final_bytes = tmp_path.read_bytes()
        tmp_path.unlink(missing_ok=True)

        bucket = _bucket()
        if not bucket:
            raise RuntimeError("CMS_MEDIA_BUCKET not configured")
        key = f"media/webtoon-lab/{job_id}.png"
        _s3().put_object(Bucket=bucket, Key=key, Body=final_bytes, ContentType="image/png")
        image_url = f"https://{bucket}.s3.us-east-1.amazonaws.com/{key}"
        _update_job(job_id, {"status": "done", "image_url": image_url, "updated_at": time_utils.now_iso()})
        audit.log("webtoon-lab-generate-composed-done", {"job_id": job_id, "cut": cut.get("cut")})
        if push:
            push({"type": "cut_image", "cut": cut.get("cut"), "image_url": image_url, "model": model})
    except Exception as e:  # noqa: BLE001 — 비동기 invocation 최상위, 안 잡으면 job이 영원히 pending
        logger.exception(f"webtoon-lab composed generate failed: {job_id}")
        _update_job(job_id, {"status": "error", "error": str(e)[:500], "updated_at": time_utils.now_iso()})
        if push:
            push({"type": "cut_image_error", "cut": cut.get("cut"), "error": str(e)[:500]})


# ─────────────────────────────────────────────────────────────
# GPU 켜기/끄기 (2026-09-14) — "테스트하는 동안은 계속 켜두고 작업자가
# 다 쓰면 수동으로 끄는" 방식(사용자 요청). gpu_ipadapter.py의 활성
# 사용자 수 카운트(DynamoDB 원자적 ADD)를 그대로 재사용 — 프로덕션
# 파이프라인이 같은 GPU를 동시에 쓰는 중이어도 admin 세션이 자기 몫만
# 안전하게 켜고 끌 수 있다(gpu_ipadapter.py 모듈 docstring 참고).
# ─────────────────────────────────────────────────────────────

def handle_gpu_status(body: dict, path_params: dict, query_params: dict) -> dict:
    ec2 = boto3.client("ec2", region_name=gpu_ipadapter.GPU_REGION)
    state = ec2.describe_instances(
        InstanceIds=[gpu_ipadapter.GPU_INSTANCE_ID]
    )["Reservations"][0]["Instances"][0]["State"]["Name"]
    return response.ok({"state": state})


def _run_gpu_start(job_id: str, push=None) -> None:
    try:
        gpu_ipadapter.ensure_gpu_running()
        _update_job(job_id, {"status": "done", "updated_at": time_utils.now_iso()})
        if push:
            push({"type": "gpu_status", "state": "running"})
    except Exception as e:  # noqa: BLE001 — 비동기 invocation 최상위
        logger.exception(f"webtoon-lab gpu start failed: {job_id}")
        _update_job(job_id, {"status": "error", "error": str(e)[:500], "updated_at": time_utils.now_iso()})
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
    _put_job(job_id, {"status": "pending", "created_at": now, "updated_at": now})
    _self_invoke_async({"kind": "gpu_start", "job_id": job_id})
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


def handle_defaults(body: dict, path_params: dict, query_params: dict) -> dict:
    """현재 발행된(admin DDB `webtoon-image/published`) STYLE/FIXED_CHARACTERS
    조회 — 패널의 텍스트 필드가 빈 칸이 아니라 지금 실제로 쓰이는 프롬프트를
    값으로 항상 채워서 보여주기 위함(2026-09-04 최초 도입, 2026-09-16 "직접
    입력" 체크박스를 없애고 필드를 상시 노출하도록 변경). webtoon_image.
    get_style()/get_fixed_characters()가 매번 DDB에서 fresh하게 읽는다 —
    여기서 값을 복제하지 않는다."""
    chars = webtoon_image.get_fixed_characters()
    return response.ok({
        "style": webtoon_image.get_style(),
        "char_female": chars["A (여성 기자, 설명자)"],
        "char_male": chars["B (남성 청자)"],
    })


# ─────────────────────────────────────────────────────────────
# 인물·화풍 참조 이미지(refs/*.png) — 2026-09-16 신설. 코드/GPU 인스턴스에만
# 있던 이미지 자산 두 종류(화풍 레퍼런스, 인물 A/B 참조 사진)를 admin에서
# 직접 업로드/교체할 수 있게 한다("코드로 설정하는 건 전부 화면에서
# 커스터마이징 가능해야" 요청). 저장은 gpu_ipadapter.GPU_BUCKET을 그대로
# 재사용(이미 admin Lambda 역할에 Get/Put/Delete 권한이 있어 새 IAM 불필요,
# AdminWebtoonGpuBucket 참고). style_reference.png는 webtoon_image.py가
# 60초 캐시로 읽고, 두 character_ref는 gpu_ipadapter.ensure_gpu_running()이
# 배치 시작마다 인스턴스 로컬 디스크로 동기화한다 — 실제 생성 코드는 항상
# 이 "정본 키" 3개(refs/style_reference.png, refs/character_ref_A.png,
# refs/character_ref_B.png)만 본다.
#
# 2026-09-16(같은 날 후속) — "여러 샘플 중에서 골라 비교하고 싶다" 요청으로
# 갤러리를 추가했다. 업로드는 이제 정본 키를 바로 덮어쓰지 않고 asset별
# refs/gallery/{asset}/{uuid}.png 에 쌓인다(과거 업로드가 안 사라짐) —
# handle_image_assets_gallery_select가 고른 갤러리 파일을 정본 키로
# copy_object 해야 실제 생성에 반영된다(업로드 직후에는 프론트가 업로드
# 응답의 key로 바로 select까지 호출해 "올리면 즉시 반영"이던 기존 동작을
# 그대로 유지한다). "지금 활성인 샘플"은 별도 포인터 테이블 없이 ETag로
# 판별한다 — S3 PutObject/CopyObject의 ETag는 (멀티파트가 아닌 한) 내용의
# MD5라서, 정본 키의 ETag와 같은 갤러리 항목이 곧 "그 내용이 복사돼 지금
# 쓰이는 파일"이다.
# ─────────────────────────────────────────────────────────────
_IMAGE_ASSET_BUCKET = gpu_ipadapter.GPU_BUCKET
_IMAGE_ASSET_REGION = gpu_ipadapter.GPU_REGION
_IMAGE_ASSET_KEYS = {
    "style": "refs/style_reference.png",
    "char_female": "refs/character_ref_A.png",
    "char_male": "refs/character_ref_B.png",
}
_IMAGE_ASSET_GALLERY_PREFIXES = {
    "style": "refs/gallery/style/",
    "char_female": "refs/gallery/char_female/",
    "char_male": "refs/gallery/char_male/",
}
_IMAGE_ASSET_MAX_BYTES = 8 * 1024 * 1024
_IMAGE_ASSET_URL_EXPIRES = 300
_IMAGE_ASSET_GALLERY_MAX_ITEMS = 24  # 오래된 샘플은 목록에서만 안 보임(S3에서 안 지움 — 실수로 고른 걸 되돌릴 수 있게)

_image_asset_s3_client = None


def _image_asset_s3():
    global _image_asset_s3_client
    if _image_asset_s3_client is None:
        _image_asset_s3_client = boto3.client("s3", region_name=_IMAGE_ASSET_REGION)
    return _image_asset_s3_client


def handle_image_assets_get(body: dict, path_params: dict, query_params: dict) -> dict:
    """화풍/인물 참조 이미지 미리보기 URL — 실제 생성이 읽는 바로 그 S3
    객체를 가리키는 presigned GET(5분 유효)이다. 키가 없으면(업로드 전)
    null을 돌려줘 프론트가 "아직 없음"으로 처리하게 한다(세 키 다
    2026-09-16에 그때까지 쓰이던 값으로 시딩해둬서 보통은 항상 있다)."""
    s3 = _image_asset_s3()
    urls: dict[str, str | None] = {}
    for asset, key in _IMAGE_ASSET_KEYS.items():
        try:
            s3.head_object(Bucket=_IMAGE_ASSET_BUCKET, Key=key)
            urls[f"{asset}_url"] = s3.generate_presigned_url(
                "get_object",
                Params={"Bucket": _IMAGE_ASSET_BUCKET, "Key": key},
                ExpiresIn=_IMAGE_ASSET_URL_EXPIRES,
            )
        except Exception:  # noqa: BLE001 — 아직 업로드된 적 없는 키(정상 상태)
            urls[f"{asset}_url"] = None
    return response.ok(urls)


def handle_image_assets_presign(body: dict, path_params: dict, query_params: dict) -> dict:
    """참조 이미지 업로드용 presigned PUT 발급 — routes/media.py의 프리사인
    업로드와 같은 이유(admin Lambda를 안 거치고 브라우저가 S3에 직접 올려야
    페이로드 한계를 안 걸림)로 같은 패턴을 쓴다. media.py처럼 매번 새
    키(uuid)를 발급한다 — 2026-09-16부터 정본 키를 바로 안 덮어쓰고 갤러리에
    쌓은 뒤 handle_image_assets_select로 골라야 반영되는 구조로 바뀌었다(위
    섹션 주석 참고)."""
    body = body or {}
    asset = (body.get("asset") or "").strip()
    content_type = (body.get("content_type") or "").strip()
    size = body.get("size") or 0

    if asset not in _IMAGE_ASSET_KEYS:
        return response.err(f"unknown asset: {asset} (style|char_female|char_male)", 400)
    if content_type != "image/png":
        return response.err(f"unsupported content_type: {content_type} (image/png only)", 400)
    try:
        size = int(size)
    except (TypeError, ValueError):
        return response.err("size must be a number", 400)
    if size <= 0 or size > _IMAGE_ASSET_MAX_BYTES:
        return response.err(f"size must be 1..{_IMAGE_ASSET_MAX_BYTES} bytes", 400)

    key = f"{_IMAGE_ASSET_GALLERY_PREFIXES[asset]}{uuid.uuid4().hex}.png"
    upload_url = _image_asset_s3().generate_presigned_url(
        "put_object",
        Params={"Bucket": _IMAGE_ASSET_BUCKET, "Key": key, "ContentType": content_type},
        ExpiresIn=_IMAGE_ASSET_URL_EXPIRES,
    )
    audit.log("webtoon-lab-image-asset-presign", {"asset": asset, "key": key})
    return response.ok({"upload_url": upload_url, "key": key, "expires_in": _IMAGE_ASSET_URL_EXPIRES})


def handle_image_assets_gallery(body: dict, path_params: dict, query_params: dict) -> dict:
    """asset 하나의 업로드 이력을 최신순으로 반환 — 갤러리 그리드용. 정본
    키의 ETag와 같은 항목에 active:true를 표시한다(위 섹션 주석의 ETag
    판별 방식 참고). 정본 키가 아직 없으면(최초 상태) 전부 active:false."""
    query_params = query_params or {}
    asset = (query_params.get("asset") or "").strip()
    if asset not in _IMAGE_ASSET_KEYS:
        return response.err(f"unknown asset: {asset} (style|char_female|char_male)", 400)

    s3 = _image_asset_s3()
    try:
        active_etag = s3.head_object(Bucket=_IMAGE_ASSET_BUCKET, Key=_IMAGE_ASSET_KEYS[asset])["ETag"]
    except Exception:  # noqa: BLE001 — 정본 키가 아직 없음(정상 상태)
        active_etag = None

    resp = s3.list_objects_v2(
        Bucket=_IMAGE_ASSET_BUCKET,
        Prefix=_IMAGE_ASSET_GALLERY_PREFIXES[asset],
        MaxKeys=_IMAGE_ASSET_GALLERY_MAX_ITEMS,
    )
    items = sorted(resp.get("Contents", []), key=lambda o: o["LastModified"], reverse=True)
    return response.ok({
        "items": [
            {
                "key": obj["Key"],
                "url": s3.generate_presigned_url(
                    "get_object",
                    Params={"Bucket": _IMAGE_ASSET_BUCKET, "Key": obj["Key"]},
                    ExpiresIn=_IMAGE_ASSET_URL_EXPIRES,
                ),
                "uploaded_at": obj["LastModified"].isoformat(),
                "active": active_etag is not None and obj["ETag"] == active_etag,
            }
            for obj in items
        ],
    })


def handle_image_assets_select(body: dict, path_params: dict, query_params: dict) -> dict:
    """갤러리에서 고른 샘플을 정본 키로 복사 — 이 순간부터 다음 생성이 이
    사진/이미지를 쓴다(style은 다음 컷 생성부터 60초 캐시 후, character는
    GPU가 꺼져있었다면 다음 배치 시작 때, 이미 켜져 있었다면 아래에서
    바로 한 번 더 동기화해 즉시 — 2026-09-18 수정, 위 섹션 주석 참고).
    key가 그 asset의 갤러리 프리픽스 밖을 가리키면 거부한다(다른 asset
    파일을 잘못 골라 정본을 덮어쓰는 사고 방지)."""
    body = body or {}
    asset = (body.get("asset") or "").strip()
    key = (body.get("key") or "").strip()
    if asset not in _IMAGE_ASSET_KEYS:
        return response.err(f"unknown asset: {asset} (style|char_female|char_male)", 400)
    if not key.startswith(_IMAGE_ASSET_GALLERY_PREFIXES[asset]):
        return response.err("key does not belong to this asset's gallery", 400)

    s3 = _image_asset_s3()
    try:
        s3.copy_object(
            Bucket=_IMAGE_ASSET_BUCKET,
            CopySource={"Bucket": _IMAGE_ASSET_BUCKET, "Key": key},
            Key=_IMAGE_ASSET_KEYS[asset],
            ContentType="image/png",
        )
    except Exception as e:  # noqa: BLE001 — 존재하지 않는 키 등 사용자 입력 오류를 400으로
        return response.err(f"select failed: {e}", 400)
    audit.log("webtoon-lab-image-asset-select", {"asset": asset, "key": key})

    # 2026-09-18 버그 수정 — character 참조는 GPU 인스턴스 로컬 디스크
    # (/home/ec2-user/refs/)에서 읽히고, 그 동기화는 원래 GPU가 새로
    # 켜질 때(ensure_gpu_running)만 일어났다. "테스트 세션 동안 GPU를
    # 계속 켜둔다"는 정상 사용 패턴에서는 select가 S3 정본 키를 바꿔도
    # 이미 켜져 있는 GPU가 재기동 전까지 예전 사진을 계속 쓰는 채로
    # 남아있었다(양진희 피드백 — "샘플을 추가했는데도 이미지 반영이
    # 되지 않았습니다"). GPU가 이미 running이면 여기서 바로 한 번 더
    # 동기화해 재기동 없이도 즉시 반영되게 한다.
    if asset in ("char_female", "char_male"):
        try:
            ec2 = boto3.client("ec2", region_name=gpu_ipadapter.GPU_REGION)
            state = ec2.describe_instances(
                InstanceIds=[gpu_ipadapter.GPU_INSTANCE_ID]
            )["Reservations"][0]["Instances"][0]["State"]["Name"]
            if state == "running":
                gpu_ipadapter._sync_character_refs()
        except Exception as e:  # noqa: BLE001 — 즉시 동기화 실패해도 select 자체는 성공(다음 GPU 재기동 때 다시 시도됨)
            logger.warning(f"character ref 즉시 동기화 실패(무시): {e}")

    return response.ok({"selected": True})


# ─────────────────────────────────────────────────────────────
# 단계별 생성(Stage-by-stage) — 2026-09-18 신설, 사용자 요청("단계별로
# 컨트롤 하고 싶은 니즈가 있어서"). 기존 handle_generate(전체 파이프라인
# 한 번에)와 별개로, "pipeline" 모델의 각 단계(장면번역/인물/배경/합성/
# 화풍)를 독립적으로 호출·확인·재시도할 수 있게 한다. 오늘 이 세션에서
# 직접 파이썬으로 각 단계를 나눠 호출하며 디버깅한 것과 같은 방식을
# admin 화면에서 그대로 할 수 있게 만든 것 — 새 로직은 없고 전부
# webtoon_image.py/gpu_ipadapter.py의 기존 함수를 그대로 얇게 감싼다.
# 각 단계는 이전 단계 결과(S3 key)를 입력으로 받고, 자기 결과도 S3에
# 올려 키를 반환한다 — 프론트가 그 키를 다음 단계 호출에 그대로 넘긴다.
# ─────────────────────────────────────────────────────────────

def _stage_upload(job_id: str, stage: str, image_bytes: bytes) -> tuple[str, str]:
    """(image_url, s3_key) — 기존 handle_generate/_run_composed_generation과
    같은 CMS 미디어 버킷·키 규칙(media/webtoon-lab/...)을 쓴다."""
    bucket = _bucket()
    if not bucket:
        raise RuntimeError("CMS_MEDIA_BUCKET not configured")
    key = f"media/webtoon-lab/stage/{job_id}-{stage}.png"
    _s3().put_object(Bucket=bucket, Key=key, Body=image_bytes, ContentType="image/png")
    return f"https://{bucket}.s3.us-east-1.amazonaws.com/{key}", key


def _stage_download(s3_key: str) -> bytes:
    bucket = _bucket()
    if not bucket:
        raise RuntimeError("CMS_MEDIA_BUCKET not configured")
    return _s3().get_object(Bucket=bucket, Key=s3_key)["Body"].read()


def _record_stage(
    job_id: str, stage: str, *, cut: int | None, status: str,
    prompt: str | None = None, character: str | None = None,
    params: dict | None = None, image_url: str | None = None, s3_key: str | None = None,
    error: str | None = None,
) -> None:
    """단계별 생성 하나를 기존 job 테이블(_job_table)에 기록 — 2026-09-18,
    사용자 요청("설정한 값들도 투명하게 기록이 히스토리쪽에 남는게
    중요한것같고요"). 새 테이블을 만들지 않고 기존 job 레코드에 stage/
    cut/prompt/params 필드를 얹는다 — handle_history가 이미 이 테이블을
    "지우지 않는 이력"으로 쓰고 있는 것과 같은 원칙(never delete). 조회는
    handle_stage_history가 stage 필드 유무로 "새 단계별 생성 기록"만
    걸러낸다(기존 handle_generate/handle_gpu_start 레코드는 stage가 없어
    안 섞임)."""
    now = time_utils.now_iso()
    row = {
        "status": status, "stage": stage, "cut": cut,
        "prompt": prompt, "character": character, "params": params,
        "image_url": image_url, "s3_key": s3_key, "error": error,
        "created_at": now, "updated_at": now,
    }
    _put_job(job_id, {k: v for k, v in row.items() if v is not None})


def handle_stage_translate(body: dict, path_params: dict, query_params: dict) -> dict:
    """1단계 — 장면번역(Claude): 한국어 [SCENE]/[CAMERA] → (subjects, brief).
    빠른 텍스트 호출 1번이라 동기로 바로 응답한다."""
    body = body or {}
    scene = (body.get("scene") or "").strip()
    camera = (body.get("camera") or "").strip()
    cut = body.get("cut")
    if not scene or not camera:
        return response.err("scene and camera are required", 400)
    try:
        subjects, brief = webtoon_image.translate_scene_to_photo_brief(camera, scene)
    except Exception as e:  # noqa: BLE001 — 사용자 입력에서 비롯된 호출 실패를 400으로
        return response.err(f"translate failed: {e}", 400)
    # 다음 단계(인물/배경) 입력창에 바로 채울 수 있게, 실제로 그 단계가
    # 쓰는 완성 프롬프트 형태까지 같이 만들어 돌려준다 — BOTH일 때는
    # generate_dual_character_init_bytes()와 동일한 조립(고정 템플릿 +
    # ". " + 인물 텍스트), A/B 단독일 때는 generate_bedrock_composed_image_bytes()
    # 분기와 동일한 조립(brief + " " + 인물 텍스트).
    if subjects == "BOTH":
        char_prompt_a = f"{webtoon_image._DUAL_SOLO_PROMPT_TEMPLATE}. {webtoon_image._character_text_for('A')}".strip()
        char_prompt_b = f"{webtoon_image._DUAL_SOLO_PROMPT_TEMPLATE}. {webtoon_image._character_text_for('B')}".strip()
    else:
        char_prompt_a = f"{brief} {webtoon_image._character_text_for('A')}".strip()
        char_prompt_b = f"{brief} {webtoon_image._character_text_for('B')}".strip()
    background_prompt = webtoon_image.build_empty_scene_prompt(brief)
    style_prompt = webtoon_image._style_hint_from_db()

    job_id = uuid.uuid4().hex[:16]
    _record_stage(
        job_id, "translate", cut=cut, status="done",
        prompt=f"[SCENE]\n{scene}\n\n[CAMERA]\n{camera}",
        params={
            "subjects": subjects, "brief": brief,
            "character_prompt_a": char_prompt_a, "character_prompt_b": char_prompt_b,
            "background_prompt": background_prompt, "style_prompt": style_prompt,
        },
    )
    return response.ok({
        "job_id": job_id,
        "subjects": subjects,
        "brief": brief,
        "character_prompt_a": char_prompt_a,
        "character_prompt_b": char_prompt_b,
        "background_prompt": background_prompt,
        "style_prompt": style_prompt,
    })


def _run_stage_character(job_id: str, character: str, prompt: str, push=None) -> None:
    try:
        image_bytes = gpu_ipadapter.generate_ipadapter_photo_bytes(prompt, character)
        image_url, s3_key = _stage_upload(job_id, f"char-{character}", image_bytes)
        _update_job(job_id, {"status": "done", "image_url": image_url, "s3_key": s3_key, "updated_at": time_utils.now_iso()})
        if push:
            push({"type": "stage_done", "stage": "character", "character": character, "job_id": job_id, "image_url": image_url, "s3_key": s3_key})
    except Exception as e:  # noqa: BLE001 — 비동기 invocation 최상위
        logger.exception(f"webtoon-lab stage character({character}) failed: {job_id}")
        _update_job(job_id, {"status": "error", "error": str(e)[:500], "updated_at": time_utils.now_iso()})
        if push:
            push({"type": "stage_error", "stage": "character", "character": character, "job_id": job_id, "error": str(e)[:500]})


def handle_stage_character(body: dict, path_params: dict, query_params: dict) -> dict:
    """2단계 — 인물 A/B 각각 GPU IP-Adapter로 생성. SSM 왕복(최대 180초)이라
    handle_gpu_start와 같은 self-invoke 비동기 패턴을 쓴다 — 결과는 기존
    GET /admin/webtoon-lab/{job_id}로 폴링한다. GPU가 꺼져있으면 실패하니
    (기동은 별도로 /gpu/start를 먼저 눌러야 함) 여기서 자동 기동은 안
    한다 — 컷 여러 개를 순차로 만들 때 매번 상태 확인하는 오버헤드를
    피하려던 기존 설계(ensure_gpu_running 호출부 주석) 원칙을 그대로 따름."""
    body = body or {}
    character = (body.get("character") or "").strip()
    prompt = (body.get("prompt") or "").strip()
    cut = body.get("cut")
    if character not in ("A", "B"):
        return response.err("character must be A or B", 400)
    if not prompt:
        return response.err("prompt is required", 400)
    if len(prompt.encode("utf-8")) > _MAX_TEXT_BYTES:
        return response.err(f"prompt too long (max {_MAX_TEXT_BYTES} bytes)", 400)

    job_id = uuid.uuid4().hex[:16]
    _record_stage(job_id, "character", cut=cut, status="pending", prompt=prompt, character=character)
    _self_invoke_async({"kind": "stage_character", "job_id": job_id, "character": character, "prompt": prompt})
    audit.log("webtoon-lab-stage-character", {"job_id": job_id, "character": character})
    return response.ok({"job_id": job_id, "status": "pending"})


def handle_stage_background(body: dict, path_params: dict, query_params: dict) -> dict:
    """3단계 — 배경만(인물 없음) 생성. Bedrock 호출 1번이라 동기."""
    body = body or {}
    prompt = (body.get("prompt") or "").strip()
    cut = body.get("cut")
    if not prompt:
        return response.err("prompt is required", 400)
    if len(prompt.encode("utf-8")) > _MAX_TEXT_BYTES:
        return response.err(f"prompt too long (max {_MAX_TEXT_BYTES} bytes)", 400)
    job_id = uuid.uuid4().hex[:16]
    try:
        image_bytes = webtoon_image.generate_bedrock_photoreal_image_bytes(prompt)
    except Exception as e:  # noqa: BLE001
        _record_stage(job_id, "background", cut=cut, status="error", prompt=prompt, error=str(e)[:500])
        return response.err(f"background generation failed: {e}", 400)
    image_url, s3_key = _stage_upload(job_id, "background", image_bytes)
    _record_stage(job_id, "background", cut=cut, status="done", prompt=prompt, image_url=image_url, s3_key=s3_key)
    audit.log("webtoon-lab-stage-background", {"job_id": job_id})
    return response.ok({"job_id": job_id, "image_url": image_url, "s3_key": s3_key})


def handle_stage_composite(body: dict, path_params: dict, query_params: dict) -> dict:
    """4단계 — 배경 + 인물 A + 인물 B 합성(Remove Background ×2 + PIL 배치).
    Bedrock 호출 2번 + 로컬 합성이라 동기."""
    body = body or {}
    background_key = (body.get("background_key") or "").strip()
    char_a_key = (body.get("char_a_key") or "").strip()
    char_b_key = (body.get("char_b_key") or "").strip()
    cut = body.get("cut")
    if not (background_key and char_a_key and char_b_key):
        return response.err("background_key, char_a_key, char_b_key are required", 400)
    job_id = uuid.uuid4().hex[:16]
    params = {"background_key": background_key, "char_a_key": char_a_key, "char_b_key": char_b_key}
    try:
        bg_bytes = _stage_download(background_key)
        a_bytes = _stage_download(char_a_key)
        b_bytes = _stage_download(char_b_key)
        a_cut = webtoon_image.remove_background_bytes(a_bytes)
        b_cut = webtoon_image.remove_background_bytes(b_bytes)
        composite_bytes = webtoon_image._composite_two_characters(bg_bytes, a_cut, b_cut)
    except Exception as e:  # noqa: BLE001
        _record_stage(job_id, "composite", cut=cut, status="error", params=params, error=str(e)[:500])
        return response.err(f"composite failed: {e}", 400)
    image_url, s3_key = _stage_upload(job_id, "composite", composite_bytes)
    _record_stage(job_id, "composite", cut=cut, status="done", params=params, image_url=image_url, s3_key=s3_key)
    audit.log("webtoon-lab-stage-composite", {"job_id": job_id})
    return response.ok({"job_id": job_id, "image_url": image_url, "s3_key": s3_key})


def handle_stage_style(body: dict, path_params: dict, query_params: dict) -> dict:
    """5단계 — 화풍 적용(Stable Style Transfer). Bedrock 호출 1번이라 동기.
    prompt를 안 주면 admin이 발행한 STYLE 텍스트(_style_hint_from_db)를
    기본값으로 쓴다 — generate_bedrock_style_transfer_bytes와 같은 기본값."""
    body = body or {}
    init_key = (body.get("init_key") or "").strip()
    cut = body.get("cut")
    if not init_key:
        return response.err("init_key is required", 400)
    prompt = (body.get("prompt") or "").strip() or None
    if prompt and len(prompt.encode("utf-8")) > _MAX_TEXT_BYTES:
        return response.err(f"prompt too long (max {_MAX_TEXT_BYTES} bytes)", 400)
    job_id = uuid.uuid4().hex[:16]
    try:
        init_bytes = _stage_download(init_key)
        kwargs = {}
        if prompt:
            # generate_bedrock_style_transfer_bytes는 prompt를 파라미터로
            # 안 받고 내부에서 항상 _style_hint_from_db()를 쓴다 — 단계별
            # 실험에서는 그 텍스트를 직접 바꿔보고 싶을 수 있어 body 하나
            # 만들어 넘기는 저수준 경로를 쓴다(webtoon_image.py의
            # _invoke_and_decode_image·STYLE_TRANSFER_MODEL_ID 재사용).
            import base64 as _b64
            import json as _json
            style_body = _json.dumps({
                "init_image": _b64.b64encode(init_bytes).decode(),
                "style_image": webtoon_image._get_style_reference_b64(),
                "prompt": prompt,
                "negative_prompt": webtoon_image._STYLE_GUIDE_NEGATIVE_PROMPT,
                "composition_fidelity": 0.9,
                "style_strength": 1.0,
                "change_strength": 0.9,
                "output_format": "png",
            })
            final_bytes = webtoon_image._invoke_and_decode_image(
                webtoon_image._get_bedrock_image_client(), webtoon_image.STYLE_TRANSFER_MODEL_ID, style_body
            )
        else:
            final_bytes = webtoon_image.generate_bedrock_style_transfer_bytes(init_bytes, **kwargs)
    except Exception as e:  # noqa: BLE001
        _record_stage(job_id, "style", cut=cut, status="error", prompt=prompt, params={"init_key": init_key}, error=str(e)[:500])
        return response.err(f"style transfer failed: {e}", 400)
    image_url, s3_key = _stage_upload(job_id, "style", final_bytes)
    _record_stage(job_id, "style", cut=cut, status="done", prompt=prompt, params={"init_key": init_key}, image_url=image_url, s3_key=s3_key)
    audit.log("webtoon-lab-stage-style", {"job_id": job_id})
    return response.ok({"job_id": job_id, "image_url": image_url, "s3_key": s3_key})


def handle_stage_history(body: dict, path_params: dict, query_params: dict) -> dict:
    """단계별 생성 이력 — 2026-09-18, 사용자 요청("생성된 이미지들을 볼 수
    있어야하고, 버전별로요"). _record_stage()가 써둔 stage 필드가 있는
    job 레코드만 걸러서(기존 handle_generate/handle_gpu_start 레코드와
    안 섞이게) 최신순으로 반환한다. query_params.cut이 있으면 그 컷만.
    handle_history(전체 파이프라인 이력)와 같은 전체 스캔 방식 — 이
    테이블 규모에서는 페이지네이션 없이도 무시할 수준(그쪽 주석 참고)."""
    query_params = query_params or {}
    cut_filter = query_params.get("cut")
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

    stage_items = [i for i in items if i.get("stage")]
    if cut_filter is not None and cut_filter != "":
        try:
            cut_filter = int(cut_filter)
        except ValueError:
            return response.err("cut must be an integer", 400)
        stage_items = [i for i in stage_items if i.get("cut") == cut_filter]
    stage_items.sort(key=lambda i: i.get("created_at", ""), reverse=True)

    return response.ok({
        "items": [
            {
                "job_id": i["sk"].split("/", 1)[1],
                "stage": i.get("stage"),
                "cut": i.get("cut"),
                "status": i.get("status"),
                "character": i.get("character"),
                "prompt": i.get("prompt"),
                "params": i.get("params"),
                "image_url": i.get("image_url"),
                "s3_key": i.get("s3_key"),
                "error": i.get("error"),
                "created_at": i.get("created_at"),
            }
            for i in stage_items
        ],
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

    chars = webtoon_image.get_fixed_characters()
    style = (body.get("style") or webtoon_image.get_style()).strip()
    char_female = (body.get("char_female") or chars["A (여성 기자, 설명자)"]).strip()
    char_male = (body.get("char_male") or chars["B (남성 청자)"]).strip()
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
    now = time_utils.now_iso()
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
