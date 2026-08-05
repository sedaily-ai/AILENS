"""
GA4 Stats Handler — Google Analytics 4 Data API + Real-Time API 응답을 모아 캐싱.

ENV:
  GA4_PROPERTY_ID                 — 9자리 GA4 속성 ID
  GA4_KEY_SSM_PARAMETER           — SSM SecureString 경로 (JSON key)
                                     default '/sedaily-mbti/ga4/service-account-key'

캐시: DDB sedaily-mbti-engagement-dev
  PK = 'STATS#ga4'
  SK = 'snapshot'
  TTL: 5분 (epoch seconds)

라우트:
  GET /api/stats/ga4   → { active_now, today, last_7d, last_30d, total }
"""
import json
import logging
import os
import time
from datetime import datetime, timezone, timedelta

import boto3
from botocore.exceptions import ClientError

from google.oauth2 import service_account
from google.analytics.data_v1beta import BetaAnalyticsDataClient
from google.analytics.data_v1beta.types import (
    DateRange,
    Metric,
    RunReportRequest,
    RunRealtimeReportRequest,
)

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

ENGAGEMENT_TABLE = 'sedaily-mbti-engagement-dev'
CACHE_PK = 'STATS#ga4'
CACHE_SK = 'snapshot'
CACHE_TTL_SEC = 300  # 5분

CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
}

_client_cache = None  # Lambda warm-start 동안 재사용


def _load_credentials():
    """SSM SecureString 에서 JSON key 읽어 service account credentials 반환."""
    param_name = os.environ.get('GA4_KEY_SSM_PARAMETER', '/sedaily-mbti/ga4/service-account-key')
    ssm = boto3.client('ssm', region_name=os.environ.get('AWS_REGION', 'us-east-1'))
    resp = ssm.get_parameter(Name=param_name, WithDecryption=True)
    key_info = json.loads(resp['Parameter']['Value'])
    return service_account.Credentials.from_service_account_info(
        key_info,
        scopes=['https://www.googleapis.com/auth/analytics.readonly'],
    )


def _get_client() -> BetaAnalyticsDataClient:
    global _client_cache
    if _client_cache is None:
        creds = _load_credentials()
        _client_cache = BetaAnalyticsDataClient(credentials=creds)
    return _client_cache


def _table():
    return boto3.resource('dynamodb', region_name=os.environ.get('AWS_REGION', 'us-east-1')).Table(ENGAGEMENT_TABLE)


def _read_cache() -> dict | None:
    try:
        resp = _table().get_item(Key={'pk': CACHE_PK, 'sk': CACHE_SK})
        item = resp.get('Item')
        if not item:
            return None
        if int(item.get('expires_at', 0)) < int(time.time()):
            return None
        return {
            'active_now': int(item.get('active_now', 0)),
            'today': int(item.get('today', 0)),
            'last_7d': int(item.get('last_7d', 0)),
            'last_30d': int(item.get('last_30d', 0)),
            'total': int(item.get('total', 0)),
        }
    except ClientError:
        return None


def _write_cache(stats: dict) -> None:
    try:
        _table().put_item(Item={
            'pk': CACHE_PK,
            'sk': CACHE_SK,
            'active_now': stats['active_now'],
            'today': stats['today'],
            'last_7d': stats['last_7d'],
            'last_30d': stats['last_30d'],
            'total': stats['total'],
            'expires_at': int(time.time()) + CACHE_TTL_SEC,
        })
    except ClientError as e:
        logger.warning('cache write failed: %s', e)


def _fetch_active_now(client: BetaAnalyticsDataClient, prop_id: str) -> int:
    """지난 30분 active users — Real-Time API."""
    req = RunRealtimeReportRequest(
        property=f'properties/{prop_id}',
        metrics=[Metric(name='activeUsers')],
    )
    resp = client.run_realtime_report(req)
    if not resp.rows:
        return 0
    return int(resp.rows[0].metric_values[0].value or 0)


def _fetch_users_for_range(client: BetaAnalyticsDataClient, prop_id: str, start: str, end: str) -> int:
    """totalUsers — Data API."""
    req = RunReportRequest(
        property=f'properties/{prop_id}',
        date_ranges=[DateRange(start_date=start, end_date=end)],
        metrics=[Metric(name='totalUsers')],
    )
    resp = client.run_report(req)
    if not resp.rows:
        return 0
    return int(resp.rows[0].metric_values[0].value or 0)


def fetch_stats() -> dict:
    prop_id = os.environ.get('GA4_PROPERTY_ID', '').strip()
    if not prop_id:
        raise RuntimeError('GA4_PROPERTY_ID env var not set')
    client = _get_client()
    # GA4 는 KST 안 받고 yyyy-mm-dd 받음. property timezone(Asia/Seoul) 기준으로 처리됨.
    return {
        'active_now': _fetch_active_now(client, prop_id),
        'today': _fetch_users_for_range(client, prop_id, 'today', 'today'),
        'last_7d': _fetch_users_for_range(client, prop_id, '7daysAgo', 'today'),
        'last_30d': _fetch_users_for_range(client, prop_id, '30daysAgo', 'today'),
        'total': _fetch_users_for_range(client, prop_id, '2020-01-01', 'today'),
    }


def _response(status: int, body: dict) -> dict:
    return {
        'statusCode': status,
        'headers': {**CORS_HEADERS, 'Content-Type': 'application/json'},
        'body': json.dumps(body, default=str),
    }


def lambda_handler(event: dict, context) -> dict:
    method = (event.get('httpMethod') or event.get('requestContext', {}).get('http', {}).get('method', 'GET')).upper()
    if method == 'OPTIONS':
        return _response(200, {})
    try:
        cached = _read_cache()
        if cached is not None:
            return _response(200, {**cached, 'cached': True})
        stats = fetch_stats()
        _write_cache(stats)
        return _response(200, {**stats, 'cached': False})
    except Exception as e:
        logger.exception('ga4 stats error')
        return _response(500, {'error': str(e)})
