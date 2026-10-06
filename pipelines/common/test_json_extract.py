r"""json_extract 단위 테스트.

실운영 실패 재현: 한국어 지문 안의 작은따옴표 문자열(캡션 박스 'D+20일')을
Claude 가 \' 로 이스케이프하는데, JSON 이 허용하는 이스케이프는 " \ / b f n r t u
뿐이라 파싱이 실패하고 기사 1건이 스킵됐다.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from json_extract import (  # noqa: E402
    extract_fenced_json_text,
    extract_json_object,
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
    """실운영 실패 페이로드와 같은 모양 — 펜스 + 한국어 지문 + \\' 이스케이프."""
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


# --------------------------------------------------------------------------
# extract_json_object — webtoon/pipeline.py·video/generate_script.py가 공유하는
# 폴백 체인. 두 파일의 실제 실패 사례를 회귀 테스트로 둔다.


def test_extract_json_object_prefers_json_fence():
    raw = 'intro\n```json\n{"a": 1}\n```\ntrailer'
    assert extract_json_object(raw) == {"a": 1}


def test_extract_json_object_falls_back_to_bare_text():
    # 코드블록 지침을 안 따르고 순수 JSON 텍스트만 반환하는 경우
    assert extract_json_object('  {"a": 1}  ') == {"a": 1}


def test_extract_json_object_falls_back_to_brace_slice():
    # 앞뒤에 설명 문구가 섞여 있는 경우
    raw = '여기 요청하신 JSON입니다: {"a": 1} 이상입니다.'
    assert extract_json_object(raw) == {"a": 1}


def test_extract_json_object_repairs_invalid_escape_inside_fence():
    raw = "```json\n" + r'{"s": "\'D+20일\'"}' + "\n```"
    assert extract_json_object(raw)["s"] == "'D+20일'"


def test_extract_json_object_raises_when_nothing_parses():
    try:
        extract_json_object("이건 JSON이 아닙니다.")
        raise AssertionError("파싱할 JSON이 없으면 ValueError 여야 한다")
    except ValueError:
        pass
