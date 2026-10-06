"""컷 이미지 생성 — 모델 선택(Bedrock 4종/OpenAI) 디스패치, "실제 발행본과
같은 품질" 컷 생성(텍스트합성)까지 여기 있다.

프롬프트 조립·Bedrock 호출 로직은 `pipelines/common/webtoon_image.py`
::generate_cut_image()를 그대로 쓴다(`admin/backend/deploy-admin-api.sh`가
배포 시 그 디렉터리를 zip에 복사한다). 2026-09-20 이전엔 이 파일 안에
`_generate_once`/`_generate_composed_with_qa`로 독자 구현이 있었는데,
`pipelines/webtoon/pipeline.py`(실제 발행 파이프라인)가 완전히 별개의
디스패치를 갖고 있어서 admin에서 검증한 모델·원칙이 발행에 전혀 반영되지
않는 문제가 있었다(정리후보 A) — 그 로직을 `webtoon_image.generate_cut_image()`
로 옮겨 admin/발행 양쪽이 같은 함수를 부르게 만들었다. 여기 새로 복사하면
"복사본 하나만 고치고 하나는 안 고치는" 문제를 또 만드는 것이다.

2026-09-25 — "이미지 실험실 3단계"(handle_generate/handle_history, Stable
Image Core 단독·style/char_female/char_male 자유 입력) 원조 엔드포인트를
삭제했다. 프론트 유일한 소비자였던 WebtoonImageLab.tsx가 이미 삭제돼
(WebtoonImageSettingsPanel.tsx 개편과 함께) 호출부가 없어졌다."""
from __future__ import annotations

import logging
import uuid
from pathlib import Path

from shared import audit, response, time_utils
from routes.webtoon import jobs
import webtoon_image  # pipelines/common/ — 배포 시 zip에 복사됨(위 docstring 참고)
import compose_text  # pipelines/webtoon/ — 대사·캡션·내레이션 합성(2026-09-14)

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────
# "실제 발행본과 같은 품질" 컷 생성 (2026-09-14)
# ─────────────────────────────────────────────────────────────
#
# 프롬프트 챗랩 이미지 모델 선택(2026-09-15, 사용자 요청: "다양하게
# 테스트를 해보려는게 목적.. 사용가능한것들은.. 입력창쪽에.. 모델
# 선택가능하도록", 이어서 "nova canvas도 모델을 올려두긴해야합니다..
# openai api도 연결을 해서.. 이미지 생성 가능하도록"). Nova Canvas는
# 예전(다른 기능)에서 막혔던 전례가 있어 처음엔 뺐었는데, 실측으로 직접
# 확인해보니 모델 자체 접근 거부가 아니라 이 Lambda 역할에 IAM 권한이
# 없었던 것뿐이었다 — 비용태깅용 application inference profile을 새로
# 만들고 권한을 추가해서 해결(2026-09-15).
#
# QA 방침(2026-09-20 재검토) — QA(검증 후 조건부 재생성) 자체를 완전히
# 제거했다(사용자 요청, webtoon_image.generate_cut_image() 독스트링
# 참고). 말풍선 배치용 얼굴 위치 감지(검증과 무관)는 대사가 있는 컷에서
# 그대로 남아있다.
#
# 2026-09-25, 사용자 결정 — "pipeline"(GPU IP-Adapter+Style Transfer)·
# "style_guide"(레퍼런스 이미지 화풍)를 뺐다(webtoon_image.py 상단 주석
# 참고, 둘 다 발행 문서에 한 번도 실제로 쓰인 적이 없었다).
IMAGE_MODELS = {"stable_image_core", "sd35_large", "sd_ultra", "nova_canvas", "openai_dalle3"}


def _generate_composed(
    camera: str,
    scene: str,
    has_dialogue: bool,
    model: str = "sd_ultra",
) -> tuple[bytes, list | None]:
    """webtoon_image.generate_cut_image()의 얇은 wrapper — openai_dalle3만
    여기서 먼저 분기한다(admin 전용 모듈이라 공유 함수엔 안 넣음, 위
    모듈 docstring 참고).

    2026-09-26 — 콘텐츠 필터 거부("Filter reason: prompt") 시 한 번 순화해
    재시도한다. 실제 발행 경로(pipelines/webtoon/pipeline.py::
    generate_cut_image_to_file(), webtoon_image.py 모듈 상단 주석 —
    2026-09-20 198건 백필 실패 18건 중 대다수가 이 원인이었다는 실측)는
    이미 이 대응을 갖고 있는데, admin 실험 패널만 빠져 있었다 — CMS에서
    "스토리보드에서 채우기"로 붙여넣은 프롬프트로 테스트하면 필터에
    걸려 실패하는데, 실제 자동 발행에서는 같은 프롬프트가 자동 순화돼
    성공하는 괴리가 있었다(사용자가 실제로 겪음: "응답에 이미지 없음:
    ['Filter reason: prompt']"). 순화 자체는 이미 있는
    webtoon_image._soften_scene_for_filter()를 그대로 재사용 — 로직을
    또 복제하지 않는다."""
    if model == "openai_dalle3":
        import openai_image  # admin/backend/ 루트 — lazy(이 모델을 안 쓰면 시크릿 fetch 비용 없음)

        prompt = webtoon_image.build_style_guide_prompt(camera, scene)
        return openai_image.generate_image_bytes(prompt), None

    try:
        return webtoon_image.generate_cut_image(camera, scene, model, has_dialogue=has_dialogue)
    except ValueError as e:
        if "Filter reason: prompt" not in str(e):
            raise
        logger.warning("컷 이미지 콘텐츠 필터 거부 — 프롬프트 순화 후 재시도")
        softened_scene = webtoon_image._soften_scene_for_filter(scene)
        return webtoon_image.generate_cut_image(camera, softened_scene, model, has_dialogue=has_dialogue)


