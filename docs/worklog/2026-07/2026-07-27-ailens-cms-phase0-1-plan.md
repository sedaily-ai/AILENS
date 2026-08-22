# AI LENS CMS — 0·1단계 (백엔드 기반 + 데이터/API) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자 Lambda 가 pgvector 에 접근할 수 있게 만들고, `cms_posts` 테이블과 CRUD API,
그리고 사용자 화면용 공개 조회 API 를 세운다. 이 계획이 끝나면 curl 로 글을 만들고·발행하고·
공개 API 로 읽어올 수 있다.

**Architecture:** 기존 `sedaily-mbti-admin-api-dev` Lambda 에 얇은 pg8000 클라이언트와 posts
라우트를 더한다. 사용자 화면용 읽기는 인증이 걸린 admin Lambda 에 둘 수 없으므로 공개 전용
Lambda `sedaily-mbti-v2-posts-dev` 를 새로 만든다. 기존 읽기 경로(`today-letters`/`front-page`/
`feed`)와 기존 admin 12개 라우트는 건드리지 않는다.

**Tech Stack:** Python 3.11 Lambda, pg8000 1.31.2 (순수 파이썬), pgvector(RDS), API Gateway
HTTP API `chzwwtjtgk`.

스펙: [`docs/superpowers/specs/2026-07-27-ailens-cms-design.md`](../specs/2026-07-27-ailens-cms-design.md)

## Global Constraints

- 커밋 트레일러는 **정확히** `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>` — 모델 접미사 금지.
- **0단계는 기존 6개 라우트의 동작을 바꾸지 않는다.** 포장·배포·연결만 정리한다.
- AWS: **Lambda 생성과 IAM 변경, VPC 연결, 시크릿 env 쓰기는 수동(사용자 확인 게이트)**.
  기존 함수 `update-function-code` 만 자동 허용. 이상 발생 시 즉시 중단 + 생성 ID 기록.
- `PG_V2_PASSWORD` 등 시크릿 **값**을 로그·문서·채팅에 출력 금지 (env 복제는 JSON 변수로 전달만).
- 신규 파이썬 파일은 pytest 동반. 실행: `cd service/backend && python3 -m pytest admin/tests/<file> -v`.
- admin Lambda 의 import 규약은 **flat 유지** (`import auth` / `from shared import …`).
  Handler 는 `handler.lambda_handler` 그대로 — 바꾸지 않는다.
- 실측 확정값 (2026-07-27):
  - admin Lambda `sedaily-mbti-admin-api-dev` · role `sedaily-mbti-admin-api-dev-role`
  - VPC `vpc-07a3a75110d6594aa` · 서브넷 `subnet-0430a7468d7d796e9`,`subnet-0b9783a637589c096` · SG `sg-0cddc39619b1d69d9`
  - 두 서브넷 → `rtb-0237950d5ef4ca8d8` → NAT `nat-0665bd606c707c846` (외부 호출 유지됨)
  - API Gateway HTTP API id `chzwwtjtgk`, 계정 `887078546492`, 리전 `us-east-1`

## File Structure

| 파일 | 책임 |
|---|---|
| `service/backend/admin/shared/pg_client.py` | pg8000 연결 + `run()` 헬퍼. 이 파일만 DB 커넥션을 안다 |
| `service/backend/admin/shared/slug.py` | headline → slug 변환. 순수 함수, DB 모름 |
| `service/backend/admin/routes/posts.py` | posts CRUD 라우트 핸들러. SQL 은 `posts_repo` 에 위임 |
| `service/backend/admin/repo/posts_repo.py` | `cms_posts` SQL 전담. 라우트는 SQL 을 모른다 |
| `service/backend/admin/deploy-admin-api.sh` | admin Lambda 배포 (현재 저장소에 없음) |
| `service/backend/v2/infrastructure/cms_posts_schema.sql` | `cms_posts` DDL |
| `service/backend/v2/handlers/cms_posts_public.py` | 공개 조회 Lambda 핸들러 + 채널별 shaping |
| `service/backend/admin/tests/` | pytest (fake conn — DB 불필요) |

`routes/` 는 HTTP 를, `repo/` 는 SQL 을, `shared/` 는 연결과 순수 유틸을 맡는다. 이 경계 덕분에
라우트 테스트가 DB 없이 fake repo 로 돌아간다.

---

### Task 1: pg8000 클라이언트 + slug 유틸 + 배포 스크립트

**Files:**
- Create: `service/backend/admin/shared/pg_client.py`
- Create: `service/backend/admin/shared/slug.py`
- Create: `service/backend/admin/tests/__init__.py` (빈 파일)
- Create: `service/backend/admin/tests/test_slug.py`
- Create: `service/backend/admin/deploy-admin-api.sh`
- Modify: `service/backend/admin/requirements.txt`

**Interfaces:**
- Produces (Task 3·4 가 사용):
  - `pg_client.get_conn() -> pg8000.native.Connection` — 컨테이너 재사용 캐시
  - `pg_client.run(sql: str, **params) -> list[list]` — 조회/실행 공통
  - `pg_client.close() -> None`
  - `slug.slugify(publish_date: str, headline: str) -> str` — `'2026-07-27-제목'`

- [ ] **Step 1: 실패하는 테스트 작성** — `service/backend/admin/tests/test_slug.py` 신규:

```python
"""slugify 유닛 테스트. DB·AWS 불필요.

Run from service/backend/::

    python3 -m pytest admin/tests/test_slug.py -v
"""
from __future__ import annotations

import sys
from pathlib import Path

# admin Lambda 는 zip 루트가 admin/ 이라 flat import 를 쓴다. 테스트도 같은 경로 규약을 맞춘다.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from shared.slug import slugify


def test_slugify_joins_date_and_headline() -> None:
    assert slugify("2026-07-27", "오늘의 소식") == "2026-07-27-오늘의-소식"


def test_slugify_replaces_special_chars_with_single_dash() -> None:
    assert slugify("2026-07-27", "AI, 그리고  미래!") == "2026-07-27-AI-그리고-미래"


def test_slugify_strips_trailing_dash() -> None:
    assert slugify("2026-07-27", "제목???") == "2026-07-27-제목"


def test_slugify_truncates_to_80_chars() -> None:
    out = slugify("2026-07-27", "가" * 200)
    assert len(out) == 80
    assert not out.endswith("-")


def test_slugify_handles_empty_headline() -> None:
    assert slugify("2026-07-27", "   ") == "2026-07-27"
```

- [ ] **Step 2: 실패 확인**

Run: `cd service/backend && python3 -m pytest admin/tests/test_slug.py -v`
Expected: **FAIL** — `ModuleNotFoundError: No module named 'shared.slug'`

- [ ] **Step 3: `slug.py` 구현** — `service/backend/admin/shared/slug.py` 신규:

```python
"""headline → URL slug 변환 (CMS spec §5.1.2).

한글은 그대로 둔다 (URL 인코딩은 브라우저가 처리). 공백·특수문자만 '-' 로 접는다.
중복 처리(-2, -3)는 DB 를 봐야 하므로 repo 계층 담당 — 이 파일은 순수 함수다.
"""
from __future__ import annotations

import re

_MAX_LEN = 80
# 한글·영숫자만 남기고 나머지는 구분자로 취급.
_NON_SLUG = re.compile(r"[^0-9A-Za-z가-힣]+")


def slugify(publish_date: str, headline: str) -> str:
    """``'2026-07-27-오늘의-소식'`` 형태. 최대 80자, 끝의 '-' 는 제거."""
    tail = _NON_SLUG.sub("-", (headline or "").strip()).strip("-")
    base = f"{publish_date}-{tail}" if tail else publish_date
    return base[:_MAX_LEN].rstrip("-")
```

- [ ] **Step 4: 통과 확인**

Run: `cd service/backend && python3 -m pytest admin/tests/test_slug.py -v`
Expected: **PASS** 5건

- [ ] **Step 5: `pg_client.py` 구현** — `service/backend/admin/shared/pg_client.py` 신규:

