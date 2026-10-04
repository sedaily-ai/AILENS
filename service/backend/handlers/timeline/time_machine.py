"""
Time Machine Handler — 빅카인즈 뉴스 검색 기반 "그날의 서울경제" + "키워드·기간 검색"

두 모드(같은 Lambda·같은 라우트 GET /time-machine, 쿼리 파라미터로 구분):

1) 하루 모드(기본) — `q` 파라미터가 없을 때
   GET /time-machine?date=YYYY-MM-DD
   Response: { "date": "...", "articles": [{"news_id","title","content","byline","category","original_link"}],
               "investments": ..., "cached": bool }

2) 기간 검색 모드 — `q` 파라미터가 있을 때 (예: 1997-11-21~1997-12-31 "IMF" 기간의 서울경제 기사)
   GET /time-machine?q=IMF&from=1997-11-21&to=1997-12-31[&size=10][&sort=relevance|date]
   q     필수, 공백 trim 후 1~40자
   from/to 필수 YYYY-MM-DD, from<=to, 1990-01-01 이후, 미래는 오늘로 당김, 기간 최대 6년(2196일)
   size  기본 10, 1~20
   sort  'relevance'(기본) | 'date'. relevance 는 빅카인즈가 거부하면 date 로 자동 대체
   Response: { "query","from","to","size","sort_applied","articles":[{하루 모드 필드 + "published_at"(날짜만, 있으면)}],
               "cached": bool }

응답 규약(프론트가 "오류"와 "정말 기사 없음"을 구분하는 기준):
  - 200 + articles=[]  : 빅카인즈 조회는 성공했고 서울경제 기사가 정말 0건.
  - 502 BIGKINDS_ERROR : 빅카인즈 호출/키 조회/응답 오류. 상세는 로그에만, 응답은 일반 메시지.
  - 400 BAD_REQUEST    : 파라미터 누락/형식 오류/범위 위반. 하루 모드의 미래 날짜는 오늘로 당겨 200.

2026-08-17: 처음엔 issue_ranking(오늘의 이슈 API)으로 토픽+키워드만 보여줬는데,
그 API의 news_cluster(관련 기사 ID 목록)로 기사 상세를 조회하면 같은 ID인데도
0건/서버오류(E03)가 섞여 나와 신뢰도가 낮았다(2026-08-17 저녁 재확인 — 심지어
당일 날짜조차 0건이 나옴). 대신 뉴스 검색 API(`/search/news`)를 ID 조회가 아니라
날짜 범위 검색(published_at + provider=서울경제)으로 직접 호출하니 1999년 기사도
본문·바이라인·원본 링크(구 도메인 sednews.com 포함)까지 안정적으로 나와서
이 방식으로 교체했다 — 다만 발행 "시각"은 어느 시대 기사든 항상 자정(T00:00:00)
고정이라 제공되지 않는다(프론트에서 시간 대신 순번으로 표시).
빅카인즈 호출·응답 매핑은 services/bigkinds_search.py 로 분리돼 있다.

/timemachine 프론트(위키피디아+서울경제 스크래핑, "그날의 역사적 사건"이 대부분
지어낸 가짜 데이터였던 문제로 삭제)가 쓰던 이 Lambda(sedaily-mbti-time-machine-dev)
를 새 Lambda/API Gateway 라우트 생성 없이 재사용 중.

API 키는 SSM(/sedaily-mbti/bigkinds-api-key, SecureString)에서만 읽는다 —
프론트/로그 어디에도 노출하지 않는다.
"""
import hashlib
import logging
import time
from datetime import datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional

import boto3

from config.investment_scenarios import build_investment_scenarios
from config.settings import settings
from core.decorators import lambda_handler as handler_decorator
from core.response import error_response, no_content_response, success_response
from services.timeline import bigkinds_search as bigkinds_search
from utils.date_validation import DATE_FORMAT, KST, BadRequest, today_kst, validate_date

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

BIGKINDS_MIN_DATE = '1990-01-01'
MAX_ARTICLES = 30

