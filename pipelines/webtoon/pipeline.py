"""뉴스 웹툰 파이프라인 — 핵심 엔진.

기사 1건을 받아 8컷 웹툰(이미지 8장 + 세로 스크롤 1장)을 만든다.
흐름은 스크립트+장면 연출(단일 Bedrock 호출) → 컷 이미지 생성 → 텍스트 합성 → 스티칭이다.
중간 결과(JSON)를 파일로 저장하므로 재실행하면 끝난 단계는 건너뛰고 이어서 진행한다(resume).
텍스트 생성은 Bedrock Claude만 쓰고, GPT는 휴면 상태인 이미지 경로(generate_image)에만 남아 있다.
"""
import sys, json, base64, re, time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "common"))
import ddb_prompt  # pipelines/common/ — letters/podcast와 공용
from openai_client import get_client  # pipelines/common/ — 이미지 생성 전용
from bedrock_client import call_text  # 스크립트·장면 연출용
from json_extract import extract_json_object  # pipelines/common/ — 공용

import prompts
import compose_text
from stitch import stitch

client = get_client()

# 스크립트·장면 연출 모델(inference profile lens-webtoon-script-opus-5).
# admin/backend/routes/prompts.py::_CATEGORY_BEDROCK["webtoon"]과 반드시 같은 ARN을 유지한다.
SCRIPT_MODEL = "arn:aws:bedrock:us-east-1:887078546492:application-inference-profile/j5kfly25ohjo"  # lens-webtoon-script-opus-5
IMAGE_MODEL = "gpt-5.5"          # 휴면 GPT 경로용 이미지 생성 모델 (Responses API의 image_generation 툴)
IMAGE_SIZE = "1536x1024"         # 3:2 가로. 컷당 $0.165 (2026-08 기준, high quality)
IMAGE_QUALITY = "high"
N_CUTS = 8

# 이미지 모델은 코드 상수가 아니라 admin이 발행한 DDB 문서(webtoon-image/published)의 IMAGE_MODEL
# 섹션에서 기사 처리 시작 때 읽는다(webtoon_image.get_active_image_model()). 저장하면 재배포 없이
# 다음 기사부터 반영된다.
#
# 모델 id → webtoon_image.generate_cut_image_to_file() 호출 인자 매핑(run_article()의 컷 루프가 사용).
# retries=3은 generate_bedrock_* 함수 기본값과 같다. 키는 admin webtoonImageModels.ts의
# IMAGE_MODELS[].id·webtoon_image._VALID_IMAGE_MODELS와 같은 어휘다(sd35_large/stable_image_core는
# UI 드롭다운에는 없고 코드에만 남아 있다).
# 이 목록에 없는 id는 휴면 GPT 경로(build_image_prompt+generate_image)로 처리되지만,
# _VALID_IMAGE_MODELS가 이 키들만 허용하므로 현재는 도달하지 않는다.
_PROVIDER_CONFIG = {
    "sd_ultra": dict(retries=3),
    "stable_image_core": dict(retries=3),
    "sd35_large": dict(retries=3),
}

# 이미지 프롬프트 조립(characters_block, SCENE/CHARACTER_REINFORCEMENT)과 컷 생성·디스패치
# (generate_cut_image_to_file)는 common/webtoon_image.py에 있다. admin 이미지 실험 패널과 같은 로직을
# 공유하기 위해서다. 아래 characters_block·SCENE/CHARACTER_REINFORCEMENT는 휴면 GPT 경로
# (build_image_prompt)가 사용한다.
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


# 페르소나·주제 고정 문구 없이 JSON 스키마 준수만 요구한다. 스키마 자체는 저장된 지침(22장)에서 온다.
# admin/backend/routes/prompts.py::_WEBTOON_SYSTEM_PROMPT와 같은 내용이며, 이 파일은 admin
# script.py::build_script_call의 포크라 원본이 바뀌면 같이 갱신한다.
_SYSTEM_PROMPT = "지시받은 JSON 스키마를 정확히 지켜 응답합니다."


def call_json(prompt: str, debug_path: Path | None = None, max_tokens: int = 4000) -> dict:
    """Bedrock Claude에 JSON 응답을 요청한다.

    max_tokens 기본값 4000은 단순 호출부(generate_meta.py)에 맞춘 값이다. 스크립트+장면 연출은 컷당
    필드가 많아 4000으로는 8컷을 채우기 전에 응답이 잘리므로 run_article()이 더 큰 값을 넘긴다.
    debug_path가 주어지면 파싱 실패 시 원문 응답을 저장한다(성공하면 남기지 않는다).

    temperature는 보내지 않는다. 일부 모델(Opus 5)이 temperature를 거부하며(ValidationException),
    call_text()는 None이면 inferenceConfig에 넣지 않는다."""
    raw = call_text(_SYSTEM_PROMPT, prompt + _JSON_INSTRUCTION, model=SCRIPT_MODEL, max_tokens=max_tokens)
    try:
        return extract_json_object(raw)
    except ValueError:
        # 저장한 파일은 Fargate 태스크가 끝나면 사라지므로 사후 확인용으로 원문도 로그(CloudWatch)에 남긴다.
        # 로그가 커지지 않게 2000자로 자른다.
        if debug_path is not None:
            debug_path.parent.mkdir(parents=True, exist_ok=True)
            debug_path.write_text(raw, encoding="utf-8")
        print(f"    [call_json] 파싱 실패 원문(최대 2000자):\n{raw[:2000]}")
        raise


