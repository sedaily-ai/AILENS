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
from typing import Any, Dict, List, NamedTuple, Optional, Tuple

import requests

from common.secrets import get_secret
from common.dates.validation import DATE_FORMAT

logger = logging.getLogger(__name__)

BIGKINDS_SEARCH_URL = 'https://tools.kinds.or.kr/search/news'
BIGKINDS_KEY_SSM_PARAM = '/sedaily-mbti/bigkinds-api-key'
BIGKINDS_TIMEOUT_SECONDS = 15
BIGKINDS_PROVIDER = '서울경제'

# 검색 결과에 자주 섞이는 저가치 코너(부고·인사·사설 등)를 제외하는 제목 마커.
# 1990년대 보관본은 코너 이름을 한자로 쓴다('[社說] 大企業의 役割', 2026-10-20 확인) — 한글 마커에 걸리지 않아 함께 둔다.
EXCLUDE_TITLE_MARKERS = ('[부고]', '[인사]', '[사설]', '[마켓아이]', '[시론]', '[발언대]', '[社說]', '[人事]', '[訃告]')

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
                 size: int, sort_argument: dict, include_published_at: bool,
                 fields: Optional[List[str]] = None,
                 timeout: int = BIGKINDS_TIMEOUT_SECONDS) -> List[dict]:
    if fields is None:
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
    res = requests.post(BIGKINDS_SEARCH_URL, json=payload, timeout=timeout)
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


def previous_day(date: str) -> str:
    return (datetime.strptime(date, DATE_FORMAT) - timedelta(days=1)).strftime(DATE_FORMAT)


# ─── 그날의 1면 ───────────────────────────────────────────────────────────────
# 빅카인즈 검색이 면 번호 필터를 지원하는지 확인되지 않아 이틀치 서울경제 전체를 받아 1면만 거른다.
# 2026-10-19 실측: 무거운 날(2018-03-05~06) 3,182건·본문 포함 6.25MB·4.5초, 최근 이틀 969건·3.3MB·2초.
FRONT_PAGE_FIELDS = ['title', 'content', 'byline', 'category', 'provider_link_page', 'printing_page', 'enveloped_at']
FRONT_PAGE_FETCH_SIZE = 5000
FRONT_PAGE_TIMEOUT_SECONDS = 20
# 1면이 있는지만 볼 때(본문 없이 면 번호·송고 시각만) — 생일 1면 대체의 거슬러 찾기와 1면 없는 날 목록 수집이 쓴다.
FRONT_COUNT_FIELDS = ['printing_page', 'enveloped_at']
FRONT_COUNT_TIMEOUT_SECONDS = 10
# 1면에 함께 실리는 사진 설명 기사. 본문 길이로 줄 세우면 맨 위 기사가 될 수 있어 뒤로 보낸다.
PHOTO_TITLE_PREFIXES = ('[사진]', '[포토]')


def _sent_minute(doc: dict) -> str:
    """enveloped_at('2019-10-08T17:11:00.000+09:00', KST)을 분 단위 문자열로 자른다. 형식이 다르면 빈 문자열."""
    raw = doc.get('enveloped_at')
    return raw[:16] if isinstance(raw, str) and len(raw) >= 16 else ''


FRONT_MATCH_PUBLISHED = 'published'
FRONT_MATCH_SENT = 'sent'


def _cap(default: float, timeout: Optional[float]) -> float:
    """호출 쪽 남은 시간(timeout)이 기본 제한보다 짧으면 그만큼만 기다린다."""
    return default if timeout is None else min(default, timeout)


