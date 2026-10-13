"""웹툰 3단계(이미지 생성) 프롬프트 조립 + Bedrock Stable Diffusion 호출.

`pipelines/webtoon/pipeline.py`(자동 발행)와 admin 콘솔의 "이미지 실험" 패널이 공용으로 쓴다.
admin/backend는 Lambda 배포 시 이 파일을 zip에 복사한다(`admin/backend/deploy-admin-api.sh`).

STYLE/FIXED_CHARACTERS/IMAGE_MODEL은 admin이 발행한 DDB 문서(`PROMPT#webtoon-image/published`)가
정본이다. get_style()/get_fixed_characters()는 캐시 없이 매번 조회하며, 문서가 없거나 조회가
실패하면 `_STYLE_FALLBACK`/`_FIXED_CHARACTERS_FALLBACK`으로 폴백해 웹툰 생성이 중단되지 않게 한다.
실제 동작을 바꾸려면 코드가 아니라 admin "이미지 실험" 패널에서 발행한다.
"""
from __future__ import annotations

import base64
import json
import time
from pathlib import Path
from webtoon_image_prompt import (  # noqa: F401  (일부는 다른 모듈이 webtoon_image 에서 가져다 쓴다)
    CHARACTER_REINFORCEMENT,
    SCENE_REINFORCEMENT,
    _VALID_IMAGE_MODELS,
    build_background_prompt,
    build_style_guide_prompt,
    characters_block,
    get_active_image_model,
    get_bubble_detect,
    get_bubble_style,
    get_fixed_characters,
    get_image_settings,
    get_style,
)

# 다른 모듈이 webtoon_image 에서 가져다 쓰는 이름(프롬프트 쪽에서 옮긴 것). pyflakes 가 re-export 를 미사용으로 보지 않게 한다.
__all__ = [
    "CHARACTER_REINFORCEMENT",
    "SCENE_REINFORCEMENT",
    "_VALID_IMAGE_MODELS",
    "characters_block",
    "get_active_image_model",
    "get_bubble_detect",
    "get_bubble_style",
    "get_fixed_characters",
    "get_image_settings",
    "get_style",
]


# ─────────────────────────────────────────────────────────────
# Bedrock Stable Image Core 호출
# ─────────────────────────────────────────────────────────────

BEDROCK_IMAGE_REGION = "us-west-2"  # us-east-1엔 살아있는 순수 text-to-image 모델이 없음(Nova Canvas만 있는데 막힘)
from bedrock_models import profile_arn  # noqa: E402
# 베어 모델 ID(`stability.stable-image-core-v1:1`)로 직접 호출하면 비용할당태그가 붙을 자리가
# 없어 청구 데이터에서 전량 `Not Applicable`로 새므로(실측 8/18~8/26 $33.08, 월 약 $110)
# application inference profile ARN을 쓴다. 태그는 소급되지 않는다.
# 프로파일 태그: Service=atlas4 · Project=Sedaily-LENS · Workload=webtoon-image
# (2026-09-30 이후 Service는 lens, docs/architecture/비용태깅_규칙.md 참고).
BEDROCK_IMAGE_MODEL_ID = profile_arn("image_stable_core")  # lens-webtoon-image-stable-core → stability.stable-image-core-v1:1
BEDROCK_ASPECT_RATIO = "3:2"

_bedrock_image_client = None


def _get_bedrock_image_client():
    global _bedrock_image_client
    if _bedrock_image_client is None:
        import boto3  # noqa: lazy — import만 하고 생성은 안 하는 경로(프롬프트 미리보기 등)에서 클라이언트 초기화를 피한다.
        _bedrock_image_client = boto3.client("bedrock-runtime", region_name=BEDROCK_IMAGE_REGION)
    return _bedrock_image_client


_TRANSIENT_BEDROCK_ERRORS = (
    "ServiceUnavailableException",
    "ThrottlingException",
    "ModelTimeoutException",
    "InternalServerException",
)
_TRANSIENT_RETRY_ATTEMPTS = 3
_TRANSIENT_RETRY_WAIT_S = 2  # 출력 속도가 중요해 짧게 둔다


