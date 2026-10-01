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

2026-09-22 — 성우·속도·음량을 admin CMS에서 조정할 수 있게
pipelines/common/podcast_voice.py(웹툰 이미지 설정과 동일한 "## 헤딩
발행 문서" 패턴)를 신설, VoiceId/Engine 하드코딩 상수를 없애고 매 실행
fresh 조회로 바꿨다(사용자 요청: "웹툰이랑 동일한 구조로 짜주시죠"). 텍스트는
SSML <prosody>로 감싸 rate/volume을 반영한다 — Seoyeon/Jihye 기본값
(100%/+0dB)일 때는 예전과 들리는 결과가 동일하다(prosody 기본값 자체가
무변경이므로). 실제 Polly 호출(_polly/_split_for_polly/synthesize)은
같은 날 후속으로 podcast_voice.py로 옮겼다 — admin CMS의 "음성 미리듣기"
기능이 발행 파이프라인과 똑같은 함수를 공유해야 진짜 미리듣기이기
때문(아래 podcast_voice.synthesize() 호출부 참고).
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "common"))
import ddb_prompt
import podcast_voice
from bedrock_client import call_text
from text_utils import strip_code_fence

# 2026-09-27, 사용자 요청 — "클로드 4.6sonnet 빼시고요. 클로드 5.0
# opus로 모든 프로덕션... 업데이트": 전용 프로파일 lens-podcast-opus-5
# (신규 생성, us.anthropic.claude-opus-5 copyFrom, Service=lens·
# Workload=podcast)로 교체 — admin/backend/routes/prompts.py::
# _CATEGORY_BEDROCK["podcast"]와 반드시 같은 ARN을 유지할 것(admin
# 테스트 도구와 실제 발행이 어긋나면 안 된다는 이 세션 기존 원칙).
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
        # 2026-09-26 — "다음 기사 원문으로 팟캐스트 대본을 만들어주세요"처럼
        # 코드가 결과물 종류를 못박던 문구를 뺐다(admin/backend/routes/
        # prompts.py::_CATEGORY_BEDROCK 주석 참고). 무엇을 만들지는 전적으로
        # guide(저장된 podcast 지침, system 메시지)에 맡긴다.
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
