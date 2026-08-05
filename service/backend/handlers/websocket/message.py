"""
WebSocket sendMessage 핸들러.

요청 payload (action=sendMessage):
{
    "action": "sendMessage",
    "message": "...",
    "mbti_group": "NT" | "NF" | "ST" | "SF",
    "conversation_history": [{role, content}, ...]   // 선택
}

전송 이벤트:
- {"type": "ai_start", "timestamp": ...}
- {"type": "ai_chunk", "chunk": "...", "chunk_index": N}
- {"type": "chat_end", "total_chunks": N, "response_length": L}
- {"type": "error", "message": ...}
"""
import json
import logging
from datetime import datetime, timezone

import boto3

from config.constants import MBTI_GROUPS, DYNAMODB_TABLE_WS_CONNECTIONS_DEV
from services.chatbot_engine import generate_chat_response_stream

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

_dynamodb = boto3.resource('dynamodb')


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _make_apigw_client(domain_name: str, stage: str):
    return boto3.client(
        'apigatewaymanagementapi',
        endpoint_url=f'https://{domain_name}/{stage}',
        region_name='us-east-1',
    )


def _send(apigw, connection_id: str, payload: dict) -> bool:
    """단일 메시지 push. 연결 끊기면 DDB 정리하고 False."""
    try:
        apigw.post_to_connection(
            ConnectionId=connection_id,
            Data=json.dumps(payload, ensure_ascii=False, default=str),
        )
        return True
    except apigw.exceptions.GoneException:
        logger.warning(f"connection gone: {connection_id}")
        try:
            _dynamodb.Table(DYNAMODB_TABLE_WS_CONNECTIONS_DEV).delete_item(
                Key={'connectionId': connection_id}
            )
        except Exception:
            pass
        return False
    except Exception as e:
        logger.error(f"send error to {connection_id}: {e}")
        return False


def lambda_handler(event, context):
    ctx = event['requestContext']
    connection_id = ctx['connectionId']
    apigw = _make_apigw_client(ctx['domainName'], ctx['stage'])

    try:
        body = json.loads(event.get('body') or '{}')
    except json.JSONDecodeError:
        _send(apigw, connection_id, {'type': 'error', 'message': 'invalid JSON body'})
        return {'statusCode': 400, 'body': 'invalid JSON'}

    action = body.get('action', 'sendMessage')
    if action != 'sendMessage':
        _send(apigw, connection_id, {'type': 'error', 'message': f'unknown action: {action}'})
        return {'statusCode': 400, 'body': 'unknown action'}

    user_message = (body.get('message') or '').strip()
    mbti_group = (body.get('mbti_group') or 'SF').upper()
    if mbti_group not in MBTI_GROUPS:
        mbti_group = 'SF'
    conversation_history = body.get('conversation_history') or []

    if not user_message:
        _send(apigw, connection_id, {'type': 'error', 'message': '메시지가 비어있습니다.'})
        return {'statusCode': 400, 'body': 'empty message'}

    # ai_start
    if not _send(apigw, connection_id, {'type': 'ai_start', 'mbti_group': mbti_group, 'timestamp': _now_iso()}):
        return {'statusCode': 200, 'body': 'connection gone'}

    chunk_index = 0
    total_response = ''
    try:
        for chunk in generate_chat_response_stream(
            user_message=user_message,
            mbti_group=mbti_group,
            conversation_history=conversation_history,
        ):
            if not chunk:
                continue
            total_response += chunk
            ok = _send(apigw, connection_id, {
                'type': 'ai_chunk',
                'chunk': chunk,
                'chunk_index': chunk_index,
            })
            if not ok:
                logger.info(f"client gone mid-stream, aborting after {chunk_index} chunks")
                return {'statusCode': 200, 'body': 'client gone'}
            chunk_index += 1
    except Exception as e:
        logger.exception(f"streaming error: {e}")
        _send(apigw, connection_id, {'type': 'error', 'message': f'스트리밍 오류: {str(e)}'})
        return {'statusCode': 500, 'body': str(e)}

    _send(apigw, connection_id, {
        'type': 'chat_end',
        'mbti_group': mbti_group,
        'total_chunks': chunk_index,
        'response_length': len(total_response),
        'timestamp': _now_iso(),
    })

    logger.info(f"WS chat done: connection={connection_id} mbti={mbti_group} chunks={chunk_index} len={len(total_response)}")
    return {'statusCode': 200, 'body': 'ok'}
