"""PRISM 매일 자동 제작(2026-11-05) — EventBridge가 9:00~12:55(KST) 5분마다 이 Lambda를 {"_prism_auto": {}}로 깨운다.

사용자 요청: 마케팅팀이 기사 txt를 손으로 만들어 [PRISM 제작] 화면에 올리던 일을 없애고, DB(서울경제 일일 기사 XML)에서
읽어 영상까지 자동으로. txt는 pipelines/video/prism_auto.py가 만들고(그날의 "■AI 프리즘 [OO 뉴스]" 기사 → 링크된 원문),
시작은 화면의 [제작 시작]과 같은 routes/prism_batch.start_batch를 쓴다 — 만들어진 묶음은 화면의 "지난 제작"에 그대로 뜬다.

판단(사용자 결정 2026-11-05):
- 프리즘 기사 8개(그룹 8개)가 다 올라오면 바로 시작한다. 보통 10:00 게재, XML은 5분마다 갱신된다.
- 12:00까지 다 안 모이면 모인 것만 만들고 슬랙에 빠진 그룹을 알린다(11/5는 주식 뉴스 없이 7개였다).
- 하나도 없으면 쉬는 날이다(지금은 토요일, 명절) — 아무것도 안 한다.
- 하루에 한 번만 시작한다. 시작하기 "전에" media/prism-auto/{YYYYMMDD}.json에 closed를 써서, 간격을 두고 켜는
  10분 남짓 사이에 다음 5분 호출이 같은 편을 또 켜지 않게 한다. 마감 뒤 늦게 올라온 그룹은 만들지 않는다.
- 유튜브 바로 공개(사용자 결정). 시험할 땐 Lambda 환경변수 PRISM_AUTO_TEST_MODE=1 — 유튜브 업로드·슬랙 알림을 끈다.
- 편 사이 90초 간격 — 8편을 한꺼번에 켜면 성우(Polly) "Rate exceeded"로 렌더가 실패한다(11/5 시험).

끄기: EventBridge 규칙을 disable하면 된다. 수동 [PRISM 제작] 화면은 그대로 쓸 수 있다.
"""
from __future__ import annotations

import datetime as dt
import json
import logging
import os
import urllib.error
import urllib.request

import boto3

from routes import prism_batch

logger = logging.getLogger(__name__)

_KST = dt.timezone(dt.timedelta(hours=9))
_START = dt.time(9, 0)
_DEADLINE = dt.time(12, 0)
_GAP_SECONDS = 90
_STATE_PREFIX = "media/prism-auto"
_TIMEOUT_SECONDS = 10
# 완료 알림(pipelines/video/prism_notify.py)과 같은 토픽 → Amazon Q Developer → 슬랙.
_TOPIC_ARN = os.environ.get("PRISM_NOTIFY_TOPIC_ARN", "arn:aws:sns:us-east-1:887078546492:prism-batch-notify")
_CMS_URL = os.environ.get("PRISM_CMS_URL", "https://lensdb.sedaily.ai")
# 시험 모드에서 video-lab 태스크에 덮어쓸 환경변수 — 없는 시크릿 이름이면 youtube_upload가 업로드를 건너뛰고,
# 토픽이 비면 prism_notify가 완료 알림을 건너뛴다.
_TEST_CONTAINER_ENV = [
    {"name": "PRISM_YOUTUBE_SECRET_ID", "value": "ai-labs/prism-youtube-OFF-auto-test"},
    {"name": "PRISM_NOTIFY_TOPIC_ARN", "value": ""},
]


def _test_mode() -> bool:
    return os.environ.get("PRISM_AUTO_TEST_MODE") == "1"


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


