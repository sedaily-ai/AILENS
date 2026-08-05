# AI LENS CMS — 3단계 (AI 레터 편집 + 이미지 업로드) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자가 파이프라인이 만든 AI 레터를 고치고 내릴 수 있고, 글에 이미지를 직접
올릴 수 있다. 이 계획이 끝나면 문영광님 요구사항이 전부 충족된다.

**Architecture:** 3A(레터 편집)는 `daily_letters` 를 admin Lambda 가 직접 UPDATE 한다 —
본문이 `body_inline` 만 읽히는 구조라 S3 쓰기가 필요 없다. 3B(이미지)는 신규 미디어
버킷 + presigned PUT 으로, 브라우저가 S3 에 직접 올린다.

**Tech Stack:** Python 3.11 Lambda(pg8000), Next.js 16 정적 export, S3 presigned PUT.

스펙: [`docs/superpowers/specs/2026-07-27-ailens-cms-design.md`](../specs/2026-07-27-ailens-cms-design.md)
선행: [phase0-1](2026-07-27-ailens-cms-phase0-1.md) · [phase2](2026-07-28-ailens-cms-phase2.md)

## Global Constraints

- 커밋 트레일러는 **정확히** `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>`.
- **admin 배포는 반드시 `./admin/deploy-admin-api.sh`** — 이 스크립트만 `--python-version 3.11`
  과 네이티브 ABI 검증 게이트를 갖고 있다. 직접 zip 을 말면 2026-07-27 사고가 재발한다.
- **admin 프론트 빌드 전 `admin/.env.local` 존재 확인.** 없으면 API 주소가 번들에 안 박혀
  콘솔이 통째로 죽는다. 배포 전 `grep -rq chzwwtjtgk out/` 로 확인할 것.
- AWS 리소스 생성·CloudFront 설정 변경은 **건별 사용자 확인**. 변경 전 현재 config 를
  파일로 저장해 즉시 롤백 가능하게 한다.
- `admin/AGENTS.md`: Next 16 관례는 `admin/node_modules/next/dist/docs/` 를 근거로 삼는다.
- 게이트: `python3 -m pytest admin/tests/ -q` + `npx tsc --noEmit` + `npm run build` + lint.
  lint 는 **기준선 1건**(기존 `newsletter/page.tsx`)을 넘기지 않는다.
- 실측 확정값: admin Lambda `sedaily-mbti-admin-api-dev`, API `chzwwtjtgk`,
  계정 `887078546492`, 프론트 CloudFront `E1QS7PY350VHF6`, 리전 `us-east-1`.

## File Structure

| 파일 | 책임 |
|---|---|
| `service/backend/v2/infrastructure/daily_letters_soft_delete.sql` | `deleted_at` 컬럼 추가 |
| `service/backend/admin/repo/letters_repo.py` | `daily_letters` SQL 전담 |
| `service/backend/admin/routes/letters.py` | 레터 편집 라우트 |
| `service/backend/admin/routes/media.py` | presign 발급 |
| `service/backend/v2/clients/pgvector_v2_client.py` | 읽기 쿼리에 `deleted_at IS NULL` 1줄 |
| `admin/src/app/(authenticated)/letters/page.tsx` | 레터 목록(날짜별) |
| `admin/src/app/(authenticated)/letters/edit/page.tsx` | 레터 편집 |
| `admin/src/components/ImageUploader.tsx` | 업로드 위젯 |

`PostForm` 은 2단계에서 이미 분리해 뒀다 — 레터 편집기가 그대로 재사용한다.

---

## 3A — AI 레터 편집

### Task 1: `deleted_at` 컬럼 + 읽기 경로 반영

**Files:**
- Create: `service/backend/v2/infrastructure/daily_letters_soft_delete.sql`
- Create: `service/backend/v2/scripts/apply_letters_soft_delete.py`
- Modify: `service/backend/v2/clients/pgvector_v2_client.py` (`get_daily_letters` WHERE 절)

**Interfaces:**
- Produces: `daily_letters.deleted_at`. 이후 Task 2 의 soft delete 가 이 컬럼을 쓴다.

**왜 소프트 삭제인가:** CMS 와 같은 원칙 — "삭제 = 화면에서 내리는 것". AI 레터를 하드
삭제하면 파이프라인 산출물과 Bedrock 토큰 기록(`bedrock_usage`)까지 사라진다.

- [ ] **Step 1: DDL 작성** — `daily_letters_soft_delete.sql`:

```sql
-- daily_letters 소프트 삭제 (CMS 3단계).
-- nullable 추가라 기존 행·파이프라인 INSERT 에 영향 없다.
--
-- 적용: cd service/backend && python3 v2/scripts/apply_letters_soft_delete.py

ALTER TABLE daily_letters ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_daily_letters_live
    ON daily_letters (letter_date DESC) WHERE deleted_at IS NULL;
```

- [ ] **Step 2: 적용 스크립트 작성** — `apply_cms_posts_schema.py` 를 그대로 복제하되
`SCHEMA_PATH` 만 바꾼다. 검증 쿼리는 아래로:

```python
    print("[3] verifying — deleted_at:")
    rows = conn.run("""
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'daily_letters' AND column_name = 'deleted_at'
    """)
    for r in rows:
        print(f"  - {r[0]} {r[1]} nullable={r[2]}")
```

- [ ] **Step 3: 읽기 경로에 반영** — `pgvector_v2_client.py` 의 `get_daily_letters` 에서

```python
                WHERE letter_date = :ldate
```

를 아래로 교체:

```python
                WHERE letter_date = :ldate
                  AND deleted_at IS NULL
```

- [ ] **Step 4: [게이트] DDL 적용**

