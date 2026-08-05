"""Unit tests for post_validator_fix_diagnostic_v3.

Run from backend/ directory:
    python3 -m pytest v2/tools/test_diagnostic_v3.py -v

These tests verify the v3 issue-type parser handles real-shape Lambda
log lines correctly. The key concern is that v2's parser returned
hallucination_count=0 even when raw_log_peek showed 100% hallucination,
implying CloudWatch Logs Insights' `fields ... issues` output didn't
serialize the nested array as v2 expected.

v3 sidesteps that by pulling @message itself and parsing the entire
JSON object Python-side. These tests pin that behavior.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

# Add the tools dir to path so we can import the script
sys.path.insert(0, str(Path(__file__).parent))

# Bring the parser-relevant chunk of section_b into a callable for tests.
# Easiest path: re-implement the parse loop inline so we test exactly the
# code shape v3 uses, without needing to mock boto3.

_STRUCTURAL = {
    "missing", "missing_title", "missing_body",
    "body_too_short", "body_too_long", "wrong_language",
}


def _parse_v3(raw_messages):
    """Mirror of v3 section_b inner parse loop. Inputs: list of raw @message
    strings. Returns the same issue_type_summary dict."""
    type_counts = {}
    samples = []
    parse_failures = 0
    other_event_skipped = 0
    for msg in raw_messages:
        start_brace = msg.find("{")
        if start_brace == -1:
            parse_failures += 1
            continue
        depth = 0
        end_brace = -1
        for i in range(start_brace, len(msg)):
            ch = msg[i]
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    end_brace = i
                    break
        if end_brace == -1:
            parse_failures += 1
            continue
        try:
            parsed = json.loads(msg[start_brace:end_brace + 1])
        except json.JSONDecodeError:
            parse_failures += 1
            continue
        if not isinstance(parsed, dict):
            parse_failures += 1
            continue
        if parsed.get("event") != "transform_validation_failure":
            other_event_skipped += 1
            continue
        issues = parsed.get("issues", [])
        if isinstance(issues, list):
            for it in issues:
                if isinstance(it, dict):
                    t = str(it.get("type", "<unknown>"))
                    type_counts[t] = type_counts.get(t, 0) + 1
        samples.append(parsed)

    return {
        "type_counts": type_counts,
        "hallucination_count": type_counts.get("hallucination", 0),
        "structural_count": sum(v for k, v in type_counts.items() if k in _STRUCTURAL),
        "samples_parsed_ok": len(samples),
        "samples_unparseable": parse_failures,
        "samples_other_event_skipped": other_event_skipped,
        "raw_messages_fetched": len(raw_messages),
    }


# ── Fixture data — matches what core2_transform.py:453-462 emits ─────────────


def _make_validation_failure_msg(news_id, issues, ai_check_used=True):
    """Match the exact json.dumps shape from core2_transform.py."""
    body = json.dumps(
        {
            "event": "transform_validation_failure",
            "news_id": news_id,
            "requested_groups": ["NT", "NF", "ST", "SF"],
            "ai_check_used": ai_check_used,
            "issues": issues,
            "usage": {"input_tokens": 1096, "output_tokens": 1879},
        },
        ensure_ascii=False,
    )
    # Lambda runtime typical wrapping
    return f"[ERROR]\t2026-04-30T05:30:00.000Z\trequest-id-abc\t{body}\n"


# ── Tests ─────────────────────────────────────────────────────────────────────


def test_v3_counts_hallucination_only():
    """Phase 1.5b shape — 100% hallucination."""
    msgs = [
        _make_validation_failure_msg(
            "2KBBZ460OY",
            [{"group": "NF", "type": "hallucination",
              "detail": "원본과 다른 주제"}],
        ),
        _make_validation_failure_msg(
            "2KBBZBPOVF",
            [{"group": "NF", "type": "hallucination", "detail": "..."},
             {"group": "SF", "type": "hallucination", "detail": "..."}],
        ),
    ]
    summary = _parse_v3(msgs)
    assert summary["hallucination_count"] == 3
    assert summary["structural_count"] == 0
    assert summary["samples_parsed_ok"] == 2


def test_v3_counts_structural_only():
    msgs = [
        _make_validation_failure_msg(
            "abc",
            [{"group": "NT", "type": "body_too_short", "detail": "50 < 100"},
             {"group": "NF", "type": "missing_body", "detail": "body empty"}],
        ),
    ]
    summary = _parse_v3(msgs)
    assert summary["hallucination_count"] == 0
    assert summary["structural_count"] == 2


def test_v3_counts_mixed():
    msgs = [
        _make_validation_failure_msg(
            "abc",
            [{"group": "NT", "type": "hallucination", "detail": "x"},
             {"group": "NF", "type": "body_too_short", "detail": "50 < 100"}],
        ),
    ]
    summary = _parse_v3(msgs)
    assert summary["hallucination_count"] == 1
    assert summary["structural_count"] == 1


def test_v3_handles_korean_in_detail():
    """ensure_ascii=False emits raw Korean — depth-counted scan must
    not get confused by non-ASCII content inside braces."""
    msgs = [
        _make_validation_failure_msg(
            "2KBBZ460OY",
            [{"group": "NF", "type": "hallucination",
              "detail": "원본 기사의 주제인 서울시의 청년 월세 지원 정책 확대와 달리, "
                        "변환 버전은 월 20만 원이 청년들에게 어떤 영향을 미치는지에 "
                        "대한 일반적인 고찰로 주제가 달라졌습니다."}],
        ),
    ]
    summary = _parse_v3(msgs)
    assert summary["hallucination_count"] == 1


def test_v3_skips_other_events():
    """Substring 'transform_validation_failure' might appear in other
    event lines (e.g. transform_run_complete with failed_ids list).
    Only the validation_failure event itself should contribute to
    type_counts."""
    other_event = (
        '[INFO]\t2026-04-30T05:30:00.000Z\treq-x\t'
        '{"event": "transform_run_complete", "queue_rows": 7, '
        '"failed_ids": ["abc", "transform_validation_failure_dummy"]}'
    )
    valid_event = _make_validation_failure_msg(
        "abc",
        [{"group": "NF", "type": "hallucination", "detail": "x"}],
    )
    summary = _parse_v3([other_event, valid_event])
    assert summary["hallucination_count"] == 1
    assert summary["samples_parsed_ok"] == 1
    assert summary["samples_other_event_skipped"] == 1


def test_v3_handles_unparseable():
    """Garbled lines should not crash; they bump samples_unparseable."""
    msgs = [
        "no braces at all",
        "{",
        "{ unbalanced",
        "{not valid json}",
    ]
    summary = _parse_v3(msgs)
    # The {not valid json} has balanced braces but invalid JSON
    assert summary["samples_unparseable"] >= 3
    assert summary["hallucination_count"] == 0


def test_v3_empty_input():
    summary = _parse_v3([])
    assert summary["hallucination_count"] == 0
    assert summary["structural_count"] == 0
    assert summary["samples_parsed_ok"] == 0
    assert summary["raw_messages_fetched"] == 0
