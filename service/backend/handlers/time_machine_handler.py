"""
Time Machine Handler — 빅카인즈 이슈랭킹 기반 "그날의 이슈"

GET /time-machine?date=YYYY-MM-DD
Response: { "date": "...", "topics": [{"topic": "...", "keywords": [...]}], "cached": bool }

2026-08-17: 원래는 위키피디아 "On This Day" + 서울경제 아카이브 스크래핑으로
`/timemachine` 프론트를 받쳤는데, 그 프론트가 "그날의 역사적 사건"이 대부분
알고리즘이 지어낸 가짜 데이터였던 문제로 삭제되며 이 핸들러도 소비자가 없어졌다.
새 "그날로 떠나요"(홈, NewsTimeMachineSection.tsx)가 같은 "날짜 → 그날 이슈"
형태를 요구해서, 이미 배포돼 API Gateway 라우트까지 살아있는 이 Lambda
(sedaily-mbti-time-machine-dev)를 빅카인즈 issue_ranking(한국언론진흥재단
뉴스빅데이터, 1990-01-01~ 공식 지원, OpenAPI 사용자지침서 V1.5 §4) 연동으로
갈아끼웠다 — 새 Lambda/API Gateway 라우트를 만들지 않고 기존 걸 재사용.

API 키는 SSM(/sedaily-mbti/bigkinds-api-key, SecureString)에서만 읽는다 —
프론트/로그 어디에도 노출하지 않는다.
"""
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

import boto3
import requests

from common.secrets import get_secret
from core.decorators import lambda_handler as handler_decorator
from core.response import error_response, no_content_response, success_response

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

KST = timezone(timedelta(hours=9))
DATE_FORMAT = '%Y-%m-%d'

BIGKINDS_MIN_DATE = '1990-01-01'
BIGKINDS_ISSUE_RANKING_URL = 'https://tools.kinds.or.kr/issue_ranking'
BIGKINDS_KEY_SSM_PARAM = '/sedaily-mbti/bigkinds-api-key'
BIGKINDS_TIMEOUT_SECONDS = 10
MAX_TOPICS = 8
MAX_KEYWORDS_PER_TOPIC = 5

# 캐시 테이블 — 기존 위키/서울경제 캐시가 쓰던 테이블 재사용, 키 접두사만
# 다르게 둬서(timemachine_ → timemachine_bigkinds_) 옛 형식 캐시와 안 섞이게 한다.
CACHE_TABLE = 'sedaily-mbti-articles-dev'
CACHE_TTL_DAYS = 3650  # 과거 이슈는 영구히 안 바뀐다 — 사실상 무기한 캐시.


class BadRequest(Exception):
    """400 으로 내려보낼 입력 오류."""


def _today_kst() -> str:
    return datetime.now(KST).strftime(DATE_FORMAT)


def _validate_date(raw: str) -> str:
    if not raw:
        raise BadRequest('date 파라미터가 필요합니다. (YYYY-MM-DD)')
    try:
        parsed = datetime.strptime(raw, DATE_FORMAT)
    except (ValueError, TypeError):
        raise BadRequest(f'날짜 형식이 올바르지 않습니다: {raw} (YYYY-MM-DD 형식으로 입력해주세요)')

    normalized = parsed.strftime(DATE_FORMAT)
    today = _today_kst()
    if normalized > today:
        logger.info('미래 날짜 요청(%s) → 오늘(%s)로 조정', normalized, today)
        return today
    if normalized < BIGKINDS_MIN_DATE:
        raise BadRequest(f'빅카인즈는 {BIGKINDS_MIN_DATE} 이후 날짜만 지원합니다: {normalized}')
    return normalized


# ─── DynamoDB 캐시 ──────────────────────────────────────────────────────────

_table = None


def _get_table():
    global _table
    if _table is None:
        _table = boto3.resource('dynamodb', region_name='us-east-1').Table(CACHE_TABLE)
    return _table


def _cache_key(date: str) -> str:
    return f'timemachine_bigkinds_{date}'


def _get_cached(date: str) -> Optional[dict]:
    try:
        res = _get_table().get_item(Key={'news_id': _cache_key(date)})
        item = res.get('Item')
        if item:
            logger.info('캐시 히트: %s', date)
            return item.get('data')
    except Exception as e:  # noqa: BLE001
        logger.warning('캐시 조회 실패(%s): %s', date, e)
    return None


def _save_cache(date: str, data: dict) -> None:
    try:
        now = datetime.now(KST)
        _get_table().put_item(Item={
            'news_id': _cache_key(date),
            'item_type': 'timemachine_bigkinds_cache',
            'date': date,
            'data': data,
            'cached_at': now.isoformat(),
            'expires_at': (now + timedelta(days=CACHE_TTL_DAYS)).isoformat(),
        })
        logger.info('캐시 저장: %s', date)
    except Exception as e:  # noqa: BLE001
        logger.warning('캐시 저장 실패(%s): %s', date, e)


# ─── 빅카인즈 issue_ranking ─────────────────────────────────────────────────

def _fetch_bigkinds_topics(date: str) -> List[Dict[str, Any]]:
    access_key = get_secret(BIGKINDS_KEY_SSM_PARAM)
    payload = {
        'access_key': access_key,
        'argument': {'date': date, 'provider': []},
    }
    res = requests.post(BIGKINDS_ISSUE_RANKING_URL, json=payload, timeout=BIGKINDS_TIMEOUT_SECONDS)
    res.raise_for_status()
    body = res.json()

    if body.get('result') != 0:
        raise RuntimeError(f"빅카인즈 issue_ranking 오류: {body.get('reason', '알 수 없는 오류')}")

    raw_topics = (body.get('return_object') or {}).get('topics') or []
    raw_topics.sort(key=lambda t: t.get('topic_rank', 999))

    topics = []
    for t in raw_topics[:MAX_TOPICS]:
        topic = (t.get('topic') or '').strip()
        if not topic:
            continue
        keywords = [
            kw.strip() for kw in (t.get('topic_keyword') or '').split(',') if kw.strip()
        ][:MAX_KEYWORDS_PER_TOPIC]
        topics.append({'topic': topic, 'keywords': keywords})

    return topics


def get_time_machine_data(date: str) -> dict:
    cached = _get_cached(date)
    if cached is not None:
        return {**cached, 'cached': True}

    topics = _fetch_bigkinds_topics(date)
    result = {'date': date, 'topics': topics}
    if topics:
        _save_cache(date, result)
    return {**result, 'cached': False}


# ─── Lambda entry point ─────────────────────────────────────────────────────

@handler_decorator
def lambda_handler(event: dict, context) -> dict:
    """AWS Lambda / API Gateway 핸들러."""
    method = (
        event.get('requestContext', {}).get('http', {}).get('method')
        or event.get('httpMethod')
        or ''
    ).upper()
    if method == 'OPTIONS':
        return no_content_response()

    params = event.get('queryStringParameters') or {}
    try:
        date = _validate_date((params.get('date') or '').strip())
    except BadRequest as e:
        return error_response(str(e), status_code=400, code='BAD_REQUEST')

    try:
        result = get_time_machine_data(date)
        logger.info(
            'time-machine 응답: date=%s, topics=%s, cached=%s',
            result.get('date'), len(result.get('topics', [])), result.get('cached'),
        )
        return success_response(result)
    except Exception as e:  # noqa: BLE001
        logger.error('time-machine 오류: %s', e, exc_info=True)
        return error_response('빅카인즈 데이터를 가져오지 못했습니다.', status_code=502, code='BIGKINDS_ERROR')
