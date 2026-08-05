# AI LENS CMS 4단계 admin 백엔드 정비 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** admin Lambda 의 감사 로그 누락을 메우고, 응답·에러 빌더를 `common/` 공유 계층으로 일원화한다.

**Architecture:** CORS 중립 코어(`common/http.py`·`common/errors.py`)를 두고 CORS 주입은 소비자가 한다. v1 `core/response.py` 는 CORS 를 얹는 얇은 층이 되고, admin 은 `common/` 을 직접 쓴다. `common/` 이 `config/` 를 import 하지 않으므로 CORS 헤더가 admin 에 들어올 경로 자체가 없다. 이관 전에 characterization test 를 깔아 "동작을 안 바꿨다"를 증명한다.

**Tech Stack:** Python 3.11 · pytest · boto3(DynamoDB·SSM·EventBridge) · AWS Lambda(HTTP API v2 event)

설계 근거: [2026-07-29-ailens-cms-phase4-backend-design.md](../specs/2026-07-29-ailens-cms-phase4-backend-design.md)

## Global Constraints

- **작업 디렉터리는 `service/backend/`** 다. 모든 pytest·배포 명령은 여기서 실행한다.
- **admin 은 flat import 규약**을 쓴다. zip 루트가 `admin/` 내용 그 자체다(`admin/deploy-admin-api.sh:4-5`). 테스트는 `sys.path.insert(0, Path(__file__).resolve().parents[1])` 로 이를 재현한다.
- **admin 응답에 `Access-Control-*` 헤더를 넣지 않는다.** API Gateway HTTP API 가 API-level 에서 CORS 를 처리하므로 conflict 가 난다(`admin/shared/response.py:3-6`).
- **`common/` 은 `config/` 를 import 하지 않는다.** 이 제약이 위 CORS 규칙을 구조로 강제한다.
- **커밋 트레일러는 정확히** `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>` — 괄호 접미사 금지(루트 `CLAUDE.md`).
- **신규 AWS 리소스를 만들지 않는다.** `update-function-code` 만 수행한다.
- **테스트는 실 AWS 를 때리지 않는다.** boto3 호출은 전부 fake 로 대체한다.
- 각 Task 는 독립 커밋으로 끝난다.

---

## File Structure

**신규**

| 파일 | 책임 |
|---|---|
| `admin/tests/conftest.py` | 공용 fake(`FakeTable`·`FakeSSM`·`FakeEB`)와 `assert_no_cors` 헬퍼 |
| `admin/tests/test_auth_routes.py` | login·password-change characterization |
| `admin/tests/test_drivers_routes.py` | drivers 4개 라우트 characterization |
| `admin/tests/test_prompts_routes.py` | prompts 3개 라우트 characterization |
| `admin/tests/test_readonly_routes.py` | cost·audit·newsletter characterization |
| `admin/shared/audit.py` | 감사 로그 — 컨텍스트 바인딩 + 기록 (`auth.py` 에서 분리) |
| `admin/tests/test_audit.py` | audit 모듈 단위 테스트 |
| `common/http.py` | CORS 중립 응답 빌더 |
| `common/errors.py` | `BackendError` 계층 + status code 매핑 |
| `common/tests/test_http.py` | `common/http.py` 단위 테스트 |
| `common/tests/test_errors.py` | `common/errors.py` 단위 테스트 |
| `tests/test_core_response_contract.py` | v1 `core/response.py` 9개 함수 characterization |

**수정**

| 파일 | 변경 |
|---|---|
| `admin/auth.py` | `audit_log` 제거 → `shared/audit.py` 위임. `handle_login` 이 `audit.log` 호출 |
| `admin/handler.py` | `verify_jwt()` 반환값 캡처 → `audit.bind_context()` |
| `admin/routes/{drivers,prompts,admin_password}.py` | `auth.audit_log` → `audit.log` |
| `admin/routes/{posts,letters,media}.py` | 감사 호출 신규 추가 |
| `admin/routes/audit.py` | 커서 페이지네이션 |
| `admin/shared/response.py` | 내부를 `common.http` 로 위임 |
| `admin/deploy-admin-api.sh` | zip 에 `common` 추가 |
| `core/response.py` | 내부를 `common.http` 로 위임 + `CORS_HEADERS` 주입 |
| `core/exceptions.py` | `common.errors` 명시적 재수출 |

---

# 단계 1 — characterization test (Task 1–4)

이관 대상 12개 라우트의 현재 동작을 박제한다. **이 단계는 프로덕션 코드를 한 줄도 바꾸지 않는다.**

### Task 1: 테스트 하네스 + auth 계열 characterization

**Files:**
- Create: `service/backend/admin/tests/conftest.py`
- Create: `service/backend/admin/tests/test_auth_routes.py`

**Interfaces:**
- Consumes: 없음 (첫 Task)
- Produces: `FakeTable` · `FakeSSM` · `FakeEB` · `assert_no_cors(resp)` — Task 2·3·4 가 `conftest.py` 에서 자동 주입받아 쓴다. `FakeTable(items=[...])` 는 `query`/`scan`/`get_item`/`put_item`/`update_item` 을 지원하고 쓰기 호출을 `put_calls`/`update_calls` 에 기록한다.

- [ ] **Step 1: 공용 fake 하네스를 작성한다**

`service/backend/admin/tests/conftest.py`:

```python
"""admin 테스트 공용 fake + 단언 헬퍼.

admin 은 flat import 규약(zip 루트 = admin/)이므로 sys.path 에 admin/ 를 넣어
프로덕션과 같은 import 경로를 재현한다.

Run from service/backend/::

    python3 -m pytest admin/tests -q
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def _cond_matches(cond, item: dict) -> bool:
    """boto3 조건 객체를 item 에 대해 평가한다.

    fake 가 KeyConditionExpression/FilterExpression 을 무시하면 한 테이블에
    서로 다른 prefix 의 행이 섞였을 때 프로덕션이 절대 만들 수 없는 응답이
    나온다. 그 값을 characterization 기준선으로 고정하면, 이 테스트들은
    프로덕션 동작이 아니라 fake 의 인공물을 지키게 된다.

    지원 연산자는 실제 라우트가 쓰는 것만: AND · = · begins_with.
    """
    if cond is None:
        return True
    expr = cond.get_expression()
    op = expr["operator"]
    values = expr["values"]

    if op == "AND":
        return all(_cond_matches(v, item) for v in values)
    if op == "OR":
        return any(_cond_matches(v, item) for v in values)

    attr, expected = values[0], values[1]
    actual = item.get(attr.name)
    if op == "=":
        return actual == expected
    if op == "begins_with":
        return isinstance(actual, str) and actual.startswith(expected)
    raise NotImplementedError(f"FakeTable 이 아직 지원하지 않는 조건: {op}")


class FakeTable:
    """DynamoDB Table resource 의 최소 대역. 쓰기 호출을 기록한다."""

    def __init__(self, items: list[dict] | None = None, get_map: dict | None = None):
        self.items = items or []
        self.get_map = get_map or {}
        self.put_calls: list[dict] = []
        self.update_calls: list[dict] = []
        self.query_calls: list[dict] = []

    def query(self, **kwargs) -> dict:
        self.query_calls.append(kwargs)
        cond = kwargs.get("KeyConditionExpression")
        rows = [i for i in self.items if _cond_matches(cond, i)]
        # 실제 DynamoDB 는 sk 기준으로 정렬한다 — 입력 순서를 뒤집는 게 아니다.
        if kwargs.get("ScanIndexForward") is False:
            rows = sorted(rows, key=lambda i: i.get("sk") or "", reverse=True)
        limit = kwargs.get("Limit")
        if limit is not None:
            rows = rows[:limit]
        return {"Items": rows}

    def scan(self, **kwargs) -> dict:
        cond = kwargs.get("FilterExpression")
        return {"Items": [i for i in self.items if _cond_matches(cond, i)]}

    def get_item(self, Key: dict) -> dict:
        key = (Key.get("pk"), Key.get("sk"))
        item = self.get_map.get(key)
        return {"Item": item} if item is not None else {}

    def put_item(self, Item: dict) -> None:
        self.put_calls.append(Item)

    def update_item(self, **kwargs) -> None:
        self.update_calls.append(kwargs)


class FakeSSM:
    """shared.ssm_client 대역."""

    def __init__(self, values: dict[str, str] | None = None):
        self.values = values or {}
        self.put_calls: list[tuple[str, str]] = []

    def get_secure(self, name: str, *, force_refresh: bool = False) -> str:
        return self.values[name]

    def put_secure(self, name: str, value: str) -> None:
        self.put_calls.append((name, value))
        self.values[name] = value


class FakeEB:
    """shared.eb_client 대역. PRESET_TO_SCHEDULE 은 실제 값을 그대로 쓴다."""

    def __init__(self, rules: list[dict] | None = None):
        self.rules = rules or []
        self.enabled: list[str] = []
        self.disabled: list[str] = []
        self.schedules: list[tuple[str, str]] = []

    def list_rules(self, name_prefix: str = "sedaily-mbti-") -> list[dict]:
        return list(self.rules)

    def enable_rule(self, name: str) -> None:
        self.enabled.append(name)

    def disable_rule(self, name: str) -> None:
        self.disabled.append(name)

    def set_schedule(self, name: str, preset: str) -> str:
        from shared import eb_client
        schedule = eb_client.PRESET_TO_SCHEDULE[preset]
        self.schedules.append((name, schedule))
        return schedule

    def describe_rule(self, name: str) -> dict:
        return {"name": name, "state": "ENABLED", "schedule": "rate(1 hour)", "preset": "1h"}


def assert_no_cors(resp: dict) -> None:
    """admin 응답에 CORS 헤더가 없어야 한다.

    API Gateway HTTP API 가 API-level 에서 CORS 를 처리하므로 Lambda 가 헤더를
    추가하면 conflict 가 난다(admin/shared/response.py:3-6). common/ 이관 중
    core/response.py 의 CORS_HEADERS 가 새어 들어오면 이 단언이 잡는다.
    """
    for key in resp.get("headers", {}):
        assert not key.lower().startswith("access-control-"), f"CORS 헤더 누출: {key}"


@pytest.fixture(autouse=True)
def block_real_aws(monkeypatch) -> None:
    """패치되지 않은 boto3 접근을 원천 차단한다.

    이 워크스테이션에는 실제 AWS 자격증명이 있다. 감사 로그가 붙은 뒤로는
    라우트 하나를 부르면 audit.log() → ddb_client.config_table() 이 따라
    호출되는데, 그 라우트의 테스트가 config_table 을 패치하지 않았다면
    운영 테이블(sedaily-mbti-admin-config-dev)에 실제 감사 행이 쓰인다.

    기본값을 fake 로 깔아두면 개별 테스트가 명시적으로 패치하지 않은 경로도
    안전하다. 테스트별 monkeypatch 는 이 픽스처 뒤에 적용되므로 그대로
    덮어쓴다.
    """
    from shared import ddb_client, ssm_client

    monkeypatch.setattr(ddb_client, "config_table", lambda: FakeTable())
    monkeypatch.setattr(ddb_client, "prompts_table", lambda: FakeTable())

    def _no_ssm(*args, **kwargs):
        raise AssertionError(
            "테스트가 실제 SSM 을 호출하려 했다. 필요한 테스트는 "
            "ssm_client.get_secure/put_secure 를 명시적으로 패치할 것."
        )

    monkeypatch.setattr(ssm_client, "get_secure", _no_ssm)
    monkeypatch.setattr(ssm_client, "put_secure", _no_ssm)


@pytest.fixture
def fake_table() -> FakeTable:
    return FakeTable()


@pytest.fixture
def fake_ssm() -> FakeSSM:
    return FakeSSM()


@pytest.fixture
def fake_eb() -> FakeEB:
    return FakeEB()
```

**주의:** `block_real_aws` 가 `config_table` 을 호출마다 **새 `FakeTable`** 로 돌려주므로, 쓰기를 검증하려는 테스트는 반드시 자기 fixture 에서 하나의 인스턴스를 고정해 패치해야 한다. 그렇지 않으면 `put_calls` 가 항상 비어 보인다.

- [ ] **Step 2: 하네스가 수집되는지 확인한다**

Run: `cd service/backend && python3 -m pytest admin/tests -q`
Expected: PASS — 기존 42개가 그대로 통과. conftest 는 테스트가 없으므로 개수 변화 없음.

- [ ] **Step 3: auth 계열 characterization 테스트를 작성한다**

`service/backend/admin/tests/test_auth_routes.py`:

```python
"""login · password-change 의 현재 응답을 박제한다 (characterization).

이 테스트는 "지금 이렇게 동작한다"를 고정하는 것이 목적이다. 4단계 이관에서
의도적으로 바꾸는 부분(에러 body 키)은 그때 이 파일을 명시적으로 고친다.

Run from service/backend/::

    python3 -m pytest admin/tests/test_auth_routes.py -v
"""
from __future__ import annotations

import json

import pytest
from argon2 import PasswordHasher

from conftest import FakeSSM, FakeTable, assert_no_cors

import auth
from routes import admin_password
from shared import ssm_client

_PH = PasswordHasher()
_GOOD = "correct-horse-battery"
_HASH = _PH.hash(_GOOD)


@pytest.fixture
def wired(monkeypatch) -> FakeTable:
    """lockout 없음 + 비밀번호 해시 준비된 상태."""
    table = FakeTable()
    ssm = FakeSSM({auth.PASSWORD_HASH_PARAM: _HASH, auth.JWT_SECRET_PARAM: "test-secret"})
    monkeypatch.setattr(auth.ddb_client, "config_table", lambda: table)
    monkeypatch.setattr(ssm_client, "get_secure", ssm.get_secure)
    monkeypatch.setattr(ssm_client, "put_secure", ssm.put_secure)
    return table


def test_login_success_returns_token_and_expiry(wired) -> None:
    resp = auth.handle_login({"password": _GOOD}, {}, {})
    assert resp["statusCode"] == 200
    body = json.loads(resp["body"])
    assert set(body) == {"token", "expires_at"}
    assert isinstance(body["token"], str) and body["token"]
    assert_no_cors(resp)


def test_login_empty_password_is_400_with_message_key(wired) -> None:
    resp = auth.handle_login({"password": ""}, {}, {})
    assert resp["statusCode"] == 400
    assert json.loads(resp["body"])["message"] == "password required"
    assert_no_cors(resp)


def test_login_wrong_password_is_401(wired) -> None:
    resp = auth.handle_login({"password": "wrong"}, {}, {})
    assert resp["statusCode"] == 401
    assert json.loads(resp["body"])["message"] == "invalid credentials"
    assert_no_cors(resp)


def test_login_lockout_is_423_with_retry_after_at_top_level(monkeypatch) -> None:
    """retry_after_seconds 가 body 최상위에 온다 — 4단계에서 details 로 내려간다."""
    monkeypatch.setattr(auth, "_check_lockout", lambda: 300)
    resp = auth.handle_login({"password": _GOOD}, {}, {})
    assert resp["statusCode"] == 423
    body = json.loads(resp["body"])
    assert body["message"] == "locked out"
    assert body["retry_after_seconds"] == 300
    assert_no_cors(resp)


def test_password_change_requires_both_fields(wired) -> None:
    resp = admin_password.handle_change({"old": _GOOD}, {}, {})
    assert resp["statusCode"] == 400
    assert json.loads(resp["body"])["message"] == "old and new required"
    assert_no_cors(resp)


def test_password_change_enforces_min_length(wired) -> None:
    resp = admin_password.handle_change({"old": _GOOD, "new": "short"}, {}, {})
    assert resp["statusCode"] == 400
    assert "at least 12" in json.loads(resp["body"])["message"]
    assert_no_cors(resp)


def test_password_change_rejects_same_password(wired) -> None:
    resp = admin_password.handle_change({"old": _GOOD, "new": _GOOD}, {}, {})
    assert resp["statusCode"] == 400
    assert json.loads(resp["body"])["message"] == "new password must differ from old"
    assert_no_cors(resp)


def test_password_change_old_mismatch_is_401(wired) -> None:
    resp = admin_password.handle_change({"old": "nope", "new": "a-long-enough-pw"}, {}, {})
    assert resp["statusCode"] == 401
    assert json.loads(resp["body"])["message"] == "old password mismatch"
    assert_no_cors(resp)


def test_password_change_success_returns_ok(wired) -> None:
    resp = admin_password.handle_change({"old": _GOOD, "new": "a-long-enough-pw"}, {}, {})
    assert resp["statusCode"] == 200
    assert json.loads(resp["body"]) == {"ok": True}
    assert_no_cors(resp)
```