def _invoke_and_decode_image(client, model_id: str, body: str, *, error_key: str = "finish_reasons") -> bytes:
    """이미지 생성 함수들이 공유하는 뒷부분: invoke_model → payload.images[0] 파싱 → 없으면 에러.
    client/modelId/요청 body 조립은 호출부 책임이다. error_key는 실패 원인을 읽을 필드
    (Stability 계열은 "finish_reasons", Nova Canvas는 "error")다.

    Bedrock 일시 오류(503 등)는 2초 간격 3회만 재시도한다. _retry_generate_and_write의
    12/24/36초 백오프는 배치용이라 여기엔 너무 느리다. 재시도로 풀리지 않는 오류는 즉시 올린다."""
    for attempt in range(_TRANSIENT_RETRY_ATTEMPTS):
        try:
            resp = client.invoke_model(modelId=model_id, body=body)
            break
        except Exception as e:  # noqa: BLE001 — 아래서 transient 여부만 보고 재판단
            is_transient = any(code in str(e) for code in _TRANSIENT_BEDROCK_ERRORS)
            if not is_transient or attempt == _TRANSIENT_RETRY_ATTEMPTS - 1:
                raise
            print(f"[webtoon_image] Bedrock 일시 오류({e}) — {_TRANSIENT_RETRY_WAIT_S}초 후 재시도({attempt + 1}/{_TRANSIENT_RETRY_ATTEMPTS})")
            time.sleep(_TRANSIENT_RETRY_WAIT_S)
    payload = json.loads(resp["body"].read())
    images = payload.get("images") or []
    if not images:
        raise ValueError(f"응답에 이미지 없음: {payload.get(error_key)}")
    return base64.b64decode(images[0])


def generate_bedrock_image_bytes(prompt: str) -> bytes:
    """Stable Image Core(Bedrock) 1회 호출 — 성공 시 PNG bytes, 실패 시 예외.
    재시도 전략이 배치 파이프라인과 admin 실험 도구에서 달라 호출부가 맡는다."""
    body = json.dumps(_stability_request(prompt))
    return _invoke_and_decode_image(_get_bedrock_image_client(), BEDROCK_IMAGE_MODEL_ID, body)


# ─────────────────────────────────────────────────────────────
# Bedrock Stable Diffusion 3.5 Large 호출
# ─────────────────────────────────────────────────────────────
# Stable Image Core와 응답 스키마가 같지만(_invoke_and_decode_image 재사용) SD3 계열은 같은
# 엔드포인트로 image-to-image도 받으므로 "mode": "text-to-image"가 필수다.
# us-west-2에만 있다(BEDROCK_IMAGE_REGION과 동일).
# 프로파일 태그: Service=atlas4 · Project=Sedaily-LENS · Workload=webtoon-image
# (태깅 정책은 비용태깅_규칙.md 참고).
SD35_LARGE_MODEL_ID = profile_arn("image_sd35_large")  # lens-webtoon-image-sd35-large → stability.sd3-5-large-v1:0


def generate_bedrock_sd35_image_bytes(prompt: str) -> bytes:
    """Stable Diffusion 3.5 Large(Bedrock) 1회 호출 — generate_bedrock_image_bytes와
    계약 동일(성공 시 PNG bytes 반환, 실패 시 예외), 재시도는 호출부 책임."""
    body = json.dumps(_stability_request(prompt, mode="text-to-image"))
    return _invoke_and_decode_image(_get_bedrock_image_client(), SD35_LARGE_MODEL_ID, body)


# ─────────────────────────────────────────────────────────────
# Bedrock Stable Image Ultra 호출
# ─────────────────────────────────────────────────────────────
# Stability AI 최상위 품질 등급. 요청 스키마는 Stable Image Core와 같다(mode 불필요).
# 프로파일 태그: Service=atlas4 · Project=Sedaily-LENS · Workload=webtoon-image
# (태깅 정책은 비용태깅_규칙.md 참고).
SD_ULTRA_MODEL_ID = profile_arn("image_sd_ultra")  # lens-webtoon-image-sd-ultra → stability.stable-image-ultra-v1:1


# 그림에 글자·말풍선이 들어가는 것을 막는 금지어는 본문의 CRITICAL 문구와 별개로
# 모델의 negative_prompt 필드로도 보낸다.
ULTRA_NEGATIVE_PROMPT = "text, letters, words, writing, speech bubble, caption, subtitle, watermark, logo, signature"

