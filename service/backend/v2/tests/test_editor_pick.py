"""Unit tests for v2.core25.editor_pick_service.

Mocks Bedrock invoke + pgvector source. No real AWS calls.

Run:
  cd backend && python3 -m pytest v2/tests/test_editor_pick.py -v
"""
from __future__ import annotations

import io
import json
import sys
from pathlib import Path
from typing import Any, Dict, List
from unittest.mock import MagicMock

import pytest

# Make backend/ importable for `from v2.core25...`
_BACKEND_DIR = Path(__file__).resolve().parents[2]
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

from v2.core25.editor_pick_service import (  # noqa: E402
    DEFAULT_CANDIDATE_POOL_SIZE,
    EditorPickError,
    _EDITOR_ID_BY_GROUP,
    invoke_letter_orchestrator,
    parse_orchestrator_output,
    run_editor_pick,
    shape_candidate_for_orchestrator,
)


# ── helpers ───────────────────────────────────────────────────────────────────


def _valid_letter(group: str, article_id: str = "art-1") -> Dict[str, Any]:
    """v1 format letter 한 편 — 2026-05-15 `067fcbd` 에서 채택한 4-기사 클러스터.

    ``parse_orchestrator_output`` 의 실제 계약:

    * letter 필수 필드 — ``editor_id`` ``mbti_group`` ``thumbnail_title``
      ``thumbnail_subtitle`` ``articles`` ``archetype`` ``theme``
    * ``articles`` 는 **정확히 4개**. 앞 2개(``j < 2``)는 ``qa``(3개) +
      ``insight``, 뒤 2개는 ``insight_lines``(3개).
    * ``summary`` 는 4개 전부 길이 3 리스트.
    * 4개 ``article_id`` 는 한 letter 안에서 서로 달라야 한다.

    이전 fixture 는 채택 전 포맷(``headline``/``body``/``key_points``)을
    만들고 있어 필드 몇 개가 아니라 스키마 자체가 달랐다.
    """

    def _art(n: int, *, full: bool) -> Dict[str, Any]:
        art: Dict[str, Any] = {
            "article_id": f"{article_id}-{n}",
            "original_title": f"원제목 {n}",
            "thumbnail_title": f"썸네일 {n}",
            "summary": [f"요약 {n}-1", f"요약 {n}-2", f"요약 {n}-3"],
        }
        if full:
            art["qa"] = [{"q": f"질문{k}", "a": f"답변{k}"} for k in (1, 2, 3)]
            art["insight"] = f"인사이트 {n}"
        else:
            art["insight_lines"] = [f"줄 {n}-1", f"줄 {n}-2", f"줄 {n}-3"]
        return art

    return {
        "editor_id": _EDITOR_ID_BY_GROUP[group],
        "mbti_group": group,
        "thumbnail_title": f"{group} 대표 제목",
        "thumbnail_subtitle": f"{group} 대표 부제",
        "archetype": f"이번 주의 {group}",
        "theme": "테마",
        "articles": [
            _art(1, full=True),
            _art(2, full=True),
            _art(3, full=False),
            _art(4, full=False),
        ],
    }


def _make_orchestrator_payload(mode: str = "A") -> Dict[str, Any]:
    if mode == "A":
        return {
            "mode": "A",
            "letters": [
                _valid_letter("NT", "art-nt"),
                _valid_letter("NF", "art-nf"),
                _valid_letter("ST", "art-st"),
                _valid_letter("SF", "art-sf"),
            ],
        }
    return {
        "mode": "C",
        "letters": [
            _valid_letter("NT", "art-shared"),
            _valid_letter("NF", "art-shared"),
            _valid_letter("ST", "art-shared"),
            _valid_letter("SF", "art-shared"),
        ],
    }


def _bedrock_mock_with(text_payload: str, usage: Dict[str, int] | None = None) -> MagicMock:
    """boto3 bedrock-runtime mock returning a Bedrock invoke_model response.

    ``invoke_model`` 은 호출마다 **새 스트림**을 만든다 — ``return_value`` 에
    ``BytesIO`` 하나를 고정하면 안 된다. ``invoke_letter_orchestrator`` 는
    파싱 실패 시 ``_MAX_INVOKE_RETRIES`` 회까지 재호출하고 매 시도마다
    ``response["body"].read()`` 를 부르는데, 스트림이 공유되면 2회차부터
    ``b""`` 를 읽어 ``json.loads`` 가 ``JSONDecodeError`` 를 던진다. 그 예외는
    ``except EditorPickError`` 에 안 걸려 그대로 튀어나오므로, 재시도 경로를
    타는 테스트가 실제 실패 원인이 아닌 목 결함으로 죽는다. 실제 boto3 는
    호출마다 새 ``StreamingBody`` 를 주므로 여기서도 그렇게 맞춘다.
    """
    mock = MagicMock()
    response_body = json.dumps({
        "content": [{"type": "text", "text": text_payload}],
        "usage": usage or {
            "input_tokens": 1000,
            "output_tokens": 500,
            "cache_read_input_tokens": 0,
            "cache_creation_input_tokens": 0,
        },
    }).encode("utf-8")
    mock.invoke_model.side_effect = lambda **kwargs: {
        "body": io.BytesIO(response_body),
    }
    return mock


