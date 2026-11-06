"""PRISM 매일 자동 제작(2026-11-05, 11-06 개정) — EventBridge가 9:00~16:55(KST) 5분마다 이 Lambda를 {"_prism_auto": {}}로 깨운다.

사용자 요청: 마케팅팀이 기사 txt를 손으로 만들어 [PRISM 제작] 화면에 올리던 일을 없애고, DB(서울경제 일일 기사 XML)에서
읽어 영상까지 자동으로. txt는 pipelines/video/prism_auto.py가 만들고(그날의 "■AI 프리즘 [OO 뉴스]" 기사 → 링크된 원문),
묶음은 화면의 [제작 시작]과 같은 routes/prism_batch를 쓴다 — 화면의 "지난 제작"에 그대로 뜬다.

판단(사용자 결정):
- 프리즘 기사 8개(그룹 8개)가 다 올라오면 바로 시작한다. 보통 10:00 게재, XML은 5분마다 갱신된다.
- 12:00까지 다 안 모이면 모인 것부터 만든다. 16:00까지 늦게 올라온 그룹은 묶음을 새로 만들어 추가로 만든다
  (8/22~11/5 프리즘 있는 61일 중 첫 기사가 12시를 넘긴 날이 5일, 가장 늦은 시작 15:35).
- 16:00에도 하나도 없으면 평일만 슬랙으로 알린다(주말은 쉬는 날이 잦아 알리지 않는다). 그때도 없는 그룹은 슬랙으로 알린다.
- 유튜브 바로 공개. 시험할 땐 Lambda 환경변수 PRISM_AUTO_TEST_MODE=1 — 유튜브 업로드·슬랙 알림을 끈다.

한 번 깨어날 때 하는 일(나눠서 하는 이유: 8편을 한 호출에서 90초 간격으로 켜면 10분 넘게 걸려 15분 제한에 가깝고,
중간에 끊기면 남은 편이 영영 안 켜진다):
1) 켜 둔 편 점검 — 태스크가 시작 실패로 끝났으면 1번 다시 켠다(11/6 글로벌 편이 이미지 받기 시간 초과로 "대기 중"에
   멈췄고 완료 알림도 안 왔다). 그래도 안 되거나 도중에 죽었으면 상태를 error로 써서 [다시 시도]가 나오게 하고,
   묶음이 다 끝났으면 완료 알림을 보낸다(prism_notify가 "한 번만" 보장).
2) 아직 안 닫혔으면 XML을 보고 새로 만들 편을 묶음으로 만든다(이 시점엔 기록에 pending으로만 적는다).
3) pending을 최대 3편 켠다(90초 간격, 3분). 나머지는 5분 뒤 호출이 잇는다.
기록은 media/prism-auto/{YYYYMMDD}.json 한 곳. 켜기 "전에" started로 적어 같은 편을 두 번 켜지 않는다.
lease_until은 호출이 겹칠 때 뒤 호출이 비켜 가게 하는 표시다.

끄기: EventBridge 규칙을 disable하면 된다. 수동 [PRISM 제작] 화면은 그대로 쓸 수 있다.
"""
from __future__ import annotations

import datetime as dt
import json
import logging
import os
import time
import urllib.error
import urllib.request
import uuid

import boto3

from routes import prism_batch

logger = logging.getLogger(__name__)

