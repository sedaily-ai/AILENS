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
QUIZ_QUESTIONS_TABLE = os.environ.get(
    "QUIZ_QUESTIONS_TABLE", "sedaily-mbti-quiz-questions-dev"
)
# service/backend 의 handlers/subscribe.py·newsletter/subscribers.py 와 같은 테이블을
# 읽기 전용으로 본다 — 환경변수 이름을 SUBSCRIBERS_TABLE 로 맞춰야 한다(2026-09-04
# 리팩토링 감사: 여기만 NEWSLETTER_SUBSCRIBERS_TABLE 을 써서, 테이블을 옮기려고
# 환경변수 하나만 바꾸면 이 통계 대시보드만 조용히 옛 테이블을 계속 보는 위험이 있었다).
SUBSCRIBERS_TABLE = os.environ.get(
    "SUBSCRIBERS_TABLE", "sedaily-mbti-newsletter-subscribers-dev"
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


def quiz_questions_table():
    return _resource.Table(QUIZ_QUESTIONS_TABLE)


def subscribers_table():
    return _resource.Table(SUBSCRIBERS_TABLE)