# ── parse_orchestrator_output ─────────────────────────────────────────────────


def test_parse_orchestrator_output_mode_a_ok():
    payload = _make_orchestrator_payload("A")
    parsed = parse_orchestrator_output(json.dumps(payload, ensure_ascii=False))
    assert parsed["mode"] == "A"
    assert len(parsed["letters"]) == 4
    assert {l["mbti_group"] for l in parsed["letters"]} == {"NT", "NF", "ST", "SF"}


def test_parse_rejects_mode_c():
    """v1 format 채택(2026-05-15) 이후 mode 는 'A' 만 유효하다.

    이전에는 mode C(4 페르소나가 같은 기사를 공유)를 허용했고 이 자리에
    ``test_parse_orchestrator_output_mode_c_ok`` 가 있었다. 지금 프로덕션은
    A 가 아니면 파싱 단계에서 거부하므로, 그 거부 자체를 고정한다.
    """
    payload = _make_orchestrator_payload("C")
    with pytest.raises(EditorPickError, match="v1 format requires 'A'"):
        parse_orchestrator_output(json.dumps(payload, ensure_ascii=False))


def test_parse_strips_code_fence():
    payload = _make_orchestrator_payload("A")
    raw = "```json\n" + json.dumps(payload, ensure_ascii=False) + "\n```"
    parsed = parse_orchestrator_output(raw)
    assert parsed["mode"] == "A"


def test_parse_rejects_invalid_json():
    with pytest.raises(EditorPickError, match="not valid JSON"):
        parse_orchestrator_output("this is not json")


def test_parse_rejects_wrong_letter_count():
    payload = _make_orchestrator_payload("A")
    payload["letters"] = payload["letters"][:3]
    with pytest.raises(EditorPickError, match="expected 4 letters"):
        parse_orchestrator_output(json.dumps(payload, ensure_ascii=False))


def test_parse_rejects_duplicate_mbti_groups():
    payload = _make_orchestrator_payload("A")
    payload["letters"][1]["mbti_group"] = "NT"  # NT duplicated
    payload["letters"][1]["editor_id"] = _EDITOR_ID_BY_GROUP["NT"]
    with pytest.raises(EditorPickError, match="mbti_groups"):
        parse_orchestrator_output(json.dumps(payload, ensure_ascii=False))


def test_parse_rejects_duplicate_article_ids_within_letter():
    """한 letter 안 4개 article_id 는 서로 달라야 한다.

    v1 format 이전에는 letter 마다 ``article_id`` 하나였고 **letter 간**
    중복을 검사했다(mode A 는 서로 달라야, mode C 는 같아야). 지금은 기사가
    letter 안 ``articles[]`` 로 들어가면서 검사도 **letter 안** 중복으로
    바뀌었다 — 교차-letter 검사는 더 이상 없다.
    """
    payload = _make_orchestrator_payload("A")
    arts = payload["letters"][0]["articles"]
    arts[1]["article_id"] = arts[0]["article_id"]
    with pytest.raises(EditorPickError, match="duplicate article_ids"):
        parse_orchestrator_output(json.dumps(payload, ensure_ascii=False))


def test_parse_rejects_articles_not_length_4():
    payload = _make_orchestrator_payload("A")
    payload["letters"][0]["articles"] = payload["letters"][0]["articles"][:3]
    with pytest.raises(EditorPickError, match="articles must be length 4"):
        parse_orchestrator_output(json.dumps(payload, ensure_ascii=False))


def test_parse_rejects_short_article_missing_insight_lines():
    """3-4번 기사는 qa 가 아니라 insight_lines 를 갖는다 — 배분이 뒤바뀌면 잡는다."""
    payload = _make_orchestrator_payload("A")
    del payload["letters"][0]["articles"][2]["insight_lines"]
    with pytest.raises(EditorPickError, match="insight_lines"):
        parse_orchestrator_output(json.dumps(payload, ensure_ascii=False))