RDS 보안그룹이 `172.31.0.0/16` 과 특정 IP 만 허용하므로, 워크스테이션에서 돌리려면
실행 IP 를 임시 규칙으로 추가했다가 **반드시 제거**한다 (Task 3 phase0-1 과 동일 절차).

Run: `cd service/backend && python3 v2/scripts/apply_letters_soft_delete.py`
Expected: `deleted_at timestamp with time zone nullable=YES`

- [ ] **Step 5: 배포 + 회귀**

```bash
cd service/backend && ./v2/deploy-v2.sh today-letters
B=https://chzwwtjtgk.execute-api.us-east-1.amazonaws.com/dev
curl -s "$B/api/v2/today-letters?date=$(TZ=Asia/Seoul date -v-1d +%Y-%m-%d)" \
  | python3 -c "import json,sys; print('letters:', len(json.load(sys.stdin).get('letters',[])))"
```

Expected: 변경 전과 같은 건수. **줄어들면 즉시 중단** — WHERE 절이 잘못 걸린 것.

- [ ] **Step 6: Commit**

```bash
git add service/backend/v2/infrastructure/daily_letters_soft_delete.sql \
        service/backend/v2/scripts/apply_letters_soft_delete.py \
        service/backend/v2/clients/pgvector_v2_client.py
git commit -m "feat(cms): daily_letters 소프트 삭제 컬럼 + 읽기 경로 반영

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 2: 레터 repo + 라우트

**Files:**
- Create: `service/backend/admin/repo/letters_repo.py`
- Create: `service/backend/admin/routes/letters.py`
- Create: `service/backend/admin/tests/test_letters_repo.py`
- Modify: `service/backend/admin/handler.py` (import + HANDLERS 3줄)

**Interfaces:**
- Consumes: `shared.pg_client`
- Produces:
  - `letters_repo.list_by_date(date: str) -> list[dict]`
  - `letters_repo.get(letter_id: str) -> dict | None`
  - `letters_repo.update(letter_id: str, data: dict) -> dict | None`
  - `letters_repo.soft_delete(letter_id: str) -> bool`
  - routeKey: `GET /admin/letters`, `PUT /admin/letters/{id}`, `DELETE /admin/letters/{id}`
- row dict 키: `id, letter_date, editor_id, mbti_group, headline, subtitle,
  closing_line, body_inline, keywords, mode, created_at`

**편집 가능 범위**: `headline` · `subtitle` · `closing_line` · `body_inline` · `keywords` 만.
`editor_id` / `mbti_group` / `letter_date` 는 레터의 정체성이고 `UNIQUE(letter_date,
editor_id)` 제약과 얽혀 있어 **수정 대상에서 제외**한다.

**본문 형식**: `body_inline` 을 신형식 `{body: [...], key_points: [...]}` 으로 쓴다.
`today_letters._enrich_body` 가 `inline.get("body")` 를 **먼저** 보므로, 편집한 레터는
v1 mode-A 평탄화 경로를 타지 않고 그대로 렌더된다.

- [ ] **Step 1: 실패하는 테스트 작성** — `admin/tests/test_letters_repo.py`:

```python
"""letters_repo 유닛 테스트 — pg_client.run 을 fake 로 대체.

Run from service/backend/::

    python3 -m pytest admin/tests/test_letters_repo.py -v
"""
from __future__ import annotations

import datetime as _dt
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from repo import letters_repo


class _FakePg:
    def __init__(self, rows_queue: list[list[list]]) -> None:
        self.rows_queue = list(rows_queue)
        self.calls: list[tuple[str, dict]] = []

    def run(self, sql: str, **params):
        self.calls.append((sql, params))
        return self.rows_queue.pop(0) if self.rows_queue else []


def _row() -> list:
    """SELECT 컬럼 순서와 1:1 (letters_repo._COLUMNS)."""
    now = _dt.datetime(2026, 7, 28, 0, 0, tzinfo=_dt.timezone.utc)
    return [
        "22222222-2222-2222-2222-222222222222",
        _dt.date(2026, 7, 28), "하은", "NF",
        "AI 레터 제목", "부제", "닫는 줄",
        {"body": ["문단1"], "key_points": ["요점"]},
        [{"term": "금리", "explain": "설명"}],
        "A", now,
    ]


def _install(monkeypatch, fake: _FakePg) -> None:
    monkeypatch.setattr(letters_repo.pg_client, "run", fake.run)


def test_list_by_date_excludes_deleted(monkeypatch) -> None:
    fake = _FakePg([[_row()]])
    _install(monkeypatch, fake)
    out = letters_repo.list_by_date("2026-07-28")
    assert len(out) == 1 and out[0]["editor_id"] == "하은"
    sql, params = fake.calls[0]
    assert "deleted_at IS NULL" in sql
    assert params["ldate"] == "2026-07-28"


def test_get_returns_none_when_missing(monkeypatch) -> None:
    _install(monkeypatch, _FakePg([[]]))
    assert letters_repo.get("22222222-2222-2222-2222-222222222222") is None


def test_update_only_touches_provided_keys(monkeypatch) -> None:
    fake = _FakePg([[_row()]])
    _install(monkeypatch, fake)
    letters_repo.update("22222222-2222-2222-2222-222222222222", {"headline": "새 제목"})
    sql, params = fake.calls[0]
    assert "headline = :headline" in sql
    for absent in ("subtitle", "closing_line", "body_inline", "keywords"):
        assert f"{absent} =" not in sql
    assert set(params) == {"id", "headline"}


def test_update_rejects_identity_fields(monkeypatch) -> None:
    fake = _FakePg([[_row()]])
    _install(monkeypatch, fake)
    letters_repo.update(
        "22222222-2222-2222-2222-222222222222",
        {"headline": "x", "editor_id": "민철", "mbti_group": "NT", "letter_date": "2026-01-01"},
    )
    sql, params = fake.calls[0]
    # 정체성 필드는 무시된다 — UNIQUE(letter_date, editor_id) 와 얽혀 있다.
    for banned in ("editor_id", "mbti_group", "letter_date"):
        assert f"{banned} =" not in sql
    assert set(params) == {"id", "headline"}


