"""웹툰 스트리밍의 전송 실패·불완전 응답 회귀 검사. 실제 AWS 호출 없음."""
from __future__ import annotations

import json
from unittest.mock import Mock

import pytest

from routes import chat_ws


class FakeStream:
    def __init__(self, events):
        self.events = events
        self.closed = False

    def __iter__(self):
        for event in self.events:
            if isinstance(event, Exception):
                raise event
            yield event

    def close(self):
        self.closed = True


@pytest.fixture
def setup_flow(monkeypatch):
    def setup(*, text='{"core_question":"질문","cuts":[{"cut":1}]}', stop_reason="end_turn", stream_error=None):
        midpoint = len(text) // 2
        events = [
            {"contentBlockDelta": {"delta": {"text": text[:midpoint]}}},
            {"contentBlockDelta": {"delta": {"text": text[midpoint:]}}},
        ]
        if stream_error:
            events.append(stream_error)
        elif stop_reason is not None:
            events.append({"messageStop": {"stopReason": stop_reason}})
        events.append({"metadata": {"usage": {"outputTokens": 20}}})
        stream = FakeStream(events)
        client = Mock()
        client.converse_stream.return_value = {"stream": stream}
        monkeypatch.setattr(chat_ws, "_get_bedrock_client", lambda: client)
        monkeypatch.setattr(chat_ws, "_resolve_prompt_content", lambda *args: "지침")
        monkeypatch.setattr(chat_ws.webtoon_script, "build_script_call", lambda *args: ("system", "article", "test-profile", 16000))
        monkeypatch.setattr(chat_ws.webtoon_script, "validate_storyboard", Mock())
        monkeypatch.setattr(chat_ws.webtoon_script, "normalize_cuts", lambda script: script["cuts"])
        return client, stream

    return setup


@pytest.mark.parametrize("fail_preview", [False, True])
def test_preview_failure_still_delivers_complete_storyboard(setup_flow, fail_preview):
    client, stream = setup_flow()
    events = []

    def push(event):
        events.append(event)
        return not (fail_preview and event["type"] == "script_chunk")

    chat_ws._run_article_flow(push, "원문", model_id="opus-5")

    storyboard = next(event for event in events if event["type"] == "storyboard")
    assert storyboard["core_question"] == "질문"
    assert storyboard["cuts"] == [{"cut": 1}]
    assert not any(event["type"] == "error" for event in events)
    assert stream.closed
    client.converse_stream.assert_called_once()
    if fail_preview:
        # 실패한 미리보기에 나머지 토큰을 계속 보내지 않아도 최종 결과는 온다.
        assert sum(event["type"] == "script_chunk" for event in events) == 1
    else:
        preview = "".join(event["text"] for event in events if event["type"] == "script_chunk")
        assert json.loads(preview)["cuts"] == storyboard["cuts"]


@pytest.mark.parametrize(
    ("stop_reason", "expected"),
    [
        ("max_tokens", "출력 길이 제한"),
        ("model_context_window_exceeded", "길이 제한"),
        ("guardrail_intervened", "콘텐츠 정책"),
        ("content_filtered", "콘텐츠 정책"),
        ("malformed_model_output", "정상적으로 완료되지"),
        (None, "중단"),
    ],
)
def test_incomplete_response_is_not_parsed_as_finished_json(monkeypatch, setup_flow, stop_reason, expected):
    client, stream = setup_flow(stop_reason=stop_reason)
    parser = Mock(side_effect=AssertionError("미완성 응답을 JSON 파서에 전달함"))
    monkeypatch.setattr(chat_ws, "extract_json_object", parser)
    events = []
    chat_ws._run_article_flow(lambda event: events.append(event) or True, "원문", model_id="opus-5")

    assert not any(event["type"] == "storyboard" for event in events)
    error = next(event for event in events if event["type"] == "error")
    assert expected in error["message"]
    assert error["scope"] == "script"
    parser.assert_not_called()
    assert stream.closed
    client.converse_stream.assert_called_once()


def test_bedrock_stream_error_closes_stream_and_reports_original_failure(setup_flow):
    _, stream = setup_flow(stream_error=RuntimeError("Bedrock stream interrupted"))
    events = []
    chat_ws._run_article_flow(lambda event: events.append(event) or True, "원문", model_id="opus-5")
    assert stream.closed
    assert not any(event["type"] == "storyboard" for event in events)
    assert any(event.get("message") == "Bedrock stream interrupted" for event in events)


def test_empty_completed_response_has_specific_error(setup_flow):
    _, stream = setup_flow(text="")
    events = []
    chat_ws._run_article_flow(lambda event: events.append(event) or True, "원문", model_id="opus-5")
    assert stream.closed
    assert any("응답이 비어" in event.get("message", "") for event in events)


def test_invalid_json_still_reports_format_error(setup_flow):
    setup_flow(text='{"cuts":[')
    events = []
    chat_ws._run_article_flow(lambda event: events.append(event) or True, "원문", model_id="opus-5")
    assert any("JSON 형식" in event.get("message", "") for event in events)
    assert not any(event["type"] == "storyboard" for event in events)


def test_failed_final_delivery_does_not_announce_success(setup_flow, caplog):
    setup_flow()
    events = []

    def push(event):
        events.append(event)
        return event["type"] != "storyboard"

    chat_ws._run_article_flow(push, "원문", model_id="opus-5")
    assert not any(event["type"] == "options_prompt" for event in events)
    assert any("연결" in event.get("message", "") for event in events if event["type"] == "error")
    assert next(event for event in events if event["type"] == "error")["scope"] == "script"
    assert "ConnectionError" in caplog.text