- [ ] **Step 4: 테스트를 실행해 전부 통과하는지 확인한다**

Run: `cd service/backend && python3 -m pytest admin/tests/test_auth_routes.py -v`
Expected: PASS 9개. characterization 이므로 **처음부터 통과해야 정상**이다 — 실패하면 현재 동작을 잘못 기술한 것이니 프로덕션 코드가 아니라 테스트를 고친다.

- [ ] **Step 5: 전체 테스트로 회귀가 없는지 확인한다**

Run: `cd service/backend && python3 -m pytest admin/tests -q`
Expected: `51 passed` (기존 42 + 신규 9)

- [ ] **Step 6: 커밋**

```bash
cd /Users/minseolee/Desktop/ailens-sedaily
git add service/backend/admin/tests/conftest.py service/backend/admin/tests/test_auth_routes.py
git commit -F - <<'EOF'
test(admin): auth 라우트 characterization + 공용 fake 하네스

4단계 백엔드 정비에 앞서 이관 대상의 현재 동작을 박제한다. 이관 대상 12개
라우트에 테스트가 0개라 "동작을 안 바꿨다"를 증명할 수단이 없었다.

conftest 에 FakeTable/FakeSSM/FakeEB 와 assert_no_cors 를 둔다. assert_no_cors
가 이번 작업의 핵심 방어선이다 — common/ 이관 중 core/response.py 의
CORS_HEADERS 가 admin 으로 새어 들어오면 즉시 잡힌다.

login 의 lockout 응답은 retry_after_seconds 가 body 최상위에 온다는 사실까지
박제했다. 4단계에서 details 로 내려가므로 그때 이 단언을 명시적으로 고친다.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
```

---

### Task 2: drivers 라우트 characterization

**Files:**
- Create: `service/backend/admin/tests/test_drivers_routes.py`

**Interfaces:**
- Consumes: `conftest.FakeTable` · `FakeEB` · `assert_no_cors` (Task 1)
- Produces: 없음 (테스트 전용)

- [ ] **Step 1: 테스트를 작성한다**

`service/backend/admin/tests/test_drivers_routes.py`:

```python
"""drivers 4개 라우트의 현재 응답을 박제한다 (characterization).

Run from service/backend/::

    python3 -m pytest admin/tests/test_drivers_routes.py -v
"""
from __future__ import annotations

import json

import pytest

from conftest import FakeEB, FakeTable, assert_no_cors

import auth
from routes import drivers
from shared import ddb_client


@pytest.fixture
def wired(monkeypatch) -> tuple[FakeTable, FakeEB]:
    table = FakeTable(items=[
        {"pk": "CONFIG", "sk": "feature-flag/v2-selector", "value": {"enabled": True}},
        {"pk": "CONFIG", "sk": "threshold/max-articles", "value": {"threshold": 30}},
    ])
    eb = FakeEB(rules=[{"name": "sedaily-mbti-v2-selector-trigger", "state": "ENABLED",
                        "schedule": "rate(1 hour)", "preset": "1h"}])
    monkeypatch.setattr(ddb_client, "config_table", lambda: table)
    monkeypatch.setattr(drivers.eb_client, "list_rules", eb.list_rules)
    monkeypatch.setattr(drivers.eb_client, "enable_rule", eb.enable_rule)
    monkeypatch.setattr(drivers.eb_client, "disable_rule", eb.disable_rule)
    monkeypatch.setattr(drivers.eb_client, "set_schedule", eb.set_schedule)
    monkeypatch.setattr(drivers.eb_client, "describe_rule", eb.describe_rule)
    monkeypatch.setattr(auth, "audit_log", lambda *a, **k: None)
    return table, eb


def test_list_returns_rules_flags_thresholds(wired) -> None:
    resp = drivers.handle_list({}, {}, {})
    assert resp["statusCode"] == 200
    body = json.loads(resp["body"])
    assert set(body) == {"rules", "feature_flags", "thresholds"}
    assert body["feature_flags"] == {"v2-selector": True}
    assert body["thresholds"] == {"max-articles": 30}
    assert_no_cors(resp)


def test_update_requires_driver_id(wired) -> None:
    resp = drivers.handle_update({"action": "enable"}, {}, {})
    assert resp["statusCode"] == 400
    assert json.loads(resp["body"])["message"] == "driver id required"
    assert_no_cors(resp)


def test_update_rejects_foreign_prefix(wired) -> None:
    resp = drivers.handle_update({"action": "enable"}, {"id": "other-rule"}, {})
    assert resp["statusCode"] == 400
    assert "sedaily-mbti-" in json.loads(resp["body"])["message"]
    assert_no_cors(resp)


def test_update_rejects_unknown_action(wired) -> None:
    resp = drivers.handle_update({"action": "nuke"}, {"id": "sedaily-mbti-x"}, {})
    assert resp["statusCode"] == 400
    assert json.loads(resp["body"])["message"] == "action must be one of: enable, disable, set-cron"
    assert_no_cors(resp)


def test_update_enable_returns_ok_and_rule(wired) -> None:
    _, eb = wired
    resp = drivers.handle_update({"action": "enable"}, {"id": "sedaily-mbti-x"}, {})
    assert resp["statusCode"] == 200
    body = json.loads(resp["body"])
    assert body["ok"] is True
    assert set(body) == {"ok", "rule"}
    assert eb.enabled == ["sedaily-mbti-x"]
    assert_no_cors(resp)


def test_update_set_cron_rejects_unknown_preset(wired) -> None:
    resp = drivers.handle_update(
        {"action": "set-cron", "cron_preset": "99y"}, {"id": "sedaily-mbti-x"}, {})
    assert resp["statusCode"] == 400
    assert "cron_preset must be one of" in json.loads(resp["body"])["message"]
    assert_no_cors(resp)


def test_feature_flag_requires_name(wired) -> None:
    resp = drivers.handle_feature_flag_update({"action": "enable"}, {}, {})
    assert resp["statusCode"] == 400
    assert json.loads(resp["body"])["message"] == "flag name required"
    assert_no_cors(resp)


def test_feature_flag_rejects_unknown_action(wired) -> None:
    resp = drivers.handle_feature_flag_update({"action": "toggle"}, {"name": "f"}, {})
    assert resp["statusCode"] == 400
    assert json.loads(resp["body"])["message"] == "action must be one of: enable, disable"
    assert_no_cors(resp)


def test_feature_flag_enable_writes_and_returns_shape(wired) -> None:
    table, _ = wired
    resp = drivers.handle_feature_flag_update({"action": "enable"}, {"name": "f"}, {})
    assert resp["statusCode"] == 200
    body = json.loads(resp["body"])
    assert set(body) == {"flag", "enabled", "updated_at"}
    assert body["flag"] == "f" and body["enabled"] is True
    assert len(table.update_calls) == 1
    assert_no_cors(resp)


def test_threshold_requires_name(wired) -> None:
    resp = drivers.handle_threshold_update({"value": 5}, {}, {})
    assert resp["statusCode"] == 400
    assert json.loads(resp["body"])["message"] == "threshold name required"
    assert_no_cors(resp)


def test_threshold_rejects_non_integer(wired) -> None:
    resp = drivers.handle_threshold_update({"value": "abc"}, {"name": "t"}, {})
    assert resp["statusCode"] == 400
    assert json.loads(resp["body"])["message"] == "value must be integer"
    assert_no_cors(resp)


@pytest.mark.parametrize("value", [0, 10001])
def test_threshold_enforces_range(wired, value: int) -> None:
    resp = drivers.handle_threshold_update({"value": value}, {"name": "t"}, {})
    assert resp["statusCode"] == 400
    assert json.loads(resp["body"])["message"] == "value out of range (1..10000)"
    assert_no_cors(resp)


def test_threshold_success_returns_shape(wired) -> None:
    resp = drivers.handle_threshold_update({"value": 30}, {"name": "t"}, {})
    assert resp["statusCode"] == 200
    body = json.loads(resp["body"])
    assert set(body) == {"threshold", "value", "updated_at"}
    assert body["value"] == 30
    assert_no_cors(resp)
```

- [ ] **Step 2: 테스트를 실행한다**

Run: `cd service/backend && python3 -m pytest admin/tests/test_drivers_routes.py -v`
Expected: PASS 14개 (`test_threshold_enforces_range` 가 parametrize 로 2개)

- [ ] **Step 3: 전체 회귀 확인**

Run: `cd service/backend && python3 -m pytest admin/tests -q`
Expected: `65 passed`

- [ ] **Step 4: 커밋**

```bash
cd /Users/minseolee/Desktop/ailens-sedaily
git add service/backend/admin/tests/test_drivers_routes.py
git commit -F - <<'EOF'
test(admin): drivers 4개 라우트 characterization

rule 갱신 · feature flag · threshold 의 검증 분기와 성공 응답 형태를 박제했다.
audit_log 는 no-op 으로 대체한다 — 2단계에서 호출 방식이 바뀌므로 여기서
결합하지 않는다.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
```

---

### Task 3: prompts 라우트 characterization

**Files:**
- Create: `service/backend/admin/tests/test_prompts_routes.py`

**Interfaces:**
- Consumes: `conftest.FakeTable` · `assert_no_cors` (Task 1)
- Produces: 없음

- [ ] **Step 1: 테스트를 작성한다**

`service/backend/admin/tests/test_prompts_routes.py`:

```python
"""prompts 3개 라우트의 현재 응답을 박제한다 (characterization).

DDB schema: pk='PROMPT#<category>/<name>', sk='v#<int>' | 'LATEST'

Run from service/backend/::

    python3 -m pytest admin/tests/test_prompts_routes.py -v
"""
from __future__ import annotations

import json

import pytest

from conftest import FakeTable, assert_no_cors

import auth
from routes import prompts
from shared import ddb_client

_PK = "PROMPT#transform/nt"


@pytest.fixture
def wired(monkeypatch) -> FakeTable:
    # v# 행을 넣어야 handle_get 의 이력 구성 로직(sk 파싱 · 내림차순 · Limit)이
    # 실제로 실행된다. LATEST 행만 두면 begins_with("v#") 가 0건을 잡아
    # history 가 항상 [] 이 되고, 그 로직이 통째로 사라져도 테스트가 통과한다.
    table = FakeTable(
        items=[
            {"pk": _PK, "sk": "LATEST", "active_version": 3, "updated_at": "2026-07-01T00:00:00Z"},
            {"pk": _PK, "sk": "v#1", "created_at": "2026-06-01T00:00:00Z", "actor": "admin"},
            {"pk": _PK, "sk": "v#2", "created_at": "2026-06-15T00:00:00Z", "actor": "admin"},
            {"pk": _PK, "sk": "v#3", "created_at": "2026-07-01T00:00:00Z", "actor": "admin"},
        ],
        get_map={
            (_PK, "LATEST"): {"pk": _PK, "sk": "LATEST", "active_version": 3},
            (_PK, "v#3"): {"pk": _PK, "sk": "v#3", "content": "본문 v3"},
        },
    )
    monkeypatch.setattr(ddb_client, "prompts_table", lambda: table)
    monkeypatch.setattr(auth, "audit_log", lambda *a, **k: None)
    return table


def test_list_strips_prefix_and_sorts(wired) -> None:
    resp = prompts.handle_list({}, {}, {})
    assert resp["statusCode"] == 200
    body = json.loads(resp["body"])
    assert list(body) == ["prompts"]
    assert body["prompts"] == [
        {"id": "transform/nt", "active_version": 3, "updated_at": "2026-07-01T00:00:00Z"}
    ]
    assert_no_cors(resp)


def test_get_requires_category_and_name(wired) -> None:
    resp = prompts.handle_get({}, {"category": "transform"}, {})
    assert resp["statusCode"] == 400
    assert json.loads(resp["body"])["message"] == "category and name required"
    assert_no_cors(resp)


def test_get_missing_prompt_is_404(wired) -> None:
    resp = prompts.handle_get({}, {"category": "nope", "name": "x"}, {})
    assert resp["statusCode"] == 404
    assert json.loads(resp["body"])["message"] == "prompt not found: nope/x"
    assert_no_cors(resp)


def test_get_returns_active_content_and_history(wired) -> None:
    resp = prompts.handle_get({}, {"category": "transform", "name": "nt"}, {})
    assert resp["statusCode"] == 200
    body = json.loads(resp["body"])
    assert set(body) == {"id", "active_content", "active_version", "history"}
    assert body["id"] == "transform/nt"
    assert body["active_content"] == "본문 v3"
    assert body["active_version"] == 3
    # sk 파싱(v#N → N) · 내림차순 · 필드 매핑을 한 번에 고정한다.
    assert body["history"] == [
        {"version": 3, "created_at": "2026-07-01T00:00:00Z", "actor": "admin"},
        {"version": 2, "created_at": "2026-06-15T00:00:00Z", "actor": "admin"},
        {"version": 1, "created_at": "2026-06-01T00:00:00Z", "actor": "admin"},
    ]
    assert_no_cors(resp)


def test_get_history_is_capped_at_ten(monkeypatch) -> None:
    """Limit=10 절단을 고정한다 — 위 테스트는 3건뿐이라 이 경로를 안 탄다."""
    rows = [{"pk": _PK, "sk": "LATEST", "active_version": 12}]
    rows += [
        {"pk": _PK, "sk": f"v#{n}", "created_at": f"2026-07-{n:02d}T00:00:00Z", "actor": "admin"}
        for n in range(1, 13)
    ]
    table = FakeTable(
        items=rows,
        get_map={
            (_PK, "LATEST"): {"pk": _PK, "sk": "LATEST", "active_version": 12},
            (_PK, "v#12"): {"pk": _PK, "sk": "v#12", "content": "본문 v12"},
        },
    )
    monkeypatch.setattr(ddb_client, "prompts_table", lambda: table)

    body = json.loads(prompts.handle_get({}, {"category": "transform", "name": "nt"}, {})["body"])
    assert len(body["history"]) == 10
    # sk 는 문자열이라 DynamoDB 도 사전순으로 정렬한다 — v#9 가 v#12 보다 크다.
    assert [h["version"] for h in body["history"]] == [9, 8, 7, 6, 5, 4, 3, 2, 12, 11]


def test_update_requires_content(wired) -> None:
    resp = prompts.handle_update({}, {"category": "transform", "name": "nt"}, {})
    assert resp["statusCode"] == 400
    assert json.loads(resp["body"])["message"] == "content required"
    assert_no_cors(resp)


def test_update_missing_prompt_is_404(wired) -> None:
    resp = prompts.handle_update({"content": "x"}, {"category": "nope", "name": "y"}, {})
    assert resp["statusCode"] == 404
    assert json.loads(resp["body"])["message"] == "prompt not found: nope/y"
    assert_no_cors(resp)


def test_update_bumps_version_and_writes_both_rows(wired) -> None:
    resp = prompts.handle_update({"content": "본문 v4"}, {"category": "transform", "name": "nt"}, {})
    assert resp["statusCode"] == 200
    body = json.loads(resp["body"])
    assert body == {"ok": True, "new_version": 4}
    assert wired.put_calls[0]["sk"] == "v#4"
    assert wired.put_calls[0]["content"] == "본문 v4"
    assert len(wired.update_calls) == 1
    assert_no_cors(resp)
```

