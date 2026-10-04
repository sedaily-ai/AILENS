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
    "Modern Korean webtoon illustration — FULL COLOR, vivid and "
    "saturated. Clean, crisp black linework with confident, uncluttered "
    "line weight. Soft cel-shaded coloring with gentle, restrained "
    "shading (not flat single-tone, not heavy painterly texture — "
    "controlled shading that reads clearly at a glance). This is a "
    "hand-illustrated artwork — clearly rendered with visible linework, "
    "NOT a photograph, NOT photorealistic, NOT camera-captured, NOT "
    "3D-rendered.\n\n"
    "CRITICAL — always full color: skin tones, hair color, clothing "
    "colors, and background colors must all be rendered in natural "
    "full color. Do NOT render in grayscale, black-and-white, "
    "monochrome, sepia, pencil sketch, or line-art-only style under "
    "any circumstance.\n\n"
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
    # 2026-09-08 3차 — 안경/단발/배지 등 작은 액세서리 지시는 확산 모델이
    # 실측으로 안 지켰다(prompts.py "겪었던 문제 4" 참고). 사용자가 공유한
    # 참고 샘플에 맞춰 "머리 길이·색상·복장 실루엣" 같은 큰 특징 위주로
    # 다시 썼다 — DDB(webtoon-image/published v4)와 동일 내용.
    "A (여성 기자, 설명자)": (
        "Korean woman, mid-20s to early-30s. Long wavy dark brown hair "
        "past the shoulders, center or slight side part, no glasses, "
        "no visible badge or logo. Wears a dark navy or charcoal "
        "blazer/coat over a simple light-colored top. Warm, approachable "
        "but professional expression — actively gestures while "
        "explaining: pointing at documents/charts, open palm gestures, "
        "leaning toward materials, sometimes holding a tablet or "
        "folder. Keep hair length, hair color, and overall outfit "
        "silhouette consistent across every cut — do not switch to "
        "short hair, a bob cut, or glasses."
    ),
    "B (남성 청자)": (
        "Korean man, mid-to-late 20s. Short black hair, slightly "
        "tousled/textured on top, no glasses. Wears a dark casual "
        "jacket or blazer over a simple shirt or t-shirt — "
        "smart-casual, not a formal suit. Represents the reader's "
        "curiosity — reacts to what's being explained: leaning in to "
        "look at materials, tilting forward, resting chin on hand "
        "while thinking, looking surprised or curious as the scene "
        "calls for. Keep hair style and overall outfit silhouette "
        "consistent across every cut."
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
# 산문 한 덩어리라 STYLE/두 캐릭터/모델 4개를 아래 헤딩 포맷으로 합쳐
# 넣고, 여기서 다시 파싱해 꺼낸다. sections_json 은 안 보낸다(이 문서는
# PromptDrawer의 설명/지침/파일 3섹션 모델과 안 맞는 별개 구조라
# 편집기가 다르다 — sections 가 없으면 프롬프트 드로어가 content 전체를
# 한 섹션으로 보여주는데, 이 카테고리는 애초에 PromptDrawer로 안 연다).
#
# IMAGE_MODEL(2026-09-20 추가, 정리후보 A 후속) — "관리자가 CMS에서
# 저장하면 다음 발행부터 자동 반영"을 실제 발행 파이프라인의 모델
# 선택까지 확장한 것. STYLE/CHARACTER_*와 같은 방식(DDB fresh read,
# 실패 시 코드 기본값 폴백)이지만 하위호환을 위해 **필수는 아니다** —
# 이 헤딩이 아예 없는 옛 발행 문서(오늘 이전에 저장된 것)를 만나도
# ValueError를 던지지 않고 _DEFAULT_IMAGE_MODEL로 조용히 채운다(STYLE/
# CHARACTER_*가 비어 있는 건 여전히 에러 — 그건 정말 문서가 깨진
# 경우다). 값은 pipeline.py::_PROVIDER_CONFIG·admin
# webtoonImageModels.ts의 IMAGE_MODELS[].id와 같은 어휘를 쓴다
# ("sd_ultra"/"stable_image_core"/"sd35_large").
#
# 2026-09-25, 사용자 결정 — "pipeline"(GPU IP-Adapter+Style Transfer)과
# "style_guide"(레퍼런스 이미지 화풍)를 뺐다. 둘 다 실제로는 쓰이고
# 있지 않았다(발행 문서에 IMAGE_MODEL 자체가 없어 sd_ultra로 계속
# 폴백 중이었음, get_active_image_model() 참고) — "사용하지 않으면
# 삭제" 결정에 따라 GPU 경로(_generate_cut_once의 두 분기, gpu_ipadapter.py
# 전체, GPU EC2 인스턴스·IAM)까지 같이 걷어냈다. style_guide가 쓰던
# build_style_guide_prompt()는 nova_canvas가 그대로 재사용하므로 남겨뒀다
# (_generate_cut_once의 nova_canvas 분기 참고).
_DOC_HEADINGS = ("STYLE", "CHARACTER_FEMALE", "CHARACTER_MALE", "IMAGE_MODEL")
# 2026-10-02 — 말풍선 얼굴 회피(Rekognition) 켜기/끄기. 네 값 튜플(parse_prompt_doc)에는 섞지 않고 별도 함수(get_bubble_detect)로 읽는다.
_BUBBLE_DETECT_HEADING = "BUBBLE_DETECT"
_BUBBLE_STYLE_HEADING = "BUBBLE_STYLE"  # 웹툰식 말풍선(타원·얇은 선·여백) on/off
_DOC_HEADING_RE = re.compile(r"^##\s+(STYLE|CHARACTER_FEMALE|CHARACTER_MALE|IMAGE_MODEL|BUBBLE_DETECT|BUBBLE_STYLE)\s*$")

_DEFAULT_IMAGE_MODEL = "sd_ultra"  # 2026-09-20 결정 — "GPU를 꼭 써야할까요?" 이후 admin 기본값과 동일
_VALID_IMAGE_MODELS = ("sd_ultra", "stable_image_core", "sd35_large")


def serialize_prompt_doc(style: str, char_female: str, char_male: str, image_model: str = "", bubble_detect: bool | None = None, bubble_style: bool | None = None) -> str:
    """네 값 → DDB에 저장할 content 문자열. `parse_prompt_doc`의 역함수.
    image_model 생략 시(빈 문자열) IMAGE_MODEL 섹션 자체를 안 쓴다 —
    아직 이 설정을 모르는 옛 화면(WebtoonImageLab.tsx 구버전 등)이
    실수로 발행해도 다른 관리자가 고른 모델을 조용히 지우지 않는다."""
    parts = dict(zip(_DOC_HEADINGS[:3], (style.strip(), char_female.strip(), char_male.strip())))
    chunks = [f"## {h}\n{parts[h]}" for h in _DOC_HEADINGS[:3]]
    if image_model.strip():
        chunks.append(f"## IMAGE_MODEL\n{image_model.strip()}")
    if bubble_detect is not None:
        chunks.append(f"## {_BUBBLE_DETECT_HEADING}\n{'on' if bubble_detect else 'off'}")
    if bubble_style is not None:
        chunks.append(f"## {_BUBBLE_STYLE_HEADING}\n{'on' if bubble_style else 'off'}")
    return "\n\n".join(chunks)


def parse_prompt_doc(content: str) -> tuple[str, str, str, str]:
    """content 문자열 → (style, char_female, char_male, image_model). STYLE/
    CHARACTER_* 헤딩 형식이 예상과 다르면(빈 값 포함) ValueError — 호출부가
    안전망 기본값으로 폴백한다. IMAGE_MODEL은 없거나 모르는 값이면 빈
    문자열을 반환(필수 아님, 호출부가 _DEFAULT_IMAGE_MODEL로 채운다)."""
    buckets: dict[str, list[str]] = {h: [] for h in (*_DOC_HEADINGS, _BUBBLE_DETECT_HEADING, _BUBBLE_STYLE_HEADING)}
    current: str | None = None
    for line in content.split("\n"):
        m = _DOC_HEADING_RE.match(line.strip())
        if m:
            current = m.group(1)
            continue
        if current:
            buckets[current].append(line)
    style, female, male, image_model = (("\n".join(buckets[h])).strip() for h in _DOC_HEADINGS)
    if not style or not female or not male:
        raise ValueError(
            "webtoon-image/published 문서 형식이 예상과 다름 "
            "(## STYLE / ## CHARACTER_FEMALE / ## CHARACTER_MALE 헤딩 필요)"
        )
    if image_model not in _VALID_IMAGE_MODELS:
        image_model = ""
    return style, female, male, image_model


def parse_bubble_detect(content: str) -> bool:
    """발행 문서의 ## BUBBLE_DETECT 섹션이 on이면 True. 섹션이 없거나 다른 값이면 False(기본 꺼짐 — 비용이 드는 기능이라 명시적으로 켠 경우만)."""
    m = re.search(r"^##\s+BUBBLE_DETECT\s*\n\s*(\w+)", content, flags=re.MULTILINE)
    return bool(m and m.group(1).lower() == "on")


def parse_bubble_style(content: str) -> bool:
    """발행 문서의 ## BUBBLE_STYLE이 on이면 True(웹툰식 말풍선). 없거나 다른 값이면 False(기본 — 기존 스타일)."""
    m = re.search(r"^##\s+BUBBLE_STYLE\s*\n\s*(\w+)", content, flags=re.MULTILINE)
    return bool(m and m.group(1).lower() == "on")


def get_bubble_style() -> bool:
    try:
        import ddb_prompt  # pipelines/common/ 내 sibling — flat import

        return parse_bubble_style(ddb_prompt.load_prompt("webtoon-image", "published"))
    except Exception as e:  # noqa: BLE001 — 웹툰 생성을 막으면 안 됨
        print(f"[webtoon_image] bubble_style 로드 실패({type(e).__name__}) — 기존 스타일로 진행")
        return False


def get_bubble_detect() -> bool:
    """실제 발행 파이프라인·CMS 컷 생성이 말풍선 배치에 Rekognition(사람·얼굴 위치)을 쓸지. 읽기 실패는 False(고정 배치로 진행)."""
    try:
        import ddb_prompt  # pipelines/common/ 내 sibling — flat import

        return parse_bubble_detect(ddb_prompt.load_prompt("webtoon-image", "published"))
    except Exception as e:  # noqa: BLE001 — 웹툰 생성을 막으면 안 됨
        print(f"[webtoon_image] bubble_detect 로드 실패({type(e).__name__}) — 꺼짐으로 진행")
        return False


def _load_prompt_doc() -> tuple[str, str, str, str]:
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
            "",
        )


