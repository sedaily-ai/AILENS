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
    return {"xml_group": xml_group, "label": label, "type": code, "key": "1", "file_name": f"1106_{label}.txt",
            "recording_date": "2026-11-06", "text": "제목: x", "missing": [], "links": [1] * 6, **extra}


@pytest.fixture
def env(monkeypatch):
    box = {"state": None, "results": [], "runs": [], "alerts": [], "puts": [], "created": [], "status": {},
           "tasks": {}, "notified": [], "sleeps": [], "fail_run": set()}
    monkeypatch.setattr(prism_schedule, "_read_state", lambda day: box["state"])
    monkeypatch.setattr(prism_schedule, "_write_state", lambda day, state: box.__setitem__("state", state))
    monkeypatch.setattr(prism_schedule, "_collect", lambda day: (box["results"], GROUPS))
    monkeypatch.setattr(prism_schedule, "_alert", lambda day, lines, batch_id=None: box["alerts"].append(lines))
    monkeypatch.setattr(prism_schedule, "_notify_if_batch_done", lambda b: box["notified"].append(b))
    monkeypatch.setattr(prism_schedule, "_describe_task", lambda arn: box["tasks"].get(arn))
    monkeypatch.setattr(prism_schedule.time, "sleep", lambda s: box["sleeps"].append(s))

    def start_item(batch_id, item, container_env=None):
        # 켜기 전에 기록이 started로 저장돼 있어야 한다(끊겨도 같은 편을 또 켜지 않게).
        saved = next(i for i in box["state"]["items"] if i["batch_id"] == batch_id and i["item_id"] == item["item_id"])
        assert saved["state"] == "started"
        box["runs"].append({"item": item, "env": container_env})
        if item["file_name"] in box["fail_run"]:
            box["status"][(batch_id, item["item_id"])] = {"stage": "error", "job_id": item["job_id"]}
            return None
        box["status"][(batch_id, item["item_id"])] = {"stage": "queued", "job_id": item["job_id"]}
        return f"arn:{item['job_id']}"
    monkeypatch.setattr(prism_batch, "start_item", start_item)
    monkeypatch.setattr(prism_batch, "create_batch", lambda b, items, notes=None: box["created"].append((b, items, notes)))

    def read_json(key):
        parts = key.split("/")
        if key.endswith(".status.json"):
            return box["status"].get((parts[-2], parts[-1].split(".")[0]))
        if key.endswith("manifest.json"):
            b, items, notes = next(c for c in box["created"] if c[0] == parts[-2])
            return {"batch_id": b, "items": items}
        return None
    monkeypatch.setattr(prism_batch, "_read_json", read_json)

    def write_json(key, body):
        parts = key.split("/")
        if key.endswith(".status.json"):
            box["status"][(parts[-2], parts[-1].split(".")[0])] = body
    monkeypatch.setattr(prism_batch, "_write_json", write_json)

    class FakeS3:
        def put_object(self, **kw):
            box["puts"].append(kw["Key"])
    monkeypatch.setattr(prism_batch.webtoon_jobs, "s3", lambda: FakeS3())
    monkeypatch.setattr(prism_batch.webtoon_jobs, "bucket", lambda: "bucket")
    monkeypatch.delenv("PRISM_AUTO_TEST_MODE", raising=False)
    return box


def at(hh: int, mm: int = 0, day: int = 6) -> dt.datetime:
    return dt.datetime(2026, 11, day, hh, mm, tzinfo=KST)  # 11/6 금, 11/7 토, 11/8 일


def groups_of(box) -> list[str]:
    return [r["item"]["file_name"] for r in box["runs"]]


def test_too_early(env):
    assert prism_schedule.run(at(8, 55))["result"] == "too_early"
    assert env["state"] is None and env["runs"] == []


def test_waits_until_all_eight_before_noon(env):
    env["results"] = [_result(g) for g in list(GROUPS)[:7]]
    out = prism_schedule.run(at(10, 5))
    assert out["result"] == "waiting" and env["runs"] == [] and env["created"] == []