- [ ] **Step 2: 테스트를 실행한다**

Run: `cd service/backend && python3 -m pytest admin/tests/test_prompts_routes.py -v`
Expected: PASS 8개 (기존 7 + 이력 절단 테스트 1)

- [ ] **Step 3: 전체 회귀 확인**

Run: `cd service/backend && python3 -m pytest admin/tests -q`
Expected: `72 passed`

- [ ] **Step 4: 커밋**

```bash
cd /Users/minseolee/Desktop/ailens-sedaily
git add service/backend/admin/tests/test_prompts_routes.py
git commit -F - <<'EOF'
test(admin): prompts 3개 라우트 characterization

목록의 PROMPT# 접두 제거, 상세의 active_content + history 구성, 갱신의
버전 증가(v#N → v#N+1 put + LATEST update)를 박제했다.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
```

---

### Task 4: 읽기 전용 라우트 characterization (cost · audit · newsletter)

**Files:**
- Create: `service/backend/admin/tests/test_readonly_routes.py`

**Interfaces:**
- Consumes: `conftest.FakeTable` · `assert_no_cors` (Task 1)
- Produces: 없음

세 라우트의 확인된 계약:

| 라우트 | 응답 최상위 키 | 외부 의존 | 실패 분기 |
|---|---|---|---|
| `audit.handle_list` | `audits` · `count` | `ddb_client.config_table()` | `limit` 비정수 → 400 |
| `cost.handle_summary` | `by_lambda` · `total_7d_usd` · `note` | `cw_client.get_token_sum` | 없음 |
| `newsletter.handle_stats` | `subscribers` · `metrics` | 모듈 전역 `_ddb` · `_ses_sum` | scan 실패 → 500 |

- [ ] **Step 1: 테스트 파일을 작성한다**

```python
"""cost · audit · newsletter 의 현재 응답을 박제한다 (characterization).

Run from service/backend/::

    python3 -m pytest admin/tests/test_readonly_routes.py -v
"""
from __future__ import annotations

import json

import pytest

from conftest import FakeTable, assert_no_cors

from routes import audit as audit_route
from shared import ddb_client

_ROWS = [
    {"pk": "AUDIT", "sk": "2026-07-29T05:00:00.000000Z", "action": "login-success",
     "actor": "admin"},
    {"pk": "AUDIT", "sk": "2026-07-29T04:00:00.000000Z", "action": "prompt-update",
     "actor": "admin", "detail": {"prompt": "transform/nt"}},
]


@pytest.fixture
def wired(monkeypatch) -> FakeTable:
    table = FakeTable(items=_ROWS)
    monkeypatch.setattr(ddb_client, "config_table", lambda: table)
    return table


def test_audit_default_limit_and_shape(wired) -> None:
    resp = audit_route.handle_list({}, {}, {})
    assert resp["statusCode"] == 200
    body = json.loads(resp["body"])
    assert set(body) == {"audits", "count"}
    assert body["count"] == 2
    assert set(body["audits"][0]) == {"ts", "action", "detail", "actor"}
    assert body["audits"][0]["ts"] == "2026-07-29T05:00:00.000000Z"
    assert_no_cors(resp)


def test_audit_rejects_non_integer_limit(wired) -> None:
    resp = audit_route.handle_list({}, {}, {"limit": "abc"})
    assert resp["statusCode"] == 400
    assert json.loads(resp["body"])["message"] == "limit must be integer"
    assert_no_cors(resp)


def test_audit_clamps_limit_to_max(wired) -> None:
    audit_route.handle_list({}, {}, {"limit": "9999"})
    assert wired.query_calls[-1]["Limit"] == audit_route.MAX_LIMIT


def test_audit_clamps_limit_to_min(wired) -> None:
    audit_route.handle_list({}, {}, {"limit": "0"})
    assert wired.query_calls[-1]["Limit"] == 1


def test_audit_queries_descending(wired) -> None:
    audit_route.handle_list({}, {}, {})
    assert wired.query_calls[-1]["ScanIndexForward"] is False


# --------------------------------------------------------------------------- cost

from routes import cost as cost_route


@pytest.fixture
def cw_tokens(monkeypatch) -> None:
    """input 200만 · output 100만.

    두 값을 **다르게** 둬야 입출력이 뒤바뀌는 회귀를 잡는다. 같은 값이면
    cost.py 의 input_per_1m/output_per_1m 이 서로 swap 되거나 어느 합계가
    어느 필드로 가는지가 뒤바뀌어도 결과가 동일해 테스트가 통과한다.
    """
    def _sum(**kwargs) -> float:
        token_type = next(
            d["Value"] for d in kwargs["dimensions"] if d["Name"] == "TokenType"
        )
        return 2_000_000.0 if token_type == "input" else 1_000_000.0

    monkeypatch.setattr(cost_route.cw_client, "get_token_sum", _sum)


def test_cost_summary_top_level_shape(cw_tokens) -> None:
    resp = cost_route.handle_summary({}, {}, {})
    assert resp["statusCode"] == 200
    body = json.loads(resp["body"])
    assert set(body) == {"by_lambda", "total_7d_usd", "note"}
    assert set(body["by_lambda"]) == {"transform-dev"}
    assert_no_cors(resp)


def test_cost_opus_entry_prices_input_and_output(cw_tokens) -> None:
    body = json.loads(cost_route.handle_summary({}, {}, {})["body"])
    entry = body["by_lambda"]["transform-dev"]["opus-4-6"]
    assert entry["input_tokens"] == 2_000_000
    assert entry["output_tokens"] == 1_000_000
    # 2M * $15/1M + 1M * $75/1M = 105.0. 입출력이 뒤바뀌면 165.0 이 되어 실패한다.
    assert entry["cost_usd"] == 105.0


def test_cost_titan_entry_omits_output_tokens(cw_tokens) -> None:
    """has_output=False 인 모델은 output_tokens 키 자체가 없다."""
    body = json.loads(cost_route.handle_summary({}, {}, {})["body"])
    titan = body["by_lambda"]["transform-dev"]["titan-v2"]
    assert "output_tokens" not in titan
    assert titan["input_tokens"] == 2_000_000
    assert titan["cost_usd"] == 0.04


def test_cost_total_sums_all_models(cw_tokens) -> None:
    body = json.loads(cost_route.handle_summary({}, {}, {})["body"])
    assert body["total_7d_usd"] == 105.04


# --------------------------------------------------------------- newsletter

from routes import newsletter as nl_route


class _FakeScanTable:
    def __init__(self, items: list[dict], raise_on_scan: bool = False):
        self._items = items
        self._raise = raise_on_scan

    def scan(self, **kwargs) -> dict:
        if self._raise:
            raise RuntimeError("ddb down")
        return {"Items": list(self._items)}


class _FakeDdb:
    def __init__(self, table: _FakeScanTable):
        self._table = table

    def Table(self, name: str) -> _FakeScanTable:
        return self._table


_SUBS = [
    {"email": "abcd@x.com", "mbti_group": "NT", "status": "active", "created_at": "2026-07-01"},
    {"email": "ef@y.com", "mbti_group": "NF", "status": "unsubscribed", "created_at": "2026-06-01"},
]

# 지표마다 값을 다르게 둔다. 전부 같은 값이면 open_rate/click_rate/delivery_rate
# 계산이 서로 뒤바뀌어도 셋 다 같은 수가 나와 회귀를 감지할 수 없다.
_SES = {"Send": 100, "Delivery": 90, "Open": 50, "Click": 10, "Bounce": 5, "Complaint": 2}


def test_newsletter_stats_shape_and_active_only_grouping(monkeypatch) -> None:
    monkeypatch.setattr(nl_route, "_ddb", _FakeDdb(_FakeScanTable(_SUBS)))
    monkeypatch.setattr(nl_route, "_ses_sum", lambda metric, days: 100)

    resp = nl_route.handle_stats({}, {}, {})
    assert resp["statusCode"] == 200
    body = json.loads(resp["body"])
    assert set(body) == {"subscribers", "metrics"}
    subs = body["subscribers"]
    assert set(subs) == {"total", "active", "by_group", "recent"}
    assert subs["total"] == 2
    assert subs["active"] == 1
    # by_group 은 active 만 센다. 4개 그룹 키가 항상 존재한다.
    assert subs["by_group"] == {"NT": 1, "NF": 0, "ST": 0, "SF": 0}
    assert_no_cors(resp)


def test_newsletter_masks_recent_emails(monkeypatch) -> None:
    monkeypatch.setattr(nl_route, "_ddb", _FakeDdb(_FakeScanTable(_SUBS)))
    monkeypatch.setattr(nl_route, "_ses_sum", lambda metric, days: 0)
    body = json.loads(nl_route.handle_stats({}, {}, {})["body"])
    emails = [r["email"] for r in body["subscribers"]["recent"]]
    assert "a**d@x.com" in emails      # local 4자 → 첫·끝 남기고 마스킹
    assert "e*@y.com" in emails        # local 2자 이하 → 첫 글자 + '*'


def test_newsletter_computes_rates_from_ses_sums(monkeypatch) -> None:
    monkeypatch.setattr(nl_route, "_ddb", _FakeDdb(_FakeScanTable([])))
    monkeypatch.setattr(nl_route, "_ses_sum", lambda metric, days: _SES[metric])
    metrics = json.loads(nl_route.handle_stats({}, {}, {})["body"])["metrics"]
    # 셋이 서로 다른 값이라 계산이 뒤바뀌면 반드시 하나 이상 실패한다.
    assert metrics["open_rate"] == 50.0
    assert metrics["click_rate"] == 10.0
    assert metrics["delivery_rate"] == 90.0
    # 응답 스키마에 있으나 비율 계산에는 안 쓰이는 두 지표도 그대로 실려야 한다.
    assert metrics["bounce"] == 5
    assert metrics["complaint"] == 2


def test_newsletter_rates_are_zero_when_no_sends(monkeypatch) -> None:
    """0 나눗셈 방어 — send 가 0이면 세 비율 전부 0.0."""
    monkeypatch.setattr(nl_route, "_ddb", _FakeDdb(_FakeScanTable([])))
    monkeypatch.setattr(nl_route, "_ses_sum", lambda metric, days: 0)
    metrics = json.loads(nl_route.handle_stats({}, {}, {})["body"])["metrics"]
    assert metrics["open_rate"] == 0.0
    assert metrics["click_rate"] == 0.0
    assert metrics["delivery_rate"] == 0.0


@pytest.mark.parametrize("raw,expected", [("0", 1), ("999", 90), ("abc", 7), (None, 7)])
def test_newsletter_clamps_days(monkeypatch, raw, expected: int) -> None:
    monkeypatch.setattr(nl_route, "_ddb", _FakeDdb(_FakeScanTable([])))
    monkeypatch.setattr(nl_route, "_ses_sum", lambda metric, days: 0)
    qp = {} if raw is None else {"days": raw}
    body = json.loads(nl_route.handle_stats({}, {}, qp)["body"])
    assert body["metrics"]["days"] == expected


def test_newsletter_scan_failure_is_500(monkeypatch) -> None:
    monkeypatch.setattr(nl_route, "_ddb", _FakeDdb(_FakeScanTable([], raise_on_scan=True)))
    resp = nl_route.handle_stats({}, {}, {})
    assert resp["statusCode"] == 500
    assert json.loads(resp["body"])["message"] == "subscribers scan failed"
    assert_no_cors(resp)
```

- [ ] **Step 2: 테스트를 실행한다**

Run: `cd service/backend && python3 -m pytest admin/tests/test_readonly_routes.py -v`
Expected: PASS 18개 (audit 5 + cost 4 + newsletter 9, `clamps_days` parametrize 4 포함)

- [ ] **Step 3: 전체 회귀 확인 — 1단계 완료 기준**

Run: `cd service/backend && python3 -m pytest admin/tests -q`
Expected: 전부 통과. 이 시점의 통과 개수를 기록해 둔다 — **2단계에서 이 숫자와 각 테스트가 그대로 통과해야 한다.**

- [ ] **Step 4: 커밋**

```bash
cd /Users/minseolee/Desktop/ailens-sedaily
git add service/backend/admin/tests/test_readonly_routes.py
git commit -F - <<'EOF'
test(admin): cost · audit · newsletter characterization — 1단계 완료

이관 대상 12개 라우트의 현재 동작 박제를 마쳤다. audit 은 limit 파싱·범위
클램프(1..200)·내림차순 조회까지 고정했다 — 2단계에서 커서 페이지네이션을
붙일 때 기존 동작이 안 깨졌는지 이 테스트가 판정한다.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
```

---

# 단계 2 — audit 전면 정비 (Task 5–8)

**이 단계에서 1단계 테스트가 한 줄도 바뀌면 안 된다.** audit 은 부수효과이므로 응답이 변하면 버그다.

### Task 5: `shared/audit.py` 분리 + sk 충돌 해결

**Files:**
- Create: `service/backend/admin/shared/audit.py`
- Create: `service/backend/admin/tests/test_audit.py`
- Modify: `service/backend/admin/auth.py` (`audit_log` 제거 → 위임)
- Modify: `service/backend/admin/routes/drivers.py:89,120,155` · `routes/prompts.py:137` · `routes/admin_password.py:30,36`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `audit.bind_context(session: str | None, source_ip: str | None) -> None`
  - `audit.log(action: str, detail: dict | None = None) -> None`
  - `audit.reset_context() -> None` (테스트용)
  Task 6·7 이 이 세 함수를 쓴다.

