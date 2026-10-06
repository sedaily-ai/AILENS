"""text_utils 단위 테스트 — FACT_IDS 트레일러 처리.

산출물 맨 끝의 `FACT_IDS: [1, 3, 4]` 트레일러가 본문에 남으면 두 가지가 깨진다:
  - 레터: parse_letters 에 종료 조건이 없어 발행 본문 문단이 된다
  - 팟캐스트: Polly 가 "FACT_IDS 대괄호 일 쉼표 삼" 을 소리 내어 읽는다
"""
import ast
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from text_utils import extract_fact_ids, strip_code_fence  # noqa: E402

_PIPELINES = Path(__file__).resolve().parent.parent


def _load_parse_letters(rel: str):
    """무거운 의존성 없이 대상 함수만 뽑아 실행한다."""
    src = (_PIPELINES / rel).read_text(encoding="utf-8")
    ns = {"re": __import__("re"), "extract_fact_ids": extract_fact_ids}
    body = [n for n in ast.parse(src).body
            if isinstance(n, ast.FunctionDef) and n.name == "parse_letters"]
    assert body, f"{rel}: parse_letters 없음"
    exec(compile(ast.Module(body=body, type_ignores=[]), rel, "exec"), ns)
    return ns["parse_letters"]


def test_extract_returns_ids_and_strips():
    body, ids = extract_fact_ids("본문입니다.\n\nFACT_IDS: [1, 3, 4]")
    assert ids == [1, 3, 4]
    assert "FACT_IDS" not in body
    assert body == "본문입니다."


def test_absent_trailer_is_noop():
    body, ids = extract_fact_ids("본문만 있습니다.")
    assert ids == []
    assert body == "본문만 있습니다."


def test_empty_list_is_valid():
    body, ids = extract_fact_ids("본문.\nFACT_IDS: []")
    assert ids == []
    assert "FACT_IDS" not in body


def test_strip_code_fence_removes_fence_and_trailer():
    out = strip_code_fence("```\n대본 본문입니다.\n```\nFACT_IDS: [2, 5]")
    assert out == "대본 본문입니다."
    assert "FACT_IDS" not in out


def test_trailer_inside_fence_still_removed():
    # 모델이 규격을 어기고 블록 안에 넣어도 TTS로 새면 안 된다
    out = strip_code_fence("```\n대본.\nFACT_IDS: [7]\n```")
    assert "FACT_IDS" not in out


def test_parse_letters_does_not_publish_trailer():
    raw = (
        "```\n"
        "[제목] 어떤 제목\n"
        "[리드]\n"
        "리드 문장입니다.\n"
        "◾ 소제목\n"
        "본문 문단입니다.\n"
        "자료: 서울경제\n"
        "```\n"
        "FACT_IDS: [1, 2]\n"
    )
    for rel in ("common/publish_utils.py",):
        paragraphs = _load_parse_letters(rel)(raw)
        joined = " ".join(paragraphs)
        assert "FACT_IDS" not in joined, f"{rel}: 트레일러가 본문으로 발행됨"
        assert "본문 문단입니다." in joined, f"{rel}: 본문이 사라짐"
