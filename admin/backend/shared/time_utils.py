"""공용 시각 포맷 — DynamoDB job 레코드의 created_at/updated_at에 쓰는
ISO 8601(UTC, 초 단위) 문자열.

routes/prompts.py · routes/webtoon_lab.py가 각자 같은 한 줄 함수를 따로
정의하고 있었고, routes/chat_ws.py는 그중 webtoon_lab._now_iso()를 원격으로
가져다 썼다(2026-09-16 리팩토링 감사) — 셋 다 이걸로 교체한다.
"""
from __future__ import annotations

import datetime as dt


def now_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