def _front_docs(print_date: str, match: str, fields: List[str], timeout: float) -> List[dict]:
    """인쇄일 print_date 신문의 1면(printing_page '1') 원문서.

    어느 기사가 그날 신문인지 시기마다 판별 기준이 다르다(2026-10-19 실측).
    - match='published': published_at 날짜가 인쇄일인 기사(1994~1996 보관본). 송고 시각은 보관 작업 시각이라 쓰지 않는다.
    - match='sent': 인쇄 전날 12시 ~ 인쇄일 12시에 송고(enveloped_at)된 기사(2017-11 이후). published_at 은
      2019-10-08 인쇄분부터 전날 날짜가 붙다가 2026년에는 다시 인쇄일이라, 날짜 대신 전날 저녁 송고 시각으로 고른다.
      다음 날 신문은 인쇄일 오후에 송고돼 섞이지 않는다.
    """
    access_key = get_secret(BIGKINDS_KEY_SSM_PARAM)
    start = previous_day(print_date) if match == FRONT_MATCH_SENT else print_date
    docs = _post_search(access_key, '', start, next_day(print_date), FRONT_PAGE_FETCH_SIZE,
                        _SORT_ARGUMENTS[SORT_DATE], False, fields=fields, timeout=timeout)
    window_start, window_end = f'{start}T12:00', f'{print_date}T12:00'
    return [d for d in docs
            if str(d.get('printing_page') or '').strip() == '1'
            and (match != FRONT_MATCH_SENT or window_start <= _sent_minute(d) < window_end)]


def _longest_first(docs: List[dict]) -> List[dict]:
    """본문이 긴 순(분량 순 — 중요도 판단이 아니다). 사진 설명 기사는 맨 뒤. 미리보기로 자르기 전 원문 길이로 잰다."""
    return sorted(docs, key=lambda d: ((d.get('title') or '').strip().startswith(PHOTO_TITLE_PREFIXES),
                                       -len(d.get('content') or '')))


def count_front_page(print_date: str, match: str, timeout: Optional[float] = None) -> int:
    """인쇄일 신문의 1면 기사 수 — 본문 없이 면 번호·송고 시각만 받아 센다. 오류는 BigKindsError 로 raise."""
    return len(_front_docs(print_date, match, FRONT_COUNT_FIELDS, _cap(FRONT_COUNT_TIMEOUT_SECONDS, timeout)))


def search_front_page(print_date: str, match: str, timeout: Optional[float] = None) -> List[Dict[str, Any]]:
    """인쇄일 print_date 신문의 서울경제 1면 기사. 본문이 긴 순, 사진 설명 기사는 뒤. 오류는 BigKindsError 로 raise."""
    docs = _front_docs(print_date, match, FRONT_PAGE_FIELDS, _cap(FRONT_PAGE_TIMEOUT_SECONDS, timeout))
    return _map_documents(_longest_first(docs), include_published_at=False)


# ─── 면 번호가 없는 시기의 '그날 서울경제' ──────────────────────────────────────
# 1990~1993, 1996-08~2017-11-12 보관본은 면 번호가 비어 1면을 특정할 수 없다. 대신 빅카인즈 이슈 순위(그날 언론사 전체
# 기사를 주제로 묶어 기사가 많은 순으로 준다)에서 서울경제 기사가 묶인 이슈를 골라 '그날 가장 많이 보도된 소식'의
# 서울경제 기사를 보여 준다. 기사 제목·본문은 원문 그대로이고, 이슈 이름(기계가 뽑은 낱말 묶음)은 쓰지 않는다.
# 이슈의 기사 번호는 그날 받은 서울경제 기사 목록과 번호로만 맞춘다 — 번호로 기사 상세를 따로 조회하면 0건이 섞인다
# (timeline/[date]/page.tsx 주석). 키워드로 맞추는 방법은 번호가 맞는 날과 비교해 엉뚱한 기사를 자주 골라 쓰지 않는다
# (2026-10-20 실측: 2008-09-16 넷째 이슈 '월가 위기'에 '재외공관장 임명장').
BIGKINDS_ISSUE_URL = 'https://tools.kinds.or.kr/issue_ranking'
ISSUE_TIMEOUT_SECONDS = 10

DAY_BASIS_ISSUE = 'issue'                    # 많이 보도된 이슈의 서울경제 기사
DAY_BASIS_NO_RANKING = 'no_ranking'          # 그날 이슈 순위가 비어 있음(예: 2014-04-16) → 본문이 긴 순
DAY_BASIS_NO_MATCH = 'no_match'              # 이슈에 서울경제 기사를 연결하지 못함(1990~1993, 2016년 무렵) → 본문이 긴 순
DAY_BASIS_RANKING_FAILED = 'ranking_failed'  # 이슈 순위 조회 실패 → 본문이 긴 순(짧게만 캐시)
# 그날 서울경제에서만 더 빼는 코너 — 방송 편성표는 본문이 길어 '본문이 긴 순'의 맨 위로 올라온다(1993-09-29 실측).
DAY_EXCLUDE_TITLE_MARKERS = ('[TV하이라이트]', '[TV 하이라이트]', '[TV프로]', '[방송가이드]')