@pytest.mark.parametrize(
    "art_index,field",
    [
        (0, "summary"),        # 1-2번 그룹의 summary
        (2, "summary"),        # 3-4번 그룹도 같은 규칙
        (0, "qa"),             # 1-2번만 가짐
        (2, "insight_lines"),  # 3-4번만 가짐
    ],
)
def test_parse_rejects_wrong_length_article_field(art_index, field):
    """길이 3 규칙은 프론트 렌더가 의존하는 계약이라 강제돼야 한다.

    필드 **존재** 검사와 **길이** 검사는 프로덕션에서 별개 분기다. 존재만
    확인하는 테스트를 두면 길이 검사를 통째로 지워도 스위트가 녹색이다
    (실제로 그랬다 — 변이 검증에서 확인). 3개가 아닌 값을 넣어 각 분기를
    직접 친다.
    """
    payload = _make_orchestrator_payload("A")
    art = payload["letters"][0]["articles"][art_index]
    art[field] = art[field][:2]  # 3 → 2
    with pytest.raises(EditorPickError, match=f"{field} must be length 3"):
        parse_orchestrator_output(json.dumps(payload, ensure_ascii=False))


def test_parse_overrides_wrong_editor_id():
    """orchestrator 가 editor_id 잘못 박아도 그룹 기준으로 정정."""
    payload = _make_orchestrator_payload("A")
    payload["letters"][0]["editor_id"] = "wrong"
    parsed = parse_orchestrator_output(json.dumps(payload, ensure_ascii=False))
    assert parsed["letters"][0]["editor_id"] == "NT-min"


# ── shape_candidate ───────────────────────────────────────────────────────────


def test_shape_candidate_trims_snippet():
    row = {
        "article_id": "a1",
        "title": "타이틀",
        "category": "경제",
        "themes": ["통화"],
        "press": "서울경제",
        "byline": "기자",
        "snippet": "X" * 1000,
        "transformed_versions": {"NT": "Y" * 2000, "NF": "Z" * 100},
    }
    shaped = shape_candidate_for_orchestrator(row)
    assert shaped["snippet"].endswith("…")
    assert len(shaped["snippet"]) <= 500
    # NT body 트림 (SNIPPET_CHARS * 2 = 800)
    assert len(shaped["transformed_versions"]["NT"]) <= 800
    # NF 짧으면 그대로
    assert shaped["transformed_versions"]["NF"] == "Z" * 100


# ── invoke_letter_orchestrator ────────────────────────────────────────────────


def test_invoke_letter_orchestrator_happy_path():
    payload = _make_orchestrator_payload("A")
    bedrock = _bedrock_mock_with(json.dumps(payload, ensure_ascii=False))

    result = invoke_letter_orchestrator(
        candidates=[{"article_id": "a1", "title": "t", "snippet": "s"}],
        letter_date="2026-05-14",
        bedrock_client=bedrock,
    )

    assert result["mode"] == "A"
    assert len(result["letters"]) == 4
    assert "_usage" in result
    assert result["_usage"]["input_tokens"] == 1000

    # cache_control 박혔는지 확인
    invoke_args = bedrock.invoke_model.call_args
    body = json.loads(invoke_args.kwargs["body"])
    assert body["system"][0]["cache_control"] == {"type": "ephemeral"}


def test_invoke_letter_orchestrator_invalid_response():
    bedrock = _bedrock_mock_with("이상한 출력 — 코드펜스 없고 JSON 아님")
    with pytest.raises(EditorPickError):
        invoke_letter_orchestrator(
            candidates=[],
            letter_date="2026-05-14",
            bedrock_client=bedrock,
        )


# ── run_editor_pick (end-to-end with mocks) ───────────────────────────────────


class _FakeSource:
    def __init__(self, rows: List[Dict[str, Any]]):
        self.rows = rows
        self.calls: List[Dict[str, Any]] = []

    def get_editor_pick_candidates(self, letter_date, limit=20):
        self.calls.append({"letter_date": letter_date, "limit": limit})
        return self.rows


class _FakeSink:
    def __init__(self):
        self.inserted: List[Dict[str, Any]] = []

    def insert_daily_letter(self, letter):
        self.inserted.append(letter)