def test_soft_delete_sets_deleted_at(monkeypatch) -> None:
    fake = _FakePg([[["22222222-2222-2222-2222-222222222222"]]])
    _install(monkeypatch, fake)
    assert letters_repo.soft_delete("22222222-2222-2222-2222-222222222222") is True
    sql, _ = fake.calls[0]
    assert "deleted_at = now()" in sql
```

- [ ] **Step 2: 실패 확인**

Run: `cd service/backend && python3 -m pytest admin/tests/test_letters_repo.py -v`
Expected: **FAIL** — `ImportError: cannot import name 'letters_repo'`

- [ ] **Step 3: `letters_repo.py` 구현**

```python
"""daily_letters SQL 전담 — AI 레터 편집 (CMS spec §5.3).

파이프라인이 쓰는 테이블이라 수정 범위를 좁게 잡는다. editor_id / mbti_group /
letter_date 는 레터의 정체성이고 UNIQUE(letter_date, editor_id) 제약과 얽혀 있어
편집 대상에서 제외한다.

본문은 body_inline 만 쓴다 — today_letters._enrich_body 가 body_s3_uri 를 읽지
않기 때문에 S3 쓰기가 필요 없다.
"""
from __future__ import annotations

import json
from typing import Any

from shared import pg_client

_COLUMNS = """id, letter_date, editor_id, mbti_group, headline, subtitle,
              closing_line, body_inline, keywords, mode, created_at"""

# 편집 허용 필드만. 정체성 필드는 여기 없으므로 자동으로 무시된다.
_UPDATABLE: dict[str, tuple[str, Any]] = {
    "headline": ("headline = :headline", lambda v: v),
    "subtitle": ("subtitle = :subtitle", lambda v: v),
    "closing_line": ("closing_line = :closing_line", lambda v: v),
    "body_inline": (
        "body_inline = CAST(:body_inline AS jsonb)",
        lambda v: json.dumps(v or {}, ensure_ascii=False),
    ),
    "keywords": (
        "keywords = CAST(:keywords AS jsonb)",
        lambda v: json.dumps(v or [], ensure_ascii=False),
    ),
}


def _jsonb(v: Any, fallback: Any) -> Any:
    if isinstance(v, str):
        try:
            return json.loads(v)
        except Exception:
            return fallback
    return v if v is not None else fallback


def _to_dict(r: list) -> dict:
    return {
        "id": str(r[0]),
        "letter_date": r[1].isoformat() if hasattr(r[1], "isoformat") else r[1],
        "editor_id": r[2],
        "mbti_group": r[3],
        "headline": r[4],
        "subtitle": r[5],
        "closing_line": r[6],
        "body_inline": _jsonb(r[7], {}),
        "keywords": _jsonb(r[8], []),
        "mode": r[9],
        "created_at": r[10].isoformat() if hasattr(r[10], "isoformat") else r[10],
    }


def list_by_date(date: str) -> list[dict]:
    rows = pg_client.run(
        f"""
        SELECT {_COLUMNS} FROM daily_letters
        WHERE letter_date = CAST(:ldate AS date) AND deleted_at IS NULL
        ORDER BY CASE mbti_group
                   WHEN 'NT' THEN 1 WHEN 'NF' THEN 2
                   WHEN 'ST' THEN 3 WHEN 'SF' THEN 4 END
        """,
        ldate=date,
    )
    return [_to_dict(r) for r in rows]


def get(letter_id: str) -> dict | None:
    rows = pg_client.run(
        f"SELECT {_COLUMNS} FROM daily_letters "
        "WHERE id = CAST(:id AS uuid) AND deleted_at IS NULL",
        id=letter_id,
    )
    return _to_dict(rows[0]) if rows else None


def update(letter_id: str, data: dict) -> dict | None:
    """부분 수정 — 허용 필드 중 data 에 있는 것만 바꾼다."""
    sets: list[str] = []
    params: dict[str, Any] = {"id": letter_id}
    for key, (clause, conv) in _UPDATABLE.items():
        if key in data:
            sets.append(clause)
            params[key] = conv(data[key])

    if not sets:
        return get(letter_id)

    rows = pg_client.run(
        f"""
        UPDATE daily_letters SET {', '.join(sets)}
        WHERE id = CAST(:id AS uuid) AND deleted_at IS NULL
        RETURNING {_COLUMNS}
        """,
        **params,
    )
    return _to_dict(rows[0]) if rows else None


def soft_delete(letter_id: str) -> bool:
    rows = pg_client.run(
        """
        UPDATE daily_letters SET deleted_at = now()
        WHERE id = CAST(:id AS uuid) AND deleted_at IS NULL
        RETURNING id
        """,
        id=letter_id,
    )
    return bool(rows)
```

- [ ] **Step 4: 라우트 작성** — `admin/routes/letters.py`:

```python
"""AI 레터 편집 라우트 (CMS spec §5.3).

파이프라인 산출물을 관리자가 사후 수정한다. 생성은 없다 — 레터는 Editor Pick 이 만든다.
"""
from __future__ import annotations

import logging

from repo import letters_repo
from shared import response

logger = logging.getLogger(__name__)


def handle_list(body: dict, path_params: dict, query_params: dict) -> dict:
    date = (query_params or {}).get("date", "")
    if not date:
        return response.err("date is required (YYYY-MM-DD)", 400)
    return response.ok({"letters": letters_repo.list_by_date(date)})


def handle_get(body: dict, path_params: dict, query_params: dict) -> dict:
    letter = letters_repo.get((path_params or {}).get("id", ""))
    if not letter:
        return response.err("letter not found", 404)
    return response.ok({"letter": letter})


