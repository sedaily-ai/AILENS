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
# ("sd_ultra"/"pipeline"/"stable_image_core"/"sd35_large"/"style_guide").
_DOC_HEADINGS = ("STYLE", "CHARACTER_FEMALE", "CHARACTER_MALE", "IMAGE_MODEL")
_DOC_HEADING_RE = re.compile(r"^##\s+(STYLE|CHARACTER_FEMALE|CHARACTER_MALE|IMAGE_MODEL)\s*$")

_DEFAULT_IMAGE_MODEL = "sd_ultra"  # 2026-09-20 결정 — "GPU를 꼭 써야할까요?" 이후 admin 기본값과 동일
_VALID_IMAGE_MODELS = ("sd_ultra", "pipeline", "stable_image_core", "sd35_large", "style_guide")


def serialize_prompt_doc(style: str, char_female: str, char_male: str, image_model: str = "") -> str:
    """네 값 → DDB에 저장할 content 문자열. `parse_prompt_doc`의 역함수.
    image_model 생략 시(빈 문자열) IMAGE_MODEL 섹션 자체를 안 쓴다 —
    아직 이 설정을 모르는 옛 화면(WebtoonImageLab.tsx 구버전 등)이
    실수로 발행해도 다른 관리자가 고른 모델을 조용히 지우지 않는다."""
    parts = dict(zip(_DOC_HEADINGS[:3], (style.strip(), char_female.strip(), char_male.strip())))
    chunks = [f"## {h}\n{parts[h]}" for h in _DOC_HEADINGS[:3]]
    if image_model.strip():
        chunks.append(f"## IMAGE_MODEL\n{image_model.strip()}")
    return "\n\n".join(chunks)


def parse_prompt_doc(content: str) -> tuple[str, str, str, str]:
    """content 문자열 → (style, char_female, char_male, image_model). STYLE/
    CHARACTER_* 헤딩 형식이 예상과 다르면(빈 값 포함) ValueError — 호출부가
    안전망 기본값으로 폴백한다. IMAGE_MODEL은 없거나 모르는 값이면 빈
    문자열을 반환(필수 아님, 호출부가 _DEFAULT_IMAGE_MODEL로 채운다)."""
    buckets: dict[str, list[str]] = {h: [] for h in _DOC_HEADINGS}
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



def _character_text_for(subject: str) -> str:
    """A/B 각각의 admin 저장 CHARACTER 텍스트 한 명분만 돌려준다(GPU
    IP-Adapter 솔로 생성 프롬프트에 붙이는 용도 — generate_bedrock_composed_image_bytes()/
    generate_dual_character_init_bytes() 참고). 2026-09-16 — 예전엔 CHARACTER
    텍스트가 pipeline 모델 생성 어디에도 안 쓰였다(identity는 참조 사진만
    으로 고정). admin이 CHARACTER_FEMALE/MALE을 편집·발행해도 실제 생성
    결과가 전혀 안 바뀌는 건 "화면에서 저장한 프롬프트만 생성을 통제해야
    한다"는 원칙 위반이라 여기서부터 합류시킨다."""
    chars = get_fixed_characters()
    for label, text in chars.items():
        if label.startswith(subject + " "):
            return text
    return ""


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

