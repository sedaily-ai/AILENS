"""
Time Machine Handler — 빅카인즈 뉴스 검색 기반 "그날의 서울경제" + "키워드·기간 검색" + "그날의 1면"

세 모드(같은 Lambda·같은 라우트 GET /time-machine, 쿼리 파라미터로 구분):

1) 하루 모드(기본) — `q`·`front` 파라미터가 없을 때
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

3) 그날의 1면 모드 — `front` 파라미터가 있을 때(`q` 가 없을 때만). 생일 타임머신이 부른다.
   GET /time-machine?front=YYYY-MM-DD   (생일, 1990-01-01 이후, 미래는 오늘로 당김)
   Response: { "date", "date_kind": 생일 시기의 kind("front"|"day"), "shown_date": 보여 준 신문 날짜|null,
               "kind": "front"|"day"|"none", "reason": null|"sunday"|"no_paper"|"not_yet"|"archive_missing", "basis",
               "articles": [{"news_id","title","content","byline","category","original_link"}],
               "status": "ok"|"no_paper"|"no_page_info"(구버전 웹 호환), "cached": bool }
   - kind=front : 1면(면 번호 1). 면 번호가 있는 시기(FRONT_PAGE_ERAS)만.
   - kind=day   : 면 번호가 없는 시기의 그날 서울경제 기사 FRONT_DAY_ARTICLES 건. 1면이라고 부르지 않는다.
                  "basis": "issue"(그날 언론이 가장 많이 다룬 이슈의 서울경제 기사, 기사마다 "coverage"=그 이슈의 기사 수)
                  | "no_ranking"|"no_match"|"ranking_failed"(본문이 긴 순으로 대신한 까닭). front·none 이면 null.
   - kind=none  : 생일과 그 전 FRONT_LOOKBACK_DAYS 일 동안 보관본에 신문이 없다(reason=archive_missing).
   생일에 신문이 없으면(일요일 휴간·명절·보관본 누락) 하루씩 거슬러 직전 발행일을 보여 주고 reason 에 까닭을 적는다.
   그날 기사 시기는 처음 빅카인즈에 묻는 날에만 그날 기사와 이슈 순위를 함께 부르고, 기사가 없으면 순위 결과를 버린다.
   응답 로그에는 요청 날짜도 보여 준 날짜도 남기지 않는다.

응답 규약(프론트가 "오류"와 "정말 기사 없음"을 구분하는 기준):
  - 200 + articles=[]  : 빅카인즈 조회는 성공했고 서울경제 기사가 정말 0건.
  - 502 BIGKINDS_ERROR : 빅카인즈 호출/키 조회/응답 오류. 상세는 로그에만, 응답은 일반 메시지.
  - 400 BAD_REQUEST    : 파라미터 누락/형식 오류/범위 위반. 하루 모드의 미래 날짜는 오늘로 당겨 200.

데이터 소스는 빅카인즈 뉴스 검색 API(`/search/news`)이며, 날짜 범위 검색(published_at +
provider=서울경제)으로 직접 호출한다. 발행 "시각"은 항상 자정(T00:00:00)으로 고정되어 제공되지
않으므로 프론트는 시간 대신 순번으로 표시한다. 빅카인즈 호출·응답 매핑은
services/timeline/bigkinds_search.py 에 있다.

API 키는 SSM(/sedaily-mbti/bigkinds-api-key, SecureString)에서만 읽으며 프론트와 로그에 노출하지 않는다.
"""
import hashlib
import logging
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Any, Dict, List, NamedTuple, Optional, Tuple

import boto3

from config.investment_scenarios import build_investment_scenarios
from config.settings import settings
from core.decorators import lambda_handler as handler_decorator
from core.response import error_response, no_content_response, success_response
from services.timeline import bigkinds_search as bigkinds_search
from services.timeline import front_calendar
from common.dates.validation import DATE_FORMAT, KST, BadRequest, today_kst, validate_date

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