# 기사 단위 seed — pipeline.run_article이 기사마다 한 번 정한다(None이면 모델이 무작위로 정함).
# 같은 기사의 컷이 같은 seed를 쓰면 분위기가 비슷해지고, 같은 조건으로 한 컷만 다시 뽑을 수 있다.
_run_seed: int | None = None


# 스크립트가 기사별로 내는 "negative_prompt" — 있으면 공통 금지어 뒤에 덧붙인다.
_run_negative: str = ""


def set_run_negative(text: str | None) -> None:
    global _run_negative
    _run_negative = (text or "").strip()


def set_run_seed(seed: int | None) -> None:
    global _run_seed
    _run_seed = seed


def _stability_request(prompt: str, mode: str | None = None) -> dict:
    """Stability 3모델(Core·Large·Ultra) 공통 요청 본문. 금지 문구(negative_prompt)와 기사 단위 seed를
    세 모델 모두에 보낸다. Core·Large에 빠져 있어 스크립트의 금지 문구가 전달되지 않았다(2026-10-12)."""
    req = {
        "prompt": prompt[:9500],  # Stability 프롬프트 상한(~1만자) 여유 두고 컷
        "negative_prompt": f"{ULTRA_NEGATIVE_PROMPT}, {_run_negative}"[:9500] if _run_negative else ULTRA_NEGATIVE_PROMPT,
        "aspect_ratio": BEDROCK_ASPECT_RATIO,
        "output_format": "png",
    }
    if mode:
        req["mode"] = mode
    if _run_seed is not None:
        req["seed"] = _run_seed
    return req


def generate_bedrock_sd_ultra_image_bytes(prompt: str) -> bytes:
    """Stable Image Ultra(Bedrock) 1회 호출 — generate_bedrock_image_bytes와
    계약 동일(성공 시 PNG bytes 반환, 실패 시 예외), 재시도는 호출부 책임.
    Ultra는 image-to-image를 지원하지 않는다("Model ultra does not support image-to-image mode")."""
    return _invoke_and_decode_image(_get_bedrock_image_client(), SD_ULTRA_MODEL_ID, json.dumps(_stability_request(prompt)))


def _retry_generate_and_write(bytes_fn, out_path: Path, retries: int) -> bool:
    """공통 재시도 + 파일 쓰기 래퍼 — 모델별 생성 호출(bytes_fn)만 다르고
    재시도(12/24/36초 백오프)와 실패 로그는 같다."""
    for attempt in range(retries):
        try:
            data = bytes_fn()
            out_path.parent.mkdir(parents=True, exist_ok=True)
            out_path.write_bytes(data)
            return True
        except Exception as e:
            if attempt < retries - 1:
                wait = (attempt + 1) * 12
                print(f"    ⚠️  오류: {e} → {wait}초 후 재시도...")
                time.sleep(wait)
            else:
                print(f"    ❌ 최종 실패: {e}")
                return False
    return False


# ─────────────────────────────────────────────────────────────
# Amazon Nova Canvas (Bedrock) — 프롬프트 챗랩 이미지 모델 비교 실험 전용
#
# Bedrock 카탈로그상 "LEGACY"로 표시되지만 이 계정은 접근 가능하다(us-east-1 InvokeModel 성공 확인).
# us-east-1 전용이라(us-west-2엔 없음) 클라이언트를 따로 둔다.
# ─────────────────────────────────────────────────────────────

NOVA_CANVAS_REGION = "us-east-1"
NOVA_CANVAS_MODEL_ID = profile_arn("image_nova_canvas")  # lens-webtoon-image-nova-canvas → amazon.nova-canvas-v1:0

_nova_canvas_client = None


def _get_nova_canvas_client():
    global _nova_canvas_client
    if _nova_canvas_client is None:
        import boto3  # noqa: lazy — 위 _get_bedrock_image_client()와 같은 이유

        _nova_canvas_client = boto3.client("bedrock-runtime", region_name=NOVA_CANVAS_REGION)
    return _nova_canvas_client