def handle_update(body: dict, path_params: dict, query_params: dict) -> dict:
    letter = letters_repo.update((path_params or {}).get("id", ""), body or {})
    if not letter:
        return response.err("letter not found", 404)
    logger.info(f"ai letter edited: {letter['id']}")
    return response.ok({"letter": letter})


def handle_delete(body: dict, path_params: dict, query_params: dict) -> dict:
    if not letters_repo.soft_delete((path_params or {}).get("id", "")):
        return response.err("letter not found", 404)
    return response.ok({"ok": True})
```

- [ ] **Step 5: `handler.py` 등록** — import 줄에 `letters` 를 추가하고, HANDLERS 의
`"DELETE /admin/posts/{id}"` 다음에:

```python
    # AI 레터 편집 (2026-07-28)
    "GET /admin/letters": (letters.handle_list, True),
    "GET /admin/letters/{id}": (letters.handle_get, True),
    "PUT /admin/letters/{id}": (letters.handle_update, True),
    "DELETE /admin/letters/{id}": (letters.handle_delete, True),
```

- [ ] **Step 6: 통과 확인**

Run: `cd service/backend && python3 -m pytest admin/tests/ -q`
Expected: **PASS** 전부 (기존 26 + 신규 5 = 31건)

- [ ] **Step 7: 배포 + API GW 라우트 4개**

```bash
cd service/backend && ./admin/deploy-admin-api.sh
API=chzwwtjtgk
INTEG=$(aws apigatewayv2 get-routes --api-id $API --region us-east-1 --max-results 500 \
  --query "Items[?RouteKey=='GET /admin/cost'].Target" --output text | cut -d/ -f2)
for RK in "GET /admin/letters" "GET /admin/letters/{id}" \
          "PUT /admin/letters/{id}" "DELETE /admin/letters/{id}"; do
  aws apigatewayv2 create-route --api-id $API --route-key "$RK" \
    --target "integrations/$INTEG" --region us-east-1 --query RouteId --output text
done
```

Expected: RouteId 4개. 무인증 호출 시 401.

- [ ] **Step 8: Commit**

```bash
git add service/backend/admin/repo/letters_repo.py service/backend/admin/routes/letters.py \
        service/backend/admin/handler.py service/backend/admin/tests/test_letters_repo.py
git commit -m "feat(cms): AI 레터 편집 API — 부분 수정 + 소프트 삭제

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 3: 레터 편집 화면

**Files:**
- Modify: `admin/src/lib/types.ts` · `admin/src/lib/adminClient.ts`
- Create: `admin/src/app/(authenticated)/letters/page.tsx`
- Create: `admin/src/app/(authenticated)/letters/edit/page.tsx`
- Modify: `admin/src/components/Nav.tsx`

**Interfaces:**
- Consumes: `PostForm` (2단계에서 분리해 둔 것), `adminApi.listLetters/getLetter/updateLetter/deleteLetter`
- Produces: `/letters`, `/letters/edit?id=`

`PostForm` 은 `CmsPostInput` 을 받는다. 레터는 `channels` / `publish_date` / `editor_id`
선택이 필요 없으므로, **`PostForm` 에 `mode?: "post" | "letter"` prop 을 더해 레터 모드에서는
메타 카드(채널·발행일·에디터)를 숨긴다.** 폼 본체(제목·부제·본문·핵심정리·키워드·닫는 줄)는
공유한다.

- [ ] **Step 1: 타입·클라이언트 추가** — `types.ts` 말미:

```typescript
export interface AiLetter {
  id: string;
  letter_date: string;
  editor_id: string;
  mbti_group: MbtiGroup;
  headline: string;
  subtitle: string | null;
  closing_line: string | null;
  body_inline: { body?: string[]; key_points?: string[] };
  keywords: CmsKeyword[];
  mode: string;
  created_at: string;
}

/** 레터 수정 payload — 정체성 필드(editor_id·mbti_group·letter_date)는 없다. */
export interface AiLetterInput {
  headline?: string;
  subtitle?: string | null;
  closing_line?: string | null;
  body_inline?: { body: string[]; key_points: string[] };
  keywords?: CmsKeyword[];
}
```

`adminClient.ts` 의 `deletePost` 다음:

```typescript
  // AI letters
  listLetters: (date: string) =>
    request<{ letters: AiLetter[] }>(`/admin/letters?date=${encodeURIComponent(date)}`),
  getLetter: (id: string) =>
    request<{ letter: AiLetter }>(`/admin/letters/${encodeURIComponent(id)}`),
  updateLetter: (id: string, input: AiLetterInput) =>
    request<{ letter: AiLetter }>(`/admin/letters/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  deleteLetter: (id: string) =>
    request<{ ok: boolean }>(`/admin/letters/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
```

import 블록에 `AiLetter`, `AiLetterInput` 추가.

- [ ] **Step 2: `PostForm` 에 레터 모드 추가** — props 에 `mode` 를 더하고 메타 카드를 감싼다:

```tsx
interface Props {
  value: CmsPostInput;
  onChange: (v: CmsPostInput) => void;
  /** "letter" 면 채널·발행일·에디터 선택을 숨긴다 (AI 레터는 그 값들이 고정). */
  mode?: "post" | "letter";
}

export function PostForm({ value, onChange, mode = "post" }: Props) {
```

그리고 메타 카드(`<div className="glass-panel rounded-2xl p-5 space-y-4">` 로 시작해
채널 선택으로 끝나는 첫 번째 블록)를 아래처럼 감싼다:

```tsx
      {mode === "post" ? (
        <div className="glass-panel rounded-2xl p-5 space-y-4">
          {/* 기존 제목·부제·발행일·에디터·채널 그대로 */}
        </div>
      ) : (
        <div className="glass-panel rounded-2xl p-5 space-y-4">
          <div>
            <label className={LABEL}>제목 *</label>
            <input
              value={value.headline ?? ""}
              onChange={(e) => patch({ headline: e.target.value })}
              className="glass-input w-full rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className={LABEL}>부제</label>
            <input
              value={value.subtitle ?? ""}
              onChange={(e) => patch({ subtitle: e.target.value })}
              className="glass-input w-full rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>
      )}
```

- [ ] **Step 3: 목록 화면** — `admin/src/app/(authenticated)/letters/page.tsx`.
날짜 선택 + 4개 그룹 카드. effect 본문에서 **동기 setState 금지** (2단계 교훈):

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { adminApi } from "@/lib/adminClient";
import type { AiLetter } from "@/lib/types";

function todayKST(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + (now.getTimezoneOffset() + 540) * 60000);
  return `${kst.getFullYear()}-${String(kst.getMonth() + 1).padStart(2, "0")}-${String(
    kst.getDate()
  ).padStart(2, "0")}`;
}