def run_composed_generation(job_id: str, cut: dict, push=None, model: str = "sd_ultra") -> None:
    """전체 경로 — 배경 생성+텍스트 합성. 프로덕션(pipeline.py::run_article)과
    같은 순서. 텍스트 합성이 실패해도 배경 이미지는 남기고 발행을 막지
    않는다(pipeline.py와 동일 원칙). `routes/webtoon/chat_ws.py`(웹소켓
    컷 생성 흐름)가 직접 호출한다.

    push — 2026-09-14, 웹소켓 채팅 전용. 주어지면 완료/실패 시 DDB 기록과
    별개로 이 콜백으로 즉시 결과를 밀어넣는다(폴링 없이 실시간 통지).

    cut["test_id"](2026-09-26 추가) — 사용자 요청: "웹툰 8컷에 대한
    여러 번의 테스트를 하고자 하며... 테스트 1 토글, 테스트 2 토글이
    나와야". WebtoonCutGenerator.tsx가 이제 "테스트 N"마다 독립된 8컷
    세트를 갖는다 — 같은 컷 번호(1~8)가 여러 테스트에 동시에 존재할 수
    있어, 응답이 어느 테스트의 어느 컷인지 구분하려면 test_id가 필요하다
    (podcast_voice/video의 slot_id와 같은 echo-correlation 패턴). 그냥
    받은 값을 그대로 돌려줄 뿐 서버 로직은 안 쓴다 — 없으면(구버전 프론트)
    None으로 돌아가도 그만이라 하위호환도 깨지지 않는다.

    model — 2026-09-15, 프롬프트 챗랩의 이미지 모델 선택 드롭다운 전용.
    IMAGE_MODELS에 없는 값이 오면 "sd_ultra"로 취급한다(오타·구버전
    프론트가 보낸 값이어도 조용히 기본 동작)."""
    if model not in IMAGE_MODELS:
        model = "sd_ultra"
    try:
        camera = (cut.get("camera") or "").strip()
        scene = (cut.get("scene") or "").strip()
        has_dialogue = bool(cut.get("dialogue")) or cut.get("cut") == 1
        image_bytes, faces = _generate_composed(camera, scene, has_dialogue, model=model)

        bucket = jobs.bucket()
        if not bucket:
            raise RuntimeError("CMS_MEDIA_BUCKET not configured")
        # 글자 없는 원본 그림을 따로 보관한다 — CMS에서 말풍선 위치를 옮긴 뒤 이미지 생성(비용) 없이 다시 합성하려는 용도.
        bg_key = f"media/webtoon-lab/{job_id}-bg.png"
        jobs.s3().put_object(Bucket=bucket, Key=bg_key, Body=image_bytes, ContentType="image/png")
        bg_url = f"https://{bucket}.s3.us-east-1.amazonaws.com/{bg_key}"

        tmp_path = Path(f"/tmp/webtoon-lab-{job_id}.png")
        tmp_path.write_bytes(image_bytes)
        layout: list = []
        try:
            try:
                # 웹툰식 말풍선(타원·여백) — 테스트 카드가 정한 값(cut.bubble_webtoon)이 있으면 그것을, 없으면 발행 설정을 따른다
                use_style = cut.get("bubble_webtoon")
                if use_style is None:
                    use_style = webtoon_image.get_bubble_style()
                if use_style:
                    cut = {**cut, "bubble_style": "oval", "bubble_margin": True}
            except Exception as e:  # noqa: BLE001
                logger.warning(f"웹툰식 말풍선 설정 읽기 실패(기존 스타일): {type(e).__name__}: {e}")
            try:
                # 테스트 카드가 정한 값(cut.bubble_detect)이 있으면 그것을, 없으면 발행 설정을 따른다
                use_detect = cut.get("bubble_detect")
                if use_detect is None:
                    use_detect = webtoon_image.get_bubble_detect()
                if use_detect:
                    import rekognition_people  # pipelines/common/ — 켜져 있을 때만 import·호출(권한·비용)

                    detect = rekognition_people.detect_people(image_bytes)
                    if detect:
                        cut = {**cut, "detect": detect}
            except Exception as e:  # noqa: BLE001 — 얼굴 인식이 어떻게 실패해도 글자 합성은 고정 배치로 계속한다
                logger.warning(f"말풍선 얼굴 회피 건너뜀(고정 배치): {type(e).__name__}: {e}")
            layout = compose_text.compose(tmp_path, cut, faces) or []
        except Exception as e:  # noqa: BLE001 — 배경은 유지, 합성 실패만 로그
            logger.warning(f"webtoon-lab 컷{cut.get('cut')} 텍스트 합성 실패(배경만 유지): {e}")
        final_bytes = tmp_path.read_bytes()
        tmp_path.unlink(missing_ok=True)

        key = f"media/webtoon-lab/{job_id}.png"
        jobs.s3().put_object(Bucket=bucket, Key=key, Body=final_bytes, ContentType="image/png")
        image_url = f"https://{bucket}.s3.us-east-1.amazonaws.com/{key}"
        jobs.update_job(job_id, {"status": "done", "image_url": image_url, "bg_url": bg_url, "updated_at": time_utils.now_iso()})
        audit.log("webtoon-lab-generate-composed-done", {"job_id": job_id, "cut": cut.get("cut")})
        if push:
            push({"type": "cut_image", "cut": cut.get("cut"), "test_id": cut.get("test_id"), "image_url": image_url, "bg_url": bg_url, "layout": layout, "model": model})
    except Exception as e:  # noqa: BLE001 — 비동기 invocation 최상위, 안 잡으면 job이 영원히 pending
        logger.exception(f"webtoon-lab composed generate failed: {job_id}")
        jobs.update_job(job_id, {"status": "error", "error": str(e)[:500], "updated_at": time_utils.now_iso()})
        if push:
            push({"type": "cut_image_error", "cut": cut.get("cut"), "test_id": cut.get("test_id"), "error": str(e)[:500]})


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
        "bubble_detect": webtoon_image.get_bubble_detect(),
        "bubble_style": webtoon_image.get_bubble_style(),
    })