def test_all_eight_start_three_per_run_with_gap_then_continue(env):
    env["results"] = [_result(g) for g in GROUPS]
    out = prism_schedule.run(at(10, 5))
    assert out["started"] == 3 and out["pending"] == 5 and out["closed"] is True
    assert env["sleeps"] == [90, 90]  # 한 번에 3편, 90초 간격 → 3분에 끝난다
    assert len(env["created"]) == 1 and len(env["puts"]) == 8  # 입력은 8편 다 올려 둔다
    assert env["runs"][0]["env"] is None  # 운영 모드: 유튜브·슬랙 그대로
    prism_schedule.run(at(10, 10))
    assert len(env["runs"]) == 6
    prism_schedule.run(at(10, 15))
    assert len(env["runs"]) == 8
    assert len({r["item"]["item_id"] for r in env["runs"]}) == 8  # 같은 편을 두 번 켜지 않는다
    assert len(env["created"]) == 1  # 묶음은 하나
    assert env["alerts"] == []
    for key in env["status"]:
        env["status"][key] = {"stage": "done"}
    prism_schedule.run(at(10, 20))
    assert prism_schedule.run(at(10, 25))["result"] == "closed"
    assert len(env["runs"]) == 8


def test_lease_blocks_overlap(env):
    env["state"] = {"day": "2026-11-06", "closed": False, "items": [], "lease_until": at(10, 7).isoformat()}
    assert prism_schedule.run(at(10, 5))["result"] == "busy"
    assert prism_schedule.run(at(10, 8))["result"] == "waiting"  # 호출이 죽어도 표시가 지나면 이어 간다


def test_noon_starts_partial_with_note_then_adds_late_groups(env):
    env["results"] = [_result(g) for g in GROUPS if g != "주식 뉴스"]
    assert prism_schedule.run(at(11, 55))["result"] == "waiting"
    out = prism_schedule.run(at(12, 0))
    assert out["closed"] is False and out["started"] == 3
    notes = env["created"][0][2]
    assert "주식 뉴스" in notes[0] and "16시까지" in notes[0]
    assert env["alerts"] == []  # 따로 안 보내고 완료 알림 끝에 붙는다
    prism_schedule.run(at(12, 5))
    prism_schedule.run(at(12, 10))
    assert len(env["runs"]) == 7
    # 14:00에 주식 뉴스가 올라옴 → 묶음을 새로 만들어 그 편만
    env["results"] = [_result(g) for g in GROUPS]
    out = prism_schedule.run(at(14, 0))
    assert len(env["created"]) == 2 and [i["file_name"] for i in env["created"][1][1]] == ["1106_주식.txt"]
    assert out["closed"] is True and groups_of(env)[-1] == "1106_주식.txt"
    assert env["created"][1][2] == []  # 앞 묶음 참고 문구를 되풀이하지 않는다


def test_first_post_after_noon_still_makes_videos(env):
    """10/15처럼 15:35에 처음 올라오는 날 — 예전 규칙은 12시에 쉬는 날로 닫아 영상이 안 나왔다."""
    assert prism_schedule.run(at(12, 0))["result"] == "waiting"
    assert env["state"]["closed"] is False
    env["results"] = [_result(g) for g in GROUPS]
    assert prism_schedule.run(at(15, 35))["started"] == 3


def test_16_closes_and_alerts_missing_groups(env):
    env["results"] = [_result(g) for g in GROUPS if g != "주식 뉴스"]
    prism_schedule.run(at(12, 0))
    out = prism_schedule.run(at(16, 0))
    assert out["closed"] is True
    assert "주식 뉴스" in env["alerts"][0][0] and "오늘 영상이 없어요" in env["alerts"][0][0]


def test_16_zero_weekday_alerts_weekend_quiet(env):
    prism_schedule.run(at(16, 0))  # 11/6 금
    assert env["state"]["closed"] is True and "하나도" in env["alerts"][0][0]
    env["alerts"].clear()
    env["state"] = None
    prism_schedule.run(at(16, 0, day=7))  # 11/7 토
    assert env["state"]["closed"] is True and env["alerts"] == []


