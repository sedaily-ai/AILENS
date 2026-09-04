"""admin Lambda entry — HTTP API v2 형식 event 처리.

routing: HTTP API 의 routeKey (예: 'POST /admin/login') → HANDLERS dict.
auth: jwt_required=True route 는 verify_jwt 통과 후에만 dispatch.
error: 모든 unhandled exception 은 500 + log.exception (sensitive 정보 노출 금지).
"""

import base64
import datetime as dt
import json
import logging

import auth
from routes import (
    admin_password,
    audit as audit_route,
    cost,
    drivers,
    letters,
    media,
    newsletter,
    posts,
    prompts,
    quiz,
    webtoon_lab,
)
from shared import audit, response

logger = logging.getLogger()
logger.setLevel(logging.INFO)


HANDLERS: dict[str, tuple] = {
    "POST /admin/login": (auth.handle_login, False),
    "POST /admin/password-change": (admin_password.handle_change, True),
    "GET /admin/drivers": (drivers.handle_list, True),
    "POST /admin/drivers/{id}": (drivers.handle_update, True),
    "POST /admin/drivers/feature-flag/{name}": (drivers.handle_feature_flag_update, True),
    "POST /admin/drivers/threshold/{name}": (drivers.handle_threshold_update, True),
    "GET /admin/prompts": (prompts.handle_list, True),
    "GET /admin/prompts/{category}/{name}": (prompts.handle_get, True),
    "POST /admin/prompts/{category}/{name}": (prompts.handle_update, True),
    "POST /admin/prompts/{category}/{name}/test": (prompts.handle_test, True),
    "GET /admin/cost": (cost.handle_summary, True),
    "GET /admin/audit": (audit_route.handle_list, True),
    "GET /admin/newsletter/stats": (newsletter.handle_stats, True),
    # CMS posts (2026-07-27)
    "POST /admin/posts": (posts.handle_create, True),
    "GET /admin/posts": (posts.handle_list, True),
    "GET /admin/posts/{id}": (posts.handle_get, True),
    "PUT /admin/posts/{id}": (posts.handle_update, True),
    "POST /admin/posts/{id}/publish": (posts.handle_publish, True),
    "POST /admin/posts/{id}/unpublish": (posts.handle_unpublish, True),
    "DELETE /admin/posts/{id}": (posts.handle_delete, True),
    # AI 레터 편집 (2026-07-28)
    "GET /admin/letters": (letters.handle_list, True),
    "GET /admin/letters/{id}": (letters.handle_get, True),
    "PUT /admin/letters/{id}": (letters.handle_update, True),
    "DELETE /admin/letters/{id}": (letters.handle_delete, True),
    # 이미지 업로드 presign (2026-07-28)
    "POST /admin/media/presign": (media.handle_presign, True),
    # 용어 퀴즈 (2026-08-09)
    "POST /admin/quiz": (quiz.handle_create, True),
    "GET /admin/quiz": (quiz.handle_list, True),
    "GET /admin/quiz/{id}": (quiz.handle_get, True),
    "PUT /admin/quiz/{id}": (quiz.handle_update, True),
    "POST /admin/quiz/{id}/publish": (quiz.handle_publish, True),
    "POST /admin/quiz/{id}/unpublish": (quiz.handle_unpublish, True),
    "DELETE /admin/quiz/{id}": (quiz.handle_delete, True),
    # 웹툰 이미지 생성 실험 (2026-09-05) — routes/webtoon_lab.py 모듈
    # docstring 참고. ⚠️ 로컬 개발 서버(local_server.py)에서만 라우팅되고,
    # 실제 API Gateway엔 아직 이 3개 라우트가 없다(수동 추가 필요).
    "POST /admin/webtoon-lab/generate": (webtoon_lab.handle_generate, True),
    "GET /admin/webtoon-lab/history": (webtoon_lab.handle_history, True),
    "GET /admin/webtoon-lab/{job_id}": (webtoon_lab.handle_status, True),
}


def _parse_event(event: dict) -> tuple[str, str, str, dict, dict, dict]:
    rc = event.get("requestContext", {}) or {}
    http_ctx = rc.get("http", {}) or {}
    method = http_ctx.get("method", "")
    path = http_ctx.get("path", "")
    route_key = rc.get("routeKey") or f"{method} {path}"
    path_params = event.get("pathParameters") or {}
    query_params = event.get("queryStringParameters") or {}

    body_raw = event.get("body") or ""
    if event.get("isBase64Encoded") and body_raw:
        try:
            body_raw = base64.b64decode(body_raw).decode("utf-8")
        except Exception as e:
            logger.warning(f"base64 decode failed: {e}")
            body_raw = ""

    body: dict = {}
    if body_raw:
        try:
            body = json.loads(body_raw)
        except json.JSONDecodeError:
            body = {}

    return method, path, route_key, path_params, query_params, body


def _get_authorization(event: dict) -> str | None:
    headers = event.get("headers") or {}
    return headers.get("authorization") or headers.get("Authorization")


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
    # iat 는 우리가 만든 토큰에서는 항상 int 지만, 클레임은 결국 외부 입력이다.
    # 문자열·범위 밖 값이 오면 int()/fromtimestamp() 가 던지고, 감사 컨텍스트
    # 바인딩은 라우팅 **이전**에 일어나므로 요청 전체가 500 이 된다. 세션
    # 식별자는 감사 로그의 편의 항목이므로 실패해도 요청을 막아선 안 된다.
    try:
        return dt.datetime.fromtimestamp(int(iat), dt.timezone.utc).strftime(
            "%Y-%m-%dT%H:%M:%SZ"
        )
    except (TypeError, ValueError, OverflowError, OSError):
        logger.warning("audit session id 계산 실패 — iat=%r 무시", iat)
        return None


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
