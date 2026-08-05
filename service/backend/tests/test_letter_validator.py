"""Tests for letter_validator module."""
from core25.letter_validator import validate_letters, ValidationResult


CANDIDATES = [
    {"article_id": "A1", "title": "t1"},
    {"article_id": "A2", "title": "t2"},
    {"article_id": "A3", "title": "t3"},
    {"article_id": "A4", "title": "t4"},
    {"article_id": "A5", "title": "t5"},
    {"article_id": "A6", "title": "t6"},
]


def _make_letter(editor_id, mbti, theme, article_ids):
    return {
        "editor_id": editor_id,
        "mbti_group": mbti,
        "theme": theme,
        "articles": [{"article_id": aid} for aid in article_ids],
    }


def test_valid_letters_pass():
    letters = [
        _make_letter("NT-min", "NT", "거시 정책", ["A1", "A2", "A3", "A4"]),
        _make_letter("NF-ha", "NF", "시장 심리", ["A1", "A3", "A5", "A6"]),
        _make_letter("ST-jun", "ST", "실적 분석", ["A2", "A4", "A5", "A6"]),
        _make_letter("SF-soy", "SF", "소비 변화", ["A3", "A4", "A5", "A6"]),
    ]
    result = validate_letters(letters, CANDIDATES)
    assert result.passed is True
    assert len(result.errors) == 0


def test_hallucinated_article_id_fails():
    letters = [
        _make_letter("NT-min", "NT", "거시", ["A1", "A2", "A3", "FAKE_ID"]),
        _make_letter("NF-ha", "NF", "심리", ["A1", "A2", "A3", "A4"]),
        _make_letter("ST-jun", "ST", "실적", ["A1", "A2", "A3", "A4"]),
        _make_letter("SF-soy", "SF", "소비", ["A1", "A2", "A3", "A4"]),
    ]
    result = validate_letters(letters, CANDIDATES)
    assert result.passed is False
    assert any("FAKE_ID" in e for e in result.errors)


def test_duplicate_themes_warned():
    letters = [
        _make_letter("NT-min", "NT", "반도체 호황", ["A1", "A2", "A3", "A4"]),
        _make_letter("NF-ha", "NF", "반도체 호황", ["A1", "A2", "A3", "A4"]),
        _make_letter("ST-jun", "ST", "실적", ["A1", "A2", "A3", "A4"]),
        _make_letter("SF-soy", "SF", "소비", ["A1", "A2", "A3", "A4"]),
    ]
    result = validate_letters(letters, CANDIDATES)
    assert len(result.warnings) > 0
    assert any("duplicate themes" in w for w in result.warnings)


def test_cross_editor_overlap_warned():
    letters = [
        _make_letter("NT-min", "NT", "거시", ["A1", "A2", "A3", "A4"]),
        _make_letter("NF-ha", "NF", "심리", ["A1", "A2", "A5", "A6"]),
        _make_letter("ST-jun", "ST", "실적", ["A3", "A4", "A5", "A6"]),
        _make_letter("SF-soy", "SF", "소비", ["A5", "A6", "A1", "A2"]),
    ]
    result = validate_letters(letters, CANDIDATES)
    assert any("shared across" in w for w in result.warnings)
