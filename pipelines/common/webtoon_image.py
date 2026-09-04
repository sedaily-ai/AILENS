"""웹툰 3단계(이미지 생성) 프롬프트 조립 + Bedrock Stable Diffusion 호출.

`pipelines/webtoon/pipeline.py`(프로덕션 자동 발행)와 admin 콘솔의 "이미지
실험" 패널(admin/backend/routes/webtoon_lab.py)이 공용으로 쓴다.

2026-09-05 신설 — admin 콘솔에 웹툰 이미지 생성 실험 패널을 추가하면서
STYLE/FIXED_CHARACTERS/재강조 문구·Bedrock 호출 로직이 admin에도 그대로
필요해졌다. `pipelines/webtoon/pipeline.py`·`prompts.py`에 있던 걸 여기로
옮기고 둘 다 이 모듈을 import해서 쓴다 — 두 곳에 복사하면 오늘 세션
내내 겪은 "복사본 하나만 고치고 하나는 안 고치는" 문제(레터 요약 불릿
파서 버그)가 그대로 재현된다. admin/backend는 Lambda 배포 시 이 파일을
zip에 복사해서 쓴다(`admin/backend/deploy-admin-api.sh` — 이미
`service/backend/common/`을 같은 방식으로 복사하고 있던 패턴을 그대로
따름, 다만 이건 `pipelines/common/`이라 별개 복사 라인이 필요하다).

2026-09-04 — STYLE/FIXED_CHARACTERS를 코드 상수에서 admin DB 발행
구조로 옮겼다("이미지 실험" 패널에서 "이 설정을 실제로 쓰고 싶다"는
피드백). 1·2단계 프롬프트(pipelines/common/ddb_prompt.py가 읽는
`PROMPT#webtoon/published`)와 정확히 같은 패턴 — 여기서는
`PROMPT#webtoon-image/published`를 읽는다. `get_style()`/
`get_fixed_characters()`가 매번 DDB에서 fresh하게 가져온다(캐시 없음 —
admin이 방금 발행한 값을 바로 실험 패널에서도 봐야 하므로 굳이 캐시를
두지 않았다. DDB 단건 read는 admin 트래픽 규모에서 무시할 수준).
DDB에 아직 아무것도 없거나(최초 배포 직후) 조회 자체가 실패하면
`_STYLE_FALLBACK`/`_FIXED_CHARACTERS_FALLBACK`(과거의 하드코딩 값,
2026-09-05~2026-09-04 프로덕션에서 실제로 쓰였던 것)로 조용히
떨어진다 — 절대 이 경로 때문에 웹툰 생성 자체가 죽으면 안 된다.

이전엔 "이 STYLE을 고치면 admin DDB의 '3단계 참고용' 섹션도 손으로 같이
맞출 것"이라는 경고가 있었다(두 저장소가 따로 있어서 어긋나기 쉬웠다,
실제로 여러 번 반영이 누락됨) — 이제 admin이 곧 정본(DDB)이라 그 문제
자체가 없어졌다. 코드를 고치고 싶으면 `_STYLE_FALLBACK`/
`_FIXED_CHARACTERS_FALLBACK`(안전망 값)만 바꾸면 되고, **실제 프로덕션
동작을 바꾸려면 admin "이미지 실험" 패널에서 발행**해야 한다.
"""
from __future__ import annotations

import base64
import json
import re
import time
from pathlib import Path

# ─────────────────────────────────────────────────────────────
# 안전망 기본값 — DDB(PROMPT#webtoon-image/published)를 못 읽을 때만 쓴다.
# 시행착오 이력은 pipelines/webtoon/prompts.py 상단의 "겪었던 문제 1~4"에
# 남아있다. 실제 프로덕션 값을 바꾸려면 이 상수가 아니라 admin "이미지
# 실험" 패널에서 발행할 것 — 위 모듈 docstring 참고.
# ─────────────────────────────────────────────────────────────