_KST = dt.timezone(dt.timedelta(hours=9))
_START = dt.time(9, 0)
_FIRST_DEADLINE = dt.time(12, 0)  # 여기까지 다 안 모이면 모인 것부터 만든다
_LAST_DEADLINE = dt.time(16, 0)   # 여기까지 늦게 올라온 그룹은 추가로 만든다
_GAP_SECONDS = 90
_MAX_STARTS_PER_RUN = 3  # 90초 간격 × 2 = 3분, 다음 호출(5분 뒤) 전에 끝난다
_LEASE_SECONDS = 270
_MAX_ATTEMPTS = 2        # 시작 실패 시 자동 재시도 포함 횟수
_STUCK_NO_ARN_SECONDS = 600  # 켜기 직전에 호출이 끊겨 ARN이 없는 편을 실패로 보는 시간
_STATE_PREFIX = "media/prism-auto"
_TIMEOUT_SECONDS = 10
_FINAL_STAGES = ("done", "error")
# 완료 알림(pipelines/video/prism_notify.py)과 같은 토픽 → Amazon Q Developer → 슬랙.
_TOPIC_ARN = os.environ.get("PRISM_NOTIFY_TOPIC_ARN", "arn:aws:sns:us-east-1:887078546492:prism-batch-notify")
_CMS_URL = os.environ.get("PRISM_CMS_URL", "https://lensdb.sedaily.ai")
# 시험 모드에서 video-lab 태스크에 덮어쓸 환경변수 — 없는 시크릿 이름이면 업로드를 건너뛰고,
# 토픽이 비면 prism_notify가 완료 알림을 건너뛴다.
_TEST_CONTAINER_ENV = [
    {"name": "PRISM_YOUTUBE_SECRET_ID", "value": "ai-labs/prism-youtube-OFF-auto-test"},
    {"name": "PRISM_DAILYMOTION_SECRET_ID", "value": "ai-labs/prism-dailymotion-OFF-auto-test"},
    {"name": "PRISM_NOTIFY_TOPIC_ARN", "value": ""},
]


def _test_mode() -> bool:
    return os.environ.get("PRISM_AUTO_TEST_MODE") == "1"


def _container_env() -> list[dict] | None:
    return _TEST_CONTAINER_ENV if _test_mode() else None


def _state_key(day: dt.date) -> str:
    return f"{_STATE_PREFIX}/{day:%Y%m%d}.json"


def _read_state(day: dt.date) -> dict | None:
    """오늘 기록. 없으면 None. 읽기 자체가 실패하면(네트워크 등) 예외 — "없음"으로 잘못 보고 두 번 시작하지 않게
    이번 호출을 멈추고 5분 뒤 다시 본다. admin Lambda는 이 버킷 GetObject 권한이 없어 공개 URL로 읽는다(prism_batch와 같다)."""
    url = f"{prism_batch._public_base()}/{_state_key(day)}"
    try:
        with urllib.request.urlopen(urllib.request.Request(url, method="GET"), timeout=_TIMEOUT_SECONDS) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code in (403, 404):  # 없는 객체 — 목록 권한이 없으면 S3는 403을 준다
            return None
        raise


def _write_state(day: dt.date, state: dict) -> None:
    prism_batch._write_json(_state_key(day), state)


def _alert(day: dt.date, lines: list[str], batch_id: str | None = None) -> None:
    """묶음 완료 알림에 붙일 수 없는 경우(하루 끝, 하나도 못 만든 날)만 따로 보낸다. 실패해도 제작은 계속한다."""
    if batch_id:
        lines = [*lines, f"<{_CMS_URL}/prism-batch?batch={batch_id}|CMS에서 보기>"]
    logger.info("PRISM 자동 제작 알림: %s", " / ".join(lines))
    if _test_mode() or not _TOPIC_ARN:
        return
    msg = {"version": "1.0", "source": "custom", "content": {
        "textType": "client-markdown",
        "title": f"📌 AI PRISM 자동 제작 참고 ({day.month}/{day.day})",
        "description": "\n".join(lines),
    }}
    try:
        boto3.client("sns", region_name=_TOPIC_ARN.split(":")[3]).publish(
            TopicArn=_TOPIC_ARN, Message=json.dumps(msg, ensure_ascii=False))
    except Exception:  # noqa: BLE001
        logger.exception("PRISM 자동 제작 슬랙 알림 실패(무시)")


def _collect(day: dt.date) -> tuple[list[dict], dict]:
    import prism_auto  # deploy-admin-api.sh가 zip 루트에 복사한다. 자동 제작 호출에서만 불러 CMS API 나머지에 영향이 없게 한다.
    return prism_auto.collect(day), prism_auto.XML_GROUPS


