"""팟캐스트 파이프라인 — 기사 1건 → 대본 + mp3.

1단계 대본(Bedrock Claude) → 2단계 음성 합성(AWS Polly). 중간 결과
(대본 텍스트)를 파일로 남겨서 재실행 시 이미 끝난 단계는 건너뛴다
(pipelines/webtoon과 같은 resume 관례).

2026-08-20 신설 — pipelines/letters와 같은 이유(비대칭 해소).
2026-08-21 기본 음성 엔진을 AWS Polly → ElevenLabs로 변경(호남 반도체
팹 기사에서 수동 교체 검증된 Juan 보이스를 파이프라인 기본값으로 승격).
2026-08-23 — 대본 생성을 GPT-4o에서 Bedrock Claude로 이관(letters/video와
같은 이유: 텍스트 생성은 전부 Bedrock으로 통일). 전용 inference profile
`lens-podcast-sonnet-46`
(arn:aws:bedrock:us-east-1:887078546492:application-inference-profile/kmkagk616y1c)
사용.
2026-08-27 — ElevenLabs → AWS Polly로 재전환. 실사용량(월 565K자) 기준
ElevenLabs 실비용이 구독료+초과요금 합산 약 $95.81/월인데, 같은 물량을
Polly generative 엔진으로 합성하면 약 $17/월(82% 절감) — 같은 대본으로
품질 비교 샘플까지 직접 뽑아 확인 후 결정. 별도 API 키·Secrets Manager
불필요(Fargate 태스크 IAM 롤 권한만으로 호출) 부수 이점도 있음. Polly
한국어 보이스 중 generative 엔진을 지원하는 건 Seoyeon뿐(Jihye는 neural
전용) — Seoyeon/generative를 기본값으로 승격.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "common"))
import ddb_prompt
from bedrock_client import call_text
from text_utils import strip_code_fence

import boto3
import os
import re

_SCRIPT_MODEL = "arn:aws:bedrock:us-east-1:887078546492:application-inference-profile/kmkagk616y1c"  # lens-podcast-sonnet-46

_AWS_PROFILE = os.environ.get("AWS_PROFILE")
_REGION = os.environ.get("AWS_REGION", "us-east-1")
_POLLY_VOICE_ID = "Seoyeon"
_POLLY_ENGINE = "generative"
# 동기 SynthesizeSpeech API 실제 상한은 3,000자 — 여유를 두고 이 아래에서 문장
# 경계로 쪼갠다(실측 대본 평균 1,386자·최대 1,815자라 지금은 거의 안 걸리지만,
# 프롬프트가 바뀌어 길어져도 조용히 잘리지 않게 방어).
_POLLY_MAX_CHARS = 2800

_polly_client = None


def _polly() -> "boto3.client":
    global _polly_client
    if _polly_client is None:
        session = (
            boto3.Session(profile_name=_AWS_PROFILE)
            if _AWS_PROFILE
            else boto3.Session()
        )
        _polly_client = session.client("polly", region_name=_REGION)
    return _polly_client


def _split_for_polly(text: str) -> list[str]:
    """_POLLY_MAX_CHARS 이하 조각으로 문장 경계에서 나눈다(문장이 그 자체로
    한도를 넘는 극단적 경우엔 그 문장 하나만 통째로 넘는 조각이 된다 —
    Polly가 그 조각에서 에러를 내면 그대로 실패해서 눈에 띄게 한다)."""
    if len(text) <= _POLLY_MAX_CHARS:
        return [text]
    sentences = re.split(r"(?<=[.!?다요]\s)", text)
    chunks: list[str] = []
    current = ""
    for sentence in sentences:
        if current and len(current) + len(sentence) > _POLLY_MAX_CHARS:
            chunks.append(current)
            current = sentence
        else:
            current += sentence
    if current:
        chunks.append(current)
    return chunks


def _synthesize_polly(text: str) -> bytes:
    audio = b""
    for chunk in _split_for_polly(text):
        resp = _polly().synthesize_speech(
            Text=chunk,
            OutputFormat="mp3",
            VoiceId=_POLLY_VOICE_ID,
            Engine=_POLLY_ENGINE,
            LanguageCode="ko-KR",
        )
        audio += resp["AudioStream"].read()
    return audio


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
        print(f"{tag} Polly 음성 합성 중...")
        text = strip_code_fence(script)
        audio = _synthesize_polly(text)
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
