"""Unit tests for Core 2 Validator (TASK-2.4).

All unit — no live Bedrock calls. Nova Lite is mocked where the AI path is
exercised. Structural helpers are tested directly for determinism.

Run from ``backend/``::

    python3 -m pytest v2/tests/test_validator.py -v
"""
from __future__ import annotations

import asyncio
import json
from typing import Any, Dict
from unittest.mock import MagicMock

import pytest

from v2.core2.validator import (
    _build_ai_prompt,
    _is_korean_text,
    _parse_ai_issues,
    structural_check,
    validate_versions,
)


# =============================================================================
# Helpers
# =============================================================================


def _make_version(
    title: str = "테스트 제목",
    body: str = "한국어 본문" * 50,  # ~500 chars, well-formed Korean
    subtitle: str = "부제",
) -> Dict[str, Any]:
    return {
        "title": title,
        "subtitle": subtitle,
        "body": body,
        "key_points": ["포인트 1", "포인트 2"],
        "closing_line": "마무리",
    }


def _make_full_versions() -> Dict[str, Dict[str, Any]]:
    return {g: _make_version() for g in ("NT", "NF", "ST", "SF")}


def _make_mock_bedrock(ai_issues: list[dict] | None = None) -> MagicMock:
    """Mock bedrock-runtime client that returns a Nova-shaped response.

    ``ai_issues`` → list of issue dicts to embed in the response JSON.
    None or [] → validator sees an empty issues array (pass).
    """
    payload = {"issues": ai_issues or []}
    response_text = json.dumps(payload, ensure_ascii=False)
    body_bytes = json.dumps(
        {
            "output": {
                "message": {"content": [{"text": response_text}]}
            }
        }
    ).encode("utf-8")

    client = MagicMock()
    client.invoke_model.return_value = {
        "body": MagicMock(read=lambda: body_bytes)
    }
    return client


# =============================================================================
# _is_korean_text
# =============================================================================


def test_v2_2_4_is_korean_text_pure_korean() -> None:
    assert _is_korean_text("완전히 한국어 문장입니다.")


def test_v2_2_4_is_korean_text_mixed_high_korean() -> None:
    assert _is_korean_text("한국 경제 2026 GDP 성장률 예상치")


def test_v2_2_4_is_korean_text_empty() -> None:
    assert not _is_korean_text("")


def test_v2_2_4_is_korean_text_punctuation_only_rejected() -> None:
    assert not _is_korean_text("!!! ...??? 123")


def test_v2_2_4_is_korean_text_mostly_english() -> None:
    # 1 Korean letter among many English — below 30% threshold.
    assert not _is_korean_text("This is mostly English with one 한 Korean letter")


# =============================================================================
# structural_check
# =============================================================================


def test_v2_2_4_structural_full_valid_no_issues() -> None:
    assert structural_check(_make_full_versions()) == []


def test_v2_2_4_structural_missing_group_flagged() -> None:
    vs = _make_full_versions()
    del vs["SF"]
    issues = structural_check(vs)
    assert len(issues) == 1
    assert issues[0]["group"] == "SF"
    assert issues[0]["type"] == "missing"


def test_v2_2_4_structural_empty_title_flagged() -> None:
    vs = _make_full_versions()
    vs["NT"]["title"] = "   "
    issues = structural_check(vs)
    assert {"group": "NT", "type": "missing_title", "detail": "title empty"} in issues


def test_v2_2_4_structural_empty_body_flagged_once_not_length() -> None:
    """Empty body should flag missing_body and skip the length / lang checks."""
    vs = _make_full_versions()
    vs["NT"]["body"] = ""
    issues = structural_check(vs)
    nt_issues = [i for i in issues if i["group"] == "NT"]
    assert len(nt_issues) == 1
    assert nt_issues[0]["type"] == "missing_body"


