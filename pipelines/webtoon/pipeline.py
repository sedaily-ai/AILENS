"""
뉴스 웹툰 파이프라인 — 핵심 엔진
=====================================
기사 1건을 받아 8컷 웹툰(이미지 8장 + 세로 스크롤 1장)을 만든다.

흐름: 스크립트+장면 연출(단일 Bedrock 호출) → 이미지 생성 → 스티칭.
중간 결과(JSON)를 파일로 저장하므로, 중간에 끊겨도 재실행하면 이미 끝난
단계는 건너뛰고 이어서 진행한다(resume). "1단계/2단계" 구분은 2026-09-20
없앴다(아래 call_json 주석 참고) — admin의 실시간 스크립트챗랩과 동일하게
스크립트·장면 연출을 한 호출로 만든다.

2026-08-23 — 1·2단계(스크립트/장면연출) 텍스트 생성을 GPT-4o에서 Bedrock
Claude로 이관(letters/podcast/video와 같은 이유: 텍스트 생성은 전부
Bedrock으로 통일하고 GPT는 3단계 이미지 생성 전용으로만 남긴다). 전용
inference profile `lens-webtoon-script-sonnet-46`
(arn:aws:bedrock:us-east-1:887078546492:application-inference-profile/yirjajon82n7)
사용. OpenAI의 `response_format=json_object`(JSON 강제)에 해당하는 기능이
Bedrock converse API엔 없어서, 프롬프트에 "```json 코드블록 하나로만
응답" 지침을 명시하고 video/generate_script.py와 같은 방식으로 코드블록을
파싱한다.

2026-08-23(같은 날, 나중) — OpenAI 조직 크레딧이 소진돼(insufficient_quota)
3단계 이미지 생성이 전부 실패하는 사고가 나서, Bedrock 이미지 모델로
전환을 검토했다. Nova Canvas(us-east-1)는 "Legacy + 30일 미사용"으로 계정
자체가 막혀 있었고, 콘솔에서 재요청하는 셀프서비스 경로도 이제 없어짐
("Model access 페이지 폐지" 안내만 뜸) — us-west-2에는 Stable Image
Core/Ultra, SD3.5 Large가 살아있어서 그쪽으로 전환. 그런데 실측해보니
Nova Canvas든 SD3.5든 확산 모델 계열은 프롬프트로 요청한 한글 텍스트를
그림 안에 정확히 못 그린다(예: "가계대출 규제 강화"를 요청했는데 의미
없는 한글 비슷한 글자만 나옴). GPT의 image_generation 툴만 이걸 잘 해서
웹툰에 써왔던 것 — 이 능력 자체는 대체가 안 된다.

그래서 Bedrock 경로는 "텍스트 없는 배경 그림"만 생성하고, 말풍선/캡션/
내레이션 텍스트는 `compose_text.py`가 PIL로 직접 그려서 합성한다(텍스트
정확도 100% 보장, 대신 말풍선이 화자 입을 정확히 가리키는 정교한 배치는
포기 — 자세한 트레이드오프는 compose_text.py 상단 설명 참고). GPT 경로
코드(`generate_image`, `build_image_prompt`)는 전혀 안 건드리고 그대로
남겨뒀다. 2026-09-20까지는 `IMAGE_PROVIDER`를 "openai"로 바꾸면 크레딧
충전 후 바로 되돌릴 수 있었는데, 같은 날 이 상수 자체를 없애고 admin이
발행하는 모델 id로 대체하면서(아래 _PROVIDER_CONFIG 참고) "openai"는
그 발행 가능 값 목록(webtoon_image._VALID_IMAGE_MODELS)에 없다 —
되살리려면 그 목록에 추가하고 admin 드롭다운에도 노출해야 한다(둘 다
사업상 미사용 확정이라 일부러 안 함).
"""
import sys, json, base64, re, time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "common"))
import ddb_prompt  # pipelines/common/ — 2026-08-20 letters/podcast와 공용화
from openai_client import get_client  # pipelines/common/ — 2026-08-21 로컬 .env 제거 (이미지 생성 전용)
from bedrock_client import call_text  # 2026-08-23 스크립트/장면연출용
from json_extract import extract_json_object  # pipelines/common/ — 2026-08-23 공용화, 2026-09-04 폴백까지 통합

