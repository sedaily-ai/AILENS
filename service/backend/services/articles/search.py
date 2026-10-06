"""Search 비즈니스 로직 — PostgreSQL(lens-cms-api) 기반 기사 검색.

카테고리 alias를 확장한 리스트를 서버에 넘겨 WHERE raw_category = ANY(...)로 필터링한다.
article_no당 행이 하나뿐이므로 중복 제거 로직은 두지 않는다.
"""
import logging
from typing import List, Optional, Dict, Any
from dataclasses import dataclass
import time

import clients.pg.articles as articles_client
from config.constants import CATEGORY_SEARCH_ALIASES

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# Lambda warm 컨테이너용 인메모리 캐시
_cache: Dict[str, Any] = {}
_cache_timestamps: Dict[str, float] = {}
CACHE_TTL_SECONDS = 300  # 5분

def get_cached(key: str) -> Optional[Any]:
    """만료되지 않은 캐시 값을 반환한다."""
    if key in _cache and key in _cache_timestamps:
        if time.time() - _cache_timestamps[key] < CACHE_TTL_SECONDS:
            logger.info(f"Cache HIT: {key}")
            return _cache[key]
        else:
            # 만료 항목 제거
            del _cache[key]
            del _cache_timestamps[key]
    return None

def set_cached(key: str, value: Any):
    """캐시에 값을 저장한다."""
    _cache[key] = value
    _cache_timestamps[key] = time.time()
    logger.info(f"Cache SET: {key}")


@dataclass
class SearchResponse:
    total_hits: int
    page: int
    page_size: int
    total_pages: int
    articles: List[dict]


def search_dynamodb_optimized(
    query: Optional[str],
    published_from: str,
    published_until: str,
    categories: List[str],
    page: int,
    page_size: int
) -> SearchResponse:
    """lens-cms-api를 통해 PostgreSQL에서 기사를 검색한다.

    카테고리 alias를 확장해 서버에 넘기고, 서버가 COUNT(*)/LIMIT/OFFSET으로 페이지네이션한다.
    결과는 5분간 인메모리 캐시한다.
    """
    cache_key = f"search:{query}:{published_from}:{published_until}:{','.join(sorted(categories))}:{page}:{page_size}"
    cached_result = get_cached(cache_key)
    if cached_result:
        return cached_result

    # 카테고리 alias 확장(예: "문화" -> "문화·라이프" 포함)
    if categories:
        categories_to_query = []
        for cat in categories:
            if cat in CATEGORY_SEARCH_ALIASES:
                categories_to_query.extend(CATEGORY_SEARCH_ALIASES[cat])
            else:
                categories_to_query.append(cat)
        categories_to_query = list(dict.fromkeys(categories_to_query))
    else:
        # None이면 서버가 카테고리 필터 없이 전체를 조회한다(레거시 raw_category 값 포함).
        categories_to_query = None

    logger.info(f"Querying categories via PostgreSQL: {categories_to_query}")

    result_dict = articles_client.search_paged(
        categories=categories_to_query,
        query=query or None,
        published_from=published_from,
        published_until=published_until,
        page=page,
        page_size=page_size,
    )

    result = SearchResponse(
        total_hits=result_dict["total_hits"],
        page=result_dict["page"],
        page_size=result_dict["page_size"],
        total_pages=result_dict["total_pages"],
        articles=result_dict["articles"],
    )

    set_cached(cache_key, result)

    return result
