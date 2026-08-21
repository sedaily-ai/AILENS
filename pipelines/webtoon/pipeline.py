"""
뉴스 웹툰 파이프라인 — 핵심 엔진
=====================================
기사 1건을 받아 8컷 웹툰(이미지 8장 + 세로 스크롤 1장)을 만든다.

흐름: 1단계 스크립트 생성 → 2단계 장면 연출 → 3단계 이미지 생성 → 스티칭
각 단계는 중간 결과(JSON)를 파일로 저장하므로, 중간에 끊겨도 재실행하면
이미 끝난 단계는 건너뛰고 이어서 진행한다(resume).
"""
import sys, json, base64, time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "common"))
import ddb_prompt  # pipelines/common/ — 2026-08-20 letters/podcast와 공용화
from openai_client import get_client  # pipelines/common/ — 2026-08-21 로컬 .env 제거

import prompts
from stitch import stitch

client = get_client()

SCRIPT_MODEL = "gpt-4o"          # 스크립트·장면연출용 텍스트 모델
IMAGE_MODEL = "gpt-5.5"          # 이미지 생성 모델 (Responses API의 image_generation 툴)
IMAGE_SIZE = "1536x1024"         # 3:2 가로. 컷당 $0.165 (2026-08 기준, high quality)
IMAGE_QUALITY = "high"
N_CUTS = 8


def call_json(prompt: str) -> dict:
    """GPT-4o에 JSON 형식 강제 응답을 요청한다. (스크립트/장면연출 공용)"""
    resp = client.chat.completions.create(
        model=SCRIPT_MODEL,
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
        temperature=0.7,
        max_tokens=2000,
    )
    return json.loads(resp.choices[0].message.content)


def build_image_prompt(camera: str, scene: str, cut: dict) -> str:
    """2단계(장면) + 1단계(대사) 결과를 3단계 이미지 프롬프트로 합친다."""
    style = prompts.STYLE + f"\nCamera: {camera}. 3:2 horizontal."
    parts = [style, f"\n\n[SCENE]\n{scene}"]
    if cut.get("narration"):
        parts.append(prompts.narration(cut["narration"]))
    if cut.get("caption"):
        parts.append(prompts.caption(cut["caption"]))
    if cut.get("dialogue"):
        pairs = [(d["speaker"], d["line"], d.get("tone", "보통")) for d in cut["dialogue"]]
        parts.append(prompts.bubbles(*pairs))
    return "".join(parts)


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
        script = call_json(script_prompt)
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
        scenes = call_json(scene_prompt)
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
        prompt = build_image_prompt(s["camera"], s["scene"], cut)
        print(f"{tag} 컷{n} 생성 중...")
        ok = generate_image(prompt, img_path)
        print(f"{tag} 컷{n} {'완료' if ok else '실패'}")

    # 세로 스크롤 합치기
    try:
        stitch(out, N_CUTS)
        print(f"{tag} 스크롤 합치기 완료")
    except Exception as e:
        print(f"{tag} 스티칭 실패: {e}")

    print(f"{tag} ==== 전체 완료 ====")
