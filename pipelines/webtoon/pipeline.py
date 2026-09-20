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
남겨뒀다 — `IMAGE_PROVIDER`를 "openai"로 바꾸면 크레딧 충전 후 바로
원래 방식으로 되돌릴 수 있다.
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

SCRIPT_MODEL = "arn:aws:bedrock:us-east-1:887078546492:application-inference-profile/yirjajon82n7"  # lens-webtoon-script-sonnet-46
IMAGE_MODEL = "gpt-5.5"          # 이미지 생성 모델 (Responses API의 image_generation 툴)
IMAGE_SIZE = "1536x1024"         # 3:2 가로. 컷당 $0.165 (2026-08 기준, high quality)
IMAGE_QUALITY = "high"
N_CUTS = 8

# "openai"(원래 GPT 경로, 말풍선까지 이미지 모델이 그림, 휴면·사업상 미사용) |
# "bedrock"(Stable Image Core, 순수 텍스트 프롬프트, 휴면) | "bedrock-style-guide"
# (Stable Image Style Guide, 참고 이미지로 화풍 고정, 휴면) | "bedrock-style-transfer"
# (구도-화풍 분리 3단계, GPU IP-Adapter — 2026-09-08~2026-09-20 기본값,
# 이제 휴면·롤백용) | "bedrock-sd-ultra"(Stable Image Ultra, GPU 없음 —
# 2026-09-20부터 기본값). 전부 텍스트는 compose_text.py가 합성(openai만
# 예외 — 모델이 직접 그림).
#
# bedrock → bedrock-style-guide 전환 경위: 사용자가 공유한 참고 샘플과
# 대조한 결과 Stable Image Core 순수 텍스트 프롬프트는 "cel-shaded, NOT
# photorealistic"을 명시해도 반실사 디지털 페인팅으로 나오는 화풍 자체의
# 한계가 있었다. Style Guide는 참고 이미지(webtoon_image.py의
# STYLE_REFERENCE_IMAGE_PATH)로 화풍을 고정해 실측상 훨씬 근접했다.
#
# bedrock-style-guide → bedrock-style-transfer 전환 경위(R9~R11,
# 라운드기록.md 참고) — Style Guide는 화풍+장면을 한 프롬프트에 동시에
# 요구해서 [SCENE]이 "카페"라고 해도 계속 참고 이미지의 배경(영화
# 촬영장)으로 쏠렸다(#4). negative_prompt로 완화해봤지만 확률적이었고,
# R11에서 "화풍 지정 없이 사진처럼 요청하면 같은 모델이 장소 지시를
# 정확히 따른다"는 걸 실측 확인 — 문제는 장소 이해력이 아니라 화풍+장면
# 동시 요구 자체였다. webtoon_image.generate_bedrock_composed_image()가
# (1)한국어 장면→영어 사진 브리핑 번역 (2)포토리얼 사진 생성 (3)Style
# Transfer로 화풍만 덧입히기 3단계로 이 둘을 분리한다. 컷당 Bedrock
# 호출이 1~2회→3회로 늘어 비용·시간이 늘어나는 트레이드오프가 있었다.
#
# bedrock-style-transfer → bedrock-sd-ultra 전환 경위(2026-09-20, 정리후보
# A+D Phase 4) — "GPU를 꼭 써야할까요? 인물을 고정할 필요도 없거든"
# (2026-09-18) 결정에 따라 admin 실험 패널은 이미 Stable Image Ultra를
# 기본값으로 확정했지만, 발행 파이프라인은 Phase 3까지도 구조만 공유
# 디스패치로 옮기고 IMAGE_PROVIDER 자체는 그대로 뒀다(구조 변경과 모델
# 전환을 한 배포에 같이 실으면 문제 발생 시 원인 구분이 안 되므로 —
# 02-정리후보/04-GPU경로결정미반영.md 참고). 이번이 실제 전환 배포다.
# GPU IP-Adapter(인물 고정)·Style Transfer(화풍 분리) 둘 다 더 이상
# 필요 없다고 판단했으므로 아래 컷 루프의 provider→model 매핑 표에서
# "bedrock-sd-ultra"만 실사용, GPU 기동 분기(`manage_gpu and IMAGE_PROVIDER
# == "bedrock-style-transfer"`)는 이 값이 더 이상 매칭되지 않아 자연히
# 안 탄다 — GPU EC2 인스턴스 자체는 1~2주 안정화 확인 전까지 삭제하지
# 않는다(롤백 경로 유지, task-policy.json의 WebtoonGpu* 권한도 유지).
IMAGE_PROVIDER = "bedrock-sd-ultra"

