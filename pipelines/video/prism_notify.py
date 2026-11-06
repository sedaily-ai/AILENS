"""PRISM 일괄 제작 완료 슬랙 알림(2026-10-23) — 사용자 요청: "prism영상생성 끝나면 슬랙에 알림오게".

한 번에 시작한 묶음(batch)의 편이 모두 끝나면(완료 또는 실패) 마지막으로 끝난 태스크가 요약을 한 번 보낸다.
태스크들이 동시에 끝나도 한 번만 보내도록 media/prism-batch/{batch_id}/notified.json을 "없을 때만 쓰기"
(S3 조건부 쓰기)로 먼저 차지한 쪽만 보낸다. 묶음 요약을 보낸 뒤 [다시 시도]한 편은 알리지 않는다.

회사 슬랙은 앱 설치 한도(10개)가 차서 새 앱(웹훅)을 못 단다. 이미 설치된 Amazon Q Developer로 보낸다:
SNS 토픽 prism-batch-notify → Q Developer 채널 설정 prism-batch-notify-slack(채널 지정은 AWS 쪽, 코드는 모름).
메시지는 Q Developer "custom notification" 형식이다. 토픽 환경변수가 비어 있으면 알리지 않는다.
알림 실패가 제작 결과를 바꾸지 않도록 호출부(prism_batch.run)가 예외를 삼킨다.
"""
from __future__ import annotations

import json
import os

import boto3
from botocore.exceptions import ClientError

from config import CMS_MEDIA_BUCKET

TOPIC_ARN = os.environ.get("PRISM_NOTIFY_TOPIC_ARN", "arn:aws:sns:us-east-1:887078546492:prism-batch-notify")
CMS_URL = os.environ.get("PRISM_CMS_URL", "https://lensdb.sedaily.ai")
_PREFIX = "media/prism-batch"
_DONE = ("done", "error")


def _get_json(s3, key: str) -> dict | None:
    try:
        return json.loads(s3.get_object(Bucket=CMS_MEDIA_BUCKET, Key=key)["Body"].read())
    except ClientError:
        return None


def _claim(s3, batch_id: str) -> bool:
    """요약 알림 권리를 처음 한 번만 얻는다(이미 누가 보냈으면 False)."""
    try:
        s3.put_object(Bucket=CMS_MEDIA_BUCKET, Key=f"{_PREFIX}/{batch_id}/notified.json", Body=b"{}",
                      ContentType="application/json", IfNoneMatch="*")
        return True
    except ClientError as e:
        if e.response.get("Error", {}).get("Code") in ("PreconditionFailed", "ConditionalRequestConflict"):
            return False
        raise


def _one_line(text: str, limit: int) -> str:
    """알림 한 줄에 넣을 문장 — 줄바꿈·연속 공백을 하나로(이유 안의 줄바꿈이 알림 줄을 깨뜨렸다, 10/23)."""
    text = " ".join(text.split())
    return text if len(text) <= limit else text[: limit - 1] + "…"


def build_message(batch_id: str, rows: list[tuple[dict, dict]], notes: list[str] | None = None) -> dict:
    ok = sum(1 for _, s in rows if s.get("stage") == "done")
    date = rows[0][0].get("recording_date", "")
    mm_dd = f"{int(date[5:7])}/{int(date[8:10])}" if len(date) == 10 else date
    lines = []
    flagged: list[tuple[str, list[str]]] = []  # (그룹, 검수 플래그 목록) — 아래 상세 블록용
    for item, s in rows:
        group = item.get("group") or item.get("type")
        # 날짜·숫자 검수 플래그(prism_batch가 status에 기록). 완료/실패와 무관하게 모은다.
        checks = (s.get("date_flags") or []) + (s.get("number_flags") or [])
        if checks:
            flagged.append((group, checks))
        check_tag = f" 🔎검수 {len(checks)}건" if checks else ""
        if s.get("stage") == "done":
            # 2026-11-05 데일리모션 추가 — 올라간 곳은 링크, 못 올린 곳은 이유. 둘 다 올라가면 ✅.
            links, problems = [], []
            for key, name in (("youtube", "유튜브"), ("dailymotion", "데일리모션")):
                if s.get(f"{key}_url"):
                    links.append(f"<{s[f'{key}_url']}|{name}>")
                elif s.get(f"{key}_error"):
                    problems.append(f"{name} 미업로드({_one_line(s[f'{key}_error'], 60)})")
            if not s.get("youtube_url") and not problems:
                problems = ["유튜브 미업로드"]  # 시크릿이 없어 시도조차 안 한 경우
            if problems:
                lines.append(f"⚠️ {group} — 영상 완료, {' · '.join(links + problems)}{check_tag}")
            else:
                lines.append(f"✅ {group} — {' · '.join(links)}{check_tag}")
        else:
            lines.append(f"❌ {group} — {_one_line(s.get('message') or '실패', 100)}")
    lines.append(f"<{CMS_URL}/prism-batch?batch={batch_id}|CMS에서 보기>")
    # 자동 제작이 남긴 참고 사항(routes/prism_schedule.py — 빠진 그룹·같은 그룹 2건 등). 사용자 요청(2026-11-06):
    # 따로 보내지 말고 완료 알림 끝에, "확인 필요"는 자극적이니 "참고"로.
    if notes:
        lines += ["", "📌 참고", *[f"· {_one_line(n, 160)}" for n in notes]]
    # 날짜·숫자 검수 플래그 상세 — 사람이 영상 공개 전후로 확인할 수치/날짜. 너무 길지 않게 편당 3건까지.
    if flagged:
        lines.append("")
        lines.append("🔎 검수 확인 필요 (영상은 이미 공개됨):")
        for group, checks in flagged:
            for c in checks[:3]:
                lines.append(f"  • {group}: {_one_line(c, 110)}")
            if len(checks) > 3:
                lines.append(f"  • {group}: 외 {len(checks) - 3}건")
    return {"version": "1.0", "source": "custom", "content": {
        "textType": "client-markdown",
        "title": f"🎬 AI PRISM 제작 완료 ({mm_dd}, {len(rows)}편 중 {ok}편 성공)",
        "description": "\n".join(lines),
    }}


def notify_if_batch_done(s3, batch_id: str) -> None:
    if not TOPIC_ARN:
        return
    manifest = _get_json(s3, f"{_PREFIX}/{batch_id}/manifest.json")
    if not manifest:
        return
    rows = []
    for item in manifest.get("items", []):
        status = _get_json(s3, f"{_PREFIX}/{batch_id}/{item['item_id']}.status.json") or {}
        if status.get("stage") not in _DONE:
            return  # 아직 도는 편이 있다 — 마지막 편이 보낸다
        rows.append((item, status))
    if not rows or not _claim(s3, batch_id):
        return
    msg = build_message(batch_id, rows, manifest.get("notes"))
    boto3.client("sns", region_name=TOPIC_ARN.split(":")[3]).publish(
        TopicArn=TOPIC_ARN, Message=json.dumps(msg, ensure_ascii=False))
    print(f"[prism-notify] 묶음 요약 전송 ({batch_id}, {len(rows)}편)")