export default function LettersPage() {
  const [date, setDate] = useState(todayKST());
  const [letters, setLetters] = useState<AiLetter[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    adminApi
      .listLetters(date)
      .then((r) => {
        if (cancelled) return;
        setLetters(r.letters);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError((err as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [date]);

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">AI 레터</h1>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="glass-input rounded-lg px-3 py-2 text-sm"
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {!letters && !error && <p className="text-sm text-slate-600">로드 중...</p>}

      {letters && letters.length === 0 && (
        <div className="glass-panel rounded-2xl px-6 py-16 text-center">
          <p className="text-sm text-slate-600">
            이 날짜에 발행된 AI 레터가 없습니다.
          </p>
        </div>
      )}

      {letters && letters.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {letters.map((l) => (
            <Link
              key={l.id}
              href={`/letters/edit?id=${encodeURIComponent(l.id)}`}
              className="glass-panel rounded-2xl p-4 hover:bg-white/60 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="rounded bg-slate-900 px-2 py-0.5 text-xs font-semibold text-white">
                  {l.mbti_group}
                </span>
                <span className="text-xs text-slate-600">{l.editor_id}</span>
              </div>
              <p className="mt-2 font-semibold text-slate-900 leading-snug">
                {l.headline}
              </p>
              {l.subtitle && (
                <p className="mt-1 text-xs text-slate-600 leading-5">{l.subtitle}</p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: 편집 화면** — `admin/src/app/(authenticated)/letters/edit/page.tsx`.
2단계 `posts/edit/page.tsx` 와 같은 뼈대(Suspense 래퍼 + 저장/삭제)에 `PostForm mode="letter"`.
발행/내리기 버튼은 없다 — AI 레터는 이미 발행 상태다.

```tsx
"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { adminApi } from "@/lib/adminClient";
import { useToast } from "@/components/Toast";
import { PostForm } from "@/components/PostForm";
import type { AiLetter, CmsPostInput } from "@/lib/types";

export default function LetterEditPageWrapper() {
  return (
    <Suspense
      fallback={
        <div className="space-y-3">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">AI 레터</h1>
          <p className="text-sm text-slate-600">로드 중...</p>
        </div>
      }
    >
      <LetterEditPage />
    </Suspense>
  );
}

function LetterEditPage() {
  const router = useRouter();
  const id = useSearchParams().get("id") ?? "";
  const toast = useToast();

  const [letter, setLetter] = useState<AiLetter | null>(null);
  const [draft, setDraft] = useState<CmsPostInput>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    adminApi
      .getLetter(id)
      .then(({ letter: l }) => {
        if (cancelled) return;
        setLetter(l);
        setDraft({
          headline: l.headline,
          subtitle: l.subtitle ?? "",
          closing_line: l.closing_line ?? "",
          body_inline: {
            body: l.body_inline?.body ?? [],
            key_points: l.body_inline?.key_points ?? [],
            keywords: l.keywords ?? [],
            images: [],
          },
        });
      })
      .catch((err) => {
        if (!cancelled) setError((err as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const save = async () => {
    if (!(draft.headline ?? "").trim()) {
      toast.show("제목을 입력하세요", "error");
      return;
    }
    setBusy(true);
    try {
      const b = draft.body_inline;
      const { letter: l } = await adminApi.updateLetter(id, {
        headline: draft.headline,
        subtitle: draft.subtitle,
        closing_line: draft.closing_line,
        body_inline: { body: b?.body ?? [], key_points: b?.key_points ?? [] },
        keywords: b?.keywords ?? [],
      });
      setLetter(l);
      toast.show("저장했습니다", "success");
    } catch (err) {
      toast.show((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await adminApi.deleteLetter(id);
      toast.show("내렸습니다", "success");
      router.push("/letters");
    } catch (err) {
      toast.show((err as Error).message, "error");
      setBusy(false);
    }
  };

  if (error) {
    return (
      <div className="space-y-3">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">AI 레터</h1>
        <p className="text-sm text-red-600">{error}</p>
        <Link href="/letters" className="text-sm text-blue-700 hover:underline">
          ← 목록
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <div>
          <Link href="/letters" className="text-sm text-slate-600 hover:text-slate-900">
            ← 목록
          </Link>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 mt-1">
            AI 레터 수정
          </h1>
          {letter && (
            <p className="mt-1 text-xs text-slate-500">
              {letter.letter_date} · {letter.mbti_group} · {letter.editor_id}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={save}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
          >
            저장
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={remove}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 ring-1 ring-slate-300 hover:text-red-600 hover:ring-red-300 disabled:opacity-50"
          >
            내리기
          </button>
        </div>
      </div>

      <PostForm value={draft} onChange={setDraft} mode="letter" />
    </div>
  );
}
```

- [ ] **Step 5: Nav 추가** — `{ href: "/posts", label: "콘텐츠" },` 다음:

```tsx
  { href: "/letters", label: "AI 레터" },
```

- [ ] **Step 6: 게이트**

Run: `cd admin && npx tsc --noEmit && npm run lint && npm run build`
Expected: 타입 0, lint 기준선 1건 유지, 빌드 성공 (라우트 10 → 12)

- [ ] **Step 7: Commit**

```bash
git add admin/src/lib/types.ts admin/src/lib/adminClient.ts \
        admin/src/components/PostForm.tsx admin/src/components/Nav.tsx \
        'admin/src/app/(authenticated)/letters'
git commit -m "feat(admin): AI 레터 편집 화면 — PostForm 재사용(letter 모드)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## 3B — 이미지 업로드

### Task 4: 미디어 버킷 + presign API

**Files:**
- Create: `service/backend/admin/routes/media.py`
- Create: `service/backend/admin/tests/test_media.py`
- Modify: `service/backend/admin/handler.py` (HANDLERS 1줄)

**Interfaces:**
- Produces: `POST /admin/media/presign`
  - 요청 `{filename, content_type, size}`
  - 응답 `{upload_url, public_url, key, expires_in}`

**제약**: content-type 은 이미지만, 크기 상한 10MB. presigned PUT 은 5분 만료.

- [ ] **Step 1: [게이트] S3 버킷 생성**

```bash
BUCKET=sedaily-mbti-cms-media-dev
aws s3api create-bucket --bucket $BUCKET --region us-east-1
aws s3api put-public-access-block --bucket $BUCKET \
  --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=false,RestrictPublicBuckets=false
aws s3api put-bucket-policy --bucket $BUCKET --policy '{
  "Version":"2012-10-17",
  "Statement":[{"Sid":"PublicReadMedia","Effect":"Allow","Principal":"*",
    "Action":"s3:GetObject","Resource":"arn:aws:s3:::sedaily-mbti-cms-media-dev/media/*"}]
}'
aws s3api put-bucket-cors --bucket $BUCKET --cors-configuration '{
  "CORSRules":[{"AllowedOrigins":["https://mbti-admin.sedaily.ai","https://ailens-cms.sedaily.ai"],
    "AllowedMethods":["PUT"],"AllowedHeaders":["*"],"MaxAgeSeconds":3000}]
}'
```

**CORS 가 필수인 이유**: 브라우저가 admin 도메인에서 S3 로 직접 PUT 하므로, 버킷이
그 오리진을 허용해야 한다. 빠뜨리면 업로드가 CORS 에러로 실패한다.

**`media/` prefix 만 public read** 로 여는 이유: 버킷 전체를 열지 않기 위해서다.

Expected: 버킷 생성 + 정책 3건 적용. **버킷명 기록.**

- [ ] **Step 2: Lambda 에 버킷명 env 추가 + S3 쓰기 권한**

```bash
DST=$(aws lambda get-function-configuration --function-name sedaily-mbti-admin-api-dev \
  --region us-east-1 --query 'Environment.Variables' --output json)
MERGED=$(python3 -c "
import json,sys
d=json.loads(sys.argv[1]); d['CMS_MEDIA_BUCKET']='sedaily-mbti-cms-media-dev'
print(json.dumps({'Variables':d}))" "$DST")
aws lambda update-function-configuration --function-name sedaily-mbti-admin-api-dev \
  --region us-east-1 --environment "$MERGED" --query 'LastUpdateStatus' --output text
aws iam put-role-policy --role-name sedaily-mbti-admin-api-dev-role \
  --policy-name CmsMediaWrite --policy-document '{
    "Version":"2012-10-17",
    "Statement":[{"Effect":"Allow","Action":["s3:PutObject"],
      "Resource":"arn:aws:s3:::sedaily-mbti-cms-media-dev/media/*"}]}'
```

- [ ] **Step 3: 실패하는 테스트 작성** — `admin/tests/test_media.py`:

```python
"""presign 라우트 유닛 테스트 — boto3 를 fake 로 대체.

Run from service/backend/::

    python3 -m pytest admin/tests/test_media.py -v
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from routes import media


def _install(monkeypatch, url: str = "https://s3.example/put") -> dict:
    seen: dict = {}

    class _FakeS3:
        def generate_presigned_url(self, op, Params, ExpiresIn):  # noqa: N803
            seen.update(op=op, params=Params, expires=ExpiresIn)
            return url

    monkeypatch.setattr(media, "_s3", lambda: _FakeS3())
    monkeypatch.setattr(media, "_bucket", lambda: "test-bucket")
    return seen


def test_rejects_non_image(monkeypatch) -> None:
    _install(monkeypatch)
    resp = media.handle_presign(
        {"filename": "a.pdf", "content_type": "application/pdf", "size": 100}, {}, {}
    )
    assert resp["statusCode"] == 400
    assert "image" in json.loads(resp["body"])["message"]


def test_rejects_oversize(monkeypatch) -> None:
    _install(monkeypatch)
    resp = media.handle_presign(
        {"filename": "a.jpg", "content_type": "image/jpeg", "size": 20 * 1024 * 1024}, {}, {}
    )
    assert resp["statusCode"] == 400


def test_requires_filename(monkeypatch) -> None:
    _install(monkeypatch)
    resp = media.handle_presign({"content_type": "image/jpeg", "size": 10}, {}, {})
    assert resp["statusCode"] == 400


def test_returns_upload_and_public_url(monkeypatch) -> None:
    seen = _install(monkeypatch)
    resp = media.handle_presign(
        {"filename": "사진 1.JPG", "content_type": "image/jpeg", "size": 1024}, {}, {}
    )
    assert resp["statusCode"] == 200
    d = json.loads(resp["body"])
    assert d["upload_url"] == "https://s3.example/put"
    assert d["key"].startswith("media/")
    assert d["public_url"].endswith(d["key"])
    # 파일명은 정규화되어 공백·대문자가 사라진다.
    assert " " not in d["key"]
    assert seen["expires"] == 300
    assert seen["params"]["ContentType"] == "image/jpeg"
```

- [ ] **Step 4: 실패 확인**

Run: `cd service/backend && python3 -m pytest admin/tests/test_media.py -v`
Expected: **FAIL** — `ImportError: cannot import name 'media'`

- [ ] **Step 5: 구현** — `admin/routes/media.py`:

```python
"""이미지 업로드용 presigned PUT 발급 (CMS spec §5.3).

브라우저가 S3 로 직접 올린다 — Lambda 를 경유하면 API Gateway 페이로드 한계(6MB)에
이미지 한 장에 막힌다.
"""
from __future__ import annotations

import logging
import os
import re
import time
import uuid

import boto3

from shared import response

logger = logging.getLogger(__name__)

_ALLOWED = {"image/jpeg", "image/png", "image/webp", "image/gif"}
_MAX_BYTES = 10 * 1024 * 1024
_EXPIRES = 300
_SAFE = re.compile(r"[^a-z0-9.]+")

_client = None


def _s3():
    global _client
    if _client is None:
        _client = boto3.client("s3", region_name="us-east-1")
    return _client


def _bucket() -> str:
    return os.environ.get("CMS_MEDIA_BUCKET", "")


def _safe_name(filename: str) -> str:
    """공백·한글·대문자를 지운 소문자 파일명. 앞에 uuid 를 붙여 충돌을 없앤다."""
    base = _SAFE.sub("-", (filename or "img").lower()).strip("-") or "img"
    return f"{uuid.uuid4().hex[:12]}-{base[-60:]}"


def handle_presign(body: dict, path_params: dict, query_params: dict) -> dict:
    filename = (body.get("filename") or "").strip()
    content_type = (body.get("content_type") or "").strip()
    size = body.get("size") or 0

    if not filename:
        return response.err("filename is required", 400)
    if content_type not in _ALLOWED:
        return response.err(
            f"unsupported content_type: {content_type} (image/* only)", 400
        )
    try:
        size = int(size)
    except (TypeError, ValueError):
        return response.err("size must be a number", 400)
    if size <= 0 or size > _MAX_BYTES:
        return response.err(f"size must be 1..{_MAX_BYTES} bytes", 400)

    bucket = _bucket()
    if not bucket:
        return response.err("CMS_MEDIA_BUCKET not configured", 500)

    key = f"media/{time.strftime('%Y/%m')}/{_safe_name(filename)}"
    upload_url = _s3().generate_presigned_url(
        "put_object",
        Params={"Bucket": bucket, "Key": key, "ContentType": content_type},
        ExpiresIn=_EXPIRES,
    )
    logger.info(f"presign issued: {key}")
    return response.ok({
        "upload_url": upload_url,
        "public_url": f"https://{bucket}.s3.us-east-1.amazonaws.com/{key}",
        "key": key,
        "expires_in": _EXPIRES,
    })
```

- [ ] **Step 6: `handler.py` 등록** — import 에 `media` 추가, HANDLERS 에:

```python
    "POST /admin/media/presign": (media.handle_presign, True),
```

- [ ] **Step 7: 통과 확인 + 배포 + 라우트**

```bash
cd service/backend && python3 -m pytest admin/tests/ -q
./admin/deploy-admin-api.sh
aws apigatewayv2 create-route --api-id chzwwtjtgk \
  --route-key 'POST /admin/media/presign' \
  --target "integrations/$(aws apigatewayv2 get-routes --api-id chzwwtjtgk --region us-east-1 \
    --max-results 500 --query "Items[?RouteKey=='GET /admin/cost'].Target" --output text | cut -d/ -f2)" \
  --region us-east-1 --query RouteId --output text
```

Expected: 테스트 35건 통과, RouteId 출력

- [ ] **Step 8: Commit**

```bash
git add service/backend/admin/routes/media.py service/backend/admin/handler.py \
        service/backend/admin/tests/test_media.py
git commit -m "feat(cms): 이미지 업로드용 presigned PUT 발급 API

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 5: 업로드 위젯 + 폼 연결

**Files:**
- Create: `admin/src/components/ImageUploader.tsx`
- Modify: `admin/src/lib/types.ts` · `admin/src/lib/adminClient.ts` · `admin/src/components/PostForm.tsx`

**Interfaces:**
- Consumes: `adminApi.presignMedia`
- Produces: `<ImageUploader images onChange />` — `PostForm` 의 본문 카드 안에 배치

- [ ] **Step 1: 클라이언트 추가** — `types.ts`:

```typescript
export interface PresignResponse {
  upload_url: string;
  public_url: string;
  key: string;
  expires_in: number;
}
```

`adminClient.ts` 의 `deleteLetter` 다음:

```typescript
  // Media
  presignMedia: (filename: string, contentType: string, size: number) =>
    request<PresignResponse>("/admin/media/presign", {
      method: "POST",
      body: JSON.stringify({ filename, content_type: contentType, size }),
    }),
```

- [ ] **Step 2: `ImageUploader.tsx` 작성**

```tsx
"use client";

import { useState } from "react";
import { adminApi } from "@/lib/adminClient";
import type { CmsImage } from "@/lib/types";

interface Props {
  images: CmsImage[];
  onChange: (next: CmsImage[]) => void;
}

export function ImageUploader({ images, onChange }: Props) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const upload = async (file: File) => {
    setBusy(true);
    setErr(null);
    try {
      const { upload_url, public_url } = await adminApi.presignMedia(
        file.name,
        file.type,
        file.size
      );
      // presigned PUT — Lambda 를 거치지 않고 브라우저가 S3 로 직접 올린다.
      const res = await fetch(upload_url, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!res.ok) throw new Error(`S3 업로드 실패 (${res.status})`);
      onChange([...images, { url: public_url }]);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
        본문 이미지
        <span className="ml-2 font-normal text-slate-500">jpg·png·webp·gif, 10MB 이하</span>
      </label>

      <div className="space-y-2">
        {images.map((img, i) => (
          <div key={i} className="flex items-center gap-3">
            {/* 외부 S3 이미지 — 정적 export 라 next/image 대신 원본 사용 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={img.url}
              alt=""
              className="h-14 w-20 rounded object-cover ring-1 ring-slate-200"
            />
            <input
              value={img.caption ?? ""}
              placeholder="캡션 (선택)"
              onChange={(e) =>
                onChange(
                  images.map((x, idx) =>
                    idx === i ? { ...x, caption: e.target.value } : x
                  )
                )
              }
              className="glass-input flex-1 rounded-lg px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => onChange(images.filter((_, idx) => idx !== i))}
              className="text-xs px-2 text-slate-500 hover:text-red-600"
              aria-label="삭제"
            >
              ×
            </button>
          </div>
        ))}

        <label className="inline-block cursor-pointer text-xs font-medium text-blue-700 hover:text-blue-900">
          {busy ? "업로드 중..." : "+ 이미지 올리기"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            disabled={busy}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void upload(f);
            }}
          />
        </label>
        {err && <p className="text-xs text-red-600">{err}</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: `PostForm` 에 연결** — import 추가 후, 본문 카드의 "닫는 줄" 바로 앞에:

```tsx
        <ImageUploader
          images={body.images}
          onChange={(v) => patchBody({ images: v })}
        />
```

- [ ] **Step 4: 게이트**

Run: `cd admin && npx tsc --noEmit && npm run lint && npm run build`
Expected: 타입 0, lint 기준선 유지, 빌드 성공

- [ ] **Step 5: Commit**

```bash
git add admin/src/components/ImageUploader.tsx admin/src/components/PostForm.tsx \
        admin/src/lib/types.ts admin/src/lib/adminClient.ts
git commit -m "feat(admin): 이미지 업로드 위젯 — presigned PUT 직접 업로드

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 6: 배포 + 엔드투엔드 확인

- [ ] **Step 1: admin 프론트 배포 (env 게이트 필수)**

```bash
cd admin
[ -f .env.local ] || { echo "❌ .env.local 없음 — 빌드 중단"; exit 1; }
npm run build
grep -rq "chzwwtjtgk" out/ || { echo "❌ API 주소 미주입 — 배포 중단"; exit 1; }
./deploy-admin.sh
```

- [ ] **Step 2: 레터 편집 스모크**

어제 날짜로 레터를 조회해 하나를 수정하고, 사용자 API 에 반영되는지 본다.

```bash
B=https://chzwwtjtgk.execute-api.us-east-1.amazonaws.com/dev
D=$(TZ=Asia/Seoul date -v-1d +%Y-%m-%d)
# (JWT 는 검증용으로 발급 — 값 비노출)
curl -s -H "Authorization: Bearer $TOKEN" "$B/admin/letters?date=$D" \
  | python3 -c "import json,sys; L=json.load(sys.stdin)['letters']; print(len(L), [x['mbti_group'] for x in L])"
```

Expected: 그 날짜의 레터 건수와 그룹 목록. 수정 후 `today-letters` 응답의 headline 이
바뀌어야 한다.

- [ ] **Step 3: 이미지 업로드 스모크**

presign 을 받아 실제로 PUT 하고 public_url 이 200 인지 확인한다.

```bash
RESP=$(curl -s -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"filename":"test.png","content_type":"image/png","size":70}' "$B/admin/media/presign")
UP=$(echo "$RESP" | python3 -c "import json,sys; print(json.load(sys.stdin)['upload_url'])")
PUB=$(echo "$RESP" | python3 -c "import json,sys; print(json.load(sys.stdin)['public_url'])")
printf '\x89PNG\r\n\x1a\n' > /tmp/t.png
curl -s -o /dev/null -w 'PUT → %{http_code}\n' -X PUT -H 'Content-Type: image/png' \
  --data-binary @/tmp/t.png "$UP"
curl -s -o /dev/null -w 'GET → %{http_code}\n' "$PUB"
rm -f /tmp/t.png
```

Expected: PUT 200, GET 200

- [ ] **Step 4: 회귀 확인**

```bash
for p in "/api/v2/today-letters" "/api/v2/front-page" "/api/v2/posts?channel=letters"; do
  curl -s -o /dev/null -w "$p → %{http_code}\n" "$B$p"
done
curl -s -o /dev/null -w 'admin 사이트 → %{http_code}\n' https://mbti-admin.sedaily.ai/letters
```

Expected: 전부 200

---

## 실행 순서 요약

3A(Task 1→2→3) 와 3B(Task 4→5) 는 독립적이다. Task 6 은 둘 다 끝난 뒤.

Task 1 Step 5(읽기 경로 회귀)와 Task 6 Step 4 가 이 계획의 안전 게이트다.

## 비범위

CloudFront `/media/*` behavior 는 이번에 넣지 않는다. 스펙 §5.3 은 기존 프론트
배포(`E1QS7PY350VHF6`)에 behavior 를 추가하는 안이었으나, **프로덕션 배포 설정을
바꾸는 변경이라 사용자 사이트 전체를 위험에 빠뜨린다.** 이미지 수가 적은 초기에는 S3
직접 서빙으로 충분하고, 트래픽이 늘면 그때 별도 배포를 붙이면 된다 (저장된 URL 이
바뀌므로 그 시점에 마이그레이션 필요 — 알려진 한계로 기록).