def _notify_if_batch_done(batch_id: str) -> None:
    """태스크가 못 보낸 완료 알림을 대신 보낸다. 시험 모드면 보내지 않는다. 실패해도 다음 호출이 다시 본다."""
    if _test_mode():
        return
    try:
        import prism_notify  # deploy-admin-api.sh가 config.py와 함께 zip 루트에 복사한다
        prism_notify.notify_if_batch_done(prism_batch.webtoon_jobs.s3(), batch_id)
    except Exception:  # noqa: BLE001
        logger.exception(f"PRISM 완료 알림 실패(다음 호출에서 다시 봄, {batch_id})")


def _describe_task(arn: str) -> dict | None:
    """태스크 정보. ECS는 끝난 태스크를 1시간쯤만 보여 준다 — 없으면 None."""
    res = prism_batch._ecs().describe_tasks(cluster=prism_batch._VIDEO_LAB_CLUSTER, tasks=[arn])
    return (res.get("tasks") or [None])[0]


def _status_key(item: dict) -> str:
    return f"{prism_batch._PREFIX}/{item['batch_id']}/{item['item_id']}.status.json"


def _manifest_item(item: dict) -> dict:
    return {k: item[k] for k in ("item_id", "file_name", "type", "group", "recording_date", "input_key", "job_id")}


def _fail_item(item: dict, message: str) -> None:
    prism_batch._write_json(_status_key(item), {"stage": "error", "job_id": item["job_id"], "message": message[:500]})
    item["state"] = "failed"


def _requeue(item: dict) -> None:
    """다시 켤 수 있게 pending으로. 영상 결과가 이전 시도와 섞이지 않게 job_id를 새로 만든다(화면 [다시 시도]와 같다)."""
    batch_id = item["batch_id"]
    item["job_id"] = f"prism-{batch_id}-{item['item_id']}-r{uuid.uuid4().hex[:4]}"
    item["state"] = "pending"
    item.pop("task_arn", None)
    manifest = prism_batch._read_json(f"{prism_batch._PREFIX}/{batch_id}/manifest.json")
    if manifest:
        for row in manifest.get("items", []):
            if row.get("item_id") == item["item_id"]:
                row["job_id"] = item["job_id"]
        prism_batch._write_json(f"{prism_batch._PREFIX}/{batch_id}/manifest.json", manifest)


def _check_started(state: dict, now: dt.datetime) -> set[str]:
    """켜 둔 편 점검 → 완료 알림을 확인할 묶음들."""
    batches: set[str] = set()
    for item in state.get("items", []):
        if item.get("state") != "started":
            continue
        status = prism_batch._read_json(_status_key(item)) or {}
        if status.get("stage") in _FINAL_STAGES:
            item["state"] = "finished"
            batches.add(item["batch_id"])
            continue
        arn = item.get("task_arn")
        if not arn:
            # 켜기 직전에 호출이 끊긴 경우. 시간을 넉넉히 두고 시작 실패로 본다.
            age = (now - dt.datetime.fromisoformat(item["started_at"])).total_seconds()
            if age < _STUCK_NO_ARN_SECONDS:
                continue
            stop_code, reason = "TaskFailedToStart", "호출이 끊겨 시작되지 않음"
        else:
            task = _describe_task(arn)
            if task is not None and task.get("lastStatus") != "STOPPED":
                continue  # 아직 도는 중
            if task is None:
                stop_code, reason = "", "태스크 기록이 사라짐"
            else:
                stop_code, reason = task.get("stopCode") or "", task.get("stoppedReason") or ""
        if stop_code == "TaskFailedToStart" and item.get("attempts", 1) < _MAX_ATTEMPTS:
            logger.warning(f"PRISM 시작 실패 — 다시 켬({item['file_name']}): {reason[:200]}")
            _requeue(item)
        else:
            # 태스크가 죽으면서 상태를 못 쓴 경우 포함. 화면에 [다시 시도]가 나오게 한다.
            msg = "작업을 시작하지 못했습니다" if stop_code == "TaskFailedToStart" else "작업이 도중에 멈췄습니다"
            _fail_item(item, f"{msg} — [다시 시도]를 눌러 주세요 ({reason})"[:500])
            batches.add(item["batch_id"])
    return batches