# 2026-09-08(3차, #14 "배경 엑스트라 난입" 근본 원인 조사) — 위
# _STYLE_GUIDE_CONTENT_RULES에 "no extra crowds"라고 이미 명시돼 있는데도
# 실전 8컷 중 5컷에서 배경 인물이 계속 등장했다(라운드기록.md #14/R8).
# 원인을 좁혀보니 텍스트 지시의 문제가 아니라 **참고 이미지(Style Guide의
# 화풍 앵커) 자체가 "방송 스튜디오/카메라 장비"가 있는 배경**이라, 그
# 구도·소품까지 이미지 컨디셔닝을 통해 같이 전이되고 있었다 — 프롬프트에
# "하지 말라"는 문장을 아무리 강하게 추가해도(단일 테스트로 fidelity
# 0.3~0.5 여러 조합 시도) 거의 효과가 없었다(positive 프롬프트 안의 부정문은
# 확산 모델이 잘 못 지킨다는 게 이미 알려진 한계).
#
# 반면 Bedrock Style Guide 요청 바디에 별도 `negative_prompt` 필드를
# 추가하니(문서화는 안 돼 있지만 Stability API 계열이 보통 지원) 단일
# 테스트 4/4에서 스튜디오 장비·군중·제3의 인물이 안정적으로 사라지고
# 정확히 2인 구성이 유지됐다 — negative_prompt는 classifier-free guidance로
# 별도 처리되어 본문 프롬프트의 "하지 말라" 문장보다 훨씬 강하게 먹힌다.
# (단, 이 negative_prompt만으로는 "카페" 같은 구체적 장소까지 재현하진
# 못했다 — 여전히 기본값인 도심 거리로 나옴. 장소 재현은 [SCENE] 텍스트를
# 영어 키워드로 앞세우는 별도 처리가 필요해 이번엔 범위 밖으로 남기고
# #4로 계속 이월한다. 라운드기록.md R9 참고.)
_STYLE_GUIDE_NEGATIVE_PROMPT = (
    "broadcast studio, TV studio, press conference stage, stage lighting rig, "
    "film camera, tripod, microphone, press badge, lanyard, crowd, third "
    "person, extra person, additional character, background bystanders, "
    "other people, "
    # 2026-09-18, 양진희 피드백("배경과 인물이 겹쳐서 나오고 있는") — 이
    # negative_prompt는 generate_bedrock_style_transfer_bytes()(파이프라인
    # 최종 합성 단계)도 재사용한다(_style_hint_from_db 주석 참고). R22에서
    # 이미 한 번 발견됐던 "흐릿한 유령 인물" 문제가 실사용에서 재현돼
    # 관련 항목을 보강한다.
    "ghosted people, blurred people, silhouette people, faded figures, "
    "double exposure people, transparent people, "
    "signage text, readable text, letters, watermark"
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


def generate_bedrock_sd_ultra_image_bytes(prompt: str) -> bytes:
    """Stable Image Ultra(Bedrock) 1회 호출 — generate_bedrock_image_bytes와
    계약 동일(성공 시 PNG bytes 반환, 실패 시 예외), 재시도는 호출부 책임."""
    body = json.dumps({
        "prompt": prompt[:9500],
        "aspect_ratio": BEDROCK_ASPECT_RATIO,
        "output_format": "png",
    })
    return _invoke_and_decode_image(_get_bedrock_image_client(), SD_ULTRA_MODEL_ID, body)


def _retry_generate_and_write(bytes_fn, out_path: Path, retries: int) -> bool:
    """공통 재시도 + 파일-쓰기 래퍼 — generate_bedrock_image()와
    generate_bedrock_style_guide_image()는 실제 생성 호출(bytes_fn)만
    다르고 재시도 로직(지수 백오프 12/24/36초, 실패 로그)은 완전히
    같아서 2026-09-08 Style Guide 추가 때 중복되던 걸 추출했다."""
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


# ─────────────────────────────────────────────────────────────
# Bedrock Stable Image Style Guide 호출 (2026-09-08 신설)
# ─────────────────────────────────────────────────────────────
#
# 배경: 사용자가 카카오톡으로 공유한 참고 샘플(육하원칙 프롬프트 문서로
# GPT 이미지 툴에서 뽑은 결과물)과 Stable Image Core 순수 텍스트 프롬프트
# 출력을 나란히 대조한 결과, 인물 렌더링 자체가 "플랫 셀 채색 웹툰"이
# 아니라 "정교한 반실사 디지털 페인팅"으로 나오는 근본적 화풍 차이를
# 발견했다 — STYLE 프롬프트에 "cel-shaded, NOT photorealistic"를 아무리
# 명시해도 Stable Image Core 자체의 렌더링 성향을 못 이겼다.
#
# Style Guide는 텍스트 프롬프트 + 참고 이미지 1장을 같이 받아 그 이미지의
# 화풍(선화·채색·인물 톤)을 새 장면에 적용한다 — 실측(2026-09-08, 참고
# 이미지 1장 고정, 서로 다른 두 장면 프롬프트)으로 화풍·인물 헤어스타일이
# 두 장면에서 거의 동일하게 유지되는 걸 확인, Stable Image Core보다
# 참고 샘플에 훨씬 근접했다. 텍스트는 이 모델도 여전히 정확히 못 그린다
# (화면 속 글자가 깨져 나옴) — compose_text.py의 PIL 합성 구조는 그대로
# 유지한다.
#
# 참고 이미지는 assets/webtoon_style_reference.png(사용자가 준 샘플 원본)
# 하나로 고정 — 8컷 전체가 같은 스타일 앵커를 쓰게 해서 컷 간 화풍
# 일관성도 같이 챙긴다(캐릭터 얼굴 100% 동일은 여전히 보장 못 하지만,
# 헤어스타일·색감·선화 스타일은 Style Guide 쪽이 확실히 낫다).
STYLE_REFERENCE_IMAGE_PATH = Path(__file__).parent / "assets" / "webtoon_style_reference.png"
STYLE_GUIDE_FIDELITY = 0.5  # 0=프롬프트 위주, 1=참고 이미지 재현 위주. 실측 후 조정 가능.
# 프로파일 태그: Service=atlas4 · Project=Sedaily-LENS · Workload=webtoon-image
# (BEDROCK_IMAGE_MODEL_ID와 동일 태깅 정책 — 비용태깅_규칙.md 참고).
STYLE_GUIDE_MODEL_ID = "arn:aws:bedrock:us-west-2:887078546492:application-inference-profile/118crex43ghc"  # lens-webtoon-image-style-guide → us.stability.stable-image-style-guide-v1:0

# 2026-09-16 — "코드로 설정하는 모든 것을 화면에서 커스터마이징 가능하게"
# 요청으로, 지금까지 이 레포에 고정 번들된 파일(위 STYLE_REFERENCE_IMAGE_PATH)
# 이었던 화풍 레퍼런스 이미지를 admin "이미지 실험" 패널에서 업로드/교체할 수
# 있게 만든다. gpu_ipadapter.py의 인물 참조 사진(character_ref_A/B.png)과
# 같은 버킷·같은 "refs/" 프리픽스를 쓴다 — 이미 그 GPU 파이프라인용으로
# admin Lambda 역할에 Get/Put/Delete 권한이 나 있어(AdminWebtoonGpuBucket)
# 새 IAM이 필요 없다. S3에 아직 아무것도 업로드된 적 없으면(최초 배포 직후)
# 지금까지 쓰던 번들 파일로 조용히 폴백 — 이 폴백 때문에 기존 동작이
# 하나도 안 바뀐다.
_STYLE_REF_BUCKET = "sedaily-webtoon-ipadapter-887078546492"
_STYLE_REF_KEY = "refs/style_reference.png"
_STYLE_REF_REGION = "ap-northeast-2"  # gpu_ipadapter.GPU_REGION과 동일(버킷 홈 리전)
_STYLE_REF_CACHE_TTL_SEC = 60  # prompt_lab_repo.py의 draft 캐시와 같은 패턴 — admin이 방금 올린 이미지가 1분 안에 반영

_style_reference_cache: tuple[float, str] | None = None  # (fetched_at, base64)


def _get_style_reference_b64() -> str:
    global _style_reference_cache
    now = time.time()
    if _style_reference_cache is not None and now - _style_reference_cache[0] < _STYLE_REF_CACHE_TTL_SEC:
        return _style_reference_cache[1]
    try:
        import boto3  # noqa: lazy — S3 경로를 안 타는 호출부(텍스트 전용 실험 등)에서 초기화 비용 회피

        s3 = boto3.client("s3", region_name=_STYLE_REF_REGION)
        body = s3.get_object(Bucket=_STYLE_REF_BUCKET, Key=_STYLE_REF_KEY)["Body"].read()
        encoded = base64.b64encode(body).decode()
    except Exception as e:  # noqa: BLE001 — 업로드 전이거나 조회 실패해도 번들 기본값으로 폴백, 생성 자체를 막지 않는다
        print(f"[webtoon_image] 화풍 레퍼런스 S3 조회 실패({type(e).__name__}: {e}) — 번들 기본값 사용")
        encoded = base64.b64encode(STYLE_REFERENCE_IMAGE_PATH.read_bytes()).decode()
    _style_reference_cache = (now, encoded)
    return encoded


def generate_bedrock_style_guide_image_bytes(prompt: str, fidelity: float = STYLE_GUIDE_FIDELITY) -> bytes:
    """Stable Image Style Guide(Bedrock) 1회 호출 — generate_bedrock_image_bytes()와
    같은 계약(성공하면 PNG bytes, 실패하면 예외)이지만 STYLE 텍스트 대신
    참고 이미지 1장으로 화풍을 고정한다. prompt는 build_style_guide_prompt()가
    만든 짧은 프롬프트를 그대로 받는다(스타일 힌트 문구 포함 필수 — 그
    함수 상단 주석의 실측 결과 참고, 이미지만으로는 화풍이 안 지켜진다).

    aspect_ratio를 BEDROCK_ASPECT_RATIO(3:2)로 고정 — 첫 실측 때 이 파라미터를
    빠뜨려서 1:1 정사각형으로 나왔고, 좁아진 캔버스에서 말풍선 2개가 겹쳐
    얼굴을 가리는 부수 문제까지 만들었다(compose_text.py의 말풍선 배치는
    3:2 비율을 전제로 튜닝돼 있음).

    negative_prompt에 _STYLE_GUIDE_NEGATIVE_PROMPT를 항상 붙인다 — 참고
    이미지의 스튜디오 장비·군중이 이미지 컨디셔닝으로 새어 들어오는 문제를
    본문 프롬프트의 "하지 말라" 문장으로는 못 막았고, 이 필드로 실측
    확인함(모듈 상단 _STYLE_GUIDE_NEGATIVE_PROMPT 주석·라운드기록.md R9)."""
    body = json.dumps({
        "prompt": prompt[:9500],
        "negative_prompt": _STYLE_GUIDE_NEGATIVE_PROMPT,
        "image": _get_style_reference_b64(),
        "fidelity": fidelity,
        "aspect_ratio": BEDROCK_ASPECT_RATIO,
        "output_format": "png",
    })
    return _invoke_and_decode_image(_get_bedrock_image_client(), STYLE_GUIDE_MODEL_ID, body)


def generate_bedrock_style_guide_image(prompt: str, out_path: Path, retries: int = 3) -> bool:
    """generate_bedrock_image()와 동일한 파일-쓰기 + 재시도 래퍼(Style Guide 버전,
    _retry_generate_and_write() 공유)."""
    return _retry_generate_and_write(lambda: generate_bedrock_style_guide_image_bytes(prompt), out_path, retries)


# ─────────────────────────────────────────────────────────────
# 구도-화풍 분리 파이프라인 (2026-09-08, R11) — #4(장면 이행력) 근본 해결
# ─────────────────────────────────────────────────────────────
#
# 배경: Style Guide/Core 둘 다 "플랫 셀 웹툰체" 같은 화풍 지정과 [SCENE]의
# 구체적 장소(카페·사무실 등)를 한 프롬프트에 동시에 요구하면 장소 지시를
# 거의 무시하고 특정 배경(번화가 거리+군중)으로 쏠렸다(라운드기록.md R9).
# 그런데 화풍 지정 없이 "사진처럼" 요청하면 같은 모델이 장소 지시를
# 놀랍도록 정확히 따른다는 걸 R11에서 실측 확인 — 문제는 모델의 장소
# 이해력이 아니라 "화풍+장면"을 동시에 요구하는 것 자체였다.
#
# 그래서 3단계로 나눈다:
#   1) translate_scene_to_photo_brief() — 한국어 [SCENE]/[CAMERA]를 짧은
#      영어 사진 브리핑으로 압축(Claude 텍스트 호출, 이미 1·2단계에 쓰는
#      모델 재사용). 한국어 원문을 "사진처럼" 프롬프트에 그대로 섞으면
#      Bedrock 콘텐츠 필터에 비결정적으로 걸리는 걸 실측으로 발견했다
#      (동일 장면을 영어 브리핑 없이 여러 문장 구조로 시도 → 6/7 실패,
#      번역 브리핑을 쓴 뒤로는 안정적으로 통과) — 필터 회피 목적도 겸한다.
#   2) generate_bedrock_photoreal_image_bytes() — 이 브리핑으로 순수
#      포토리얼 사진(Stable Image Core)을 생성. 화풍 지정이 없어서 장소·
#      인원수 지시를 잘 따른다.
#   3) generate_bedrock_style_transfer_bytes() — 그 사진을 init_image로,
#      기존 webtoon_style_reference.png를 style_image로 Style Transfer
#      호출 — 구도(장소+인원수)는 그대로 두고 화풍만 지금 확립한 플랫
#      셀 웹툰체로 덧입힌다.
#
# 세 호출 다 실패하면 예외를 던져 _retry_generate_and_write()가 전체를
# 재시도한다(부분 재시도는 안 함 — 어느 단계가 실패했든 처음부터 다시
# 하는 게 상태 추적 복잡도를 피하는 더 단순한 선택).
STYLE_TRANSFER_MODEL_ID = "arn:aws:bedrock:us-west-2:887078546492:application-inference-profile/tck49g1f12v9"  # lens-webtoon-image-style-transfer
# 2026-09-18 — SYSTEM 프로파일 직호출을 Service=atlas4 application profile로 교체.
# 기반 모델·리전·응답은 동일하고 비용 귀속만 Not Applicable → atlas4로 바뀐다.

_SCENE_TRANSLATE_MODEL_ID = "arn:aws:bedrock:us-east-1:887078546492:application-inference-profile/yirjajon82n7"  # lens-webtoon-script-sonnet-46 재사용

# 2026-09-09(R15) — subjects 분류를 같이 받도록 확장. 캐릭터 일관성(#15)
# 근본 해법(gpu_ipadapter.py, IP-Adapter)은 참조 얼굴 1장으로 "이 사진
# 속 인물처럼" 고정하는 기법이라 두 사람이 한 프레임에 같이 나오는 컷엔
# 그대로 못 쓴다(둘 다 같은 얼굴로 쏠림 — 다중 인물 identity-lock은
# InstantID 등 별도 기법 필요, 이번 범위 밖). 그래서 이 컷이 "한 명만
# 크게 나오는 클로즈업"인지 "둘 다 나오는" 컷인지 미리 분류해서, 전자만
# GPU IP-Adapter 경로를 태운다 — 텍스트 압축과 같은 호출에 묶어서 별도
# LLM 호출을 추가하지 않는다.
# 2026-09-16 — 원래 문구가 "compress"(압축)였는데, 실제로는 admin이 SCENE에
# 적은 내용 중 일부가 조용히 요약·생략된 채로 이미지 생성에 들어갈 수 있다는
# 뜻이었다("관리자가 화면에서 저장한 프롬프트만이, 안 보이는 변형 없이 생성을
# 통제해야 한다"는 원칙 위반). 이 호출 자체(한국어→영어 번역)는 없앨 수
# 없다 — GPU IP-Adapter(SD1.5)·Bedrock Stable Image Core 둘 다 영어 학습
# 모델이라 한국어 프롬프트를 직접 못 알아듣는다(순수 언어 변환은 "안 보이는
# 곳에서 내용이 달라지는" 문제가 아니라 모델이 요구하는 언어로 옮기는
# 기술적 필수 단계). 그래서 "압축·요약" 대신 "SCENE에 적힌 내용을 빠짐없이
# 그대로 번역, 생략·요약·창작 금지"로 지침을 바꾼다 — subjects 분류(A/B/BOTH)
# 는 이미지에 실리는 콘텐츠가 아니라 어느 GPU 경로를 탈지 정하는 순수 라우팅
# 판단이라 그대로 유지한다.
_SCENE_TRANSLATE_SYSTEM = (
    "You translate a Korean scene description into English for a real "
    "photographer, AND classify which character(s) are the main visual "
    "focus. This is a literal translation, not a rewrite — preserve every "
    "detail, action, and prop the original text describes; do not omit, "
    "summarize away, or invent anything that isn't in the original. Output "
    "exactly this format:\n"
    "SUBJECTS: A|B|BOTH\n"
    "BRIEF: <English translation of the scene, describing location, setting, "
    "mood, camera framing as if directing a real documentary photo shoot — "
    "translate completely, keep it as concise as the original Korean text "
    "already is>\n\n"
    "Decision rule (apply in this order):\n"
    "1. If the [SCENE] text describes an action, expression, or pose for BOTH A and B "
    "(even briefly, e.g. 'A leans forward while B sits back'), output BOTH — this is "
    "the default and most common case for a two-person dialogue scene.\n"
    "2. Only output A or B when the OTHER character is explicitly described as absent, "
    "tiny, blurred, off-frame, or the camera is an extreme close-up on just one face/"
    "upper body with no mention of the other person's pose or action at all.\n"
    "3. When genuinely unsure, prefer BOTH.\n"
    "Do not mention illustration, cartoon, or any art style — describe it as a real photo."
)

_PHOTOREAL_NEGATIVE_PROMPT = (
    "illustration, cartoon, anime, painting, drawing, third person, extra person, "
    "additional character, third wheel, bystanders, crowd, other people, "
    "ghosted people, blurred people, silhouette people, faded figures, "
    "double exposure people, transparent people, watermark, "
    # 2026-09-18, 양진희 피드백 — 배경 소품(주유소 간판·가격판 등)에 한글이
    # 아닌 가짜 동양권 문자(일본어+중국어 짜집기처럼 보이는)가 새어 들어옴.
    # "text" 한 단어만으로는 약해서(실측 재현), _STYLE_GUIDE_NEGATIVE_PROMPT가
    # 이미 효과를 본 것과 같은 수준으로 구체적으로 나열한다.
    "text, signage text, readable text, storefront text, price board text, "
    "screen text, letters"
)


def translate_scene_to_photo_brief(camera: str, scene: str) -> tuple[str, str]:
    """한국어 [SCENE]/[CAMERA] → (subjects, brief). subjects는 "A"|"B"|"BOTH"
    (gpu_ipadapter.py가 단일 인물 컷 판별에 씀), brief는 짧은 영어 사진
    브리핑. bedrock_client.call_text()를 지연 import한다(이 모듈은 텍스트
    호출 없이 이미지 생성만 하는 admin 실험 패널 등에서도 쓰이므로, 텍스트
    클라이언트 초기화 비용을 정말 필요할 때만 치른다 —
    _get_bedrock_image_client()의 lazy-import boto3와 같은 이유).

    응답 형식이 예상과 다르면(파싱 실패) subjects="BOTH"로 안전하게
    폴백한다 — GPU IP-Adapter 경로를 잘못 태우는 것보다 기존 경로로
    떨어지는 게 안전하다."""
    from bedrock_client import call_text  # pipelines/common/ — sibling, flat import

    user = f"[SCENE]\n{scene}\n\n[CAMERA]\n{camera}"
    raw = call_text(_SCENE_TRANSLATE_SYSTEM, user, model=_SCENE_TRANSLATE_MODEL_ID, max_tokens=200, temperature=0.3)

    # 2026-09-09(R22) 버그 수정 — 정규식 알터네이션은 순서대로 첫 매치에서
    # 멈춘다. (A|B|BOTH)로 쓰면 실제 텍스트가 "BOTH"여도 "B"가 먼저 매치돼
    # 거기서 멈춰버려 늘 "B"로 잘못 파싱됐다(R15부터 존재하던 버그 — LLM이
    # 맞게 "BOTH"라고 답해도 코드가 매번 "B"로 읽어서, "두 사람이 같이
    # 나오는 컷"이 계속 "B 단독 인물 고정" 경로로 잘못 처리되고 있었다).
    # 더 구체적인 대안(BOTH)을 먼저 시도하도록 순서를 바꿔서 해결.
    m = re.search(r"SUBJECTS:\s*(BOTH|A|B)", raw)
    subjects = m.group(1) if m else "BOTH"
    m2 = re.search(r"BRIEF:\s*(.+)", raw, re.DOTALL)
    brief = m2.group(1).strip() if m2 else raw.strip()
    return subjects, brief


def build_photoreal_init_prompt(photo_brief: str) -> str:
    return (
        "Photograph of exactly two people only, nobody else in the frame. "
        "Photorealistic, natural lighting, documentary photography style.\n\n"
        + photo_brief
    )


def generate_bedrock_photoreal_image_bytes(prompt: str) -> bytes:
    """Stable Image Core 호출(포토리얼 버전) — generate_bedrock_image_bytes()와
    거의 같지만 negative_prompt를 받는다(_PHOTOREAL_NEGATIVE_PROMPT 고정,
    "제3의 인물"·일러스트 화풍 배제 목적)."""
    body = json.dumps({
        "prompt": prompt[:9500],
        "negative_prompt": _PHOTOREAL_NEGATIVE_PROMPT,
        "aspect_ratio": BEDROCK_ASPECT_RATIO,
        "output_format": "png",
    })
    return _invoke_and_decode_image(_get_bedrock_image_client(), BEDROCK_IMAGE_MODEL_ID, body)


def generate_bedrock_style_transfer_bytes(
    init_image_bytes: bytes,
    *,
    composition_fidelity: float = 0.9,
    style_strength: float = 1.0,
    change_strength: float = 0.9,
) -> bytes:
    """Stable Style Transfer 호출 — init_image(구도)에 style_image(우리
    webtoon_style_reference.png)의 화풍을 입힌다. 기본값은 R11 실측 비교에서
    가장 화풍 일치도가 높았던 조합(style_strength=1.0). prompt는
    _style_hint_from_db()로 admin이 저장한 STYLE 텍스트를 그대로 쓴다(2026-09-16
    — 위 _STYLE_AB_ROLE_LINE 주석 참고)."""
    body = json.dumps({
        "init_image": base64.b64encode(init_image_bytes).decode(),
        "style_image": _get_style_reference_b64(),
        "prompt": _style_hint_from_db(),
        "negative_prompt": _STYLE_GUIDE_NEGATIVE_PROMPT,
        "composition_fidelity": composition_fidelity,
        "style_strength": style_strength,
        "change_strength": change_strength,
        "output_format": "png",
    })
    return _invoke_and_decode_image(_get_bedrock_image_client(), STYLE_TRANSFER_MODEL_ID, body)


def build_style_transfer_scene_input(camera: str, scene: str) -> str:
    """generate_bedrock_composed_image()에 넘길 입력 — build_style_guide_prompt()류
    다른 빌더들과 시그니처를 맞추기 위해 camera+scene을 한 문자열로 묶는다.
    실제 파싱은 translate_scene_to_photo_brief()가 한다(스키마: build_style_guide_prompt()
    의 [SCENE] 블록 표기와 동일)."""
    return f"[SCENE]\n{scene}\n\n[CAMERA]\n{camera}"


def _parse_style_transfer_scene_input(scene_input: str) -> tuple[str, str]:
    m = re.match(r"^\[SCENE\]\n(.*?)\n\n\[CAMERA\]\n(.*)$", scene_input, re.DOTALL)
    if not m:
        raise ValueError("build_style_transfer_scene_input()으로 만든 입력이 아님")
    return m.group(2), m.group(1)  # (camera, scene)


def generate_bedrock_composed_image_bytes(
    scene_input: str,
    *,
    apply_character_lock: bool = True,
    apply_style_transfer: bool = True,
) -> bytes:
    """구도-화풍 분리 파이프라인(R12) — 번역 단계가 이제 subjects도 같이
    반환한다(R15). subjects가 "A"/"B"(한 명만 크게 나오는 컷)면 GPU
    IP-Adapter로 그 인물의 참조 얼굴을 고정한 사진을 만든다(캐릭터 일관성
    #15 근본 해법, gpu_ipadapter.py 모듈 docstring 참고). "BOTH"(두 사람
    같이 나오는 컷)는 각자 생성→합성한다(generate_dual_character_init_bytes()).

    2026-09-09(R22) — R18에서 이 BOTH 경로를 재현성 부족(Style Transfer가
    가끔 두 사람을 하나로 뭉개버림)으로 기본에서 뺐었는데, composition_fidelity
    를 0.75→0.9로 올려서 재실측하니 3/3 전부 "뭉개짐" 없이 두 사람이 뚜렷이
    분리됨을 확인 — 대신 배경에 흐릿한 3번째/4번째 인물이 살짝 겹쳐 보이는
    다른(훨씬 다루기 쉬운) 문제로 바뀌었다. 이건 이미 있는 Rekognition
    얼굴 수 QA 게이트(R10, pipeline.py의 _generate_and_qa_cut)가 정확히
    잡아 재시도하는 종류의 문제라 — 근본적인 "뭉개짐"보다 훨씬 다루기 쉬워
    다시 기본 경로로 승격.

    2026-09-16 — admin에서 "이미지 고정(인물)·화풍 고정을 껐다 켰다 하고
    싶다"는 요청으로 두 옵션을 추가했다(둘 다 기본 True = 지금까지의
    동작 그대로).
    - apply_character_lock=False: subjects를 "NONE"으로 강제해 GPU
      IP-Adapter 참조 얼굴 고정 경로 자체를 건너뛴다 — 인물이 몇 명
      나오든 "일반적인 사람"으로 생성된다(admin이 저장한 CHARACTER
      텍스트도 이 경로에선 같이 빠진다 — 아래 분기 참고, subjects="NONE"
      이면 IP-Adapter 분기를 안 타므로 _character_text_for()도 안 붙는다).
    - apply_style_transfer=False: 3단계(Style Transfer)를 건너뛰고 그
      직전 단계의 포토리얼 원본을 그대로 반환한다 — **결과물이 삽화가
      아니라 사실적인 사진처럼 나온다**는 뜻이다(화풍 자체를 텍스트로
      대신 입히는 게 아니라 그 단계를 통째로 스킵하는 것). 순수하게
      "이 인물/구도가 실제로 어떻게 나오는지" 확인하고 싶을 때 쓴다."""
    camera, scene = _parse_style_transfer_scene_input(scene_input)
    subjects, brief = translate_scene_to_photo_brief(camera, scene)
    if not apply_character_lock:
        subjects = "NONE"

    if subjects in ("A", "B"):
        import gpu_ipadapter  # pipelines/common/ — sibling, GPU 경로를 안 쓰는 호출부의 boto3 비용 회피 위해 지연 import

        subject_brief = f"{brief} {_character_text_for(subjects)}".strip()
        init_bytes = gpu_ipadapter.generate_ipadapter_photo_bytes(subject_brief, subjects)
        style_kwargs = {}
    elif subjects == "BOTH":
        init_bytes = generate_dual_character_init_bytes(brief)
        style_kwargs = {"composition_fidelity": 0.9, "change_strength": 0.7}
    else:
        init_prompt = build_photoreal_init_prompt(brief)
        init_bytes = generate_bedrock_photoreal_image_bytes(init_prompt)
        style_kwargs = {}

    if not apply_style_transfer:
        return init_bytes
    return generate_bedrock_style_transfer_bytes(init_bytes, **style_kwargs)


# ─────────────────────────────────────────────────────────────
# 두 인물 동시 등장 컷의 캐릭터 일관성(#15 잔여 과제, R18) — 각자
# 생성 후 합성
# ─────────────────────────────────────────────────────────────
#
# IP-Adapter는 참조 이미지 한 장으로만 인물을 고정하는 기법이라 두
# 사람이 한 프레임에 같이 나오는 컷엔 그대로 못 쓴다는 게 R15의 결론
# 이었다(다중 인물 identity-lock은 InstantID 등 별도 기법 필요).
# 대신 "각자 따로 생성 → 배경 제거 → 합성" 구조를 실측해보니(1) A만
# 나온 사진 (2) B만 나온 사진을 각각 IP-Adapter로 고정 생성하고,
# Bedrock Remove Background(R17에서 처음 실사용)로 인물만 오려낸 뒤,
# 빈 배경 사진 위에 나란히 붙이면 — 그 자체로는 이질감이 있지만(스케일·
# 그림자·조명이 안 맞아 "잘라 붙인 티"가 남), 그 결과를 그대로
# generate_bedrock_style_transfer_bytes()에 한 번 더 통과시키면 Style
# Transfer가 이음매·조명·비례를 자연스럽게 재조정해준다는 걸 확인했다
# (모델이 합성본을 "구조 가이드"로만 쓰고 다시 그리기 때문 — 이게 바로
# Style Transfer의 본래 용도인 "구도는 보존하되 다시 그린다"에 정확히
# 들어맞는다). composition_fidelity를 solo/BOTH 기본값(0.9)보다 낮춘
# 0.75 — 합성 이음매를 더 적극적으로 재조정하게 하려면 원본 구조를
# 너무 꽉 붙들지 않는 편이 낫다는 걸 실측으로 확인.
_EMPTY_SCENE_NEGATIVE_PROMPT = "people, person, man, woman, illustration, cartoon, text, watermark"
REMOVE_BACKGROUND_MODEL_ID = "arn:aws:bedrock:us-west-2:887078546492:application-inference-profile/fo8lxrosnj66"  # lens-webtoon-image-remove-background


def build_empty_scene_prompt(photo_brief: str) -> str:
    """2026-09-18, 양진희 피드백("배경과 인물이 겹쳐서 나오고 있는") — 이
    배경만 생성하는 단계가 "no people"이라고만 해도 흐릿한 사람 형체가
    섞여 나오는 걸 실측 확인(코드 상단 R22 주석에 이미 기록된 문제 —
    당시엔 Rekognition 얼굴 수 QA 게이트로 재시도해서 넘어갔는데, 그
    게이트가 흐릿한 유령 인물을 "얼굴"로 인식 못 해 통과시키는 사례가
    실사용에서 나옴). "no people"보다 "건물·가구만 그려라"는 적극적
    지시가 부정문보다 확산 모델에 더 잘 먹힌다는 게 이 파일 다른 곳의
    실측 결론(_STYLE_GUIDE_NEGATIVE_PROMPT 도입 배경 주석 참고)이라,
    같은 방향으로 강화한다."""
    return (
        "Photograph of an empty location with absolutely no people, no human "
        "figures, no silhouettes, and no blurred or ghosted human shapes "
        "anywhere in the frame — compose using architecture, furniture, and "
        "objects only. Photorealistic, natural lighting, documentary "
        "photography style.\n\n"
        + photo_brief
    )


def remove_background_bytes(image_bytes: bytes) -> bytes:
    """Bedrock Remove Background 호출 — 알파 채널이 있는 PNG를 돌려준다
    (인물만 남기고 나머지는 투명)."""
    body = json.dumps({"image": base64.b64encode(image_bytes).decode(), "output_format": "png"})
    return _invoke_and_decode_image(_get_bedrock_image_client(), REMOVE_BACKGROUND_MODEL_ID, body)


def _composite_two_characters(bg_bytes: bytes, a_bytes: bytes, b_bytes: bytes) -> bytes:
    """배경(인물 없음) + A 단독 사진(배경 제거됨) + B 단독 사진(배경
    제거됨)을 좌우로 배치해 합성한다. 스케일·위치는 "테이블 앞에 나란히
    앉은 두샷"을 가정한 고정 비율 — 장면마다 다른 구도(클로즈업·와이드
    등)를 정교하게 반영하진 못하지만, 뒤이은 Style Transfer가 이음매를
    재조정해주므로 이 정도 근사로 충분함을 실측으로 확인했다(모듈 상단
    주석 참고). 카메라 타입별 정교한 배치는 다음 라운드 과제."""
    from io import BytesIO

    from PIL import Image, ImageDraw, ImageFilter

    bg = Image.open(BytesIO(bg_bytes)).convert("RGBA")
    a = Image.open(BytesIO(a_bytes)).convert("RGBA")
    b = Image.open(BytesIO(b_bytes)).convert("RGBA")
    bw, bh = bg.size

    # 2026-09-09 실측 — 높이 기준으로만 리사이즈하면 상반신 크롭(가로로
    # 넓은 원본)이 캔버스 폭의 절반을 훌쩍 넘어 두 인물이 가운데서 심하게
    # 겹치고, 그 겹친 상태를 Style Transfer가 "얼굴 하나"로 뭉개버리는
    # 문제를 발견함(라운드기록.md R18). 폭을 캔버스의 42%로 상한을 두고
    # (높이 상한도 같이 걸어 이중 제약) 두 인물 사이에 최소 간격을 보장.
    max_w = int(bw * 0.42)
    max_h = int(bh * 0.70)

    def _resize_to_fit(img, max_w, max_h):
        scale = min(max_w / img.width, max_h / img.height)
        return img.resize((int(img.width * scale), int(img.height * scale)))

    a_r, b_r = _resize_to_fit(a, max_w, max_h), _resize_to_fit(b, max_w, max_h)
    ground_y = int(bh * 0.98)
    a_x, b_x = int(bw * 0.06), bw - int(bw * 0.06) - b_r.width
    a_y, b_y = ground_y - a_r.height, ground_y - b_r.height

    shadow = Image.new("RGBA", (bw, bh), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.ellipse([a_x, ground_y - 30, a_x + a_r.width, ground_y + 30], fill=(0, 0, 0, 90))
    sd.ellipse([b_x, ground_y - 30, b_x + b_r.width, ground_y + 30], fill=(0, 0, 0, 90))
    shadow = shadow.filter(ImageFilter.GaussianBlur(20))

    canvas = Image.alpha_composite(bg, shadow)
    canvas.alpha_composite(a_r, (a_x, a_y))
    canvas.alpha_composite(b_r, (b_x, b_y))

    out = BytesIO()
    canvas.convert("RGB").save(out, format="PNG")
    return out.getvalue()


# 2026-09-09 실측 — 공유 brief(예: "A는 왼쪽, B는 오른쪽, 마주 앉아
# 대화")를 A/B 각각의 solo IP-Adapter 생성에 그대로 넘기면, 그 문장이
# 상대방 묘사까지 담고 있어서 생성 결과가 "두 사람 특징이 섞인 하이브리드
# 인물"로 나옴(A의 재킷 색+B의 셔츠가 한 인물 옷차림에 뒤섞이는 등,
# 실측 확인). solo 생성 프롬프트는 장면 디테일과 무관하게 일반적인
# 상반신 인물 사진으로 고정하고, 실제 장소 정보는 배경 이미지 쪽에서만
# 가져온다 — 합성 후 Style Transfer가 이음매를 재조정해주므로 solo
# 단계에서 장소를 정교하게 맞출 필요가 없다.
_DUAL_SOLO_PROMPT_TEMPLATE = (
    "upper body portrait, sitting at a table, natural relaxed pose, looking slightly "
    "to the side as if talking to someone, plain simple background"
)
# _DUAL_SOLO_PROMPT_TEMPLATE는 "화풍/인물 묘사" 같은 admin 편집 대상 콘텐츠가
# 아니라, 위 R9 실측 결과에 따라 일부러 장면과 무관하게 고정해야 하는 기술적
# 포즈 스캐폴드다(공유 brief를 그대로 쓰면 인물 특징이 섞이는 문제가 재현됨
# — 위 주석 참고). 대신 "누구를 그리는지"에 해당하는 실제 외형 콘텐츠는
# admin이 저장한 CHARACTER_FEMALE/MALE(_character_text_for())에서 매 호출마다
# 가져온다(2026-09-16).


def generate_dual_character_init_bytes(photo_brief: str) -> bytes:
    import gpu_ipadapter  # pipelines/common/ — sibling

    a_bytes = gpu_ipadapter.generate_ipadapter_photo_bytes(
        f"{_DUAL_SOLO_PROMPT_TEMPLATE}. {_character_text_for('A')}".strip(), "A"
    )
    b_bytes = gpu_ipadapter.generate_ipadapter_photo_bytes(
        f"{_DUAL_SOLO_PROMPT_TEMPLATE}. {_character_text_for('B')}".strip(), "B"
    )
    bg_bytes = generate_bedrock_photoreal_image_bytes(build_empty_scene_prompt(photo_brief))
    # negative_prompt는 generate_bedrock_photoreal_image_bytes() 내부에
    # 이미 _PHOTOREAL_NEGATIVE_PROMPT로 고정돼 있어(인물 배제 문구는
    # 없음) 여기서는 프롬프트 텍스트로만 "no people"을 지시한다 — 배경
    # 생성에서 사람이 섞여 나와도 어차피 그 위에 A/B를 덮어 그리므로
    # 크리티컬하지 않다.
    a_cut = remove_background_bytes(a_bytes)
    b_cut = remove_background_bytes(b_bytes)
    return _composite_two_characters(bg_bytes, a_cut, b_cut)


def generate_bedrock_composed_image(scene_input: str, out_path: Path, retries: int = 2) -> bool:
    """구도-화풍 분리 3단계(번역→포토리얼→Style Transfer) 전체의 파일-쓰기
    + 재시도 래퍼. 세 호출을 다 묶어서 재시도한다(부분 재시도 없음). 기본
    retries=2(다른 generate_*는 3) — 한 시도당 Bedrock 호출이 3번이라
    기본값 3을 그대로 쓰면 최악의 경우 호출 수가 지나치게 늘어난다."""
    return _retry_generate_and_write(lambda: generate_bedrock_composed_image_bytes(scene_input), out_path, retries)


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
    apply_character_lock: bool,
    apply_style_transfer: bool,
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
    텍스트가 결정한다. style_guide/pipeline(GPU) 모델은 별개 메커니즘
    (참고 이미지가 화풍을 앵커하고 텍스트는 그걸 보조하는 구조)이라
    이 변경 밖 — build_style_guide_prompt()의 _style_hint_from_db()
    주석 참고."""
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

    if model == "sd_ultra":
        prompt = build_background_prompt(
            camera, scene, style="",
            include_scene_reinforcement=False, include_character_reinforcement=False,
        )
        return generate_bedrock_sd_ultra_image_bytes(prompt)

    if model == "style_guide":
        prompt = build_style_guide_prompt(camera, scene)
        return generate_bedrock_style_guide_image_bytes(prompt)

    if model == "nova_canvas":
        # 참고 이미지 컨디셔닝이 없는 순수 text-to-image라 style_guide와
        # 같은(스타일 힌트가 포함된) 프롬프트를 그대로 재사용한다 — 모델별로
        # 다른 프롬프트를 쓰면 "같은 지문, 다른 모델" 비교가 아니게 된다.
        prompt = build_style_guide_prompt(camera, scene)
        return generate_nova_canvas_image_bytes(prompt)

    # "pipeline"(기본) — GPU IP-Adapter + Style Transfer
    scene_input = build_style_transfer_scene_input(camera, scene)
    return generate_bedrock_composed_image_bytes(
        scene_input, apply_character_lock=apply_character_lock, apply_style_transfer=apply_style_transfer
    )


def generate_cut_image(
    camera: str,
    scene: str,
    model: str = "pipeline",
    *,
    has_dialogue: bool = True,
    apply_character_lock: bool = True,
    apply_style_transfer: bool = True,
) -> tuple[bytes, list | None]:
    """컷 이미지 1장 생성 — admin 실험 패널과 발행 파이프라인이 공유하는
    단일 정본 디스패치(위 섹션 주석 참고, 정리후보 A+D). 반환값은
    (image_bytes, faces) — faces는 말풍선 배치 참고용 Rekognition 얼굴
    바운딩 박스 목록(대사가 있는 컷에서만 조회, 없으면 None —
    compose_text.py가 None일 때 균등분할로 폴백한다).

    2026-09-20 — 생성 결과를 검사해 조건부 재생성하던 QA(사극 오염·인물
    없음 위반·고정 인물 수 초과)를 통째로 제거했다(사용자 요청, 위 섹션
    주석 참고). 그 전엔 admin 실험 패널은 QA 기본 off, 발행 파이프라인의
    Ultra 경로만 하드코딩으로 QA on이라 "CMS로만 제어돼야 한다" 원칙에
    어긋났다 — 새 토글을 만드는 대신 후처리 자체를 없애 양쪽이 항상
    같게 동작하도록 정리했다."""
    image_bytes = _generate_cut_once(camera, scene, model, apply_character_lock, apply_style_transfer)
    faces = None
    if has_dialogue:
        from rekognition_client import detect_main_faces  # pipelines/common/ — sibling, flat import
        faces = detect_main_faces(image_bytes) or None
    return image_bytes, faces


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
    apply_character_lock: bool = True,
    apply_style_transfer: bool = True,
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
                apply_character_lock=apply_character_lock,
                apply_style_transfer=apply_style_transfer,
            )
        except ValueError as e:
            if "Filter reason: prompt" in str(e) and not softened[0]:
                softened[0] = True
                print("[webtoon_image] 콘텐츠 필터 거부 — 프롬프트 순화 후 재시도")
                scene_holder[0] = _soften_scene_for_filter(scene_holder[0])
                image_bytes, faces = generate_cut_image(
                    camera, scene_holder[0], model,
                    has_dialogue=has_dialogue,
                    apply_character_lock=apply_character_lock,
                    apply_style_transfer=apply_style_transfer,
                )
            else:
                raise
        faces_holder[0] = faces
        return image_bytes

    ok = _retry_generate_and_write(_once, out_path, retries)
    return ok, faces_holder[0]
