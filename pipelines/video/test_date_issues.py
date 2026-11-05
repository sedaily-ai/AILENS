"""date_issues() 단위 테스트 — PRISM 영어 대본의 날짜 검수(2026-11-05).

generate_script 는 import 시 pipelines/common(ddb_prompt·bedrock_client)을 로드하므로,
그 모듈들을 stub 으로 끼워 넣은 뒤 generate_script 를 import 한다(실제 Bedrock 호출 없음).

검수 두 단계:
  [오류] 녹화일/달력과 어긋나는 방송 날짜·요일 — 코드가 진실을 안다.
  [확인] 원문에 근거 없는 절대 날짜, 특정 과거 상대 날짜 — 사람이 본다(막지 않음).
"""
import sys
import types
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
sys.path.insert(0, str(Path(__file__).parent.parent / "common"))

# generate_script 가 모듈 로드 시점에 import 하는 의존성을 stub 으로 대체(네트워크·Bedrock 없음).
for _name in ("ddb_prompt", "bedrock_client", "json_extract"):
    if _name not in sys.modules:
        sys.modules[_name] = types.ModuleType(_name)
sys.modules["bedrock_client"].call_text = lambda *a, **k: ""  # type: ignore[attr-defined]
sys.modules["json_extract"].extract_json_object = lambda x: {}  # type: ignore[attr-defined]
sys.modules["json_extract"].extract_json_with_key = lambda x, k: {}  # type: ignore[attr-defined]
sys.modules["ddb_prompt"].load_prompt = lambda c: ""  # type: ignore[attr-defined]

from generate_script import date_issues, number_issues  # noqa: E402


def _script(*narrations: str) -> dict:
    return {"cuts": [{"narration": n, "caption": ""} for n in narrations]}


def _kinds(issues: list[str]) -> tuple[int, int]:
    """(오류 수, 확인 수) — '방송 날짜'·'요일 불일치'는 오류, 나머지는 확인."""
    err = sum(1 for x in issues if "방송 날짜" in x or "요일 불일치" in x)
    return err, len(issues) - err


# ── [오류] 코드가 진실을 아는 것 ────────────────────────────────────

def test_broadcast_date_matches_recording_date_is_clean():
    s = _script("It's Thursday, November 5. Let's look at the market.")
    assert date_issues(s, "", recording_date="2026-11-05") == []


def test_broadcast_date_wrong_is_error():
    # 녹화일은 11-05 인데 대본이 "November 4" 로 방송 날짜를 말함.
    s = _script("It's November 4. Here's today's briefing.")
    issues = date_issues(s, "", recording_date="2026-11-05")
    err, _ = _kinds(issues)
    assert err == 1
    assert any("방송 날짜" in x for x in issues)


def test_weekday_mismatch_is_error():
    # 2026-11-05 는 목요일(Thursday). "Friday, November 5" 는 요일이 틀림.
    s = _script("It's Friday, November 5. Markets opened higher.")
    issues = date_issues(s, "", recording_date="2026-11-05")
    assert any("요일 불일치" in x for x in issues)


def test_weekday_correct_is_clean():
    s = _script("It's Thursday, November 5. Markets opened higher.")
    issues = date_issues(s, "", recording_date="2026-11-05")
    assert not any("요일 불일치" in x for x in issues)


# ── [확인] 원문 해석이 필요한 것 ────────────────────────────────────

def test_relative_yesterday_flagged():
    s = _script("The index fell sharply yesterday.")
    issues = date_issues(s, "원문에는 지난달 수치만 있다.", recording_date="2026-11-05")
    assert any("상대 날짜" in x and "yesterday" in x for x in issues)
    assert _kinds(issues) == (0, 1)


def test_current_period_not_flagged():
    # "this year / this month" 는 현재 시점이라 노이즈 — 플래그하지 않는다.
    s = _script("This year the economy slowed. This month prices rose.")
    assert date_issues(s, "", recording_date="2026-11-05") == []


def test_absolute_date_in_article_is_clean():
    # 대본의 "November 9" 가 원문 '11월 9일' 에 근거가 있으면 통과.
    s = _script("The rate hike starts November 9.")
    issues = date_issues(s, "정부는 11월 9일부터 금리를 올린다.", recording_date="2026-11-05")
    assert issues == []


def test_absolute_date_not_in_article_flagged():
    s = _script("A new rule takes effect December 25.")
    issues = date_issues(s, "원문에는 그달 언급이 없다. 다른 내용뿐이다.", recording_date="2026-11-05")
    # 메시지는 월 이름 앞 3글자로 표기한다("Dec 25").
    assert any("원문에 없음" in x and "Dec 25" in x for x in issues)


def test_month_only_in_article_is_clean():
    # 원문이 '9월 말' 처럼 월만 언급해도, 대본의 'September 30' 은 그 달 근거가 있으니 확인 불필요.
    s = _script("Bank bond yields fell by late September.")
    issues = date_issues(s, "은행채 금리는 9월 말 4.525%였다.", recording_date="2026-11-05")
    assert not any("September" in x for x in issues)


def test_no_recording_date_skips_broadcast_check():
    # recording_date 없으면 방송 날짜·요일 검사는 건너뛴다(상대 날짜 확인은 그대로).
    s = _script("It's November 4 today. Prices rose yesterday.")
    issues = date_issues(s, "", recording_date=None)
    assert not any("방송 날짜" in x for x in issues)
    assert any("yesterday" in x for x in issues)


# ── number_issues() — 원화 금액 단위 변환 검수 ─────────────────────

def test_amount_correct_conversion_is_clean():
    # 원문 '2159억 원' → 각본 '215.9 billion won'은 정확한 변환.
    s = _script("The company posted 215.9 billion won in annual revenue.")
    assert number_issues(s, "지난해 연간 매출 2159억 원을 기록했다.") == []


def test_amount_trillion_from_jo_is_clean():
    # 원문 '4조 5082억 원' → '4.5082 trillion won'(±5% 안).
    s = _script("Deposits rose to 4.5 trillion won.")
    assert number_issues(s, "잔액은 4조 5082억 원으로 늘었다.") == []


def test_amount_unit_mistake_flagged():
    # 실제 오역(10/28): 원문 '1조 5234억 원'(공매도)인데 각본이 '4.2 billion won'.
    s = _script("Net short positions shrank from 4.2 billion won to 11 billion won.")
    issues = number_issues(s, "공매도 순보유 잔액은 1조 5234억 원에서 9796억 원으로 줄었다.")
    assert any("4.2 billion won" in x for x in issues)


def test_amount_no_source_amount_is_clean_when_no_won():
    # 원문에 한글 금액이 없으면 대조할 게 없어 플래그하지 않는다(오탐 방지).
    s = _script("Revenue grew sharply this quarter.")
    assert number_issues(s, "매출이 크게 늘었다. 구체 수치는 없다.") == []


def test_amount_hint_mentions_nearest():
    # 플래그에 가장 가까운 원문 금액이 참고로 붙는지.
    s = _script("It jumped to 15 million won per pyeong.")
    issues = number_issues(s, "평당 1590만 원까지 올랐다.")
    assert issues and ("가장 가까운" in issues[0] or "배" in issues[0])