def test_v2_2_4_structural_body_too_short_flagged() -> None:
    vs = _make_full_versions()
    vs["NT"]["body"] = "짧아요"
    issues = structural_check(vs)
    types = [i["type"] for i in issues if i["group"] == "NT"]
    assert "body_too_short" in types


def test_v2_2_4_structural_body_too_long_flagged() -> None:
    vs = _make_full_versions()
    vs["NT"]["body"] = "가" * 10_001
    issues = structural_check(vs)
    types = [i["type"] for i in issues if i["group"] == "NT"]
    assert "body_too_long" in types


def test_v2_2_4_structural_non_korean_body_flagged() -> None:
    vs = _make_full_versions()
    vs["NT"]["body"] = "This article is fully in English and goes on for a while. " * 5
    issues = structural_check(vs)
    types = [i["type"] for i in issues if i["group"] == "NT"]
    assert "wrong_language" in types


# =============================================================================
# _build_ai_prompt (pure)
# =============================================================================


def test_v2_2_4_build_ai_prompt_contains_all_4_groups() -> None:
    prompt = _build_ai_prompt("원본제목", "원본본문", _make_full_versions())
    for group in ("NT", "NF", "ST", "SF"):
        assert f"[{group}]" in prompt


def test_v2_2_4_build_ai_prompt_truncates_long_content() -> None:
    long_content = "가" * 5_000
    prompt = _build_ai_prompt("t", long_content, _make_full_versions())
    # 600-char cap on original content AND each version excerpt (TASK-7-Z-3 followup parity).
    assert prompt.count("가") < 1_000


# =============================================================================
# _parse_ai_issues (pure)
# =============================================================================


def test_v2_2_4_parse_ai_issues_empty_list() -> None:
    assert _parse_ai_issues('{"issues": []}') == []


def test_v2_2_4_parse_ai_issues_with_hallucination() -> None:
    text = '{"issues": [{"group": "NT", "type": "hallucination", "detail": "다른 주제"}]}'
    issues = _parse_ai_issues(text)
    assert len(issues) == 1
    assert issues[0]["group"] == "NT"
    assert issues[0]["type"] == "hallucination"


def test_v2_2_4_parse_ai_issues_wrapped_in_prose() -> None:
    """Nova sometimes prefixes the JSON with commentary; we handle it."""
    text = 'Sure, here is the result:\n{"issues": []}\nEnd.'
    assert _parse_ai_issues(text) == []


def test_v2_2_4_parse_ai_issues_no_json_returns_empty() -> None:
    assert _parse_ai_issues("I cannot find any issues.") == []


def test_v2_2_4_parse_ai_issues_malformed_json_returns_empty() -> None:
    assert _parse_ai_issues('{"issues": [broken') == []


def test_v2_2_4_parse_ai_issues_filters_unknown_groups() -> None:
    """Nova hallucinating a group name like 'XX' should not leak through."""
    text = '{"issues": [{"group": "XX", "type": "hallucination", "detail": "bad"}]}'
    assert _parse_ai_issues(text) == []


# =============================================================================
# validate_versions — end-to-end
# =============================================================================


def test_v2_2_4_validate_structural_only_passes() -> None:
    """AI check disabled + all 4 versions valid → passed, no issues, no AI call."""
    mock_client = MagicMock()  # will raise AttributeError if invoked
    mock_client.invoke_model.side_effect = AssertionError("should not call AI")

    result = asyncio.run(
        validate_versions(
            title="원본",
            content="본문",
            versions=_make_full_versions(),
            enable_ai_check=False,
            bedrock_client=mock_client,
        )
    )
    assert result.passed is True
    assert result.issues == []
    assert result.ai_check_used is False
    mock_client.invoke_model.assert_not_called()


def test_v2_2_4_validate_structural_fails_skips_ai_call() -> None:
    """Structural issue → early return, Nova never invoked."""
    vs = _make_full_versions()
    vs["NT"]["body"] = ""  # missing_body
    mock_client = MagicMock()

    result = asyncio.run(
        validate_versions(
            title="원본", content="본문", versions=vs, bedrock_client=mock_client
        )
    )
    assert result.passed is False
    assert any(i["type"] == "missing_body" for i in result.issues)
    mock_client.invoke_model.assert_not_called()
    assert result.ai_check_used is False


