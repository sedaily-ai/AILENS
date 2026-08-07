"""
WebSocket $connect 핸들러.
연결 수립 시 connectionId 를 DDB 에 저장. 24h TTL.
"""
import logging
from datetime import datetime, timezone

import boto3

from config.constants import DYNAMODB_TABLE_WS_CONNECTIONS_DEV

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

_dynamodb = boto3.resource('dynamodb')


def lambda_handler(event, context):
    connection_id = event['requestContext']['connectionId']

    qs = event.get('queryStringParameters') or {}
    # 구 프론트가 "mbti_group" 쿼리 파라미터를 실어 보내도 무시한다 —
    # 2026-08-07 MBTI 페르소나 제거로 connection 별 페르소나 소속 개념 자체가 없다.
    user_id = qs.get('user_id') or 'anonymous'

    now = datetime.now(timezone.utc)
    table = _dynamodb.Table(DYNAMODB_TABLE_WS_CONNECTIONS_DEV)
    table.put_item(Item={
        'connectionId': connection_id,
        'user_id': user_id,
        'connected_at': now.isoformat(),
        'ttl': int(now.timestamp()) + 86400,
    })

    logger.info(f"WS connect: {connection_id} user={user_id}")
    return {'statusCode': 200, 'body': 'Connected'}