def _alert(day: dt.date, lines: list[str], batch_id: str | None) -> None:
    """슬랙 알림(완료 알림과 같은 Amazon Q Developer custom notification 형식). 실패해도 제작은 계속한다."""
    if batch_id:
        lines = [*lines, f"<{_CMS_URL}/prism-batch?batch={batch_id}|CMS에서 보기>"]
    logger.info("PRISM 자동 제작 알림: %s", " / ".join(lines))
    if _test_mode() or not _TOPIC_ARN:
        return
    msg = {"version": "1.0", "source": "custom", "content": {
        "textType": "client-markdown",
        "title": f"⚠️ AI PRISM 자동 제작 확인 필요 ({day:%m/%d})",
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


def run(now: dt.datetime | None = None) -> dict:
    now = now or dt.datetime.now(_KST)
    day = now.date()
    if now.time() < _START:
        return {"result": "too_early"}
    state = _read_state(day) or {"day": day.isoformat(), "closed": False}
    if state.get("closed"):
        return {"result": "closed", "batch_id": state.get("batch_id")}

    results, xml_groups = _collect(day)
    past_deadline = now.time() >= _DEADLINE
    present = {r["xml_group"] for r in results}
    missing_groups = [g for g in xml_groups if g not in present]

    if not results:
        if past_deadline:  # 쉬는 날 — 알리지 않고 오늘을 닫는다
            _write_state(day, {**state, "closed": True, "closed_at": now.isoformat(timespec="seconds"), "count": 0})
            return {"result": "no_prism_today"}
        return {"result": "waiting", "found": 0}
    if missing_groups and not past_deadline:
        return {"result": "waiting", "found": len(results)}

    # 여기부터는 오늘 한 번만 — 8개가 다 모였거나 마감이 됐다.
    todo = [r for r in results if r["type"]]
    notes: list[str] = []
    if missing_groups:
        notes.append(f"12시까지 프리즘 기사가 안 올라온 그룹: {', '.join(missing_groups)} — 이 그룹은 오늘 만들지 않았어요")
    for r in results:
        if not r["type"]:
            notes.append(f"알 수 없는 그룹 이름 '{r['xml_group']}' — 만들지 않았어요(코드 표에 추가 필요)")
        if r["missing"]:
            notes.append(f"{r['xml_group']}: 원문 {len(r['missing'])}건을 XML에서 못 찾아 빼고 만들었어요({', '.join(r['missing'])})")
        if r.get("duplicates"):
            notes.append(f"{r['xml_group']}: 프리즘 기사가 {1 + len(r['duplicates'])}개라 하나({r['key']})만 만들었어요")

    batch_id = prism_batch.new_batch_id() if todo else None
    items = []
    for n, r in enumerate(todo, start=1):
        item_id = f"{n:02d}"
        items.append({
            "item_id": item_id, "file_name": r["file_name"], "type": r["type"],
            "group": prism_batch.GROUPS[r["type"]], "recording_date": r["recording_date"],
            "input_key": prism_batch.input_key(batch_id, n), "job_id": f"prism-{batch_id}-{item_id}",
        })
    _write_state(day, {
        **state, "closed": True, "closed_at": now.isoformat(timespec="seconds"), "batch_id": batch_id,
        "groups": [r["xml_group"] for r in todo], "missing_groups": missing_groups, "test_mode": _test_mode(),
    })
    if not todo:
        _alert(day, notes or ["프리즘 기사는 있지만 만들 수 있는 편이 없어요"], None)
        return {"result": "nothing_to_make"}

    s3 = prism_batch.webtoon_jobs.s3()
    for item, r in zip(items, todo):
        s3.put_object(Bucket=prism_batch.webtoon_jobs.bucket(), Key=item["input_key"], Body=r["text"].encode("utf-8"),
                      ContentType="text/plain; charset=utf-8")
    if notes:
        _alert(day, notes, batch_id)
    failed = prism_batch.start_batch(batch_id, items, gap_seconds=_GAP_SECONDS,
                                     container_env=_TEST_CONTAINER_ENV if _test_mode() else None)
    if failed:
        _alert(day, [f"작업 시작 실패: {', '.join(failed)} — CMS에서 [다시 시도]해 주세요"], batch_id)
    logger.info("PRISM 자동 제작 시작 %s: %d편(실패 %d)%s", batch_id, len(items), len(failed),
                " [시험 모드]" if _test_mode() else "")
    return {"result": "started", "batch_id": batch_id, "count": len(items), "failed": failed, "test_mode": _test_mode()}


def handle_event(payload: dict) -> dict:
    """handler.py의 `_prism_auto` 분기. payload.now(ISO, 선택)로 시각을 바꿔 부를 수 있다(손으로 시험할 때)."""
    now = dt.datetime.fromisoformat(payload["now"]) if payload.get("now") else None
    return run(now)
