"""
Community Post Handler Lambda Function
Handles community post CRUD, voting, and comments.

2026-08-24 — 실제 로직(DynamoDB 접근·응답 shaping·투표/댓글 카운터 갱신)은
services/community_post_service.py로 뺐다(코드 리팩토링 감사 Track B, God
파일 분해 — 396줄 중 라우팅 순수 로직은 이 파일에 남은 것뿐). 이 파일은
이제 HTTP 라우팅(메서드/경로 판별, 이벤트 파싱, 인증)만 담당한다.
"""
import json
import logging

from core.auth import get_authenticated_user_id
from core.exceptions import AuthenticationError
from services import community_post_service as svc

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


def lambda_handler(event: dict, context) -> dict:
    """
    Routes:
        POST   /api/posts                   — Create community post
        GET    /api/posts?date=YYYYMMDD      — List posts
        POST   /api/posts/{post_id}/vote     — Vote
        POST   /api/posts/{post_id}/comments — Add comment
        GET    /api/posts/{post_id}/comments — List comments
        OPTIONS                              — CORS preflight
    """
    try:
        if event.get("source") == "aws.events" or event.get("warmup"):
            return svc.cors(200, {"status": "warm"})

        rc = event.get("requestContext", {})
        if "http" in rc:
            method = rc["http"].get("method", "GET")
        else:
            method = event.get("httpMethod", "GET")

        params = event.get("queryStringParameters") or {}
        path_params = event.get("pathParameters") or {}

        if method == "OPTIONS":
            return svc.cors(200, {"message": "OK"})

        post_id = path_params.get("post_id") or path_params.get("id")

        # POST /api/posts — action-based dispatch
        # API Gateway only routes POST to /api/posts (no path param),
        # so vote/comment use body.action + body.post_id.
        if method == "POST":
            body = json.loads(event.get("body", "{}"))
            # All POST routes (create / vote / comment) need a verified user.
            # The body's `user_id` was previously trusted, allowing trivial
            # impersonation. Replace it with the JWT `sub` and ignore any
            # value the client supplied.
            try:
                body['user_id'] = get_authenticated_user_id(event)
            except AuthenticationError as e:
                return svc.cors(401, {"error": str(e)})
            action = body.get("action", "create")

            if action == "vote":
                pid = body.get("post_id", "")
                if not pid:
                    return svc.cors(400, {"error": "post_id is required"})
                return svc.vote_post(pid, body)
            elif action == "comment":
                pid = body.get("post_id", "")
                if not pid:
                    return svc.cors(400, {"error": "post_id is required"})
                return svc.add_comment(pid, body)
            else:
                return svc.create_post(body)

        # GET /api/posts — List posts
        if method == "GET" and not post_id:
            return svc.list_posts(params)

        # GET /api/posts/{post_id}?type=comments — List comments
        # GET /api/posts/{post_id} — placeholder
        if method == "GET" and post_id:
            if params.get("type") == "comments":
                return svc.list_comments(post_id, params)
            return svc.cors(200, {"post_id": post_id})

        return svc.cors(405, {"error": "Method not allowed"})

    except json.JSONDecodeError:
        return svc.cors(400, {"error": "Invalid JSON body"})
    except Exception as e:
        logger.error(f"Post handler error: {e}", exc_info=True)
        return svc.cors(500, {"error": "Internal server error"})