# 캐시 테이블은 기사 테이블을 공유하며, 키 접두사(timemachine_articles_)로 다른 캐시와 구분한다.
# 응답 스키마가 바뀌면 접두사를 변경해 옛 캐시를 무효화한다.
CACHE_TABLE = settings.dynamodb_table_articles
CACHE_TTL_DAYS = 3650  # 과거 지면은 영구히 안 바뀐다 — 사실상 무기한 캐시.
RANGE_CACHE_TTL_SECONDS = 30 * 86400  # 기간 검색은 키 조합이 많아 30일만 보관.

# 부정 캐시: 조회는 성공했으나 0건인 날짜(휴간일, 빅카인즈 미적재 등)를 짧게 기억해
# 같은 날짜 재요청마다 빅카인즈를 다시 호출하지 않도록 한다.
# 키 접두사를 분리해 두어 (a) 롤백 시 빈 결과가 캐시 히트로 오인되지 않고,
# (b) 이후 정상 캐시가 생기면 그쪽이 우선한다.
# 오류는 부정 캐시하지 않으며(_fetch_sedaily_articles 가 raise), 기사가 계속 쌓이는 오늘 날짜도 제외한다.
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
        # DynamoDB TTL 은 epoch 초(Number) 속성만 인식한다.
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
                 date: str, data: dict, ttl_seconds: int, allow_negative: bool, label: str,
                 negative_ttl_seconds: int = NEGATIVE_CACHE_TTL_SECONDS) -> None:
    """기사가 있으면 정상 캐시, 0건이면 allow_negative 일 때만 부정 캐시. 실패는 삼킨다."""
    try:
        if data.get('articles'):
            _put_cache_item(key, item_type, date, data, ttl_seconds)
            logger.info('캐시 저장: %s', label)
        elif allow_negative:
            _put_cache_item(negative_key, negative_item_type, date, data, negative_ttl_seconds)
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
    # investments 는 외부 API 없이 로컬에서 계산하므로 캐시 없이 매번 계산한다.
    investments = build_investment_scenarios(date)

    cached = _get_cached(date)
    if cached is not None:
        return {**cached, 'investments': investments, 'cached': True}

    articles = _fetch_sedaily_articles(date)
    result = {'date': date, 'articles': articles}
    _save_cache(date, result)
    return {**result, 'investments': investments, 'cached': False}


# ─── 그날의 1면 ──────────────────────────────────────────────────────────────
# 빅카인즈 서울경제 보관본에서 면 번호(printing_page)가 채워진 기간과 그 시기의 신문 판별 기준(2026-10-19 날짜별 실측,
# 경계는 일 단위로 확인. 기준 설명은 bigkinds_search._front_docs). 이 밖은 면 번호가 비어 1면을 특정할 수 없어
# 그날 기사를 '그날 서울경제'(kind=day)로 보여 주고 1면이라고 부르지 않는다.
FRONT_PAGE_ERAS = (
    ('1994-01-01', '1996-07-31', bigkinds_search.FRONT_MATCH_PUBLISHED),
    ('2017-11-13', None, bigkinds_search.FRONT_MATCH_SENT),
)
# 1996-09-22 일요일자까지는 기사가 있고 1996-09-29 부터 일요일자 신문이 없다(같은 실측). 이 날 이후 일요일은 조회하지 않는다.
SUNDAY_CLOSED_FROM = '1996-09-29'
# 생일 타임머신이 사용자의 생일로 부르는 모드라 로그에 날짜를 남기지 않는다.
FRONT_LOG_LABEL = 'front'