def generate_nova_canvas_image_bytes(prompt: str) -> bytes:
    """Amazon Nova Canvas(Bedrock) 1회 호출 — 성공 시 PNG bytes.
    요청/응답 계약이 Stability 계열과 달라(taskType 기반, width/height 직접 지정) 별도 함수로 둔다.
    참고 이미지 컨디셔닝이 없는 순수 text-to-image라 스타일 힌트가 중요하며, prompt는
    build_style_guide_prompt()의 결과를 받는다.

    height/width가 512x512(정사각형)인 이유: LEGACY 모델이라 임의 해상도를 받지 못한다.
    세로형 전부(1024x1024·768x1152·896x1152·720x1280)와 1280x720은 "Access denied. This Model is
    marked by provider as Legacy..."로 거부됐고 512x512와 1280x1024만 성공했다. 비교 실험 목적이라
    정사각형을 택했으며, compose_text.py의 말풍선 배치는 세로형 전제라 이 모델에는 맞지 않을 수 있다."""
    body = json.dumps({
        "taskType": "TEXT_IMAGE",
        "textToImageParams": {"text": prompt[:1024]},  # Nova Canvas 프롬프트 상한(1024자)
        "imageGenerationConfig": {
            "numberOfImages": 1,
            "height": 512,
            "width": 512,
        },
    })
    return _invoke_and_decode_image(_get_nova_canvas_client(), NOVA_CANVAS_MODEL_ID, body, error_key="error")


# ─────────────────────────────────────────────────────────────
# 컷 이미지 생성 — 단일 정본 디스패치
# ─────────────────────────────────────────────────────────────
#
# admin 실험 패널(admin/backend/routes/webtoon/generate.py)과 발행 파이프라인
# (pipelines/webtoon/pipeline.py)이 모델 디스패치를 각자 갖고 있으면 admin에서 검증한 모델·원칙이
# 발행에 반영되지 않으므로, 양쪽이 generate_cut_image() 하나를 부른다.
#
# openai_dalle3는 admin 전용 모듈에 의존하고 사업상 사용 불가라 여기 넣지 않으며, admin
# generate.py가 이 함수를 부르기 전에 따로 분기한다.
#
# 생성 결과를 비전 모델로 재검증해 재생성하는 QA 단계는 두지 않는다. "CMS로만 제어된다"는
# 원칙과 맞지 않아 후처리 자체를 제거했다.


def _generate_cut_once(
    camera: str,
    scene: str,
    model: str,
) -> bytes:
    """model 하나로 이미지 1장 생성한다. 모델별 프롬프트 조립만 다르고 재시도는
    호출부(generate_cut_image)가 맡는다.

    stable_image_core/sd35_large/sd_ultra는 사용자가 입력한 camera/scene으로만 제어되도록
    고정 인물, 재강조 문구, 화풍(style="")을 붙이지 않는다. Camera/[SCENE]과 "텍스트 렌더 금지"
    안전장치만 남는다. 알 수 없는 model(옛 발행 문서의 값 등)은 sd_ultra로 폴백한다."""
    if model == "stable_image_core":
        prompt = build_background_prompt(
            camera, scene, style="",
            include_scene_reinforcement=False, include_character_reinforcement=False,
        )
        return generate_bedrock_image_bytes(prompt)

    if model == "sd35_large":
        prompt = build_background_prompt(
            camera, scene, style="",
            include_scene_reinforcement=False, include_character_reinforcement=False,
        )
        return generate_bedrock_sd35_image_bytes(prompt)

    if model == "nova_canvas":
        # 스타일 힌트가 포함된 짧은 프롬프트를 쓴다(참고 이미지 컨디셔닝이 없는 순수 text-to-image).
        prompt = build_style_guide_prompt(camera, scene)
        return generate_nova_canvas_image_bytes(prompt)

    # "sd_ultra"(기본, 알 수 없는 값도 여기로 폴백)
    prompt = build_background_prompt(
        camera, scene, style="",
        include_scene_reinforcement=False, include_character_reinforcement=False,
    )
    return generate_bedrock_sd_ultra_image_bytes(prompt)


