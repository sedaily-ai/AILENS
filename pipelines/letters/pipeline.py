"""레터 파이프라인 — 기사 1건 → 레터 텍스트.

Bedrock Claude를 1회 호출해 레터 텍스트 파일 하나를 만든다. S3 업로드와 CMS
반영은 범위 밖이다. 전용 inference profile `lens-letters-opus-5`를 사용해
다른 워크로드와 비용 추적이 섞이지 않게 한다. facts_extract.py는 별도로
sonnet-46 letters profile을 재사용한다.
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
    # Opus 5는 reasoning만으로 기본 max_tokens를 소진해 text 블록 없이 응답한
    # 사례가 있어, 목표 분량(2000~2800자) 답변까지 담도록 max_tokens를 크게 둔다.
    # 결과물 종류는 코드가 아니라 저장된 letters 지침(system)이 정한다.
    output = call_text(guide, f"[입력 기사]\n{article}", model=MODEL, max_tokens=12000)
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
