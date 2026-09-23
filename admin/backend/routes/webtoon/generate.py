"""컷 이미지 생성 — 모델 선택(pipeline/Bedrock 4종/OpenAI) 디스패치,
"실제 발행본과 같은 품질" 컷 생성(GPU+QA+텍스트합성), 그리고 이미지
실험실(3단계, Bedrock Stable Image Core 단독) 원조 엔드포인트까지 전부
여기 있다 — `routes/webtoon_lab.py`(2026-09-20 분리 전)의 핵심 로직.

`GET /admin/webtoon-lab/{job_id}` 폴링 라우트는 job 종류를 안 가리므로
`jobs.py`에 있다 — 이 파일은 등록만 안 하고 결과만 그 테이블에 쓴다.

프롬프트 조립·Bedrock 호출·QA 로직은 `pipelines/common/webtoon_image.py`
::generate_cut_image()를 그대로 쓴다(`admin/backend/deploy-admin-api.sh`가
배포 시 그 디렉터리를 zip에 복사한다). 2026-09-20 이전엔 이 파일 안에
`_generate_once`/`_generate_composed_with_qa`로 독자 구현이 있었는데,
`pipelines/webtoon/pipeline.py`(실제 발행 파이프라인)가 완전히 별개의
디스패치를 갖고 있어서 admin에서 검증한 모델·원칙이 발행에 전혀 반영되지
않는 문제가 있었다(정리후보 A) — 그 로직을 `webtoon_image.generate_cut_image()`
로 옮겨 admin/발행 양쪽이 같은 함수를 부르게 만들었다. 여기 새로 복사하면
"복사본 하나만 고치고 하나는 안 고치는" 문제를 또 만드는 것이다."""
from __future__ import annotations

import logging
import threading
import uuid
from pathlib import Path

from boto3.dynamodb.conditions import Key

from shared import audit, response, time_utils
from routes.webtoon import jobs
import webtoon_image  # pipelines/common/ — 배포 시 zip에 복사됨(위 docstring 참고)
import compose_text  # pipelines/webtoon/ — 대사·캡션·내레이션 합성(2026-09-14)

logger = logging.getLogger(__name__)

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
# QA 방침(2026-09-20 재검토) — 한때 model=="pipeline"일 때만 비전 판정+
# Rekognition 얼굴 수 검사를 거치는 정책이 있었는데, 사용자 요청으로
# QA(검증 후 조건부 재생성) 자체를 완전히 제거했다 — admin은 QA 기본
# off였고 발행 파이프라인만 하드코딩으로 on이라 "CMS로만 제어돼야
# 한다" 원칙과 안 맞았다(webtoon_image.generate_cut_image() 독스트링
# 참고). 말풍선 배치용 얼굴 위치 감지(검증과 무관)는 대사가 있는 컷에서
# 그대로 남아있다.
IMAGE_MODELS = {"pipeline", "stable_image_core", "sd35_large", "sd_ultra", "style_guide", "nova_canvas", "openai_dalle3"}


def _generate_composed(
    camera: str,
    scene: str,
    has_dialogue: bool,
    model: str = "pipeline",
    *,
    apply_character_lock: bool = True,
    apply_style_transfer: bool = True,
) -> tuple[bytes, list | None]:
    """webtoon_image.generate_cut_image()의 얇은 wrapper — openai_dalle3만
    여기서 먼저 분기한다(admin 전용 모듈이라 공유 함수엔 안 넣음, 위
    모듈 docstring 참고)."""
    if model == "openai_dalle3":
        import openai_image  # admin/backend/ 루트 — lazy(이 모델을 안 쓰면 시크릿 fetch 비용 없음)

        prompt = webtoon_image.build_style_guide_prompt(camera, scene)
        return openai_image.generate_image_bytes(prompt), None

    return webtoon_image.generate_cut_image(
        camera, scene, model,
        has_dialogue=has_dialogue,
        apply_character_lock=apply_character_lock,
        apply_style_transfer=apply_style_transfer,
    )