```python
"""admin Lambda 용 얇은 pgvector 접근자.

v2 의 ``PgVectorV2Client`` 를 import 하지 않는 이유 (spec §5.0): 그러려면 admin 의 flat
import 패키징(Handler=handler.lambda_handler)을 통째로 바꿔야 하는데, 0단계 원칙인
"기존 라우트 동작 불변" 과 충돌한다. 여기서 필요한 건 연결과 run() 뿐이라 40줄이면 된다.

env: PG_V2_HOST / PG_V2_PORT / PG_V2_USER / PG_V2_PASSWORD / PG_V2_DATABASE
"""
from __future__ import annotations

import logging
import os
from typing import Any

import pg8000.native

logger = logging.getLogger(__name__)

_conn: pg8000.native.Connection | None = None


def _enabled() -> bool:
    return bool(os.environ.get("PG_V2_HOST") and os.environ.get("PG_V2_PASSWORD"))


def get_conn() -> pg8000.native.Connection:
    """Lambda 컨테이너 재사용을 위해 커넥션을 캐시한다."""
    global _conn
    if _conn is None:
        if not _enabled():
            raise RuntimeError("PG_V2_* env not configured")
        _conn = pg8000.native.Connection(
            host=os.environ["PG_V2_HOST"],
            port=int(os.environ.get("PG_V2_PORT", "5432")),
            user=os.environ["PG_V2_USER"],
            password=os.environ["PG_V2_PASSWORD"],
            database=os.environ.get("PG_V2_DATABASE", "postgres"),
            timeout=10,
        )
    return _conn


def run(sql: str, **params: Any) -> list[list]:
    """``:name`` 플레이스홀더 + kwargs. 커넥션이 끊겼으면 1회 재연결 후 재시도."""
    global _conn
    try:
        return get_conn().run(sql, **params)
    except Exception as exc:
        logger.warning(f"pg run failed, reconnecting once: {type(exc).__name__}")
        close()
        return get_conn().run(sql, **params)


def close() -> None:
    global _conn
    if _conn is not None:
        try:
            _conn.close()
        except Exception:
            pass
        _conn = None
```

- [ ] **Step 6: `requirements.txt` 갱신** — `service/backend/admin/requirements.txt` 를 아래로 교체:

```
argon2-cffi==25.1.0
PyJWT==2.12.1

# pgvector 접근 (CMS, 2026-07-27). 순수 파이썬이라 Lambda 친화적 — v2 와 동일 핀.
pg8000==1.31.2
```

- [ ] **Step 7: 배포 스크립트 작성** — `service/backend/admin/deploy-admin-api.sh` 신규.
저장소에 admin **백엔드** 배포 방법이 없었다 (`admin/deploy-admin.sh` 는 프런트엔드용):

```bash
#!/bin/bash
# Deploy script for the AI LENS admin API Lambda (sedaily-mbti-admin-api-dev).
#
# admin 은 flat import 규약을 쓴다 (Handler=handler.lambda_handler). 따라서 zip 루트가
# admin/ 디렉터리 내용 그 자체여야 한다 — v1/v2 소스를 섞지 않는다.
#
# .clauderules 준수: 이 스크립트는 함수/역할/라우트/env 를 만들지 않는다.
# update-function-code 만 수행한다.
#
# Run from service/backend/:
#   ./admin/deploy-admin-api.sh

set -e

FUNCTION_NAME="sedaily-mbti-admin-api-dev"
BUILD_DIR="lambda-build-admin"
PACKAGE_FILE="lambda_package_admin.zip"
S3_BUCKET="sedaily-mbti-lambda-packages-dev"
S3_KEY="lambda_package_admin.zip"
AWS_REGION="us-east-1"

echo "[1/4] Building package..."
rm -rf "$BUILD_DIR" "$PACKAGE_FILE"
mkdir -p "$BUILD_DIR"

# 런타임 소스만 (tests 제외).
cp -r admin/handler.py admin/auth.py admin/__init__.py "$BUILD_DIR/"
cp -r admin/routes admin/shared "$BUILD_DIR/"
[ -d admin/repo ] && cp -r admin/repo "$BUILD_DIR/"

python3 -m pip install -q -r admin/requirements.txt -t "$BUILD_DIR" \
  --platform manylinux2014_x86_64 --only-binary=:all: --upgrade

find "$BUILD_DIR" -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true
find "$BUILD_DIR" -name "*.pyc" -delete 2>/dev/null || true

echo "[2/4] Zipping..."
(cd "$BUILD_DIR" && zip -r "../$PACKAGE_FILE" . -q)
echo "  [OK] $(du -h "$PACKAGE_FILE" | cut -f1)"

echo "[3/4] Uploading to S3..."
aws s3 cp "$PACKAGE_FILE" "s3://$S3_BUCKET/$S3_KEY" --region "$AWS_REGION" --quiet
echo "  [OK] s3://$S3_BUCKET/$S3_KEY"

echo "[4/4] Updating function code..."
if aws lambda update-function-code \
  --function-name "$FUNCTION_NAME" \
  --s3-bucket "$S3_BUCKET" \
  --s3-key "$S3_KEY" \
  --region "$AWS_REGION" \
  --query 'LastUpdateStatus' --output text >/dev/null 2>&1; then
  echo "  [OK] $FUNCTION_NAME updated"
else
  echo "  [FAIL] update-function-code failed — check AWS credentials and function name"
  exit 1
fi

rm -rf "$BUILD_DIR" "$PACKAGE_FILE"
echo "Done."
```

- [ ] **Step 8: 스크립트 실행 권한 + 문법 검증**

Run: `chmod +x service/backend/admin/deploy-admin-api.sh && bash -n service/backend/admin/deploy-admin-api.sh && echo SYNTAX_OK`
Expected: `SYNTAX_OK`

- [ ] **Step 9: 전체 테스트 통과 확인**

Run: `cd service/backend && python3 -m pytest admin/tests/ -v`
Expected: **PASS** 5건

- [ ] **Step 10: Commit**

```bash
git add service/backend/admin/shared/pg_client.py service/backend/admin/shared/slug.py \
        service/backend/admin/tests/ service/backend/admin/deploy-admin-api.sh \
        service/backend/admin/requirements.txt
git commit -m "feat(admin): pgvector 접근자·slug 유틸·백엔드 배포 스크립트 추가

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 2: admin Lambda 를 VPC 에 연결 (운영 — 사용자 확인 게이트)

**Files:** 없음 (AWS 구성 변경).

**모든 스텝은 실행 직전 커맨드를 사용자에게 보여주고 확인받은 뒤 실행한다. 이상 발생 시 즉시
중단하고 보고한다.**

**Interfaces:**
- Produces: `sedaily-mbti-admin-api-dev` 가 pgvector 에 접속 가능한 상태 (Task 3·4 의 전제)

- [ ] **Step 1: 현재 상태 기록 (롤백용)**

```bash
aws lambda get-function-configuration --function-name sedaily-mbti-admin-api-dev \
  --region us-east-1 --query '{Vpc:VpcConfig,Env:Environment.Variables}' --output json \
  > /tmp/admin-lambda-before.json
echo "saved: /tmp/admin-lambda-before.json"
```

Expected: `VpcConfig` 가 비어 있고 `PG_V2_*` 가 없는 상태가 기록됨. **이 파일을 롤백 기준으로 보관.**

- [ ] **Step 2: [게이트] IAM — VPC 접근 권한 부여**

VPC 연결에는 ENI 생성 권한이 필요하다. 빠뜨리면 함수가 초기화에서 실패한다.

```bash
aws iam attach-role-policy \
  --role-name sedaily-mbti-admin-api-dev-role \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole
aws iam list-attached-role-policies --role-name sedaily-mbti-admin-api-dev-role \
  --query 'AttachedPolicies[].PolicyName' --output text
```

Expected: `AWSLambdaBasicExecutionRole  AWSLambdaVPCAccessExecutionRole`

- [ ] **Step 3: [게이트] PG env 복제 (값 비노출)**

today-letters 의 PG 관련 env 만 뽑아 admin 의 기존 env 와 **병합**한다. 기존 키를 덮어쓰지 않는다.

```bash
SRC=$(aws lambda get-function-configuration \
  --function-name sedaily-mbti-v2-today-letters-dev --region us-east-1 \
  --query 'Environment.Variables' --output json)
DST=$(aws lambda get-function-configuration \
  --function-name sedaily-mbti-admin-api-dev --region us-east-1 \
  --query 'Environment.Variables' --output json)
