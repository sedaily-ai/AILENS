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

import boto3

sys.path.insert(0, str(Path(__file__).parent.parent / "common"))
import ddb_prompt  # pipelines/common/ — 2026-08-20 letters/podcast와 공용화
from openai_client import get_client  # pipelines/common/ — 2026-08-21 로컬 .env 제거 (이미지 생성 전용)
from bedrock_client import call_text, call_vision  # 2026-08-23 스크립트/장면연출 + 2026-09-02 이미지 QA
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

# "openai"(원래 GPT 경로, 말풍선까지 이미지 모델이 그림) | "bedrock"(배경만
# Bedrock, 텍스트는 compose_text.py가 합성) — OpenAI 크레딧 복구되면 다시
# "openai"로 바꾸면 됨.
IMAGE_PROVIDER = "bedrock"
BEDROCK_IMAGE_REGION = "us-west-2"  # us-east-1엔 살아있는 순수 text-to-image 모델이 없음(Nova Canvas만 있는데 막힘)
# 2026-08-28 — 베어 모델 ID 직호출을 application inference profile 로 교체했다.
# 베어(`stability.stable-image-core-v1:1`)로 부르면 비용할당태그가 붙을 자리가 없어
# 청구 데이터에서 전량 `Not Applicable` 로 샌다(BillingON 실측 8/18~8/26 $33.08,
# 월 약 $110). 태그는 소급되지 않으므로 지난 발생분은 복구 불가다.
# 프로파일 태그: Service=atlas4 · Project=Sedaily-LENS · Workload=webtoon-image.
# 2026-09-30 이후 Service 를 lens 로 원복 — docs/architecture/비용태깅_규칙.md 참고.
# 되돌릴 때는 아래 상수를 "stability.stable-image-core-v1:1" 로 바꾸면 된다(요금 동일).
BEDROCK_IMAGE_MODEL_ID = "arn:aws:bedrock:us-west-2:887078546492:application-inference-profile/5jauvzgplsjx"  # lens-webtoon-image-stable-core → stability.stable-image-core-v1:1
BEDROCK_ASPECT_RATIO = "3:2"

_bedrock_image_client = None


def _get_bedrock_image_client():
    global _bedrock_image_client
    if _bedrock_image_client is None:
        _bedrock_image_client = boto3.client("bedrock-runtime", region_name=BEDROCK_IMAGE_REGION)
    return _bedrock_image_client


def _characters_block(characters: dict | None) -> str:
    """인물 묘사를 매 컷 이미지 프롬프트 앞에 반복 주입한다 — 8컷 모두
    같은 characters 딕셔너리를 그대로 프롬프트에 넣어 확산 모델이 매번
    같은 인물 묘사를 참조하게 한다(완벽한 동일성 보장은 아니지만, 진짜
    캐릭터 시트·img2img 없이는 확산 모델 특성상 불가능 — 아예 정보가
    없는 것보다는 훨씬 나은 절충).

    2026-09(최초 도입) — 당시엔 1단계 스크립트가 기사마다 새로 지어낸
    인물 묘사(characters: {A, B, setting})를 썼다. 기존 문제: 프롬프트
    지침("스크립트 맨 앞에 인물 묘사를 명시하고 모든 컷에서 반복한다")은
    1단계(대사·스크립트) 텍스트에 대한 것일 뿐, 실제 3단계 이미지 생성
    호출엔 characters 자체가 인자로 전달되지 않아 각 컷이 인물 외형을
    전혀 모른 채 독립 생성되고 있었다.

    2026-09-05 — run_article()이 이제 매번 새로 지어내는 대신
    prompts.FIXED_CHARACTERS(고정 진행자 2인)를 넘긴다 — "AI Lens 웹툰"
    포맷 도입, prompts.py STYLE 근처 "겪었던 문제 4" 참고. 이 함수 자체는
    "받은 딕셔너리를 프롬프트 블록으로 직렬화"만 하므로 변경 없음."""
    if not characters:
        return ""
    lines = [f"{k}: {v}" for k, v in characters.items()]
    return "\n\n[CHARACTERS — keep consistent across all cuts]\n" + "\n".join(lines)


# [SCENE] 직후에 짧게 한 번 더 반복 — 프롬프트 앞쪽 STYLE 문구의 일반적
# 톤(트렌디한 K-웹툰 로맨스 정형)이 뒤쪽 [SCENE]의 구체적 지시를 누르는
# 경향을 실측으로 확인해서(2026-09, prompts.py STYLE 근처 "겪었던 문제
# 3" 참고) 넣은 재강조 — [SCENE]에 가장 가까운 위치에서 같은 취지를
# 한 번 더 짧게 못박는다.
_SCENE_REINFORCEMENT = (
    "\n\nSTRICT: Render exactly the scene above — modern present-day "
    "setting, no historical/period/fantasy clothing, no extra crowds or "
    "characters beyond what [SCENE]/[CHARACTERS] specify."
)