def search_day_docs(date: str, timeout: Optional[float] = None) -> List[dict]:
    """published_at 이 date 인 서울경제 원문서(본문 포함). 오류는 BigKindsError 로 raise."""
    access_key = get_secret(BIGKINDS_KEY_SSM_PARAM)
    return _post_search(access_key, '', date, next_day(date), FRONT_PAGE_FETCH_SIZE,
                        _SORT_ARGUMENTS[SORT_DATE], False, fields=BASE_FIELDS,
                        timeout=_cap(FRONT_PAGE_TIMEOUT_SECONDS, timeout))


def fetch_issue_clusters(date: str, timeout: Optional[float] = None) -> List[List[str]]:
    """그날 언론사 전체 이슈 순위 — 이슈마다 묶인 기사 번호 목록, 기사가 많은 이슈부터. 오류는 BigKindsError 로 raise."""
    access_key = get_secret(BIGKINDS_KEY_SSM_PARAM)
    res = requests.post(BIGKINDS_ISSUE_URL, json={'access_key': access_key, 'argument': {'date': date}},
                        timeout=_cap(ISSUE_TIMEOUT_SECONDS, timeout))
    try:
        res.raise_for_status()
    except requests.HTTPError as e:
        raise BigKindsError(f'빅카인즈 issue_ranking HTTP {getattr(e.response, "status_code", None)}') from e
    body = res.json()
    if body.get('result') != 0:
        raise BigKindsRejected(f"빅카인즈 issue_ranking 오류: {body.get('reason', '알 수 없는 오류')}")
    topics = (body.get('return_object') or {}).get('topics') or []
    clusters = [[str(i) for i in (t.get('news_cluster') or [])] for t in topics if isinstance(t, dict)]
    return sorted((c for c in clusters if c), key=len, reverse=True)


def pick_day_articles(docs: List[dict], clusters: List[List[str]], limit: int) -> Tuple[List[Dict[str, Any]], str]:
    """그날 서울경제 원문서에서 보여 줄 limit 건과 고른 기준(DAY_BASIS_*).

    기사가 많은 이슈부터 그 이슈에 묶인 서울경제 기사 중 본문이 가장 긴 1건씩 고르고(이슈마다 1건),
    기사마다 coverage(그 이슈에 묶인 언론사 기사 수)를 붙인다. 모자라면 남은 기사를 본문이 긴 순으로 채운다(coverage 없음).
    이슈에 연결된 기사가 하나도 없으면 전부 본문이 긴 순이다. 제외 코너(부고·인사·사설 등)는 고르지 않는다.
    """
    usable = [d for d in docs if (d.get('title') or '').strip()
              and not any(marker in d['title'] for marker in EXCLUDE_TITLE_MARKERS + DAY_EXCLUDE_TITLE_MARKERS)]
    by_id = {d.get('news_id'): d for d in usable}
    picked: List[Tuple[dict, Optional[int]]] = []
    used = set()
    for cluster in clusters:
        mine = [by_id[i] for i in cluster if i in by_id and i not in used]
        if not mine:
            continue
        best = _longest_first(mine)[0]
        used.add(best.get('news_id'))
        picked.append((best, len(cluster)))
        if len(picked) == limit:
            break
    basis = DAY_BASIS_ISSUE if picked else (DAY_BASIS_NO_MATCH if clusters else DAY_BASIS_NO_RANKING)
    for doc in _longest_first([d for d in usable if d.get('news_id') not in used]):
        if len(picked) == limit:
            break
        picked.append((doc, None))
    articles = []
    for doc, coverage in picked:
        article = _map_documents([doc], include_published_at=False)[0]
        article['coverage'] = coverage
        articles.append(article)
    return articles, basis