MERGED=$(python3 -c "
import json,sys
src=json.loads(sys.argv[1]); dst=json.loads(sys.argv[2])
keys=['PG_V2_HOST','PG_V2_PORT','PG_V2_USER','PG_V2_PASSWORD','PG_V2_DATABASE']
dst.update({k:src[k] for k in keys if k in src})
print(json.dumps({'Variables':dst}))
" "$SRC" "$DST")
aws lambda update-function-configuration \
  --function-name sedaily-mbti-admin-api-dev --region us-east-1 \
  --environment "$MERGED" --query 'LastUpdateStatus' --output text
```

Expected: `InProgress`. **시크릿 값은 셸 변수로만 흐르고 출력되지 않는다.**

- [ ] **Step 4: [게이트] VPC 연결**

```bash
aws lambda wait function-updated --function-name sedaily-mbti-admin-api-dev --region us-east-1
aws lambda update-function-configuration \
  --function-name sedaily-mbti-admin-api-dev --region us-east-1 \
  --vpc-config SubnetIds=subnet-0430a7468d7d796e9,subnet-0b9783a637589c096,SecurityGroupIds=sg-0cddc39619b1d69d9 \
  --query 'LastUpdateStatus' --output text
aws lambda wait function-updated --function-name sedaily-mbti-admin-api-dev --region us-east-1
echo "vpc attached"
```

Expected: `InProgress` → wait 후 완료.

- [ ] **Step 5: 회귀 검증 — 기존 12개 라우트가 그대로인가**

VPC 연결로 외부 호출(SSM/DDB)이 끊기지 않았는지 확인한다. 이게 0단계의 핵심 게이트다.

```bash
B=https://chzwwtjtgk.execute-api.us-east-1.amazonaws.com/dev
for p in /admin/cost /admin/prompts /admin/drivers /admin/newsletter/stats /admin/audit; do
  printf '  GET %-28s → %s\n' "$p" "$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$B$p")"
done
printf '  POST %-27s → %s\n' /admin/login \
  "$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 -X POST \
     -H 'Content-Type: application/json' -d '{"password":"wrong"}' "$B/admin/login")"
```

Expected: 전부 **401** (VPC 연결 전과 동일). **하나라도 500/504 면 즉시 Step 6 롤백.**

`/admin/login` 이 504 면 SSM 접근이 막힌 것 — NAT 경로 문제이므로 중단하고 보고한다.

- [ ] **Step 6: (실패 시에만) 롤백**

```bash
aws lambda update-function-configuration \
  --function-name sedaily-mbti-admin-api-dev --region us-east-1 \
  --vpc-config SubnetIds=,SecurityGroupIds= \
  --query 'LastUpdateStatus' --output text
```

- [ ] **Step 7: 결과 기록** — 변경한 구성(역할 정책 ARN, 서브넷·SG, 추가한 env 키 이름)을
PR 본문에 적는다. **값은 적지 않는다.**

---

### Task 3: `cms_posts` 스키마 + repo 계층

**Files:**
- Create: `service/backend/v2/infrastructure/cms_posts_schema.sql`
- Create: `service/backend/admin/repo/__init__.py` (빈 파일)
- Create: `service/backend/admin/repo/posts_repo.py`
- Create: `service/backend/admin/tests/test_posts_repo.py`

**Interfaces:**
- Consumes: `shared.pg_client.run`, `shared.slug.slugify` (Task 1)
- Produces (Task 4·5 가 사용):
  - `posts_repo.create(data: dict, created_by: str) -> dict` — 생성된 row dict 반환
  - `posts_repo.get(post_id: str) -> dict | None`
  - `posts_repo.list_posts(status: str | None, channel: str | None, limit: int) -> list[dict]`
  - `posts_repo.update(post_id: str, data: dict) -> dict | None`
  - `posts_repo.set_status(post_id: str, status: str) -> dict | None`
  - `posts_repo.soft_delete(post_id: str) -> bool`
  - row dict 키: `id, slug, status, channels, publish_date, mbti_group, editor_id,
    headline, subtitle, closing_line, body_inline, cover_image_url, created_by,
    created_at, updated_at, published_at`

- [ ] **Step 1: DDL 작성** — `service/backend/v2/infrastructure/cms_posts_schema.sql` 신규:

```sql
-- cms_posts — 관리자가 직접 작성한 글 (CMS spec §5.1).
--
-- daily_letters 를 재사용하지 않는 이유:
--   article_id FK(원본 기사 필수) / UNIQUE(date, editor_id)(하루 1건) / mbti_group NOT NULL
--   세 제약이 모두 수동 글과 충돌한다. UNIQUE 는 Editor Pick 의 중복 삽입 방지 장치라
--   풀 수 없다.
--
-- 적용:
--   psql "postgresql://USER@HOST:5432/DB" -f v2/infrastructure/cms_posts_schema.sql

CREATE TABLE IF NOT EXISTS cms_posts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug            TEXT UNIQUE NOT NULL,
    status          TEXT NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft', 'published', 'archived')),
    channels        TEXT[] NOT NULL DEFAULT '{}',
    publish_date    DATE NOT NULL,
    mbti_group      CHAR(2) CHECK (mbti_group IS NULL
                                   OR mbti_group IN ('NT', 'NF', 'ST', 'SF')),
    editor_id       TEXT,
    headline        TEXT NOT NULL,
    subtitle        TEXT,
    closing_line    TEXT,
    body_inline     JSONB NOT NULL DEFAULT '{}'::jsonb,
    cover_image_url TEXT,
    created_by      TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at    TIMESTAMPTZ,
    deleted_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_cms_posts_pub
    ON cms_posts (publish_date DESC) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cms_posts_channels
    ON cms_posts USING GIN (channels);

CREATE INDEX IF NOT EXISTS idx_cms_posts_status
    ON cms_posts (status) WHERE deleted_at IS NULL;
```

- [ ] **Step 2: 실패하는 테스트 작성** — `service/backend/admin/tests/test_posts_repo.py` 신규:

```python
"""posts_repo 유닛 테스트 — pg_client.run 을 fake 로 대체해 DB 없이 돈다.

Run from service/backend/::

    python3 -m pytest admin/tests/test_posts_repo.py -v
"""
from __future__ import annotations

import datetime as _dt
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from repo import posts_repo


class _FakePg:
    """pg_client.run 흉내 — 호출 기록 + 미리 정한 rows 반환."""

    def __init__(self, rows_queue: list[list[list]]) -> None:
        self.rows_queue = list(rows_queue)
        self.calls: list[tuple[str, dict]] = []

    def run(self, sql: str, **params):
        self.calls.append((sql, params))
        return self.rows_queue.pop(0) if self.rows_queue else []


def _row(slug: str = "2026-07-27-제목", status: str = "draft") -> list:
    """SELECT 컬럼 순서와 1:1 (posts_repo._COLUMNS)."""
    now = _dt.datetime(2026, 7, 27, 9, 0, tzinfo=_dt.timezone.utc)
    return [
        "11111111-1111-1111-1111-111111111111",  # id
        slug, status, ["letters"],                # slug, status, channels
        _dt.date(2026, 7, 27),                    # publish_date
        "NF", "하은",                              # mbti_group, editor_id
        "제목", "부제", "닫는 줄",                  # headline, subtitle, closing_line
        {"body": ["문단1"], "key_points": [], "keywords": [], "images": []},
        "",                                       # cover_image_url
        "admin", now, now, None,                  # created_by, created_at, updated_at, published_at
    ]


def _install(monkeypatch, fake: _FakePg) -> None:
    monkeypatch.setattr(posts_repo.pg_client, "run", fake.run)


def test_create_generates_slug_and_returns_row(monkeypatch) -> None:
    fake = _FakePg([[], [_row()]])  # 1st: slug 중복 조회(없음), 2nd: INSERT RETURNING
    _install(monkeypatch, fake)
    out = posts_repo.create(
        {"publish_date": "2026-07-27", "headline": "제목", "channels": ["letters"]},
        created_by="admin",
    )
    assert out["slug"] == "2026-07-27-제목"
    assert out["status"] == "draft"
    assert out["channels"] == ["letters"]


def test_create_suffixes_slug_on_conflict(monkeypatch) -> None:
    # 1st 조회에서 기존 slug 2건 → -3 이 붙어야 한다.
    fake = _FakePg([[["2026-07-27-제목"], ["2026-07-27-제목-2"]], [_row(slug="2026-07-27-제목-3")]])
    _install(monkeypatch, fake)
    out = posts_repo.create(
        {"publish_date": "2026-07-27", "headline": "제목"}, created_by="admin"
    )
    assert out["slug"] == "2026-07-27-제목-3"