import prompts
import compose_text
from stitch import stitch

client = get_client()

# 2026-09-27, 사용자 요청 — "클로드 4.6sonnet 빼시고요. 클로드 5.0
# opus로 모든 프로덕션... 업데이트": lens-webtoon-script-opus-5(2026-09-20에
# admin CMS 드롭다운용으로 이미 만들어져 있던 프로파일을 그대로 프로덕션
# 기본값으로 승격 — 새로 안 만듦)로 교체. admin/backend/routes/prompts.py::
# _CATEGORY_BEDROCK["webtoon"]과 반드시 같은 ARN을 유지할 것.
SCRIPT_MODEL = "arn:aws:bedrock:us-east-1:887078546492:application-inference-profile/j5kfly25ohjo"  # lens-webtoon-script-opus-5
IMAGE_MODEL = "gpt-5.5"          # 이미지 생성 모델 (Responses API의 image_generation 툴)
IMAGE_SIZE = "1536x1024"         # 3:2 가로. 컷당 $0.165 (2026-08 기준, high quality)
IMAGE_QUALITY = "high"
N_CUTS = 8

# 2026-09-05~2026-09-20 이 자리엔 IMAGE_PROVIDER 코드 상수(문자열 enum,
# "bedrock-sd-ultra"/"bedrock-style-transfer"/...)가 있었다 — 모델을
# 바꾸려면 이 파일을 고쳐 재배포해야 했다(Stable Image Core→Style
# Guide→Style Transfer→Ultra 전환이 전부 이 방식이었다, 각 전환 경위는
# git log 참고).
#
# 2026-09-20(정리후보 A 후속, "CMS에서 저장하면 다음 발행부터 자동
# 반영" 요청) — admin이 STYLE/CHARACTER_FEMALE/CHARACTER_MALE을 DDB
# (webtoon-image/published)에 발행하면 재배포 없이 바로 반영되는 것과
# 같은 방식으로, 어떤 모델을 쓸지도 그 문서의 IMAGE_MODEL 섹션에서
# 매 컷 생성 직전 fresh하게 읽는다(webtoon_image.get_active_image_model(),
# run_article() 참고) — 코드 상수는 더 이상 없다.
#
# 모델 id → webtoon_image.generate_cut_image_to_file() 호출 인자 매핑
# (run_article() 컷 루프가 씀). retries=3 — 나머지 generate_bedrock_*
# 함수 기본값과 동일.
#
# 2026-09-20 — QA(사극 오염·인물 없음 위반·고정 인물 수 초과 검사 후
# 조건부 재생성)를 전부 제거했다(사용자 요청, webtoon_image.py의
# generate_cut_image() 독스트링 참고) — 그래서 with_qa/check_extra_people
# 키가 없어졌다.
#
# 2026-09-25, 사용자 결정 — "pipeline"(GPU IP-Adapter+Style Transfer)·
# "style_guide"(레퍼런스 이미지 화풍) 키를 뺐다. 발행 문서에 IMAGE_MODEL이
# 한 번도 없어 실제로는 둘 다 쓰인 적이 없었다(sd_ultra로 계속 폴백) —
# GPU 기동 분기(run_article()가 예전에 갖고 있던 manage_gpu 로직)도
# 같이 삭제했다. 아래 3개는 admin webtoonImageModels.ts의 IMAGE_MODELS[].id·
# webtoon_image._VALID_IMAGE_MODELS와 같은 어휘(다만 sd35_large/
# stable_image_core는 UI 드롭다운엔 이제 없고 코드에만 남아있다 —
# webtoonImageModels.ts 주석 참고).
_PROVIDER_CONFIG = {
    "sd_ultra": dict(retries=3),
    "stable_image_core": dict(retries=3),
    "sd35_large": dict(retries=3),
}

