"""단계별 생성(Stage-by-stage) — 2026-09-18 신설, 사용자 요청("단계별로
컨트롤 하고 싶은 니즈가 있어서"). 기존 handle_generate(전체 파이프라인
한 번에)와 별개로, "pipeline" 모델의 각 단계(장면번역/인물/배경/합성/
화풍)를 독립적으로 호출·확인·재시도할 수 있게 한다. 새 로직은 없고
전부 webtoon_image.py/gpu_ipadapter.py의 기존 함수를 그대로 얇게
감싼다. 각 단계는 이전 단계 결과(S3 key)를 입력으로 받고, 자기 결과도
S3에 올려 키를 반환한다 — 프론트가 그 키를 다음 단계 호출에 그대로
넘긴다."""
from __future__ import annotations

import base64
import json
import logging
import uuid

from boto3.dynamodb.conditions import Key

from shared import audit, response, time_utils
from routes.webtoon import jobs
import webtoon_image  # pipelines/common/
import gpu_ipadapter  # pipelines/common/

logger = logging.getLogger(__name__)


def _stage_upload(job_id: str, stage: str, image_bytes: bytes) -> tuple[str, str]:
    """(image_url, s3_key) — 기존 handle_generate/generate.run_composed_generation과
    같은 CMS 미디어 버킷·키 규칙(media/webtoon-lab/...)을 쓴다."""
    bucket = jobs.bucket()
    if not bucket:
        raise RuntimeError("CMS_MEDIA_BUCKET not configured")
    key = f"media/webtoon-lab/stage/{job_id}-{stage}.png"
    jobs.s3().put_object(Bucket=bucket, Key=key, Body=image_bytes, ContentType="image/png")
    return f"https://{bucket}.s3.us-east-1.amazonaws.com/{key}", key


def _stage_download(s3_key: str) -> bytes:
    bucket = jobs.bucket()
    if not bucket:
        raise RuntimeError("CMS_MEDIA_BUCKET not configured")
    return jobs.s3().get_object(Bucket=bucket, Key=s3_key)["Body"].read()


def _record_stage(
    job_id: str, stage: str, *, cut: int | None, status: str,
    prompt: str | None = None, character: str | None = None,
    params: dict | None = None, image_url: str | None = None, s3_key: str | None = None,
    error: str | None = None,
) -> None:
    """단계별 생성 하나를 기존 job 테이블(jobs.job_table)에 기록 — 2026-09-18,
    사용자 요청("설정한 값들도 투명하게 기록이 히스토리쪽에 남는게
    중요한것같고요"). 새 테이블을 만들지 않고 기존 job 레코드에 stage/
    cut/prompt/params 필드를 얹는다 — handle_history가 이미 이 테이블을
    "지우지 않는 이력"으로 쓰고 있는 것과 같은 원칙(never delete). 조회는
    handle_history가 stage 필드 유무로 "새 단계별 생성 기록"만 걸러낸다
    (기존 handle_generate/handle_gpu_start 레코드는 stage가 없어 안 섞임)."""
    now = time_utils.now_iso()
    row = {
        "status": status, "stage": stage, "cut": cut,
        "prompt": prompt, "character": character, "params": params,
        "image_url": image_url, "s3_key": s3_key, "error": error,
        "created_at": now, "updated_at": now,
    }
    jobs.put_job(job_id, {k: v for k, v in row.items() if v is not None})


def handle_translate(body: dict, path_params: dict, query_params: dict) -> dict:
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
    """`routes/webtoon/__init__.py::run_async_job`(self-invoke)가 부른다."""
    try:
        image_bytes = gpu_ipadapter.generate_ipadapter_photo_bytes(prompt, character)
        image_url, s3_key = _stage_upload(job_id, f"char-{character}", image_bytes)
        jobs.update_job(job_id, {"status": "done", "image_url": image_url, "s3_key": s3_key, "updated_at": time_utils.now_iso()})
        if push:
            push({"type": "stage_done", "stage": "character", "character": character, "job_id": job_id, "image_url": image_url, "s3_key": s3_key})
    except Exception as e:  # noqa: BLE001 — 비동기 invocation 최상위
        logger.exception(f"webtoon-lab stage character({character}) failed: {job_id}")
        jobs.update_job(job_id, {"status": "error", "error": str(e)[:500], "updated_at": time_utils.now_iso()})
        if push:
            push({"type": "stage_error", "stage": "character", "character": character, "job_id": job_id, "error": str(e)[:500]})


