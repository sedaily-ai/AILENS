"""빅카인즈 뉴스 검색(POST /search/news) 호출 + 응답→기사 매핑 — time_machine 핸들러 공용.

하루 조회(query='', 하루 범위)와 키워드+기간 검색이 같은 함수 `search_news` 를 쓴다.
기사 매핑(제목 제외 마커, 미리보기 정리, 카테고리 추출)은 여기 한 곳에만 둔다.

정렬: 빅카인즈 argument.sort 가 relevance(`_score`)를 지원하는지 코드만으로는 알 수 없어,
sort='relevance' 일 때 `{'_score': 'desc'}` 를 먼저 시도하고 빅카인즈가 요청을 거부하면
(result != 0 또는 HTTP 4xx) `{'date': 'desc'}` 로 자동 대체한다. 어느 쪽이 적용됐는지는
SearchResult.sort_applied 로 돌려주고 로그에도 남긴다. 최초 시도의 성공/실패는 모듈
변수(_relevance_supported)로 기억해 이후 요청에서 불필요한 재시도를 피한다.
타임아웃·5xx·네트워크 오류는 정렬 문제가 아니므로 대체하지 않고 그대로 raise 한다.
"""
import logging
import re
import time
from datetime import datetime, timedelta
from typing import Any, Dict, List, NamedTuple, Optional

import requests

from common.secrets import get_secret
from common.dates.validation import DATE_FORMAT

logger = logging.getLogger(__name__)

BIGKINDS_SEARCH_URL = 'https://tools.kinds.or.kr/search/news'
BIGKINDS_KEY_SSM_PARAM = '/sedaily-mbti/bigkinds-api-key'
BIGKINDS_TIMEOUT_SECONDS = 15
BIGKINDS_PROVIDER = '서울경제'

# 검색 결과에 자주 섞이는 저가치 코너(부고·인사·사설 등)를 제외하는 제목 마커.
EXCLUDE_TITLE_MARKERS = ('[부고]', '[인사]', '[사설]', '[마켓아이]', '[시론]', '[발언대]')

# 빅카인즈 content는 문서상 200자 제한이지만 실제로는 전체 본문(1,500자 이상)이 내려온다.
# 목록 표시용으로 미리보기 길이로 직접 자른다(전체는 original_link 참조).
CONTENT_PREVIEW_LEN = 150
# 본문 끝의 "이름+기자+이메일" 서명과 "입력시간 : ..." 꼬리 — byline 필드로 따로 제공하므로 미리보기에서 제거한다.
_BYLINE_TAIL_RE = re.compile(r'[가-힣]{2,4}\s*기자\S*@\S+\.(?:CO\.KR|COM)\s*$', re.IGNORECASE)
_INPUT_TIME_TAIL_RE = re.compile(r'입력시간\s*:\s*\d{4}/\d{2}/\d{2}\s*\d{1,2}:\d{2}\s*$')

SORT_RELEVANCE = 'relevance'
SORT_DATE = 'date'
_SORT_ARGUMENTS = {
    SORT_RELEVANCE: {'_score': 'desc'},
    SORT_DATE: {'date': 'desc'},
}

BASE_FIELDS = ['title', 'content', 'byline', 'category', 'provider_link_page']

# None=아직 모름, True=_score 정렬 성공 확인.
_relevance_supported: Optional[bool] = None
# 관련도 정렬을 거부당한 뒤 이 시각(time.monotonic)까지만 시도를 건너뛴다. 예전에는 한 번 거부당하면 컨테이너가 사라질 때까지
# 영구히 최신순만 썼는데, 일시적인 오류(호출 한도·순간 장애)에도 관련도순이 몇 시간씩 꺼져 검색 품질이 떨어졌다(2026-10-09 실측).
_RELEVANCE_RETRY_SECONDS = 300
_relevance_rejected_until: float = 0.0


class BigKindsError(RuntimeError):
    """빅카인즈 호출/응답 오류."""


class BigKindsRejected(BigKindsError):
    """빅카인즈가 요청 자체를 거부(result != 0 또는 HTTP 4xx) — 정렬 인자 문제일 수 있다."""


class SearchResult(NamedTuple):
    articles: List[Dict[str, Any]]
    sort_applied: str


def _clean_content_preview(raw: str) -> str:
    text = raw.strip()
    text = _BYLINE_TAIL_RE.sub('', text).strip()
    text = _INPUT_TIME_TAIL_RE.sub('', text).strip()
    text = re.sub(r'\s+', ' ', text)  # 문단 줄바꿈을 미리보기 한 덩어리로
    if len(text) > CONTENT_PREVIEW_LEN:
        text = text[:CONTENT_PREVIEW_LEN].rstrip() + '…'
    return text