def test_get_returns_none_when_missing(monkeypatch) -> None:
    _install(monkeypatch, _FakePg([[]]))
    assert posts_repo.get("11111111-1111-1111-1111-111111111111") is None


def test_soft_delete_sets_deleted_at(monkeypatch) -> None:
    fake = _FakePg([[["11111111-1111-1111-1111-111111111111"]]])
    _install(monkeypatch, fake)
    assert posts_repo.soft_delete("11111111-1111-1111-1111-111111111111") is True
    sql, _ = fake.calls[0]
    assert "deleted_at" in sql and "UPDATE" in sql.upper()


def test_list_posts_filters_by_status_and_channel(monkeypatch) -> None:
    fake = _FakePg([[_row()]])
    _install(monkeypatch, fake)
    out = posts_repo.list_posts("draft", "letters", limit=20)
    assert len(out) == 1
    sql, params = fake.calls[0]
    assert "deleted_at IS NULL" in sql
    assert "ANY(channels)" in sql
    assert params["status"] == "draft" and params["channel"] == "letters"


def test_set_status_publish_stamps_published_at(monkeypatch) -> None:
    fake = _FakePg([[_row(status="published")]])
    _install(monkeypatch, fake)
    out = posts_repo.set_status("11111111-1111-1111-1111-111111111111", "published")
    assert out is not None and out["status"] == "published"
    sql, _ = fake.calls[0]
    assert "published_at" in sql
```

- [ ] **Step 3: 실패 확인**

Run: `cd service/backend && python3 -m pytest admin/tests/test_posts_repo.py -v`
Expected: **FAIL** — `ModuleNotFoundError: No module named 'repo'`

- [ ] **Step 4: `posts_repo.py` 구현** — `service/backend/admin/repo/posts_repo.py` 신규:

```python
"""cms_posts SQL 전담 (CMS spec §5.1).

라우트 계층은 SQL 을 모른다. 여기서만 테이블을 안다.
"""
from __future__ import annotations

import json
from typing import Any

from shared import pg_client
from shared.slug import slugify

# SELECT 컬럼 순서 — _to_dict 와 반드시 1:1 유지.
_COLUMNS = """id, slug, status, channels, publish_date, mbti_group, editor_id,
              headline, subtitle, closing_line, body_inline, cover_image_url,
              created_by, created_at, updated_at, published_at"""

_VALID_STATUS = ("draft", "published", "archived")


def _to_dict(r: list) -> dict:
    body = r[10]
    if isinstance(body, str):
        try:
            body = json.loads(body)
        except Exception:
            body = {}
    return {
        "id": str(r[0]),
        "slug": r[1],
        "status": r[2],
        "channels": list(r[3] or []),
        "publish_date": r[4].isoformat() if hasattr(r[4], "isoformat") else r[4],
        "mbti_group": r[5],
        "editor_id": r[6],
        "headline": r[7],
        "subtitle": r[8],
        "closing_line": r[9],
        "body_inline": body or {},
        "cover_image_url": r[11] or "",
        "created_by": r[12],
        "created_at": r[13].isoformat() if hasattr(r[13], "isoformat") else r[13],
        "updated_at": r[14].isoformat() if hasattr(r[14], "isoformat") else r[14],
        "published_at": r[15].isoformat() if hasattr(r[15], "isoformat") else r[15],
    }


def _unique_slug(publish_date: str, headline: str) -> str:
    """기존 slug 와 충돌하면 -2, -3 을 붙인다 (spec §5.1.2)."""
    base = slugify(publish_date, headline)
    rows = pg_client.run(
        "SELECT slug FROM cms_posts WHERE slug = :base OR slug LIKE :pat",
        base=base,
        pat=f"{base}-%",
    )
    existing = {r[0] for r in rows}
    if base not in existing:
        return base
    n = 2
    while f"{base}-{n}" in existing:
        n += 1
    return f"{base}-{n}"


def create(data: dict, created_by: str) -> dict:
    slug = data.get("slug") or _unique_slug(
        data["publish_date"], data.get("headline", "")
    )
    rows = pg_client.run(
        f"""
        INSERT INTO cms_posts (slug, channels, publish_date, mbti_group, editor_id,
                               headline, subtitle, closing_line, body_inline,
                               cover_image_url, created_by)
        VALUES (:slug, :channels, :publish_date, :mbti_group, :editor_id,
                :headline, :subtitle, :closing_line, CAST(:body AS jsonb),
                :cover, :created_by)
        RETURNING {_COLUMNS}
        """,
        slug=slug,
        channels=data.get("channels") or [],
        publish_date=data["publish_date"],
        mbti_group=data.get("mbti_group"),
        editor_id=data.get("editor_id"),
        headline=data.get("headline", ""),
        subtitle=data.get("subtitle"),
        closing_line=data.get("closing_line"),
        body=json.dumps(data.get("body_inline") or {}, ensure_ascii=False),
        cover=data.get("cover_image_url"),
        created_by=created_by,
    )
    return _to_dict(rows[0])


def get(post_id: str) -> dict | None:
    rows = pg_client.run(
        f"SELECT {_COLUMNS} FROM cms_posts WHERE id = CAST(:id AS uuid) AND deleted_at IS NULL",
        id=post_id,
    )
    return _to_dict(rows[0]) if rows else None


def list_posts(status: str | None, channel: str | None, limit: int = 50) -> list[dict]:
    sql = f"SELECT {_COLUMNS} FROM cms_posts WHERE deleted_at IS NULL"
    params: dict[str, Any] = {"limit": limit}
    if status:
        sql += " AND status = :status"
        params["status"] = status
    if channel:
        sql += " AND :channel = ANY(channels)"
        params["channel"] = channel
    sql += " ORDER BY publish_date DESC, created_at DESC LIMIT :limit"
    return [_to_dict(r) for r in pg_client.run(sql, **params)]


def update(post_id: str, data: dict) -> dict | None:
    rows = pg_client.run(
        f"""
        UPDATE cms_posts SET
            channels        = COALESCE(:channels, channels),
            publish_date    = COALESCE(CAST(:publish_date AS date), publish_date),
            mbti_group      = :mbti_group,
            editor_id       = :editor_id,
            headline        = COALESCE(:headline, headline),
            subtitle        = :subtitle,
            closing_line    = :closing_line,
            body_inline     = COALESCE(CAST(:body AS jsonb), body_inline),
            cover_image_url = :cover,
            updated_at      = now()
        WHERE id = CAST(:id AS uuid) AND deleted_at IS NULL
        RETURNING {_COLUMNS}
        """,
        id=post_id,
        channels=data.get("channels"),
        publish_date=data.get("publish_date"),
        mbti_group=data.get("mbti_group"),
        editor_id=data.get("editor_id"),
        headline=data.get("headline"),
        subtitle=data.get("subtitle"),
        closing_line=data.get("closing_line"),
        body=json.dumps(data["body_inline"], ensure_ascii=False)
        if "body_inline" in data
        else None,
        cover=data.get("cover_image_url"),
    )
    return _to_dict(rows[0]) if rows else None


_SET_STATUS_SQL = f"""
    UPDATE cms_posts
       SET status = :status,
           published_at = CASE WHEN :status = 'published' AND published_at IS NULL
                               THEN now() ELSE published_at END,
           updated_at = now()
     WHERE id = CAST(:id AS uuid) AND deleted_at IS NULL
 RETURNING {_COLUMNS}
"""


def set_status(post_id: str, status: str) -> dict | None:
    if status not in _VALID_STATUS:
        raise ValueError(f"invalid status: {status}")
    rows = pg_client.run(_SET_STATUS_SQL, id=post_id, status=status)
    return _to_dict(rows[0]) if rows else None


def soft_delete(post_id: str) -> bool:
    rows = pg_client.run(
        """
        UPDATE cms_posts SET deleted_at = now(), updated_at = now()
        WHERE id = CAST(:id AS uuid) AND deleted_at IS NULL
        RETURNING id
        """,
        id=post_id,
    )
    return bool(rows)
