"""챗봇 컨텍스트 조회 — 브리핑(DynamoDB)·최근기사/연관기사 검색(PostgreSQL).

Bedrock 호출과 무관한 순수 데이터 조회만 담당한다.

- `get_cached_briefing`은 boto3로 DynamoDB의 브리핑 아이템(`news_briefing_latest`)을
  직접 읽는다. `briefing_generator.py`가 아직 `briefing_NT`/`briefing_NF`/`briefing_ST`/
  `briefing_SF` 4개 키로 저장하므로 채워진 첫 값을 사용한다.
- `get_recent_articles`/`search_related_articles`는 PostgreSQL(`clients/pg/articles.py`)을 조회한다.
  articles.body가 인라인이라 별도 S3 본문 조회는 없다.
"""
import logging
import boto3
from typing import Optional, Dict, Any, List

import clients.pg.articles as articles_client
from datetime import datetime

from config.constants import (
    DYNAMODB_TABLE_ARTICLES_DEV,
    NEWS_BRIEFING_ID,
    NEWS_BRIEFING_MAX_AGE_HOURS,
)

logger = logging.getLogger(__name__)


def get_cached_briefing(mbti_group: str = None) -> Optional[str]:
    """캐시된 뉴스 브리핑을 조회한다.

    유효 기간 내 브리핑 텍스트를 반환하고, 없거나 오래됐으면 None을 반환한다(기사 조회로 대체).
    ``mbti_group`` 은 하위 호환용 인자로 사용하지 않는다(`main.py`가 위치 인자로 전달)."""
    try:
        dynamodb = boto3.resource('dynamodb', region_name='us-east-1')
        table = dynamodb.Table(DYNAMODB_TABLE_ARTICLES_DEV)

        response = table.get_item(Key={'news_id': NEWS_BRIEFING_ID})
        item = response.get('Item')

        if not item:
            return None

        # 유효 기간 검사
        generated_at = item.get('generated_at', '')
        if generated_at:
            from datetime import timedelta, timezone
            gen_time = datetime.fromisoformat(generated_at)
            kst = timezone(timedelta(hours=9))
            now = datetime.now(kst)
            # timezone 정보가 없으면 KST로 간주
            if gen_time.tzinfo is None:
                gen_time = gen_time.replace(tzinfo=kst)
            age_hours = (now - gen_time).total_seconds() / 3600
            if age_hours > NEWS_BRIEFING_MAX_AGE_HOURS:
                logger.warning(f"Briefing is stale ({age_hours:.1f}h old), falling back to article query")
                return None

        # briefing_generator 가 아직 4개 키로 저장하므로 채워진 첫 값을 사용한다(모듈 docstring 참조).
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
    """컨텍스트용 최근 기사(본문 앞 500자 포함)를 조회한다."""
    try:
        # 카테고리별 상위 3건을 조회한 뒤 병합한다.
        all_items = []
        for cat in ['경제', '정치', '사회', 'IT_과학']:
            try:
                all_items.extend(articles_client.get_recent_articles(cat, limit=3))
            except Exception:
                continue

        # 최신순 정렬 후 상위 limit건
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
    """사용자 메시지의 키워드와 관련된 최근 7일 기사를 PostgreSQL에서 검색한다."""
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

        # 키워드 매칭이 없고 광범위한 뉴스 요청일 때만 최신 기사로 대체한다.
        # '오늘'·'시장' 같은 포괄적 단어는 구체 질문까지 광범위로 분류하므로 엄격한 화이트리스트를 쓴다.
        BROAD_KEYWORDS = {'뉴스', '기사', '소식', '이슈', '헤드라인', '브리핑'}
        has_broad = any(bk in user_message for bk in BROAD_KEYWORDS)
        # 키워드가 3개 이하인 짧은 질문에만 대체를 허용한다.
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
