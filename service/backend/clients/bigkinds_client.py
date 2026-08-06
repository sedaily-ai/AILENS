"""
BigKinds OpenAPI Client
한국언론진흥재단 "뉴스 빅데이터 분석 시스템" OpenAPI 래퍼.

출처: `빅카인즈api지침서.pdf` — OpenAPI 사용자 지침서 V1.49 (최종개정 2024-12-10)

지침서에서 반드시 지켜야 하는 규약 (틀리면 조용히 빈 결과가 나온다):

1. HTTPS **POST 전용**. GET 엔드포인트는 존재하지 않는다. (§1.1)
2. 인증키는 HTTP 헤더가 아니라 **요청 본문 최상위 `access_key`** 필드다. (§1.2)
   본문 형태: `{"access_key": "<UUID>", "argument": {...}}`
3. 실패해도 **HTTP status 는 200** 이다. 성공/실패는 본문 `result` 로만 판정한다.
   성공 `result == 0`, 실패 `result == -1` + `reason` 문자열.
4. `published_at.until` 은 **지정한 일자를 제외**한다 (exclusive). (§2.2)
   하루치를 받으려면 until = 대상일 + 1일.
5. `fields` 는 **비어있어도 배열을 넣어야 하고**, 여기에 없는 필드는 응답에서 아예
   빠진다. (§2.2)

이 클라이언트가 감싸는 엔드포인트:
    §2/§3  /search/news     뉴스 검색 · 상세 조회
    §4     /issue_ranking   오늘의 이슈 (구 이슈랭킹)
    §6     /time_line       키워드 트렌드 (구 뉴스 타임라인) — 기사가 아니라 **건수 집계**
    §5     /word_cloud      연관어 분석 (구 워드클라우드)
"""
import logging
import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Sequence, Union

import requests

from config.constants import (
    BIGKINDS_API_URL_DEFAULT,
    BIGKINDS_CATEGORY_TO_STANDARD,
    BIGKINDS_DEFAULT_FIELDS,
    BIGKINDS_ENDPOINT_ISSUE_RANKING,
    BIGKINDS_ENDPOINT_SEARCH,
    BIGKINDS_ENDPOINT_TIME_LINE,
    BIGKINDS_ENDPOINT_WORD_CLOUD,
    BIGKINDS_MAX_HILIGHT,
    BIGKINDS_MAX_RETURN_FROM,
    BIGKINDS_MAX_RETURN_SIZE,
    HTTP_TIMEOUT_MEDIUM,
)

logger = logging.getLogger(__name__)

_TAG_RE = re.compile(r'<[^>]+>')
_WS_RE = re.compile(r'\s+')


# =============================================================================
# Errors
# =============================================================================

class BigKindsError(Exception):
    """빅카인즈 API 호출 실패. `reason` 은 API 가 준 원문 사유."""

    def __init__(self, message: str, result: Optional[int] = None, reason: str = ''):
        super().__init__(message)
        self.result = result
        self.reason = reason


class BigKindsNotConfiguredError(BigKindsError):
    """BIGKINDS_API_KEY 가 비어 있어 호출 자체를 시도할 수 없는 상태."""


class BigKindsAuthError(BigKindsError):
    """인증키가 미등록/무효. (`Invalid Access Key!` / `Blank Access Key!`)"""


# =============================================================================
# Models
# =============================================================================

@dataclass
class BigKindsArticle:
    """
    빅카인즈 `documents[]` 한 건을 이 프로젝트에서 쓰는 모양으로 정규화한 것.

    `category` 는 빅카인즈 통합분류체계(`"경제>증권_증시"`)를 표준 7개 카테고리로
    접은 값이고, `categories_raw` 에 원본 계층 문자열을 그대로 남겨둔다.
    """
    news_id: str
    title: str
    published_at: str
    provider: str = ''
    category: str = ''
    categories_raw: List[str] = field(default_factory=list)
    byline: str = ''
    original_link: str = ''
    hilight: str = ''
    content: str = ''
    # 지침서는 이미지 **파일 경로 조각**만 준다 (`/02100601/2021/10/27/....jpg`).
    # 공개 이미지 base URL 은 지침서에 없어서 URL 을 조립하지 않고 경로만 노출한다.
    image_path: str = ''
    images_caption: str = ''
    printing_page: str = ''
    dateline: str = ''

    def to_dict(self) -> dict:
        return {
            'news_id': self.news_id,
            'title': self.title,
            'published_at': self.published_at,
            'provider': self.provider,
            'category': self.category,
            'categories_raw': self.categories_raw,
            'byline': self.byline,
            'original_link': self.original_link,
            'hilight': self.hilight,
            'content': self.content,
            'image_path': self.image_path,
            'images_caption': self.images_caption,
            'printing_page': self.printing_page,
            'dateline': self.dateline,
        }