def _map_documents(docs: List[dict], include_published_at: bool) -> List[Dict[str, Any]]:
    articles = []
    for d in docs:
        title = (d.get('title') or '').strip()
        if not title or any(marker in title for marker in EXCLUDE_TITLE_MARKERS):
            continue
        # category는 "경제>산업_기업" 같은 전체 경로 배열 — 배지로 쓸 대분류(맨
        # 앞 세그먼트)만 뽑는다.
        raw_categories = d.get('category') or []
        category = raw_categories[0].split('>')[0] if raw_categories else ''
        article = {
            'news_id': d.get('news_id', ''),
            'title': title,
            'content': _clean_content_preview(d.get('content') or ''),
            'byline': (d.get('byline') or '').strip(),
            'category': category,
            'original_link': d.get('provider_link_page') or None,
        }
        if include_published_at:
            raw_date = d.get('published_at')
            if isinstance(raw_date, str) and raw_date:
                article['published_at'] = raw_date[:10]  # 시각은 항상 자정 고정 — 날짜만
        articles.append(article)
    return articles


def _post_search(access_key: str, query: str, from_date: str, until_date_exclusive: str,
                 size: int, sort_argument: dict, include_published_at: bool) -> List[dict]:
    fields = BASE_FIELDS + (['published_at'] if include_published_at else [])
    payload = {
        'access_key': access_key,
        'argument': {
            'query': query,
            'published_at': {'from': from_date, 'until': until_date_exclusive},
            'provider': [BIGKINDS_PROVIDER],
            'sort': sort_argument,
            'return_from': 0,
            'return_size': size,
            'fields': fields,
        },
    }
    res = requests.post(BIGKINDS_SEARCH_URL, json=payload, timeout=BIGKINDS_TIMEOUT_SECONDS)
    try:
        res.raise_for_status()
    except requests.HTTPError as e:
        status = getattr(e.response, 'status_code', None)
        if isinstance(status, int) and 400 <= status < 500:
            raise BigKindsRejected(f'빅카인즈 HTTP {status}') from e
        raise
    body = res.json()

    if body.get('result') != 0:
        raise BigKindsRejected(f"빅카인즈 search/news 오류: {body.get('reason', '알 수 없는 오류')}")

    return (body.get('return_object') or {}).get('documents') or []


def search_news(query: str, from_date: str, until_date_exclusive: str, size: int,
                sort: str = SORT_DATE, include_published_at: bool = False) -> SearchResult:
    """서울경제 기사를 [from_date, until_date_exclusive) 범위에서 검색한다.

    sort: 'date'(최신순) | 'relevance'(관련도순, 미지원이면 date 로 자동 대체).
    오류는 BigKindsError(거부는 BigKindsRejected)로 raise — 호출 쪽이 502 로 변환한다.
    """
    global _relevance_supported, _relevance_rejected_until
    access_key = get_secret(BIGKINDS_KEY_SSM_PARAM)

    if sort == SORT_RELEVANCE and time.monotonic() >= _relevance_rejected_until:
        try:
            docs = _post_search(access_key, query, from_date, until_date_exclusive, size,
                                _SORT_ARGUMENTS[SORT_RELEVANCE], include_published_at)
            _relevance_supported = True
            _relevance_rejected_until = 0.0
            logger.info('빅카인즈 정렬: relevance(_score) 적용')
            return SearchResult(_map_documents(docs, include_published_at), SORT_RELEVANCE)
        except BigKindsRejected as e:
            logger.warning('빅카인즈가 relevance 정렬 요청을 거부 → date 로 대체 시도: %s', e)
            docs = _post_search(access_key, query, from_date, until_date_exclusive, size,
                                _SORT_ARGUMENTS[SORT_DATE], include_published_at)
            # date 로는 성공 → 거부 원인이 정렬이었다고 보고 잠시(5분)만 기억한다. 일시 오류일 수 있어 영구히 끄지 않는다.
            _relevance_rejected_until = time.monotonic() + _RELEVANCE_RETRY_SECONDS
            logger.info('빅카인즈 정렬: date 로 대체 적용(%d초간 relevance 시도 생략)', _RELEVANCE_RETRY_SECONDS)
            return SearchResult(_map_documents(docs, include_published_at), SORT_DATE)

    docs = _post_search(access_key, query, from_date, until_date_exclusive, size,
                        _SORT_ARGUMENTS[SORT_DATE], include_published_at)
    if sort == SORT_RELEVANCE:
        logger.info('빅카인즈 정렬: date 로 대체 적용(최근 relevance 거부로 잠시 생략 중)')
    return SearchResult(_map_documents(docs, include_published_at), SORT_DATE)


def next_day(date: str) -> str:
    return (datetime.strptime(date, DATE_FORMAT) + timedelta(days=1)).strftime(DATE_FORMAT)