def test_run_editor_pick_end_to_end():
    payload = _make_orchestrator_payload("A")
    bedrock = _bedrock_mock_with(json.dumps(payload, ensure_ascii=False))
    source = _FakeSource(rows=[{
        "article_id": "art-nt",
        "title": "T1",
        "category": "경제",
        "themes": ["거시"],
        "press": "서울경제",
        "byline": "기자",
        "snippet": "본문 발췌",
        "transformed_versions": {"NT": "NT 본문", "NF": "NF", "ST": "ST", "SF": "SF"},
    }])
    sink = _FakeSink()

    result = run_editor_pick(
        source=source,
        sink=sink,
        letter_date="2026-05-14",
        bedrock_client=bedrock,
    )

    assert result["letters_inserted"] == 4
    assert result["mode"] == "A"
    assert len(sink.inserted) == 4
    assert {r["editor_id"] for r in sink.inserted} == {
        "NT-min", "NF-ha", "ST-jun", "SF-soy",
    }
    # source 호출 1회 — 후보 풀 크기는 모듈 기본값이 그대로 흘러가야 한다.
    # 숫자를 다시 박으면 튜닝 값이 바뀔 때마다 또 어긋난다 (20 → 24 로 바뀐
    # 067fcbd 에서 실제로 그렇게 깨졌다). 검증 대상은 값이 아니라 배선이다.
    assert source.calls == [
        {"letter_date": "2026-05-14", "limit": DEFAULT_CANDIDATE_POOL_SIZE}
    ]


def test_run_editor_pick_empty_pool():
    payload = _make_orchestrator_payload("A")
    bedrock = _bedrock_mock_with(json.dumps(payload, ensure_ascii=False))
    source = _FakeSource(rows=[])
    sink = _FakeSink()

    result = run_editor_pick(
        source=source,
        sink=sink,
        letter_date="2026-05-14",
        bedrock_client=bedrock,
    )

    assert result["letters_inserted"] == 0
    assert result["mode"] is None
    assert sink.inserted == []
    # 빈 풀이면 Bedrock 호출 X
    bedrock.invoke_model.assert_not_called()


def test_run_editor_pick_waiting_fresh_paper():
    """require_paper_date 와 풀의 지면일이 다르면 Bedrock 없이 waiting."""
    payload = _make_orchestrator_payload("A")
    bedrock = _bedrock_mock_with(json.dumps(payload, ensure_ascii=False))
    source = _FakeSource(rows=[{
        "article_id": "art-old",
        "title": "어제 지면 기사",
        "category": "경제",
        "themes": [],
        "press": "서울경제",
        "byline": "기자",
        "snippet": "발췌",
        "transformed_versions": {},
        "paper_date": "20260802",  # 어제 지면으로 fallback 된 풀
    }])
    sink = _FakeSink()

    result = run_editor_pick(
        source=source,
        sink=sink,
        letter_date="2026-08-03",
        bedrock_client=bedrock,
        require_paper_date="20260803",
    )

    assert result.get("status") == "waiting_fresh_paper"
    assert result["letters_inserted"] == 0
    assert sink.inserted == []
    bedrock.invoke_model.assert_not_called()


def test_run_editor_pick_fresh_paper_passes_guard():
    """require_paper_date 와 풀 지면일이 일치하면 정상 생성 경로 진입."""
    payload = _make_orchestrator_payload("A")
    bedrock = _bedrock_mock_with(json.dumps(payload, ensure_ascii=False))
    source = _FakeSource(rows=[{
        "article_id": "art-nt",
        "title": "오늘 1면",
        "category": "경제",
        "themes": [],
        "press": "서울경제",
        "byline": "기자",
        "snippet": "발췌",
        "transformed_versions": {},
        "paper_date": "20260803",
    }])
    sink = _FakeSink()

    result = run_editor_pick(
        source=source,
        sink=sink,
        letter_date="2026-08-03",
        bedrock_client=bedrock,
        require_paper_date="20260803",
    )

    assert result.get("status") != "waiting_fresh_paper"
    bedrock.invoke_model.assert_called()


def test_run_editor_pick_guard_ignores_pool_without_paper_date():
    """paper_date 없는 풀(구 selector 경로 데이터)은 가드를 통과한다 — 회귀 방지."""
    payload = _make_orchestrator_payload("A")
    bedrock = _bedrock_mock_with(json.dumps(payload, ensure_ascii=False))
    source = _FakeSource(rows=[{
        "article_id": "art-x",
        "title": "지면 메타 없는 기사",
        "category": "경제",
        "themes": [],
        "press": "서울경제",
        "byline": "기자",
        "snippet": "발췌",
        "transformed_versions": {},
    }])
    sink = _FakeSink()

    result = run_editor_pick(
        source=source,
        sink=sink,
        letter_date="2026-08-03",
        bedrock_client=bedrock,
        require_paper_date="20260803",
    )

    assert result.get("status") != "waiting_fresh_paper"
    bedrock.invoke_model.assert_called()