@dataclass
class BigKindsSearchResult:
    total_hits: int
    articles: List[BigKindsArticle]


@dataclass
class BigKindsTrendPoint:
    """`/time_line` 의 집계 한 점. label 은 interval 에 따라 YYYYMMDD/YYYYMM/YYYY."""
    label: str
    hits: int


@dataclass
class BigKindsTrend:
    total_hits: int
    points: List[BigKindsTrendPoint]

    def to_dict(self) -> dict:
        return {
            'total_hits': self.total_hits,
            'points': [{'label': p.label, 'hits': p.hits} for p in self.points],
        }


@dataclass
class BigKindsTopic:
    """
    `/issue_ranking` 의 이슈 한 건.

    ⚠️ `topic_rank` 의 의미는 지침서와 실제 응답이 어긋난다.
      · 지침서 §4.3 설명: "내부적으로 순위를 부여하기 위한 일련번호. 숫자가
        작을수록 중요한 이슈"
      · 그런데 **같은 페이지의 예시는 `topic_rank: 270` 을 먼저, `85` 를 두 번째로**
        싣는다 (설명과 반대).
      · 실측(2026-08-04): `topic_rank` 가 `news_cluster` 길이와 정확히 일치했고
        (rank 19 → 19건, rank 34 → 34건), 토픽은 10개가 아니라 30개 왔다.
    따라서 이 값을 중요도로 재정렬하는 데 쓰지 않는다. 지침서가 "중요도 순서로
    반환"한다고 했으므로 **API 가 준 순서를 그대로 보존**한다 (`issue_ranking()`).
    화면 정렬이 필요하면 보도량인 `article_count` 를 쓰는 게 안전하다.
    """
    topic: str
    topic_rank: int
    keywords: List[str] = field(default_factory=list)
    news_ids: List[str] = field(default_factory=list)

    @property
    def article_count(self) -> int:
        """이 이슈를 다룬 기사 수 — 보도량 지표."""
        return len(self.news_ids)

    def to_dict(self) -> dict:
        return {
            'topic': self.topic,
            'topic_rank': self.topic_rank,
            'article_count': self.article_count,
            'keywords': self.keywords,
            'news_ids': self.news_ids,
        }


# =============================================================================
# Helpers
# =============================================================================

def strip_tags(text: str) -> str:
    """`hilight` 에 섞여오는 `<b>` 강조 태그 제거 + 공백 정리."""
    if not text:
        return ''
    return _WS_RE.sub(' ', _TAG_RE.sub('', text)).strip()


def exclusive_until(date_str: str) -> str:
    """
    `published_at.until` 이 exclusive 이므로, 하루치를 포함시키려면 +1일 해야 한다.

    >>> exclusive_until('2026-07-31')
    '2026-08-01'
    """
    return (datetime.strptime(date_str, '%Y-%m-%d') + timedelta(days=1)).strftime('%Y-%m-%d')