# 2026-09-05 — 여기 있던 _characters_block/_SCENE_REINFORCEMENT/
# _CHARACTER_REINFORCEMENT/build_background_prompt/BEDROCK_IMAGE_REGION/
# BEDROCK_IMAGE_MODEL_ID/BEDROCK_ASPECT_RATIO/generate_image_bedrock 전부
# common/webtoon_image.py로 옮겼다(admin 콘솔의 "이미지 실험" 패널도 이
# 로직이 그대로 필요해져서 — 그 모듈 docstring 참고).
#
# 2026-09-20 — 컷 생성·QA·재시도 디스패치(_generate_and_qa_cut/
# _validate_and_detect, 아래에 있었음) 자체를 걷어내고
# webtoon_image.generate_cut_image_to_file() 한 호출로 대체했다(정리후보
# A+D Phase 3 — admin 실험 패널과 발행 파이프라인이 같은 디스패치를 쓰게
# 통일, 이번 phase는 IMAGE_PROVIDER를 그대로 유지해 동작은 100% 동일).
# _characters_block/_SCENE_REINFORCEMENT/_CHARACTER_REINFORCEMENT는 아래
# GPT 경로(build_image_prompt, IMAGE_PROVIDER="openai", 휴면)가 여전히
# 써서 남겨뒀다.
from webtoon_image import (
    generate_cut_image_to_file,
    get_active_image_model,
    characters_block as _characters_block,
    SCENE_REINFORCEMENT as _SCENE_REINFORCEMENT,
    CHARACTER_REINFORCEMENT as _CHARACTER_REINFORCEMENT,
)

_JSON_INSTRUCTION = (
    "\n\n[응답 형식]\n다른 설명 없이 ```json 코드블록 하나 안에 JSON 객체만 담아 응답한다."
)


# 2026-09-26 — "당신은 뉴스 웹툰 제작자입니다"라는 페르소나·주제 고정
# 문구를 뺐다(admin/backend/routes/prompts.py::_WEBTOON_SYSTEM_PROMPT와
# 동일 이유 — 이 파일은 그쪽 script.py::build_script_call을 그대로 이식한
# 포크라 원본이 바뀌면 같이 갱신한다, 위 모듈 docstring 참고). JSON
# 스키마를 지키라는 부분만 남긴다 — 스키마 자체는 저장된 지침 22장에서
# 온다, 응답 파싱에 실제로 필요한 부분만 유지.
_SYSTEM_PROMPT = "지시받은 JSON 스키마를 정확히 지켜 응답합니다."


