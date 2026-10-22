"""웹툰 이미지 프롬프트 쪽 — STYLE·고정 캐릭터·보강 문구, admin 발행 문서(PROMPT#webtoon-image/published) 로드, 배경·스타일 가이드 프롬프트 조립.

2026-10-12 webtoon_image.py 에서 분리(리팩토링 6단계). Bedrock 호출 쪽은 webtoon_image.py. 기존 import 경로(webtoon_image.get_style 등)는 그쪽에서 re-export 한다.
admin/backend 는 Lambda zip 루트에 flat 복사하므로 deploy-admin-api.sh 에도 이 파일이 들어 있어야 한다.
"""
from __future__ import annotations

import re

# ─────────────────────────────────────────────────────────────
# 안전망 기본값 — DDB(PROMPT#webtoon-image/published)를 못 읽을 때만 쓴다.
# 시행착오 이력은 pipelines/webtoon/prompts.py 상단에 있다.
# 실제 값은 이 상수가 아니라 admin "이미지 실험" 패널에서 발행한다.
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
    # 안경/단발/배지 같은 작은 액세서리 지시는 확산 모델이 지키지 않아(prompts.py 참고)
    # 머리 길이·색상·복장 실루엣 같은 큰 특징 위주로 쓴다.
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
# admin DB 발행 문서 — PROMPT#webtoon-image/published
# ─────────────────────────────────────────────────────────────
#
# 저장은 범용 라우트(`POST /admin/prompts/webtoon-image/published`, WebtoonImageLab.tsx의
# "발행")를 쓴다. content는 STYLE/두 캐릭터/모델을 아래 헤딩 포맷으로 합친 산문 한 덩어리이며
# 여기서 파싱한다. 프롬프트 드로어의 3섹션 모델과 맞지 않아 sections_json은 보내지 않는다.
#
# IMAGE_MODEL 헤딩은 필수가 아니다. 없거나 모르는 값이면 ValueError 없이 _DEFAULT_IMAGE_MODEL로
# 채운다(STYLE/CHARACTER_*가 비어 있으면 문서 손상으로 보고 에러). 값 어휘는
# admin webtoonImageModels.ts의 IMAGE_MODELS[].id와 같다("sd_ultra"/"stable_image_core"/"sd35_large").
_DOC_HEADINGS = ("STYLE", "CHARACTER_FEMALE", "CHARACTER_MALE", "IMAGE_MODEL")
# 말풍선 얼굴 회피(Rekognition) 켜기/끄기. 네 값 튜플(parse_prompt_doc)에 섞지 않고 get_bubble_detect()로 따로 읽는다.
_BUBBLE_DETECT_HEADING = "BUBBLE_DETECT"
_BUBBLE_STYLE_HEADING = "BUBBLE_STYLE"  # 웹툰식 말풍선(타원·얇은 선·여백) on/off
_DOC_HEADING_RE = re.compile(r"^##\s+(STYLE|CHARACTER_FEMALE|CHARACTER_MALE|IMAGE_MODEL|BUBBLE_DETECT|BUBBLE_STYLE)\s*$")

_DEFAULT_IMAGE_MODEL = "sd_ultra"  # admin 기본값과 동일
_VALID_IMAGE_MODELS = ("sd_ultra", "stable_image_core", "sd35_large")


def serialize_prompt_doc(style: str, char_female: str, char_male: str, image_model: str = "", bubble_detect: bool | None = None, bubble_style: bool | None = None) -> str:
    """네 값 → DDB에 저장할 content 문자열. `parse_prompt_doc`의 역함수.
    image_model이 빈 문자열이면 IMAGE_MODEL 섹션을 쓰지 않아, 이 설정을 모르는 옛 화면이
    발행해도 다른 관리자가 고른 모델을 지우지 않는다."""
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
    """content 문자열 → (style, char_female, char_male, image_model).
    STYLE/CHARACTER_* 헤딩이 없거나 비어 있으면 ValueError(호출부가 안전망 값으로 폴백).
    IMAGE_MODEL은 없거나 모르는 값이면 빈 문자열을 반환한다."""
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
    """발행 문서의 ## BUBBLE_DETECT 섹션이 on이면 True. 없거나 다른 값이면 False(비용이 드는 기능이라 명시적으로 켠 경우만 동작)."""
    m = re.search(r"^##\s+BUBBLE_DETECT\s*\n\s*(\w+)", content, flags=re.MULTILINE)
    return bool(m and m.group(1).lower() == "on")