- [ ] **Step 1: 실패하는 테스트를 작성한다**

`service/backend/admin/tests/test_audit.py`:

```python
"""audit 모듈 — 컨텍스트 바인딩 · sk 충돌 회피 · fail-open.

Run from service/backend/::

    python3 -m pytest admin/tests/test_audit.py -v
"""
from __future__ import annotations

import pytest

from conftest import FakeTable

from shared import audit, ddb_client


@pytest.fixture(autouse=True)
def _clean() -> None:
    audit.reset_context()
    yield
    audit.reset_context()


@pytest.fixture
def table(monkeypatch) -> FakeTable:
    t = FakeTable()
    monkeypatch.setattr(ddb_client, "config_table", lambda: t)
    return t


def test_log_writes_audit_row_with_required_keys(table) -> None:
    audit.log("post-publish", {"id": "abc"})
    assert len(table.put_calls) == 1
    item = table.put_calls[0]
    assert item["pk"] == "AUDIT"
    assert item["action"] == "post-publish"
    assert item["actor"] == "admin"
    assert item["detail"] == {"id": "abc"}


def test_sk_carries_random_suffix_after_iso_timestamp(table) -> None:
    audit.log("a")
    audit.log("b")
    sk_a, sk_b = table.put_calls[0]["sk"], table.put_calls[1]["sk"]
    for sk in (sk_a, sk_b):
        stamp, _, suffix = sk.partition("#")
        assert stamp.endswith("Z")
        assert len(suffix) == 4
        int(suffix, 16)          # hex 로 파싱되지 않으면 여기서 ValueError
    assert sk_a != sk_b


def test_sk_sorts_chronologically_against_legacy_rows(table) -> None:
    """ISO 접두가 정렬을 지배한다 — 접미 없는 기존 행과 섞여도 시간순이 보존된다.

    하드코딩한 문자열 둘을 비교하면 sk 생성 로직이 어떻게 망가져도(접미를 앞에
    붙이거나 타임스탬프 포맷을 바꿔도) 통과한다. 실제 audit.log() 가 만든 sk 로
    판정해야 회귀를 잡는다.
    """
    audit.log("a")
    new_sk = table.put_calls[0]["sk"]
    stamp = new_sk.split("#")[0]

    assert "2026-01-01T00:00:00.000000Z" < new_sk    # 과거의 접미 없는 행이 앞
    assert new_sk < "2099-01-01T00:00:00.000000Z"    # 미래의 접미 없는 행이 뒤
    # 타임스탬프가 같으면 접미 없는 쪽(짧은 문자열)이 먼저다 — 덮어쓰기가 아니라 공존.
    assert stamp < new_sk


def test_bind_context_is_merged_into_row(table) -> None:
    audit.bind_context(session="2026-07-29T04:00:00Z", source_ip="203.0.113.7")
    audit.log("driver-update")
    item = table.put_calls[0]
    assert item["session"] == "2026-07-29T04:00:00Z"
    assert item["source_ip"] == "203.0.113.7"


def test_unbound_context_omits_optional_keys(table) -> None:
    audit.log("driver-update")
    item = table.put_calls[0]
    assert "session" not in item
    assert "source_ip" not in item


def test_log_is_fail_open_when_ddb_raises(monkeypatch) -> None:
    """감사 실패가 주 흐름을 막으면 안 된다 — raise 하지 않는다."""
    def boom():
        raise RuntimeError("ddb down")
    monkeypatch.setattr(ddb_client, "config_table", boom)
    audit.log("post-delete", {"id": "x"})   # 예외가 새어 나오면 실패


def test_reset_context_clears_previous_binding(table) -> None:
    audit.bind_context(session="s1", source_ip="1.1.1.1")
    audit.reset_context()
    audit.log("x")
    assert "session" not in table.put_calls[0]
```

- [ ] **Step 2: 테스트를 실행해 실패를 확인한다**

Run: `cd service/backend && python3 -m pytest admin/tests/test_audit.py -v`
Expected: FAIL — `ImportError: cannot import name 'audit' from 'shared'`

- [ ] **Step 3: `shared/audit.py` 를 작성한다**

`service/backend/admin/shared/audit.py`:

```python
"""감사 로그 — 요청 컨텍스트 바인딩 + DDB 기록.

auth.py 에서 분리했다. 인증과 감사는 다른 관심사이고, 분리 전에는 routes/* 가
감사를 쓰려고 auth 를 import 해야 했다.

sk 는 'ISO8601(ms)#<4자 hex>' 형식이다. pk='AUDIT' 고정에 sk 가 ms 타임스탬프
뿐이면 같은 ms 의 두 건이 put_item 으로 덮어써져 조용히 사라진다. ISO 접두가
정렬을 지배하므로 접미가 붙어도 시간순이 보존되고, 접미 없는 기존 행과 섞여도
순서가 맞는다 — 마이그레이션이 필요 없다.

fail-open: 감사 실패가 글 발행을 막는 쪽이 더 나쁘다. raise 하지 않고 warning 만
남긴다.
"""

from __future__ import annotations

import datetime as dt
import logging
import secrets
from contextvars import ContextVar

from shared import ddb_client

logger = logging.getLogger(__name__)

_ctx: ContextVar[dict] = ContextVar("audit_ctx", default={})


def _now_iso_ms() -> str:
    return dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def bind_context(session: str | None = None, source_ip: str | None = None) -> None:
    """요청 스코프 컨텍스트를 설정한다. handler 가 dispatch 직전에 호출한다."""
    ctx: dict = {}
    if session:
        ctx["session"] = session
    if source_ip:
        ctx["source_ip"] = source_ip
    _ctx.set(ctx)


def reset_context() -> None:
    _ctx.set({})


def log(action: str, detail: dict | None = None) -> None:
    """audit row 1건 추가. 실패해도 raise 하지 않는다."""
    try:
        item: dict = {
            "pk": "AUDIT",
            "sk": f"{_now_iso_ms()}#{secrets.token_hex(2)}",
            "action": action,
            "actor": "admin",
        }
        item.update(_ctx.get())
        if detail is not None:
            item["detail"] = detail
        ddb_client.config_table().put_item(Item=item)
    except Exception as e:
        logger.warning(f"audit.log failed for action={action}: {type(e).__name__}: {e}")
```

- [ ] **Step 4: 테스트를 실행해 통과를 확인한다**

Run: `cd service/backend && python3 -m pytest admin/tests/test_audit.py -v`
Expected: PASS 7개

- [ ] **Step 5: `auth.py` 의 `audit_log` 를 위임으로 바꾼다**

`service/backend/admin/auth.py` — `audit_log` 함수 본문(86-96행)을 지우고 위임 별칭으로 대체한다. `from shared import audit` 를 import 블록에 추가한다.

```python
from shared import audit, ddb_client, response, ssm_client


def audit_log(action: str, detail: dict | None = None, actor: str = "admin") -> None:
    """하위호환 별칭 — shared.audit.log 로 위임한다.

    actor 인자는 무시된다. 호출 9곳 어디서도 기본값을 덮어쓰지 않았고,
    단일 공유 비밀번호 구조에서는 의미가 없다. 세션·출처 IP 는
    shared.audit 의 컨텍스트가 담는다.
    """
    audit.log(action, detail)
```

- [ ] **Step 6: 라우트 6곳의 호출을 `audit.log` 로 직접 바꾼다**

`auth.audit_log(...)` → `audit.log(...)` 로 바꾸고 각 파일의 import 를 조정한다.

| 파일 | 줄 | 변경 |
|---|---|---|
| `routes/drivers.py` | 89 · 120 · 155 | `auth.audit_log(` → `audit.log(` |
| `routes/prompts.py` | 137 | 동일 |
| `routes/admin_password.py` | 30 · 36 | 동일 |

각 파일의 `from shared import ...` 에 `audit` 을 추가한다. `drivers.py` 와 `prompts.py` 는 `auth` 를 audit 때문에만 import 하므로 **`import auth` 를 제거한다.** `admin_password.py` 는 `auth.PASSWORD_HASH_PARAM` 을 쓰므로 `import auth` 를 남긴다.

- [ ] **Step 7: 1단계 테스트가 그대로 통과하는지 확인한다 — 이 단계의 핵심 관문**

Run: `cd service/backend && python3 -m pytest admin/tests -q`
Expected: 전부 통과. **1단계 테스트 파일을 한 줄도 고치면 안 된다.**

`test_drivers_routes.py` 와 `test_prompts_routes.py` 가 `monkeypatch.setattr(auth, "audit_log", ...)` 로 패치하고 있는데, 라우트가 이제 `audit.log` 를 직접 부르므로 그 패치는 무효가 된다. 그래도 응답은 안 바뀐다 — 감사는 부수효과이기 때문이다.

`audit.log` 가 부르는 `ddb_client.config_table()` 은 **`conftest.py` 의 `block_real_aws` autouse 픽스처**가 fake 로 덮고 있다. `test_drivers_routes.py` 는 자기 fixture 에서도 패치하지만 `test_prompts_routes.py` 는 `prompts_table` 만 패치하므로, autouse 픽스처가 없으면 이 지점에서 **실제 운영 DDB 에 감사 행이 쓰인다.** 그것이 그 픽스처의 존재 이유다.

실패한다면 프로덕션 코드가 응답을 바꾼 것이니 프로덕션을 고친다.

- [ ] **Step 8: 커밋**

```bash
cd /Users/minseolee/Desktop/ailens-sedaily
git add service/backend/admin/shared/audit.py service/backend/admin/tests/test_audit.py \
        service/backend/admin/auth.py service/backend/admin/routes/drivers.py \
        service/backend/admin/routes/prompts.py service/backend/admin/routes/admin_password.py
git commit -F - <<'EOF'
refactor(admin): 감사 로그를 shared/audit.py 로 분리 + sk 충돌 해결

인증 모듈이 감사 로그를 겸하고 있어 routes/* 가 감사를 쓰려고 auth 를
import 해야 했다. 관심사를 분리했다.

sk 를 'ISO8601(ms)#<4자 hex>' 로 바꿔 같은 밀리초 덮어쓰기를 막는다. pk='AUDIT'
고정에 sk 가 ms 뿐이라 동일 ms 두 건이 put_item 으로 한 건 사라지는 구조였다.
ISO 접두가 정렬을 지배하므로 접미 없는 기존 행과 섞여도 시간순이 보존된다 —
마이그레이션이 필요 없다.

auth.audit_log 는 하위호환 별칭으로 남겼다. actor 인자는 무시한다 — 호출 9곳
어디서도 덮어쓰지 않았고 단일 공유 비밀번호에서는 의미가 없다.

1단계 characterization 테스트는 한 줄도 고치지 않았다. 감사는 부수효과이므로
응답이 변하면 안 된다.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
```

---

### Task 6: `handler.py` 에서 세션·IP 바인딩

**Files:**
- Modify: `service/backend/admin/handler.py:61-112`
- Create: `service/backend/admin/tests/test_handler_dispatch.py`

**Interfaces:**
- Consumes: `audit.bind_context` (Task 5)
- Produces: `handler._get_source_ip(event) -> str | None` · `handler._session_from_claims(claims) -> str | None`

- [ ] **Step 1: 실패하는 테스트를 작성한다**

`service/backend/admin/tests/test_handler_dispatch.py`:

```python
"""handler dispatch — 라우팅 · 인증 게이트 · 감사 컨텍스트 바인딩.

Run from service/backend/::

    python3 -m pytest admin/tests/test_handler_dispatch.py -v
"""
from __future__ import annotations

import json

import pytest

from conftest import assert_no_cors

import auth
import handler
from shared import audit


def _event(route_key: str, *, ip: str = "203.0.113.7", token: str = "Bearer t") -> dict:
    return {
        "requestContext": {"routeKey": route_key, "http": {"method": "GET", "path": "/admin/x",
                                                           "sourceIp": ip}},
        "headers": {"authorization": token},
        "body": "",
    }


@pytest.fixture(autouse=True)
def _clean() -> None:
    audit.reset_context()
    yield
    audit.reset_context()


def test_unknown_route_is_404(monkeypatch) -> None:
    resp = handler.lambda_handler(_event("GET /admin/nope"), None)
    assert resp["statusCode"] == 404
    assert json.loads(resp["body"])["message"] == "not found"
    assert_no_cors(resp)


def test_invalid_jwt_is_401(monkeypatch) -> None:
    def boom(_h):
        raise auth.AuthError("token expired")
    monkeypatch.setattr(auth, "verify_jwt", boom)
    resp = handler.lambda_handler(_event("GET /admin/cost"), None)
    assert resp["statusCode"] == 401
    assert json.loads(resp["body"])["message"] == "token expired"
    assert_no_cors(resp)


def _spy_route(seen: dict):
    """dispatch 시점의 감사 컨텍스트를 잡아내는 가짜 라우트."""
    def route(body, path_params, query_params):
        seen.update(audit._ctx.get())
        return {"statusCode": 200, "headers": {}, "body": "{}"}
    return route


def test_dispatch_binds_session_and_source_ip(monkeypatch) -> None:
    seen: dict = {}
    monkeypatch.setattr(auth, "verify_jwt", lambda _h: {"sub": "admin", "iat": 1785000000})
    # HANDLERS 는 dict 다. dict 의 get 은 읽기 전용이라 setattr 가 안 되므로
    # setitem 으로 라우트 하나를 갈아끼운다.
    monkeypatch.setitem(handler.HANDLERS, "GET /admin/cost", (_spy_route(seen), True))
    handler.lambda_handler(_event("GET /admin/cost"), None)
    assert seen["source_ip"] == "203.0.113.7"
    assert seen["session"] == "2026-07-25T17:20:00Z"


def test_public_route_binds_ip_without_session(monkeypatch) -> None:
    seen: dict = {}
    monkeypatch.setitem(handler.HANDLERS, "POST /admin/login", (_spy_route(seen), False))
    handler.lambda_handler(_event("POST /admin/login"), None)
    assert seen["source_ip"] == "203.0.113.7"
    assert "session" not in seen


def test_context_is_cleared_after_dispatch(monkeypatch) -> None:
    """warm 컨테이너의 다음 요청에 이전 세션이 새면 감사 로그가 거짓말을 한다."""
    seen: dict = {}
    monkeypatch.setattr(auth, "verify_jwt", lambda _h: {"sub": "admin", "iat": 1785000000})
    monkeypatch.setitem(handler.HANDLERS, "GET /admin/cost", (_spy_route(seen), True))
    handler.lambda_handler(_event("GET /admin/cost"), None)
    # dispatch 중에는 바인딩돼 있었고(이게 없으면 구현이 아예 없어도 통과한다)
    assert seen["session"] == "2026-07-25T17:20:00Z"
    # 끝난 뒤엔 비워졌다
    assert audit._ctx.get() == {}


def test_context_is_cleared_even_when_route_raises(monkeypatch) -> None:
    """finally 를 쓰는 유일한 이유 — 라우트가 터져도 리셋돼야 한다.

    이 단언이 없으면 bind(); route(); reset() 같은 예외 비안전 구현도 통과한다.
    실제로 이 경로를 보는 테스트가 하나도 없으면, 나중에 finally 가 조용히
    사라져도 아무도 모른다.
    """
    def boom(body: dict, path_params: dict, query_params: dict) -> dict:
        raise KeyError("boom")

    monkeypatch.setattr(auth, "verify_jwt", lambda _h: {"sub": "admin", "iat": 1785000000})
    monkeypatch.setitem(handler.HANDLERS, "GET /admin/cost", (boom, True))

    resp = handler.lambda_handler(_event("GET /admin/cost"), None)
    assert resp["statusCode"] == 500
    assert json.loads(resp["body"])["message"] == "internal server error"
    assert audit._ctx.get() == {}


def test_session_from_claims_converts_iat_to_iso() -> None:
    assert handler._session_from_claims({"iat": 1785000000}) == "2026-07-25T17:20:00Z"
    assert handler._session_from_claims({}) is None
    assert handler._session_from_claims(None) is None
```

