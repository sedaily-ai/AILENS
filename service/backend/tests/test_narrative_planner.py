"""Tests for narrative_planner module."""
import json
import os
import pytest
from unittest.mock import patch, MagicMock

from core25.narrative_planner import plan_narratives, is_enabled


SAMPLE_CANDIDATES = [
    {"article_id": "A1", "title": "기획처 한은 방문", "category": "경제", "snippet": "기획처 장관이 한은을 방문했다."},
    {"article_id": "A2", "title": "삼성전자 파업 우려", "category": "경제", "snippet": "삼성전자 노조가 파업을 예고했다."},
    {"article_id": "A3", "title": "증권사 순익 4조", "category": "금융", "snippet": "10대 증권사 1분기 순익이 4조를 넘었다."},
    {"article_id": "A4", "title": "K푸드 수출 확대", "category": "산업", "snippet": "K푸드 수출이 전년 대비 23% 증가했다."},
]


def test_is_enabled_default_false():
    with patch.dict(os.environ, {}, clear=True):
        os.environ.pop("NARRATIVE_PLANNER_ENABLED", None)
        assert is_enabled() is False


def test_is_enabled_true():
    with patch.dict(os.environ, {"NARRATIVE_PLANNER_ENABLED": "true"}):
        assert is_enabled() is True


def test_plan_narratives_disabled_returns_none():
    with patch.dict(os.environ, {"NARRATIVE_PLANNER_ENABLED": "false"}):
        result = plan_narratives(SAMPLE_CANDIDATES, "2026-05-14")
        assert result is None


def test_plan_narratives_empty_candidates_returns_none():
    with patch.dict(os.environ, {"NARRATIVE_PLANNER_ENABLED": "true"}):
        result = plan_narratives([], "2026-05-14")
        assert result is None


def test_plan_narratives_success_mock():
    mock_response = {
        "content": [{"type": "text", "text": json.dumps({
            "frames": [
                {"editor_id": "NT-min", "landscape": "재정·통화 공조", "entry_pattern": "대조", "article_ids": ["A1", "A3", "A2", "A4"], "reasoning": "test"},
                {"editor_id": "NF-ha", "landscape": "일과 삶의 변화", "entry_pattern": "균열", "article_ids": ["A2", "A1", "A4", "A3"], "reasoning": "test"},
                {"editor_id": "ST-jun", "landscape": "실적 시즌", "entry_pattern": "가림", "article_ids": ["A3", "A2", "A1", "A4"], "reasoning": "test"},
                {"editor_id": "SF-soy", "landscape": "소비 전환", "entry_pattern": "어제연결", "article_ids": ["A4", "A1", "A2", "A3"], "reasoning": "test"},
            ]
        })}],
        "usage": {"input_tokens": 2000, "output_tokens": 500},
    }

    mock_client = MagicMock()
    mock_body = MagicMock()
    mock_body.read.return_value = json.dumps(mock_response).encode()
    mock_client.invoke_model.return_value = {"body": mock_body}

    with patch.dict(os.environ, {"NARRATIVE_PLANNER_ENABLED": "true"}):
        result = plan_narratives(
            SAMPLE_CANDIDATES, "2026-05-14", bedrock_client=mock_client
        )

    assert result is not None
    assert len(result["frames"]) == 4
    assert result["_elapsed_s"] >= 0
    assert result["_usage"]["input_tokens"] == 2000


def test_plan_narratives_bedrock_failure_returns_none():
    mock_client = MagicMock()
    mock_client.invoke_model.side_effect = Exception("Bedrock timeout")

    with patch.dict(os.environ, {"NARRATIVE_PLANNER_ENABLED": "true"}):
        result = plan_narratives(
            SAMPLE_CANDIDATES, "2026-05-14", bedrock_client=mock_client
        )

    assert result is None
