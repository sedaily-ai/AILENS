"""PRISM 매일 자동 제작(routes/prism_schedule.py) 판단 로직 — XML·S3·ECS 없이 가짜로 바꿔 끼워 본다."""
from __future__ import annotations

import datetime as dt

import pytest

from routes import prism_batch, prism_schedule

KST = dt.timezone(dt.timedelta(hours=9))
GROUPS = {
    "캠퍼스 뉴스": ("취준생", "SG1"), "신입 직장인 뉴스": ("신입직장인", "SG2"), "스타트업 뉴스": ("스타트업", "SG3"),
    "글로벌 뉴스": ("글로벌", "SG4"), "CEO 뉴스": ("기업", "SG5"), "금융상품 뉴스": ("금융", "SG6"),
    "부동산 뉴스": ("부동산", "SG7"), "주식 뉴스": ("주식", "SG8"),
}


def _result(xml_group: str, **extra) -> dict:
    label, code = GROUPS.get(xml_group, (None, None))
    return {"xml_group": xml_group, "label": label, "type": code, "key": "1", "file_name": f"1105_{label}.txt",
            "recording_date": "2026-11-05", "text": "제목: x", "missing": [], "links": [1] * 6, **extra}


@pytest.fixture
def env(monkeypatch):
    box = {"state": None, "results": [], "started": [], "alerts": [], "puts": [], "writes": []}
    monkeypatch.setattr(prism_schedule, "_read_state", lambda day: box["state"])

    def write_state(day, state):
        box["writes"].append(dict(state))
        box["state"] = state
    monkeypatch.setattr(prism_schedule, "_write_state", write_state)
    monkeypatch.setattr(prism_schedule, "_collect", lambda day: (box["results"], GROUPS))
    monkeypatch.setattr(prism_schedule, "_alert", lambda day, lines, batch_id: box["alerts"].append(lines))

    def start_batch(batch_id, items, *, gap_seconds=0, container_env=None):
        # 시작 직전에 오늘 기록이 이미 닫혀 있어야 한다(다음 5분 호출이 같은 편을 또 켜지 않게).
        assert box["state"] and box["state"]["closed"] is True
        box["started"].append({"batch_id": batch_id, "items": items, "gap": gap_seconds, "env": container_env})
        return []
    monkeypatch.setattr(prism_batch, "start_batch", start_batch)

    class FakeS3:
        def put_object(self, **kw):
            box["puts"].append(kw["Key"])
    monkeypatch.setattr(prism_batch.webtoon_jobs, "s3", lambda: FakeS3())
    monkeypatch.setattr(prism_batch.webtoon_jobs, "bucket", lambda: "bucket")
    monkeypatch.delenv("PRISM_AUTO_TEST_MODE", raising=False)
    return box


def at(hh: int, mm: int = 0) -> dt.datetime:
    return dt.datetime(2026, 11, 5, hh, mm, tzinfo=KST)


def test_too_early(env):
    assert prism_schedule.run(at(8, 55))["result"] == "too_early"
    assert env["writes"] == [] and env["started"] == []


def test_waits_until_all_eight(env):
    env["results"] = [_result(g) for g in list(GROUPS)[:7]]
    assert prism_schedule.run(at(10, 5)) == {"result": "waiting", "found": 7}
    assert env["started"] == [] and env["writes"] == []


def test_starts_all_eight_with_gap(env):
    env["results"] = [_result(g) for g in GROUPS]
    out = prism_schedule.run(at(10, 5))
    assert out["result"] == "started" and out["count"] == 8
    started = env["started"][0]
    assert started["gap"] == 90 and started["env"] is None  # 운영 모드: 유튜브·슬랙 그대로
    assert [i["type"] for i in started["items"]] == [GROUPS[g][1] for g in GROUPS]
    assert [i["input_key"] for i in started["items"]] == env["puts"]
    assert env["alerts"] == []  # 문제 없으면 알림 없음(완료 알림은 영상 쪽이 보낸다)
    # 다음 5분 호출은 아무것도 안 한다
    assert prism_schedule.run(at(10, 10))["result"] == "closed"
    assert len(env["started"]) == 1


def test_deadline_starts_partial_and_alerts(env):
    env["results"] = [_result(g) for g in GROUPS if g != "주식 뉴스"]
    out = prism_schedule.run(at(12, 0))
    assert out["result"] == "started" and out["count"] == 7
    assert "주식 뉴스" in env["alerts"][0][0]
    assert env["state"]["missing_groups"] == ["주식 뉴스"]


def test_holiday_closes_quietly(env):
    assert prism_schedule.run(at(11, 0)) == {"result": "waiting", "found": 0}
    assert prism_schedule.run(at(12, 0))["result"] == "no_prism_today"
    assert env["started"] == [] and env["alerts"] == [] and env["state"]["closed"] is True


def test_notes_for_missing_originals_and_duplicates(env):
    env["results"] = [_result(g) for g in GROUPS]
    env["results"][0]["missing"] = ["20089563"]
    env["results"][1]["duplicates"] = ["20093779"]
    prism_schedule.run(at(10, 5))
    text = " ".join(env["alerts"][0])
    assert "20089563" in text and "하나(1)만" in text
    assert env["started"][0]["items"][0]["type"] == "SG1"  # 원문이 빠져도 만든다


def test_test_mode_turns_off_youtube_and_slack(env, monkeypatch):
    monkeypatch.setenv("PRISM_AUTO_TEST_MODE", "1")
    env["results"] = [_result(g) for g in GROUPS]
    out = prism_schedule.run(at(10, 5))
    names = {e["name"]: e["value"] for e in env["started"][0]["env"]}
    assert out["test_mode"] is True and names["PRISM_NOTIFY_TOPIC_ARN"] == ""
    assert "OFF" in names["PRISM_YOUTUBE_SECRET_ID"]


def test_handler_routes_prism_auto_event(env, monkeypatch):
    import handler
    env["results"] = [_result(g) for g in list(GROUPS)[:3]]
    out = handler.lambda_handler({"_prism_auto": {"now": "2026-11-05T10:05:00+09:00"}}, None)
    assert out == {"result": "waiting", "found": 3}
    # 예외는 삼켜서(비동기 재시도로 두 번 시작하는 일 방지) 결과로 돌려준다
    monkeypatch.setattr(prism_schedule, "_collect", lambda day: (_ for _ in ()).throw(RuntimeError("xml down")))
    out = handler.lambda_handler({"_prism_auto": {"now": "2026-11-05T10:10:00+09:00"}}, None)
    assert out["result"] == "error" and "xml down" in out["error"]


def test_start_batch_spacing(monkeypatch):
    """화면 버튼은 간격 0, 자동은 90초 — 편 사이에만 쉰다."""
    slept, ran = [], []
    monkeypatch.setattr(prism_batch.time, "sleep", lambda s: slept.append(s))
    monkeypatch.setattr(prism_batch, "_run_item", lambda b, item, env=None: ran.append(item["item_id"]))
    monkeypatch.setattr(prism_batch, "_write_json", lambda k, b: None)
    monkeypatch.setattr(prism_batch, "_read_json", lambda k: None)
    items = [{"item_id": f"0{i}", "file_name": f"f{i}", "group": "g", "job_id": f"j{i}"} for i in (1, 2, 3)]
    assert prism_batch.start_batch("b", items, gap_seconds=90) == []
    assert ran == ["01", "02", "03"] and slept == [90, 90]
    slept.clear()
    prism_batch.start_batch("b", items)
    assert slept == []