def call_json(prompt: str, debug_path: Path | None = None, max_tokens: int = 4000) -> dict:
    """Bedrock Claude에 JSON 응답을 요청한다.

    2026-08-23 — max_tokens을 2000→4000으로 올렸다(당시엔 1·2단계 두 호출이
    이 한도를 공유). 그런데 저장된 웹툰 프롬프트가 2026-09-14 v11로 갱신되며
    컷당 필드가 훨씬 많은 스키마로 바뀌어 2단계 응답이 8컷을 다 채우기 전에
    잘리는 실패가 반복됐고(admin 쪽은 2026-09-15에 max_tokens=8000으로 올려
    해결 — admin/backend/routes/prompts.py의 _CATEGORY_BEDROCK["webtoon"]
    주석 참고), 이 파이프라인은 그 갱신을 놓치고 있었다. 게다가 2026-09-18
    "1단계/2단계 구분 제거" 프롬프트 개편으로 발행 프롬프트 문서에서
    "1단계 출력"/"2단계 출력" 섹션 자체가 사라졌는데도(문서엔 이제 "Stage 1
    Script Output Format" 하나만 있음) 이 함수 호출부는 여전히 그 이름을
    참조하고 있어서, 모델이 스키마 없이 매번 다른(점점 더 장황해지는)
    JSON 구조를 즉흥적으로 만들어내며 잘림을 가속시켰다 — 2026-09-20
    run_batch.py 사전 점검 중 재현 확인. run_article()을 admin의
    build_script_call() 패턴(단일 호출+max_tokens=8000)과 맞춰 이 두 문제를
    한 번에 해소했다(아래 SCRIPT_CHAPTERS/normalize_cuts 참고) — 이 함수의
    기본값 4000은 다른 단순 호출부(generate_meta.py)엔 그대로 맞는다.

    debug_path — 파싱 실패 시 원문 응답을 저장해서 원인을 사후에 볼 수
    있게 한다(이게 없어서 오늘 실패 원인을 추정만 하고 확인은 못 했다).
    성공하면 안 남긴다(디스크 낭비 방지).

    2026-09-27 — SCRIPT_MODEL이 Opus 5로 바뀐 뒤 전체 발행 회차가 전부
    ValidationException("`temperature` is deprecated for this model")으로
    죽던 걸 실측(CloudWatch)으로 확인 — Sonnet 4.6 시절 남아있던 고정
    temperature=0.7을 제거한다. bedrock_client.call_text()는 temperature가
    None이면 inferenceConfig에 아예 안 넣으므로(모듈 docstring 2026-08-22
    항목 참고) 모델별 지원 여부를 신경 쓸 필요가 없다."""
    raw = call_text(_SYSTEM_PROMPT, prompt + _JSON_INSTRUCTION, model=SCRIPT_MODEL, max_tokens=max_tokens)
    try:
        return extract_json_object(raw)
    except ValueError:
        # 파일 저장은 같은 컨테이너 생애주기 안에서만 유효(Fargate 태스크가
        # 끝나면 /tmp도 같이 사라짐) — 실제 사후 확인은 CloudWatch 로그로
        # 하게 되니 원문도 같이 찍는다(길면 로그가 너무 커져서 2000자로 컷).
        if debug_path is not None:
            debug_path.parent.mkdir(parents=True, exist_ok=True)
            debug_path.write_text(raw, encoding="utf-8")
        print(f"    [call_json] 파싱 실패 원문(최대 2000자):\n{raw[:2000]}")
        raise


# ─────────────────────────────────────────────────────────────
# 스크립트+장면 연출 단일 호출 — admin/backend/routes/webtoon/script.py의
# build_script_call()/normalize_cuts()를 그대로 이식했다(2026-09-20). admin
# Lambda와 이 ECS 파이프라인은 서로 다른 배포 표면이라 코드를 직접 공유할
# 수 없어서(admin은 flat-copy, 여긴 sys.path 기반) 포크 형태로 복사 —
# 원본 쪽이 바뀌면(예: SCRIPT_CHAPTERS 챕터 번호, 스키마 필드명 변경) 이쪽도
# 같이 갱신해야 한다는 뜻. 두 곳을 공유 모듈로 합치는 건 이번 범위 밖
# (정리후보로 별도 기록 필요).
_CHAPTER_HEADER_RE = re.compile(r"^##\s*(\d+)\.\s*.+$", re.MULTILINE)
_KNOWN_GARBAGE_MARKERS = ("### 파일 · 새 파일",)  # admin 편집 UI 라벨이 섞여 들어간 흔적


def _extract_chapters(content: str, chapter_numbers: list[int]) -> str:
    """"## N. 제목" 헤더로 구분된 챕터 중 번호가 일치하는 것만 뽑아 순서대로
    이어붙인다. 같은 번호가 여러 번 나오면 가장 마지막 사본만 쓴다."""
    matches = list(_CHAPTER_HEADER_RE.finditer(content))
    if not matches:
        return content

    starts = [m.start() for m in matches]
    last_start_by_num: dict[int, int] = {}
    for m in matches:
        last_start_by_num[int(m.group(1))] = m.start()

    parts = []
    for num in chapter_numbers:
        start = last_start_by_num.get(num)
        if start is None:
            continue
        end = next((s for s in starts if s > start), len(content))
        chunk = content[start:end]
        for marker in _KNOWN_GARBAGE_MARKERS:
            idx = chunk.find(marker)
            if idx != -1:
                chunk = chunk[:idx].rstrip()
        parts.append(chunk.strip())
    return "\n\n".join(parts)


