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
                         개인별 이력은 안 남기고 집계 카운터만 올린다
                         (2026-08-09 스코프, 익명 집계까지만).

2026-09-09(v1.26): 집계 저장을 DynamoDB(engagement 테이블 공유)에서
PostgreSQL(lens-cms-api, quizzes.total_count/correct_count)로 전환.
이 Lambda(sedaily-mbti-v2-quiz-dev)는 sedaily-mbti-v2-collector-dev-role을
써서 /sedaily-mbti/v2/* SSM 경로에 접근 가능(V2SecretsAccess 정책) —
newsletter_subscribers_pg_client.py(v1.23)와 같은 토큰을 그대로 재사용한다.
"""
import json
import logging
import urllib.error
import urllib.request

from clients.quiz_questions_ddb_client import list_published_quizzes
from common.secrets import get_secret
from config.constants import CORS_HEADERS
from core.decorators import lambda_handler as handler_decorator
from core.response import error_response, success_response

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

_API_URL = "http://13.223.179.151"
_MAX_QUIZZES = 4


def _record_attempt(quiz_id: str, correct: bool) -> bool:
    token = get_secret("/sedaily-mbti/v2/lens-cms-api-token")
    req = urllib.request.Request(
        f"{_API_URL}/internal/quiz/attempt",
        data=json.dumps({"quiz_id": quiz_id, "correct": correct}).encode(),
        headers={"Content-Type": "application/json", "X-Internal-Token": token},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=8) as res:
            return json.loads(res.read()).get("ok", False)
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return False
        raise


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
    return success_response({"quizzes": quizzes})


def _handle_attempt(body: dict) -> dict:
    quiz_id = (body.get("quiz_id") or "").strip()
    if not quiz_id:
        return error_response("quiz_id required", status_code=400)
    correct = bool(body.get("correct"))
    try:
        ok = _record_attempt(quiz_id, correct)
    except Exception as e:
        logger.exception(f"quiz attempt write fail: {e}")
        return error_response("attempt write failed", status_code=500)
    if not ok:
        return error_response("quiz not found", status_code=404)
    return success_response({"ok": True})


@handler_decorator
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
        return error_response("invalid JSON body", status_code=400)

    return error_response("not found", status_code=404)