```

**공개 조회 메서드를 여기 두지 않는 이유:** 공개 API 는 admin 이 아니라 v2 패키징에서 도는
별도 Lambda 라 이 모듈을 import 할 수 없다 (Task 5). 같은 SQL 을 두 곳에 두면 한쪽만 고치는
사고가 나므로, 발행분 조회는 `PgVectorV2Client` 쪽에만 둔다.

- [ ] **Step 5: 통과 확인**

Run: `cd service/backend && python3 -m pytest admin/tests/test_posts_repo.py -v`
Expected: **PASS** 6건

- [ ] **Step 6: [게이트] DDL 적용**

pgvector 는 VPC 안이라 로컬에서 직접 접속할 수 없다. Task 2 로 VPC 에 들어간 admin Lambda 를
일회성으로 쓰거나, 기존 운영 경로(`v2/infrastructure` 적용 절차)를 따른다. **적용 커맨드를
사용자에게 제시하고 확인받은 뒤 실행한다.**

검증:

```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'cms_posts' ORDER BY ordinal_position;
```

Expected: 17개 컬럼이 DDL 순서대로 조회됨.

- [ ] **Step 7: Commit**

```bash
git add service/backend/v2/infrastructure/cms_posts_schema.sql \
        service/backend/admin/repo/ service/backend/admin/tests/test_posts_repo.py
git commit -m "feat(cms): cms_posts 스키마 + posts_repo SQL 계층

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 4: admin posts CRUD 라우트

**Files:**
- Create: `service/backend/admin/routes/posts.py`
- Modify: `service/backend/admin/handler.py` (HANDLERS dict + import)
- Create: `service/backend/admin/tests/test_posts_routes.py`

**Interfaces:**
- Consumes: `repo.posts_repo` (Task 3), `shared.response.ok/err`
- Produces: routeKey 7개 — `POST /admin/posts`, `GET /admin/posts`,
  `GET /admin/posts/{id}`, `PUT /admin/posts/{id}`, `POST /admin/posts/{id}/publish`,
  `POST /admin/posts/{id}/unpublish`, `DELETE /admin/posts/{id}`.
  모든 핸들러 시그니처는 기존 규약과 동일: `handle_x(body, path_params, query_params) -> dict`

- [ ] **Step 1: 실패하는 테스트 작성** — `service/backend/admin/tests/test_posts_routes.py` 신규:

```python
"""posts 라우트 유닛 테스트 — posts_repo 를 fake 로 대체.

Run from service/backend/::

    python3 -m pytest admin/tests/test_posts_routes.py -v
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from routes import posts


def _post(**over) -> dict:
    base = {
        "id": "11111111-1111-1111-1111-111111111111",
        "slug": "2026-07-27-제목",
        "status": "draft",
        "channels": ["letters"],
        "publish_date": "2026-07-27",
        "mbti_group": "NF",
        "editor_id": "하은",
        "headline": "제목",
        "subtitle": "부제",
        "closing_line": None,
        "body_inline": {"body": ["문단1"]},
        "cover_image_url": "",
        "created_by": "admin",
        "created_at": "2026-07-27T09:00:00+00:00",
        "updated_at": "2026-07-27T09:00:00+00:00",
        "published_at": None,
    }
    base.update(over)
    return base


def test_create_requires_headline() -> None:
    resp = posts.handle_create({"publish_date": "2026-07-27"}, {}, {})
    assert resp["statusCode"] == 400
    assert "headline" in json.loads(resp["body"])["message"]


def test_create_requires_publish_date() -> None:
    resp = posts.handle_create({"headline": "제목"}, {}, {})
    assert resp["statusCode"] == 400


def test_create_rejects_unknown_channel() -> None:
    resp = posts.handle_create(
        {"headline": "제목", "publish_date": "2026-07-27", "channels": ["bogus"]}, {}, {}
    )
    assert resp["statusCode"] == 400
    assert "channel" in json.loads(resp["body"])["message"]


def test_create_returns_201(monkeypatch) -> None:
    monkeypatch.setattr(posts.posts_repo, "create", lambda d, created_by: _post())
    resp = posts.handle_create(
        {"headline": "제목", "publish_date": "2026-07-27", "channels": ["letters"]}, {}, {}
    )
    assert resp["statusCode"] == 201
    assert json.loads(resp["body"])["post"]["slug"] == "2026-07-27-제목"


def test_get_returns_404_when_missing(monkeypatch) -> None:
    monkeypatch.setattr(posts.posts_repo, "get", lambda pid: None)
    resp = posts.handle_get({}, {"id": "11111111-1111-1111-1111-111111111111"}, {})
    assert resp["statusCode"] == 404


def test_publish_sets_status(monkeypatch) -> None:
    monkeypatch.setattr(
        posts.posts_repo, "set_status", lambda pid, s: _post(status=s, published_at="now")
    )
    resp = posts.handle_publish({}, {"id": "11111111-1111-1111-1111-111111111111"}, {})
    assert resp["statusCode"] == 200
    assert json.loads(resp["body"])["post"]["status"] == "published"


def test_delete_returns_404_when_already_gone(monkeypatch) -> None:
    monkeypatch.setattr(posts.posts_repo, "soft_delete", lambda pid: False)
    resp = posts.handle_delete({}, {"id": "11111111-1111-1111-1111-111111111111"}, {})
    assert resp["statusCode"] == 404


def test_list_passes_filters(monkeypatch) -> None:
    seen = {}

    def _fake_list(status, channel, limit):
        seen.update(status=status, channel=channel, limit=limit)
        return [_post()]

    monkeypatch.setattr(posts.posts_repo, "list_posts", _fake_list)
    resp = posts.handle_list({}, {}, {"status": "draft", "channel": "letters", "limit": "5"})
    assert resp["statusCode"] == 200
    assert seen == {"status": "draft", "channel": "letters", "limit": 5}
```

- [ ] **Step 2: 실패 확인**

Run: `cd service/backend && python3 -m pytest admin/tests/test_posts_routes.py -v`
Expected: **FAIL** — `ImportError: cannot import name 'posts' from 'routes'`

- [ ] **Step 3: 구현** — `service/backend/admin/routes/posts.py` 신규:

```python
"""CMS posts CRUD (CMS spec §5.1).

SQL 은 repo.posts_repo 가 전담한다. 여기서는 검증과 HTTP 매핑만 한다.
"""
from __future__ import annotations

import logging

from repo import posts_repo
from shared import response

logger = logging.getLogger(__name__)

_VALID_CHANNELS = {"letters", "paper", "feed"}
_VALID_GROUPS = {"NT", "NF", "ST", "SF"}
# JWT 는 handler.py 가 이미 검증했다. 단일 관리자 계정이라 작성자는 고정값.
_ACTOR = "admin"


def _validate(body: dict, *, require_all: bool) -> str | None:
    """문제가 있으면 메시지를, 없으면 None 을 반환."""
    if require_all:
        if not (body.get("headline") or "").strip():
            return "headline is required"
        if not (body.get("publish_date") or "").strip():
            return "publish_date is required (YYYY-MM-DD)"

    channels = body.get("channels")
    if channels is not None:
        if not isinstance(channels, list):
            return "channels must be a list"
        bad = [c for c in channels if c not in _VALID_CHANNELS]
        if bad:
            return f"unknown channel: {', '.join(map(str, bad))}"

    group = body.get("mbti_group")
    if group not in (None, "") and group not in _VALID_GROUPS:
        return f"invalid mbti_group: {group}"

    return None


def handle_create(body: dict, path_params: dict, query_params: dict) -> dict:
    err = _validate(body, require_all=True)
    if err:
        return response.err(err, 400)
    post = posts_repo.create(body, created_by=_ACTOR)
    logger.info(f"cms post created: {post['id']} slug={post['slug']}")
    return response.ok({"post": post}, 201)


def handle_list(body: dict, path_params: dict, query_params: dict) -> dict:
    q = query_params or {}
    try:
        limit = max(1, min(int(q.get("limit", 50)), 200))
    except (TypeError, ValueError):
        limit = 50
    posts = posts_repo.list_posts(q.get("status"), q.get("channel"), limit)
    return response.ok({"posts": posts, "count": len(posts)})


def handle_get(body: dict, path_params: dict, query_params: dict) -> dict:
    post = posts_repo.get((path_params or {}).get("id", ""))
    if not post:
        return response.err("post not found", 404)
    return response.ok({"post": post})


def handle_update(body: dict, path_params: dict, query_params: dict) -> dict:
    err = _validate(body, require_all=False)
    if err:
        return response.err(err, 400)
    post = posts_repo.update((path_params or {}).get("id", ""), body)
    if not post:
        return response.err("post not found", 404)
    return response.ok({"post": post})


def _set_status(path_params: dict, status: str) -> dict:
    post = posts_repo.set_status((path_params or {}).get("id", ""), status)
    if not post:
        return response.err("post not found", 404)
    logger.info(f"cms post {post['id']} → {status}")
    return response.ok({"post": post})


def handle_publish(body: dict, path_params: dict, query_params: dict) -> dict:
    return _set_status(path_params, "published")


def handle_unpublish(body: dict, path_params: dict, query_params: dict) -> dict:
    return _set_status(path_params, "draft")


def handle_delete(body: dict, path_params: dict, query_params: dict) -> dict:
    if not posts_repo.soft_delete((path_params or {}).get("id", "")):
        return response.err("post not found", 404)
    return response.ok({"ok": True})
```

