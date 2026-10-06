"""chatbot_handler 의 conversation_history 롤 처리 단위 테스트 (AWS 미접속).

프런트가 사주 컨텍스트를 ``conversation_history`` 맨 앞에 ``role: "system"`` 으로 전달한다.
Bedrock Messages API 는 messages 배열의 system 롤을 거부(``ValidationException``)하므로
system 롤은 분리해 system 프롬프트에 합쳐야 하며, 이 계약을 고정한다.

실행: cd service/backend && python3 -m pytest tests/test_chatbot_system_turns.py -v
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

_BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

from services.chat.engine import (  # noqa: E402
    _build_messages,
    _split_system_turns,
)


def test_system_turns_are_separated_not_dropped():
    """system 롤은 messages 에서 빠지지만 내용은 살아 있어야 한다.

    버리면 사주 챗이 컨텍스트 없이 답하게 되므로, "빠졌다"가 아니라
    "옮겨졌다"를 확인한다.
    """
    history = [
        {"role": "system", "content": "사주 컨텍스트 A"},
        {"role": "user", "content": "질문1"},
        {"role": "assistant", "content": "답1"},
        {"role": "system", "content": "추가 지시 B"},
    ]
    system_texts, dialog = _split_system_turns(history)
    assert system_texts == ["사주 컨텍스트 A", "추가 지시 B"]
    assert dialog == [
        {"role": "user", "content": "질문1"},
        {"role": "assistant", "content": "답1"},
    ]


def test_build_messages_never_emits_system_role():
    """Messages API 가 거부하는 롤이 배열에 남으면 500 이 된다."""
    history = [
        {"role": "system", "content": "컨텍스트"},
        {"role": "user", "content": "q"},
    ]
    messages = _build_messages(history, "새 질문")
    assert all(m["role"] in ("user", "assistant") for m in messages), messages
    assert messages[-1] == {"role": "user", "content": "새 질문"}


@pytest.mark.parametrize("bad_role", ["tool", "function", "developer", "SYSTEM_"])
def test_unknown_roles_are_dropped(bad_role):
    """user/assistant/system 외의 롤도 Messages API 가 거부한다."""
    history = [{"role": bad_role, "content": "무엇이든"}, {"role": "user", "content": "q"}]
    system_texts, dialog = _split_system_turns(history)
    assert system_texts == []
    assert dialog == [{"role": "user", "content": "q"}]


def test_system_role_is_case_and_space_insensitive():
    history = [{"role": "  System  ", "content": "컨텍스트"}]
    system_texts, dialog = _split_system_turns(history)
    assert system_texts == ["컨텍스트"]
    assert dialog == []


def test_empty_system_content_is_not_collected():
    """빈 문자열을 system 프롬프트에 이어붙이면 구분선만 늘어난다."""
    history = [{"role": "system", "content": ""}, {"role": "user", "content": "q"}]
    system_texts, dialog = _split_system_turns(history)
    assert system_texts == []
    assert dialog == [{"role": "user", "content": "q"}]


def test_history_without_system_is_unchanged():
    """기존 호출자(MbtiChatBot / BriefingPage)의 동작 보존."""
    history = [
        {"role": "user", "content": "q1"},
        {"role": "assistant", "content": "a1"},
    ]
    system_texts, dialog = _split_system_turns(history)
    assert system_texts == []
    assert dialog == history
    assert _build_messages(history, "q2") == history + [
        {"role": "user", "content": "q2"}
    ]


def test_dialog_window_keeps_last_six_turns():
    """_build_messages 는 대화를 6턴으로 자른다 — system 을 빼고 센다.

    system 항목을 포함해서 세면 사주 챗처럼 system 을 앞에 붙이는 호출자는
    실제 대화 턴을 하나 잃는다.
    """
    history = [{"role": "system", "content": "ctx"}] + [
        {"role": "user" if i % 2 == 0 else "assistant", "content": f"t{i}"}
        for i in range(8)
    ]
    messages = _build_messages(history, "새 질문")
    # 마지막 6 대화턴 + 새 질문
    assert len(messages) == 7
    assert [m["content"] for m in messages[:-1]] == [f"t{i}" for i in range(2, 8)]


def test_none_history_is_tolerated():
    assert _split_system_turns(None) == ([], [])
    assert _build_messages(None, "q") == [{"role": "user", "content": "q"}]
