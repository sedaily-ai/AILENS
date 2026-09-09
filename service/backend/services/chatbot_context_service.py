"""챗봇 컨텍스트 조회 — 브리핑(DynamoDB)·최근기사/연관기사 검색(PostgreSQL).

2026-08-05: `handlers/chatbot_handler.py`(869줄)에서 분리. Bedrock 호출과
무관한, 순수 데이터 조회 책임만 모았다.

⚠️ `get_cached_briefing`은 `clients/dynamodb_client.py`의 `DynamoDBClient`를
쓰지 않고 boto3를 직접 호출한다. `handlers/briefing_handler.py`가 쓰는
`DynamoDBClient.save_news_briefing()`과 짝을 이루는 읽기지만, staleness 체크
로직이 달라 단순 클라이언트 교체가 아니다 — 그대로 둔다(v1.25 기사 전환과도
무관 — 브리핑은 별도 아이템(`news_briefing_latest`), 기사 자체가 아니다).

2026-08-07: MBTI 페르소나 제거로 그룹별 브리핑 선택 로직은 없앴다. 다만
`services/briefing_generator.py`(이번 정리 범위 밖)는 아직 DDB 아이템에
`briefing_NT`/`briefing_NF`/`briefing_ST`/`briefing_SF` 4개 키로 쓰고 있어,
`get_cached_briefing`은 과도기적으로 그중 채워진 첫 값을 그대로 가져온다 —
generator 가 단일 키로 정리되면 이 fallback 목록도 함께 정리할 것.

2026-09-09(v1.25): `get_recent_articles`/`search_related_articles`는
raw boto3 GSI 쿼리에서 PostgreSQL(lens-cms-api, `clients/articles_pg_client.py`)
경유로 전환. 카테고리 리스트·불용어 필터링·broad-keyword fallback 등
비즈니스 로직은 그대로 두고, DynamoDB 쿼리 프리미티브만 서버 호출로
교체했다 — Postgres articles.body가 이미 인라인이라 S3 body fetch
(`_fetch_article_body`)가 필요 없어져 함께 제거.
"""
import logging
import boto3
from typing import Optional, Dict, Any, List

import clients.articles_pg_client as articles_client
from datetime import datetime

from config.constants import (
    DYNAMODB_TABLE_ARTICLES_DEV,
    NEWS_BRIEFING_ID,
    NEWS_BRIEFING_MAX_AGE_HOURS,
)

logger = logging.getLogger(__name__)


def get_cached_briefing(mbti_group: str = None) -> Optional[str]:
    """Fetch the cached news briefing.
    Returns the briefing text if fresh, or None to fall back to article query.

    ``mbti_group`` is accepted-but-unused for backward compat — `main.py`
    (local dev FastAPI server, out of this cleanup's scope) still calls this
    positionally with a group value. MBTI personas were removed site-wide, so
    the lookup no longer branches on it (see module docstring for the
    transitional multi-key fallback this uses instead)."""
    try:
        dynamodb = boto3.resource('dynamodb', region_name='us-east-1')
        table = dynamodb.Table(DYNAMODB_TABLE_ARTICLES_DEV)

        response = table.get_item(Key={'news_id': NEWS_BRIEFING_ID})
        item = response.get('Item')

        if not item:
            return None

        # Check staleness
        generated_at = item.get('generated_at', '')
        if generated_at:
            from datetime import timedelta, timezone
            gen_time = datetime.fromisoformat(generated_at)
            kst = timezone(timedelta(hours=9))
            now = datetime.now(kst)
            # Make gen_time offset-aware if needed
            if gen_time.tzinfo is None:
                gen_time = gen_time.replace(tzinfo=kst)
            age_hours = (now - gen_time).total_seconds() / 3600
            if age_hours > NEWS_BRIEFING_MAX_AGE_HOURS:
                logger.warning(f"Briefing is stale ({age_hours:.1f}h old), falling back to article query")
                return None

        # Transitional: briefing_generator.py still writes 4 persona-keyed
        # fields instead of one default key. No personas left to pick by, so
        # just take whichever is populated (see module docstring).
        briefing = None
        for key in ('briefing_default', 'briefing_NT', 'briefing_NF', 'briefing_ST', 'briefing_SF'):
            briefing = item.get(key)
            if briefing:
                break
        if briefing:
            logger.info(f"Using cached briefing (generated: {generated_at})")
        return briefing

    except Exception as e:
        logger.warning(f"Failed to fetch cached briefing: {e}")
        return None