- [ ] **Step 2: 테스트를 실행해 실패를 확인한다**

Run: `cd service/backend && python3 -m pytest admin/tests/test_handler_dispatch.py -v`
Expected: FAIL — `AttributeError: module 'handler' has no attribute '_session_from_claims'`

- [ ] **Step 3: `handler.py` 를 수정한다**

import 에 `from shared import audit, response` 로 `audit` 를 추가한다.

⚠️ **이름 충돌이 있다.** `handler.py:13-23` 은 이미 `from routes import (..., audit, ...)` 로
`GET /admin/audit` 라우트 모듈을 가져온다. `from shared import audit` 를 그냥 추가하면 뒤에 온
쪽이 앞을 덮어써 `HANDLERS` 정의 시점에 `AttributeError` 로 모듈 import 자체가 죽는다.
**`routes` 쪽을 `audit as audit_route` 로 별칭 처리하고** `HANDLERS` 의 해당 항목을
`audit_route.handle_list` 로 바꾼다. `tests/test_readonly_routes.py` 가 이미 쓰는 패턴이다.

그리고 아래 두 헬퍼를 `_get_authorization` 다음에 넣는다.

```python
def _get_source_ip(event: dict) -> str | None:
    http_ctx = (event.get("requestContext") or {}).get("http") or {}
    return http_ctx.get("sourceIp") or None


def _session_from_claims(claims: dict | None) -> str | None:
    """JWT iat 를 세션 식별자로 쓴다.

    로그인 시각이 그대로 식별자가 되므로 감사 로그를 읽는 사람에게
    "04:00 에 로그인한 세션이 한 일"이 즉시 이해된다. iat 는 민감 정보가
    아니므로 해시하지 않는다.
    """
    if not claims:
        return None
    iat = claims.get("iat")
    if not iat:
        return None
    return dt.datetime.fromtimestamp(int(iat), dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
```

파일 상단에 `import datetime as dt` 를 추가한다. `lambda_handler` 의 본문(93-112행)을 아래로 바꾼다.

```python
def lambda_handler(event: dict, context) -> dict:
    try:
        method, path, route_key, path_params, query_params, body = _parse_event(event)
        logger.info(f"admin: {method} {path} (routeKey={route_key})")

        handler_info = HANDLERS.get(route_key)
        if not handler_info:
            return response.err("not found", 404)
        handler_fn, jwt_required = handler_info

        claims: dict | None = None
        if jwt_required:
            try:
                claims = auth.verify_jwt(_get_authorization(event))
            except auth.AuthError as e:
                return response.err(str(e), 401)

        audit.bind_context(
            session=_session_from_claims(claims),
            source_ip=_get_source_ip(event),
        )
        try:
            return handler_fn(body, path_params, query_params)
        finally:
            audit.reset_context()
    except Exception as e:
        logger.exception(f"admin handler error: {type(e).__name__}: {e}")
        return response.err("internal server error", 500)
```

`verify_jwt()` 의 반환값을 이제 `claims` 로 받는다 — 기존에는 버렸다. `finally` 에서 컨텍스트를 비워 warm 컨테이너의 다음 요청에 이전 세션이 새지 않게 한다.

- [ ] **Step 4: 테스트를 실행해 통과를 확인한다**

Run: `cd service/backend && python3 -m pytest admin/tests/test_handler_dispatch.py -v`
Expected: PASS 7개

- [ ] **Step 5: 1단계 테스트 무변경 통과를 확인한다**

Run: `cd service/backend && python3 -m pytest admin/tests -q`
Expected: 전부 통과

- [ ] **Step 6: 커밋**

```bash
cd /Users/minseolee/Desktop/ailens-sedaily
git add service/backend/admin/handler.py service/backend/admin/tests/test_handler_dispatch.py
git commit -F - <<'EOF'
feat(admin): 감사 로그에 세션·출처 IP 바인딩

handler 가 verify_jwt() 반환값을 버리고 있어 요청 처리 중에 토큰 내용을 볼 수
없었다. 이제 claims 를 받아 iat 를 세션 식별자로 쓴다 — 로그인 시각이 그대로
식별자가 되므로 감사 로그에서 "04:00 에 로그인한 세션이 한 일"이 바로 읽힌다.

단일 공유 비밀번호 구조라 "누가"는 원리적으로 알 수 없다. 세션과 출처 IP 가
현 구조에서 얻을 수 있는 최대치다. actor 는 계정 분리 시 채울 자리로 남긴다.

dispatch 후 finally 로 컨텍스트를 비운다 — warm 컨테이너의 다음 요청에 이전
세션이 새면 감사 로그가 거짓말을 한다.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
```

---

### Task 7: CMS 라우트 감사 누락 채우기

**Files:**
- Modify: `service/backend/admin/routes/posts.py` (7개 핸들러 중 쓰기 5개)
- Modify: `service/backend/admin/routes/letters.py:30,38`
- Modify: `service/backend/admin/routes/media.py:59`
- Modify: `service/backend/admin/tests/test_posts_routes.py` (감사 호출 단언 추가)

**Interfaces:**
- Consumes: `audit.log` (Task 5)
- Produces: 없음

`posts.py` 의 확인된 repo 인터페이스: `posts_repo.create(body, created_by=)` · `list_posts(status, channel, limit)` · `get(id)` · `update(id, body)` · `set_status(id, status)` · `soft_delete(id)`.

`handle_publish` 와 `handle_unpublish` 는 둘 다 `_set_status(path_params, status)` 를 호출한다(`posts.py:79-92`). 감사 action 이름이 서로 다르므로 `_set_status` 에 `action` 인자를 추가한다.

- [ ] **Step 1: 감사 단언 테스트를 먼저 추가한다**

`service/backend/admin/tests/test_posts_routes.py` 하단에 추가한다.

```python
from conftest import FakeTable

from shared import audit, ddb_client


@pytest.fixture
def audit_table(monkeypatch) -> FakeTable:
    table = FakeTable()
    monkeypatch.setattr(ddb_client, "config_table", lambda: table)
    audit.reset_context()
    yield table
    audit.reset_context()


def test_create_writes_audit_row(monkeypatch, audit_table) -> None:
    monkeypatch.setattr(posts.posts_repo, "create",
                        lambda body, created_by: _post(headline=body["headline"]))
    resp = posts.handle_create(
        {"headline": "제목", "publish_date": "2026-07-29"}, {}, {})
    assert resp["statusCode"] == 201
    assert audit_table.put_calls[0]["action"] == "post-create"
    assert audit_table.put_calls[0]["detail"]["slug"] == "2026-07-27-제목"


def test_publish_writes_audit_row(monkeypatch, audit_table) -> None:
    monkeypatch.setattr(posts.posts_repo, "set_status",
                        lambda post_id, status: _post(id=post_id, status=status))
    resp = posts.handle_publish({}, {"id": "11111111-1111-1111-1111-111111111111"}, {})
    assert resp["statusCode"] == 200
    assert len(audit_table.put_calls) == 1
    assert audit_table.put_calls[0]["action"] == "post-publish"
    assert audit_table.put_calls[0]["detail"]["id"] == "11111111-1111-1111-1111-111111111111"


def test_unpublish_uses_distinct_action(monkeypatch, audit_table) -> None:
    monkeypatch.setattr(posts.posts_repo, "set_status",
                        lambda post_id, status: _post(id=post_id, status=status))
    posts.handle_unpublish({}, {"id": "11111111-1111-1111-1111-111111111111"}, {})
    assert audit_table.put_calls[0]["action"] == "post-unpublish"


def test_delete_writes_audit_row(monkeypatch, audit_table) -> None:
    monkeypatch.setattr(posts.posts_repo, "soft_delete", lambda post_id: True)
    resp = posts.handle_delete({}, {"id": "22222222-2222-2222-2222-222222222222"}, {})
    assert resp["statusCode"] == 200
    assert audit_table.put_calls[0]["action"] == "post-delete"
    assert audit_table.put_calls[0]["detail"]["id"] == "22222222-2222-2222-2222-222222222222"


def test_failed_validation_writes_no_audit(audit_table) -> None:
    """검증 실패는 감사 대상이 아니다."""
    resp = posts.handle_create({"publish_date": "2026-07-29"}, {}, {})
    assert resp["statusCode"] == 400
    assert audit_table.put_calls == []


def test_missing_post_delete_writes_no_audit(monkeypatch, audit_table) -> None:
    monkeypatch.setattr(posts.posts_repo, "soft_delete", lambda post_id: False)
    resp = posts.handle_delete({}, {"id": "nope"}, {})
    assert resp["statusCode"] == 404
    assert audit_table.put_calls == []
```

- [ ] **Step 2: 테스트를 실행해 실패를 확인한다**

Run: `cd service/backend && python3 -m pytest admin/tests/test_posts_routes.py -k audit -v`
Expected: FAIL — `IndexError: list index out of range` (put_calls 가 비어 있음)

- [ ] **Step 3: 감사 호출을 추가한다**

각 파일의 `from shared import ...` 에 `audit` 을 추가하고, **성공 반환 직전**에 호출을 넣는다. 실패 분기에는 넣지 않는다 — 검증 실패는 감사 대상이 아니다.

`routes/posts.py` — `_set_status` 는 action 인자를 받도록 바꾼다.

```python
def _set_status(path_params: dict, status: str, action: str) -> dict:
    post = posts_repo.set_status((path_params or {}).get("id", ""), status)
    if not post:
        return response.err("post not found", 404)
    logger.info(f"cms post {post['id']} -> {status}")
    audit.log(action, {"id": post["id"], "slug": post["slug"]})
    return response.ok({"post": post})


def handle_publish(body: dict, path_params: dict, query_params: dict) -> dict:
    return _set_status(path_params, "published", "post-publish")


def handle_unpublish(body: dict, path_params: dict, query_params: dict) -> dict:
    return _set_status(path_params, "draft", "post-unpublish")
```

나머지 세 개는 성공 반환 직전에 넣는다.

| 핸들러 | 위치 | 호출 |
|---|---|---|
| `handle_create` | `posts.py:49` 직전 | `audit.log("post-create", {"id": post["id"], "slug": post["slug"]})` |
| `handle_update` | `posts.py:76` 직전 | `audit.log("post-update", {"id": post["id"]})` |
| `handle_delete` | `posts.py:98` 직전 | `audit.log("post-delete", {"id": (path_params or {}).get("id", "")})` |

`handle_delete` 는 `soft_delete` 가 bool 을 반환해 post 객체가 없으므로 경로 id 를 쓴다.

`routes/letters.py`:

| 핸들러 | 위치 | 호출 |
|---|---|---|
| `handle_update` | `letters.py:35` 직전 | `audit.log("letter-update", {"id": letter["id"]})` |
| `handle_delete` | `letters.py:41` 직전 | `audit.log("letter-delete", {"id": (path_params or {}).get("id", "")})` |

`routes/media.py`:

| 핸들러 | 위치 | 호출 |
|---|---|---|
| `handle_presign` | `media.py:87` 의 `logger.info` 다음, `return` 직전 | `audit.log("media-presign", {"key": key, "content_type": content_type})` |

`key` 는 `media.py:81` 에서 만들어지는 `media/{YYYY}/{MM}/{안전한 파일명}` 이다. presigned URL 자체는 **감사에 남기지 않는다** — 만료 전까지 유효한 쓰기 자격증명이라 로그에 남기면 안 된다.

**본문·이미지 바이트는 detail 에 넣지 않는다.** DDB 항목 크기와 민감도 양쪽 이유다.

- [ ] **Step 4: 테스트를 실행해 통과를 확인한다**

Run: `cd service/backend && python3 -m pytest admin/tests -q`
Expected: 전부 통과. 기존 CMS 테스트가 `ddb_client.config_table` 을 패치하지 않는 경우 `audit.log` 가 실제 boto3 를 부르려 하지만 **fail-open 이라 warning 만 남기고 통과**한다. 그래도 실 AWS 접근 시도를 없애려면 각 테스트에 `config_table` 패치를 추가한다.

- [ ] **Step 5: `letters` · `media` 감사 테스트를 추가한다**

Step 1 의 테스트는 `posts` 만 덮는다. 나머지 3개 액션(`letter-update`·`letter-delete`·
`media-presign`)이 회귀 보호 없이 남으면 안 된다 — 감사 누락이 이 정비가 고치려던 결함 그
자체다.

`service/backend/admin/tests/test_cms_audit.py` (신규):