# 생일에 신문이 없을 때 거슬러 찾는 날 수(생일 포함 11일). 실측(2026-10-20) 최장 공백은 2025 추석 연휴 6일.
FRONT_LOOKBACK_DAYS = 10
# 면 번호가 없는 시기에 보여 줄 그날 기사 수.
FRONT_DAY_ARTICLES = 4
# 거슬러 찾기 전체에 쓰는 시간. 빅카인즈 호출마다 남은 시간만큼만 기다려 Lambda 제한시간(30초) 안에 끝낸다.
FRONT_SEARCH_BUDGET_SECONDS = 20
# 짧게만 두는 결과의 캐시 기간 — 이슈 순위를 못 받아 대신 고른 결과, 최근(FRONT_SETTLED_DAYS 안) 날짜에서 그때 조회한 0건으로
# 생일(또는 그 사이 날짜)을 건너뛰어 대체한 결과. 휴간 규칙·목록으로 건너뛴 결과는 CACHE_TTL_DAYS.
FRONT_LIVE_FALLBACK_TTL_SECONDS = 7 * 86400
# 생일이 오늘보다 이만큼 지난 날짜면 빅카인즈 적재가 끝났다고 본다. 그 0건(보관본 공백·명절)은 일시적이지 않아 결과를
# CACHE_TTL_DAYS 동안 둔다(1998-01~08 공백 생일이 6시간마다, 그날 기사 시기 명절 생일이 7일마다 다시 느려지지 않게).
FRONT_SETTLED_DAYS = 30

KIND_FRONT, KIND_DAY, KIND_NONE = 'front', 'day', 'none'
REASON_SUNDAY, REASON_NO_PAPER, REASON_NOT_YET, REASON_ARCHIVE_MISSING = 'sunday', 'no_paper', 'not_yet', 'archive_missing'


def _front_cache_key(date: str) -> str:
    # 대체 결과까지 담도록 응답 형식이 바뀌어(2026-10-20) 접두사를 바꿨다. 옛 timemachine_front_* 는 읽지 않는다.
    return f'timemachine_frontv2_{date}'


def _front_negative_cache_key(date: str) -> str:
    return f'timemachine_frontv2_none_{date}'


def _front_page_match(date: str) -> Optional[str]:
    """면 번호가 있는 시기면 신문 판별 기준, 아니면 None."""
    for start, end, match in FRONT_PAGE_ERAS:
        if start <= date and (end is None or date <= end):
            return match
    return None


def _closed_sunday(date: str) -> bool:
    return date >= SUNDAY_CLOSED_FROM and datetime.strptime(date, DATE_FORMAT).weekday() == 6


def _settled(date: str) -> bool:
    """오늘(KST)보다 FRONT_SETTLED_DAYS 일 이상 지난 날짜인가."""
    settled_until = datetime.strptime(today_kst(), DATE_FORMAT) - timedelta(days=FRONT_SETTLED_DAYS)
    return date <= settled_until.strftime(DATE_FORMAT)


def _front_calendar() -> front_calendar.FrontCalendar:
    return front_calendar.get_calendar()


def _remaining(deadline: float) -> float:
    left = deadline - time.monotonic()
    if left <= 0:
        raise bigkinds_search.BigKindsError('1면 찾기 시간 초과')
    return left


class _Resolved(NamedTuple):
    shown: Optional[str]
    kind: str
    articles: List[Dict[str, Any]]
    # 휴간 규칙·목록이 아니라 그때 조회한 0건으로 건너뛴 날이 있었는가 — 캐시 기간을 정한다(get_front_page_data).
    live_skip: bool
    # kind=day 일 때 기사를 고른 기준(bigkinds_search.DAY_BASIS_*), 그 밖은 None.
    basis: Optional[str] = None


