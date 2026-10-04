"""0단계 — 사실 추출(공통 팩트시트).

기사 원문에서 기준일·핵심 숫자·핵심 용어·핵심 논지를 한 번만 뽑아 원문 뒤에 이어붙이고,
letters/webtoon/podcast/video 4포맷이 같은 사실을 공유하게 한다. 호출부는
frontpage_auto/mustknow_auto의 run.py이며, article_path 파일에 결과를 같이 써넣으면
각 포맷 pipeline.py는 수정 없이 그 파일을 읽는다.
전용 inference profile 없이 letters와 같은 profile(`lens-letters-sonnet-46`)의
ARN을 재사용한다(비용 태깅 규칙상 베어 모델 ID는 쓰지 않는다).
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import ddb_prompt
from bedrock_client import call_text

MODEL = "arn:aws:bedrock:us-east-1:887078546492:application-inference-profile/nrr81xvevv5k"  # lens-letters-sonnet-46


def extract_facts(article_content: str, today_kst: str) -> str:
    """기사 원문 → 공통 팩트시트 텍스트. 실패하면 빈 문자열(호출부는 그냥
    원문만 쓰던 예전 동작으로 자연히 폴백 — 이 단계가 없어도 파이프라인
    전체가 죽으면 안 된다).

    today_kst(YYYYMMDD)를 프롬프트에 명시한다. 기준일이 없으면 모델이 기사 속
    "이번 주"·"15일" 같은 상대 표현을 절대 날짜로 바꿀 근거가 없어, 학습 데이터의
    옛 날짜를 끌어쓰는 오류가 난다. 기사에 없는 날짜는 지어내지 않도록 못박는다."""
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
