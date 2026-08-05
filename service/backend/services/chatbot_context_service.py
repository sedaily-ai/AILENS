"""챗봇 컨텍스트 조회 — DynamoDB/S3 기반 브리핑·최근기사·연관기사 검색.

2026-08-05: `handlers/chatbot_handler.py`(869줄)에서 분리. Bedrock 호출과
무관한, 순수 데이터 조회 책임만 모았다 — raw boto3 그대로 유지(리팩토링 없음).

⚠️ `get_cached_briefing`은 `clients/dynamodb_client.py`의 `DynamoDBClient`를
쓰지 않고 boto3를 직접 호출한다. `handlers/briefing_handler.py`가 쓰는
`DynamoDBClient.save_news_briefing()`과 짝을 이루는 읽기지만, staleness 체크와
`briefing_{mbti_group}` 키 추출 로직이 달라 단순 클라이언트 교체가 아니다 —
그대로 둔다.
"""
import logging
import boto3
import json
from typing import Optional, Dict, Any, List
from datetime import datetime

from config.constants import (
    DYNAMODB_TABLE_ARTICLES_DEV,
    NEWS_BRIEFING_ID,
    NEWS_BRIEFING_MAX_AGE_HOURS,
)

logger = logging.getLogger(__name__)


def get_cached_briefing(mbti_group: str) -> Optional[str]:
    """Fetch the cached news briefing for the given MBTI group.
    Returns the briefing text if fresh, or None to fall back to article query."""
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

        briefing_key = f'briefing_{mbti_group}'
        briefing = item.get(briefing_key)
        if briefing:
            logger.info(f"Using cached briefing for {mbti_group} (generated: {generated_at})")
        return briefing

    except Exception as e:
        logger.warning(f"Failed to fetch cached briefing: {e}")
        return None


def _fetch_article_body(s3_body_uri: str, max_chars: int = 500) -> str:
    """Fetch article body from S3 and return truncated content_ko."""
    try:
        if not s3_body_uri or not s3_body_uri.startswith('s3://'):
            return ''
        parts = s3_body_uri.replace('s3://', '').split('/', 1)
        bucket, key = parts[0], parts[1]
        s3 = boto3.client('s3', region_name='ap-northeast-2')
        resp = s3.get_object(Bucket=bucket, Key=key)
        body = json.loads(resp['Body'].read().decode('utf-8'))
        content = body.get('content_ko', '')
        return content[:max_chars] if content else ''
    except Exception as e:
        logger.warning(f"Failed to fetch article body from S3: {e}")
        return ''


def get_recent_articles(limit: int = 5) -> List[Dict[str, Any]]:
    """Fetch recent articles with body content for context"""
    try:
        dynamodb = boto3.resource('dynamodb', region_name='us-east-1')
        table = dynamodb.Table(DYNAMODB_TABLE_ARTICLES_DEV)

        # Query recent articles from multiple categories
        from boto3.dynamodb.conditions import Key
        all_items = []
        for cat in ['경제', '정치', '사회', 'IT_과학']:
            try:
                response = table.query(
                    IndexName='category-published_at-index',
                    KeyConditionExpression=Key('category').eq(cat),
                    ScanIndexForward=False,
                    Limit=3
                )
                all_items.extend(response.get('Items', []))
            except Exception:
                continue

        # Sort by published_at descending, take top N
        all_items.sort(key=lambda x: x.get('published_at', ''), reverse=True)
        all_items = all_items[:limit]

        articles = []
        for item in all_items:
            content = _fetch_article_body(item.get('s3_body_uri', ''))
            articles.append({
                'news_id': item.get('news_id'),
                'title': item.get('title_ko', ''),
                'category': item.get('category', ''),
                'published_at': item.get('published_at', ''),
                'content': content,
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
    """Search DynamoDB for articles related to the user's message keywords."""
    try:
        keywords = [w for w in user_message.split() if len(w) >= 2 and w not in KOREAN_STOPWORDS][:5]
        if not keywords:
            return []

        dynamodb = boto3.resource('dynamodb', region_name='us-east-1')
        table = dynamodb.Table(DYNAMODB_TABLE_ARTICLES_DEV)
        from boto3.dynamodb.conditions import Key, Attr
        from datetime import timedelta, timezone

        kst = timezone(timedelta(hours=9))
        now = datetime.now(kst)
        week_ago = (now - timedelta(days=7)).isoformat()

        all_matches = []
        for cat in ['경제', '정치', '사회', 'IT_과학', '문화']:
            try:
                filter_expr = None
                for kw in keywords:
                    cond = Attr('title_ko').contains(kw)
                    filter_expr = cond if filter_expr is None else (filter_expr | cond)

                response = table.query(
                    IndexName='category-published_at-index',
                    KeyConditionExpression=Key('category').eq(cat) & Key('published_at').gte(week_ago),
                    FilterExpression=filter_expr,
                    ScanIndexForward=False,
                    Limit=20,
                )
                all_matches.extend(response.get('Items', []))
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
                    response = table.query(
                        IndexName='category-published_at-index',
                        KeyConditionExpression=Key('category').eq(cat) & Key('published_at').gte(week_ago),
                        ScanIndexForward=False,
                        Limit=2,
                    )
                    all_matches.extend(response.get('Items', []))
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