def parse_bubble_style(content: str) -> bool:
    """발행 문서의 ## BUBBLE_STYLE이 on이면 True(웹툰식 말풍선). 없거나 다른 값이면 False(기존 스타일)."""
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
    """DDB(PROMPT#webtoon-image/published)를 캐시 없이 매번 읽는다. 실패하면 안전망 기본값으로 폴백한다."""
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
    """발행 파이프라인이 지금 써야 할 이미지 모델 id. 캐시 없이 매번 읽어
    관리자가 저장하면 재배포 없이 다음 컷 생성부터 반영된다."""
    _style, _female, _male, model = _load_prompt_doc()
    return model or _DEFAULT_IMAGE_MODEL


def get_image_settings() -> tuple[str, dict, str]:
    """(style, fixed_characters, active_image_model)를 DDB 조회 한 번으로 얻는다.
    admin handle_defaults()가 세 값을 동시에 보여줘야 하는데 개별 getter를 부르면
    같은 문서를 캐시 없이 세 번 읽어 로딩이 느려지기 때문이다."""
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
    """Bedrock 경로 전용 — 텍스트(말풍선/캡션/내레이션) 지침 없이 스타일+장면만 담는다.
    확산 모델이 요청하지 않은 글자를 그림에 채우는 것을 막으려고 금지 문구를 붙이며,
    글자 합성은 compose_text.py가 나중에 한다.

    style=None이면 호출 시점마다 get_style()로 발행된 최신값을 읽는다(기본 인자는 정의 시
    한 번만 평가되므로 상수로 두지 않는다). style=""이면 조회 없이 화풍 지침 없이
    camera/[SCENE]만으로 만든다. include_*_reinforcement는 admin 실험 패널이 재강조
    문구를 끄고 시험할 수 있게 하는 옵션이다."""
    if style is None:
        style = get_style()
    if not style and not camera and not characters:
        # CMS의 완성형 프롬프트는 첫 화풍 문장부터 공급자에 전달한다.
        visual = scene
    else:
        style_block = f"{style}\n" if style else ""
        style_block += f"Camera: {camera}. 3:2 horizontal."
        visual = style_block + characters_block(characters) + f"\n\n[SCENE]\n{scene}"
    return (
        visual
        + (SCENE_REINFORCEMENT if include_scene_reinforcement else "")
        + (CHARACTER_REINFORCEMENT if (characters and include_character_reinforcement) else "")
        + "\n\nCRITICAL: Do NOT render any text, letters, writing, signage text, "
        "or speech bubbles anywhere in this image — pure illustration only, no "
        "readable characters of any kind. Text will be added separately afterward."
    )


# Nova Canvas 경로용 짧은 프롬프트 조립.
#
# 실측 함정: 긴 인물 묘사(characters_block)와 재강조 문구를 붙이면 화풍이 반실사 사진으로
# 돌아간다. 화풍은 "flat cel-shaded webtoon, NOT photorealistic" 같은 텍스트 지시를 앞에 두고
# 나머지를 짧게 유지해야 지켜지므로, 이 프롬프트는 스타일 + 카메라 + [SCENE] + 짧은 내용 규칙
# + 텍스트 렌더 금지로 한정한다.
#
# 단 성별 정보는 빠뜨리면 안 된다. 장면 텍스트가 옷차림으로만 A/B를 부르면 어느 쪽이
# 누구인지 판단할 근거가 없어 인물 구성이 컷마다 흔들렸다. "A는 여성, B는 남성"이라는
# 한 줄 역할 매핑만 추가하면 화풍 훼손 없이 안정된다. 이 줄은 화풍 내용이 아니라 구조적
# 배선이라 admin 편집 대상이 아니며, 화풍 본문은 get_style()(admin이 저장한 STYLE)을 쓴다.
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
    """Nova Canvas 경로용 프롬프트. 위 주석대로 일부러 짧게 유지하며(스타일 + 성별 역할
    한 줄 + 카메라 + 장면 + 내용 규칙 + 텍스트 렌더 금지), 인물 묘사는 받지 않는다."""
    return (
        _style_hint_from_db()
        + f"\nCamera: {camera}."
        + f"\n\n[SCENE]\n{scene}"
        + f"\n\n{_STYLE_GUIDE_CONTENT_RULES}"
        + "\n\nCRITICAL: Do NOT render any text, letters, writing, signage text, "
        "or speech bubbles anywhere in this image — pure illustration only, no "
        "readable characters of any kind. Text will be added separately afterward."
    )
