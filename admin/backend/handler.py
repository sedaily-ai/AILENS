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
    chat_threads,
    cost,
    drivers,
    letters,
    media,
    newsletter,
    posts,
    prompt_lab,
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
    "GET /admin/prompts/{category}/{name}/test/{job_id}": (prompts.handle_test_status, True),
    "POST /admin/prompts/{category}/{name}/storyboard-test": (prompts.handle_storyboard_test, True),
    "GET /admin/prompts/{category}/{name}/storyboard-test/{job_id}": (prompts.handle_storyboard_test_status, True),
    # 프롬프트 실험 챗랩 — 설명/지침/파일 개별 CRUD (2026-09-15)
    "GET /admin/prompt-lab/{category}/{name}": (prompt_lab.handle_get_doc, True),
    "PUT /admin/prompt-lab/{category}/{name}/description": (prompt_lab.handle_update_description, True),
    "PUT /admin/prompt-lab/{category}/{name}/instructions": (prompt_lab.handle_update_instructions, True),
    "POST /admin/prompt-lab/{category}/{name}/files": (prompt_lab.handle_create_file, True),
    "GET /admin/prompt-lab/{category}/{name}/files/{file_id}": (prompt_lab.handle_get_file, True),
    "PUT /admin/prompt-lab/{category}/{name}/files/{file_id}": (prompt_lab.handle_update_file, True),
    "DELETE /admin/prompt-lab/{category}/{name}/files/{file_id}": (prompt_lab.handle_delete_file, True),
    "POST /admin/prompt-lab/{category}/{name}/publish": (prompt_lab.handle_publish, True),
    # 프롬프트 실험 챗랩 — 대화 스레드/메시지 (2026-09-15)
    "POST /admin/chat-threads": (chat_threads.handle_create, True),
    "GET /admin/chat-threads": (chat_threads.handle_list, True),
    "GET /admin/chat-threads/{thread_id}": (chat_threads.handle_get, True),
    "POST /admin/chat-threads/{thread_id}/messages": (chat_threads.handle_append_message, True),
    "PUT /admin/chat-threads/{thread_id}": (chat_threads.handle_update, True),
    "DELETE /admin/chat-threads/{thread_id}": (chat_threads.handle_delete, True),
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
    # docstring 참고. API Gateway에도 이미 올라가 있다(2026-09-16 확인,
    # AuthorizationType NONE — Lambda가 직접 JWT 검증). 새 라우트를 추가할
    # 땐 여기 등록 + API Gateway에 `aws apigatewayv2 create-route`로 같은
    # integration(기존 라우트로 `get-routes`ID 조회) 붙이는 것 둘 다 필요.
    "POST /admin/webtoon-lab/generate": (webtoon_lab.handle_generate, True),
    "GET /admin/webtoon-lab/history": (webtoon_lab.handle_history, True),
    "GET /admin/webtoon-lab/defaults": (webtoon_lab.handle_defaults, True),
    "GET /admin/webtoon-lab/{job_id}": (webtoon_lab.handle_status, True),
    # 컷별 "실제 품질" 이미지 생성 + GPU 켜기/끄기 (2026-09-14)
    "POST /admin/webtoon-lab/generate-composed": (webtoon_lab.handle_generate_composed, True),
    "GET /admin/webtoon-lab/gpu/status": (webtoon_lab.handle_gpu_status, True),
    "POST /admin/webtoon-lab/gpu/start": (webtoon_lab.handle_gpu_start, True),
    "POST /admin/webtoon-lab/gpu/stop": (webtoon_lab.handle_gpu_stop, True),
    # 인물·화풍 참조 이미지 업로드 (2026-09-16) — webtoon_lab.py 새 섹션 주석 참고.
    "GET /admin/webtoon-lab/image-assets": (webtoon_lab.handle_image_assets_get, True),
    "POST /admin/webtoon-lab/image-assets/presign": (webtoon_lab.handle_image_assets_presign, True),
    "GET /admin/webtoon-lab/image-assets/gallery": (webtoon_lab.handle_image_assets_gallery, True),
    "POST /admin/webtoon-lab/image-assets/select": (webtoon_lab.handle_image_assets_select, True),
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
    # 2026-09-11 — 프롬프트 테스트(Bedrock)가 30초 API Gateway 벽을 넘길 수
    # 있어 비동기로 뺐다: 원 요청은 job_id만 즉시 돌려주고, 실제 Bedrock
    # 호출은 이 함수가 자기 자신을 InvocationType="Event"로 다시 호출해서
    # 만든 완전히 별개의 invocation에서 처리한다(routes/prompts.py::
    # _self_invoke_async 참고). webtoon_lab.py의 threading 방식(그 파일
    # docstring이 직접 경고: "Lambda는 호출이 끝나는 순간 컨테이너가
    # 얼려질 수 있어 스레드가 안 끝날 위험")은 수 초짜리 작업엔 버텨도
    # 25~40초 걸리는 이 작업엔 못 버틴다 — self-invoke는 완전히 새
    # invocation이라 그 문제가 없다. 이 내부 이벤트는 API Gateway를 안
    # 거쳐 HTTP 모양이 아니므로 정상 라우팅보다 먼저 걸러낸다.
    if event.get("_async_prompt_job"):
        from routes import prompts
        prompts.run_async_job(event["_async_prompt_job"])
        return {}
    # 2026-09-14 — 웹툰 컷 이미지를 실제 발행본과 같은 경로(GPU IP-Adapter+
    # Style Transfer+QA+텍스트 합성)로 만들면서 webtoon_lab.py도 같은
    # self-invoke 비동기 패턴이 필요해졌다(threading 방식은 이 파일
    # docstring이 이미 경고한 대로 이렇게 긴 작업엔 못 버틴다) — 마커
    # 키만 달리해서 두 모듈의 비동기 작업을 구분한다.
    if event.get("_async_webtoon_job"):
        from routes import webtoon_lab
        webtoon_lab.run_async_job(event["_async_webtoon_job"])
        return {}
    # 2026-09-14 — 프롬프트 실험 채팅(PromptChatLab.tsx) 실시간 스트리밍용
    # self-invoke 마커. 위 둘과 같은 이유(routes/chat_ws.py 모듈 docstring
    # 참고) — 마커 키만 다르다.
    if event.get("_async_ws_job"):
        from routes import chat_ws
        chat_ws.run_async_job(event["_async_ws_job"])
        return {}
    # 2026-09-14 — API Gateway WebSocket API(p4yjifd5v1, HTTP API인
    # chzwwtjtgk와 별개)가 보내는 이벤트는 routeKey 대신
    # requestContext.eventType(CONNECT/DISCONNECT/MESSAGE)로 구분된다 —
    # HTTP 라우팅(HANDLERS)보다 먼저 걸러낸다. routes/chat_ws.py 모듈
    # docstring 참고.
    ws_event_type = (event.get("requestContext") or {}).get("eventType")
    if ws_event_type in ("CONNECT", "DISCONNECT", "MESSAGE"):
        from routes import chat_ws
        if ws_event_type == "CONNECT":
            return chat_ws.handle_connect(event)
        if ws_event_type == "DISCONNECT":
            return chat_ws.handle_disconnect(event)
        return chat_ws.handle_message(event)
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