def handle_character(body: dict, path_params: dict, query_params: dict) -> dict:
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
    if len(prompt.encode("utf-8")) > jobs.MAX_TEXT_BYTES:
        return response.err(f"prompt too long (max {jobs.MAX_TEXT_BYTES} bytes)", 400)

    job_id = uuid.uuid4().hex[:16]
    _record_stage(job_id, "character", cut=cut, status="pending", prompt=prompt, character=character)
    jobs.self_invoke_async({"kind": "stage_character", "job_id": job_id, "character": character, "prompt": prompt})
    audit.log("webtoon-lab-stage-character", {"job_id": job_id, "character": character})
    return response.ok({"job_id": job_id, "status": "pending"})


def handle_background(body: dict, path_params: dict, query_params: dict) -> dict:
    """3단계 — 배경만(인물 없음) 생성. Bedrock 호출 1번이라 동기."""
    body = body or {}
    prompt = (body.get("prompt") or "").strip()
    cut = body.get("cut")
    if not prompt:
        return response.err("prompt is required", 400)
    if len(prompt.encode("utf-8")) > jobs.MAX_TEXT_BYTES:
        return response.err(f"prompt too long (max {jobs.MAX_TEXT_BYTES} bytes)", 400)
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


def handle_composite(body: dict, path_params: dict, query_params: dict) -> dict:
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


def handle_style(body: dict, path_params: dict, query_params: dict) -> dict:
    """5단계 — 화풍 적용(Stable Style Transfer). Bedrock 호출 1번이라 동기.
    prompt를 안 주면 admin이 발행한 STYLE 텍스트(_style_hint_from_db)를
    기본값으로 쓴다 — generate_bedrock_style_transfer_bytes와 같은 기본값."""
    body = body or {}
    init_key = (body.get("init_key") or "").strip()
    cut = body.get("cut")
    if not init_key:
        return response.err("init_key is required", 400)
    prompt = (body.get("prompt") or "").strip() or None
    if prompt and len(prompt.encode("utf-8")) > jobs.MAX_TEXT_BYTES:
        return response.err(f"prompt too long (max {jobs.MAX_TEXT_BYTES} bytes)", 400)
    job_id = uuid.uuid4().hex[:16]
    try:
        init_bytes = _stage_download(init_key)
        if prompt:
            # generate_bedrock_style_transfer_bytes는 prompt를 파라미터로
            # 안 받고 내부에서 항상 _style_hint_from_db()를 쓴다 — 단계별
            # 실험에서는 그 텍스트를 직접 바꿔보고 싶을 수 있어 body 하나
            # 만들어 넘기는 저수준 경로를 쓴다(webtoon_image.py의
            # _invoke_and_decode_image·STYLE_TRANSFER_MODEL_ID 재사용).
            style_body = json.dumps({
                "init_image": base64.b64encode(init_bytes).decode(),
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
            final_bytes = webtoon_image.generate_bedrock_style_transfer_bytes(init_bytes)
    except Exception as e:  # noqa: BLE001
        _record_stage(job_id, "style", cut=cut, status="error", prompt=prompt, params={"init_key": init_key}, error=str(e)[:500])
        return response.err(f"style transfer failed: {e}", 400)
    image_url, s3_key = _stage_upload(job_id, "style", final_bytes)
    _record_stage(job_id, "style", cut=cut, status="done", prompt=prompt, params={"init_key": init_key}, image_url=image_url, s3_key=s3_key)
    audit.log("webtoon-lab-stage-style", {"job_id": job_id})
    return response.ok({"job_id": job_id, "image_url": image_url, "s3_key": s3_key})


def handle_history(body: dict, path_params: dict, query_params: dict) -> dict:
    """단계별 생성 이력 — 2026-09-18, 사용자 요청("생성된 이미지들을 볼 수
    있어야하고, 버전별로요"). _record_stage()가 써둔 stage 필드가 있는
    job 레코드만 걸러서(기존 handle_generate/handle_gpu_start 레코드와
    안 섞이게) 최신순으로 반환한다. query_params.cut이 있으면 그 컷만.
    전체 스캔 방식 — 이 테이블 규모에서는 페이지네이션 없이도 무시할
    수준."""
    query_params = query_params or {}
    cut_filter = query_params.get("cut")
    table = jobs.job_table()
    items: list[dict] = []
    kwargs: dict = {
        "KeyConditionExpression": Key("pk").eq(jobs.JOB_PK) & Key("sk").begins_with("job/"),
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