```python
"""CMS 라우트(letters · media)가 쓰기 액션마다 감사를 남기는지 검증한다.

posts 의 감사 테스트는 test_posts_routes.py 에 있다. 이 파일은 거기서 빠졌던
letters · media 를 덮는다.

Run from service/backend/::

    python3 -m pytest admin/tests/test_cms_audit.py -v
"""
from __future__ import annotations

import json

import pytest

from conftest import FakeTable

from routes import letters, media
from shared import audit, ddb_client


@pytest.fixture
def audit_table(monkeypatch) -> FakeTable:
    table = FakeTable()
    monkeypatch.setattr(ddb_client, "config_table", lambda: table)
    audit.reset_context()
    yield table
    audit.reset_context()


def test_letter_update_writes_audit_row(monkeypatch, audit_table) -> None:
    monkeypatch.setattr(letters.letters_repo, "update",
                        lambda letter_id, data: {"id": letter_id, "headline": "제목"})
    resp = letters.handle_update({"headline": "제목"}, {"id": "L1"}, {})
    assert resp["statusCode"] == 200
    assert audit_table.put_calls[0]["action"] == "letter-update"
    assert audit_table.put_calls[0]["detail"] == {"id": "L1"}


def test_letter_update_missing_writes_no_audit(monkeypatch, audit_table) -> None:
    monkeypatch.setattr(letters.letters_repo, "update", lambda letter_id, data: None)
    resp = letters.handle_update({}, {"id": "nope"}, {})
    assert resp["statusCode"] == 404
    assert audit_table.put_calls == []


def test_letter_delete_writes_audit_row(monkeypatch, audit_table) -> None:
    monkeypatch.setattr(letters.letters_repo, "soft_delete", lambda letter_id: True)
    resp = letters.handle_delete({}, {"id": "L2"}, {})
    assert resp["statusCode"] == 200
    assert audit_table.put_calls[0]["action"] == "letter-delete"
    assert audit_table.put_calls[0]["detail"] == {"id": "L2"}


def test_letter_delete_missing_writes_no_audit(monkeypatch, audit_table) -> None:
    monkeypatch.setattr(letters.letters_repo, "soft_delete", lambda letter_id: False)
    resp = letters.handle_delete({}, {"id": "nope"}, {})
    assert resp["statusCode"] == 404
    assert audit_table.put_calls == []


def test_media_presign_writes_audit_without_leaking_url(monkeypatch, audit_table) -> None:
    """presigned URL 은 만료 전까지 유효한 쓰기 자격증명이다 — 감사에 남으면 안 된다."""
    class _FakeS3:
        def generate_presigned_url(self, op, Params, ExpiresIn):
            return "https://signed.example/UPLOAD-CREDENTIAL?sig=SECRETSIG"

    monkeypatch.setattr(media, "_bucket", lambda: "test-bucket")
    monkeypatch.setattr(media, "_s3", lambda: _FakeS3())

    resp = media.handle_presign(
        {"filename": "a.png", "content_type": "image/png", "size": 100}, {}, {})
    assert resp["statusCode"] == 200

    row = audit_table.put_calls[0]
    assert row["action"] == "media-presign"
    assert row["detail"]["content_type"] == "image/png"
    assert row["detail"]["key"].endswith("a.png")
    serialized = json.dumps(row, ensure_ascii=False)
    assert "SECRETSIG" not in serialized
    assert "UPLOAD-CREDENTIAL" not in serialized


def test_media_presign_rejects_bad_content_type_without_audit(audit_table) -> None:
    resp = media.handle_presign(
        {"filename": "a.exe", "content_type": "application/x-msdownload", "size": 100}, {}, {})
    assert resp["statusCode"] == 400
    assert audit_table.put_calls == []
```

Run: `cd service/backend && python3 -m pytest admin/tests/test_cms_audit.py -v`
Expected: PASS 6개

- [ ] **Step 6: 커밋**

```bash
cd /Users/minseolee/Desktop/ailens-sedaily
git add service/backend/admin/routes/posts.py service/backend/admin/routes/letters.py \
        service/backend/admin/routes/media.py service/backend/admin/tests/test_posts_routes.py \
        service/backend/admin/tests/test_cms_audit.py
git commit -F - <<'EOF'
fix(admin): CMS 라우트 감사 로그 누락 — 글 발행·삭제가 기록되지 않던 문제

CMS 로 추가된 posts/letters/media 3개 라우트에 감사 호출이 하나도 없었다. 글
발행·삭제, 레터 수정·소프트삭제, 이미지 업로드 URL 발급이 전부 감사 없이
일어나고 있었다. 리팩터링이 아니라 결함 수정이다.

쓰기 8개 액션에 audit.log 를 넣었다. detail 에는 식별자만 담는다 — 본문을
넣으면 DDB 항목 크기와 민감도 양쪽에서 문제가 된다. 검증 실패 분기에는 넣지
않는다.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
```

---

### Task 8: audit 커서 페이지네이션

**Files:**
- Modify: `service/backend/admin/routes/audit.py`
- Modify: `service/backend/admin/tests/test_readonly_routes.py` (커서 테스트 추가)

**Interfaces:**
- Consumes: 없음
- Produces: `GET /admin/audit?limit=N&cursor=<base64>` → `{audits, count, next_cursor}`

- [ ] **Step 1: 실패하는 테스트를 추가한다**

`test_readonly_routes.py` 하단:

```python
def test_audit_returns_null_cursor_when_no_more_pages(wired) -> None:
    resp = audit_route.handle_list({}, {}, {})
    assert json.loads(resp["body"])["next_cursor"] is None


def test_audit_returns_cursor_when_more_pages_exist(monkeypatch) -> None:
    class Paged(FakeTable):
        def query(self, **kwargs):
            out = super().query(**kwargs)
            out["LastEvaluatedKey"] = {"pk": "AUDIT", "sk": "2026-07-29T04:00:00.000000Z"}
            return out

    table = Paged(items=_ROWS)
    monkeypatch.setattr(ddb_client, "config_table", lambda: table)
    resp = audit_route.handle_list({}, {}, {})
    cursor = json.loads(resp["body"])["next_cursor"]
    assert isinstance(cursor, str) and cursor


def test_audit_cursor_round_trips_into_exclusive_start_key(monkeypatch) -> None:
    import base64

    table = FakeTable(items=_ROWS)
    monkeypatch.setattr(ddb_client, "config_table", lambda: table)
    key = {"pk": "AUDIT", "sk": "2026-07-29T04:00:00.000000Z"}
    cursor = base64.urlsafe_b64encode(json.dumps(key).encode()).decode()

    audit_route.handle_list({}, {}, {"cursor": cursor})
    assert table.query_calls[-1]["ExclusiveStartKey"] == key


def test_audit_rejects_malformed_cursor(wired) -> None:
    resp = audit_route.handle_list({}, {}, {"cursor": "!!!not-base64!!!"})
    assert resp["statusCode"] == 400
    assert json.loads(resp["body"])["message"] == "invalid cursor"
```

- [ ] **Step 2: 테스트를 실행해 실패를 확인한다**

Run: `cd service/backend && python3 -m pytest admin/tests/test_readonly_routes.py -k cursor -v`
Expected: FAIL — `KeyError: 'next_cursor'`

- [ ] **Step 3: `routes/audit.py` 를 수정한다**

```python
"""audit log 조회 — DDB CONFIG/AUDIT/<ISO ts> 의 sk descending.

커서는 LastEvaluatedKey 를 JSON → base64 한 값이다. cursor 는 선택 인자이고
next_cursor 는 추가 필드이므로 기존 프런트(limit 만 전송)는 영향받지 않는다.
"""

import base64
import binascii
import json
import logging

from boto3.dynamodb.conditions import Key

from shared import ddb_client, response

logger = logging.getLogger(__name__)

DEFAULT_LIMIT = 50
MAX_LIMIT = 200


def _decode_cursor(raw: str) -> dict:
    return json.loads(base64.urlsafe_b64decode(raw.encode()).decode())


def _encode_cursor(key: dict) -> str:
    return base64.urlsafe_b64encode(json.dumps(key).encode()).decode()


def handle_list(body: dict, path_params: dict, query_params: dict) -> dict:
    params = query_params or {}

    raw_limit = params.get("limit", str(DEFAULT_LIMIT))
    try:
        limit = int(raw_limit)
    except ValueError:
        return response.err("limit must be integer", 400)
    limit = max(1, min(limit, MAX_LIMIT))

    kwargs: dict = {
        "KeyConditionExpression": Key("pk").eq("AUDIT"),
        "Limit": limit,
        "ScanIndexForward": False,
    }

    raw_cursor = params.get("cursor")
    if raw_cursor:
        try:
            kwargs["ExclusiveStartKey"] = _decode_cursor(raw_cursor)
        except (ValueError, binascii.Error, UnicodeDecodeError, json.JSONDecodeError):
            return response.err("invalid cursor", 400)

    resp = ddb_client.config_table().query(**kwargs)
    audits = [
        {
            "ts": item.get("sk"),
            "action": item.get("action"),
            "detail": item.get("detail"),
            "actor": item.get("actor"),
        }
        for item in resp.get("Items", [])
    ]
    last_key = resp.get("LastEvaluatedKey")
    return response.ok({
        "audits": audits,
        "count": len(audits),
        "next_cursor": _encode_cursor(last_key) if last_key else None,
    })
```

**주의:** 기존 `audits` 항목의 4개 키(`ts`·`action`·`detail`·`actor`)를 그대로 유지한다. `session`·`source_ip` 를 응답에 노출할지는 별도 판단이 필요하므로 이번엔 넣지 않는다 — 1단계 테스트의 `set(body["audits"][0]) == {"ts","action","detail","actor"}` 단언이 이를 지킨다.

- [ ] **Step 4: 테스트를 실행한다**

Run: `cd service/backend && python3 -m pytest admin/tests/test_readonly_routes.py -v`
Expected: PASS. 단 `test_audit_default_limit_and_shape` 의 `set(body) == {"audits", "count"}` 가 **실패한다** — `next_cursor` 가 추가됐기 때문이다. 이는 의도된 변경이므로 그 단언을 `{"audits", "count", "next_cursor"}` 로 고친다.

- [ ] **Step 5: 배포하고 스모크 확인 — 2단계 완료**

```bash
cd service/backend
./admin/deploy-admin-api.sh
```
배포 후 관리자 콘솔(`https://ailens-admin.sedaily.ai`)에서 확인한다.
1. 로그인된다
2. 드라이버 화면에서 플래그를 토글한다
3. 감사 로그 화면에 방금 토글이 뜨고 `session`·`source_ip` 가 DDB 항목에 들어갔는지 확인:
   `aws dynamodb query --table-name sedaily-mbti-admin-config-dev --key-condition-expression "pk = :p" --expression-attribute-values '{":p":{"S":"AUDIT"}}' --limit 3 --no-scan-index-forward --region us-east-1`
4. CMS 글을 발행하고 감사에 `post-publish` 가 남는지 확인

- [ ] **Step 6: 커밋**

```bash
cd /Users/minseolee/Desktop/ailens-sedaily
git add service/backend/admin/routes/audit.py service/backend/admin/tests/test_readonly_routes.py
git commit -F - <<'EOF'
feat(admin): audit 커서 페이지네이션 — 2단계 완료

Limit 만 있고 LastEvaluatedKey 를 안 써서 최근 200건 이전 기록은 조회할 방법이
없었다. LastEvaluatedKey 를 base64 커서로 왕복시킨다.

cursor 는 선택 인자, next_cursor 는 추가 필드라 기존 프런트(limit 만 전송)는
영향받지 않는다. audits 항목의 4개 키는 그대로 뒀다 — session/source_ip 를
응답에 노출할지는 별도 판단이 필요하다.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
```

---

# 단계 3 — `common/` 코어 + admin 이관 (Task 9–11)

### Task 9: `common/http.py`

**Files:**
- Create: `service/backend/common/http.py`
- Create: `service/backend/common/tests/__init__.py` (빈 파일)
- Create: `service/backend/common/tests/test_http.py`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `common.http.DEFAULT_HEADERS: dict`
  - `common.http.json_dumps(data: Any) -> str`
  - `common.http.success(data, status=200, headers=None) -> dict`
  - `common.http.error(message, status=500, code=None, details=None, retry_possible=False, headers=None) -> dict`
  Task 10·11·13 이 쓴다.

- [ ] **Step 1: 실패하는 테스트를 작성한다**

`service/backend/common/tests/test_http.py`:

```python
"""common/http.py — CORS 중립 응답 빌더.

Run from service/backend/::

    python3 -m pytest common/tests/test_http.py -v
"""
from __future__ import annotations

import json
from datetime import date, datetime, timezone
from decimal import Decimal

from common import http


def test_success_defaults_to_200_and_content_type_only() -> None:
    resp = http.success({"a": 1})
    assert resp["statusCode"] == 200
    assert resp["headers"] == {"Content-Type": "application/json; charset=utf-8"}
    assert json.loads(resp["body"]) == {"a": 1}


def test_success_never_injects_cors_headers() -> None:
    """common 은 config/ 를 import 하지 않으므로 CORS 가 들어올 경로가 없다."""
    resp = http.success({"a": 1})
    for key in resp["headers"]:
        assert not key.lower().startswith("access-control-")


def test_success_merges_caller_headers() -> None:
    resp = http.success({}, headers={"Cache-Control": "max-age=60"})
    assert resp["headers"]["Cache-Control"] == "max-age=60"
    assert resp["headers"]["Content-Type"] == "application/json; charset=utf-8"


def test_error_body_uses_error_key() -> None:
    resp = http.error("boom", 400)
    assert resp["statusCode"] == 400
    assert json.loads(resp["body"]) == {"error": "boom"}


def test_error_includes_optional_fields_only_when_given() -> None:
    resp = http.error("boom", 400, code="X", details={"f": 1}, retry_possible=True)
    body = json.loads(resp["body"])
    assert body == {"error": "boom", "code": "X", "details": {"f": 1}, "retry_possible": True}


def test_error_omits_falsy_optionals() -> None:
    body = json.loads(http.error("boom")["body"])
    assert body == {"error": "boom"}


def test_json_dumps_serializes_datetime_date_decimal_set() -> None:
    out = json.loads(http.json_dumps({
        "dt": datetime(2026, 7, 29, 5, 0, tzinfo=timezone.utc),
        "d": date(2026, 7, 29),
        "whole": Decimal("3"),
        "frac": Decimal("1.5"),
        "s": {"x"},
    }))
    assert out["dt"].startswith("2026-07-29T05:00:00")
    assert out["d"] == "2026-07-29"
    assert out["whole"] == 3 and isinstance(out["whole"], int)
    assert out["frac"] == 1.5
    assert out["s"] == ["x"]


def test_json_dumps_uses_to_dict_when_available() -> None:
    class Thing:
        def to_dict(self):
            return {"k": "v"}

    assert json.loads(http.json_dumps({"t": Thing()})) == {"t": {"k": "v"}}


def test_json_dumps_keeps_non_ascii_readable() -> None:
    assert "한글" in http.json_dumps({"k": "한글"})
```

- [ ] **Step 2: 테스트를 실행해 실패를 확인한다**

Run: `cd service/backend && python3 -m pytest common/tests/test_http.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'common.http'`

- [ ] **Step 3: `common/http.py` 를 작성한다**

```python
"""CORS 중립 HTTP 응답 빌더.

헤더는 호출자가 정한다. 이 모듈은 config/ 를 import 하지 않으므로 CORS 헤더가
여기서 주입될 방법이 없다 — v1 은 core/response.py 에서 CORS_HEADERS 를 얹고,
admin 은 API Gateway 가 CORS 를 처리하므로 얹지 않는다.

직렬화 로직은 core/response.py 의 _json_serializer 를 그대로 옮긴 것이다.
"""

from __future__ import annotations

import json
from datetime import date, datetime
from decimal import Decimal
from typing import Any

DEFAULT_HEADERS = {"Content-Type": "application/json; charset=utf-8"}


def _serializer(obj: Any) -> Any:
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    if isinstance(obj, Decimal):
        return int(obj) if obj % 1 == 0 else float(obj)
    if isinstance(obj, set):
        return list(obj)
    if hasattr(obj, "to_dict"):
        return obj.to_dict()
    if hasattr(obj, "__dict__"):
        return obj.__dict__
    raise TypeError(f"Object of type {type(obj).__name__} is not JSON serializable")


def json_dumps(data: Any) -> str:
    return json.dumps(data, default=_serializer, ensure_ascii=False)


def _build(status: int, body: Any, headers: dict | None) -> dict:
    merged = {**DEFAULT_HEADERS}
    if headers:
        merged.update(headers)
    return {"statusCode": status, "headers": merged, "body": json_dumps(body)}


def success(data: Any, status: int = 200, headers: dict | None = None) -> dict:
    return _build(status, data, headers)


def error(
    message: str,
    status: int = 500,
    code: str | None = None,
    details: dict | None = None,
    retry_possible: bool = False,
    headers: dict | None = None,
) -> dict:
    body: dict = {"error": message}
    if code:
        body["code"] = code
    if details:
        body["details"] = details
    if retry_possible:
        body["retry_possible"] = True
    return _build(status, body, headers)
```

