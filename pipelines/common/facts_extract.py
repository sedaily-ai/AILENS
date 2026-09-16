"""0단계 — 사실 추출(공통 팩트시트).

레터/웹툰/팟캐스트/영상 4개 포맷 프롬프트는 전부 "입력은 0단계(사실
추출)에서 만든 facts.json"이라고 명시돼 있었다 — 그런데 이 0단계가 실제
코드로 구현된 적이 없었다(2026-09 확인). 각 포맷이 같은 기사 원문
텍스트를 각자 독립적으로 읽고 어떤 숫자를 어떤 표현으로 쓸지 각자
결정해왔다는 뜻 — 기자 피드백("포맷마다 설명 범위와 필수 정보가 달라질
가능성")이 지적한 문제의 근본 원인이 바로 이거였다.

이 모듈은 그 빠진 0단계를 실제로 구현한다: 기사 원문 → 기준일/핵심
숫자/핵심 용어/핵심 논지를 한 번만 뽑아 고정 문구로 만들고, 그 결과를
원문 뒤에 이어붙여 4개 포맷 파이프라인에 공통으로 전달한다(호출부는
frontpage_auto/mustknow_auto의 run.py — 거기서 만드는 article_path 파일에
이 결과를 같이 써넣으면, letters/webtoon/podcast/video 4개 파이프라인
전부가 이미 그 파일을 그대로 읽으므로 각 포맷 pipeline.py는 손댈 필요가
없다).

전용 Bedrock inference profile을 새로 만드는 대신 letters와 같은 profile
(`lens-letters-sonnet-46`)을 재사용한다 — 비슷한 성격의 가벼운 텍스트
추출 작업이라 굳이 새 AWS 리소스를 만들 필요는 없다고 판단(비용태깅
규칙 자체는 지킴 — 베어 모델 ID가 아니라 profile ARN 경유). 나중에 비용
추적을 더 세밀하게 나누고 싶어지면 전용 profile을 새로 만들면 된다.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import ddb_prompt
from bedrock_client import call_text

MODEL = "arn:aws:bedrock:us-east-1:887078546492:application-inference-profile/nrr81xvevv5k"  # lens-letters-sonnet-46 재사용


def extract_facts(article_content: str, today_kst: str) -> str:
    """기사 원문 → 공통 팩트시트 텍스트. 실패하면 빈 문자열(호출부는 그냥
    원문만 쓰던 예전 동작으로 자연히 폴백 — 이 단계가 없어도 파이프라인
    전체가 죽으면 안 된다).

    today_kst(YYYYMMDD)를 프롬프트에 명시한다 — 실제 기사가 2026년
    발행분인데 "30초 핵심"에 "2025년 5월 15일"처럼 엉뚱한 연도가 박히는
    사고가 있었다(2026-09-13, 사용자 스크린샷 신고). 이 함수가 모델에
    현재 연도를 전혀 안 알려줬던 게 원인 — 모델이 기사 속 "이번 주"·
    "15일" 같은 상대 표현을 절대 날짜로 바꿀 근거가 없어 자기 학습
    데이터에 있던 같은 소재(클래리티법)의 옛 날짜를 그대로 끌어썼다.
    기준일을 명시하고, 기사에 없는 날짜는 지어내지 말라고 못박는다."""
    guide = ddb_prompt.load_prompt("facts")
    today_iso = f"{today_kst[:4]}-{today_kst[4:6]}-{today_kst[6:8]}"
    prefix = (
        f"오늘 날짜(=이 기사의 발행 기준일)는 {today_iso}입니다. "
        f"기사 본문의 \"이번 주\"·\"오늘\"·\"15일\" 같은 상대적 시간 표현은 "
        f"반드시 이 기준일로 환산해 절대 날짜(연-월-일)로 적으세요. "
        f"기사에 명시되지 않은 날짜나 숫자는 추측해서 지어내지 마세요.\n\n"
    )
    try:
        return call_text(guide, f"{prefix}다음 기사 원문에서 공통 팩트시트를 뽑아주세요.\n\n{article_content}", model=MODEL)
    except Exception as e:
        print(f"[facts_extract] 사실 추출 실패, 원문만 사용: {e}")
        return ""