# IMAGE_PROVIDER 문자열 → webtoon_image.generate_cut_image_to_file() 호출
# 인자 매핑(run_article() 컷 루프가 씀). retries는 기존 개별 함수 기본값을
# 그대로 유지(pipeline→2 — generate_bedrock_composed_image가 컷당 Bedrock
# 호출 3회라 더 짧게 잡혀 있던 이유는 webtoon_image.py 해당 함수 docstring
# 참고, 나머지→3).
#
# with_qa/check_extra_people(Phase 4 QA 정책, 2026-09-20) — sageuk(사극
# 오염)·no_people_violated(인물 없음 위반) 검사는 프롬프트가 아니라
# 결과물을 검사하는 후처리라 "프롬프트 외 영향 요인 없음" 원칙과 성격이
# 다르다(실제 독자에게 나가는 안전망이라 Ultra 경로에서도 유지).
# extra_people(고정 인물 수 초과 시 재생성)만은 "군중을 그려달라"는
# 정당한 사용자 지시와 충돌할 수 있어(admin이 pipeline 외 모델에서 QA
# 자체를 끈 이유와 같은 맥락) Ultra 경로는 이것만 끈다 —
# webtoon_image.generate_cut_image()의 check_extra_people 파라미터 참고.
_PROVIDER_CONFIG = {
    "bedrock-sd-ultra": dict(model="sd_ultra", retries=3, with_qa=True, check_extra_people=False),
    "bedrock-style-transfer": dict(model="pipeline", retries=2, with_qa=None, check_extra_people=True),
    "bedrock-style-guide": dict(model="style_guide", retries=3, with_qa=None, check_extra_people=True),
    "bedrock": dict(model="stable_image_core", retries=3, with_qa=None, check_extra_people=True),
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
    characters_block as _characters_block,
    SCENE_REINFORCEMENT as _SCENE_REINFORCEMENT,
    CHARACTER_REINFORCEMENT as _CHARACTER_REINFORCEMENT,
)

_JSON_INSTRUCTION = (
    "\n\n[응답 형식]\n다른 설명 없이 ```json 코드블록 하나 안에 JSON 객체만 담아 응답한다."
)


_SYSTEM_PROMPT = "당신은 뉴스 웹툰 제작자입니다. 지시받은 JSON 스키마를 정확히 지켜 응답합니다."


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
    성공하면 안 남긴다(디스크 낭비 방지)."""
    raw = call_text(_SYSTEM_PROMPT, prompt + _JSON_INSTRUCTION, model=SCRIPT_MODEL, max_tokens=max_tokens, temperature=0.7)
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
    " 각 cuts 원소마다 다음 두 필드를 추가한다:\n"
    '- "camera": 카메라 거리·앵글을 서술하는 한국어 문장.\n'
    '- "scene": 구도·배경·인물 동작·소품을 서술하는 한국어 문장(12장'
    " Scene Design 지침 반영, 8컷 연속 동일 구도 금지).\n"
    "다른 설명 없이 JSON 객체 하나만 응답한다."
)


def _cut_number(d: dict) -> int | None:
    """v11 스키마는 컷 번호를 정수 "cut" 대신 문자열 "cut_id"("cut_01")로
    준다 — 둘 다 받는다."""
    n = d.get("cut")
    if isinstance(n, int):
        return n
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
    필드 이름(camera/scene/dialogue/title/narration/caption)으로 정규화."""
    cuts = []
    for c in script.get("cuts") or []:
        cuts.append({
            "cut": _cut_number(c),
            "narration": _first_nonempty(c.get("narration"), c.get("new_conclusion")),
            "caption": _first_nonempty(c.get("caption"), c.get("keyword")),
            "closing_caption": c.get("closing_caption") or "",
            "title": _first_nonempty(c.get("title"), c.get("headline")),
            "title_keyword": c.get("title_keyword") or "",
            "dialogue": _dialogue_from_bubbles(c),
            "camera": c.get("camera") or "",
            "scene": c.get("scene") or "",
        })
    return cuts


