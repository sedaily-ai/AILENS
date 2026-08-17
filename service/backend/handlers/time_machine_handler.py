"""
Time Machine Handler — 빅카인즈 뉴스 검색 기반 "그날의 서울경제"

GET /time-machine?date=YYYY-MM-DD
Response: { "date": "...", "articles": [{"news_id","title","content","byline","original_link"}], "cached": bool }

2026-08-17: 처음엔 issue_ranking(오늘의 이슈 API)으로 토픽+키워드만 보여줬는데,
그 API의 news_cluster(관련 기사 ID 목록)로 기사 상세를 조회하면 같은 ID인데도
0건/서버오류(E03)가 섞여 나와 신뢰도가 낮았다(2026-08-17 저녁 재확인 — 심지어
당일 날짜조차 0건이 나옴). 대신 뉴스 검색 API(`/search/news`)를 ID 조회가 아니라
날짜 범위 검색(published_at + provider=서울경제)으로 직접 호출하니 1999년 기사도
본문·바이라인·원본 링크(구 도메인 sednews.com 포함)까지 안정적으로 나와서
이 방식으로 교체했다 — 다만 발행 "시각"은 어느 시대 기사든 항상 자정(T00:00:00)
고정이라 제공되지 않는다(프론트에서 시간 대신 순번으로 표시).

/timemachine 프론트(위키피디아+서울경제 스크래핑, "그날의 역사적 사건"이 대부분
지어낸 가짜 데이터였던 문제로 삭제)가 쓰던 이 Lambda(sedaily-mbti-time-machine-dev)
를 새 Lambda/API Gateway 라우트 생성 없이 재사용 중.

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
BIGKINDS_SEARCH_URL = 'https://tools.kinds.or.kr/search/news'
BIGKINDS_KEY_SSM_PARAM = '/sedaily-mbti/bigkinds-api-key'
BIGKINDS_TIMEOUT_SECONDS = 15
BIGKINDS_PROVIDER = '서울경제'
MAX_ARTICLES = 30

# 검색 결과에 자주 섞여 나오는 저가치 코너 — S3 지면 아카이브(fetchDayArticles)의
# '[시그널]' 제외 규칙, 옛 time_machine_handler(위키/스크래핑판)의 EXCLUDE_TAGS와
# 같은 취지.
EXCLUDE_TITLE_MARKERS = ('[부고]', '[인사]', '[사설]', '[마켓아이]', '[시론]', '[발언대]')

# 캐시 테이블 — 옛 위키/스크래핑판 캐시와 같은 테이블 재사용. 키 접두사를
# timemachine_articles_로 바꿔서(이전 issue_ranking 토픽판 캐시와도 안 섞이게)
# 응답 스키마가 바뀔 때마다 옛 캐시를 일일이 안 지워도 되게 했다.
CACHE_TABLE = 'sedaily-mbti-articles-dev'
CACHE_TTL_DAYS = 3650  # 과거 지면은 영구히 안 바뀐다 — 사실상 무기한 캐시.


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
    return f'timemachine_articles_{date}'


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
            'item_type': 'timemachine_articles_cache',
            'date': date,
            'data': data,
            'cached_at': now.isoformat(),
            'expires_at': (now + timedelta(days=CACHE_TTL_DAYS)).isoformat(),
        })
        logger.info('캐시 저장: %s', date)
    except Exception as e:  # noqa: BLE001
        logger.warning('캐시 저장 실패(%s): %s', date, e)


# ─── 빅카인즈 뉴스 검색(날짜 범위) ───────────────────────────────────────────

def _fetch_sedaily_articles(date: str) -> List[Dict[str, Any]]:
    access_key = get_secret(BIGKINDS_KEY_SSM_PARAM)
    next_day = (datetime.strptime(date, DATE_FORMAT) + timedelta(days=1)).strftime(DATE_FORMAT)
    payload = {
        'access_key': access_key,
        'argument': {
            'query': '',
            'published_at': {'from': date, 'until': next_day},
            'provider': [BIGKINDS_PROVIDER],
            'sort': {'date': 'desc'},
            'return_from': 0,
            'return_size': MAX_ARTICLES,
            'fields': ['title', 'content', 'byline', 'category', 'provider_link_page'],
        },
    }
    res = requests.post(BIGKINDS_SEARCH_URL, json=payload, timeout=BIGKINDS_TIMEOUT_SECONDS)
    res.raise_for_status()
    body = res.json()

    if body.get('result') != 0:
        raise RuntimeError(f"빅카인즈 search/news 오류: {body.get('reason', '알 수 없는 오류')}")

    docs = (body.get('return_object') or {}).get('documents') or []

    articles = []
    for d in docs:
        title = (d.get('title') or '').strip()
        if not title or any(marker in title for marker in EXCLUDE_TITLE_MARKERS):
            continue
        # category는 "경제>산업_기업" 같은 전체 경로 배열 — 배지로 쓸 대분류(맨
        # 앞 세그먼트)만 뽑는다.
        raw_categories = d.get('category') or []
        category = raw_categories[0].split('>')[0] if raw_categories else ''
        articles.append({
            'news_id': d.get('news_id', ''),
            'title': title,
            'content': (d.get('content') or '').strip(),
            'byline': (d.get('byline') or '').strip(),
            'category': category,
            'original_link': d.get('provider_link_page') or None,
        })

    return articles


def get_time_machine_data(date: str) -> dict:
    cached = _get_cached(date)
    if cached is not None:
        return {**cached, 'cached': True}

    articles = _fetch_sedaily_articles(date)
    result = {'date': date, 'articles': articles}
    if articles:
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
            'time-machine 응답: date=%s, articles=%s, cached=%s',
            result.get('date'), len(result.get('articles', [])), result.get('cached'),
        )
        return success_response(result)
    except Exception as e:  # noqa: BLE001
        logger.error('time-machine 오류: %s', e, exc_info=True)
        return error_response('빅카인즈 데이터를 가져오지 못했습니다.', status_code=502, code='BIGKINDS_ERROR')
