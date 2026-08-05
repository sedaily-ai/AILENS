"""Editor Pick v3 경로 테스트 — 페르소나별 4 invoke, 에세이형."""
from __future__ import annotations

import io
import json
from typing import Any, Dict, List
from unittest.mock import MagicMock

import pytest

from core25.editor_pick_service import run_editor_pick
from core25.editor_pick_v3 import (
    build_v3_user_message,
    enrich_full_bodies,
    parse_v3_letter,
)


def _v3_reply(headline: str = "구조가 말하는 것") -> str:
    body_lines = ["■ 오늘의 세 줄"] + [f"본문 문단 {i} — " + "가" * 60 for i in range(25)]
    lines = [
        f"HEADLINE: {headline}",
        "SUBTITLE: 부제 한 줄",
        "THEME: 주제",
        "ARCHETYPE: 이번 주의 구조 분석",
        "KEYPOINT: 포인트1",
        "KEYPOINT: 포인트2",
        "KEYPOINT: 포인트3",
        "KEYPOINT: 포인트4",
        "KEYWORD: DUV :: 노광 장비",
        "CLOSING: 마무리.",
        "BODY:",
    ] + body_lines
    return "\n".join(lines)


def _bedrock_returning(text: str) -> MagicMock:
    client = MagicMock()

    def _invoke(**kwargs):
        payload = {
            "content": [{"type": "text", "text": text}],
            "usage": {"input_tokens": 100, "output_tokens": 200},
        }
        return {"body": io.BytesIO(json.dumps(payload).encode("utf-8"))}

    client.invoke_model.side_effect = _invoke
    return client


class _Source:
    def __init__(self, rows):
        self.rows = rows

    def get_editor_pick_candidates(self, letter_date, limit=20):
        return self.rows


class _Sink:
    def __init__(self):
        self.inserted: List[Dict[str, Any]] = []

    def insert_daily_letter(self, letter):
        self.inserted.append(letter)


_ROWS = [
    {"article_id": f"art-{i}", "title": f"기사{i}", "subtitle": "", "category": "경제",
     "themes": [], "press": "서울경제", "byline": "", "snippet": "발췌",
     "transformed_versions": {}, "paper_date": "20260803"}
    for i in range(4)
]


def test_parse_v3_letter_rejects_short_body():
    with pytest.raises(ValueError):
        parse_v3_letter("HEADLINE: 제목\nBODY:\n짧다")


def test_parse_v3_letter_strips_code_fence():
    parsed = parse_v3_letter("```text\n" + _v3_reply() + "\n```")
    assert parsed["headline"] == "구조가 말하는 것"
    assert parsed["key_points"] == ["포인트1", "포인트2", "포인트3", "포인트4"]


def test_run_editor_pick_v3_end_to_end():
    sink = _Sink()
    result = run_editor_pick(
        source=_Source(_ROWS),
        sink=sink,
        letter_date="2026-08-03",
        bedrock_client=_bedrock_returning(_v3_reply()),
        prompt_version="v3",
    )
    assert result["prompt_version"] == "v3"
    assert result["letters_inserted"] == 4
    groups = [r["mbti_group"] for r in sink.inserted]
    assert groups == ["NT", "NF", "ST", "SF"]
    rec = sink.inserted[0]
    # 신형식 body_inline — today-letters API 가 평탄화 없이 그대로 통과시키는 형태.
    assert rec["body_inline"]["body"][0].startswith("■")
    assert rec["article_id"] == "art-0"
    assert rec["secondary_article_ids"] == ["art-1", "art-2", "art-3"]
    assert rec["keywords"][0]["term"] == "DUV"


def test_run_editor_pick_v3_partial_failure_skips_group():
    """한 페르소나가 계속 파싱 실패해도 나머지 3편은 발행된다."""
    calls = {"n": 0}

    def _invoke(**kwargs):
        calls["n"] += 1
        # 첫 그룹(NT)의 3회 시도 전부 깨진 JSON, 이후 정상.
        text = "마커 없는 잡담 응답" if calls["n"] <= 3 else _v3_reply()
        payload = {"content": [{"type": "text", "text": text}],
                   "usage": {"input_tokens": 1, "output_tokens": 1}}
        return {"body": io.BytesIO(json.dumps(payload).encode("utf-8"))}

    client = MagicMock()
    client.invoke_model.side_effect = _invoke

    sink = _Sink()
    result = run_editor_pick(
        source=_Source(_ROWS), sink=sink, letter_date="2026-08-03",
        bedrock_client=client, prompt_version="v3",
    )
    assert result["letters_inserted"] == 3
    assert [r["mbti_group"] for r in sink.inserted] == ["NF", "ST", "SF"]


def test_run_editor_pick_default_stays_v1():
    """prompt_version 미지정 + env 미설정이면 기존 orchestrator 경로 유지."""
    import core25.editor_pick_service as svc
    called = {}

    def _fake_orchestrator(*args, **kwargs):
        called["v1"] = True
        return {"mode": "A", "letters": [], "_usage": {}}

    orig = svc.invoke_letter_orchestrator
    svc.invoke_letter_orchestrator = _fake_orchestrator
    try:
        result = run_editor_pick(
            source=_Source(_ROWS), sink=_Sink(), letter_date="2026-08-03",
            bedrock_client=MagicMock(),
        )
    finally:
        svc.invoke_letter_orchestrator = orig
    assert called.get("v1") is True
    assert "prompt_version" not in result


def test_enrich_full_bodies_injects_content():
    s3 = MagicMock()
    s3.get_article_file.return_value = {"content_ko": "전문 본문 텍스트"}
    rows = [dict(r) for r in _ROWS]
    enrich_full_bodies(rows, s3)
    assert rows[0]["full_body"] == "전문 본문 텍스트"
    msg = build_v3_user_message(rows, "2026-08-03", "민철")
    assert "전문 본문 텍스트" in msg
