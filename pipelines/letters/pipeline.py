"""레터 파이프라인 — 기사 1건 → 레터 텍스트.

가장 단순한 파이프라인이다 — GPT-4o 호출 한 번으로 끝난다(webtoon처럼
여러 단계 없음). 산출물은 텍스트 파일 하나 — S3 업로드나 CMS 반영은
이 스크립트 범위 밖이다(pipelines/webtoon과 마찬가지로 "생성"까지만).

2026-08-20 신설 — 그 전까지 레터는 매번 스크래치패드에 1회성 스크립트를
새로 써서 생성했다(webtoon/video는 재사용 가능한 파이프라인이 있었는데
레터·팟캐스트만 없는 비대칭이 있었음).

2026-08-23 — GPT-4o에서 Bedrock Claude로 이관(video와 같은 이유: 텍스트
생성은 전부 Bedrock으로 통일하고 GPT는 웹툰 이미지 생성 전용으로만
남긴다). 전용 inference profile `lens-letters-sonnet-46`
(arn:aws:bedrock:us-east-1:887078546492:application-inference-profile/nrr81xvevv5k)
사용 — 다른 워크로드와 비용 추적이 섞이지 않도록.

2026-09-03 — 사용자 요청으로 레터 생성만 Opus 5로 승급. 전용 profile
`lens-letters-opus-5`(arn:aws:bedrock:us-east-1:887078546492:
application-inference-profile/iqye2pzreccq, us.anthropic.claude-opus-5
copyFrom, 태그는 기존 sonnet-46 profile과 동일 스키마)를 새로 만들어
교체 — 웹툰/팟캐스트/영상/mustknow 분류·공통 팩트추출(facts_extract.py,
letters profile 재사용 중)은 범위 밖이라 안 건드림. Opus는 Sonnet보다
토큰당 비용이 훨씬 높다 — 매일 자동 실행되는 파이프라인이라 누적된다는
점을 사용자에게 명시적으로 확인받고 진행.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "common"))
import ddb_prompt
from bedrock_client import call_text

MODEL = "arn:aws:bedrock:us-east-1:887078546492:application-inference-profile/iqye2pzreccq"  # lens-letters-opus-5


def run_article(name: str, article_path: str, output_root: Path = Path(".")) -> Path:
    out = output_root / name
    out.mkdir(parents=True, exist_ok=True)
    article = Path(article_path).read_text(encoding="utf-8")
    out_path = out / "레터.md"
    tag = f"[{name}]"

    print(f"{tag} letters 프롬프트 로드")
    guide = ddb_prompt.load_prompt("letters")

    print(f"{tag} 레터 생성 중...")
    output = call_text(guide, f"다음 기사 원문으로 레터를 만들어주세요.\n\n{article}", model=MODEL)
    out_path.write_text(output, encoding="utf-8")

    print(f"{tag} 완료 — {out_path}")
    return out_path


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="기사 원문으로 레터 생성")
    parser.add_argument("name", help="출력 폴더명")
    parser.add_argument("article_path", help="기사 원문 텍스트 파일 경로")
    parser.add_argument("--output-root", default="output")
    args = parser.parse_args()
    run_article(args.name, args.article_path, Path(args.output_root))