_STYLE_FALLBACK = (
    "Modern Korean webtoon illustration — clean, crisp black linework "
    "with confident, uncluttered line weight. Soft cel-shaded coloring "
    "with gentle, restrained shading (not flat single-tone, not heavy "
    "painterly texture — controlled shading that reads clearly at a "
    "glance). This is a hand-illustrated artwork — clearly rendered "
    "with visible linework, NOT a photograph, NOT photorealistic, NOT "
    "camera-captured, NOT 3D-rendered.\n\n"
    "Natural adult character proportions and clear, expressive but NOT "
    "exaggerated eyes and expressions. Professional, editorial mood — "
    "restrained faces; natural body language that reads clearly at a "
    "glance (not exaggerated melodrama — this is a news setting, not "
    "battle drama). Do NOT render in Studio Ghibli style, watercolor "
    "style, storybook/fairy-tale illustration style, or Japanese anime "
    "style. Do NOT render overly young/childlike characters, chibi/SD "
    "proportions, or 3D-rendered characters.\n\n"
    "Contemporary present-day South Korea only — modern office/newsroom "
    "interiors, business-casual or business-formal wardrobe (suits, "
    "blouses, cardigans), modern furniture and electronics. Do NOT "
    "render historical, period (Joseon-era/sageuk), fantasy, or "
    "traditional hanbok clothing or settings under any circumstance.\n\n"
    "Render exactly what [SCENE] describes and nothing more — do not "
    "add extra background crowds, bystanders, or characters beyond what "
    "[SCENE] and [CHARACTERS] specify. If [SCENE] describes an empty "
    "room, render it empty with no people.\n\n"
    "Clean, uncluttered backgrounds — white or light-gray tones, tidy "
    "and orderly, minimal background detail so the characters and any "
    "infographic elements stay the clear focus. Accent color palette "
    "centered on navy blue, sky blue, and red for emphasis elements "
    "(charts, highlights, key colors) — a crisp editorial news-content "
    "look rather than a moody cinematic one.\n\n"
    "Anonymous generic characters only — do NOT render the specific "
    "likeness of any real public figure; faces should read as illustrated "
    "original characters, not a portrait of someone identifiable.\n\n"
    "Any readable text inside a prop (document, poster, screen, chart, "
    "sign, table) must come ONLY from the text explicitly given in this "
    "prompt's [SCENE]/[CAPTION BOX]/[NARRATION]/speech bubble content. "
    "Never invent additional readable text — no invented company names, "
    "prices, dates, phone numbers, or stats. If a prop would otherwise "
    "need text that wasn't given, render it blank, blurred, or angled "
    "away from camera instead of inventing content."
)

_FIXED_CHARACTERS_FALLBACK = {
    "A (여성 기자, 설명자)": (
        "Korean woman, early-to-mid 30s. Chin-length neat black bob "
        "haircut, thin round metal-frame glasses. Navy blazer over a "
        "light sky-blue blouse/shirt. Small white circular enamel badge "
        "on the left chest of the blazer with a simple blue stylized "
        "'S' monogram (a news outlet logo badge) — keep the badge small "
        "and consistent, never oversized, never add any other text or "
        "logo. Friendly but professional demeanor — actively gestures "
        "while explaining: pointing at documents/charts, open palm "
        "gestures, leaning toward materials. Keep face, hairstyle, "
        "glasses, and outfit IDENTICAL across every cut."
    ),
    "B (남성 청자)": (
        "Korean man, late 20s. Natural short black hair, no glasses. "
        "White t-shirt under a dark gray cardigan. No badge, no logo of "
        "any kind. Represents the reader's curiosity — reacts to what's "
        "being explained: leaning in to look at materials, tilting "
        "forward, resting chin on hand while thinking, looking "
        "surprised or curious as the scene calls for. Keep face, "
        "hairstyle, and outfit IDENTICAL across every cut."
    ),
}

SCENE_REINFORCEMENT = (
    "\n\nSTRICT: Render exactly the scene above — modern present-day "
    "setting, no historical/period/fantasy clothing, no extra crowds or "
    "characters beyond what [SCENE]/[CHARACTERS] specify."
)

CHARACTER_REINFORCEMENT = (
    "\n\nSTRICT: The two people above are RECURRING hosts, not one-off "
    "K-drama/idol characters — render them with the EXACT hairstyle, hair "
    "length, glasses, outfit, and badge described in [CHARACTERS], not a "
    "generic long-haired romance-webtoon look. Every cut must show the "
    "SAME two faces/hairstyles/outfits as each other, matching "
    "[CHARACTERS] exactly — do not substitute, restyle, or omit any "
    "described feature (glasses, badge, hair length)."
)


def characters_block(characters: dict | None) -> str:
    """인물 묘사를 [CHARACTERS] 블록으로 직렬화한다."""
    if not characters:
        return ""
    lines = [f"{k}: {v}" for k, v in characters.items()]
    return "\n\n[CHARACTERS — keep consistent across all cuts]\n" + "\n".join(lines)