# 2026-09-25 — 여기 있던 "이미지 실험실 3단계"(_run_generation/
# handle_generate/handle_history, Stable Image Core 단독·style/
# char_female/char_male 자유 입력 계약)를 삭제했다. 유일한 프론트
# 소비자였던 WebtoonImageLab.tsx가 이미 삭제돼 호출부가 없었다(모듈
# docstring 참고).


def handle_recompose(body: dict, path_params: dict, query_params: dict) -> dict:
    """말풍선 위치·대사·tone을 바꿔 같은 원본 그림 위에 다시 합성한다(2026-10-02, CMS 말풍선 편집).
    이미지 생성 모델은 호출하지 않아 비용이 들지 않는다.

    body = {"bg_url": 글자 없는 원본 그림 URL(run_composed_generation이 보관한 것), "cut": {cut, title, dialogue[{line, tone, pos?, tail?}], caption ...}}
    bg_url은 이 서비스 미디어 버킷의 media/webtoon-lab/*-bg.png 만 받는다(임의 URL을 서버가 받아오지 않도록 S3 키로만 읽는다)."""
    bg_url = (body.get("bg_url") or "").strip()
    cut = body.get("cut")
    if not bg_url or not isinstance(cut, dict):
        return response.err("bg_url과 cut이 필요합니다", 400)
    bucket = jobs.bucket()
    prefix = f"https://{bucket}.s3.us-east-1.amazonaws.com/media/webtoon-lab/"
    if not bucket or not bg_url.startswith(prefix) or not bg_url.endswith("-bg.png") or "/" in bg_url[len(prefix):] or ".." in bg_url:
        return response.err("허용되지 않는 bg_url", 400)
    bg_key = bg_url[len(f"https://{bucket}.s3.us-east-1.amazonaws.com/"):]
    try:
        bg_bytes = jobs.s3().get_object(Bucket=bucket, Key=bg_key)["Body"].read()
    except Exception:  # noqa: BLE001
        return response.err("원본 그림을 찾을 수 없습니다", 404)

    job_id = uuid.uuid4().hex
    tmp_path = Path(f"/tmp/webtoon-recompose-{job_id}.png")
    tmp_path.write_bytes(bg_bytes)
    try:
        layout = compose_text.compose(tmp_path, cut, None) or []
        final_bytes = tmp_path.read_bytes()
    finally:
        tmp_path.unlink(missing_ok=True)
    key = f"media/webtoon-lab/{job_id}.png"
    jobs.s3().put_object(Bucket=bucket, Key=key, Body=final_bytes, ContentType="image/png")
    audit.log("webtoon-lab-recompose", {"cut": cut.get("cut"), "bg": bg_key})
    return response.ok({"image_url": f"https://{bucket}.s3.us-east-1.amazonaws.com/{key}", "layout": layout})