# ─────────────────────────────────────────────────────────────
# 스크립트+장면 연출 단일 호출. admin/backend/routes/webtoon/script.py의 build_script_call()/
# normalize_cuts()를 이식한 포크다. admin Lambda(flat-copy)와 이 ECS 파이프라인(sys.path 기반)은
# 배포 표면이 달라 코드를 공유할 수 없으므로, 원본이 바뀌면(챕터 번호, 스키마 필드명 등) 이쪽도 같이 갱신한다.
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
    """v11 스키마는 컷 번호를 정수 "cut" 대신 문자열 "cut_id"("cut_01")로 주기도 한다. 둘 다 받으며,
    int로 안 잡히는 문자열·소수 값도 구제한다. admin script.py::_cut_number와 같은 로직이다
    (모델이 8컷 전부 "cut": None을 내는 경우가 실측으로 확인됨)."""
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
    """v11 스키마는 "dialogue" 배열 대신 bubble_1/bubble_2로 준다. 옛 dialogue 스키마와 나란히 지원한다."""
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
    """단일 호출 결과의 cuts를 이미지 생성·compose_text.py가 기대하는 필드 이름
    (image_prompt/dialogue/title/narration/caption)으로 정규화한다.

    camera/scene 2필드는 image_prompt 하나로 합쳤다(admin script.py::normalize_cuts와 같은 결정).
    _cut_number()가 None이면 배열 순서를 쓴다. 컷 파일명이 `컷{n}.png`라 n이 None이면 8컷이 같은
    파일명에 덮어써진다."""
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
    """장면(image_prompt)과 대사·캡션·내레이션을 합친 GPT 경로용 이미지 프롬프트."""
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


# 이미지 호출에 타임아웃이 없으면 서버 쪽 hang 시 재시도 로직이 무한 대기한다(실제로 한 컷에서 20분 이상
# 멈춘 적이 있다). 정상 호출도 컷에 따라 ~10분이 걸리므로 9분으로 잡아 진짜 hang만 걸러낸다.
# Fargate 무인 실행에서 태스크 하나가 끝나지 않으면 그날 자동 발행 전체가 막힌다.
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