# 기간 검색 모드 제한
RANGE_QUERY_MAX_LEN = 40
RANGE_MAX_DAYS = 6 * 366  # "최대 6년" — 윤년 포함 넉넉히 2196일(양끝 포함이 아닌 to-from 일수)
RANGE_SIZE_DEFAULT = 10
RANGE_SIZE_MAX = 20
RANGE_SORTS = (bigkinds_search.SORT_RELEVANCE, bigkinds_search.SORT_DATE)

# 캐시 테이블 — 옛 위키/스크래핑판 캐시와 같은 테이블 재사용. 키 접두사를
# timemachine_articles_로 바꿔서(이전 issue_ranking 토픽판 캐시와도 안 섞이게)
# 응답 스키마가 바뀔 때마다 옛 캐시를 일일이 안 지워도 되게 했다.
# CACHE_TABLE을 하드코딩해두고 있었는데(2026-08-23 코드 리팩토링 감사에서
# 발견) settings.dynamodb_table_articles와 완전히 같은 테이블이라 그대로
# 재사용 — config.settings를 거치지 않는 유일한 예외였다.
CACHE_TABLE = settings.dynamodb_table_articles
CACHE_TTL_DAYS = 3650  # 과거 지면은 영구히 안 바뀐다 — 사실상 무기한 캐시.
RANGE_CACHE_TTL_SECONDS = 30 * 86400  # 기간 검색은 키 조합이 많아 30일만 보관.

# 부정 캐시: "조회는 성공했는데 0건"인 날짜(휴간일·빅카인즈 미적재 등)를 짧게 기억해
# 같은 날짜 재요청마다 빅카인즈를 다시 치지 않게 한다. 키 접두사를 분리해 둬서
# (a) 이전 버전 Lambda 로 롤백해도 빈 결과를 '캐시 히트'로 오인하지 않고,
# (b) 나중에 기사가 적재돼 정상 캐시가 생기면 그쪽이 우선한다.
# 오류(예외)는 절대 부정 캐시하지 않는다 — 오류 시 _fetch_sedaily_articles 가 raise 하므로
# 저장 경로에 도달하지 않는다. 오늘 날짜는 기사가 계속 쌓이므로 부정 캐시 제외.
NEGATIVE_CACHE_TTL_SECONDS = 6 * 3600


# ─── DynamoDB 캐시 ──────────────────────────────────────────────────────────

_table = None


def _get_table():
    global _table
    if _table is None:
        _table = boto3.resource('dynamodb', region_name='us-east-1').Table(CACHE_TABLE)
    return _table


def _cache_key(date: str) -> str:
    return f'timemachine_articles_{date}'


def _negative_cache_key(date: str) -> str:
    return f'timemachine_empty_{date}'


def _range_digest(query: str, from_date: str, to_date: str, size: int, sort: str) -> str:
    return hashlib.sha1(f'{query}|{from_date}|{to_date}|{size}|{sort}'.encode('utf-8')).hexdigest()


def _range_cache_key(digest: str) -> str:
    return f'timemachine_range_{digest}'


def _range_negative_cache_key(digest: str) -> str:
    return f'timemachine_range_empty_{digest}'


def _is_expired(item: dict) -> bool:
    """expires_at 이 epoch 초(숫자)일 때만 만료 판정한다.

    DynamoDB TTL 삭제는 최대 수십 시간 지연될 수 있어, 짧은 TTL(부정 캐시)은
    읽는 쪽에서도 직접 확인해야 한다. 이전 버전이 저장한 ISO 문자열 expires_at 은
    숫자가 아니므로 '만료 없음'(기존 동작)으로 취급해 호환된다.
    """
    expires_at = item.get('expires_at')
    if isinstance(expires_at, (int, float, Decimal)):
        return float(expires_at) <= time.time()
    return False


def _get_item(key: str) -> Optional[dict]:
    res = _get_table().get_item(Key={'news_id': key})
    item = res.get('Item')
    if item and not _is_expired(item):
        return item
    return None


def _put_cache_item(key: str, item_type: str, date: str, data: dict, ttl_seconds: int) -> None:
    now = datetime.now(KST)
    _get_table().put_item(Item={
        'news_id': key,
        'item_type': item_type,
        'date': date,
        'data': data,
        'cached_at': now.isoformat(),
        # DynamoDB TTL 은 epoch 초(Number) 속성만 인식한다. 예전엔 ISO 문자열로 저장해
        # TTL 이 동작하지 않았다.
        'expires_at': int(now.timestamp()) + ttl_seconds,
    })


