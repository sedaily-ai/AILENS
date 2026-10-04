"""Unit tests for today_letters body enrichment (mode-A → body[] bridge).

Editor Pick 은 편지를 v1 mode-A(``articles[]``)로 저장하고, 프론트는
``body[]`` 를 렌더한다. ``_enrich_body`` 가 그 간극을 메운다 (2026-07-24).

Run from ``backend/``::

    python3 -m pytest v2/tests/test_today_letters.py -v
"""
from __future__ import annotations

from handlers.content.today_letters import (
    _enrich_body,
    _flatten_mode_a_articles,
    _key_points_from_mode_a,
)


def _mode_a_article() -> dict:
    return {
        "article_id": "N1",
        "original_title": "원본 제목",
        "thumbnail_title": "보유세 법률화",
        "summary": ["요지 1", "요지 2"],
        "qa": [
            {"q": "구조적 의미는?", "a": "법률 명시로 지속된다."},
            {"q": "기준은?", "a": "추후 제시."},
        ],
        "insight": {"q": "시장 신호?", "a": "기조 유지 신호."},
    }


def test_flatten_uses_renderer_markers() -> None:
    body = _flatten_mode_a_articles([_mode_a_article()])
    assert body[0] == "■ 1. 보유세 법률화"        # 섹션 헤더
    assert "요지 1" in body and "요지 2" in body    # summary 문단
    # Q/A 는 한 문자열 안에 함께 (프론트 정규식 기준)
    assert any(s.startswith("Q. 구조적 의미는?") and " A. 법률 명시로 지속된다." in s for s in body)
    # insight 는 콜아웃 마커
    assert "[인사이트] 기조 유지 신호." in body


def test_flatten_skips_empty_qa_and_insight() -> None:
    art = {"thumbnail_title": "제목", "summary": [], "qa": [{"q": "", "a": ""}], "insight": {}}
    body = _flatten_mode_a_articles([art])
    assert body == ["■ 1. 제목"]  # 헤더만, 빈 qa/insight 는 제외


def test_key_points_are_article_titles() -> None:
    pts = _key_points_from_mode_a([_mode_a_article(), {"original_title": "제목만"}])
    assert pts == ["보유세 법률화", "제목만"]


def test_enrich_body_transforms_mode_a() -> None:
    row = {"body_inline": {"articles": [_mode_a_article()]}}
    out = _enrich_body(row)
    assert out["body"][0] == "■ 1. 보유세 법률화"
    assert out["key_points"] == ["보유세 법률화"]


def test_enrich_body_passes_through_new_format() -> None:
    # 신형식(body[] 직접)은 변환 없이 통과.
    row = {"body_inline": {"body": ["문단 A", "문단 B"], "key_points": ["kp"]}}
    out = _enrich_body(row)
    assert out == {"body": ["문단 A", "문단 B"], "key_points": ["kp"]}


def test_enrich_body_parses_json_string_inline() -> None:
    import json
    row = {"body_inline": json.dumps({"articles": [_mode_a_article()]})}
    out = _enrich_body(row)
    assert out["body"][0] == "■ 1. 보유세 법률화"


def test_enrich_body_empty_when_no_content() -> None:
    assert _enrich_body({"body_inline": {}}) == {"body": [], "key_points": []}
    assert _enrich_body({}) == {"body": [], "key_points": []}