- [ ] **Step 4: `handler.py` 에 라우트 등록** — import 줄과 HANDLERS dict 를 수정한다.

`from routes import admin_password, audit, cost, drivers, newsletter, prompts` 를 아래로 교체:

```python
from routes import admin_password, audit, cost, drivers, newsletter, posts, prompts
```

그리고 HANDLERS dict 의 `"GET /admin/newsletter/stats"` 줄 **다음에** 추가:

```python
    # CMS posts (2026-07-27)
    "POST /admin/posts": (posts.handle_create, True),
    "GET /admin/posts": (posts.handle_list, True),
    "GET /admin/posts/{id}": (posts.handle_get, True),
    "PUT /admin/posts/{id}": (posts.handle_update, True),
    "POST /admin/posts/{id}/publish": (posts.handle_publish, True),
    "POST /admin/posts/{id}/unpublish": (posts.handle_unpublish, True),
    "DELETE /admin/posts/{id}": (posts.handle_delete, True),
```

- [ ] **Step 5: 통과 확인 (회귀 포함)**

Run: `cd service/backend && python3 -m pytest admin/tests/ -v`
Expected: **PASS** 전부 (slug 5 + repo 6 + routes 8 = 19건)

- [ ] **Step 6: Commit**

```bash
git add service/backend/admin/routes/posts.py service/backend/admin/handler.py \
        service/backend/admin/tests/test_posts_routes.py
git commit -m "feat(cms): admin posts CRUD 라우트 7개 추가

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 5: 공개 조회 Lambda 핸들러 + 채널별 shaping

**Files:**
- Create: `service/backend/v2/handlers/cms_posts_public.py`
- Create: `service/backend/v2/tests/test_cms_posts_public.py`
- Modify: `service/backend/v2/deploy-v2.sh` (`API_V2_FUNCTIONS` + case + usage)

**Interfaces:**
- Consumes: `v2.clients.pgvector_v2_client.PgVectorV2Client` (v2 규약), `core.decorators`,
  `core.response`, `config.constants.CORS_HEADERS`
- Produces: `v2.handlers.cms_posts_public.lambda_handler`. 응답(envelope 없음):
  - `GET /api/v2/posts?channel=&date=` → `{channel, date, posts: [...]}`
  - `GET /api/v2/posts/{slug}` → `{post: {...}}`

이 Lambda 는 admin 과 달리 **v2 규약**을 쓴다 (`deploy-v2.sh` 가 v1+v2 소스를 번들하므로
`PgVectorV2Client` 를 그대로 import 할 수 있다).

- [ ] **Step 1: 실패하는 테스트 작성** — `service/backend/v2/tests/test_cms_posts_public.py` 신규:

```python
"""공개 posts API 유닛 테스트 — pg 클라이언트를 fake 로 대체.

Run from service/backend/::

    python3 -m pytest v2/tests/test_cms_posts_public.py -v -m 'not integration'
"""
from __future__ import annotations

import json
from typing import Any

import pytest

from v2.handlers import cms_posts_public
from v2.handlers.cms_posts_public import lambda_handler


class _FakePg:
    def __init__(self, rows: list[dict], one: dict | None = None) -> None:
        self.rows = rows
        self.one = one
        self.closed = False

    def list_published_posts(self, channel: str, date: str | None, limit: int):
        return self.rows

    def get_published_post_by_slug(self, slug: str):
        return self.one

    def close(self) -> None:
        self.closed = True


def _row(**over) -> dict:
    base = {
        "id": "11111111-1111-1111-1111-111111111111",
        "slug": "2026-07-27-제목",
        "channels": ["letters"],
        "publish_date": "2026-07-27",
        "mbti_group": "NF",
        "editor_id": "하은",
        "headline": "제목",
        "subtitle": "부제",
        "closing_line": "닫는 줄",
        "body_inline": {
            "body": ["문단1", "문단2"],
            "key_points": ["요점"],
            "keywords": [{"term": "금리", "explain": "설명"}],
            "images": [{"url": "https://img/x.jpg"}],
        },
        "cover_image_url": "https://img/cover.jpg",
        "published_at": "2026-07-27T09:00:00+00:00",
    }
    base.update(over)
    return base


def _install(monkeypatch, pg: _FakePg) -> None:
    monkeypatch.setattr(cms_posts_public, "PgVectorV2Client", lambda: pg)


def _get(qs: dict[str, Any] | None = None, path: dict | None = None) -> dict:
    e: dict[str, Any] = {"httpMethod": "GET"}
    if qs:
        e["queryStringParameters"] = qs
    if path:
        e["pathParameters"] = path
    return e


def test_options_returns_200_with_cors(monkeypatch) -> None:
    _install(monkeypatch, _FakePg([]))
    resp = lambda_handler({"httpMethod": "OPTIONS"}, None)
    assert resp["statusCode"] == 200
    assert "Access-Control-Allow-Origin" in resp["headers"]


def test_invalid_channel_returns_400(monkeypatch) -> None:
    _install(monkeypatch, _FakePg([]))
    resp = lambda_handler(_get({"channel": "bogus"}), None)
    assert resp["statusCode"] == 400


def test_letters_channel_shapes_like_api_letter(monkeypatch) -> None:
    _install(monkeypatch, _FakePg([_row()]))
    resp = lambda_handler(_get({"channel": "letters", "date": "2026-07-27"}), None)
    assert resp["statusCode"] == 200
    p = json.loads(resp["body"])["posts"][0]
    assert p["id"] == "2026-07-27-제목"          # id ← slug
    assert p["headline"] == "제목"
    assert p["body"] == ["문단1", "문단2"]
    assert p["key_points"] == ["요점"]
    assert p["mbti_group"] == "NF"


def test_paper_channel_shapes_like_front_page(monkeypatch) -> None:
    _install(monkeypatch, _FakePg([_row(channels=["paper"])]))
    resp = lambda_handler(_get({"channel": "paper"}), None)
    p = json.loads(resp["body"])["posts"][0]
    assert p["news_id"] == "2026-07-27-제목"
    assert p["title"] == "제목"
    assert p["sub_title"] == "부제"
    assert p["content"] == "문단1\n\n문단2"
    assert p["image_url"] == "https://img/cover.jpg"
    assert p["is_top"] is False
    assert p["content_blocks"][0] == {"type": "text", "text_ko": "문단1"}


def test_null_editor_falls_back_to_team_name(monkeypatch) -> None:
    _install(monkeypatch, _FakePg([_row(editor_id=None)]))
    resp = lambda_handler(_get({"channel": "letters"}), None)
    p = json.loads(resp["body"])["posts"][0]
    assert p["editor_id"] == "AI LENS 편집팀"


def test_slug_lookup_returns_404_when_missing(monkeypatch) -> None:
    _install(monkeypatch, _FakePg([], one=None))
    resp = lambda_handler(_get(path={"slug": "없는-글"}), None)
    assert resp["statusCode"] == 404


def test_cache_control_header_on_success(monkeypatch) -> None:
    _install(monkeypatch, _FakePg([]))
    resp = lambda_handler(_get({"channel": "letters"}), None)
    assert resp["headers"]["Cache-Control"] == "public, max-age=300"


def test_pg_connection_closed(monkeypatch) -> None:
    pg = _FakePg([])
    _install(monkeypatch, pg)
    lambda_handler(_get({"channel": "letters"}), None)
    assert pg.closed is True
