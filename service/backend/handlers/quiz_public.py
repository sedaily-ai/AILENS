"""용어 퀴즈 공개 API — 전용 Lambda sedaily-mbti-v2-quiz-dev.

GET  /api/quiz/today   — 발행된 용어 퀴즈 여러 개(최대 4개) 조회. 하나도 없으면
                         빈 배열 — 프론트(WordsPreviewSection.tsx)가 레터 키워드
                         기반 자동생성 로직으로 폴백한다. 이름은 "today"지만
                         2026-08-09부터 날짜 일치 조건은 없앴다 — 관리자가
                         발행/내리기로 직접 고르는 것 자체가 "노출 체크박스"라
                         (요청: "체크박스 만들고 체크된 거는 노출") 발행된 건
                         전부(최대 4개) 최신 발행일 순으로 내려준다.
POST /api/quiz/attempt — 응답 집계. body={quiz_id, correct}. 무인증(익명) —
                         newsletter/subscribe.py와 같은 공개 write 패턴.
                         개인별 이력은 안 남기고 engagement 테이블에 집계
                         카운터만 ADD한다(2026-08-09 스코프, 익명 집계까지만).
"""
import json
import logging

import boto3
from botocore.exceptions import ClientError

from clients.quiz_questions_ddb_client import list_published_quizzes
from config.constants import CORS_HEADERS

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

ENGAGEMENT_TABLE = "sedaily-mbti-engagement-dev"
_MAX_QUIZZES = 4

_engagement_table = None


def _get_engagement_table():
    global _engagement_table
    if _engagement_table is None:
        _engagement_table = boto3.resource("dynamodb", region_name="us-east-1").Table(ENGAGEMENT_TABLE)
    return _engagement_table


def _resp(status: int, body: dict) -> dict:
    return {"statusCode": status, "headers": CORS_HEADERS, "body": json.dumps(body, ensure_ascii=False)}


def _handle_today() -> dict:
    quizzes = []
    for q in list_published_quizzes(limit=_MAX_QUIZZES):
        options = [o for o in (q.get("options") or []) if (o or "").strip()]
        if len(options) < 3:
            # 관리자 쪽에서 발행 시점에 이미 막지만(routes/quiz.py), 그 검증
            # 전에 발행된 레거시 항목 방어용 — 오답이 부족한 건 건너뛴다.
            continue
        quizzes.append(
            {"id": q.get("id"), "term": q.get("term"), "explain": q.get("explain"), "options": options[:3]}
        )
    return _resp(200, {"quizzes": quizzes})


def _handle_attempt(body: dict) -> dict:
    quiz_id = (body.get("quiz_id") or "").strip()
    if not quiz_id:
        return _resp(400, {"error": "quiz_id required"})
    correct = bool(body.get("correct"))
    try:
        _get_engagement_table().update_item(
            Key={"pk": f"QUIZ#{quiz_id}", "sk": "STATS"},
            UpdateExpression="ADD total_count :one, correct_count :c",
            ExpressionAttributeValues={":one": 1, ":c": 1 if correct else 0},
        )
    except ClientError as e:
        logger.exception(f"quiz attempt write fail: {e}")
        return _resp(500, {"error": "attempt write failed"})
    return _resp(200, {"ok": True})


def lambda_handler(event: dict, context) -> dict:
    method = event.get("httpMethod") or (event.get("requestContext") or {}).get("http", {}).get("method", "GET")
    if method == "OPTIONS":
        return {"statusCode": 200, "headers": CORS_HEADERS, "body": ""}

    path = event.get("rawPath") or event.get("path") or ""
    try:
        if method == "GET" and path.endswith("/today"):
            return _handle_today()
        if method == "POST" and path.endswith("/attempt"):
            body = json.loads(event.get("body") or "{}")
            return _handle_attempt(body)
    except json.JSONDecodeError:
        return _resp(400, {"error": "invalid JSON body"})

    return _resp(404, {"error": "not found"})