def run_composed_generation(job_id: str, cut: dict, push=None, model: str = "pipeline") -> None:
    """전체 경로 — 배경 생성(GPU/Style Transfer)+QA+얼굴 감지+텍스트 합성.
    프로덕션(pipeline.py::run_article)과 같은 순서. 텍스트 합성이 실패해도
    배경 이미지는 남기고 발행을 막지 않는다(pipeline.py와 동일 원칙).
    `routes/webtoon/chat_ws.py`(웹소켓 컷 생성 흐름)가 직접 호출한다.

    push — 2026-09-14, 웹소켓 채팅 전용. 주어지면 완료/실패 시 DDB 기록과
    별개로 이 콜백으로 즉시 결과를 밀어넣는다(폴링 없이 실시간 통지).

    model — 2026-09-15, 프롬프트 챗랩의 이미지 모델 선택 드롭다운 전용.
    IMAGE_MODELS에 없는 값이 오면 "pipeline"으로 취급한다(오타·구버전
    프론트가 보낸 값이어도 조용히 기본 동작).

    cut의 apply_character_lock/apply_style_transfer — 2026-09-16, "인물
    고정·화풍 고정 체크박스" 요청. 키가 아예 없으면(구버전 프론트) True로
    — 지금까지의 기본 동작 그대로."""
    if model not in IMAGE_MODELS:
        model = "pipeline"
    try:
        camera = (cut.get("camera") or "").strip()
        scene = (cut.get("scene") or "").strip()
        has_dialogue = bool(cut.get("dialogue")) or cut.get("cut") == 1
        apply_character_lock = cut.get("apply_character_lock", True)
        apply_style_transfer = cut.get("apply_style_transfer", True)
        image_bytes, faces = _generate_composed(
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

        bucket = jobs.bucket()
        if not bucket:
            raise RuntimeError("CMS_MEDIA_BUCKET not configured")
        key = f"media/webtoon-lab/{job_id}.png"
        jobs.s3().put_object(Bucket=bucket, Key=key, Body=final_bytes, ContentType="image/png")
        image_url = f"https://{bucket}.s3.us-east-1.amazonaws.com/{key}"
        jobs.update_job(job_id, {"status": "done", "image_url": image_url, "updated_at": time_utils.now_iso()})
        audit.log("webtoon-lab-generate-composed-done", {"job_id": job_id, "cut": cut.get("cut")})
        if push:
            push({"type": "cut_image", "cut": cut.get("cut"), "image_url": image_url, "model": model})
    except Exception as e:  # noqa: BLE001 — 비동기 invocation 최상위, 안 잡으면 job이 영원히 pending
        logger.exception(f"webtoon-lab composed generate failed: {job_id}")
        jobs.update_job(job_id, {"status": "error", "error": str(e)[:500], "updated_at": time_utils.now_iso()})
        if push:
            push({"type": "cut_image_error", "cut": cut.get("cut"), "error": str(e)[:500]})


def handle_defaults(body: dict, path_params: dict, query_params: dict) -> dict:
    """현재 발행된(admin DDB `webtoon-image/published`) STYLE/FIXED_CHARACTERS/
    IMAGE_MODEL 조회 — 패널의 필드가 빈 칸이 아니라 지금 실제로 쓰이는 값을
    항상 채워서 보여주기 위함(2026-09-04 최초 도입, 2026-09-16 "직접 입력"
    체크박스를 없애고 필드를 상시 노출하도록 변경, 2026-09-20 image_model
    추가). webtoon_image.get_image_settings()가 세 값을 한 번의 fresh
    조회로 같이 가져온다(캐시 없음) — get_style()/get_fixed_characters()/
    get_active_image_model()을 따로따로 부르면 같은 문서를 세 번 읽어서
    "프롬프트 실험 페이지 로딩이 느리다" 신고로 발견, 합쳤다."""
    style, chars, image_model = webtoon_image.get_image_settings()
    return response.ok({
        "style": style,
        "char_female": chars["A (여성 기자, 설명자)"],
        "char_male": chars["B (남성 청자)"],
        "image_model": image_model,
    })


def _run_generation(job_id: str, prompt: str) -> None:
    """백그라운드에서 실행 — Bedrock 호출 후 S3 업로드 + DDB 상태 갱신.
    실패해도 예외를 위로 던지지 않는다(백그라운드 스레드라 던져봐야 아무도
    안 받는다) — 대신 job 레코드에 error를 기록해 폴링 쪽이 보게 한다."""
    try:
        image_bytes = webtoon_image.generate_bedrock_image_bytes(prompt)
        bucket = jobs.bucket()
        if not bucket:
            raise RuntimeError("CMS_MEDIA_BUCKET not configured")
        key = f"media/webtoon-lab/{job_id}.png"
        jobs.s3().put_object(Bucket=bucket, Key=key, Body=image_bytes, ContentType="image/png")
        image_url = f"https://{bucket}.s3.us-east-1.amazonaws.com/{key}"
        jobs.update_job(job_id, {"status": "done", "image_url": image_url, "updated_at": time_utils.now_iso()})
        audit.log("webtoon-lab-generate-done", {"job_id": job_id})
    except Exception as e:  # noqa: BLE001 — 백그라운드 스레드 최상위, 여기서 안 잡으면 조용히 사라짐
        logger.exception(f"webtoon-lab generate failed: {job_id}")
        jobs.update_job(job_id, {"status": "error", "error": str(e)[:500], "updated_at": time_utils.now_iso()})


def handle_generate(body: dict, path_params: dict, query_params: dict) -> dict:
    """이미지 실험실 3단계 — Bedrock Stable Image Core 단독, style/
    char_female/char_male 자유 입력 계약. `run_composed_generation`(GPU
    풀파이프라인)과는 다른 화면·다른 입력 계약이라 합치지 않는다."""
    body = body or {}
    scene = (body.get("scene") or "").strip()
    camera = (body.get("camera") or "").strip()
    if not scene:
        return response.err("scene is required", 400)
    if not camera:
        return response.err("camera is required", 400)
    if len(scene.encode("utf-8")) > jobs.MAX_SCENE_BYTES:
        return response.err(f"scene too long (max {jobs.MAX_SCENE_BYTES} bytes)", 400)

    chars = webtoon_image.get_fixed_characters()
    style = (body.get("style") or webtoon_image.get_style()).strip()
    char_female = (body.get("char_female") or chars["A (여성 기자, 설명자)"]).strip()
    char_male = (body.get("char_male") or chars["B (남성 청자)"]).strip()
    for label, text in (("style", style), ("char_female", char_female), ("char_male", char_male)):
        if len(text.encode("utf-8")) > jobs.MAX_TEXT_BYTES:
            return response.err(f"{label} too long (max {jobs.MAX_TEXT_BYTES} bytes)", 400)

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
    jobs.put_job(job_id, {
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


def handle_history(body: dict, path_params: dict, query_params: dict) -> dict:
    """완료된 생성 이력 전체(이 admin 계정 전체 공유) — 히스토리 갤러리용
    (WebtoonImageLab.tsx). 2026-09-21 — 출력 직전 `done[:jobs.HISTORY_LIMIT]`
    로 24개만 잘라 보내던 걸 없앴다 — 쿼리 자체는 이미 LastEvaluatedKey를
    끝까지 따라가며 전량을 읽어오고 있었으니(아래 while 루프) 자르는 딱
    한 줄만 문제였다. 프론트가 페이지네이션으로 잘라 보여준다."""
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
        for i in done
    ]
    return response.ok({"items": out})