def build_background_prompt(camera: str, scene: str, characters: dict | None = None) -> str:
    """Bedrock 경로 전용 — 텍스트(말풍선/캡션/내레이션) 지침 없이 스타일+장면만.
    확산 모델이 요청 안 한 글자를 그림에 멋대로 채워넣는 걸 막기 위해 명시적으로
    금지 문구도 붙인다(합성은 compose_text.py가 나중에 한다)."""
    style = prompts.STYLE + f"\nCamera: {camera}. 3:2 horizontal."
    return (
        style + _characters_block(characters) + f"\n\n[SCENE]\n{scene}"
        + _SCENE_REINFORCEMENT
        + "\n\nCRITICAL: Do NOT render any text, letters, writing, signage text, "
        "or speech bubbles anywhere in this image — pure illustration only, no "
        "readable characters of any kind. Text will be added separately afterward."
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
    style = prompts.STYLE + f"\nCamera: {camera}. 3:2 horizontal."
    parts = [style, _characters_block(characters), f"\n\n[SCENE]\n{scene}", _SCENE_REINFORCEMENT]
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


def generate_image_bedrock(prompt: str, out_path: Path, retries: int = 3) -> bool:
    """배경 이미지 1장 생성 (Stability Stable Image Core, Bedrock us-west-2).
    실패 시 최대 retries회 재시도 — generate_image()(GPT)와 같은 지수 백오프
    패턴을 맞췄다."""
    body = json.dumps({
        "prompt": prompt[:9500],  # Stability 프롬프트 상한(~1만자) 여유 두고 컷
        "aspect_ratio": BEDROCK_ASPECT_RATIO,
        "output_format": "png",
    })
    for attempt in range(retries):
        try:
            resp = _get_bedrock_image_client().invoke_model(modelId=BEDROCK_IMAGE_MODEL_ID, body=body)
            payload = json.loads(resp["body"].read())
            images = payload.get("images") or []
            if not images:
                raise ValueError(f"응답에 이미지 없음: {payload.get('finish_reasons')}")
            out_path.parent.mkdir(parents=True, exist_ok=True)
            out_path.write_bytes(base64.b64decode(images[0]))
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
_DEFAULT_VERDICT = {"sageuk": False, "no_people_violated": False, "faces_left_to_right_x": []}


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


def _generate_and_qa_cut(prompt: str, img_path: Path, scene: str, tag: str, n: int) -> tuple[bool, dict]:
    """배경 생성 + QA 검증 + (필요시) 1회 재생성까지 한 컷 분량을 처리한다.
    run_article()의 3단계 루프가 생성·QA·재시도·합성을 전부 인라인으로
    떠안고 있어서(2026-09-02 QA 루프 추가 당시) 읽기 어려워진 걸 분리—
    이 함수는 "이미지 파일을 만든다"까지만 책임지고, 텍스트 합성은
    호출부(run_article)가 계속 맡는다.

    Bedrock 경로 전용이다 — GPT 경로(IMAGE_PROVIDER="openai", 휴면)는 이
    QA를 안 거친다. GPT의 image_generation 툴은 배경+말풍선 텍스트를
    한 번에 완성된 그림으로 만들어서 애초에 "배경만 비전 모델로 검사"하는
    이 구조 자체가 안 맞고(무엇을 사극/인물오탐 기준으로 잴지도 다름),
    Bedrock 경로에서 발견된 변동성 문제(같은 프롬프트도 결과가 크게
    다름)가 GPT 쪽에서도 똑같이 재현되는지 확인된 바가 없다 — 크레딧
    복구 후 GPT 경로를 다시 쓰게 되면 그때 별도로 검증할 것.
    """
    ok = generate_image_bedrock(prompt, img_path)
    verdict = dict(_DEFAULT_VERDICT)
    if not ok:
        return ok, verdict

    no_people_expected = "인물 없음" in scene
    verdict = _validate_and_detect(img_path, scene, no_people_expected)
    if verdict.get("sageuk") or verdict.get("no_people_violated"):
        reason = "사극 오염" if verdict.get("sageuk") else "인물 없음 위반"
        print(f"{tag} 컷{n} QA 실패({reason}) — 재생성 1회 시도")
        ok_retry = generate_image_bedrock(prompt, img_path)
        if ok_retry:
            verdict = _validate_and_detect(img_path, scene, no_people_expected)
        # 재생성이 실패해도 첫 시도 결과가 파일로 남아있으니 발행은 계속한다
        # (QA 실패 < 완전 실패 — 둘 다 막으면 자동 발행이 통째로 멈춘다).
        ok = ok_retry or ok
    return ok, verdict


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
    for cut in script["cuts"]:
        n = cut["cut"]
        img_path = out / f"컷{n}.png"
        if resume and img_path.exists():
            print(f"{tag} 컷{n} 스킵(존재)")
            continue
        s = scene_map[n]
        print(f"{tag} 컷{n} 생성 중... ({IMAGE_PROVIDER})")
        # 2026-09-05 — 기사마다 script.get("characters")로 새로 짓던 인물
        # 묘사 대신, 고정 진행자 2인(prompts.FIXED_CHARACTERS)을 항상 쓴다
        # — "AI Lens 웹툰" 포맷 도입(prompts.py STYLE 근처 "겪었던 문제 4"
        # 참고).
        characters = prompts.FIXED_CHARACTERS
        if IMAGE_PROVIDER == "bedrock":
            prompt = build_background_prompt(s["camera"], s["scene"], characters)
            ok, verdict = _generate_and_qa_cut(prompt, img_path, s["scene"], tag, n)
            if ok:
                face_x = verdict.get("faces_left_to_right_x") or None
                try:
                    compose_text.compose(img_path, cut, face_x)
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