def _read_cache(key: str, negative_key: str, empty_data: dict, label: str) -> Optional[dict]:
    """정상 캐시 → 부정 캐시 순으로 조회. 히트하면 저장된 data(부정은 empty_data) 반환."""
    try:
        item = _get_item(key)
        if item:
            logger.info('캐시 히트: %s', label)
            return item.get('data')
        neg = _get_item(negative_key)
        if neg:
            logger.info('부정 캐시 히트: %s', label)
            return neg.get('data') or empty_data
    except Exception as e:  # noqa: BLE001
        logger.warning('캐시 조회 실패(%s): %s', label, e)
    return None


def _write_cache(key: str, negative_key: str, item_type: str, negative_item_type: str,
                 date: str, data: dict, ttl_seconds: int, allow_negative: bool, label: str) -> None:
    """기사가 있으면 정상 캐시, 0건이면 allow_negative 일 때만 부정 캐시. 실패는 삼킨다."""
    try:
        if data.get('articles'):
            _put_cache_item(key, item_type, date, data, ttl_seconds)
            logger.info('캐시 저장: %s', label)
        elif allow_negative:
            _put_cache_item(negative_key, negative_item_type, date, data, NEGATIVE_CACHE_TTL_SECONDS)
            logger.info('부정 캐시 저장: %s', label)
    except Exception as e:  # noqa: BLE001
        logger.warning('캐시 저장 실패(%s): %s', label, e)


def _get_cached(date: str) -> Optional[dict]:
    return _read_cache(_cache_key(date), _negative_cache_key(date),
                       {'date': date, 'articles': []}, date)


def _save_cache(date: str, data: dict) -> None:
    _write_cache(_cache_key(date), _negative_cache_key(date),
                 'timemachine_articles_cache', 'timemachine_empty_cache',
                 date, data, CACHE_TTL_DAYS * 86400, date < today_kst(), date)


# ─── 하루 조회 ───────────────────────────────────────────────────────────────

def _fetch_sedaily_articles(date: str) -> List[Dict[str, Any]]:
    """그날(KST) 서울경제 기사 최대 MAX_ARTICLES건, 최신순. 오류는 raise."""
    result = bigkinds_search.search_news('', date, bigkinds_search.next_day(date),
                                         MAX_ARTICLES, bigkinds_search.SORT_DATE)
    return result.articles


def get_time_machine_data(date: str) -> dict:
    # investments는 순수 로컬 계산(실측 시세 테이블 조회 + 산술)이라 외부 API를
    # 안 타서 캐시할 필요가 없다 — 캐시 히트/미스와 무관하게 매번 새로 계산.
    investments = build_investment_scenarios(date)

    cached = _get_cached(date)
    if cached is not None:
        return {**cached, 'investments': investments, 'cached': True}

    articles = _fetch_sedaily_articles(date)
    result = {'date': date, 'articles': articles}
    _save_cache(date, result)
    return {**result, 'investments': investments, 'cached': False}


# ─── 키워드 + 기간 검색 ──────────────────────────────────────────────────────