def _own_paper_from_cache(day: str) -> Optional[_Resolved]:
    """거슬러 간 날 day 를 생일로 조회해 저장한 캐시가 그날 자기 신문이면 그 결과. 아니면 None.

    그날 자기 신문(shown_date == day)인 결과는 day 를 생일로 풀었을 때와 같은 빅카인즈 조회(같은 함수·같은 인자)라
    다시 묻지 않고 쓴다. 대체 결과(다른 날 신문)·찾지 못한 결과·이슈 순위를 못 받아 대신 고른 결과는 쓰지 않는다.
    조회 실패는 삼키고 빅카인즈로 간다.
    """
    try:
        item = _get_item(_front_cache_key(day))
    except Exception as e:  # noqa: BLE001
        logger.warning('거슬러 간 날 캐시 조회 실패: %s', type(e).__name__)
        return None
    data = (item or {}).get('data') or {}
    kind, articles, basis = data.get('kind'), data.get('articles'), data.get('basis')
    if (data.get('shown_date') != day or kind not in (KIND_FRONT, KIND_DAY) or not articles
            or basis == bigkinds_search.DAY_BASIS_RANKING_FAILED):
        return None
    return _Resolved(day, kind, articles, False, basis)


# 그날 기사와 함께 부른 이슈 순위를 그날 기사가 없어 버렸을 때 남기는 줄(날짜 없음). 늘어난 빅카인즈 호출을 로그·미리 채우기 스크립트가 센다.
RANKING_DISCARDED_LOG = '그날 기사가 없어 함께 부른 이슈 순위를 버림'
# 이 날짜까지(1990~1993)는 이슈 순위에 서울경제 기사가 묶이지 않아 순위를 묻지 않고 no_match(본문이 긴 순)로 낸다.
# 2026-10-21 실호출 확인: 1990-01-09·05-15·10-17, 1991-02-26·07-10·11-21, 1992-03-17·06-24·10-08,
# 1993-01-19·05-26·09-29·12-14 평일 13일 모두 이슈 30개를 받았지만 그날 서울경제 기사(02100311.*)와 번호가 맞는 것이 0건이었다.
# 순위가 있고 연결이 0건일 때(no_match)와 같은 기사·같은 coverage(None)가 나온다.
NO_ISSUE_MATCH_UNTIL = '1993-12-31'


def _ranking_failed(e: Exception) -> Tuple[List[List[str]], bool]:
    # 이슈 순위는 고르는 기준일 뿐이라 실패해도 그날 기사는 보여 준다.
    logger.warning('빅카인즈 이슈 순위 조회 실패, 본문이 긴 순으로 대신: %s', type(e).__name__)
    return [], True


