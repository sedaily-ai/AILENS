"""팟캐스트 파이프라인 — 기사 1건 → 대본 + mp3.

1단계 대본(Bedrock Claude), 2단계 음성 합성(AWS Polly). 대본을 파일로 남겨
재실행 시 끝난 단계는 건너뛴다(webtoon과 같은 resume 관례). 성우·속도·음량은
admin CMS에서 조정하며 `common/podcast_voice.py`가 매 실행 fresh 조회한다.
합성 함수를 admin "음성 미리듣기"와 공유하므로 Polly 호출도 그 모듈에 둔다.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "common"))
import ddb_prompt
import podcast_voice
from bedrock_client import call_text
from text_utils import strip_code_fence

# 전용 프로파일 lens-podcast-opus-5. admin/backend/routes/prompts.py의
# _CATEGORY_BEDROCK["podcast"]와 반드시 같은 ARN을 유지한다(admin 테스트와
# 실제 발행의 모델이 어긋나면 안 된다).
_SCRIPT_MODEL = "arn:aws:bedrock:us-east-1:887078546492:application-inference-profile/6bjkzt0icf74"  # lens-podcast-opus-5


def run_article(
    name: str, article_path: str, output_root: Path = Path("."), resume: bool = True
) -> Path:
    out = output_root / name
    out.mkdir(parents=True, exist_ok=True)
    article = Path(article_path).read_text(encoding="utf-8")
    tag = f"[{name}]"

    script_path = out / "대본.md"
    if resume and script_path.exists():
        print(f"{tag} 대본 재사용")
        script = script_path.read_text(encoding="utf-8")
    else:
        print(f"{tag} podcast 프롬프트 로드")
        guide = ddb_prompt.load_prompt("podcast")
        print(f"{tag} 대본 생성 중...")
        # 결과물 종류는 코드가 아니라 저장된 podcast 지침(system)이 정한다.
        script = call_text(
            guide, f"[입력 기사]\n{article}", model=_SCRIPT_MODEL
        )
        script_path.write_text(script, encoding="utf-8")

    mp3_path = out / "팟캐스트.mp3"
    if resume and mp3_path.exists():
        print(f"{tag} 음성 재사용")
    else:
        print(f"{tag} Polly 음성 합성 중...")
        text = strip_code_fence(script)
        audio = podcast_voice.synthesize(text)
        mp3_path.write_bytes(audio)

    print(f"{tag} 완료 — {script_path}, {mp3_path}")
    return mp3_path


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="기사 원문으로 팟캐스트 대본+음성 생성")
    parser.add_argument("name", help="출력 폴더명")
    parser.add_argument("article_path", help="기사 원문 텍스트 파일 경로")
    parser.add_argument("--output-root", default="output")
    parser.add_argument("--no-resume", action="store_true")
    args = parser.parse_args()
    run_article(
        args.name, args.article_path, Path(args.output_root), resume=not args.no_resume
    )
