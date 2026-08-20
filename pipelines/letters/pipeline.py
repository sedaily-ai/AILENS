"""레터 파이프라인 — 기사 1건 → 레터 텍스트.

가장 단순한 파이프라인이다 — GPT-4o 호출 한 번으로 끝난다(webtoon처럼
여러 단계 없음). 산출물은 텍스트 파일 하나 — S3 업로드나 CMS 반영은
이 스크립트 범위 밖이다(pipelines/webtoon과 마찬가지로 "생성"까지만).

2026-08-20 신설 — 그 전까지 레터는 매번 스크래치패드에 1회성 스크립트를
새로 써서 생성했다(webtoon/video는 재사용 가능한 파이프라인이 있었는데
레터·팟캐스트만 없는 비대칭이 있었음).
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "common"))
import ddb_prompt
from openai_client import call_text


def run_article(name: str, article_path: str, output_root: Path = Path(".")) -> Path:
    out = output_root / name
    out.mkdir(parents=True, exist_ok=True)
    article = Path(article_path).read_text(encoding="utf-8")
    out_path = out / "레터.md"
    tag = f"[{name}]"

    print(f"{tag} letters 프롬프트 로드")
    guide = ddb_prompt.load_prompt("letters")

    print(f"{tag} 레터 생성 중...")
    output = call_text(guide, f"다음 기사 원문으로 레터를 만들어주세요.\n\n{article}")
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