def _day_highlights(day: str, deadline: float, parallel: bool) -> Tuple[List[Dict[str, Any]], Optional[str]]:
    """면 번호가 없는 시기의 그날 기사와 고른 기준. 기사가 없으면 ([], None). 이슈 순위 실패는 본문이 긴 순으로 대신한다.

    parallel 이면 이슈 순위를 다른 스레드로 먼저 보내고 그날 기사를 받는다 — 두 요청의 제한 시간이 모두 남은 예산 이하라
    직렬(합)보다 짧은 쪽(최대값)에서 끝난다. 그날 기사가 없으면 순위는 기다리지 않고 버린다(그만큼 빅카인즈 호출이 하나 는다).
    NO_ISSUE_MATCH_UNTIL 까지는 순위를 묻지 않는다.
    """
    if day <= NO_ISSUE_MATCH_UNTIL:
        docs = bigkinds_search.search_day_docs(day, timeout=_remaining(deadline))
        if not docs:
            return [], None
        articles, _ = bigkinds_search.pick_day_articles(docs, [], FRONT_DAY_ARTICLES)
        return articles, bigkinds_search.DAY_BASIS_NO_MATCH
    if not parallel:
        docs = bigkinds_search.search_day_docs(day, timeout=_remaining(deadline))
        if not docs:
            return [], None
        try:
            # 시간이 다 됐으면(_remaining 이 raise) 이미 받은 그날 기사를 버리지 않고 본문이 긴 순으로 보여 준다.
            clusters, failed = bigkinds_search.fetch_issue_clusters(day, timeout=_remaining(deadline)), False
        except Exception as e:  # noqa: BLE001
            clusters, failed = _ranking_failed(e)
    else:
        bigkinds_search.warm_up()  # 두 스레드가 처음 SSM 클라이언트를 함께 만들지 않게 키를 먼저 읽어 둔다
        # 요청마다 새 풀 — 얼었던 컨테이너에 남은 순위 요청이 다음 요청의 자리를 막지 않게 모듈 수준 풀을 쓰지 않는다.
        pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix='bigkinds-issue')
        try:
            ranking = pool.submit(bigkinds_search.fetch_issue_clusters, day, timeout=_remaining(deadline))
            docs = bigkinds_search.search_day_docs(day, timeout=_remaining(deadline))
            if not docs:
                if not ranking.cancel():  # 아직 보내지 않았으면 취소돼 호출이 늘지 않는다
                    logger.info(RANKING_DISCARDED_LOG)
                return [], None
            try:
                # 남은 예산만 기다린다. 시간이 다 됐거나 순위 조회가 실패하면 받은 그날 기사를 본문이 긴 순으로 보여 준다.
                clusters, failed = ranking.result(timeout=_remaining(deadline)), False
            except Exception as e:  # noqa: BLE001
                clusters, failed = _ranking_failed(e)
        finally:
            # 응답은 남은 순위 요청을 기다리지 않는다. 그 요청은 자기 제한 시간 안에 끝나고 결과는 버려진다.
            pool.shutdown(wait=False, cancel_futures=True)
    articles, basis = bigkinds_search.pick_day_articles(docs, clusters, FRONT_DAY_ARTICLES)
    return articles, (bigkinds_search.DAY_BASIS_RANKING_FAILED if failed else basis)


def _resolve_front_page(date: str) -> _Resolved:
    """생일 date 부터 하루씩 거슬러 보여 줄 신문을 찾는다.

    면 번호가 있는 시기는 1면, 없는 시기는 그날 기사. 1면이 없는 날은 목록(front_calendar)으로 바로 건너뛰고,
    목록 밖 날짜는 거슬러 찾는 날(생일 다음 날짜들)만 본문 없는 가벼운 조회로 먼저 확인한다. 생일 당일은 대개
    신문이 있어 확인 없이 바로 본문을 받는다. 시기 경계를 넘어가도 그 날짜의 시기 규칙을 따른다.
    거슬러 간 날의 자기 신문 캐시가 있으면 그것을 쓴다(_own_paper_from_cache).
    live_skip 은 캐시 기간을 정한다 — 휴간 규칙·목록이 아니라 그때 조회한 0건으로 건너뛴 결과는 빅카인즈 적재 지연일 수 있다.
    """
    calendar = _front_calendar()
    deadline = time.monotonic() + FRONT_SEARCH_BUDGET_SECONDS
    birthday = datetime.strptime(date, DATE_FORMAT)
    live_skip = False
    # 빅카인즈에 이미 물었는가. 그날 기사와 이슈 순위는 처음 묻는 날에만 함께 부른다 — 그 뒤에 묻는 날은 앞에서 빈 날이 나온 경우라
    # 다시 비어 있을 수 있고(예: 1998-01~08 보관본 공백), 그때마다 순위 요청을 버리면 호출만 는다.
    asked = False
    for offset in range(FRONT_LOOKBACK_DAYS + 1):
        day = (birthday - timedelta(days=offset)).strftime(DATE_FORMAT)
        if day < BIGKINDS_MIN_DATE:
            break
        if _closed_sunday(day):
            continue
        match = _front_page_match(day)
        known = calendar.known_front(day) if match is not None else None
        if known is False:
            continue
        # 거슬러 간 날을 누군가 생일로 조회해 둔 자기 신문이 있으면 빅카인즈에 다시 묻지 않는다(일요일 생일 → 토요일 캐시 등).
        own = _own_paper_from_cache(day) if offset > 0 else None
        if own is not None:
            return own._replace(live_skip=live_skip)
        if match is None:
            articles, basis = _day_highlights(day, deadline, parallel=not asked)
            asked = True
            if articles:
                return _Resolved(day, KIND_DAY, articles, live_skip, basis)
            live_skip = True
            continue
        if known is None and offset > 0:
            asked = True
            if bigkinds_search.count_front_page(day, match, timeout=_remaining(deadline)) == 0:
                live_skip = True
                continue
        articles = bigkinds_search.search_front_page(day, match, timeout=_remaining(deadline))
        asked = True
        if articles:
            return _Resolved(day, KIND_FRONT, articles, live_skip)
        live_skip = True
    return _Resolved(None, KIND_NONE, [], live_skip)