def normalize_category(
    categories: Sequence[str],
    prefer: Optional[Sequence[str]] = None,
) -> str:
    """
    빅카인즈 통합분류체계 값들을 표준 7개 카테고리 중 하나로 접는다.

    `["경제>증권_증시", "경제>부동산"]` → `"경제"`
    1레벨만 보고 매핑하며, 매핑에 없으면 첫 값의 1레벨을 그대로 돌려준다.

    Args:
        prefer: 표준 카테고리 목록. 기사가 여러 분류를 가질 때 이 중 하나로
            매핑되는 분류를 우선한다.

            빅카인즈는 기사 하나에 분류를 여러 개 붙인다
            (예: `["사회>노동_복지", "경제>취업_창업"]`). 사용자가 '경제'로
            필터링했다면 그 기사는 '경제' 조건으로 검색된 것인데, 단순히 첫
            값을 쓰면 화면에 '사회'로 표시돼 필터와 라벨이 어긋난다.
            `prefer` 를 주면 그 어긋남을 막는다.
    """
    items = [str(c).split('>')[0].strip() for c in (categories or []) if c]

    if prefer:
        wanted = set(prefer)
        for level1 in items:
            mapped = BIGKINDS_CATEGORY_TO_STANDARD.get(level1)
            if mapped and mapped in wanted:
                return mapped

    for level1 in items:
        mapped = BIGKINDS_CATEGORY_TO_STANDARD.get(level1)
        if mapped:
            return mapped

    return items[0] if items else ''


def standard_to_bigkinds_categories(categories: Sequence[str]) -> List[str]:
    """
    이 프로젝트의 표준 카테고리 → 빅카인즈 통합분류체계 1레벨 값들로 역매핑.

    `BIGKINDS_CATEGORY_TO_STANDARD` 의 역방향이다. '사회' 는 빅카인즈에서
    '사회' 와 '지역' 두 갈래로 나뉘므로 둘 다 요청해야 누락이 없다.

    >>> standard_to_bigkinds_categories(['사회'])
    ['사회', '지역']
    """
    out: List[str] = []
    for std in categories or []:
        for bk_cat, mapped in BIGKINDS_CATEGORY_TO_STANDARD.items():
            if mapped == std and bk_cat not in out:
                out.append(bk_cat)
    return out


def _as_list(value: Any) -> List[str]:
    """빅카인즈는 필드를 문자열/배열 어느 쪽으로도 줄 수 있어 배열로 통일한다."""
    if value is None or value == '':
        return []
    if isinstance(value, list):
        return [str(v) for v in value if v not in (None, '')]
    return [str(value)]


def _first_image_path(value: Any) -> str:
    """`images` 는 단일 문자열 또는 개행/배열로 올 수 있다. 첫 경로만 취한다."""
    if isinstance(value, list):
        return str(value[0]).strip() if value else ''
    if isinstance(value, str) and value.strip():
        return value.replace(',', '\n').split('\n')[0].strip()
    return ''


def parse_article(
    doc: dict,
    prefer_categories: Optional[Sequence[str]] = None,
) -> BigKindsArticle:
    """
    `documents[]` 한 건 → BigKindsArticle. 없는 필드는 빈 값으로 흘린다.

    `prefer_categories` 는 `normalize_category()` 로 넘어가, 검색에 사용한
    카테고리와 표시 라벨이 어긋나지 않게 한다.
    """
    categories_raw = _as_list(doc.get('category'))
    return BigKindsArticle(
        news_id=str(doc.get('news_id', '') or ''),
        title=strip_tags(str(doc.get('title', '') or '')),
        published_at=str(doc.get('published_at', '') or ''),
        provider=str(doc.get('provider', '') or ''),
        category=normalize_category(categories_raw, prefer=prefer_categories),
        categories_raw=categories_raw,
        byline=str(doc.get('byline', '') or ''),
        original_link=str(doc.get('provider_link_page', '') or ''),
        hilight=strip_tags(str(doc.get('hilight', '') or '')),
        content=str(doc.get('content', '') or ''),
        image_path=_first_image_path(doc.get('images')),
        images_caption=str(doc.get('images_caption', '') or ''),
        printing_page=str(doc.get('printing_page', '') or ''),
        dateline=str(doc.get('dateline', '') or ''),
    )


# =============================================================================
# Client
# =============================================================================