def generate_cut_image(
    camera: str,
    scene: str,
    model: str = "sd_ultra",
    *,
    has_dialogue: bool = True,
) -> tuple[bytes, list | None]:
    """컷 이미지 1장 생성 — admin 실험 패널과 발행 파이프라인이 공유하는 단일 디스패치.
    반환값은 (image_bytes, faces)이며 faces는 항상 None이다. 얼굴 감지 기반 말풍선 배치는
    제거되었고, compose_text.py는 faces가 None이면 균등분할로 배치한다. faces 값은
    compose_text.py 시그니처 호환을 위해 남겼다."""
    image_bytes = _generate_cut_once(camera, scene, model)
    return image_bytes, None


# Bedrock 콘텐츠 필터가 image_prompt 내용 자체를 거부하면("Filter reason: prompt") 같은
# 문장으로 재시도해도 매번 같은 방식으로 거부되므로 일반 재시도는 무의미하다. 어떤 단어가
# 걸렸는지 Bedrock이 알려주지 않아 규칙 기반 사전 필터링도 불가능하다. 그래서 거부 시점에
# 텍스트 모델로 프롬프트를 한 번 순화한 뒤 재시도한다.
_PROMPT_HELPER_MODEL = profile_arn("webtoon_script_sonnet46")  # lens-webtoon-script-sonnet-46


def _soften_scene_for_filter(scene: str) -> str:
    """Bedrock 콘텐츠 필터('Filter reason: prompt')에 거부된 image_prompt를
    텍스트 모델로 한 번 순화해서 돌려준다. 실패하면 원문을 그대로
    돌려줘 호출부가 최소한 기존 동작(동일 프롬프트로 재시도)으로
    폴백하게 한다."""
    try:
        from bedrock_client import call_text  # pipelines/common/ — sibling, flat import

        system = (
            "다음은 이미지 생성 요청 프롬프트인데 안전 필터에 거부됐다. "
            "장면의 핵심 구도·소재·색감·NEGATIVE 문구는 최대한 그대로 "
            "유지하되, 실존 인물처럼 읽힐 수 있는 묘사, 신체 부위·통증·"
            "갈등·폭력을 구체적으로 연상시키는 단어만 더 중립적이고 "
            "추상적인 표현으로 바꿔 같은 형식(쉼표로 이어진 영어 구 "
            "나열)으로 다시 써라. 다른 설명 없이 프롬프트 문장만 응답한다."
        )
        rewritten = call_text(system, scene, model=_PROMPT_HELPER_MODEL, max_tokens=600)
        rewritten = rewritten.strip()
        return rewritten or scene
    except Exception as e:  # noqa: BLE001 — 순화 자체가 실패해도 원본으로 계속 진행
        print(f"[webtoon_image] 프롬프트 순화 실패(원문 유지): {type(e).__name__}: {e}")
        return scene


def generate_cut_image_to_file(
    camera: str,
    scene: str,
    model: str,
    out_path: Path,
    *,
    has_dialogue: bool = True,
    retries: int = 3,
) -> tuple[bool, list | None]:
    """generate_cut_image()의 파일 쓰기 + 배치 재시도(12/24/36초 백오프) 래퍼로,
    pipeline.py(자동 발행)가 쓴다. admin 실험 패널은 bytes만 필요해 generate_cut_image()를 직접 쓴다.

    콘텐츠 필터 거부(위 _soften_scene_for_filter 참고)는 한 번만 순화를
    시도한다 — 순화 후에도 걸리면 원래 재시도 루프(백오프)에 맡긴다."""
    faces_holder: list = [None]
    scene_holder = [scene]
    softened = [False]

    def _once() -> bytes:
        try:
            image_bytes, faces = generate_cut_image(
                camera, scene_holder[0], model,
                has_dialogue=has_dialogue,
            )
        except ValueError as e:
            if "Filter reason: prompt" in str(e) and not softened[0]:
                softened[0] = True
                print("[webtoon_image] 콘텐츠 필터 거부 — 프롬프트 순화 후 재시도")
                scene_holder[0] = _soften_scene_for_filter(scene_holder[0])
                image_bytes, faces = generate_cut_image(
                    camera, scene_holder[0], model,
                    has_dialogue=has_dialogue,
                )
            else:
                raise
        faces_holder[0] = faces
        return image_bytes

    ok = _retry_generate_and_write(_once, out_path, retries)
    return ok, faces_holder[0]