def _front_reason(date: str, shown: Optional[str], kind: str) -> Optional[str]:
    if kind == KIND_NONE:
        return REASON_ARCHIVE_MISSING
    if shown == date:
        return None
    if _closed_sunday(date):
        return REASON_SUNDAY
    # 오늘 신문은 아직 보관본에 들어오지 않았을 수 있다 — 휴간이라고 단정하지 않는다.
    return REASON_NOT_YET if date >= today_kst() else REASON_NO_PAPER


def _legacy_status(date: str, shown: Optional[str], kind: str) -> str:
    """구버전 웹(2026-10-20 이전 배포분)이 읽는 status. 그 웹은 'ok'일 때만 기사를 생일 1면으로 보여 주고
    나머지는 안내로 처리한다(reason 이 'sunday'가 아니면 휴간 안내). 웹이 새 응답을 읽게 배포되면 지워도 된다."""
    if kind == KIND_FRONT and shown == date:
        return 'ok'
    return 'no_page_info' if _front_page_match(date) is None else 'no_paper'


def get_front_page_data(date: str) -> dict:
    """생일 date 에 보여 줄 서울경제 신문(1면 또는 그날 기사). 결과는 생일 날짜 키로 캐시한다."""
    date_kind = KIND_FRONT if _front_page_match(date) else KIND_DAY
    cached = _read_cache(_front_cache_key(date), _front_negative_cache_key(date),
                         {'date': date, 'date_kind': date_kind, 'shown_date': None, 'kind': KIND_NONE,
                          'reason': REASON_ARCHIVE_MISSING, 'basis': None, 'articles': []}, FRONT_LOG_LABEL)
    if cached is not None:
        data = cached
    else:
        found = _resolve_front_page(date)
        data = {'date': date, 'date_kind': date_kind, 'shown_date': found.shown, 'kind': found.kind,
                'reason': _front_reason(date, found.shown, found.kind), 'basis': found.basis, 'articles': found.articles}
        # 오늘 신문은 송고가 끝나지 않았을 수 있어 저장하지 않는다. 이슈 순위를 못 받아 대신 고른 결과는 굳지 않게
        # FRONT_LIVE_FALLBACK_TTL_SECONDS 만 둔다. 최근 FRONT_SETTLED_DAYS 일 안의 날짜는 0건이 빅카인즈 적재 지연일 수 있어
        # 그때 조회한 0건으로 건너뛴 결과도 그만큼, 찾지 못한 결과(kind=none)는 NEGATIVE_CACHE_TTL_SECONDS 만 둔다.
        # 그보다 오래된 날짜의 0건은 보관본에 정말 없는 것으로 보고 CACHE_TTL_DAYS 동안 둔다.
        if date < today_kst():
            settled = _settled(date)
            provisional = (found.basis == bigkinds_search.DAY_BASIS_RANKING_FAILED
                           or (found.live_skip and not settled))
            ttl = FRONT_LIVE_FALLBACK_TTL_SECONDS if provisional else CACHE_TTL_DAYS * 86400
            _write_cache(_front_cache_key(date), _front_negative_cache_key(date),
                         'timemachine_frontv2_cache', 'timemachine_frontv2_none_cache',
                         date, data, ttl, True, FRONT_LOG_LABEL,
                         negative_ttl_seconds=CACHE_TTL_DAYS * 86400 if settled else NEGATIVE_CACHE_TTL_SECONDS)
    return {**data, 'status': _legacy_status(date, data.get('shown_date'), data.get('kind')),
            'cached': cached is not None}


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
    # 관련도순을 요청했는데 빅카인즈가 거부해 최신순으로 대체된 결과는 캐시하지 않는다. 일시적인 거부가 30일 동안
    # 같은 조건의 검색을 최신순으로 굳히던 문제(2026-10-09) — 다음 요청이 다시 관련도순을 시도해야 한다.
    if sort == bigkinds_search.SORT_RELEVANCE and found.sort_applied != bigkinds_search.SORT_RELEVANCE:
        logger.info('관련도순 대체 결과는 캐시하지 않음: %s', label)
        return {**request_part, **data, 'cached': False}
    # 오늘이 포함된 기간은 기사가 계속 쌓이므로 부정 캐시하지 않는다.
    _write_cache(_range_cache_key(digest), _range_negative_cache_key(digest),
                 'timemachine_range_cache', 'timemachine_range_empty_cache',
                 from_date, data, RANGE_CACHE_TTL_SECONDS, to_date < today_kst(), label)
    return {**request_part, **data, 'cached': False}