def get_style() -> str:
    style, _female, _male, _model = _load_prompt_doc()
    return style


def get_fixed_characters() -> dict:
    _style, female, male, _model = _load_prompt_doc()
    return {"A (여성 기자, 설명자)": female, "B (남성 청자)": male}


def get_active_image_model() -> str:
    """실제 발행 파이프라인(pipeline.py)이 지금 써야 할 이미지 모델 id.
    admin이 발행한 값을 매번 fresh하게 읽는다(캐시 없음, get_style()과
    같은 이유) — 관리자가 저장하면 재배포 없이 다음 컷 생성부터 반영된다."""
    _style, _female, _male, model = _load_prompt_doc()
    return model or _DEFAULT_IMAGE_MODEL


def get_image_settings() -> tuple[str, dict, str]:
    """(style, fixed_characters, active_image_model) 세 값을 DDB 조회
    **한 번**으로 전부 얻는다. 2026-09-20 admin/backend/routes/webtoon/
    generate.py::handle_defaults()가 이 세 값을 동시에 다 보여줘야
    하는데, get_style()/get_fixed_characters()/get_active_image_model()을
    각각 부르면 같은 webtoon-image/published 문서를 세 번(캐시가 없으므로
    실제로 세 번 다 네트워크 왕복) 읽는 꼴이었다 — "프롬프트 실험 페이지
    로딩이 느리다" 신고로 발견. 한 값만 필요한 다른 호출부(예:
    _generate_cut_once의 get_style() 단독 호출)는 그대로 개별 함수를
    쓴다 — 거기선 한 번만 읽으니 합칠 이유가 없다."""
    style, female, male, model = _load_prompt_doc()
    characters = {"A (여성 기자, 설명자)": female, "B (남성 청자)": male}
    return style, characters, (model or _DEFAULT_IMAGE_MODEL)



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
    이제는 매 호출마다 get_style()을 불러 항상 최신값을 쓴다. style=""
    (빈 문자열, None과 다름)을 명시하면 이 fetch 자체를 건너뛰고 화풍
    지침 없이 camera/[SCENE]만으로 프롬프트를 만든다 — _generate_cut_once()
    의 stable_image_core/sd35_large/sd_ultra가 2026-09-20부터 이렇게 쓴다."""
    if style is None:
        style = get_style()
    style_block = f"{style}\n" if style else ""
    style_block += f"Camera: {camera}. 3:2 horizontal."
    return (
        style_block + characters_block(characters) + f"\n\n[SCENE]\n{scene}"
        + (SCENE_REINFORCEMENT if include_scene_reinforcement else "")
        + (CHARACTER_REINFORCEMENT if (characters and include_character_reinforcement) else "")
        + "\n\nCRITICAL: Do NOT render any text, letters, writing, signage text, "
        "or speech bubbles anywhere in this image — pure illustration only, no "
        "readable characters of any kind. Text will be added separately afterward."
    )


# 2026-09-20 — build_scene_first_prompt()(2026-09-18 신설, SD3 계열이
# build_background_prompt의 인물 재강조 문구를 인물 컨셉시트 요청으로
# 오해석하는 문제의 실험적 대안)를 삭제했다. admin 실험 패널(_generate_once)
# 이 이제 stable_image_core/sd35_large/sd_ultra에 인물 고정·재강조 자체를
# 아예 안 넣기로 하면서(사용자 요청 — "단순하게 사용자가 입력한 이미지
# 프롬프트로만 제어가 되도록") 이 함수가 풀려던 문제 자체가 없어졌다 —
# 검증 전 상태로 남겨두면 나중에 헷갈릴 죽은 코드라 같이 정리한다.


# 2026-09-08 — Style Guide 경로 전용 프롬프트 조립.
#
# ⚠️ 실측으로 확인한 함정: 참고 이미지(STYLE_REFERENCE_IMAGE_PATH)만 넣으면
# 화풍이 안 지켜진다. 처음 두 번의 수동 테스트(단순한 1~2문장 프롬프트 +
# "flat cel-shaded webtoon" 문구 포함)는 성공했는데, 그대로 파이프라인에
# 옮기면서 그 문구를 "이미지가 알아서 전달하겠지"라며 빼고 대신
# characters_block(긴 인물 묘사)+CHARACTER_REINFORCEMENT+SCENE_REINFORCEMENT
# 를 다 붙였더니 결과가 반실사 사진으로 되돌아갔다(실측: 컷1·4 전부 스튜디오
# 사진처럼 나옴). fidelity를 0.5→0.75로 올려도 안 고쳐지고 오히려 더
# 사진스러워졌다 — 참고 이미지의 "사진 같은 스튜디오 조명" 요소까지 같이
# 강하게 전이된 것으로 추정. 원인을 좁히려고 단일 컷 테스트를 반복한 끝에,
# **"flat cel-shaded webtoon, NOT photorealistic" 문구를 프롬프트 맨 앞에
# 명시하고 나머지를 짧게 유지**하니 다시 원하는 화풍으로 돌아왔다(인물 2명·
# 인포그래픽 화면까지 정상). 결론: 참고 이미지는 화풍의 "보조" 앵커일 뿐,
# 텍스트로 명시한 스타일 지시를 대신하지 못한다 — 항상 같이 써야 한다.
#
# 그래서 이 함수는 build_background_prompt()보다 훨씬 짧게 유지한다:
# 스타일 힌트(한 줄) + 카메라 + [SCENE] + 짧은 내용 규칙 + 텍스트 렌더
# 금지. characters_block/CHARACTER_REINFORCEMENT(인물 세부 외형 재강조,
# 문단 단위)는 일부러 안 쓴다 — 참고 이미지가 이미 인물 톤을 앵커하고
# 있어서, 장문의 인물 묘사를 더 얹으면 위 문제가 재현된다.
#
# 2026-09-08(2차, 독자 관점 피드백 "이 사람 누구야?" 대응) — 단, 성별
# 정보는 완전히 빠뜨리면 안 된다는 게 실측으로 드러났다. 2단계 장면
# 텍스트가 "A(청재킷)/B(짙은 남색 셔츠)"처럼 옷차림만 라벨링하고 성별
# 단어 자체가 없는데(1단계 script의 characters.A="...여성...",
# characters.B="...남성..."이 있어도 3단계 프롬프트엔 안 실림 — 애초에
# 이 파이프라인은 기사마다 새로 짓는 그 인물 묘사 대신 고정 진행자
# 2인을 쓰기로 한 설계라 pipeline.py가 이 값을 아예 안 넘긴다), 참고
# 이미지 안에서 "A가 어느 쪽 인물인지" 판단할 근거가 하나도 없어서
# 여성만 3명 나오거나 남성이 아예 안 나오는 등 인물 구성이 컷마다
# 흔들렸다(라운드기록.md #15). "A는 여성, B는 남성"이라는 한 줄만
# 추가했더니(문단 단위 재강조가 아니라 짧은 역할 매핑 한 줄) 화풍
# 훼손 없이 남녀 둘 다 안정적으로 나오는 걸 확인 — 이 한 줄만 추가한다.
# 2026-09-16 — 예전엔 이 자리가 코드에 박힌 고정 문구(_STYLE_GUIDE_STYLE_HINT)
# 였다. admin이 "화풍" 필드를 편집·발행해도 이 문구가 그대로 쓰여서, 화면에서
# 보이지 않는 별도 텍스트가 실제 생성을 통제하고 있었다 — "관리자가 화면에서
# 저장한 프롬프트만이 생성을 통제해야 한다"는 원칙 위반. 이제 get_style()
# (admin이 저장한 실제 STYLE 텍스트)을 그대로 쓴다. 성별 역할 매핑 한 줄
# ("A는 여성, B는 남성")만 별도로 유지하는 이유는 build_style_guide_prompt()
# 주석 참고 — 이건 "화풍" 내용이 아니라 참고 이미지 속 어느 쪽이 A/B인지
# 알려주는 구조적 배선이라 admin 편집 대상이 아니다.
_STYLE_AB_ROLE_LINE = " Two recurring characters from the reference image: A is the woman, B is the man."


def _style_hint_from_db() -> str:
    return get_style() + _STYLE_AB_ROLE_LINE

_STYLE_GUIDE_CONTENT_RULES = (
    "Contemporary present-day South Korea only — do NOT render historical, "
    "period, fantasy, or traditional hanbok clothing or settings. Do NOT "
    "render the likeness of any real public figure, and do NOT render real "
    "corporate logos, trademarks, or institutional insignia. Render exactly "
    "what [SCENE] describes and nothing more — no extra background crowds "
    "or characters beyond what [SCENE] specifies."
)

def build_style_guide_prompt(camera: str, scene: str) -> str:
    """Style Guide 경로 전용 프롬프트 — 위 실측 결과를 따라 일부러
    짧게 유지한다(스타일 힌트+성별 역할 한 줄 + 카메라 + 장면 + 내용
    규칙 + 텍스트 렌더 금지뿐). characters 파라미터를 여전히 안 받는
    이유(장문 묘사 배제)는 위 주석 참고 — 성별 역할 매핑만
    _STYLE_AB_ROLE_LINE으로 별도 고정한다."""
    return (
        _style_hint_from_db()
        + f"\nCamera: {camera}."
        + f"\n\n[SCENE]\n{scene}"
        + f"\n\n{_STYLE_GUIDE_CONTENT_RULES}"
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


_TRANSIENT_BEDROCK_ERRORS = (
    "ServiceUnavailableException",
    "ThrottlingException",
    "ModelTimeoutException",
    "InternalServerException",
)
_TRANSIENT_RETRY_ATTEMPTS = 3
_TRANSIENT_RETRY_WAIT_S = 2  # 짧게 — "출력속도가 중요하다"(2026-09-18) 요청과 같은 방향


def _invoke_and_decode_image(client, model_id: str, body: str, *, error_key: str = "finish_reasons") -> bytes:
    """이 모듈의 이미지 생성 함수(Stable Image Core/Style Guide/Style
    Transfer/Remove Background/Nova Canvas 등) 9곳이 전부 같은 뒷부분을
    반복했다 — invoke_model → payload.images[0] 파싱 → 없으면 에러.
    client/modelId/요청 body 조립은 호출부 책임으로 남기고, 이 공통
    뒷부분만 통일한다. error_key — 실패 시 원인을 어느 필드에서 읽을지
    (Stability 계열은 "finish_reasons", Nova Canvas는 "error").

    2026-09-18 버그 수정 — Bedrock이 일시적으로 503(ServiceUnavailableException)을
    던진 경우가 하나도 재시도 없이 그대로 컷 전체를 실패시켰다(실제
    사고: remove_background_bytes 호출 중 1회 발생, "출력속도가 중요"한
    사용자 요청과 상충하지 않게 2초×3회의 짧은 재시도만 추가 — 위
    _retry_generate_and_write의 12/24/36초 백오프는 배치 파이프라인용으로
    너무 느려 여기엔 안 맞는다). 재시도로도 안 풀리는 실제 오류(잘못된
    body 등)는 그대로 즉시 올라간다."""
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
    return _invoke_and_decode_image(_get_bedrock_image_client(), BEDROCK_IMAGE_MODEL_ID, body)


# ─────────────────────────────────────────────────────────────
# Bedrock Stable Diffusion 3.5 Large 호출 (2026-09-18 신설)
# ─────────────────────────────────────────────────────────────
# Stable Image Core보다 최신 세대(SD3.5) 모델 — 사용자 요청("aws 에서
# 모델 추가되면 좋겠어요")으로 추가. Stable Image Core와 같은 응답
# 스키마(_invoke_and_decode_image 재사용)지만 "mode": "text-to-image"가
# 필수 필드로 붙는다(SD3 계열은 같은 엔드포인트로 image-to-image도
# 받기 때문 — 여긴 텍스트 전용 고정). us-east-1엔 없고 us-west-2에만
# 있다(BEDROCK_IMAGE_REGION과 동일 — 위 주석 참고).
# 프로파일 태그: Service=atlas4 · Project=Sedaily-LENS · Workload=webtoon-image
# (BEDROCK_IMAGE_MODEL_ID와 동일 태깅 정책 — 비용태깅_규칙.md 참고).
SD35_LARGE_MODEL_ID = "arn:aws:bedrock:us-west-2:887078546492:application-inference-profile/52u16muojn2u"  # lens-webtoon-image-sd35-large → stability.sd3-5-large-v1:0


def generate_bedrock_sd35_image_bytes(prompt: str) -> bytes:
    """Stable Diffusion 3.5 Large(Bedrock) 1회 호출 — generate_bedrock_image_bytes와
    계약 동일(성공 시 PNG bytes 반환, 실패 시 예외), 재시도는 호출부 책임."""
    body = json.dumps({
        "prompt": prompt[:9500],
        "mode": "text-to-image",
        "aspect_ratio": BEDROCK_ASPECT_RATIO,
        "output_format": "png",
    })
    return _invoke_and_decode_image(_get_bedrock_image_client(), SD35_LARGE_MODEL_ID, body)


# ─────────────────────────────────────────────────────────────
# Bedrock Stable Image Ultra 호출 (2026-09-18 신설)
# ─────────────────────────────────────────────────────────────
# Stability AI 라인업 중 최상위 품질 등급 — 사용자 요청("gpt 와 동일한
# 퀄리티로 나오면 제일 좋은뎅")으로 실측 비교(us-west-2, 동일 프롬프트)
# 후 추가. Stable Image Core와 요청 스키마 동일(mode 불필요 — SD3.5
# Large와 다름, Ultra는 Core 계열 엔드포인트).
# 프로파일 태그: Service=atlas4 · Project=Sedaily-LENS · Workload=webtoon-image
# (BEDROCK_IMAGE_MODEL_ID와 동일 태깅 정책 — 비용태깅_규칙.md 참고).
SD_ULTRA_MODEL_ID = "arn:aws:bedrock:us-west-2:887078546492:application-inference-profile/htvjnctxyvs1"  # lens-webtoon-image-sd-ultra → stability.stable-image-ultra-v1:1


# 2026-10-02(QA 요청서 3번) — 그림에 글자·말풍선이 멋대로 들어가는 걸 막는 금지어는 프롬프트 본문 대신
# 모델의 negative_prompt 필드로도 보낸다(본문의 CRITICAL 문구는 그대로 둔다 — 둘 다 해서 손해 없음).
ULTRA_NEGATIVE_PROMPT = "text, letters, words, writing, speech bubble, caption, subtitle, watermark, logo, signature"

# 기사 단위 seed — pipeline.run_article이 기사마다 한 번 정해 넣는다(None이면 모델이 무작위로 정함).
# 같은 기사의 컷 8장이 같은 seed를 쓰면 노이즈 출발점이 같아 분위기가 조금 더 비슷해지고,
# 값이 기록되므로 같은 조건으로 한 컷만 다시 뽑을 수 있다. 비용 변화 없음.
_run_seed: int | None = None


# 스크립트(프롬프트 v31)가 기사별로 내는 "negative_prompt" — 있으면 공통 금지어 뒤에 덧붙인다(없으면 공통 금지어만).
_run_negative: str = ""


def set_run_negative(text: str | None) -> None:
    global _run_negative
    _run_negative = (text or "").strip()


def set_run_seed(seed: int | None) -> None:
    global _run_seed
    _run_seed = seed


def get_run_seed() -> int | None:
    return _run_seed


def generate_bedrock_sd_ultra_image_bytes(prompt: str) -> bytes:
    """Stable Image Ultra(Bedrock) 1회 호출 — generate_bedrock_image_bytes와
    계약 동일(성공 시 PNG bytes 반환, 실패 시 예외), 재시도는 호출부 책임.
    Ultra는 image-to-image를 지원하지 않는다(2026-10-02 실호출 확인: "Model ultra does not support image-to-image mode")."""
    req = {
        "prompt": prompt[:9500],
        "negative_prompt": f"{ULTRA_NEGATIVE_PROMPT}, {_run_negative}"[:9500] if _run_negative else ULTRA_NEGATIVE_PROMPT,
        "aspect_ratio": BEDROCK_ASPECT_RATIO,
        "output_format": "png",
    }
    if _run_seed is not None:
        req["seed"] = _run_seed
    return _invoke_and_decode_image(_get_bedrock_image_client(), SD_ULTRA_MODEL_ID, json.dumps(req))


def _retry_generate_and_write(bytes_fn, out_path: Path, retries: int) -> bool:
    """공통 재시도 + 파일-쓰기 래퍼 — 모델별 generate_bedrock_*_image() 함수들은
    실제 생성 호출(bytes_fn)만 다르고 재시도 로직(지수 백오프 12/24/36초,
    실패 로그)은 완전히 같아서 2026-09-08 Style Guide 추가 때 중복되던
    걸 추출했다."""
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


def generate_bedrock_image(prompt: str, out_path: Path, retries: int = 3) -> bool:
    """`generate_bedrock_image_bytes()`의 파일-쓰기 + 재시도 래퍼 —
    pipeline.py가 기존에 쓰던 `generate_image_bedrock()`과 동일한 계약
    (성공 시 out_path에 파일 쓰고 True, 실패 시 False, 지수 백오프
    재시도)이라 pipeline.py 쪽 호출부는 이 함수로 바꿔 꽂기만 하면 된다."""
    return _retry_generate_and_write(lambda: generate_bedrock_image_bytes(prompt), out_path, retries)


# 2026-09-25 — 여기 있던 "Bedrock Stable Image Style Guide 호출"
# 블록(참고 이미지 refs/style_reference.png 기반 화풍 고정, 2026-09-08
# 신설)을 삭제했다. style_guide 모델 자체를 뺀 이유는 위
# build_style_guide_prompt() 근처 주석 참고 — 이 참고 이미지를 admin에서
# 업로드/교체하던 UI(admin/backend/routes/webtoon/assets.py)도 함께
# 정리했다.


# 2026-09-25 — 여기 있던 "구도-화풍 분리 파이프라인"(GPU IP-Adapter 인물
# 고정 + Bedrock Stable Style Transfer 화풍 적용, pipeline 모델의 실제
# 구현이었다) 블록을 통째로 삭제했다. 인물/화풍 고정이 발행 문서에
# 한 번도 실제로 쓰인 적이 없었다는 게 라이브 확인으로 드러나(다른 주석
# 참고), "사용하지 않으면 삭제" 결정에 따라 translate_scene_to_photo_brief·
# generate_bedrock_photoreal_image_bytes·generate_bedrock_style_transfer_bytes·
# generate_bedrock_composed_image_bytes(및 두 사람 동시 등장 컷 합성용
# generate_dual_character_init_bytes/remove_background_bytes/
# _composite_two_characters)까지 전부 같이 걷어냈다. gpu_ipadapter.py를
# 부르는 유일한 코드가 이 블록이었다 — 그 모듈 자체(GPU EC2 제어)도
# 함께 삭제됐다.


# ─────────────────────────────────────────────────────────────
# Amazon Nova Canvas (Bedrock) — 프롬프트 챗랩 이미지 모델 비교 실험 전용
# (2026-09-15, 사용자 요청: "nova canvas도 모델을 올려두긴해야합니다").
#
# ⚠️ 이전에 시도했다가 막혔던 건 모델 자체 접근 거부가 아니라 IAM
# 권한(과 비용태깅용 application inference profile) 미비였다 — 실측으로
# 직접 확인(2026-09-15, us-east-1에서 실제 InvokeModel 성공). 모델
# 카탈로그상 "LEGACY" 표시가 있지만 이 계정은 이미 접근 가능한 상태다.
# us-east-1 전용(us-west-2엔 Nova Canvas 자체가 없음, 위 BEDROCK_IMAGE_REGION
# 주석 참고) — 그래서 클라이언트를 따로 둔다.
# ─────────────────────────────────────────────────────────────

NOVA_CANVAS_REGION = "us-east-1"
NOVA_CANVAS_MODEL_ID = "arn:aws:bedrock:us-east-1:887078546492:application-inference-profile/jbnsv603bm7x"  # lens-webtoon-image-nova-canvas → amazon.nova-canvas-v1:0

_nova_canvas_client = None


def _get_nova_canvas_client():
    global _nova_canvas_client
    if _nova_canvas_client is None:
        import boto3  # noqa: lazy — 위 _get_bedrock_image_client()와 같은 이유

        _nova_canvas_client = boto3.client("bedrock-runtime", region_name=NOVA_CANVAS_REGION)
    return _nova_canvas_client


def generate_nova_canvas_image_bytes(prompt: str) -> bytes:
    """Amazon Nova Canvas(Bedrock) 1회 호출 — 성공하면 PNG bytes 반환.
    요청/응답 계약이 Stability 계열(prompt+aspect_ratio)과 달라
    (taskType 기반, width/height 직접 지정) 별도 함수로 둔다. prompt는
    build_style_guide_prompt()가 만든 짧은 프롬프트를 그대로 받는다 —
    Nova Canvas는 참고 이미지 컨디셔닝이 없는 순수 text-to-image라 스타일
    힌트 문구가 특히 중요하다.

    ⚠️ height/width가 512x512(정사각형)인 이유(2026-09-15 실측) — 이
    모델은 Bedrock 카탈로그상 "LEGACY"라 임의의 해상도를 못 받는다.
    1024x1024·768x1152·896x1152·720x1280(세로형 전부)·1280x720은 전부
    "Access denied. This Model is marked by provider as Legacy..."로
    거부됐고, 512x512와 1280x1024(가로형)만 성공했다 — 다른 모델들처럼
    4:5 세로형을 못 만든다는 뜻. 비교 실험 목적상(화풍/품질만 확인) 정사각형
    쪽을 택했다 — compose_text.py의 말풍선 배치가 세로형 전제라 이 모델
    결과물엔 텍스트 합성이 다소 안 맞을 수 있음을 감안할 것."""
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
# 컷 이미지 생성 — 단일 정본 디스패치 (2026-09-20 신설)
# ─────────────────────────────────────────────────────────────
#
# admin/backend/routes/webtoon/generate.py(admin 실험 패널)와
# pipelines/webtoon/pipeline.py(실제 발행 파이프라인)가 각자 독립적인
# 모델 디스패치 if/elif를 갖고 있어서, admin에서 검증한 모델·원칙("사용자
# 프롬프트 외 영향 요인 없음")이 실제 발행에 전혀 반영되지 않는 문제가
# 있었다(docs/architecture/webtoon_custom/02-정리후보/01-모델디스패치중복.md
# — 정리후보 A). 이 함수가 그 정본이다 — admin/발행 양쪽이 이 함수 하나를
# 부르게 만드는 게 목표(정리후보 A+D 계획, 2026-09-20 승인).
#
# openai_dalle3는 여기 안 넣는다 — admin 전용 모듈(admin/backend/openai_image.py)
# 에 의존하고 ECS 발행 파이프라인엔 그 모듈 자체가 없는 데다, 이미 사업상
# 사용 불가로 확정됐다(2026-09-18) — admin/backend/routes/webtoon/generate.py
# 가 이 함수를 부르기 "전에" 별도로 분기해서 처리한다.
#
# 2026-09-20 — 생성 결과를 비전 모델로 재검증해 조건부 재생성하던 QA
# 단계(사극 오염·인물 없음 위반·고정 인물 수 초과 체크, _validate_and_detect_cut
# + Rekognition 얼굴 수 검사)를 통째로 제거했다(사용자 요청: "QA도 안
# 하기로 한거 아닌가?" → "그냥 삭제하시죠"). admin 실험 패널은 QA를 이미
# 기본으로 안 썼고, 발행 파이프라인의 Ultra 경로만 하드코딩으로 QA를
# 켜고 있어서 "CMS에서만 제어돼야 한다"는 원칙과 안 맞았다 — CMS 토글을
# 새로 만드는 대신 검증+재생성 후처리 자체를 없앴다.


def _generate_cut_once(
    camera: str,
    scene: str,
    model: str,
) -> bytes:
    """model 하나로 이미지 1장 생성 — 모델별 프롬프트 조립 방식만 다르고,
    QA·재시도는 호출부(generate_cut_image)가 모델 구분 없이 공통으로 담당한다.

    2026-09-20, 사용자 요청 — "단순하게.. 사용자가 입력한 이미지 프롬프트로만
    제어가 되도록 하는것이 적절합니다": stable_image_core/sd35_large/sd_ultra는
    고정 인물(characters)도, 재강조 문구(scene/character reinforcement — 특히
    "군중 금지"류로 사용자가 scene에 직접 적은 내용과 충돌하던 문구)도 안
    붙인다.

    2026-09-20(같은 날, 후속) — 처음엔 admin이 발행한 STYLE(공통 화풍)
    텍스트만 예외로 남겨뒀는데("STYLE만 그대로 얹고 나머지는 순수
    camera/scene"), 사용자가 재검토 후 "화풍지침 필요없고 프롬프트로만
    제어 가능하게" 요청 — 이 세 모델은 이제 style 자체를 안 넘긴다
    (build_background_prompt에 style=""). Camera/[SCENE]과 "텍스트 렌더
    금지" 안전장치만 남고, 화풍을 포함한 나머지는 전부 camera/scene
    텍스트가 결정한다.

    2026-09-25 — "pipeline"(GPU IP-Adapter+Style Transfer)·"style_guide"
    (레퍼런스 이미지 화풍) 분기를 삭제했다(사용자 결정, 모듈 상단 주석
    참고). 알 수 없는 model이 오면(예: 옛 발행 문서에 남은 값) sd_ultra로
    안전하게 폴백한다 — get_active_image_model()이 이미 _DEFAULT_IMAGE_MODEL
    로 같은 폴백을 하고 있어 여기서도 조용히 죽지 않는 게 일관된 동작."""
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
        # 참고 이미지 컨디셔닝이 없는 순수 text-to-image라 style_guide가
        # 쓰던(스타일 힌트가 포함된) 프롬프트를 그대로 재사용한다 — 모델별로
        # 다른 프롬프트를 쓰면 "같은 지문, 다른 모델" 비교가 아니게 된다.
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
    """컷 이미지 1장 생성 — admin 실험 패널과 발행 파이프라인이 공유하는
    단일 정본 디스패치(위 섹션 주석 참고, 정리후보 A+D). 반환값은
    (image_bytes, faces) — faces는 항상 None이다(2026-09-28, 아래 참고).
    compose_text.py는 faces가 None이면 균등분할로 말풍선을 배치한다.

    2026-09-28 — 말풍선 배치용 AWS Rekognition 얼굴 감지(2026-09-08 도입,
    rekognition_client.detect_main_faces())를 완전히 제거했다(사용자
    결정: "리코그니션 자체를 안 사용하기로 했고 삭제했어요"). mustknow_auto/
    frontpage_auto 태스크 역할에 rekognition:DetectFaces 권한이 애초에
    없어서 매 호출이 실패하고 항상 균등분할 폴백으로만 동작해왔다(실측
    2026-09-28 로그) — 그 사실을 계기로 기능 자체를 걷어냈다. `faces`
    파라미터는 compose_text.py 시그니처를 그대로 유지하려고 남겼다(항상
    None을 받는 게 원래 폴백 경로였으므로 별도 분기 불필요).

    2026-09-20 — 생성 결과를 검사해 조건부 재생성하던 QA(사극 오염·인물
    없음 위반·고정 인물 수 초과)를 통째로 제거했다(사용자 요청, 위 섹션
    주석 참고). 그 전엔 admin 실험 패널은 QA 기본 off, 발행 파이프라인의
    Ultra 경로만 하드코딩으로 QA on이라 "CMS로만 제어돼야 한다" 원칙에
    어긋났다 — 새 토글을 만드는 대신 후처리 자체를 없애 양쪽이 항상
    같게 동작하도록 정리했다."""
    image_bytes = _generate_cut_once(camera, scene, model)
    return image_bytes, None


# 2026-09-20 — 198건 백필 실사용에서 실패 18건 중 대다수(FileNotFoundError로
# 관측된 것들)의 실제 원인이 "응답에 이미지 없음: ['Filter reason: prompt']"
# 였다 — Bedrock 콘텐츠 필터가 그 컷의 image_prompt 내용 자체를 거부하는
# 것으로, 네트워크 오류와 달리 **같은 문장으로 재시도해도 매번 똑같이
# 거부된다**(동일 기사·동일 컷 번호가 서로 다른 배치 실행에서 매번 같은
# 방식으로 실패한 걸 로그로 확인). _retry_generate_and_write()의 기존
# 재시도는 이 실패 모드에 대해 완전히 무의미했다 — "재시도보다 근본
# 원인을 바로잡으라"는 사용자 요청으로, 필터 거부를 감지하면 텍스트
# 모델로 프롬프트를 한 번 순화해서 재시도하도록 바꿨다. 어떤 단어가
# 걸렸는지 Bedrock이 안 알려줘서 규칙 기반으로 미리 걸러낼 수 없다(이전에
# "lower abdomen" 사례처럼 사후에 하나씩 찾아 문서에 지침을 추가하는
# 방식은 새로 나타나는 표현마다 놓칠 수밖에 없다) — 그래서 실패 시점에
# 즉석으로 순화하는 쪽을 택했다.
_PROMPT_HELPER_MODEL = "arn:aws:bedrock:us-east-1:887078546492:application-inference-profile/yirjajon82n7"  # lens-webtoon-script-sonnet-46


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
    """generate_cut_image()의 파일-쓰기 + 배치 재시도(12/24/36초 백오프,
    _retry_generate_and_write() 공유) 래퍼 — pipeline.py(무인 자동 발행)가
    쓴다. admin 실험 패널(bytes만 필요, S3에 직접 업로드)은 generate_cut_image()를
    그대로 쓰고 이 래퍼는 안 거친다(2026-09-20, 정리후보 A Phase 3).

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