def test_failed_to_start_is_retried_once_then_error(env):
    env["results"] = [_result(g) for g in list(GROUPS)[:8]]
    prism_schedule.run(at(10, 5))
    first = env["runs"][0]["item"]
    arn = f"arn:{first['job_id']}"
    env["tasks"][arn] = {"lastStatus": "STOPPED", "stopCode": "TaskFailedToStart", "stoppedReason": "CannotPullContainerError: i/o timeout"}
    for r in env["runs"][1:]:
        env["tasks"][f"arn:{r['item']['job_id']}"] = {"lastStatus": "RUNNING"}
    prism_schedule.run(at(10, 10))
    retried = [r["item"] for r in env["runs"] if r["item"]["item_id"] == first["item_id"]]
    assert len(retried) == 2 and retried[1]["job_id"] != first["job_id"]  # 1번 다시 켬, 새 job_id
    assert env["created"][0][1][0]["job_id"] == retried[1]["job_id"]  # manifest도 새 job_id
    # 두 번째도 시작 실패 → error로 표시, [다시 시도]가 나오고 완료 알림 확인
    env["tasks"][f"arn:{retried[1]['job_id']}"] = {"lastStatus": "STOPPED", "stopCode": "TaskFailedToStart", "stoppedReason": "again"}
    prism_schedule.run(at(10, 15))
    batch_id = env["created"][0][0]
    assert env["status"][(batch_id, first["item_id"])]["stage"] == "error"
    assert "다시 시도" in env["status"][(batch_id, first["item_id"])]["message"]
    assert batch_id in env["notified"]
    assert len([r for r in env["runs"] if r["item"]["item_id"] == first["item_id"]]) == 2  # 더는 안 켠다


def test_task_died_midway_marked_error_no_retry(env):
    """렌더 중 죽은 태스크는 이미 공개했을 수 있어 자동으로 다시 켜지 않는다."""
    env["results"] = [_result(g) for g in GROUPS]
    prism_schedule.run(at(10, 5))
    first = env["runs"][0]["item"]
    env["tasks"][f"arn:{first['job_id']}"] = {"lastStatus": "STOPPED", "stopCode": "EssentialContainerExited", "stoppedReason": "exit 137"}
    for r in env["runs"][1:]:
        env["tasks"][f"arn:{r['item']['job_id']}"] = {"lastStatus": "RUNNING"}
    prism_schedule.run(at(10, 10))
    batch_id = env["created"][0][0]
    assert env["status"][(batch_id, first["item_id"])]["stage"] == "error"
    assert len([r for r in env["runs"] if r["item"]["item_id"] == first["item_id"]]) == 1


def test_runtask_refused_marks_failed_and_continues(env):
    env["results"] = [_result(g) for g in GROUPS]
    env["fail_run"] = {"1106_취준생.txt"}
    out = prism_schedule.run(at(10, 5))
    assert out["started"] == 2 and len(env["runs"]) == 3
    assert env["created"][0][0] in env["notified"]


def test_cut_off_before_arn_recovered(env):
    """켜기 직전에 호출이 끊겨 ARN이 없는 편 — 시간이 지나면 다시 켠다."""
    env["results"] = [_result(g) for g in GROUPS]
    prism_schedule.run(at(10, 5))
    item = env["state"]["items"][0]
    item.pop("task_arn")
    for r in env["runs"][1:]:
        env["tasks"][f"arn:{r['item']['job_id']}"] = {"lastStatus": "RUNNING"}
    prism_schedule.run(at(10, 10))
    assert env["state"]["items"][0]["state"] == "started" and "task_arn" not in env["state"]["items"][0]
    prism_schedule.run(at(10, 16))
    assert len([r for r in env["runs"] if r["item"]["item_id"] == item["item_id"]]) == 2