# ─────────────────────────────────────────────────────────────
# admin DB 발행 문서 — PROMPT#webtoon-image/published (2026-09-04)
# ─────────────────────────────────────────────────────────────
#
# admin/backend/routes/prompts.py::handle_update 는 category/name 이
# 무엇이든 받는 범용 라우트라 새 백엔드 라우트 없이 그대로 재사용한다
# (`POST /admin/prompts/webtoon-image/published`, WebtoonImageLab.tsx의
# "발행" 버튼이 부른다). content 는 그 라우트가 있는 그대로 저장하는
# 산문 한 덩어리라 STYLE/두 캐릭터 3개를 아래 헤딩 포맷으로 합쳐 넣고,
# 여기서 다시 파싱해 꺼낸다. sections_json 은 안 보낸다(이 문서는
# PromptDrawer의 설명/지침/파일 3섹션 모델과 안 맞는 별개 구조라
# 편집기가 다르다 — sections 가 없으면 프롬프트 드로어가 content 전체를
# 한 섹션으로 보여주는데, 이 카테고리는 애초에 PromptDrawer로 안 연다).
_DOC_HEADINGS = ("STYLE", "CHARACTER_FEMALE", "CHARACTER_MALE")
_DOC_HEADING_RE = re.compile(r"^##\s+(STYLE|CHARACTER_FEMALE|CHARACTER_MALE)\s*$")


def serialize_prompt_doc(style: str, char_female: str, char_male: str) -> str:
    """세 값 → DDB에 저장할 content 문자열. `parse_prompt_doc`의 역함수."""
    parts = dict(zip(_DOC_HEADINGS, (style.strip(), char_female.strip(), char_male.strip())))
    return "\n\n".join(f"## {h}\n{parts[h]}" for h in _DOC_HEADINGS)


def parse_prompt_doc(content: str) -> tuple[str, str, str]:
    """content 문자열 → (style, char_female, char_male). 헤딩 형식이 예상과
    다르면(빈 값 포함) ValueError — 호출부가 안전망 기본값으로 폴백한다."""
    buckets: dict[str, list[str]] = {h: [] for h in _DOC_HEADINGS}
    current: str | None = None
    for line in content.split("\n"):
        m = _DOC_HEADING_RE.match(line.strip())
        if m:
            current = m.group(1)
            continue
        if current:
            buckets[current].append(line)
    style, female, male = (("\n".join(buckets[h])).strip() for h in _DOC_HEADINGS)
    if not style or not female or not male:
        raise ValueError(
            "webtoon-image/published 문서 형식이 예상과 다름 "
            "(## STYLE / ## CHARACTER_FEMALE / ## CHARACTER_MALE 헤딩 필요)"
        )
    return style, female, male


def _load_prompt_doc() -> tuple[str, str, str]:
    """DDB(PROMPT#webtoon-image/published)에서 fresh하게 읽는다 — 캐시 없음
    (모듈 docstring 참고). 실패하면 안전망 기본값으로 조용히 폴백한다."""
    try:
        import ddb_prompt  # pipelines/common/ 내 sibling — flat import

        content = ddb_prompt.load_prompt("webtoon-image", "published")
        return parse_prompt_doc(content)
    except Exception as e:  # noqa: BLE001 — 웹툰 생성 자체를 절대 막으면 안 됨
        print(
            f"[webtoon_image] webtoon-image/published 로드 실패"
            f"({type(e).__name__}: {e}) — 코드 내 안전망 기본값 사용"
        )
        return (
            _STYLE_FALLBACK,
            _FIXED_CHARACTERS_FALLBACK["A (여성 기자, 설명자)"],
            _FIXED_CHARACTERS_FALLBACK["B (남성 청자)"],
        )


def get_style() -> str:
    style, _female, _male = _load_prompt_doc()
    return style


def get_fixed_characters() -> dict:
    _style, female, male = _load_prompt_doc()
    return {"A (여성 기자, 설명자)": female, "B (남성 청자)": male}