class BigKindsClient:
    """
    빅카인즈 OpenAPI 클라이언트.

    사용:
        client = BigKindsClient()                    # settings 에서 키/URL 자동 주입
        if client.is_configured:
            result = client.search_single_day('2026-07-31', providers=['서울경제'])
    """

    def __init__(
        self,
        access_key: Optional[str] = None,
        base_url: Optional[str] = None,
        timeout: int = HTTP_TIMEOUT_MEDIUM,
        session: Optional[requests.Session] = None,
    ):
        if access_key is None or base_url is None:
            # import 시점이 아니라 생성 시점에 읽어야 Lambda 환경변수 갱신이 반영된다.
            from config import settings
            if access_key is None:
                access_key = settings.bigkinds_api_key
            if base_url is None:
                base_url = settings.bigkinds_api_url or BIGKINDS_API_URL_DEFAULT

        self.access_key = (access_key or '').strip()
        self.base_url = (base_url or BIGKINDS_API_URL_DEFAULT).rstrip('/')
        self.timeout = timeout
        self._session = session or requests.Session()

    # ── 상태 ────────────────────────────────────────────────────────────────

    @property
    def is_configured(self) -> bool:
        """키가 주입돼 있는지. 호출 전 게이트로 쓴다 (유효성까지는 알 수 없다)."""
        return bool(self.access_key)

    # ── 전송 ────────────────────────────────────────────────────────────────

    def _post(self, path: str, argument: Dict[str, Any]) -> Dict[str, Any]:
        """
        지침서 §1 형식으로 POST 하고 `return_object` 를 돌려준다.

        Raises:
            BigKindsNotConfiguredError: 인증키 미설정
            BigKindsAuthError: 인증키 무효/미등록
            BigKindsError: 그 외 API 실패 또는 전송 실패
        """
        if not self.is_configured:
            raise BigKindsNotConfiguredError(
                'BIGKINDS_API_KEY 가 설정되지 않았습니다.'
            )

        url = f'{self.base_url}{path}'
        payload = {'access_key': self.access_key, 'argument': argument}

        try:
            response = self._session.post(
                url,
                json=payload,
                headers={'Content-Type': 'application/json; charset=utf-8'},
                timeout=self.timeout,
            )
            response.raise_for_status()
        except requests.RequestException as e:
            raise BigKindsError(f'빅카인즈 요청 실패 ({path}): {e}') from e

        try:
            body = response.json()
        except ValueError as e:
            raise BigKindsError(
                f'빅카인즈 응답이 JSON 이 아닙니다 ({path}): {response.text[:200]}'
            ) from e

        # 실패도 HTTP 200 이라 body.result 로만 판정한다.
        result = body.get('result')
        if result != 0:
            reason = str(body.get('reason', '') or '')
            message = f'빅카인즈 API 오류 ({path}): result={result}, reason={reason}'
            if 'Access Key' in reason:
                # "Invalid Access Key!:<uuid>" / "Blank Access Key!:"
                raise BigKindsAuthError(message, result=result, reason=reason)
            raise BigKindsError(message, result=result, reason=reason)

        return body.get('return_object') or {}

    # ── §2 뉴스 검색 ────────────────────────────────────────────────────────

    def search_news(
        self,
        query: Optional[Union[str, dict]] = None,
        date_from: Optional[str] = None,
        date_until: Optional[str] = None,
        providers: Optional[Sequence[str]] = None,
        categories: Optional[Sequence[str]] = None,
        categories_incident: Optional[Sequence[str]] = None,
        byline: Optional[str] = None,
        sort: Optional[Union[dict, list]] = None,
        hilight: Optional[int] = None,
        return_from: int = 0,
        return_size: int = 30,
        fields: Optional[Sequence[str]] = None,
    ) -> BigKindsSearchResult:
        """
        뉴스 검색 (지침서 §2).

        Args:
            query: 검색어. `AND/OR/NOT`, `""` 구문검색, `()` 우선순위 지원.
                제목/본문 한정 검색은 `{"title": "..."}` / `{"content": "..."}` 형태.
                None 이면 검색어 없이 기간/언론사 조건만으로 조회한다.
            date_from: 조회 시작일 `YYYY-MM-DD` (KST). 지정일 **포함**.
            date_until: 조회 종료일 `YYYY-MM-DD` (KST). 지정일 **제외**(exclusive).
                하루치를 원하면 `exclusive_until()` 로 +1일 해서 넘긴다.
            providers: 언론사 명칭 또는 코드. 여러 개는 OR.
            categories: 통합분류체계 명칭 또는 코드 (`"경제>부동산"`). 여러 개는 OR.
            sort: 기본은 정확도순. 최신순은 `{"date": "desc"}`.
            return_size: 최대 10000. return_from 은 최대 20000.
        """
        argument: Dict[str, Any] = {}

        if query:
            argument['query'] = query
        if date_from or date_until:
            published_at: Dict[str, str] = {}
            if date_from:
                published_at['from'] = date_from
            if date_until:
                published_at['until'] = date_until
            argument['published_at'] = published_at
        if providers:
            argument['provider'] = list(providers)
        if categories:
            argument['category'] = list(categories)
        if categories_incident:
            argument['category_incident'] = list(categories_incident)
        if byline:
            argument['byline'] = byline
        if sort:
            argument['sort'] = sort
        if hilight:
            argument['hilight'] = min(int(hilight), BIGKINDS_MAX_HILIGHT)

        argument['return_from'] = max(0, min(int(return_from), BIGKINDS_MAX_RETURN_FROM))
        argument['return_size'] = max(1, min(int(return_size), BIGKINDS_MAX_RETURN_SIZE))
        # 빈 배열이라도 반드시 보내야 한다 (§2.2).
        argument['fields'] = list(fields) if fields is not None else list(BIGKINDS_DEFAULT_FIELDS)

        return_object = self._post(BIGKINDS_ENDPOINT_SEARCH, argument)
        documents = return_object.get('documents') or []

        # 검색에 쓴 분류를 표시 라벨 결정에 우선 반영한다 (필터-라벨 불일치 방지).
        prefer = (
            [BIGKINDS_CATEGORY_TO_STANDARD[c] for c in categories
             if c in BIGKINDS_CATEGORY_TO_STANDARD]
            if categories else None
        )
        articles = [parse_article(doc, prefer_categories=prefer) for doc in documents]

        logger.info(
            'BigKinds search: total_hits=%s, returned=%s (from=%s, until=%s, providers=%s)',
            return_object.get('total_hits'), len(articles), date_from, date_until, providers,
        )
        return BigKindsSearchResult(
            total_hits=int(return_object.get('total_hits') or 0),
            articles=articles,
        )

    def search_single_day(
        self,
        date: str,
        **kwargs: Any,
    ) -> BigKindsSearchResult:
        """
        하루치 조회 편의 메서드. `until` exclusive 를 여기서 처리한다.

        `search_news(date_from=date, date_until=date+1일)` 과 같다.
        기본 정렬은 최신순.
        """
        kwargs.setdefault('sort', {'date': 'desc'})
        return self.search_news(
            date_from=date,
            date_until=exclusive_until(date),
            **kwargs,
        )

    # ── §3 뉴스 상세 조회 ───────────────────────────────────────────────────

    def get_news_detail(
        self,
        news_ids: Sequence[str],
        fields: Optional[Sequence[str]] = None,
    ) -> List[BigKindsArticle]:
        """
        뉴스 상세 조회 (지침서 §3). 검색과 같은 URL 에 `news_ids` 로 조회한다.
        본문(`content`) 은 검색 결과에 안 담으므로 여기서 받는다.
        """
        if not news_ids:
            return []

        argument = {
            'news_ids': list(news_ids),
            'fields': list(fields) if fields is not None else [
                'news_id', 'title', 'content', 'published_at', 'provider',
                'byline', 'category', 'category_incident',
                'images', 'images_caption', 'provider_news_id', 'publisher_code',
            ],
        }
        return_object = self._post(BIGKINDS_ENDPOINT_SEARCH, argument)
        return [parse_article(doc) for doc in (return_object.get('documents') or [])]

    # ── §6 키워드 트렌드 (구 뉴스 타임라인) ─────────────────────────────────

    def keyword_trend(
        self,
        query: str,
        date_from: str,
        date_until: str,
        interval: str = 'day',
        providers: Optional[Sequence[str]] = None,
        categories: Optional[Sequence[str]] = None,
        normalize: bool = False,
    ) -> BigKindsTrend:
        """
        키워드 트렌드 (지침서 §6, `/time_line`).

        ※ 이 API 는 **기사 목록이 아니라 기간별 건수 집계**만 준다.
          기사 본문/제목이 필요하면 `search_news()` 를 따로 불러야 한다.

        Args:
            query: 필수.
            interval: `day` | `month` | `year`
            normalize: 수집량 대비 정규화 여부.
        """
        if not query:
            raise BigKindsError('keyword_trend 는 query 가 필수입니다 (지침서 §6.2).')
        if interval not in ('day', 'month', 'year'):
            raise BigKindsError(f"interval 은 day/month/year 만 가능합니다: {interval}")

        argument: Dict[str, Any] = {
            'query': query,
            'published_at': {'from': date_from, 'until': date_until},
            'interval': interval,
            # 지침서 예시가 문자열 "false" 를 쓴다.
            'normalize': 'true' if normalize else 'false',
        }
        if providers:
            argument['provider'] = list(providers)
        if categories:
            argument['category'] = list(categories)

        return_object = self._post(BIGKINDS_ENDPOINT_TIME_LINE, argument)
        points = [
            BigKindsTrendPoint(
                label=str(p.get('label', '') or ''),
                hits=int(p.get('hits') or 0),
            )
            for p in (return_object.get('time_line') or [])
        ]
        return BigKindsTrend(
            total_hits=int(return_object.get('total_hits') or 0),
            points=points,
        )

    # ── §4 오늘의 이슈 ──────────────────────────────────────────────────────

    def issue_ranking(
        self,
        date: str,
        providers: Optional[Sequence[str]] = None,
    ) -> List[BigKindsTopic]:
        """
        오늘의 이슈 (지침서 §4, `/issue_ranking`).

        조회 가능 일자는 **1990-01-01 부터**다 (§4.2).

        반환 순서는 **API 가 준 순서를 그대로 유지**한다. 지침서가 "중요도 순서로
        반환"한다고 명시했고, `topic_rank` 로 재정렬하면 오히려 어긋난다 —
        이유는 `BigKindsTopic` 독스트링 참조 (지침서 설명과 예시가 서로 반대,
        실측값은 클러스터 크기와 일치).

        토픽 개수도 지침서는 10개라고 하지만 실측 30개였으니 개수를 가정하지 말 것.
        """
        argument: Dict[str, Any] = {'date': date, 'provider': list(providers or [])}
        return_object = self._post(BIGKINDS_ENDPOINT_ISSUE_RANKING, argument)

        topics = []
        for t in (return_object.get('topics') or []):
            keywords_raw = t.get('topic_keyword', '') or ''
            topics.append(BigKindsTopic(
                topic=str(t.get('topic', '') or ''),
                topic_rank=int(t.get('topic_rank') or 0),
                keywords=[k.strip() for k in str(keywords_raw).split(',') if k.strip()],
                news_ids=_as_list(t.get('news_cluster')),
            ))

        logger.info(
            'BigKinds issue_ranking: date=%s, topics=%s, 보도량 %s',
            date, len(topics), [t.article_count for t in topics[:5]],
        )
        return topics

    # ── §5 연관어 분석 ──────────────────────────────────────────────────────

    def word_cloud(
        self,
        query: str,
        date_from: str,
        date_until: str,
        providers: Optional[Sequence[str]] = None,
    ) -> List[dict]:
        """연관어 분석 (지침서 §5, `/word_cloud`). `nodes[]` 를 그대로 돌려준다."""
        if not query:
            raise BigKindsError('word_cloud 는 query 가 필수입니다 (지침서 §5.2).')

        argument: Dict[str, Any] = {
            'query': query,
            'published_at': {'from': date_from, 'until': date_until},
        }
        if providers:
            argument['provider'] = list(providers)

        return_object = self._post(BIGKINDS_ENDPOINT_WORD_CLOUD, argument)
        return return_object.get('nodes') or []