```

- [ ] **Step 2: 실패 확인**

Run: `cd service/backend && python3 -m pytest v2/tests/test_cms_posts_public.py -v -m 'not integration'`
Expected: **FAIL** — `ModuleNotFoundError: No module named 'v2.handlers.cms_posts_public'`

- [ ] **Step 3: `PgVectorV2Client` 에 읽기 메서드 2개 추가** —
`service/backend/v2/clients/pgvector_v2_client.py` 의 `get_daily_letters` 메서드 **앞**에 추가:

```python
    # ------------------------------------------------------------------
    # CMS posts 읽기 — 공개 API 전용 (CMS spec §5.1)
    # ------------------------------------------------------------------

    _CMS_COLUMNS = """id, slug, channels, publish_date, mbti_group, editor_id,
                      headline, subtitle, closing_line, body_inline,
                      cover_image_url, published_at"""

    def _cms_row(self, r) -> Dict[str, Any]:
        body = r[9]
        if isinstance(body, str):
            try:
                body = json.loads(body)
            except Exception:
                body = {}
        return {
            "id": str(r[0]),
            "slug": r[1],
            "channels": list(r[2] or []),
            "publish_date": r[3].isoformat() if hasattr(r[3], "isoformat") else r[3],
            "mbti_group": r[4],
            "editor_id": r[5],
            "headline": r[6],
            "subtitle": r[7],
            "closing_line": r[8],
            "body_inline": body or {},
            "cover_image_url": r[10] or "",
            "published_at": r[11].isoformat() if hasattr(r[11], "isoformat") else r[11],
        }

    def list_published_posts(
        self, channel: str, date: Optional[str], limit: int = 20
    ) -> List[Dict[str, Any]]:
        """발행된 CMS 글. 삭제분(deleted_at)과 초안은 제외한다."""
        if not self._enabled:
            return []
        sql = (
            f"SELECT {self._CMS_COLUMNS} FROM cms_posts "
            "WHERE status = 'published' AND deleted_at IS NULL "
            "AND :channel = ANY(channels)"
        )
        params: Dict[str, Any] = {"channel": channel, "limit": limit}
        if date:
            sql += " AND publish_date = CAST(:pdate AS date)"
            params["pdate"] = date
        sql += " ORDER BY publish_date DESC, published_at DESC LIMIT :limit"
        return [self._cms_row(r) for r in self.conn.run(sql, **params)]

    def get_published_post_by_slug(self, slug: str) -> Optional[Dict[str, Any]]:
        if not self._enabled:
            return None
        rows = self.conn.run(
            f"SELECT {self._CMS_COLUMNS} FROM cms_posts "
            "WHERE slug = :slug AND status = 'published' AND deleted_at IS NULL",
            slug=slug,
        )
        return self._cms_row(rows[0]) if rows else None