def build_background_prompt(
    camera: str,
    scene: str,
    characters: dict | None = None,
    *,
    style: str | None = None,
    include_scene_reinforcement: bool = True,
    include_character_reinforcement: bool = True,
) -> str:
    """Bedrock 경로 전용 — 텍스트(말풍선/캡션/내레이션) 지침 없이 스타일+장면만.
    확산 모델이 요청 안 한 글자를 그림에 멋대로 채워넣는 걸 막기 위해 명시적으로
    금지 문구도 붙인다(합성은 compose_text.py가 나중에 한다).

    style/include_*_reinforcement — admin 실험 패널이 발행된 기본값을 바꿔서
    시도해볼 수 있게 하는 파라미터. style=None(기본)이면 admin이 발행한 최신
    값을 DDB에서 그대로 읽는다 — 예전엔 import 시점에 고정된 상수를 기본값
    으로 썼는데, 그러면 admin에서 새로 발행해도 이미 로드된 프로세스는 옛
    값을 계속 썼다(파라미터 기본값은 함수 정의 시점에 딱 한 번 평가되므로).
    이제는 매 호출마다 get_style()을 불러 항상 최신값을 쓴다."""
    if style is None:
        style = get_style()
    style_block = style + f"\nCamera: {camera}. 3:2 horizontal."
    return (
        style_block + characters_block(characters) + f"\n\n[SCENE]\n{scene}"
        + (SCENE_REINFORCEMENT if include_scene_reinforcement else "")
        + (CHARACTER_REINFORCEMENT if (characters and include_character_reinforcement) else "")
        + "\n\nCRITICAL: Do NOT render any text, letters, writing, signage text, "
        "or speech bubbles anywhere in this image — pure illustration only, no "
        "readable characters of any kind. Text will be added separately afterward."
    )


# ─────────────────────────────────────────────────────────────
# Bedrock Stable Image Core 호출
# ─────────────────────────────────────────────────────────────

BEDROCK_IMAGE_REGION = "us-west-2"  # us-east-1엔 살아있는 순수 text-to-image 모델이 없음(Nova Canvas만 있는데 막힘)
# 2026-08-28 — 베어 모델 ID 직호출을 application inference profile로 교체했다.
# 베어(`stability.stable-image-core-v1:1`)로 부르면 비용할당태그가 붙을 자리가 없어
# 청구 데이터에서 전량 `Not Applicable`로 샌다(BillingON 실측 8/18~8/26 $33.08,
# 월 약 $110). 태그는 소급되지 않으므로 지난 발생분은 복구 불가다.
# 프로파일 태그: Service=atlas4 · Project=Sedaily-LENS · Workload=webtoon-image.
# 2026-09-30 이후 Service를 lens로 원복 — docs/architecture/비용태깅_규칙.md 참고.
BEDROCK_IMAGE_MODEL_ID = "arn:aws:bedrock:us-west-2:887078546492:application-inference-profile/5jauvzgplsjx"  # lens-webtoon-image-stable-core → stability.stable-image-core-v1:1
BEDROCK_ASPECT_RATIO = "3:2"

_bedrock_image_client = None


def _get_bedrock_image_client():
    global _bedrock_image_client
    if _bedrock_image_client is None:
        import boto3  # noqa: lazy — admin Lambda에도 boto3는 항상 있지만, 이 모듈을 import만 하고
        # 실제 생성은 안 하는 경로(예: 프롬프트 미리보기만 만드는 곳)에서 불필요한
        # 클라이언트 초기화 비용을 피한다.
        _bedrock_image_client = boto3.client("bedrock-runtime", region_name=BEDROCK_IMAGE_REGION)
    return _bedrock_image_client


def generate_bedrock_image_bytes(prompt: str) -> bytes:
    """Stable Image Core(Bedrock) 1회 호출 — 성공하면 PNG bytes 반환,
    실패하면 예외를 던진다. 재시도는 호출부 책임이다 — 파일에 쓰는 배치
    파이프라인(pipeline.py)과 즉시 상태를 보고해야 하는 admin 실험 도구가
    재시도 전략(횟수·대기시간·부분 실패 보고)이 달라서 여기서 강제하지
    않는다."""
    body = json.dumps({
        "prompt": prompt[:9500],  # Stability 프롬프트 상한(~1만자) 여유 두고 컷
        "aspect_ratio": BEDROCK_ASPECT_RATIO,
        "output_format": "png",
    })
    resp = _get_bedrock_image_client().invoke_model(modelId=BEDROCK_IMAGE_MODEL_ID, body=body)
    payload = json.loads(resp["body"].read())
    images = payload.get("images") or []
    if not images:
        raise ValueError(f"응답에 이미지 없음: {payload.get('finish_reasons')}")
    return base64.b64decode(images[0])


def generate_bedrock_image(prompt: str, out_path: Path, retries: int = 3) -> bool:
    """`generate_bedrock_image_bytes()`의 파일-쓰기 + 재시도 래퍼 —
    pipeline.py가 기존에 쓰던 `generate_image_bedrock()`과 동일한 계약
    (성공 시 out_path에 파일 쓰고 True, 실패 시 False, 지수 백오프
    재시도)이라 pipeline.py 쪽 호출부는 이 함수로 바꿔 꽂기만 하면 된다."""
    for attempt in range(retries):
        try:
            data = generate_bedrock_image_bytes(prompt)
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
