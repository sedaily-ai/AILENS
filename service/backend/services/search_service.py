"""Search 비즈니스 로직 — handlers/search_handler.py에서 추출
(2026-08-24, 코드 리팩토링 감사 Track B, God 파일 분해).

2026-09-09(v1.25): DynamoDB GSI 쿼리 → PostgreSQL(lens-cms-api) 전환.
카테고리 alias 확장(PHASE 72)은 그대로 여기서 하고, 확장된 리스트를
서버에 넘겨 WHERE raw_category = ANY(...)로 필터링한다. dedup 로직
(카테고리 alias 중복, version_ 접두사 레코드)은 제거했다 — Postgres는
article_no당 행이 하나뿐이라 원천적으로 중복이 생기지 않는다(DynamoDB의
"버전 레코드"는 그쪽 스키마 특유의 개념).
"""
import logging
from typing import List, Optional, Dict, Any
from dataclasses import dataclass
import time

import clients.articles_pg_client as articles_client
from config.constants import CATEGORY_SEARCH_ALIASES

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# =============================================================================
# In-Memory Cache (Lambda warm container)
# =============================================================================
_cache: Dict[str, Any] = {}
_cache_timestamps: Dict[str, float] = {}
CACHE_TTL_SECONDS = 300  # 5 minutes

def get_cached(key: str) -> Optional[Any]:
    """Get value from cache if not expired"""
    if key in _cache and key in _cache_timestamps:
        if time.time() - _cache_timestamps[key] < CACHE_TTL_SECONDS:
            logger.info(f"Cache HIT: {key}")
            return _cache[key]
        else:
            # Expired - remove
            del _cache[key]
            del _cache_timestamps[key]
    return None

def set_cached(key: str, value: Any):
    """Set value in cache"""
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
    """
    PostgreSQL search via lens-cms-api (v1.25). 카테고리 alias 확장(PHASE 72)은
    그대로 여기서 하고, 확장된 categories 리스트+검색 조건을 서버로 넘겨
    WHERE raw_category = ANY(...) + COUNT(*)/LIMIT/OFFSET으로 페이지네이션한다.
    """
    # Check cache first
    cache_key = f"search:{query}:{published_from}:{published_until}:{','.join(sorted(categories))}:{page}:{page_size}"
    cached_result = get_cached(cache_key)
    if cached_result:
        return cached_result

    # PHASE 72: Expand categories to include aliases (e.g., "문화" also queries "문화·라이프")
    if categories:
        categories_to_query = []
        for cat in categories:
            if cat in CATEGORY_SEARCH_ALIASES:
                categories_to_query.extend(CATEGORY_SEARCH_ALIASES[cat])
            else:
                categories_to_query.append(cat)
        categories_to_query = list(dict.fromkeys(categories_to_query))
    else:
        # None이면 서버가 카테고리 필터 없이 전체를 본다 — DynamoDB 시절
        # "표준 카테고리+alias 전체"로 좁히던 것과 달리 raw_category에 남아있는
        # 장꼬리 레거시 분류값(v1.25에서 발견)까지 포함하지만, 검색 결과를
        # 더 넓히는 방향이라 무해하다고 판단.
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

    # Cache the result
    set_cached(cache_key, result)

    return result