# 사실분석+장면설계+텍스트화이트리스트+공통이미지스타일 챕터만 — 3단계
# 이미지 화풍/발행 규칙(16~21장) 등 스크립트·장면 연출에 불필요한 챕터는
# 뺀다(admin script.py SCRIPT_CHAPTERS와 동일).
_SCRIPT_CHAPTERS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 22]

_SCRIPT_OUTPUT_ADDENDUM = (
    "\n\n---\n### 출력 형식 (코드 보강)\n"
    "위 \"Stage 1 Script Output Format\" JSON 스키마 그대로 컷 8개를 채우되,"
    " 각 cuts 원소마다 다음 필드를 추가한다:\n"
    '- "image_prompt": 이 컷의 배경 이미지를 그대로 생성할 수 있는 완성된'
    " 한국어 프롬프트 문장 하나. 어떤 장면 포맷(12장 Scene Design 목록)을"
    " 쓸지, 카메라를 어떻게 잡을지는 기사 내용에 맞춰 자유롭게 판단한다 —"
    " 코드가 카메라 거리/앵글/구도 등을 항목별로 강제하지 않는다, 12장"
    " 지침(연속 구도 금지·요소 다양화)만 따르면 된다.\n"
    "다른 설명 없이 JSON 객체 하나만 응답한다."
)


def _cut_number(d: dict) -> int | None:
    """v11 스키마는 컷 번호를 정수 "cut" 대신 문자열 "cut_id"("cut_01")로
    준다 — 둘 다 받는다.

    2026-09-26 — admin script.py::_cut_number와 동일 결정(그쪽 docstring
    참고, 실제 chat_threads 저장 데이터 조회로 8컷 전부 "cut": None인 걸
    확인) — 이 파일이 진짜 자동 발행 파이프라인이라 같은 스키마·같은
    모델을 쓰면 동일하게 실패할 수 있어 여기도 같이 방어한다. int로 안
    잡히는 문자열/소수 값도 구제한다."""
    n = d.get("cut")
    if isinstance(n, bool):
        pass
    elif isinstance(n, int):
        return n
    elif isinstance(n, float) and n.is_integer():
        return int(n)
    elif isinstance(n, str) and n.strip().isdigit():
        return int(n.strip())
    cut_id = d.get("cut_id") or d.get("id")
    if isinstance(cut_id, str):
        digits = "".join(ch for ch in cut_id if ch.isdigit())
        if digits:
            return int(digits)
    return None


def _first_nonempty(*values: object) -> str:
    for v in values:
        if isinstance(v, str) and v.strip():
            return v
    return ""


def _dialogue_from_bubbles(c: dict) -> list[dict]:
    """v11 스키마는 "dialogue" 배열 대신 bubble_1/bubble_2로 준다 — 구도
    없이 만들어진 옛 dialogue 스키마와 나란히 지원."""
    if c.get("dialogue"):
        return c["dialogue"]
    lines = []
    for key in ("bubble_1", "bubble_2"):
        b = c.get(key)
        if isinstance(b, dict) and b.get("text"):
            speaker = "A" if b.get("speaker") == "female" else "B" if b.get("speaker") == "male" else key
            lines.append({"speaker": speaker, "line": b["text"]})
    return lines