def run_article(name: str, article_path: str, output_root: Path = Path("."), resume: bool = True,
                 manage_gpu: bool = True):
    """기사 1건 → 8컷 웹툰 전체 파이프라인. name은 출력 폴더명.

    manage_gpu는 호출 호환용으로 남긴 인자이며 현재 어떤 분기도 타지 않는다(GPU 기동 로직은 삭제됨).
    frontpage_auto/mustknow_auto와 publish_utils가 여전히 이 인자를 넘긴다."""
    out = output_root / name
    out.mkdir(parents=True, exist_ok=True)
    article = Path(article_path).read_text(encoding="utf-8")
    tag = f"[{name}]"

    # admin 프롬프트 드로어(webtoon 탭)에 저장된 지침. 스크립트+장면 연출 프롬프트를 매번 새로 조립하며,
    # 이 함수 안에서 한 번만 가져온다(스킵 분기보다 위).
    guide = ddb_prompt.load_prompt("webtoon")

    # 스크립트+장면 연출은 admin script.py::build_script_call()과 같은 단일 호출로 처리한다
    # (1·2단계를 나누면 응답이 잘리는 문제가 있었다).
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
        # Opus 5는 컷당 영/한 image_prompt를 길게 써서 8000 토큰으로도 8컷을 채우기 전에 멀티바이트 문자
        # 중간에서 응답이 잘렸다(extract_json_object가 읽지 못해 웹툰 실패). admin/backend/routes/prompts.py::
        # _CATEGORY_BEDROCK["webtoon"]의 max_tokens도 같은 한도로 맞춰 어긋나지 않게 한다.
        script = call_json(script_prompt, debug_path=out / "1_raw_response.txt", max_tokens=16000)
        script_path.write_text(json.dumps(script, ensure_ascii=False, indent=2), encoding="utf-8")

    cuts = _normalize_cuts(script)

    # 3단계: 이미지 생성
    print(f"{tag} 3단계 이미지 생성 ({N_CUTS}컷)")
    # 기사마다 인물을 새로 짓지 않고 고정 진행자 2인(prompts.get_fixed_characters())을 항상 쓴다
    # ("AI Lens 웹툰" 포맷). admin이 발행한 DDB가 정본이라 컷 루프 밖에서 한 번만 가져와
    # 같은 기사의 8컷이 같은 값을 쓰게 한다.
    characters = prompts.get_fixed_characters()

    # 이미지 모델도 기사 처리 시작 때 admin이 발행한 DDB에서 한 번 읽는다(위 characters와 같은 문서).
    active_model = get_active_image_model()

    # 기사 단위 seed를 정해 8컷에 같이 쓰고 1_script.json에 남긴다.
    # 재실행(resume)이면 저장된 값을 다시 써서 같은 조건으로 한 컷만 다시 뽑을 수 있다.
    import random
    from webtoon_image import set_run_seed
    image_seed = script.get("image_seed")
    if not isinstance(image_seed, int):
        image_seed = random.randint(1, 2**31 - 1)
        script["image_seed"] = image_seed
        script_path.write_text(json.dumps(script, ensure_ascii=False, indent=1), encoding="utf-8")
    set_run_seed(image_seed)
    from webtoon_image import set_run_negative
    set_run_negative(script.get("negative_prompt") if isinstance(script.get("negative_prompt"), str) else "")
    print(f"{tag} 이미지 seed {image_seed}")

    # CMS "이미지 설정"의 말풍선 얼굴 회피(Rekognition) 토글 — 기사 처리 시작 때 한 번 읽는다(꺼짐이 기본, 읽기 실패도 꺼짐).
    from webtoon_image import get_bubble_detect, get_bubble_style
    bubble_detect = get_bubble_detect()
    bubble_style_on = get_bubble_style()  # 웹툰식 말풍선(타원·얇은 선·위쪽 여백)
    print(f"{tag} 말풍선 얼굴 회피: {'켜짐' if bubble_detect else '꺼짐'} / 웹툰식 말풍선: {'켜짐' if bubble_style_on else '꺼짐'}")

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
                # faces는 항상 None이다(얼굴 감지 제거, webtoon_image.generate_cut_image() 참고).
                # compose_text.compose()가 균등 분할로 폴백한다.
                try:
                    cut_for_compose = cut
                    if bubble_style_on and cut.get("dialogue"):
                        cut_for_compose = {**cut_for_compose, "bubble_style": "oval", "bubble_margin": True, "narration_as_text": True}
                    if bubble_detect and cut.get("dialogue"):
                        import rekognition_people  # pipelines/common/ — 켜져 있을 때만(권한·비용)

                        detect = rekognition_people.detect_people(img_path.read_bytes())  # 실패하면 None → 고정 배치
                        if detect:
                            cut_for_compose = {**cut_for_compose, "detect": detect}
                    try:
                        compose_text.compose(img_path, cut_for_compose, faces, scale=compose_text.OUTPUT_SCALE)
                        # 나레이션을 이미지에 굽지 않은 컷(웹툰식 합성이 성공한 경우만)은 표시 파일을 남긴다 — 발행 단계가 이걸 보고 images[].text_caption을 켠다.
                        # 합성이 실패해 기본 스타일(나레이션이 이미지에 박힘)로 떨어졌으면 파일이 없어 사이트가 글자를 또 얹지 않는다.
                        if cut_for_compose.get("narration_as_text") and (cut.get("narration") or "").strip():
                            (out / f"컷{n}.textcaption").write_text("1", encoding="utf-8")
                    except Exception as e:  # noqa: BLE001 — 새 스타일 합성이 실패해도 기본 스타일로라도 글자는 얹는다
                        print(f"{tag} 컷{n} 웹툰식 합성 실패({type(e).__name__}: {e}) — 기본 스타일로 재시도")
                        compose_text.compose(img_path, cut, faces, scale=compose_text.OUTPUT_SCALE)
                except Exception as e:
                    print(f"{tag} 컷{n} 텍스트 합성 실패(배경은 유지): {e}")
        else:
            prompt = build_image_prompt(cut["image_prompt"], cut, characters)
            ok = generate_image(prompt, img_path)
        print(f"{tag} 컷{n} {'완료' if ok else '실패'}")

    # 핵심 정리 카드(웹툰식 모드) — 프롬프트가 key_numbers(핵심 숫자 2~3개와 라벨)를 내면 마지막에 코드로 그린 카드를 한 장 더한다(이미지 모델 호출 없음, 비용 0).
    if bubble_style_on:
        try:
            kn = script.get("key_numbers")
            if isinstance(kn, list) and len(kn) >= 2:
                head = script.get("card_title") if isinstance(script.get("card_title"), str) else ""
                head = head or (script.get("core_question") or "")
                if compose_text.make_summary_card(out / "컷9.png", head, kn, scale=compose_text.OUTPUT_SCALE):
                    print(f"{tag} 핵심 정리 카드 생성")
        except Exception as e:  # noqa: BLE001 — 카드는 덤이라 실패해도 발행을 막지 않는다
            print(f"{tag} 핵심 정리 카드 생성 실패(건너뜀): {e}")

    # 세로 스크롤 합치기
    try:
        stitch(out, N_CUTS)
        print(f"{tag} 스크롤 합치기 완료")
    except Exception as e:
        print(f"{tag} 스티칭 실패: {e}")

    print(f"{tag} ==== 전체 완료 ====")