# ─── Lambda entry point ─────────────────────────────────────────────────────

# warmup 때 읽어 보는 없는 키(날짜 아님) — DynamoDB 리소스·자격 증명·TLS 연결까지 미리 만든다.
WARMUP_CACHE_KEY = 'timemachine_warmup'


def _warm_up() -> None:
    """5분 워밍 호출(setup-lambda-warming.sh, 입력 {"warmup": true})이 컨테이너를 데울 때 첫 요청이 할 준비를 미리 한다.
    빅카인즈는 부르지 않는다. 준비 중 오류는 형식 이름만 남긴다."""
    steps = (lambda: _get_table().get_item(Key={'news_id': WARMUP_CACHE_KEY}), bigkinds_search.warm_up, _front_calendar)
    for step in steps:
        try:
            step()
        except Exception as e:  # noqa: BLE001
            logger.warning('warmup 준비 실패: %s', type(e).__name__)
    logger.info('warmup')


@handler_decorator
def lambda_handler(event: dict, context) -> dict:
    """AWS Lambda / API Gateway 핸들러. `q` 가 있으면 기간 검색, 없으면 하루 조회. 워밍 호출은 준비만 하고 바로 반환한다."""
    if event.get('source') == 'aws.events' or event.get('warmup'):
        _warm_up()
        return success_response({'status': 'warm'})
    method = (
        event.get('requestContext', {}).get('http', {}).get('method')
        or event.get('httpMethod')
        or ''
    ).upper()
    if method == 'OPTIONS':
        return no_content_response()

    params = event.get('queryStringParameters') or {}
    range_mode = params.get('q') is not None
    front_mode = not range_mode and params.get('front') is not None
    try:
        if range_mode:
            args = _parse_range_params(params)
        elif front_mode:
            date = validate_date((params.get('front') or '').strip(), min_date=BIGKINDS_MIN_DATE)
        else:
            date = validate_date((params.get('date') or '').strip(), min_date=BIGKINDS_MIN_DATE)
    except BadRequest as e:
        return error_response(str(e), status_code=400, code='BAD_REQUEST')

    try:
        if front_mode:
            result = get_front_page_data(date)
            # 날짜(요청·보여 준 날짜)는 남기지 않는다 — 생일이다.
            logger.info('time-machine 1면 응답: kind=%s, reason=%s, articles=%s, cached=%s',
                        result['kind'], result['reason'], len(result['articles']), result['cached'])
            return success_response(result)
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
