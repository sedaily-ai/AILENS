"""
커뮤니티 게시글 Lambda 핸들러.

게시글 CRUD, 투표, 댓글을 처리한다. DynamoDB 접근, 응답 구성, 투표·댓글 카운터 갱신은
services/user/community_post.py 에 있으며, 이 파일은 HTTP 라우팅과 인증만 담당한다.
"""
import json
import logging

from core.auth import get_authenticated_user_id
from core.exceptions import AuthenticationError
from services.user import community_post as svc

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

        # POST /api/posts: API Gateway 가 POST 를 경로 파라미터 없이 전달하므로
        # 투표·댓글은 body.action 과 body.post_id 로 구분한다.
        if method == "POST":
            body = json.loads(event.get("body", "{}"))
            # 모든 POST 라우트(작성·투표·댓글)는 검증된 사용자가 필요하다.
            # 클라이언트가 보낸 user_id 는 무시하고 JWT sub 로 덮어쓴다.
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