def test_notes_for_missing_originals_and_duplicates(env):
    env["results"] = [_result(g) for g in GROUPS]
    env["results"][0]["missing"] = ["20089563"]
    env["results"][1]["duplicates"] = ["20093779"]
    prism_schedule.run(at(10, 5))
    text = " ".join(env["created"][0][2])
    assert "20089563" in text and "하나(1)만" in text and "16시까지" not in text
    assert env["alerts"] == []


def test_old_format_state_is_closed(env):
    """11/6 첫 실행이 남긴 옛 형식 기록(items 없음)도 닫힌 것으로 본다."""
    env["state"] = {"day": "2026-11-06", "closed": True, "batch_id": "b", "groups": []}
    assert prism_schedule.run(at(10, 10))["result"] == "closed"


def test_test_mode_turns_off_uploads_and_slack(env, monkeypatch):
    monkeypatch.setenv("PRISM_AUTO_TEST_MODE", "1")
    env["results"] = [_result(g) for g in GROUPS]
    out = prism_schedule.run(at(10, 5))
    names = {e["name"]: e["value"] for e in env["runs"][0]["env"]}
    assert out["test_mode"] is True and names["PRISM_NOTIFY_TOPIC_ARN"] == ""
    assert "OFF" in names["PRISM_YOUTUBE_SECRET_ID"] and "OFF" in names["PRISM_DAILYMOTION_SECRET_ID"]


def test_handler_routes_prism_auto_event(env, monkeypatch):
    import handler
    env["results"] = [_result(g) for g in list(GROUPS)[:3]]
    out = handler.lambda_handler({"_prism_auto": {"now": "2026-11-06T10:05:00+09:00"}}, None)
    assert out["result"] == "waiting"
    # 예외는 삼켜서(비동기 재시도 방지) 결과로 돌려준다
    monkeypatch.setattr(prism_schedule, "_collect", lambda day: (_ for _ in ()).throw(RuntimeError("xml down")))
    out = handler.lambda_handler({"_prism_auto": {"now": "2026-11-06T10:10:00+09:00"}}, None)
    assert out["result"] == "error" and "xml down" in out["error"]
    assert "lease_until" not in env["state"]  # 실패해도 표시를 남기지 않는다


def test_start_batch_spacing_for_button(monkeypatch):
    """화면 버튼은 지금처럼 한 번에(간격 0), 편 사이에만 쉰다."""
    slept, ran = [], []
    monkeypatch.setattr(prism_batch.time, "sleep", lambda s: slept.append(s))
    monkeypatch.setattr(prism_batch, "_run_item", lambda b, item, env=None: ran.append(item["item_id"]) or "arn")
    monkeypatch.setattr(prism_batch, "_write_json", lambda k, b: None)
    monkeypatch.setattr(prism_batch, "_read_json", lambda k: None)
    items = [{"item_id": f"0{i}", "file_name": f"f{i}", "group": "g", "job_id": f"j{i}"} for i in (1, 2, 3)]
    assert prism_batch.start_batch("b", items, gap_seconds=90) == []
    assert ran == ["01", "02", "03"] and slept == [90, 90]
    slept.clear()
    prism_batch.start_batch("b", items)
    assert slept == []


def test_run_item_raises_on_failures_list(monkeypatch):
    """RunTask는 못 켜도 예외 없이 failures로 돌려준다 — 그대로 두면 "대기 중"으로 남는다."""
    class Ecs:
        def run_task(self, **kw):
            return {"tasks": [], "failures": [{"reason": "RESOURCE:ENI"}]}
    monkeypatch.setattr(prism_batch, "_ecs", lambda: Ecs())
    writes = []
    monkeypatch.setattr(prism_batch, "_write_json", lambda k, b: writes.append(b))
    item = {"item_id": "01", "file_name": "f", "type": "SG1", "recording_date": "2026-11-06", "input_key": "k", "job_id": "j"}
    assert prism_batch.start_item("b", item) is None
    assert writes[-1]["stage"] == "error" and "RESOURCE:ENI" in writes[-1]["message"]
