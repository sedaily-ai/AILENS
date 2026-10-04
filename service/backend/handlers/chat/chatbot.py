"""
Chatbot Handler Lambda Function
Provides AI-powered chat responses using a single default persona/voice.
Uses Claude API via AWS Bedrock.

2026-08-05: 컨텍스트 조회(services/chatbot_context_service.py), 프롬프트 구성
(services/chatbot_prompt_service.py), Bedrock 호출 엔진(services/chatbot_engine.py)을
분리 — 이 파일은 이제 HTTP 라우팅/검증/응답 조립만 담당한다.
(`handlers/briefing_handler.py`가 `services/briefing_generator.py`를 쓰는 것과 같은 패턴.)

2026-08-07: MBTI 페르소나 전체 제거 — 더 이상 그룹별로 분기하지 않는다. 요청
바디에 `mbti_group`이 실려 와도(구 프론트 잔재) 그냥 무시한다.
"""
import logging
import json
from datetime import datetime

from config.constants import CORS_HEADERS
from common.feature_flag import is_enabled
from services.chat.context import get_cached_briefing, get_recent_articles, search_related_articles
from services.chat.engine import generate_chat_response

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# 페르소나 제거 후 단일 기본 챗봇 아이덴티티.
DEFAULT_PERSONA = {'name': '서울경제 AI', 'role': 'AI 챗봇', 'emoji': '🤖'}


def lambda_handler(event: dict, context) -> dict:
    """
    Lambda handler for chatbot API.

    Expected request body:
    {
        "message": "사용자 메시지",
        "conversation_history": [
            {"role": "user", "content": "이전 메시지"},
            {"role": "assistant", "content": "이전 응답"}
        ]
    }
    (구 프론트가 보내는 "mbti_group" 필드는 있어도 무시한다.)

    Response:
    {
        "response": "AI 응답 텍스트",
        "persona": {
            "name": "서울경제 AI",
            "role": "AI 챗봇",
            "emoji": "🤖"
        }
    }
    """
    try:
        # Support both HTTP API v2 and REST API v1 event formats
        request_context = event.get('requestContext', {})

        # HTTP API v2 format
        if 'http' in request_context:
            http_method = request_context['http'].get('method', 'GET')
        else:
            # REST API v1 format
            http_method = event.get('httpMethod', 'GET')

        # Handle CORS preflight — must precede feature-flag gate so disabled state
        # still returns a successful preflight (browser refuses non-2xx preflight).
        if http_method == 'OPTIONS':
            return {
                'statusCode': 200,
                'headers': CORS_HEADERS,
                'body': ''
            }

        if not is_enabled("chatbot"):
            return {
                "statusCode": 503,
                "headers": {**CORS_HEADERS, "Content-Type": "application/json"},
                "body": json.dumps({"error": "chatbot disabled by admin"}),
            }

        # Parse request body (handle base64 encoding for HTTP API v2)
        import base64
        body = event.get('body', '{}')
        is_base64 = event.get('isBase64Encoded', False)

        if body and is_base64:
            body = base64.b64decode(body).decode('utf-8')

        if isinstance(body, str) and body:
            body = json.loads(body)
        elif not body:
            body = {}

        user_message = body.get('message', '').strip()
        conversation_history = body.get('conversation_history', [])

        # Validate inputs
        if not user_message:
            return {
                'statusCode': 400,
                'headers': CORS_HEADERS,
                'body': json.dumps({
                    'error': {
                        'code': 'INVALID_REQUEST',
                        'message': '메시지를 입력해주세요.'
                    }
                })
            }
        # Bound the message length before sending to Bedrock. The chatbot
        # Haiku call has no per-user rate limit; without a cap a single
        # caller can submit very long inputs and run up unbounded cost.
        if len(user_message) > 4000:
            return {
                'statusCode': 400,
                'headers': CORS_HEADERS,
                'body': json.dumps({
                    'error': {
                        'code': 'MESSAGE_TOO_LONG',
                        'message': '메시지가 너무 깁니다. 4000자 이하로 줄여주세요.'
                    }
                }, ensure_ascii=False)
            }

        logger.info(f"Chat request: message_length={len(user_message)}")

        # Try cached briefing first, fall back to article query
        cached_briefing = get_cached_briefing()
        recent_articles = None if cached_briefing else get_recent_articles(5)

        # Generate response (sync wrapper for async function)
        import asyncio
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

        try:
            response_text = loop.run_until_complete(
                generate_chat_response(
                    user_message=user_message,
                    conversation_history=conversation_history,
                    recent_articles=recent_articles,
                    cached_briefing=cached_briefing
                )
            )
        finally:
            loop.close()

        # Search related articles based on user message
        related_articles = search_related_articles(user_message, limit=3)

        return {
            'statusCode': 200,
            'headers': CORS_HEADERS,
            'body': json.dumps({
                'response': response_text,
                'persona': DEFAULT_PERSONA,
                'recommended_articles': related_articles,
                'timestamp': datetime.now().isoformat()
            }, ensure_ascii=False)
        }

    except json.JSONDecodeError as e:
        logger.error(f"JSON decode error: {e}")
        return {
            'statusCode': 400,
            'headers': CORS_HEADERS,
            'body': json.dumps({
                'error': {
                    'code': 'INVALID_JSON',
                    'message': '잘못된 요청 형식입니다.'
                }
            })
        }

    except Exception as e:
        logger.error(f"Chatbot error: {e}", exc_info=True)
        return {
            'statusCode': 500,
            'headers': CORS_HEADERS,
            'body': json.dumps({
                'error': {
                    'code': 'INTERNAL_ERROR',
                    'message': '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'
                }
            })
        }
