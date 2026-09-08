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
_STYLE_GUIDE_STYLE_HINT = (
    "Modern Korean webtoon illustration, full color, clean flat cel-shaded "
    "linework style — NOT photorealistic, NOT a photograph, NOT camera-captured. "
    "Two recurring characters from the reference image: A is the woman, B is the man."
)

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
    "other people, signage text, readable text, letters, watermark"
)


def build_style_guide_prompt(camera: str, scene: str) -> str:
    """Style Guide 경로 전용 프롬프트 — 위 실측 결과를 따라 일부러
    짧게 유지한다(스타일 힌트+성별 역할 한 줄 + 카메라 + 장면 + 내용
    규칙 + 텍스트 렌더 금지뿐). characters 파라미터를 여전히 안 받는
    이유(장문 묘사 배제)는 위 주석 참고 — 성별만 _STYLE_GUIDE_STYLE_HINT에
    고정 문구로 포함한다."""
    return (
        _STYLE_GUIDE_STYLE_HINT
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

_style_reference_b64: str | None = None


def _get_style_reference_b64() -> str:
    global _style_reference_b64
    if _style_reference_b64 is None:
        _style_reference_b64 = base64.b64encode(STYLE_REFERENCE_IMAGE_PATH.read_bytes()).decode()
    return _style_reference_b64


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
    resp = _get_bedrock_image_client().invoke_model(modelId=STYLE_GUIDE_MODEL_ID, body=body)
    payload = json.loads(resp["body"].read())
    images = payload.get("images") or []
    if not images:
        raise ValueError(f"응답에 이미지 없음: {payload.get('finish_reasons')}")
    return base64.b64decode(images[0])


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
STYLE_TRANSFER_MODEL_ID = "us.stability.stable-style-transfer-v1:0"  # us-east-1
# 프로파일 태그 없이 베어 모델 ID를 그대로 쓴다 — 2026-09-08 현재 이
# 서비스군(Stability Image Services 13종)에 application inference profile이
# 아직 안 뜬다(콘솔 확인). 정식 편입 전 비용태깅 상태를 재확인할 것
# (docs/architecture/비용태깅_규칙.md).

_SCENE_TRANSLATE_MODEL_ID = "arn:aws:bedrock:us-east-1:887078546492:application-inference-profile/yirjajon82n7"  # lens-webtoon-script-sonnet-46 재사용

_SCENE_TRANSLATE_SYSTEM = (
    "You compress a Korean scene description into a short English photo-shoot brief "
    "for a real photographer. Output plain English only, 2-3 sentences, under 60 words. "
    "Describe the location, setting, mood, and camera framing as if directing a real "
    "documentary photo shoot with two people (a Korean woman and a Korean man). "
    "Do not mention illustration, cartoon, or any art style — describe it as a real photo."
)

_PHOTOREAL_NEGATIVE_PROMPT = (
    "illustration, cartoon, anime, painting, drawing, third person, extra person, "
    "additional character, third wheel, bystanders, crowd, other people, text, watermark"
)


def translate_scene_to_photo_brief(camera: str, scene: str) -> str:
    """한국어 [SCENE]/[CAMERA] → 짧은 영어 사진 브리핑. bedrock_client.call_text()를
    지연 import한다(이 모듈은 텍스트 호출 없이 이미지 생성만 하는 admin 실험
    패널 등에서도 쓰이므로, 텍스트 클라이언트 초기화 비용을 정말 필요할 때만
    치른다 — _get_bedrock_image_client()의 lazy-import boto3와 같은 이유)."""
    from bedrock_client import call_text  # pipelines/common/ — sibling, flat import

    user = f"[SCENE]\n{scene}\n\n[CAMERA]\n{camera}"
    return call_text(_SCENE_TRANSLATE_SYSTEM, user, model=_SCENE_TRANSLATE_MODEL_ID, max_tokens=200, temperature=0.3)


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
    resp = _get_bedrock_image_client().invoke_model(modelId=BEDROCK_IMAGE_MODEL_ID, body=body)
    payload = json.loads(resp["body"].read())
    images = payload.get("images") or []
    if not images:
        raise ValueError(f"응답에 이미지 없음: {payload.get('finish_reasons')}")
    return base64.b64decode(images[0])


def generate_bedrock_style_transfer_bytes(
    init_image_bytes: bytes,
    *,
    composition_fidelity: float = 0.9,
    style_strength: float = 1.0,
    change_strength: float = 0.9,
) -> bytes:
    """Stable Style Transfer 호출 — init_image(구도)에 style_image(우리
    webtoon_style_reference.png)의 화풍을 입힌다. 기본값은 R11 실측 비교에서
    가장 화풍 일치도가 높았던 조합(style_strength=1.0)."""
    body = json.dumps({
        "init_image": base64.b64encode(init_image_bytes).decode(),
        "style_image": _get_style_reference_b64(),
        "prompt": _STYLE_GUIDE_STYLE_HINT,
        "negative_prompt": _STYLE_GUIDE_NEGATIVE_PROMPT,
        "composition_fidelity": composition_fidelity,
        "style_strength": style_strength,
        "change_strength": change_strength,
        "output_format": "png",
    })
    resp = _get_bedrock_image_client().invoke_model(modelId=STYLE_TRANSFER_MODEL_ID, body=body)
    payload = json.loads(resp["body"].read())
    images = payload.get("images") or []
    if not images:
        raise ValueError(f"응답에 이미지 없음: {payload.get('finish_reasons')}")
    return base64.b64decode(images[0])


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


def generate_bedrock_composed_image_bytes(scene_input: str) -> bytes:
    camera, scene = _parse_style_transfer_scene_input(scene_input)
    brief = translate_scene_to_photo_brief(camera, scene)
    init_prompt = build_photoreal_init_prompt(brief)
    init_bytes = generate_bedrock_photoreal_image_bytes(init_prompt)
    return generate_bedrock_style_transfer_bytes(init_bytes)


def generate_bedrock_composed_image(scene_input: str, out_path: Path, retries: int = 2) -> bool:
    """구도-화풍 분리 3단계(번역→포토리얼→Style Transfer) 전체의 파일-쓰기
    + 재시도 래퍼. 세 호출을 다 묶어서 재시도한다(부분 재시도 없음). 기본
    retries=2(다른 generate_*는 3) — 한 시도당 Bedrock 호출이 3번이라
    기본값 3을 그대로 쓰면 최악의 경우 호출 수가 지나치게 늘어난다."""
    return _retry_generate_and_write(lambda: generate_bedrock_composed_image_bytes(scene_input), out_path, retries)