- [ ] **Step 4: 테스트를 실행해 통과를 확인한다**

Run: `cd service/backend && python3 -m pytest common/tests/test_http.py -v`
Expected: PASS 9개

- [ ] **Step 5: 커밋**

```bash
cd /Users/minseolee/Desktop/ailens-sedaily
git add service/backend/common/http.py service/backend/common/tests/
git commit -F - <<'EOF'
feat(common): CORS 중립 응답 빌더 common/http.py 신설

admin 과 v1 이 각자 응답 빌더를 갖고 있어 표류하고 있었다. 하나로 합치는데
걸림돌은 CORS 였다 — admin 은 API Gateway 와의 conflict 때문에 헤더를
의도적으로 빼는데 core/response.py 는 무조건 주입한다.

CORS 를 타입이 아니라 주입 지점의 문제로 바꿨다. common/http 는 헤더를 인자로만
받고 config/ 를 import 하지 않는다 — CORS 헤더가 여기서 나올 경로 자체가 없다.
v1 은 core/response 에서 얹고, admin 은 안 얹는다.

아직 아무도 쓰지 않는다. deploy.sh/deploy-v2.sh 의 복사 목록에 common 이 이미
있어 v1/v2 zip 에 파일은 들어가지만 import 하는 곳이 없어 동작은 그대로다.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
```

---

### Task 10: `common/errors.py`

**Files:**
- Create: `service/backend/common/errors.py`
- Create: `service/backend/common/tests/test_errors.py`

**Interfaces:**
- Consumes: 없음
- Produces: `BackendError` · `ValidationError` · `NotFoundError` · `RepositoryError` · `TranslationError` · `ExternalServiceError` · `AuthenticationError` · `AuthorizationError` · `RateLimitError` · `ConfigurationError` · `EXCEPTION_STATUS_CODES` · `get_status_code_for_exception(exc) -> int`

- [ ] **Step 1: 실패하는 테스트를 작성한다**

`service/backend/common/tests/test_errors.py`:

```python
"""common/errors.py — 예외 계층과 status code 매핑.

Run from service/backend/::

    python3 -m pytest common/tests/test_errors.py -v
"""
from __future__ import annotations

import pytest

from common import errors


def test_backend_error_defaults() -> None:
    e = errors.BackendError("boom")
    assert e.message == "boom"
    assert e.code == "BACKEND_ERROR"
    assert e.details == {}
    assert e.retry_possible is False


def test_backend_error_to_dict_shape() -> None:
    e = errors.BackendError("boom", code="X", details={"f": 1}, retry_possible=True)
    assert e.to_dict() == {"error": "boom", "code": "X", "details": {"f": 1},
                           "retry_possible": True}


def test_validation_error_puts_field_into_details() -> None:
    e = errors.ValidationError("bad", field="title")
    assert e.code == "VALIDATION_ERROR"
    assert e.details["field"] == "title"


def test_not_found_error_builds_message_from_id() -> None:
    e = errors.NotFoundError("article", "abc")
    assert e.message == "article with id 'abc' not found"
    assert e.details == {"resource_type": "article", "resource_id": "abc"}


def test_external_service_error_prefixes_service_name() -> None:
    e = errors.ExternalServiceError("bedrock", "timeout", status_code=504)
    assert e.message == "bedrock: timeout"
    assert e.details["service"] == "bedrock"
    assert e.details["status_code"] == 504


@pytest.mark.parametrize("exc,expected", [
    (errors.ValidationError("x"), 400),
    (errors.AuthenticationError(), 401),
    (errors.AuthorizationError(), 403),
    (errors.NotFoundError("r"), 404),
    (errors.RateLimitError(), 429),
    (errors.RepositoryError("x"), 500),
    (errors.TranslationError("x"), 500),
    (errors.ConfigurationError("x"), 500),
    (errors.ExternalServiceError("s", "x"), 502),
    (errors.BackendError("x"), 500),
])
def test_status_code_mapping(exc, expected: int) -> None:
    assert errors.get_status_code_for_exception(exc) == expected


def test_backend_error_is_last_in_mapping_order() -> None:
    """순서가 의미를 갖는다.

    get_status_code_for_exception 은 삽입 순서대로 isinstance 를 검사하고 첫
    매치를 반환한다. BackendError 가 앞으로 오면 모든 서브클래스가 500 이 된다.
    """
    assert list(errors.EXCEPTION_STATUS_CODES)[-1] is errors.BackendError
```

- [ ] **Step 2: 테스트를 실행해 실패를 확인한다**

Run: `cd service/backend && python3 -m pytest common/tests/test_errors.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'common.errors'`

- [ ] **Step 3: `core/exceptions.py` 의 내용을 `common/errors.py` 로 복사한다**

`service/backend/core/exceptions.py` 의 9행부터 273행까지를 **그대로** `common/errors.py` 로 옮긴다. 클래스 정의·`EXCEPTION_STATUS_CODES`·`get_status_code_for_exception` 모두 포함한다.

모듈 docstring만 아래로 교체한다.

```python
"""백엔드 공통 예외 계층.

v1 core/exceptions.py 에서 옮겨왔다. core/exceptions.py 는 이 모듈의 이름을
재수출하는 얇은 층으로 남는다(기존 import 경로 유지).

⚠️ EXCEPTION_STATUS_CODES 의 삽입 순서가 동작을 결정한다.
get_status_code_for_exception 이 순서대로 isinstance 를 검사하고 첫 매치를
반환하므로, BackendError 는 반드시 맨 마지막에 있어야 한다. 앞으로 옮기면
모든 서브클래스가 500 으로 떨어진다.
"""
```

**이 Task 에서 `core/exceptions.py` 는 아직 건드리지 않는다.** 두 곳에 같은 정의가 잠시 공존한다 — Task 14 에서 정리한다.

- [ ] **Step 4: 테스트를 실행해 통과를 확인한다**

Run: `cd service/backend && python3 -m pytest common/tests/ -v`
Expected: PASS (http 9 + errors 16)

- [ ] **Step 5: 커밋**

```bash
cd /Users/minseolee/Desktop/ailens-sedaily
git add service/backend/common/errors.py service/backend/common/tests/test_errors.py
git commit -F - <<'EOF'
feat(common): 예외 계층을 common/errors.py 로 복사

core/exceptions.py 의 정의를 그대로 옮겼다. 아직 core 는 건드리지 않아 두 곳에
같은 정의가 공존한다 — 4단계에서 core 를 재수출 층으로 바꾸며 정리한다.

EXCEPTION_STATUS_CODES 의 삽입 순서가 동작을 결정한다는 사실을 docstring 과
테스트로 못박았다. get_status_code_for_exception 이 순서대로 isinstance 를
검사하고 첫 매치를 반환하므로 BackendError 가 앞으로 오면 모든 서브클래스가
500 이 된다. 옮기는 과정에서 가장 깨지기 쉬운 지점이다.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
```

---

### Task 11: admin 을 `common/` 으로 이관

**Files:**
- Modify: `service/backend/admin/shared/response.py`
- Modify: `service/backend/admin/deploy-admin-api.sh:32`
- Modify: 1단계 characterization 테스트 4개 파일 + `admin/tests/test_posts_routes.py` 등 `["message"]` 를 단언하는 모든 파일

**Interfaces:**
- Consumes: `common.http.success` · `common.http.error` (Task 9)
- Produces: `admin/shared/response.ok` · `err` — 이름과 시그니처는 그대로, 에러 body 키만 `message` → `error`

- [ ] **Step 1: `admin/shared/response.py` 를 위임으로 바꾼다**

```python
"""HTTP API v2 응답 builder — common/http.py 위임.

⚠️ CORS 헤더는 API Gateway HTTP API 가 API-level 에서 자동 처리한다. Lambda
response 에 Access-Control-* 를 추가하면 conflict 가능 → body + status 만 반환.
common/http 는 config/ 를 import 하지 않으므로 CORS 가 들어올 경로가 없다.

ok/err 는 이름과 시그니처를 유지한다(호출부 24개 라우트 무변경). 다만 err 의
응답 body 는 {"message": ...} 에서 {"error": ...} 로 바뀐다 — 소스 호환이지
와이어 호환이 아니다. 관리자 콘솔은 adminClient.ts:75 에서
`body.message || body.error` 로 둘 다 읽으므로 깨지지 않는다.
"""

from typing import Any

from common import http


def ok(body: Any, status: int = 200) -> dict:
    return http.success(body, status)


def err(message: str, status: int = 400, **extra: Any) -> dict:
    """extra 는 details 안으로 들어간다.

    이전에는 body 최상위에 펼쳤다. 넘기는 곳은 auth.py 의 retry_after_seconds
    한 곳뿐이고, 프런트는 status 423 만 보고 그 필드를 읽지 않는다.
    """
    return http.error(message, status, details=extra or None)
```

- [ ] **Step 2: 배포 스크립트에 `common` 을 추가한다**

`service/backend/admin/deploy-admin-api.sh:32` 를 바꾼다.

```bash
cp -r admin/routes admin/shared "$BUILD_DIR/"
cp -r common "$BUILD_DIR/"          # common/http.py · common/errors.py (CORS 중립 코어)
```

`common/tests/` 는 런타임에 불필요하므로 zip 에서 뺀다. 44행의 `__pycache__` 정리 다음에 추가한다.

```bash
rm -rf "$BUILD_DIR/common/tests"
```

- [ ] **Step 3: 테스트를 실행해 무엇이 깨지는지 본다**

Run: `cd service/backend && python3 -m pytest admin/tests -q`
Expected: FAIL 다수 — `KeyError: 'message'`. **이것이 안전망이 작동하는 신호다.**

- [ ] **Step 4: 깨진 단언을 의도적으로 고친다**

`["message"]` → `["error"]` 로 바꾼다. 대상 파일:
- `admin/tests/test_auth_routes.py`
- `admin/tests/test_drivers_routes.py`
- `admin/tests/test_prompts_routes.py`
- `admin/tests/test_readonly_routes.py`
- `admin/tests/test_handler_dispatch.py`
- `admin/tests/test_posts_routes.py` (기존 파일 — `:44` 등)
- `admin/tests/test_media.py` (있다면)

`test_auth_routes.py` 의 lockout 테스트는 `retry_after_seconds` 위치도 바뀐다.

```python
def test_login_lockout_is_423_with_retry_after_in_details(monkeypatch) -> None:
    """4단계 이관으로 retry_after_seconds 가 details 안으로 내려갔다.

    프런트는 status 423 만 보고 이 필드를 읽지 않으므로(login/page.tsx:25)
    화면 동작은 그대로다.
    """
    monkeypatch.setattr(auth, "_check_lockout", lambda: 300)
    resp = auth.handle_login({"password": _GOOD}, {}, {})
    assert resp["statusCode"] == 423
    body = json.loads(resp["body"])
    assert body["error"] == "locked out"
    assert body["details"]["retry_after_seconds"] == 300
    assert_no_cors(resp)
```

**`assert_no_cors` 단언은 전부 그대로 둔다.** 이게 이번 이관이 성공했는지 판정하는 기준이다.

- [ ] **Step 5: 테스트를 실행해 전부 통과하는지 확인한다**

Run: `cd service/backend && python3 -m pytest admin/tests common/tests -q`
Expected: 전부 통과. CORS 단언이 하나라도 실패하면 `common/http` 가 헤더를 잘못 주입한 것이다.

- [ ] **Step 6: zip 내용물을 검증한다**

```bash
cd service/backend
bash -n admin/deploy-admin-api.sh          # 문법 확인
```
배포 후 콜드스타트가 깨지지 않는지 확인하려면 `common` 이 실제로 들어갔는지 봐야 한다. 배포 스크립트가 zip 을 지우므로, 임시로 확인하려면 `rm -rf "$BUILD_DIR" "$PACKAGE_FILE"` (82행) 직전에 `unzip -l "$PACKAGE_FILE" | grep common` 를 넣어 한 번 실행하고 되돌린다.

- [ ] **Step 7: 배포하고 스모크 확인 — 3단계 완료**

```bash
cd service/backend
./admin/deploy-admin-api.sh
```
`https://ailens-admin.sedaily.ai` 에서 확인한다.
1. **로그인** — 실패 시 잘못된 비밀번호로 401 메시지가 화면에 뜨는지(프런트의 `body.error` 경로가 작동하는지)
2. 드라이버·프롬프트·비용·감사 화면이 전부 뜨는지
3. 브라우저 콘솔에 CORS 오류가 없는지 — **가장 중요하다.** `common` 번들이 잘못됐다면 여기서 드러난다
4. CMS 글 목록·편집이 되는지

- [ ] **Step 8: 커밋**

```bash
cd /Users/minseolee/Desktop/ailens-sedaily
git add service/backend/admin/shared/response.py service/backend/admin/deploy-admin-api.sh \
        service/backend/admin/tests/
git commit -F - <<'EOF'
refactor(admin): 응답 빌더를 common/http 로 이관 — 3단계 완료

admin/shared/response.py 가 자체 구현을 들고 있던 것을 common/http 위임으로
바꿨다. ok/err 의 이름과 시그니처는 그대로라 라우트 24개는 무변경이다.

에러 body 가 {"message":...} 에서 {"error":...} 로 한 번 바뀐다. 프런트는
adminClient.ts:75 에서 `body.message || body.error` 로 둘 다 읽으므로 깨지지
않는다. err 의 extra 는 details 안으로 들어간다 — 넘기는 곳은 auth.py 의
retry_after_seconds 한 곳뿐이고 프런트는 status 423 만 본다.

characterization 테스트가 예상대로 깨졌고 그 단언들을 명시적으로 고쳤다. 어디가
바뀌었는지 이 diff 에 그대로 남는다. CORS 부재 단언은 전부 그대로 뒀다 — 이관이
성공했는지 판정하는 기준이다.

deploy-admin-api.sh 에 common 복사를 추가하고 common/tests 는 런타임에서 뺐다.
core/ 도 config/ 도 zip 에 안 들어가므로 "v1/v2 소스를 섞지 않는다" 원칙은
유지된다 — common 은 v1 소스가 아니라 공유 계층이다.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
```

---

# 단계 4 — v1/v2 재배치 (Task 12–14)

**여기서 멈춰도 된다.** 3단계까지로 감사 누락은 메워졌고 admin 은 `common/` 을 쓴다. 4단계는 v1 `core/` 의 중복을 마저 없애는 마무리이며, `core/response.py` 를 v1 16 + v2 14 = **30개 파일**이 쓰므로 가장 신중해야 한다.

### Task 12: v1 `core/response.py` characterization

**Files:**
- Create: `service/backend/tests/test_core_response_contract.py`

**Interfaces:**
- Consumes: 없음
- Produces: 없음 (Task 13 의 안전망)

