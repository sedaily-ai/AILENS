"""
Visitor Stats Handler
가벼운 자체 방문자 카운터. 외부 분석 도구 의존 없이 DDB 직접 누적.

DDB 키 설계 (기존 sedaily-mbti-engagement-dev 재사용):
  PK = 'STATS#daily'
  SK = 'day#YYYY-MM-DD'        — 일별 카운트
       'all-time'              — 누적 카운트
  속성: count (Number) — atomic increment

라우트:
  POST /api/stats/pageview      — 카운트 +1 (today + all-time). 봇/UA 필터링.
  GET  /api/stats/visitors      — { today, last_7d, total } 응답

세션 dedup 은 프론트엔드 (sessionStorage) 가 담당 — 한 세션당 1회 POST.
"""
import json
import logging
import os
import re
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)

ENGAGEMENT_TABLE = 'sedaily-mbti-engagement-dev'
STATS_PK = 'STATS#daily'

KST = timezone(timedelta(hours=9))

CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
}

# 봇 UA 패턴 — 카운트 제외
BOT_UA_RE = re.compile(
    r'bot|crawler|spider|crawl|slurp|googlebot|bingbot|yandex|baidu|duckduckgo|facebookexternalhit|twitterbot|whatsapp|linkedinbot',
    re.IGNORECASE,
)


def _table():
    return boto3.resource('dynamodb', region_name=os.environ.get('AWS_REGION', 'us-east-1')).Table(ENGAGEMENT_TABLE)


def _today_kst() -> str:
    return datetime.now(KST).strftime('%Y-%m-%d')


def _is_bot(headers: dict) -> bool:
    ua = ''
    for k, v in (headers or {}).items():
        if k.lower() == 'user-agent':
            ua = v or ''
            break
    return bool(BOT_UA_RE.search(ua)) if ua else True  # UA 없으면 봇으로 간주


def increment(today: str) -> dict:
    """일별 카운트 + all-time 카운트 1씩 증가. atomic UPDATE."""
    t = _table()
    # 일별
    t.update_item(
        Key={'pk': STATS_PK, 'sk': f'day#{today}'},
        UpdateExpression='ADD #c :one',
        ExpressionAttributeNames={'#c': 'count'},
        ExpressionAttributeValues={':one': 1},
    )
    # 누적
    t.update_item(
        Key={'pk': STATS_PK, 'sk': 'all-time'},
        UpdateExpression='ADD #c :one',
        ExpressionAttributeNames={'#c': 'count'},
        ExpressionAttributeValues={':one': 1},
    )
    return {'ok': True, 'date': today}


def read_stats() -> dict:
    """오늘 / 최근 7일 / 누적 카운트 반환."""
    t = _table()
    today = datetime.now(KST).date()
    keys = [{'pk': STATS_PK, 'sk': f'day#{(today - timedelta(days=i)).strftime("%Y-%m-%d")}'} for i in range(7)]
    keys.append({'pk': STATS_PK, 'sk': 'all-time'})

    # BatchGet 로 한 번에
    resp = boto3.resource('dynamodb', region_name=os.environ.get('AWS_REGION', 'us-east-1')).batch_get_item(
        RequestItems={ENGAGEMENT_TABLE: {'Keys': keys}}
    )
    items = resp.get('Responses', {}).get(ENGAGEMENT_TABLE, [])
    by_sk = {it['sk']: int(it.get('count', 0)) for it in items}

    today_key = f'day#{today.strftime("%Y-%m-%d")}'
    today_count = by_sk.get(today_key, 0)
    last_7d = sum(by_sk.get(f'day#{(today - timedelta(days=i)).strftime("%Y-%m-%d")}', 0) for i in range(7))
    total = by_sk.get('all-time', 0)
    return {'today': today_count, 'last_7d': last_7d, 'total': total}


def _response(status: int, body: dict) -> dict:
    return {
        'statusCode': status,
        'headers': {**CORS_HEADERS, 'Content-Type': 'application/json'},
        'body': json.dumps(body, default=str),
    }


def lambda_handler(event: dict, context) -> dict:
    method = (event.get('httpMethod') or event.get('requestContext', {}).get('http', {}).get('method', 'GET')).upper()
    path = event.get('path') or event.get('rawPath') or event.get('requestContext', {}).get('http', {}).get('path', '')

    if method == 'OPTIONS':
        return _response(200, {})

    try:
        if method == 'POST' and path.endswith('/pageview'):
            headers = event.get('headers') or {}
            if _is_bot(headers):
                return _response(200, {'ok': True, 'bot': True})
            result = increment(_today_kst())
            return _response(200, result)

        if method == 'GET' and path.endswith('/visitors'):
            result = read_stats()
            return _response(200, result)

        return _response(404, {'error': 'not found', 'method': method, 'path': path})
    except ClientError as e:
        logger.exception('DDB error')
        return _response(500, {'error': str(e)})
    except Exception as e:
        logger.exception('handler error')
        return _response(500, {'error': str(e)})
