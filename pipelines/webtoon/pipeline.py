"""
뉴스 웹툰 파이프라인 — 핵심 엔진
=====================================
기사 1건을 받아 8컷 웹툰(이미지 8장 + 세로 스크롤 1장)을 만든다.

흐름: 1단계 스크립트 생성 → 2단계 장면 연출 → 3단계 이미지 생성 → 스티칭
각 단계는 중간 결과(JSON)를 파일로 저장하므로, 중간에 끊겨도 재실행하면
이미 끝난 단계는 건너뛰고 이어서 진행한다(resume).

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
import sys, json, base64, time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "common"))
import ddb_prompt  # pipelines/common/ — 2026-08-20 letters/podcast와 공용화
from openai_client import get_client  # pipelines/common/ — 2026-08-21 로컬 .env 제거 (이미지 생성 전용)
from bedrock_client import call_text, call_vision  # 2026-08-23 스크립트/장면연출 + 2026-09-02 이미지 QA
from json_extract import extract_json_object  # pipelines/common/ — 2026-08-23 공용화, 2026-09-04 폴백까지 통합
from rekognition_client import detect_main_faces  # pipelines/common/ — 2026-09-08 말풍선 얼굴 회피용

import prompts
import compose_text
from stitch import stitch

client = get_client()

SCRIPT_MODEL = "arn:aws:bedrock:us-east-1:887078546492:application-inference-profile/yirjajon82n7"  # lens-webtoon-script-sonnet-46
IMAGE_MODEL = "gpt-5.5"          # 이미지 생성 모델 (Responses API의 image_generation 툴)
IMAGE_SIZE = "1536x1024"         # 3:2 가로. 컷당 $0.165 (2026-08 기준, high quality)
IMAGE_QUALITY = "high"
N_CUTS = 8

# "openai"(원래 GPT 경로, 말풍선까지 이미지 모델이 그림) | "bedrock"(Stable
# Image Core, 순수 텍스트 프롬프트) | "bedrock-style-guide"(Stable Image
# Style Guide, 참고 이미지로 화풍 고정 — 2026-09-08 신설, 기본값으로 승격).
# 셋 다 텍스트는 compose_text.py가 합성(openai만 예외 — 모델이 직접 그림).
#
# bedrock → bedrock-style-guide 전환 경위: 사용자가 공유한 참고 샘플과
# 대조한 결과 Stable Image Core 순수 텍스트 프롬프트는 "cel-shaded, NOT
# photorealistic"을 명시해도 반실사 디지털 페인팅으로 나오는 화풍 자체의
# 한계가 있었다. Style Guide는 참고 이미지(webtoon_image.py의
# STYLE_REFERENCE_IMAGE_PATH)로 화풍을 고정해 실측상 훨씬 근접했다 — 사용자가
# OpenAI 대신 Stable Diffusion 계열 유지를 명시적으로 결정했으므로(2026-09-08),
# 그 제약 안에서 참고 샘플에 가장 가까운 이 경로를 기본값으로 삼는다.
IMAGE_PROVIDER = "bedrock-style-guide"

# 2026-09-05 — 여기 있던 _characters_block/_SCENE_REINFORCEMENT/
# _CHARACTER_REINFORCEMENT/build_background_prompt/BEDROCK_IMAGE_REGION/
# BEDROCK_IMAGE_MODEL_ID/BEDROCK_ASPECT_RATIO/generate_image_bedrock 전부
# common/webtoon_image.py로 옮겼다(admin 콘솔의 "이미지 실험" 패널도 이
# 로직이 그대로 필요해져서 — 그 모듈 docstring 참고). 시행착오 이력
# (재강조 문구가 왜 이 모양인지, 비용태깅 때문에 application inference
# profile을 쓰는 이유 등)도 전부 그쪽·prompts.py에 있다 — 여기서는
# 이전과 같은 이름으로 그대로 import해서 아래 호출부들은 안 바뀐다.
from webtoon_image import (
    build_background_prompt,
    build_style_guide_prompt,
    generate_bedrock_image as generate_image_bedrock,
    generate_bedrock_style_guide_image as generate_image_bedrock_style_guide,
    characters_block as _characters_block,
    SCENE_REINFORCEMENT as _SCENE_REINFORCEMENT,
    CHARACTER_REINFORCEMENT as _CHARACTER_REINFORCEMENT,
)

_JSON_INSTRUCTION = (
    "\n\n[응답 형식]\n다른 설명 없이 ```json 코드블록 하나 안에 JSON 객체만 담아 응답한다."
)


_SYSTEM_PROMPT = "당신은 뉴스 웹툰 제작자입니다. 지시받은 JSON 스키마를 정확히 지켜 응답합니다."


def call_json(prompt: str, debug_path: Path | None = None) -> dict:
    """Bedrock Claude에 JSON 응답을 요청한다. (스크립트/장면연출 공용)

    2026-08-23 — max_tokens을 2000→4000으로 올렸다. 1·2단계가 같은 한도를
    공유하는데, 2단계(장면 연출)는 8컷 각각의 카메라 앵글+장면 묘사를
    전부 써야 해서 1단계(대사/캡션)보다 원래 더 길어진다 — 실운영 중
    2단계에서만 "Bedrock 응답에서 JSON을 찾지 못했습니다" 실패가 반복
    발생한 게 이 한도 때문일 가능성이 커서(응답이 문장 중간에 잘리면
    닫는 '}'가 아예 없어 4단계 폴백 전부 실패), video 파이프라인이
    비슷한 분량(8~9컷)에 쓰는 max_tokens=4000과 맞췄다.

    debug_path — 파싱 실패 시 원문 응답을 저장해서 원인을 사후에 볼 수
    있게 한다(이게 없어서 오늘 실패 원인을 추정만 하고 확인은 못 했다).
    성공하면 안 남긴다(디스크 낭비 방지)."""
    raw = call_text(_SYSTEM_PROMPT, prompt + _JSON_INSTRUCTION, model=SCRIPT_MODEL, max_tokens=4000, temperature=0.7)
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


# generate_image_bedrock()는 이제 webtoon_image.generate_bedrock_image의
# import 별칭이다(위 import 블록 참조) — 여기 있던 원래 정의는 삭제.


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

# QA 호출 자체가 실패했을 때, 그리고 아직 QA를 한 번도 안 돌린 시점의
# 초기값으로 공유하는 기본값 — 예전엔 두 곳(_validate_and_detect의 except
# 블록, run_article의 루프 상단)에 리터럴이 그대로 중복돼 있었다.
_DEFAULT_VERDICT = {"sageuk": False, "no_people_violated": False}


def _validate_and_detect(image_path: Path, scene: str, no_people_expected: bool) -> dict:
    """생성된 배경 이미지 1장을 비전 모델로 검사. 실패(호출 에러) 시 항상
    "문제 없음"으로 처리해서 재시도 루프가 무한정 돌지 않게 한다 — QA
    자체의 실패가 발행을 막으면 안 된다(가용성 우선)."""
    try:
        image_bytes = image_path.read_bytes()
        no_people_note = "\n\n[인물 없음 지시]: 이 장면은 인물이 없어야 합니다." if no_people_expected else ""
        user_msg = f"[SCENE 지문]\n{scene}{no_people_note}"
        raw = call_vision(prompts.VALIDATE_SYSTEM, user_msg, image_bytes, model=SCRIPT_MODEL, max_tokens=500)
        return extract_json_object(raw)
    except Exception as e:
        print(f"    ⚠️  이미지 QA 검사 실패(통과 처리): {e}")
        return dict(_DEFAULT_VERDICT)



# 2026-09-08(4차, #14 "배경 엑스트라 난입" 대응) — 참고 이미지 교체나
# negative_prompt 같은 프롬프트 쪽 레버를 여러 조합(fidelity 0.3~0.65,
# Style Guide/Core 둘 다, 강한 부정문/negative_prompt 파라미터)으로
# 실측했지만 "군중·거리 배경으로 쏠리는 경향" 자체는 못 이겼다(라운드
# 기록.md R9). 반면 이 파이프라인은 이미 "사극 오염 감지 → 안 좋으면
# 재생성"(위 _generate_and_qa_cut) 구조와 Rekognition 얼굴 감지
# (rekognition_client.detect_main_faces, 신뢰도 95%+·크기 5%+ 필터로
# 주요 인물과 배경 엑스트라를 구분하는 게 실측으로 확인됨)를 이미 갖고
# 있다 — 프롬프트로 확률을 낮추는 대신, 결과물의 얼굴 수를 세서 나쁘면
# 걸러내는 같은 "생성→검사→재시도" 철학을 여기에도 적용한다.
_MAX_EXPECTED_FACES = 2  # 이 파이프라인은 고정 진행자 2인(A/B)만 쓴다.


def _generate_and_qa_cut(
    prompt: str, img_path: Path, scene: str, tag: str, n: int, generate_fn=generate_image_bedrock,
    *, has_dialogue: bool = True,
) -> tuple[bool, dict, list | None]:
    """배경 생성 + QA 검증 + (필요시) 1회 재생성까지 한 컷 분량을 처리한다.
    run_article()의 3단계 루프가 생성·QA·재시도·합성을 전부 인라인으로
    떠안고 있어서(2026-09-02 QA 루프 추가 당시) 읽기 어려워진 걸 분리—
    이 함수는 "이미지 파일을 만든다"까지만 책임지고, 텍스트 합성은
    호출부(run_article)가 계속 맡는다.

    generate_fn — 2026-09-08 추가. Bedrock 계열(Stable Image Core/Style
    Guide) 둘 다 "배경만 그리고 QA로 검증"하는 이 구조를 그대로 쓸 수
    있어서, 실제 생성 호출 함수만 파라미터로 뺐다(기본값은 Stable Image
    Core, run_article()이 IMAGE_PROVIDER에 따라 다른 함수를 넘긴다).

    GPT 경로(IMAGE_PROVIDER="openai", 휴면)는 이 QA를 안 거친다. GPT의
    image_generation 툴은 배경+말풍선 텍스트를 한 번에 완성된 그림으로
    만들어서 애초에 "배경만 비전 모델로 검사"하는 이 구조 자체가 안 맞고
    (무엇을 사극/인물오탐 기준으로 잴지도 다름), Bedrock 경로에서 발견된
    변동성 문제(같은 프롬프트도 결과가 크게 다름)가 GPT 쪽에서도 똑같이
    재현되는지 확인된 바가 없다.

    반환값에 faces가 추가됐다(2026-09-08, #14 대응) — QA 단계에서 이미
    Rekognition을 돌리므로, 호출부(run_article)가 말풍선 배치를 위해
    같은 이미지에 대해 또 한 번 부르지 않도록 여기서 감지한 결과를
    그대로 넘긴다(재시도했다면 재시도 결과의 얼굴, 재시도 안 했다면
    최초 생성 결과의 얼굴).

    has_dialogue — 2026-09-08 추가. 배경 인물 초과 체크(_MAX_EXPECTED_FACES)는
    "이 컷에 A/B 두 화자가 보여야 한다"는 전제 위에서만 의미가 있다.
    컷1(표지)·컷8(마무리) 같은 상징적 컷은 대사가 없고 의도적으로 인물
    없는 부감·군중 샷을 쓰기도 해서(실측: 실제 파이프라인 재현 중 컷1이
    "수백 명 청중 부감" 장면으로 나왔는데 이 체크가 무차별 적용돼 불필요한
    재생성이 걸림) — 대사가 있는 컷에서만 켠다. 호출부(run_article)가
    `cut.get("dialogue")` 유무로 넘겨준다."""
    ok = generate_fn(prompt, img_path)
    verdict = dict(_DEFAULT_VERDICT)
    faces = None
    if not ok:
        return ok, verdict, faces

    # "인물 없음"/"인물 없이"/"인물 없는" 등 2단계 장면 텍스트가 실제로 쓰는
    # 표현이 갈린다(admin 가이드 문서에도 두 표현이 다 등장 — service/backend/
    # prompts/webtoon/published.md 참고) — 원래 "인물 없음"만 봤던 게 컷1의
    # "인물 없이" 표현을 못 잡는 걸 실전 재현으로 확인해 넓혔다.
    no_people_expected = any(p in scene for p in ("인물 없음", "인물 없이", "인물 없는", "인물이 없"))
    verdict = _validate_and_detect(img_path, scene, no_people_expected)
    faces = detect_main_faces(img_path.read_bytes()) or None
    extra_people = (
        has_dialogue and not no_people_expected
        and faces is not None and len(faces) > _MAX_EXPECTED_FACES
    )
    if verdict.get("sageuk") or verdict.get("no_people_violated") or extra_people:
        if verdict.get("sageuk"):
            reason = "사극 오염"
        elif verdict.get("no_people_violated"):
            reason = "인물 없음 위반"
        else:
            reason = f"배경 인물 초과({len(faces)}명 감지, 최대 {_MAX_EXPECTED_FACES}명 예상)"
        print(f"{tag} 컷{n} QA 실패({reason}) — 재생성 1회 시도")
        ok_retry = generate_fn(prompt, img_path)
        if ok_retry:
            verdict = _validate_and_detect(img_path, scene, no_people_expected)
            faces = detect_main_faces(img_path.read_bytes()) or None
        # 재생성이 실패해도 첫 시도 결과가 파일로 남아있으니 발행은 계속한다
        # (QA 실패 < 완전 실패 — 둘 다 막으면 자동 발행이 통째로 멈춘다).
        ok = ok_retry or ok
    return ok, verdict, faces


def run_article(name: str, article_path: str, output_root: Path = Path("."), resume: bool = True):
    """기사 1건 → 8컷 웹툰 전체 파이프라인. name은 출력 폴더명."""
    out = output_root / name
    out.mkdir(parents=True, exist_ok=True)
    article = Path(article_path).read_text(encoding="utf-8")
    tag = f"[{name}]"

    # admin 프롬프트 드로어(webtoon 탭)에 저장된 지침 — 1·2단계 프롬프트를 여기서
    # 매번 새로 조립한다. 이 함수 안에서 딱 한 번만 fetch(재실행 resume 경로에서도
    # 굳이 다시 부르지 않도록 스킵 분기보다 위에 둔다).
    guide = ddb_prompt.load_prompt("webtoon")

    # 1단계: 스크립트
    script_path = out / "1_script.json"
    if resume and script_path.exists():
        print(f"{tag} 1단계 재사용")
        script = json.loads(script_path.read_text(encoding="utf-8"))
    else:
        print(f"{tag} 1단계 스크립트 생성")
        script_prompt = (
            guide
            + "\n\n---\n[지금 할 일]\n위 지침을 참고해서 지금은 1단계(스크립트)"
            " 결과만 출력한다. \"1단계 출력\" 섹션에 정의된 JSON 스키마 그대로,"
            " JSON 객체 하나만 응답한다(설명 문구 없이).\n\n[입력 기사]\n"
            + article
        )
        script = call_json(script_prompt, debug_path=out / "1_raw_response.txt")
        script_path.write_text(json.dumps(script, ensure_ascii=False, indent=2), encoding="utf-8")

    # 2단계: 장면 연출
    scenes_path = out / "2_scenes.json"
    if resume and scenes_path.exists():
        print(f"{tag} 2단계 재사용")
        scenes = json.loads(scenes_path.read_text(encoding="utf-8"))
    else:
        print(f"{tag} 2단계 장면 연출 생성")
        scene_prompt = (
            guide
            + "\n\n---\n[지금 할 일]\n위 지침을 참고해서 지금은 2단계(장면 연출)"
            " 결과만 출력한다. \"2단계 출력\" 섹션에 정의된 JSON 스키마 그대로,"
            " JSON 객체 하나만 응답한다(설명 문구 없이).\n\n[기사]\n"
            + article
            + "\n\n[1단계 스크립트 결과]\n"
            + json.dumps(script, ensure_ascii=False)
        )
        scenes = call_json(scene_prompt, debug_path=out / "2_raw_response.txt")
        scenes_path.write_text(json.dumps(scenes, ensure_ascii=False, indent=2), encoding="utf-8")

    scene_map = {s["cut"]: s for s in scenes["scenes"]}

    # 3단계: 이미지 생성
    print(f"{tag} 3단계 이미지 생성 ({N_CUTS}컷)")
    # 2026-09-05 — 기사마다 script.get("characters")로 새로 짓던 인물 묘사
    # 대신, 고정 진행자 2인(prompts.get_fixed_characters())을 항상 쓴다 —
    # "AI Lens 웹툰" 포맷 도입(prompts.py STYLE 근처 "겪었던 문제 4" 참고).
    # 2026-09-04부터 이 값은 admin이 발행한 DDB가 정본이라 컷 루프 밖에서
    # 한 번만 가져온다(fresh하되 같은 기사 안 8컷은 일관되게 같은 값 사용).
    characters = prompts.get_fixed_characters()
    for cut in script["cuts"]:
        n = cut["cut"]
        img_path = out / f"컷{n}.png"
        if resume and img_path.exists():
            print(f"{tag} 컷{n} 스킵(존재)")
            continue
        s = scene_map[n]
        print(f"{tag} 컷{n} 생성 중... ({IMAGE_PROVIDER})")
        if IMAGE_PROVIDER in ("bedrock", "bedrock-style-guide"):
            if IMAGE_PROVIDER == "bedrock-style-guide":
                prompt = build_style_guide_prompt(s["camera"], s["scene"])
                generate_fn = generate_image_bedrock_style_guide
            else:
                prompt = build_background_prompt(s["camera"], s["scene"], characters)
                generate_fn = generate_image_bedrock
            ok, _verdict, faces = _generate_and_qa_cut(
                prompt, img_path, s["scene"], tag, n, generate_fn,
                has_dialogue=bool(cut.get("dialogue")),
            )
            if ok:
                # 2026-09-08 — 얼굴 위치는 QA 비전 모델(verdict)이 아니라
                # Rekognition 전용 얼굴 감지로 구한다(prompts.py VALIDATE_SYSTEM
                # 상단 주석 참고) — 바운딩 박스 전체를 주므로 draw_dialogue()가
                # 얼굴 상단을 피해 말풍선을 배치할 수 있다. _generate_and_qa_cut()가
                # QA 단계에서 이미 감지해 넘겨주므로 여기서 다시 부르지 않는다
                # (배경 인물 초과 체크에도 같은 결과를 재사용, 위 함수 docstring 참고).
                try:
                    compose_text.compose(img_path, cut, faces)
                except Exception as e:
                    print(f"{tag} 컷{n} 텍스트 합성 실패(배경은 유지): {e}")
        else:
            prompt = build_image_prompt(s["camera"], s["scene"], cut, characters)
            ok = generate_image(prompt, img_path)
        print(f"{tag} 컷{n} {'완료' if ok else '실패'}")

    # 세로 스크롤 합치기
    try:
        stitch(out, N_CUTS)
        print(f"{tag} 스크롤 합치기 완료")
    except Exception as e:
        print(f"{tag} 스티칭 실패: {e}")

    print(f"{tag} ==== 전체 완료 ====")