def _notes_for(results: list[dict], missing_groups: list[str], last: bool) -> list[str]:
    """완료 알림 끝 "📌 참고"에 붙일 문장."""
    notes: list[str] = []
    if missing_groups and not last:
        notes.append(f"아직 안 올라온 그룹: {', '.join(missing_groups)} — 16시까지 올라오면 추가로 만들어요")
    for r in results:
        if not r["type"]:
            notes.append(f"알 수 없는 그룹 이름 '{r['xml_group']}' — 만들지 않았어요(코드 표에 추가 필요)")
        if r["missing"]:
            notes.append(f"{r['xml_group']}: 원문 {len(r['missing'])}건을 XML에서 못 찾아 빼고 만들었어요({', '.join(r['missing'])})")
        if r.get("duplicates"):
            notes.append(f"{r['xml_group']}: 프리즘 기사가 {1 + len(r['duplicates'])}개라 하나({r['key']})만 만들었어요")
    return notes


def _make_batch(state: dict, todo: list[dict], notes: list[str]) -> str:
    """새 묶음을 만들고 기록에 pending으로 적는다. 켜는 건 _start_pending."""
    batch_id = prism_batch.new_batch_id()
    bucket, s3 = prism_batch.webtoon_jobs.bucket(), prism_batch.webtoon_jobs.s3()
    rows = []
    for n, r in enumerate(todo, start=1):
        item_id = f"{n:02d}"
        rows.append({
            "item_id": item_id, "file_name": r["file_name"], "type": r["type"],
            "group": prism_batch.GROUPS[r["type"]], "recording_date": r["recording_date"],
            "input_key": prism_batch.input_key(batch_id, n), "job_id": f"prism-{batch_id}-{item_id}",
        })
        s3.put_object(Bucket=bucket, Key=rows[-1]["input_key"], Body=r["text"].encode("utf-8"),
                      ContentType="text/plain; charset=utf-8")
    prism_batch.create_batch(batch_id, rows, notes)
    state.setdefault("batches", []).append(batch_id)
    for row, r in zip(rows, todo):
        state.setdefault("items", []).append({
            **row, "batch_id": batch_id, "xml_group": r["xml_group"], "state": "pending", "attempts": 0,
        })
    return batch_id


def _start_pending(day: dt.date, state: dict, now: dt.datetime) -> tuple[int, set[str]]:
    """pending을 최대 3편 켠다. 켜기 전에 기록해 같은 편을 두 번 켜지 않는다."""
    pending = [i for i in state.get("items", []) if i.get("state") == "pending"][:_MAX_STARTS_PER_RUN]
    started, batches = 0, set()
    for n, item in enumerate(pending):
        if n:
            time.sleep(_GAP_SECONDS)
        item.update(state="started", attempts=item.get("attempts", 0) + 1, started_at=now.isoformat(timespec="seconds"))
        _write_state(day, state)
        arn = prism_batch.start_item(item["batch_id"], _manifest_item(item), _container_env())
        if arn:
            item["task_arn"] = arn
            started += 1
        else:  # RunTask 자체가 거절 — start_item이 상태를 error로 썼다
            item["state"] = "failed"
            batches.add(item["batch_id"])
        _write_state(day, state)
    return started, batches