```

- [ ] **Step 4: 핸들러 구현** — `service/backend/v2/handlers/cms_posts_public.py` 신규:

```python
"""GET /api/v2/posts — 관리자가 작성한 글의 공개 조회 API (CMS spec §5.1.1).

채널별로 응답 모양이 다르다. 프론트가 기존 응답과 머지할 수 있도록,
'letters' 는 ApiLetter 모양으로, 'paper' 는 front-page article 모양으로 shaping 한다.

Query: ?channel=letters|paper|feed (필수) &date=YYYY-MM-DD (옵션)
Path : /api/v2/posts/{slug}

응답에 envelope 은 없다 (today-letters·front-page 와 동일 규약).
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from config.constants import CORS_HEADERS
from core.decorators import lambda_handler as handler_decorator
from core.response import error_response, success_response

from v2.clients.pgvector_v2_client import PgVectorV2Client

logger = logging.getLogger(__name__)
logging.getLogger().setLevel(logging.INFO)

_VALID_CHANNELS = ("letters", "paper", "feed")
_CACHE_CONTROL = "public, max-age=300"
# editor_id 가 NULL 인 글의 표시 명의 (spec §5.1.1)
_DEFAULT_EDITOR = "AI LENS 편집팀"


def _body_paragraphs(post: Dict[str, Any]) -> List[str]:
    return [p for p in (post.get("body_inline") or {}).get("body", []) if p]


def _shape_letter(post: Dict[str, Any]) -> Dict[str, Any]:
    """ApiLetter 모양 (shared/lib/todayLettersApi.ts 와 1:1)."""
    b = post.get("body_inline") or {}
    return {
        "id": post["slug"],
        "editor_id": post.get("editor_id") or _DEFAULT_EDITOR,
        "mbti_group": post.get("mbti_group"),
        "article_id": "",
        "secondary_article_ids": [],
        "archetype": None,
        "theme": None,
        "headline": post.get("headline") or "",
        "subtitle": post.get("subtitle"),
        "closing_line": post.get("closing_line"),
        "body": _body_paragraphs(post),
        "key_points": b.get("key_points") or [],
        "keywords": b.get("keywords") or [],
        "images": b.get("images") or [],
        "is_cms": True,
    }


def _shape_paper(post: Dict[str, Any]) -> Dict[str, Any]:
    """front-page article 모양 (v2/handlers/front_page.py 와 1:1)."""
    paras = _body_paragraphs(post)
    blocks: List[Dict[str, Any]] = [{"type": "text", "text_ko": p} for p in paras]
    for img in (post.get("body_inline") or {}).get("images", []):
        url = (img or {}).get("url")
        if url:
            blocks.append({"type": "image", "url": url})
    return {
        "news_id": post["slug"],
        "title": post.get("headline") or "",
        "sub_title": post.get("subtitle") or "",
        "category": "",
        "author_name": post.get("editor_id") or _DEFAULT_EDITOR,
        "published_at": post.get("published_at"),
        "url": "",
        "image_url": post.get("cover_image_url") or "",
        "is_top": False,
        "content": "\n\n".join(paras),
        "content_blocks": blocks,
        "is_cms": True,
    }


_SHAPERS = {
    "letters": _shape_letter,
    "paper": _shape_paper,
    # feed 는 개인화 랭킹 대상이 아니라 상단 고정 카드로 쓰인다 (spec §2.4).
    # 모양은 letters 와 같게 두고 프론트가 고정 배치한다.
    "feed": _shape_letter,
}


@handler_decorator
async def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    method = (
        event.get("httpMethod")
        or (event.get("requestContext") or {}).get("http", {}).get("method")
        or "GET"
    )
    if method == "OPTIONS":
        return {"statusCode": 200, "headers": CORS_HEADERS, "body": ""}

    path_params = event.get("pathParameters") or {}
    qs = event.get("queryStringParameters") or {}
    slug: Optional[str] = path_params.get("slug")

    pg = PgVectorV2Client()
    try:
        if slug:
            post = pg.get_published_post_by_slug(slug)
            if not post:
                return error_response("post not found", status_code=404, code="NOT_FOUND")
            channel = (post.get("channels") or ["letters"])[0]
            shaper = _SHAPERS.get(channel, _shape_letter)
            payload: Dict[str, Any] = {"post": shaper(post)}
        else:
            channel = qs.get("channel") or "letters"
            if channel not in _VALID_CHANNELS:
                return error_response(
                    f"invalid channel: {channel}", status_code=400, code="VALIDATION"
                )
            date = qs.get("date")
            rows = pg.list_published_posts(channel, date, limit=20)
            payload = {
                "channel": channel,
                "date": date,
                "posts": [_SHAPERS[channel](r) for r in rows],
            }
    finally:
        pg.close()

    resp = success_response(payload)
    resp["headers"] = {**resp["headers"], "Cache-Control": _CACHE_CONTROL}
    return resp
```

- [ ] **Step 5: 통과 확인**

Run: `cd service/backend && python3 -m pytest v2/tests/test_cms_posts_public.py -v -m 'not integration'`
Expected: **PASS** 8건

- [ ] **Step 6: `deploy-v2.sh` 등록** — `API_V2_FUNCTIONS` 배열의 `front-page` 라인 다음에 추가:

```bash
  "sedaily-mbti-v2-posts-dev"          # CMS 글 공개 조회 API (handlers/cms_posts_public.py)
                                       # 함수 최초 생성 수동(.clauderules), 이후 update만 자동
```

case 블록에 추가 (`front-page)` 케이스 다음):

```bash
  posts)
    FUNCTIONS=("sedaily-mbti-v2-posts-dev")
    ;;
```

usage 문자열의 `front-page` 뒤에 ` | posts` 삽입.

- [ ] **Step 7: 문법 검증**

Run: `bash -n service/backend/v2/deploy-v2.sh && echo SYNTAX_OK`
Expected: `SYNTAX_OK`

- [ ] **Step 8: Commit**

```bash
git add service/backend/v2/handlers/cms_posts_public.py \
        service/backend/v2/clients/pgvector_v2_client.py \
        service/backend/v2/tests/test_cms_posts_public.py \
        service/backend/v2/deploy-v2.sh
git commit -m "feat(cms): 공개 posts 조회 API + 채널별 shaping

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 6: 배포·프로비저닝·스모크 (운영 — 사용자 확인 게이트)

**Files:** 없음 (운영 절차). **모든 [게이트] 스텝은 실행 직전 커맨드를 사용자에게 보여주고
확인받은 뒤 실행한다. 이상 발생 시 즉시 중단하고 보고. 생성된 리소스 ID 는 PR 본문에 기록.**

- [ ] **Step 1: admin Lambda 코드 배포** (자동 허용 범위)

Run: `cd service/backend && ./admin/deploy-admin-api.sh`
Expected: `[OK] sedaily-mbti-admin-api-dev updated`

- [ ] **Step 2: [게이트] API GW — admin posts 라우트 7개 등록**

admin Lambda 의 기존 integration id 를 재사용한다 (새로 만들지 않는다).

```bash
API=chzwwtjtgk
INTEG=$(aws apigatewayv2 get-routes --api-id $API --region us-east-1 \
  --query "Items[?RouteKey=='GET /admin/cost'].Target" --output text | cut -d/ -f2)
echo "reusing integration: $INTEG"
for RK in "POST /admin/posts" "GET /admin/posts" "GET /admin/posts/{id}" \
          "PUT /admin/posts/{id}" "POST /admin/posts/{id}/publish" \
          "POST /admin/posts/{id}/unpublish" "DELETE /admin/posts/{id}"; do
  aws apigatewayv2 create-route --api-id $API --route-key "$RK" \
    --target "integrations/$INTEG" --region us-east-1 --query RouteId --output text
done
```

Expected: RouteId 7개 출력. **전부 기록.**

- [ ] **Step 3: admin posts 스모크 (인증)**

```bash
B=https://chzwwtjtgk.execute-api.us-east-1.amazonaws.com/dev
curl -s -o /dev/null -w 'GET /admin/posts (무인증) → %{http_code}\n' --max-time 20 "$B/admin/posts"
```

Expected: `401` — 라우트가 등록됐고 인증이 걸려 있다는 뜻.

- [ ] **Step 4: [게이트] 공개 Lambda 생성**

stub 으로 만든 뒤 곧바로 실코드를 배포한다. 구성은 `today-letters` 를 복제한다.

```bash
cd "$(mktemp -d)" && printf 'def lambda_handler(e, c):\n    return {}\n' > lambda_function.py && zip -q stub.zip lambda_function.py
aws lambda create-function \
  --function-name sedaily-mbti-v2-posts-dev \
  --runtime python3.11 \
  --handler v2.handlers.cms_posts_public.lambda_handler \
  --role arn:aws:iam::887078546492:role/service-role/sedaily-mbti-v2-collector-dev-role-nbf99tic \
  --timeout 30 --memory-size 256 \
  --vpc-config SubnetIds=subnet-0430a7468d7d796e9,subnet-0b9783a637589c096,SecurityGroupIds=sg-0cddc39619b1d69d9 \
  --zip-file fileb://stub.zip --region us-east-1 \
  --query 'FunctionArn' --output text
ENV_JSON=$(aws lambda get-function-configuration \
  --function-name sedaily-mbti-v2-today-letters-dev --region us-east-1 \
  --query 'Environment' --output json)
aws lambda wait function-active --function-name sedaily-mbti-v2-posts-dev --region us-east-1
aws lambda update-function-configuration \
  --function-name sedaily-mbti-v2-posts-dev \
  --environment "$ENV_JSON" --region us-east-1 \
  --query 'LastUpdateStatus' --output text
```

Expected: FunctionArn 출력 → `InProgress`. **ARN 기록.**

- [ ] **Step 5: 공개 Lambda 실코드 배포** (자동 허용 범위)

```bash
cd service/backend
aws lambda wait function-updated --function-name sedaily-mbti-v2-posts-dev --region us-east-1
./v2/deploy-v2.sh posts
```

Expected: 업데이트 성공.

- [ ] **Step 6: [게이트] 공개 API GW 라우트 + 권한**

```bash
API=chzwwtjtgk
INTEG_ID=$(aws apigatewayv2 create-integration --api-id $API \
  --integration-type AWS_PROXY \
  --integration-uri arn:aws:lambda:us-east-1:887078546492:function:sedaily-mbti-v2-posts-dev \
  --payload-format-version 2.0 --region us-east-1 \
  --query IntegrationId --output text)
echo "IntegrationId=$INTEG_ID"   # 기록
for RK in "GET /api/v2/posts" "GET /api/v2/posts/{slug}"; do
  aws apigatewayv2 create-route --api-id $API --route-key "$RK" \
    --target "integrations/$INTEG_ID" --region us-east-1 --query RouteId --output text
done
aws lambda add-permission --function-name sedaily-mbti-v2-posts-dev \
  --statement-id apigw-cms-posts --action lambda:InvokeFunction \
  --principal apigateway.amazonaws.com \
  --source-arn "arn:aws:execute-api:us-east-1:887078546492:$API/*/*/api/v2/posts*" \
  --region us-east-1
```

Expected: IntegrationId·RouteId 출력 (기록). 스테이지는 기존 auto-deploy 사용.

- [ ] **Step 7: 엔드투엔드 스모크**

```bash
B=https://chzwwtjtgk.execute-api.us-east-1.amazonaws.com/dev
echo "1) 빈 목록 (아직 글 없음)"
curl -s --max-time 20 "$B/api/v2/posts?channel=letters" | python3 -m json.tool | head -10
echo "2) 잘못된 채널 → 400"
curl -s -o /dev/null -w '%{http_code}\n' --max-time 20 "$B/api/v2/posts?channel=bogus"
echo "3) 없는 slug → 404"
curl -s -o /dev/null -w '%{http_code}\n' --max-time 20 "$B/api/v2/posts/없는글"
echo "4) 캐시 헤더"
curl -s -D- -o /dev/null --max-time 20 "$B/api/v2/posts?channel=letters" | grep -i cache-control
```

Expected: ① `{"channel":"letters","date":null,"posts":[]}` ② `400` ③ `404`
④ `cache-control: public, max-age=300`

- [ ] **Step 8: 기존 경로 회귀 확인**

```bash
B=https://chzwwtjtgk.execute-api.us-east-1.amazonaws.com/dev
curl -s -o /dev/null -w 'today-letters → %{http_code}\n' --max-time 20 "$B/api/v2/today-letters"
curl -s -o /dev/null -w 'front-page    → %{http_code}\n' --max-time 20 "$B/api/v2/front-page"
curl -s -o /dev/null -w 'admin/cost    → %{http_code}\n' --max-time 20 "$B/admin/cost"
```

Expected: `200`, `200`, `401` — 기존 경로가 그대로.

- [ ] **Step 9: 기록** — 생성 리소스(Lambda ARN, IntegrationId, RouteId 9개, IAM 정책 ARN)를
PR 본문에 적는다. 2단계 계획(CMS 화면 + 프론트 머지)의 입력이 된다.

---

## 실행 순서 요약

Task 1(코드) → 2(VPC 게이트) → 3(스키마·repo) → 4(라우트) → 5(공개 API) → 6(배포·스모크).

Task 2 는 Task 3 이후 실제 DB 호출을 하기 전까지는 막지 않으므로, Task 1 직후에 병행해도 된다.
다만 Task 6 Step 1 전에는 반드시 끝나 있어야 한다.

## 다음 계획

이 계획이 끝나면 API 는 완성되지만 화면이 없다. 2단계(CMS 목록·에디터 화면 + 프론트 머지)와
3단계(AI 레터 편집 + 이미지 업로드)는 **별도 계획서**로 작성한다 — 이 계획의 Task 6 에서 기록한
리소스 ID 가 그 입력이다.
