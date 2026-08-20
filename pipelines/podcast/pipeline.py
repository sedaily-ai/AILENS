"""팟캐스트 파이프라인 — 기사 1건 → 대본 + mp3.

1단계 대본(GPT-4o) → 2단계 음성 합성(AWS Polly, 한국어 Seoyeon/generative
— 별도 API 키 발급 없이 이미 있는 AWS 자격 증명만 있으면 된다). 중간
결과(대본 텍스트)를 파일로 남겨서 재실행 시 이미 끝난 단계는 건너뛴다
(pipelines/webtoon과 같은 resume 관례).

2026-08-20 신설 — pipelines/letters와 같은 이유(비대칭 해소).
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "common"))
import ddb_prompt
from openai_client import call_text
from text_utils import strip_code_fence

import boto3
import os

_AWS_PROFILE = os.environ.get("AWS_PROFILE")
_REGION = os.environ.get("AWS_REGION", "us-east-1")
_VOICE_ID = "Seoyeon"
_ENGINE = "generative"

_polly = None


def _polly_client():
    global _polly
    if _polly is None:
        session = (
            boto3.Session(profile_name=_AWS_PROFILE)
            if _AWS_PROFILE
            else boto3.Session()
        )
        _polly = session.client("polly", region_name=_REGION)
    return _polly


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
        script = call_text(
            guide, f"다음 기사 원문으로 팟캐스트 대본을 만들어주세요.\n\n{article}"
        )
        script_path.write_text(script, encoding="utf-8")

    mp3_path = out / "팟캐스트.mp3"
    if resume and mp3_path.exists():
        print(f"{tag} 음성 재사용")
    else:
        print(f"{tag} Polly 음성 합성 중...")
        text = strip_code_fence(script)
        resp = _polly_client().synthesize_speech(
            Text=text,
            OutputFormat="mp3",
            VoiceId=_VOICE_ID,
            Engine=_ENGINE,
            LanguageCode="ko-KR",
        )
        mp3_path.write_bytes(resp["AudioStream"].read())

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