- [ ] **Step 1: 9개 함수의 현재 출력을 박제한다**

`service/backend/tests/test_core_response_contract.py`:

```python
"""core/response.py 의 9개 함수 계약을 박제한다 (characterization).

v1 16개 + v2 14개 파일이 이 모듈을 쓴다. common/ 위임 리팩터링 전후로
statusCode · headers(CORS 포함) · body 가 동일해야 한다.

기존 service/backend/tests/ 의 통합 테스트와 달리 실 AWS 가 필요 없는
순수 함수 테스트다.

Run from service/backend/::

    python3 -m pytest tests/test_core_response_contract.py -v
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from decimal import Decimal

import pytest

from config.constants import CORS_HEADERS
from core import response
from core.exceptions import NotFoundError, ValidationError


def _body(resp: dict) -> dict:
    return json.loads(resp["body"])


def test_success_response_includes_cors_headers() -> None:
    """admin 과 달리 v1 은 CORS 를 붙인다 — 이게 두 소비자의 유일한 차이다."""
    resp = response.success_response({"a": 1})
    assert resp["statusCode"] == 200
    for key, value in CORS_HEADERS.items():
        assert resp["headers"][key] == value
    assert _body(resp) == {"a": 1}


def test_success_response_merges_headers_and_cache_control() -> None:
    resp = response.success_response({}, headers={"X-T": "1"}, cache_control="max-age=60")
    assert resp["headers"]["X-T"] == "1"
    assert resp["headers"]["Cache-Control"] == "max-age=60"


def test_error_response_includes_cors_headers() -> None:
    """error_response 는 success_response 와 **별개로** CORS 를 조립한다.

    `{**CORS_HEADERS}` 가 core/response.py 의 53·90·188행 세 곳에 각각 있다.
    Task 13 이 성공 경로만 common/http 로 위임하고 에러 경로를 흘리면, 에러
    응답 전체가 CORS 를 잃는다 — 브라우저는 실제 오류 대신 CORS 실패를
    표시하므로 프런트가 원인을 볼 수 없게 된다.
    """
    resp = response.error_response("boom", 400)
    for key, value in CORS_HEADERS.items():
        assert resp["headers"][key] == value


def test_exception_to_response_includes_cors_headers() -> None:
    """@lambda_handler 가 BackendError 를 응답으로 바꾸는 경로도 같은 보장이 필요하다."""
    resp = response.exception_to_response(ValidationError("bad", field="t"))
    for key, value in CORS_HEADERS.items():
        assert resp["headers"][key] == value


def test_error_response_body_and_optional_fields() -> None:
    resp = response.error_response("boom", 400, code="X", details={"f": 1}, retry_possible=True)
    assert resp["statusCode"] == 400
    assert _body(resp) == {"error": "boom", "code": "X", "details": {"f": 1},
                           "retry_possible": True}


def test_error_response_defaults_to_500_and_bare_body() -> None:
    resp = response.error_response("boom")
    assert resp["statusCode"] == 500
    assert _body(resp) == {"error": "boom"}


def test_paginated_response_pagination_block() -> None:
    resp = response.paginated_response([1, 2], total=5, page=1, page_size=2)
    body = _body(resp)
    assert body["items"] == [1, 2]
    assert body["pagination"] == {"total": 5, "page": 1, "page_size": 2,
                                  "total_pages": 3, "has_next": True, "has_prev": False}


def test_paginated_response_handles_zero_page_size() -> None:
    body = _body(response.paginated_response([], total=0, page=1, page_size=0))
    assert body["pagination"]["total_pages"] == 0


def test_created_response_is_201() -> None:
    assert response.created_response({"id": "x"})["statusCode"] == 201


def test_no_content_response_is_204_with_empty_body() -> None:
    resp = response.no_content_response()
    assert resp["statusCode"] == 204
    assert resp["body"] == ""
    for key in CORS_HEADERS:
        assert key in resp["headers"]


def test_validation_error_response_shape() -> None:
    resp = response.validation_error_response("bad", field="title")
    assert resp["statusCode"] == 400
    body = _body(resp)
    assert body["code"] == "VALIDATION_ERROR"
    assert body["details"]["field"] == "title"


def test_not_found_response_message_and_details() -> None:
    resp = response.not_found_response("article", "abc")
    assert resp["statusCode"] == 404
    body = _body(resp)
    assert body["error"] == "article with id 'abc' not found"
    assert body["details"] == {"resource_type": "article", "resource_id": "abc"}


def test_internal_error_response_defaults() -> None:
    resp = response.internal_error_response()
    assert resp["statusCode"] == 500
    body = _body(resp)
    assert body["code"] == "INTERNAL_ERROR"
    assert body["retry_possible"] is True


@pytest.mark.parametrize("exc,status", [
    (ValidationError("bad", field="t"), 400),
    (NotFoundError("article", "abc"), 404),
])
def test_exception_to_response_maps_backend_errors(exc, status: int) -> None:
    """예외 계층을 common 으로 옮길 때 isinstance 판정이 깨질 수 있는 지점."""
    resp = response.exception_to_response(exc)
    assert resp["statusCode"] == status
    assert _body(resp)["code"] == exc.code


def test_exception_to_response_maps_unknown_exception_to_500() -> None:
    resp = response.exception_to_response(RuntimeError("nope"))
    assert resp["statusCode"] == 500
    body = _body(resp)
    assert body["error"] == "An unexpected error occurred"
    assert body["retry_possible"] is True


def test_serializer_handles_datetime_decimal_set() -> None:
    body = _body(response.success_response({
        "dt": datetime(2026, 7, 29, 5, 0, tzinfo=timezone.utc),
        "whole": Decimal("3"),
        "frac": Decimal("1.5"),
        "s": {"x"},
    }))
    assert body["dt"].startswith("2026-07-29T05:00:00")
    assert body["whole"] == 3
    assert body["frac"] == 1.5
    assert body["s"] == ["x"]
```

- [ ] **Step 2: 테스트를 실행한다**

Run: `cd service/backend && python3 -m pytest tests/test_core_response_contract.py -v`
Expected: PASS 17개. characterization 이므로 **처음부터 통과해야 한다.** 실패하면 현재 동작을 잘못 기술한 것이니 테스트를 고친다.

- [ ] **Step 3: 커밋**

```bash
cd /Users/minseolee/Desktop/ailens-sedaily
git add service/backend/tests/test_core_response_contract.py
git commit -F - <<'EOF'
test(core): core/response.py 9개 함수 계약 박제

v1 16개 + v2 14개 파일이 이 모듈을 쓰는데 CI 안전망이 없었다.
service/backend/tests/ 의 기존 테스트는 실 AWS 를 때리는 통합 테스트라
리팩터링 회귀를 못 잡는다.

exception_to_response 를 반드시 포함했다. 예외 계층을 common/errors.py 로
옮길 때 isinstance 판정이 깨질 수 있는 유일한 지점이다.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
```

---

### Task 13: `core/response.py` 를 `common/http` 위임으로

**Files:**
- Modify: `service/backend/core/response.py`

**Interfaces:**
- Consumes: `common.http.success` · `error` · `json_dumps` (Task 9)
- Produces: 기존 9개 함수 시그니처 **무변경**

- [ ] **Step 1: `success_response`·`error_response`·`no_content_response` 를 위임으로 바꾼다**

나머지 6개 함수는 이 셋 위에 얹혀 있으므로 **건드리지 않는다.**

```python
from common import http
from config.constants import CORS_HEADERS


def _with_cors(headers: Optional[Dict[str, str]] = None) -> Dict[str, str]:
    """v1 응답에는 CORS 를 붙인다 — admin 과의 유일한 차이."""
    merged = {**CORS_HEADERS}
    if headers:
        merged.update(headers)
    return merged


def success_response(
    data: Any,
    status_code: int = 200,
    headers: Optional[Dict[str, str]] = None,
    cache_control: Optional[str] = None
) -> Dict:
    response_headers = _with_cors(headers)
    if cache_control:
        response_headers['Cache-Control'] = cache_control
    return http.success(data, status_code, response_headers)


def error_response(
    message: str,
    status_code: int = 500,
    code: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
    retry_possible: bool = False,
    headers: Optional[Dict[str, str]] = None
) -> Dict:
    return http.error(
        message, status_code, code=code, details=details,
        retry_possible=retry_possible, headers=_with_cors(headers),
    )


def no_content_response(headers: Optional[Dict[str, str]] = None) -> Dict:
    return {'statusCode': 204, 'headers': _with_cors(headers), 'body': ''}
```

`_json_serializer` 는 삭제한다 — `common/http.py` 의 `_serializer` 가 대체한다. **다른 모듈이 `core.response._json_serializer` 를 import 하지 않는지 먼저 확인한다.**

Run: `cd service/backend && grep -rn "_json_serializer" --include="*.py" . | grep -v __pycache__`

쓰는 곳이 있으면 삭제하지 말고 `_json_serializer = http._serializer` 별칭을 남긴다.

- [ ] **Step 2: 계약 테스트를 실행한다**

Run: `cd service/backend && python3 -m pytest tests/test_core_response_contract.py -v`
Expected: PASS 17개 — 하나라도 실패하면 리팩터링이 동작을 바꾼 것이다. 되돌리고 원인을 찾는다.

- [ ] **Step 3: v2 테스트로 회귀를 확인한다**

Run: `cd service/backend && python3 -m pytest v2/tests -q`
Expected: 기존과 동일하게 통과. v2 14개 파일이 `core.response` 를 쓰므로 여기서 파급이 드러난다.

- [ ] **Step 4: 배포**

```bash
cd service/backend
./deploy.sh api
./v2/deploy-v2.sh
```

`https://ailens.sedaily.ai` 에서 피드와 기사 상세가 뜨는지, 브라우저 콘솔에 CORS 오류가 없는지 확인한다.

- [ ] **Step 5: 커밋**

```bash
cd /Users/minseolee/Desktop/ailens-sedaily
git add service/backend/core/response.py
git commit -F - <<'EOF'
refactor(core): core/response.py 를 common/http 위임으로 재배치

응답 빌더 중복이 사라졌다. 직렬화와 body 조립은 common/http 한 곳에 있고,
core/response 는 CORS_HEADERS 를 얹는 얇은 층만 남는다.

9개 함수의 시그니처는 그대로라 v1 16개 + v2 14개 파일은 무변경이다.
success/error/no_content 셋만 위임으로 바꿨고 나머지 6개는 이 셋 위에 얹혀
있어 건드리지 않았다.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
```

---

### Task 14: `core/exceptions.py` 를 재수출 층으로

**Files:**
- Modify: `service/backend/core/exceptions.py`

**Interfaces:**
- Consumes: `common.errors` (Task 10)
- Produces: 기존 import 경로 **무변경** — 8개 파일이 `from core.exceptions import ...` 를 계속 쓴다

- [ ] **Step 1: `core/exceptions.py` 를 재수출로 교체한다**

파일 전체를 아래로 바꾼다. `import *` 는 쓰지 않는다 — 무엇이 공개되는지 파일만 봐서 알 수 없게 된다.

```python
"""백엔드 예외 계층 — common/errors.py 재수출.

정의는 common/errors.py 에 있다. v1/v2 가 쓰던 `from core.exceptions import ...`
경로를 유지하기 위한 얇은 층이다.

⚠️ EXCEPTION_STATUS_CODES 의 삽입 순서가 동작을 결정한다(common/errors.py 참조).
"""

from common.errors import (
    BackendError,
    ValidationError,
    NotFoundError,
    RepositoryError,
    TranslationError,
    ExternalServiceError,
    AuthenticationError,
    AuthorizationError,
    RateLimitError,
    ConfigurationError,
    EXCEPTION_STATUS_CODES,
    get_status_code_for_exception,
)

__all__ = [
    "BackendError",
    "ValidationError",
    "NotFoundError",
    "RepositoryError",
    "TranslationError",
    "ExternalServiceError",
    "AuthenticationError",
    "AuthorizationError",
    "RateLimitError",
    "ConfigurationError",
    "EXCEPTION_STATUS_CODES",
    "get_status_code_for_exception",
]
```

- [ ] **Step 2: 계약 테스트를 실행한다 — isinstance 판정이 핵심**

Run: `cd service/backend && python3 -m pytest tests/test_core_response_contract.py common/tests -v`
Expected: 전부 통과. `test_exception_to_response_maps_backend_errors` 가 실패하면 클래스 동일성이 깨진 것이다 — `core.exceptions.ValidationError is common.errors.ValidationError` 가 True 여야 한다.

- [ ] **Step 3: 전체 회귀 확인**

Run:
```bash
cd service/backend
python3 -m pytest tests/test_core_response_contract.py common/tests admin/tests v2/tests -q
```
Expected: 전부 통과

- [ ] **Step 4: import 가 실제로 되는지 확인한다**

```bash
cd service/backend
python3 -c "
from core.exceptions import ValidationError, get_status_code_for_exception
from common.errors import ValidationError as CV
assert ValidationError is CV, 'core 와 common 의 클래스가 다르다 — isinstance 가 깨진다'
assert get_status_code_for_exception(ValidationError('x')) == 400
print('OK')
"
```
Expected: `OK`

- [ ] **Step 5: 배포**

```bash
cd service/backend
./deploy.sh
./v2/deploy-v2.sh
```

`https://ailens.sedaily.ai` 와 `https://ailens-admin.sedaily.ai` 양쪽에서 주요 화면을 확인한다.

- [ ] **Step 6: 커밋 — 4단계 완료**

```bash
cd /Users/minseolee/Desktop/ailens-sedaily
git add service/backend/core/exceptions.py
git commit -F - <<'EOF'
refactor(core): core/exceptions.py 를 common/errors 재수출 층으로 — 4단계 완료

예외 계층 중복이 사라졌다. 정의는 common/errors.py 한 곳에 있고 core 는 기존
import 경로(8개 파일)를 유지하는 얇은 층이다.

import * 대신 이름을 명시적으로 나열하고 __all__ 을 뒀다. import * 는 무엇이
공개되는지 파일만 봐서 알 수 없게 만든다.

클래스 동일성이 유지되는지 확인했다 — core.exceptions.ValidationError 와
common.errors.ValidationError 가 같은 객체여야 exception_to_response 의
isinstance 판정이 안 깨진다.

이로써 CMS 4단계 백엔드 정비를 마쳤다. 감사 누락을 메웠고, 응답·에러 빌더가
common/ 한 곳으로 모였으며, admin 은 CORS 를 구조적으로 못 받게 됐다.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
```

---

## 완료 기준

- [ ] `python3 -m pytest admin/tests common/tests tests/test_core_response_contract.py v2/tests -q` 전부 통과
- [ ] 관리자 콘솔에서 CMS 글 발행 후 감사 로그에 `post-publish` 가 `session`·`source_ip` 와 함께 남는다
- [ ] 브라우저 콘솔에 CORS 오류가 없다 (admin·프런트 양쪽)
- [ ] `admin/shared/response.py` 와 `core/response.py` 에 직렬화·body 조립 코드가 중복으로 남아 있지 않다
