"""드라이버 (EventBridge rule + feature flag + threshold) 관리.

list: list_rules(NamePrefix='sedaily-mbti-') + feature_flags/thresholds 목록.
rule update (handle_update): action ∈ {enable, disable, set-cron}. cron preset 만.
flag update (handle_feature_flag_update): action ∈ {enable, disable}. — Admin-2a 추가.
threshold update (handle_threshold_update): integer value, 1..10000 range. — Admin-2d 추가.

2026-09-09(v1.28): feature flag/threshold 저장을 DynamoDB(admin-config
테이블 pk='CONFIG')에서 PostgreSQL(lens-cms-api, repo/config_repo.py
경유)로 전환. EventBridge rule 제어(eb_client)는 이번 범위 밖 — AWS
리소스 자체 상태라 DB 마이그레이션과 무관.
"""

import logging

from repo import config_repo
from shared import audit, eb_client, response

logger = logging.getLogger(__name__)


def handle_list(body: dict, path_params: dict, query_params: dict) -> dict:
    rules = eb_client.list_rules()
    flags = config_repo.list_feature_flags()
    thresholds = config_repo.list_thresholds()
    return response.ok({"rules": rules, "feature_flags": flags, "thresholds": thresholds})


def handle_update(body: dict, path_params: dict, query_params: dict) -> dict:
    driver_id = (path_params or {}).get("id", "")
    if not driver_id:
        return response.err("driver id required", 400)
    if not driver_id.startswith("sedaily-mbti-"):
        return response.err("driver id must start with 'sedaily-mbti-'", 400)

    action = body.get("action", "")
    if action not in {"enable", "disable", "set-cron"}:
        return response.err("action must be one of: enable, disable, set-cron", 400)

    detail: dict = {"driver": driver_id, "action": action}

    try:
        if action == "enable":
            eb_client.enable_rule(driver_id)
        elif action == "disable":
            eb_client.disable_rule(driver_id)
        elif action == "set-cron":
            preset = body.get("cron_preset", "")
            if preset not in eb_client.PRESET_TO_SCHEDULE:
                return response.err(
                    f"cron_preset must be one of: {sorted(eb_client.PRESET_TO_SCHEDULE.keys())}",
                    400,
                )
            schedule = eb_client.set_schedule(driver_id, preset)
            detail["preset"] = preset
            detail["schedule"] = schedule
    except Exception as e:
        logger.exception(f"driver-update failed: {driver_id} {action}")
        return response.err(f"driver update failed: {type(e).__name__}", 500)

    audit.log("driver-update", detail)
    return response.ok({"ok": True, "rule": eb_client.describe_rule(driver_id)})


def handle_feature_flag_update(body: dict, path_params: dict, query_params: dict) -> dict:
    flag_name = (path_params or {}).get("name", "")
    if not flag_name:
        return response.err("flag name required", 400)

    action = body.get("action", "")
    if action not in {"enable", "disable"}:
        return response.err("action must be one of: enable, disable", 400)

    enabled = (action == "enable")

    try:
        updated_at = config_repo.set_feature_flag(flag_name, enabled)
    except Exception as e:
        logger.exception(f"feature-flag-update failed: {flag_name} {action}")
        return response.err(f"feature flag update failed: {type(e).__name__}", 500)

    audit.log("feature-flag-update", {"flag": flag_name, "action": action})
    return response.ok({"flag": flag_name, "enabled": enabled, "updated_at": updated_at})


def handle_threshold_update(body: dict, path_params: dict, query_params: dict) -> dict:
    name = (path_params or {}).get("name", "")
    if not name:
        return response.err("threshold name required", 400)

    raw_value = body.get("value")
    try:
        value = int(raw_value)
    except (TypeError, ValueError):
        return response.err("value must be integer", 400)

    if value < 1 or value > 10000:
        return response.err("value out of range (1..10000)", 400)

    try:
        updated_at = config_repo.set_threshold(name, value)
    except Exception as e:
        logger.exception(f"threshold-update failed: {name} {value}")
        return response.err(f"threshold update failed: {type(e).__name__}", 500)

    audit.log("threshold-update", {"threshold": name, "value": value})
    return response.ok({"threshold": name, "value": value, "updated_at": updated_at})