def _normalize_cuts(script: dict) -> list[dict]:
    """단일 호출 결과의 cuts를 컷 이미지 생성·compose_text.py가 기대하는
    필드 이름(image_prompt/dialogue/title/narration/caption)으로 정규화.

    2026-09-20 — camera/scene 2필드를 image_prompt 하나로 합쳤다(admin
    script.py::normalize_cuts와 동일 결정, 사유는 그쪽 docstring 참고).

    2026-09-26 — _cut_number()가 그래도 None이면 배열 순서를 최후 수단으로
    쓴다(admin script.py::normalize_cuts와 동일 결정·동일 이유 — 실제
    발행 컷 파일명이 `컷{n}.png`라 n이 None이면 8컷이 전부 같은 파일명에
    덮어써질 수 있는 심각한 버그였다)."""
    cuts = []
    for idx, c in enumerate(script.get("cuts") or [], start=1):
        cut_number = _cut_number(c)
        cuts.append({
            "cut": cut_number if cut_number is not None else idx,
            "narration": _first_nonempty(c.get("narration"), c.get("new_conclusion")),
            "caption": _first_nonempty(c.get("caption"), c.get("keyword")),
            "closing_caption": c.get("closing_caption") or "",
            "title": _first_nonempty(c.get("title"), c.get("headline")),
            "title_keyword": c.get("title_keyword") or "",
            "dialogue": _dialogue_from_bubbles(c),
            "image_prompt": c.get("image_prompt") or "",
        })
    return cuts


def build_image_prompt(image_prompt: str, cut: dict, characters: dict | None = None) -> str:
    """2단계(장면) + 1단계(대사) 결과를 3단계 이미지 프롬프트로 합친다."""
    style = prompts.get_style() + "\n3:2 horizontal."
    parts = [
        style, _characters_block(characters), f"\n\n[SCENE]\n{image_prompt}", _SCENE_REINFORCEMENT,
        _CHARACTER_REINFORCEMENT if characters else "",
    ]
    if cut.get("narration"):
        parts.append(prompts.narration(cut["narration"]))
    if cut.get("caption"):
        parts.append(prompts.caption(cut["caption"]))
    if cut.get("dialogue"):
        pairs = [(d["speaker"], d["line"], d.get("tone", "보통")) for d in cut["dialogue"]]
        parts.append(prompts.bubbles(*pairs))
    return "".join(parts)


# 2026-08-21 자동 발행 파이프라인(pipelines/frontpage_auto) 실사용 테스트 중
# 발견 — 이 호출에 타임아웃이 없어서, 응답이 그냥 안 오면(서버 쪽 hang으로
# 추정, 재현은 못 함) 아래 재시도 로직이 있으나 마나 하게 무한정 대기했다
# (한 컷에서 20분+ 멈춰서 결국 프로세스를 강제 종료해야 했음). 컷5처럼
# 정상적으로도 ~10분 걸리는 경우가 있어(느리지만 진짜 진행 중) 너무 짧게
# 잡으면 멀쩡한 호출을 오탐으로 죽인다 — 9분으로 넉넉히 잡아 진짜 hang만
# 걸러낸다. Fargate에서 무인 실행할 때 이게 없으면 태스크 하나가 영원히
# 안 끝나 그날 자동 발행 전체가 막힌다.
_IMAGE_TIMEOUT_SECONDS = 540


def generate_image(prompt: str, out_path: Path, retries: int = 3) -> bool:
    """이미지 1장 생성. 실패 시 최대 retries회 재시도(지수 백오프)."""
    for attempt in range(retries):
        try:
            resp = client.responses.create(
                model=IMAGE_MODEL,
                input=prompt,
                tools=[{
                    "type": "image_generation",
                    "quality": IMAGE_QUALITY,
                    "size": IMAGE_SIZE,
                    "output_format": "png",
                }],
                timeout=_IMAGE_TIMEOUT_SECONDS,
            )
            for output in resp.output:
                if getattr(output, "type", "") == "image_generation_call":
                    out_path.parent.mkdir(parents=True, exist_ok=True)
                    out_path.write_bytes(base64.b64decode(output.result))
                    return True
            raise ValueError("응답에서 이미지를 찾을 수 없음")
        except Exception as e:
            if attempt < retries - 1:
                wait = (attempt + 1) * 12
                print(f"    ⚠️  오류: {e} → {wait}초 후 재시도...")
                time.sleep(wait)
            else:
                print(f"    ❌ 최종 실패: {e}")
                return False
    return False


