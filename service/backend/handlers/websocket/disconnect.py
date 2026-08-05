"""
WebSocket $disconnect 핸들러.
connectionId 레코드 제거. TTL 도 있지만 disconnect 시 즉시 정리.
"""
import logging

import boto3

from config.constants import DYNAMODB_TABLE_WS_CONNECTIONS_DEV

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

_dynamodb = boto3.resource('dynamodb')


def lambda_handler(event, context):
    connection_id = event['requestContext']['connectionId']
    table = _dynamodb.Table(DYNAMODB_TABLE_WS_CONNECTIONS_DEV)
    table.delete_item(Key={'connectionId': connection_id})
    logger.info(f"WS disconnect: {connection_id}")
    return {'statusCode': 200, 'body': 'Disconnected'}
