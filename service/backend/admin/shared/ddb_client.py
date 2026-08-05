"""DynamoDB resource singleton + admin 테이블 accessor."""

import os

import boto3

REGION = os.environ.get("AWS_REGION", "us-east-1")
CONFIG_TABLE = os.environ.get("ADMIN_CONFIG_TABLE", "sedaily-mbti-admin-config-dev")
PROMPTS_TABLE = os.environ.get("ADMIN_PROMPTS_TABLE", "sedaily-mbti-admin-prompts-dev")
CMS_POSTS_TABLE = os.environ.get("CMS_POSTS_TABLE", "sedaily-mbti-cms-posts-dev")
DAILY_LETTERS_TABLE = os.environ.get(
    "DAILY_LETTERS_TABLE", "sedaily-mbti-daily-letters-dev"
)

_resource = boto3.resource("dynamodb", region_name=REGION)


def config_table():
    return _resource.Table(CONFIG_TABLE)


def prompts_table():
    return _resource.Table(PROMPTS_TABLE)


def posts_table():
    return _resource.Table(CMS_POSTS_TABLE)


def letters_table():
    return _resource.Table(DAILY_LETTERS_TABLE)
