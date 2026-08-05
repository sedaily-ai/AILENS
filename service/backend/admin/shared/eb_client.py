"""EventBridge wrapper + cron preset 양방향 매핑."""

import os
from typing import Optional

import boto3

REGION = os.environ.get("AWS_REGION", "us-east-1")
_client = boto3.client("events", region_name=REGION)

# preset → schedule expression
PRESET_TO_SCHEDULE: dict[str, str] = {
    "5m": "rate(5 minutes)",
    "30m": "rate(30 minutes)",
    "1h": "rate(1 hour)",
    "3h": "cron(0 0/3 * * ? *)",
    "6h": "cron(0 0/6 * * ? *)",
    "12h": "cron(0 0/12 * * ? *)",
    "daily-22kst": "cron(0 13 * * ? *)",  # UTC 13:00 = KST 22:00
    "daily-04kst": "cron(0 19 * * ? *)",  # UTC 19:00 = KST 04:00
}

# 역매핑 — schedule → preset (없으면 'custom')
SCHEDULE_TO_PRESET: dict[str, str] = {v: k for k, v in PRESET_TO_SCHEDULE.items()}


def list_rules(name_prefix: str = "sedaily-mbti-") -> list[dict]:
    rules: list[dict] = []
    paginator = _client.get_paginator("list_rules")
    for page in paginator.paginate(NamePrefix=name_prefix):
        for rule in page.get("Rules", []):
            schedule = rule.get("ScheduleExpression", "")
            rules.append(
                {
                    "name": rule["Name"],
                    "state": rule.get("State", "UNKNOWN"),
                    "schedule": schedule,
                    "preset": SCHEDULE_TO_PRESET.get(schedule, "custom"),
                }
            )
    rules.sort(key=lambda r: r["name"])
    return rules


def enable_rule(name: str) -> None:
    _client.enable_rule(Name=name)


def disable_rule(name: str) -> None:
    _client.disable_rule(Name=name)


def set_schedule(name: str, preset: str) -> str:
    """preset → schedule expression 변환 후 put_rule."""
    schedule = PRESET_TO_SCHEDULE.get(preset)
    if not schedule:
        raise ValueError(f"unknown preset: {preset}")
    _client.put_rule(Name=name, ScheduleExpression=schedule)
    return schedule


def describe_rule(name: str) -> Optional[dict]:
    try:
        resp = _client.describe_rule(Name=name)
    except _client.exceptions.ResourceNotFoundException:
        return None
    schedule = resp.get("ScheduleExpression", "")
    return {
        "name": resp["Name"],
        "state": resp.get("State", "UNKNOWN"),
        "schedule": schedule,
        "preset": SCHEDULE_TO_PRESET.get(schedule, "custom"),
    }