def build_image_prompt(camera: str, scene: str, cut: dict, characters: dict | None = None) -> str:
    """2단계(장면) + 1단계(대사) 결과를 3단계 이미지 프롬프트로 합친다."""
    style = prompts.get_style() + f"\nCamera: {camera}. 3:2 horizontal."
    parts = [
        style, _characters_block(characters), f"\n\n[SCENE]\n{scene}", _SCENE_REINFORCEMENT,
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


# 2026-09-02 — 기자 피드백("컷마다 캐릭터가 다르다", "말풍선이 인물과
# 연결 안 됨") 대응 3종 세트 중 "생성→검증→재시도" 루프. 실측(같은 날)으로
# 확인한 근본 원인: Stable Image Core/SD3.5/Ultra 전부 **완전히 동일한
# 프롬프트**로도 결과가 크게 요동친다(사극 오염 재현율 약 25%, 장면
# 이행력도 실행마다 딴판). 프롬프트를 아무리 다듬어도 이 변동성 자체는
# 못 없앤다는 게 오늘의 결론이라, 프롬프트 수정 대신 "결과물을 비전
# 모델로 검사해서 나쁘면 다시 뽑는" 방식으로 우회한다 — 확률을 낮추는
# 게 아니라 나쁜 뽑기를 걸러내는 접근.
#
# 같은 호출에서 얼굴 x좌표도 같이 받아온다(말풍선 동적 배치용, compose_text.
# draw_dialogue 참고) — 검증과 별도 호출로 나누면 비전 모델 호출이 2배가
# 되니 한 번에 처리. 프롬프트 본문(VALIDATE_SYSTEM)은 prompts.py에 있다
# — 다른 프롬프트 상수들과 위치를 통일했을 뿐, admin 편집·DDB 동기화
# 대상은 아니다(prompts.py의 해당 섹션 주석 참고).
#
# 2026-09-20 — 이 루프의 실제 구현(_validate_and_detect_cut, extra_people
# 체크)은 common/webtoon_image.py의 generate_cut_image()로 옮겼다(정리후보
# A+D Phase 3) — 위 배경·근거는 그대로 유효하다.

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
        script = call_json(script_prompt, debug_path=out / "1_raw_response.txt", max_tokens=8000)
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

    # 2026-09-09(R15) — bedrock-style-transfer 경로는 컷별로(한 명만 나오는
    # 클로즈업이면) GPU IP-Adapter를 탈 수도, 안 탈 수도 있다(webtoon_image.
    # generate_bedrock_composed_image_bytes()가 컷마다 판단) — 어느 컷이
    # 쓸지 루프 전엔 모르니, 이 프로바이더면 배치 시작 시 한 번만 GPU를
    # 켜두고 8컷 다 끝난 뒤(또는 예외로 중단돼도) 한 번만 끈다. 매 컷마다
    # 켜고 끄면 g4dn.xlarge 부팅·SSM 연결 대기(수십 초~분 단위)가 컷마다
    # 반복돼 배치가 크게 느려진다.
    gpu_started = False
    if manage_gpu and IMAGE_PROVIDER == "bedrock-style-transfer":
        import gpu_ipadapter  # pipelines/common/ — sibling
        gpu_ipadapter.ensure_gpu_running()
        gpu_started = True

    try:
        for cut in cuts:
            n = cut["cut"]
            img_path = out / f"컷{n}.png"
            if resume and img_path.exists():
                print(f"{tag} 컷{n} 스킵(존재)")
                continue
            print(f"{tag} 컷{n} 생성 중... ({IMAGE_PROVIDER})")
            if IMAGE_PROVIDER in _PROVIDER_CONFIG:
                # 2026-09-09(R17) — 배경 인물 초과 체크(QA의 extra_people)를
                # 원래 "대사 있는 컷만"으로 한정했는데, 컷1(표지)은 대사가
                # 없어서 이 게이트를 안 타 인물 수가 계속 불안정했다(R10~R12
                # 관찰). 컷1은 대사가 없어도 항상 A/B 두 주인공을 표지에
                # 담으려는 의도라 — 대본이 "인물 없음"을 명시한 경우는 이미
                # no_people_expected 판정이 따로 걸러주므로, 컷1도 이 게이트
                # 대상에 포함해도 안전하다(작게 스쳐가는 배경 군중은 여전히
                # 신뢰도·크기 기준 미달이라 안 걸림). Ultra 경로는
                # check_extra_people=False라 이 로직 자체가 안 걸린다
                # (아래 _PROVIDER_CONFIG 주석 참고).
                cfg = _PROVIDER_CONFIG[IMAGE_PROVIDER]
                ok, faces = generate_cut_image_to_file(
                    cut["camera"], cut["scene"], cfg["model"], img_path,
                    has_dialogue=bool(cut.get("dialogue")) or n == 1,
                    retries=cfg["retries"],
                    with_qa=cfg["with_qa"],
                    check_extra_people=cfg["check_extra_people"],
                )
                if ok:
                    # 2026-09-08 — 얼굴 위치는 QA 비전 모델이 아니라 Rekognition
                    # 전용 얼굴 감지로 구한다(prompts.py VALIDATE_SYSTEM 상단
                    # 주석 참고) — 바운딩 박스 전체를 주므로 draw_dialogue()가
                    # 얼굴 상단을 피해 말풍선을 배치할 수 있다. generate_cut_image_to_file()이
                    # QA 단계에서 이미 감지해 넘겨주므로 여기서 다시 부르지 않는다.
                    try:
                        compose_text.compose(img_path, cut, faces)
                    except Exception as e:
                        print(f"{tag} 컷{n} 텍스트 합성 실패(배경은 유지): {e}")
            else:
                prompt = build_image_prompt(cut["camera"], cut["scene"], cut, characters)
                ok = generate_image(prompt, img_path)
            print(f"{tag} 컷{n} {'완료' if ok else '실패'}")
    finally:
        if gpu_started:
            gpu_ipadapter.stop_gpu()

    # 세로 스크롤 합치기
    try:
        stitch(out, N_CUTS)
        print(f"{tag} 스크롤 합치기 완료")
    except Exception as e:
        print(f"{tag} 스티칭 실패: {e}")

    print(f"{tag} ==== 전체 완료 ====")
