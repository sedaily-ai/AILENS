"""드라이버 (EventBridge rule + feature flag + threshold) 관리.

list: list_rules(NamePrefix='sedaily-mbti-') + DDB CONFIG/feature-flag/* + threshold/* read.
rule update (handle_update): action ∈ {enable, disable, set-cron}. cron preset 만.
flag update (handle_feature_flag_update): action ∈ {enable, disable}. — Admin-2a 추가.
threshold update (handle_threshold_update): integer value, 1..10000 range. — Admin-2d 추가.
"""

import datetime as dt
import logging

from boto3.dynamodb.conditions import Key

from shared import audit, ddb_client, eb_client, response

logger = logging.getLogger(__name__)


def _load_feature_flags() -> dict:
    table = ddb_client.config_table()
    resp = table.query(
        KeyConditionExpression=Key("pk").eq("CONFIG") & Key("sk").begins_with("feature-flag/"),
    )
    flags = {}
    for item in resp.get("Items", []):
        sk = item.get("sk", "")
        flag_name = sk.replace("feature-flag/", "", 1)
        value = item.get("value") or {}
        flags[flag_name] = bool(value.get("enabled", True))
    return flags


def _load_thresholds() -> dict:
    table = ddb_client.config_table()
    resp = table.query(
        KeyConditionExpression=Key("pk").eq("CONFIG") & Key("sk").begins_with("threshold/"),
    )
    thresholds: dict = {}
    for item in resp.get("Items", []):
        sk = item.get("sk", "")
        name = sk.replace("threshold/", "", 1)
        value = item.get("value") or {}
        raw = value.get("threshold", 0)
        # boto3 resource layer returns DDB Number as Decimal — coerce to int.
        thresholds[name] = int(raw)
    return thresholds


def handle_list(body: dict, path_params: dict, query_params: dict) -> dict:
    rules = eb_client.list_rules()
    flags = _load_feature_flags()
    thresholds = _load_thresholds()
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
    now = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    try:
        ddb_client.config_table().update_item(
            Key={"pk": "CONFIG", "sk": f"feature-flag/{flag_name}"},
            UpdateExpression="SET #v = :v, updated_at = :ts, actor = :a",
            ExpressionAttributeNames={"#v": "value"},
            ExpressionAttributeValues={
                ":v": {"enabled": enabled},
                ":ts": now,
                ":a": "admin",
            },
        )
    except Exception as e:
        logger.exception(f"feature-flag-update failed: {flag_name} {action}")
        return response.err(f"feature flag update failed: {type(e).__name__}", 500)

    audit.log("feature-flag-update", {"flag": flag_name, "action": action})
    return response.ok({"flag": flag_name, "enabled": enabled, "updated_at": now})


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

    now = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    try:
        ddb_client.config_table().update_item(
            Key={"pk": "CONFIG", "sk": f"threshold/{name}"},
            UpdateExpression="SET #v = :v, updated_at = :ts, actor = :a",
            ExpressionAttributeNames={"#v": "value"},
            ExpressionAttributeValues={
                ":v": {"threshold": value},
                ":ts": now,
                ":a": "admin",
            },
        )
    except Exception as e:
        logger.exception(f"threshold-update failed: {name} {value}")
        return response.err(f"threshold update failed: {type(e).__name__}", 500)

    audit.log("threshold-update", {"threshold": name, "value": value})
    return response.ok({"threshold": name, "value": value, "updated_at": now})
