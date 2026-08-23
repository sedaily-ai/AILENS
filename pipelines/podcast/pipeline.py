"""팟캐스트 파이프라인 — 기사 1건 → 대본 + mp3.

1단계 대본(Bedrock Claude) → 2단계 음성 합성(ElevenLabs, Juan - Deep &
Rich Storyteller 보이스). API 키는 Secrets Manager `ElevenLabs/ApiKey`에서
읽는다. 중간 결과(대본 텍스트)를 파일로 남겨서 재실행 시 이미 끝난
단계는 건너뛴다(pipelines/webtoon과 같은 resume 관례).

2026-08-20 신설 — pipelines/letters와 같은 이유(비대칭 해소).
2026-08-21 기본 음성 엔진을 AWS Polly → ElevenLabs로 변경(호남 반도체
팹 기사에서 수동 교체 검증된 Juan 보이스를 파이프라인 기본값으로 승격).
2026-08-23 — 대본 생성을 GPT-4o에서 Bedrock Claude로 이관(letters/video와
같은 이유: 텍스트 생성은 전부 Bedrock으로 통일). 전용 inference profile
`lens-podcast-sonnet-46`
(arn:aws:bedrock:us-east-1:887078546492:application-inference-profile/kmkagk616y1c)
사용.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "common"))
import ddb_prompt
from bedrock_client import call_text
from text_utils import strip_code_fence

import boto3
import os
import requests

_SCRIPT_MODEL = "arn:aws:bedrock:us-east-1:887078546492:application-inference-profile/kmkagk616y1c"  # lens-podcast-sonnet-46

_AWS_PROFILE = os.environ.get("AWS_PROFILE")
_REGION = os.environ.get("AWS_REGION", "us-east-1")
_ELEVENLABS_VOICE_ID = "8lidWTlnwgjObqCImnE2"  # Juan - Deep & Rich Storyteller
_ELEVENLABS_MODEL_ID = "eleven_multilingual_v2"
_ELEVENLABS_SECRET_NAME = "ElevenLabs/ApiKey"

_elevenlabs_api_key = None


def _elevenlabs_key() -> str:
    global _elevenlabs_api_key
    if _elevenlabs_api_key is None:
        session = (
            boto3.Session(profile_name=_AWS_PROFILE)
            if _AWS_PROFILE
            else boto3.Session()
        )
        client = session.client("secretsmanager", region_name=_REGION)
        _elevenlabs_api_key = client.get_secret_value(
            SecretId=_ELEVENLABS_SECRET_NAME
        )["SecretString"]
    return _elevenlabs_api_key


def _synthesize_elevenlabs(text: str) -> bytes:
    resp = requests.post(
        f"https://api.elevenlabs.io/v1/text-to-speech/{_ELEVENLABS_VOICE_ID}",
        headers={
            "xi-api-key": _elevenlabs_key(),
            "Content-Type": "application/json",
        },
        json={
            "text": text,
            "model_id": _ELEVENLABS_MODEL_ID,
            "voice_settings": {"stability": 0.5, "similarity_boost": 0.75},
        },
        timeout=120,
    )
    resp.raise_for_status()
    return resp.content


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
            guide, f"다음 기사 원문으로 팟캐스트 대본을 만들어주세요.\n\n{article}", model=_SCRIPT_MODEL
        )
        script_path.write_text(script, encoding="utf-8")

    mp3_path = out / "팟캐스트.mp3"
    if resume and mp3_path.exists():
        print(f"{tag} 음성 재사용")
    else:
        print(f"{tag} ElevenLabs 음성 합성 중...")
        text = strip_code_fence(script)
        audio = _synthesize_elevenlabs(text)
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