def _close(day: dt.date, state: dict, now: dt.datetime, *, count: int, missing_groups: list[str], quiet_if_none: bool) -> None:
    state.update(closed=True, closed_at=now.isoformat(timespec="seconds"), missing_groups=missing_groups)
    if count == 0:
        if not quiet_if_none:
            _alert(day, ["오늘 16시까지 프리즘 기사가 하나도 안 올라와 영상을 만들지 않았어요"])
    elif missing_groups:
        batches = state.get("batches") or [None]
        _alert(day, [f"16시까지 안 올라온 그룹: {', '.join(missing_groups)} — 이 그룹은 오늘 영상이 없어요"], batches[-1])


def run(now: dt.datetime | None = None) -> dict:
    now = now or dt.datetime.now(_KST)
    day = now.date()
    if now.time() < _START:
        return {"result": "too_early"}
    state = _read_state(day) or {"day": day.isoformat(), "closed": False, "items": [], "batches": []}
    lease = state.get("lease_until")
    if lease and dt.datetime.fromisoformat(lease) > now:
        return {"result": "busy"}
    active = [i for i in state.get("items", []) if i.get("state") in ("pending", "started")]
    if state.get("closed") and not active:
        return {"result": "closed", "batches": state.get("batches")}

    state["lease_until"] = (now + dt.timedelta(seconds=_LEASE_SECONDS)).isoformat(timespec="seconds")
    state["test_mode"] = _test_mode()
    made = None
    try:
        notify_batches = _check_started(state, now)
        if not state.get("closed"):
            made = _plan(day, state, now)
        started, more = _start_pending(day, state, now)
        notify_batches |= more
    finally:
        state.pop("lease_until", None)
        _write_state(day, state)
    for batch_id in notify_batches:
        _notify_if_batch_done(batch_id)
    left = sum(1 for i in state.get("items", []) if i.get("state") == "pending")
    logger.info("PRISM 자동 제작: 새 묶음 %s, 켬 %d, 남은 편 %d%s", made, started, left, " [시험 모드]" if _test_mode() else "")
    return {"result": "started" if started else ("working" if active else "waiting"), "made": made, "started": started,
            "pending": left, "closed": bool(state.get("closed")), "test_mode": _test_mode()}


def _plan(day: dt.date, state: dict, now: dt.datetime) -> str | None:
    """XML을 보고 새로 만들 편을 묶음으로 만든다 → 만든 batch_id. 마감이면 오늘을 닫는다."""
    results, xml_groups = _collect(day)
    made_groups = {i["xml_group"] for i in state.get("items", [])}
    present = {r["xml_group"] for r in results}
    missing_groups = [g for g in xml_groups if g not in present]
    last = now.time() >= _LAST_DEADLINE
    past_first = now.time() >= _FIRST_DEADLINE
    todo = [r for r in results if r["type"] and r["xml_group"] not in made_groups]

    batch_id = None
    # 첫 묶음은 8개가 다 모이거나 12시가 돼야 만든다. 그 뒤로는 올라오는 대로 추가한다.
    if todo and (not missing_groups or past_first):
        # 참고 문구는 이번 묶음에 든 편 것만(앞 묶음에 이미 붙은 문구를 되풀이하지 않게).
        noted = [r for r in results if r in todo or (not r["type"] and not made_groups)]
        batch_id = _make_batch(state, todo, _notes_for(noted, missing_groups, last))
    if not missing_groups and all(r["xml_group"] in {i["xml_group"] for i in state.get("items", [])} or not r["type"] for r in results):
        state.update(closed=True, closed_at=now.isoformat(timespec="seconds"), missing_groups=[])
    elif last:
        count = len(state.get("items", []))
        # 토·일은 쉬는 날이 잦아 0건이어도 알리지 않는다
        _close(day, state, now, count=count, missing_groups=missing_groups, quiet_if_none=day.weekday() >= 5)
    return batch_id


def handle_event(payload: dict) -> dict:
    """handler.py의 `_prism_auto` 분기. payload.now(ISO, 선택)로 시각을 바꿔 부를 수 있다(손으로 시험할 때)."""
    now = dt.datetime.fromisoformat(payload["now"]) if payload.get("now") else None
    return run(now)
