r"""json_extract 단위 테스트.

2026-08-24 — 실운영(mustknow_auto)에서 기사가 통째로 스킵되는 실패를 재현하려고
추가했다. 08-24 08:20 런에서 `json.decoder.JSONDecodeError: Invalid \escape:
line 41 column 179 (char 2550)` 로 기사 1건이 날아갔다("20일 만에 뒤집힌 종부세…").

원인: 장면연출 프롬프트 출력이 한국어 지문 안에 작은따옴표 문자열을 많이 담는데
(캡션 박스 'D+20일'), Claude 가 이걸 종종 \' 로 이스케이프한다. JSON 이 허용하는
이스케이프는 " \ / b f n r t u 뿐이라 \' 는 파싱 실패다.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from json_extract import (  # noqa: E402
    extract_fenced_json_text,
    loads_lenient,
    repair_invalid_escapes,
)


def test_valid_json_untouched():
    assert loads_lenient('{"a": 1}') == {"a": 1}


def test_valid_escapes_survive_repair():
    # 정상 이스케이프는 손대지 않는다 — 줄바꿈·따옴표·역슬래시·유니코드
    src = '{"s": "a\\nb \\"q\\" c\\\\d \\uAC00"}'
    assert loads_lenient(src) == json.loads(src)


def test_literal_backslash_preserved():
    # \\ 를 \ 로 잘못 줄이면 안 된다
    assert loads_lenient('{"s": "C:\\\\tmp"}')["s"] == "C:\\tmp"


def test_invalid_single_quote_escape_is_repaired():
    # 실제 프로덕션 실패 패턴
    assert loads_lenient(r'{"s": "\'D+20일\'"}')["s"] == "'D+20일'"


def test_invalid_unicode_escape_is_repaired():
    # \u 뒤에 16진수 4자리가 없으면 유니코드 이스케이프가 아니다
    assert loads_lenient(r'{"s": "100\units"}')["s"] == "100units"


def test_trailing_lone_backslash_dropped():
    assert repair_invalid_escapes('{"s": "x\\') == '{"s": "x'


def test_production_payload_shape_parses():
    """08-24 08:20 실패 페이로드와 같은 모양 — 펜스 + 한국어 지문 + \\' 이스케이프."""
    raw = (
        "```json\n"
        "{\n"
        '  "scenes": [\n'
        '    {"cut": 1, "camera": "부감 와이드",\n'
        "     \"scene\": \"캡션 박스 \\'D+20일\\'. 인물 없음.\"}\n"
        "  ]\n"
        "}\n"
        "```"
    )
    fenced = extract_fenced_json_text(raw, opener="{")
    assert fenced is not None

    # 수리 전에는 실패한다는 것 자체를 고정한다 (회귀 방지)
    try:
        json.loads(fenced)
        raise AssertionError("이 페이로드는 표준 json.loads 로는 실패해야 한다")
    except json.JSONDecodeError:
        pass

    parsed = loads_lenient(fenced)
    assert parsed["scenes"][0]["scene"] == "캡션 박스 'D+20일'. 인물 없음."