# 2026-09-02 — 한때 "생성→비전 모델로 검증→나쁘면 재생성" QA 루프가
# 여기 있었다(기자 피드백 대응, 실측으로 사극 오염 재현율 약 25% 확인).
# 2026-09-20 사용자 요청으로 이 QA 자체를 완전히 제거했다 — admin 실험
# 패널은 QA를 기본 안 썼는데 발행 파이프라인만 하드코딩으로 켜고 있어서
# "CMS로만 제어돼야 한다" 원칙에 안 맞았다(webtoon_image.py의
# generate_cut_image() 독스트링 참고). 말풍선 배치용 얼굴 위치 감지
# (Rekognition)는 2026-09-28에 완전히 제거했다(사용자 결정 — 아래
# faces 주석 참고).

def run_article(name: str, article_path: str, output_root: Path = Path("."), resume: bool = True,
                 manage_gpu: bool = True):
    """기사 1건 → 8컷 웹툰 전체 파이프라인. name은 출력 폴더명.

    manage_gpu=False(2026-09-10) — frontpage_auto/mustknow_auto가 기사
    여러 건을 순차 처리할 때, 기사마다 이 함수가 GPU를 껐다 켜면(부팅+SSM
    온라인 대기만 기사당 수십 초~분) 배치 전체가 크게 느려진다(실측: 오늘
    실행에서 기사 하나 끝날 때마다 GPU 재부팅하는 게 로그로 확인됨). 호출부
    (run.py main())가 배치 시작 시 한 번만 켜고 끝나면 한 번만 끄도록
    바뀌면서, 그 경우엔 이 함수가 켜고 끄지 않게 이 플래그로 막는다.
    단독 호출(백필 스크립트 등)은 기본값 True로 기존처럼 자체 관리."""
    out = output_root / name
    out.mkdir(parents=True, exist_ok=True)
    article = Path(article_path).read_text(encoding="utf-8")
    tag = f"[{name}]"

    # admin 프롬프트 드로어(webtoon 탭)에 저장된 지침 — 스크립트+장면 연출
    # 프롬프트를 여기서 매번 새로 조립한다. 이 함수 안에서 딱 한 번만
    # fetch(재실행 resume 경로에서도 굳이 다시 부르지 않도록 스킵 분기보다
    # 위에 둔다).
    guide = ddb_prompt.load_prompt("webtoon")

    # 스크립트+장면 연출: admin script.py::build_script_call()과 동일하게
    # 단일 호출로 처리(2026-09-20, 위 call_json/_normalize_cuts 주석 참고
    # — "1단계/2단계" 구분과 그로 인한 응답 잘림 문제를 여기서 없앴다).
    script_path = out / "1_script.json"
    if resume and script_path.exists():
        print(f"{tag} 스크립트+장면 연출 재사용")
        script = json.loads(script_path.read_text(encoding="utf-8"))
    else:
        print(f"{tag} 스크립트+장면 연출 생성")
        script_prompt = (
            _extract_chapters(guide, _SCRIPT_CHAPTERS)
            + "\n\n---\n[지금 할 일]\n위 지침을 참고해서 스크립트와 장면 연출을"
            " 한 번에 만든다.\n\n[입력 기사]\n"
            + article
            + _SCRIPT_OUTPUT_ADDENDUM
        )
        # 2026-09-27 — temperature 제거 후 실측(로컬 재현, 1_raw_response.txt)
        # 으로 확인: Opus 5가 컷당 영/한 image_prompt를 둘 다 길게 쓰는
        # 지금 지침 아래에서는 8000으로도 8컷을 다 채우기 전에 멀티바이트
        # 문자 중간에서 응답이 잘렸다(마지막 몇 바이트가 깨진 유니코드
        # replacement 문자로 확인) — extract_json_object가 그 잘린 JSON을
        # 못 읽어 "웹툰 실패"로 이어졌다. admin/backend/routes/prompts.py::
        # _CATEGORY_BEDROCK["webtoon"]도 같은 8000이라 admin 실험 도구도
        # 똑같이 잘릴 것 — 거기도 같이 올려서 어긋나지 않게 한다.
        script = call_json(script_prompt, debug_path=out / "1_raw_response.txt", max_tokens=16000)
        script_path.write_text(json.dumps(script, ensure_ascii=False, indent=2), encoding="utf-8")

    cuts = _normalize_cuts(script)

    # 3단계: 이미지 생성
    print(f"{tag} 3단계 이미지 생성 ({N_CUTS}컷)")
    # 2026-09-05 — 기사마다 script.get("characters")로 새로 짓던 인물 묘사
    # 대신, 고정 진행자 2인(prompts.get_fixed_characters())을 항상 쓴다 —
    # "AI Lens 웹툰" 포맷 도입(prompts.py STYLE 근처 "겪었던 문제 4" 참고).
    # 2026-09-04부터 이 값은 admin이 발행한 DDB가 정본이라 컷 루프 밖에서
    # 한 번만 가져온다(fresh하되 같은 기사 안 8컷은 일관되게 같은 값 사용).
    characters = prompts.get_fixed_characters()

    # 2026-09-20 — 어떤 모델을 쓸지도 admin이 발행한 DDB에서 이 기사
    # 처리를 시작할 때 딱 한 번 fresh하게 읽는다(위 characters와 같은
    # 이유·같은 문서, get_active_image_model() 참고) — 관리자가 저장한
    # 값이 재배포 없이 다음 기사부터 바로 반영된다.
    active_model = get_active_image_model()

    # 2026-09-25 — 여기 있던 GPU 기동 분기("pipeline" 모델일 때만
    # 배치 시작 시 한 번 켜고 끝나면 끄던 로직)를 삭제했다 — pipeline
    # 모델 자체를 뺐다(모듈 상단 주석, webtoon_image.py 참고). manage_gpu
    # 인자는 frontpage_auto/mustknow_auto의 run.py가 여전히 넘기고 있어
    # 시그니처는 남겨뒀지만 이제 아무 분기도 안 탄다(무해한 미사용 인자
    # — 그쪽 두 파일까지 같이 고치는 건 이번 정리 범위 밖).

    for cut in cuts:
        n = cut["cut"]
        img_path = out / f"컷{n}.png"
        if resume and img_path.exists():
            print(f"{tag} 컷{n} 스킵(존재)")
            continue
        print(f"{tag} 컷{n} 생성 중... ({active_model})")
        if active_model in _PROVIDER_CONFIG:
            cfg = _PROVIDER_CONFIG[active_model]
            ok, faces = generate_cut_image_to_file(
                "", cut["image_prompt"], active_model, img_path,
                has_dialogue=bool(cut.get("dialogue")) or n == 1,
                retries=cfg["retries"],
            )
            if ok:
                # faces는 항상 None(2026-09-28, Rekognition 얼굴 감지
                # 제거 — webtoon_image.py::generate_cut_image() 독스트링
                # 참고). compose_text.compose()가 균등 분할로 폴백한다.
                try:
                    compose_text.compose(img_path, cut, faces)
                except Exception as e:
                    print(f"{tag} 컷{n} 텍스트 합성 실패(배경은 유지): {e}")
        else:
            prompt = build_image_prompt(cut["image_prompt"], cut, characters)
            ok = generate_image(prompt, img_path)
        print(f"{tag} 컷{n} {'완료' if ok else '실패'}")

    # 세로 스크롤 합치기
    try:
        stitch(out, N_CUTS)
        print(f"{tag} 스크롤 합치기 완료")
    except Exception as e:
        print(f"{tag} 스티칭 실패: {e}")

    print(f"{tag} ==== 전체 완료 ====")