def _parse_range_params(params: dict) -> dict:
    """기간 검색 파라미터 검증·정규화. 위반은 BadRequest."""
    query = (params.get('q') or '').strip()
    if not query:
        raise BadRequest('q 파라미터가 필요합니다. (1~40자)')
    if len(query) > RANGE_QUERY_MAX_LEN:
        raise BadRequest(f'q는 {RANGE_QUERY_MAX_LEN}자 이하여야 합니다.')

    raw_from = (params.get('from') or '').strip()
    raw_to = (params.get('to') or '').strip()
    if not raw_from or not raw_to:
        raise BadRequest('from, to 파라미터가 필요합니다. (YYYY-MM-DD)')
    from_date = validate_date(raw_from, min_date=BIGKINDS_MIN_DATE)
    to_date = validate_date(raw_to, min_date=BIGKINDS_MIN_DATE)
    # 미래 날짜는 오늘로 당겨지므로, 순서는 당기기 전 원본 값으로 비교한다.
    if datetime.strptime(raw_from, DATE_FORMAT) > datetime.strptime(raw_to, DATE_FORMAT):
        raise BadRequest('from은 to보다 늦을 수 없습니다.')
    if (datetime.strptime(to_date, DATE_FORMAT) - datetime.strptime(from_date, DATE_FORMAT)).days > RANGE_MAX_DAYS:
        raise BadRequest('기간은 최대 6년까지 지원합니다.')

    raw_size = (params.get('size') or '').strip()
    if raw_size:
        try:
            size = int(raw_size)
        except ValueError:
            raise BadRequest(f'size는 정수여야 합니다: {raw_size}')
        if not 1 <= size <= RANGE_SIZE_MAX:
            raise BadRequest(f'size는 1~{RANGE_SIZE_MAX} 사이여야 합니다.')
    else:
        size = RANGE_SIZE_DEFAULT

    sort = (params.get('sort') or '').strip() or bigkinds_search.SORT_RELEVANCE
    if sort not in RANGE_SORTS:
        raise BadRequest("sort는 'relevance' 또는 'date'여야 합니다.")

    return {'query': query, 'from': from_date, 'to': to_date, 'size': size, 'sort': sort}


def get_range_search_data(query: str, from_date: str, to_date: str, size: int, sort: str) -> dict:
    digest = _range_digest(query, from_date, to_date, size, sort)
    label = f'range {digest[:8]} q={query!r} {from_date}~{to_date}'
    request_part = {'query': query, 'from': from_date, 'to': to_date, 'size': size}

    cached = _read_cache(_range_cache_key(digest), _range_negative_cache_key(digest),
                         {'sort_applied': sort, 'articles': []}, label)
    if cached is not None:
        return {**request_part, 'sort_applied': cached.get('sort_applied', sort),
                'articles': cached.get('articles', []), 'cached': True}

    found = bigkinds_search.search_news(query, from_date, bigkinds_search.next_day(to_date),
                                        size, sort, include_published_at=True)
    logger.info('기간 검색: %s sort_requested=%s sort_applied=%s articles=%s',
                label, sort, found.sort_applied, len(found.articles))
    data = {'sort_applied': found.sort_applied, 'articles': found.articles}
    # 오늘이 포함된 기간은 기사가 계속 쌓이므로 부정 캐시하지 않는다.
    _write_cache(_range_cache_key(digest), _range_negative_cache_key(digest),
                 'timemachine_range_cache', 'timemachine_range_empty_cache',
                 from_date, data, RANGE_CACHE_TTL_SECONDS, to_date < today_kst(), label)
    return {**request_part, **data, 'cached': False}


# ─── Lambda entry point ─────────────────────────────────────────────────────

@handler_decorator
def lambda_handler(event: dict, context) -> dict:
    """AWS Lambda / API Gateway 핸들러. `q` 가 있으면 기간 검색, 없으면 하루 조회."""
    method = (
        event.get('requestContext', {}).get('http', {}).get('method')
        or event.get('httpMethod')
        or ''
    ).upper()
    if method == 'OPTIONS':
        return no_content_response()

    params = event.get('queryStringParameters') or {}
    range_mode = params.get('q') is not None
    try:
        if range_mode:
            args = _parse_range_params(params)
        else:
            date = validate_date((params.get('date') or '').strip(), min_date=BIGKINDS_MIN_DATE)
    except BadRequest as e:
        return error_response(str(e), status_code=400, code='BAD_REQUEST')

    try:
        if range_mode:
            result = get_range_search_data(args['query'], args['from'], args['to'],
                                           args['size'], args['sort'])
            logger.info(
                'time-machine 기간 검색 응답: from=%s, to=%s, articles=%s, sort_applied=%s, cached=%s',
                result['from'], result['to'], len(result['articles']),
                result['sort_applied'], result['cached'],
            )
            return success_response(result)
        result = get_time_machine_data(date)
        logger.info(
            'time-machine 응답: date=%s, articles=%s, cached=%s',
            result.get('date'), len(result.get('articles', [])), result.get('cached'),
        )
        return success_response(result)
    except Exception:  # noqa: BLE001
        logger.error('time-machine 오류', exc_info=True)
        return error_response('빅카인즈 데이터를 가져오지 못했습니다.', status_code=502, code='BIGKINDS_ERROR')
