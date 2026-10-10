"""DynamoDB resource singleton + 아직 남은 admin 테이블 accessor.

v1.36(2026-10-09) 기준 남은 사용처: config_table(PROMPTTEST·WEBTOONLAB job 이관 전 DynamoDB 경로, JOBS_BACKEND=ddb 일 때)와 letters_table(관리자 레터 화면, 빈 테이블 — 폐기 후보).
글·퀴즈·구독자·프롬프트 테이블 accessor 는 모두 Postgres(lens-cms-api) 전환으로 사용처가 없어 제거했다."""

import os

import boto3

REGION = os.environ.get("AWS_REGION", "us-east-1")
CONFIG_TABLE = os.environ.get("ADMIN_CONFIG_TABLE", "sedaily-mbti-admin-config-dev")
DAILY_LETTERS_TABLE = os.environ.get(
    "DAILY_LETTERS_TABLE", "sedaily-mbti-daily-letters-dev"
)

_resource = boto3.resource("dynamodb", region_name=REGION)


def config_table():
    return _resource.Table(CONFIG_TABLE)


def letters_table():
    return _resource.Table(DAILY_LETTERS_TABLE)