def get_recent_articles(limit: int = 5) -> List[Dict[str, Any]]:
    """Fetch recent articles with body content for context"""
    try:
        # 카테고리별 top-3 쿼리 후 merge — DynamoDB GSI 쿼리 4번(카테고리당
        # Limit=3)을 그대로 재현. Postgres articles.body가 이미 인라인이라
        # S3 body fetch가 필요 없다.
        all_items = []
        for cat in ['경제', '정치', '사회', 'IT_과학']:
            try:
                all_items.extend(articles_client.get_recent_articles(cat, limit=3))
            except Exception:
                continue

        # Sort by published_at descending, take top N
        all_items.sort(key=lambda x: x.get('published_at', ''), reverse=True)
        all_items = all_items[:limit]

        articles = []
        for item in all_items:
            articles.append({
                'news_id': item.get('news_id'),
                'title': item.get('title_ko', ''),
                'category': item.get('category', ''),
                'published_at': item.get('published_at', ''),
                'content': (item.get('content_ko') or '')[:500],
            })

        return articles
    except Exception as e:
        logger.warning(f"Failed to fetch recent articles: {e}")
        return []


KOREAN_STOPWORDS = {
    '은', '는', '이', '가', '을', '를', '에', '의', '로', '으로',
    '와', '과', '도', '만', '부터', '까지', '에서', '한', '된', '하는',
    '있는', '없는', '대한', '위한', '통한', '그', '저', '것', '해줘',
    '수', '등', '및', '또', '더', '좀', '뭐', '어떤', '오늘', '최근',
    '알려줘', '설명해줘', '분석해줘', '추천해줘', '어때', '뭐야',
}


def search_related_articles(user_message: str, limit: int = 3) -> List[Dict[str, Any]]:
    """Search PostgreSQL for articles related to the user's message keywords."""
    try:
        keywords = [w for w in user_message.split() if len(w) >= 2 and w not in KOREAN_STOPWORDS][:5]
        if not keywords:
            return []

        from datetime import timedelta, timezone

        kst = timezone(timedelta(hours=9))
        now = datetime.now(kst)
        week_ago = (now - timedelta(days=7)).isoformat()

        all_matches = []
        for cat in ['경제', '정치', '사회', 'IT_과학', '문화']:
            try:
                all_matches.extend(
                    articles_client.category_query(cat, keywords_any=keywords, since=week_ago, limit=20)
                )
            except Exception:
                continue

        all_matches.sort(key=lambda x: x.get('published_at', ''), reverse=True)

        # Fallback: 키워드 매칭 없고, 매우 광범위한 뉴스 요청일 때만 최신 기사 반환
        # '오늘'·'시장'·'경제' 등은 너무 포괄적이라 구체 질문(예: '삼성전자 오늘 주가')까지
        # 광범위로 분류되어 엉뚱한 기사가 추천되던 문제가 있었음. 엄격한 화이트리스트 사용.
        BROAD_KEYWORDS = {'뉴스', '기사', '소식', '이슈', '헤드라인', '브리핑'}
        has_broad = any(bk in user_message for bk in BROAD_KEYWORDS)
        # 추가 안전장치: 키워드가 3개 이하일 때만 fallback 허용 (구체 질문 제외)
        is_short_query = len(keywords) <= 3
        if not all_matches and has_broad and is_short_query:
            for cat in ['경제', '정치', '사회']:
                try:
                    all_matches.extend(
                        articles_client.category_query(cat, keywords_any=None, since=week_ago, limit=2)
                    )
                except Exception:
                    continue
            all_matches.sort(key=lambda x: x.get('published_at', ''), reverse=True)

        results = []
        for item in all_matches[:limit]:
            image_url = None
            images = item.get('images', [])
            if images and isinstance(images, list) and len(images) > 0:
                img = images[0]
                image_url = img.get('url', '') if isinstance(img, dict) else str(img)

            results.append({
                'news_id': item.get('news_id', ''),
                'title_ko': item.get('title_ko', ''),
                'category': item.get('category', ''),
                'published_at': item.get('published_at', ''),
                'original_link': item.get('original_link', item.get('url', '')),
                'image_url': image_url,
            })

        return results
    except Exception as e:
        logger.warning(f"Failed to search related articles: {e}")
        return []
