"""admin 테스트 공용 fake + 단언 헬퍼.

admin 은 flat import 규약(zip 루트 = admin/backend/ 내용 그 자체)이므로 sys.path 에
admin/backend/ 를 넣어 프로덕션과 같은 import 경로를 재현한다.

Run from repo root::

    python3 -m pytest admin/backend/tests -q
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

# 2026-08-08: service/backend/admin/ → admin/backend/ 로 이동하며 common/ 과
# 물리적으로 갈라졌다(common/ 은 v1/v2 도 같이 쓰는 진짜 공유 코드라 그대로
# service/backend/ 에 남겨둠). admin/__init__.py 존재로 pytest 의 rootdir
# 자동탐색이 이제 admin/(repo 최상위) 에서 멈춰버려 common 이 안 잡힌다 —
# service/backend/ 를 명시적으로 추가한다.
sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "service" / "backend"))

# admin/backend/__init__.py 와 admin/backend/tests/__init__.py 가 둘 다 존재해
# pytest 기본 import-mode(prepend)가 이 디렉터리를 `backend.tests` 패키지로
# 인식, 루트로 admin/ 을 sys.path 에 넣는다 — admin/backend/tests/ 자체는
# 안 올라온다. test_*.py 가 `from conftest import ...` 로 이 모듈을
# bare-import 하려면 admin/backend/tests/ 도 별도로 sys.path 에 있어야 한다.
sys.path.insert(0, str(Path(__file__).resolve().parent))


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


# `fake_table` / `fake_ssm` / `fake_eb` 픽스처는 제거했다 — 아무 테스트도 쓰지
# 않았다. 테스트들은 필요한 fake 를 `FakeTable(items=..., get_map=...)` 처럼
# 인자와 함께 직접 만들어 쓴다. 인자 없는 픽스처는 그 쓰임에 맞지 않아
# 살아날 여지가 없었다. 클래스(`FakeTable`/`FakeSSM`/`FakeEB`)는 그대로 export
# 되므로 import 해서 쓰면 된다.