def test_v2_2_4_validate_ai_clean_passes() -> None:
    """Structural clean + Nova returns no issues → passed."""
    mock_client = _make_mock_bedrock(ai_issues=[])
    result = asyncio.run(
        validate_versions(
            title="원본",
            content="본문",
            versions=_make_full_versions(),
            bedrock_client=mock_client,
        )
    )
    assert result.passed is True
    assert result.ai_check_used is True
    mock_client.invoke_model.assert_called_once()


def test_v2_2_4_validate_ai_flags_hallucination_fails() -> None:
    """Structural clean + Nova reports hallucination → failed."""
    mock_client = _make_mock_bedrock(
        ai_issues=[
            {
                "group": "NF",
                "type": "hallucination",
                "detail": "원본과 완전히 다른 주제",
            }
        ]
    )
    result = asyncio.run(
        validate_versions(
            title="원본",
            content="본문",
            versions=_make_full_versions(),
            bedrock_client=mock_client,
        )
    )
    assert result.passed is False
    assert len(result.issues) == 1
    assert result.issues[0]["group"] == "NF"
    assert result.issues[0]["type"] == "hallucination"


def test_v2_2_4_validate_ai_error_defaults_to_pass() -> None:
    """Nova raises → validator treats as passing (log WARNING)."""
    mock_client = MagicMock()
    mock_client.invoke_model.side_effect = RuntimeError("Bedrock throttled")

    result = asyncio.run(
        validate_versions(
            title="원본",
            content="본문",
            versions=_make_full_versions(),
            bedrock_client=mock_client,
        )
    )
    assert result.passed is True
    assert result.issues == []
    assert result.ai_check_used is True


def test_v2_2_4_validate_to_dict_shape() -> None:
    """ValidationResult.to_dict() matches the documented schema."""
    mock_client = _make_mock_bedrock(ai_issues=[])
    result = asyncio.run(
        validate_versions(
            title="t",
            content="c",
            versions=_make_full_versions(),
            bedrock_client=mock_client,
        )
    )
    d = result.to_dict()
    assert set(d.keys()) == {"passed", "issues", "ai_check_used"}
    assert isinstance(d["passed"], bool)
    assert isinstance(d["issues"], list)
    assert isinstance(d["ai_check_used"], bool)


# =============================================================================
# TASK-7-Z-3 followup — Phase 2-A patches
# =============================================================================


def test_v2_2_4_followup_parse_ai_issues_filters_unrequested_groups() -> None:
    """Nova returns issue for SF when only NT was requested → drop it."""
    raw = '{"issues":[{"group":"SF","type":"hallucination","detail":"x"},{"group":"NT","type":"hallucination","detail":"y"}]}'
    out = _parse_ai_issues(raw, requested_groups=["NT"])
    assert len(out) == 1
    assert out[0]["group"] == "NT"


def test_v2_2_4_followup_parse_ai_issues_no_filter_falls_back_to_all_4() -> None:
    """When requested_groups=None, behavior matches pre-followup default."""
    raw = '{"issues":[{"group":"SF","type":"hallucination","detail":"x"}]}'
    out = _parse_ai_issues(raw, requested_groups=None)
    assert len(out) == 1


def test_v2_2_4_followup_build_ai_prompt_excerpt_parity() -> None:
    """Both original and version excerpts should be 600 chars."""
    long_body = "B" * 1000
    versions = {"NT": {"title": "T" * 200, "body": long_body}}
    prompt = _build_ai_prompt("orig title", "O" * 1000, versions)
    # Body excerpt should now be 600 (not 250 as in pre-followup)
    assert "B" * 600 in prompt
    assert "B" * 601 not in prompt
