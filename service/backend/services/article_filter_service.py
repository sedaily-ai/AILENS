"""
Article Filter Service
Filters out articles that are not suitable for MBTI transformation.

Exclusion criteria:
- 속보 (Breaking news - simple fact reporting)
- 사건/사고 (Accidents, incidents)
- 인사 발령/교체 (Personnel appointments)
- 부고/동정 (Obituaries, condolences)
- 반복성 기사 (Repetitive articles like daily stock closings)
- 짧은 기사 (Articles under 300 characters)
"""
import logging
import json
import re
from typing import List, Dict, Any, Tuple
from dataclasses import dataclass

import boto3
from botocore.config import Config

from config.constants import BEDROCK_MODEL_ID_HAIKU, BEDROCK_REGION

logger = logging.getLogger(__name__)

# Boto3 config for Bedrock
BEDROCK_CONFIG = Config(
    read_timeout=60,
    connect_timeout=30,
    retries={'max_attempts': 2}
)

# Minimum content length for MBTI transformation
MIN_CONTENT_LENGTH = 300

# Keywords that indicate exclusion (pre-filter before AI)
EXCLUSION_KEYWORDS = [
    # 인사 관련
    '인사', '발령', '승진', '임명', '취임', '사퇴', '퇴임',
    # 부고/동정
    '부고', '별세', '타계', '영결식', '조문',
    # 사건/사고
    '사망', '숨져', '숨진', '사고', '추락', '화재', '폭발',
    # 속보성
    '속보', '1보', '2보', '3보',
]

# Title patterns that indicate exclusion
EXCLUSION_TITLE_PATTERNS = [
    r'^\[인사\]',
    r'^\[부고\]',
    r'^\[속보\]',
    r'^\[\d보\]',  # [1보], [2보] etc
    r'증시.*마감',
    r'환율.*마감',
    r'유가.*마감',
]


@dataclass
class FilterResult:
    """Result of article filtering"""
    news_id: str
    title: str
    should_exclude: bool
    reason: str
    category: str


class ArticleFilterService:
    """
    Service for filtering articles before MBTI transformation.
    Uses a combination of rule-based and AI-based filtering.
    """

    def __init__(self, region: str = BEDROCK_REGION):
        self.bedrock_client = boto3.client(
            'bedrock-runtime',
            region_name=region,
            config=BEDROCK_CONFIG
        )
        self.model_id = BEDROCK_MODEL_ID_HAIKU

    def _quick_filter(self, title: str, content: str) -> Tuple[bool, str]:
        """
        Quick rule-based filtering before AI.
        Returns (should_exclude, reason)
        """
        # Check content length
        if len(content) < MIN_CONTENT_LENGTH:
            return True, "too_short"

        # Check title patterns
        for pattern in EXCLUSION_TITLE_PATTERNS:
            if re.search(pattern, title):
                return True, f"title_pattern:{pattern}"

        # Check keywords in title (stricter)
        title_lower = title.lower()
        for keyword in ['인사', '부고', '속보', '발령']:
            if keyword in title_lower:
                return True, f"title_keyword:{keyword}"

        return False, ""

    async def filter_articles(
        self,
        articles: List[Dict[str, Any]],
        category: str
    ) -> Tuple[List[Dict[str, Any]], List[FilterResult]]:
        """
        Filter articles for a specific category.

        Args:
            articles: List of article dicts with 'nsid', 'title', 'content_clean'
            category: Category name

        Returns:
            Tuple of (filtered_articles, filter_results)
        """
        if not articles:
            return [], []

        filtered_articles = []
        filter_results = []

        # Step 1: Quick rule-based filter
        candidates = []
        for article in articles:
            title = article.title if hasattr(article, 'title') else article.get('title', '')
            content = article.content_clean if hasattr(article, 'content_clean') else article.get('content_clean', '')
            nsid = article.nsid if hasattr(article, 'nsid') else article.get('nsid', '')

            should_exclude, reason = self._quick_filter(title, content)

            if should_exclude:
                filter_results.append(FilterResult(
                    news_id=nsid,
                    title=title[:50],
                    should_exclude=True,
                    reason=reason,
                    category=category
                ))
                logger.info(f"Quick filter excluded: {nsid} - {reason}")
            else:
                candidates.append(article)

        # Step 2: AI-based filter for remaining candidates
        if candidates and len(candidates) > 3:
            # Only use AI if we have many candidates
            ai_excluded = await self._ai_filter(candidates, category)

            for article in candidates:
                nsid = article.nsid if hasattr(article, 'nsid') else article.get('nsid', '')
                title = article.title if hasattr(article, 'title') else article.get('title', '')

                if nsid in ai_excluded:
                    filter_results.append(FilterResult(
                        news_id=nsid,
                        title=title[:50],
                        should_exclude=True,
                        reason=ai_excluded[nsid],
                        category=category
                    ))
                    logger.info(f"AI filter excluded: {nsid} - {ai_excluded[nsid]}")
                else:
                    filtered_articles.append(article)
                    filter_results.append(FilterResult(
                        news_id=nsid,
                        title=title[:50],
                        should_exclude=False,
                        reason="passed",
                        category=category
                    ))
        else:
            # Few candidates - keep all
            for article in candidates:
                nsid = article.nsid if hasattr(article, 'nsid') else article.get('nsid', '')
                title = article.title if hasattr(article, 'title') else article.get('title', '')
                filtered_articles.append(article)
                filter_results.append(FilterResult(
                    news_id=nsid,
                    title=title[:50],
                    should_exclude=False,
                    reason="passed",
                    category=category
                ))

        logger.info(f"Category {category}: {len(articles)} -> {len(filtered_articles)} articles after filtering")
        return filtered_articles, filter_results

    async def _ai_filter(
        self,
        articles: List[Dict[str, Any]],
        category: str
    ) -> Dict[str, str]:
        """
        Use AI to filter articles.
        Returns dict of {news_id: exclusion_reason} for excluded articles.
        """
        # Build article list for AI
        article_list = []
        for i, article in enumerate(articles):
            title = article.title if hasattr(article, 'title') else article.get('title', '')
            content = article.content_clean if hasattr(article, 'content_clean') else article.get('content_clean', '')
            nsid = article.nsid if hasattr(article, 'nsid') else article.get('nsid', '')

            # Truncate content for efficiency
            content_preview = content[:200] if content else ''
            article_list.append(f"{i+1}. [{nsid}] {title}\n   {content_preview}...")

        prompt = f"""다음 {category} 카테고리 기사 목록을 검토하고, MBTI 뉴스 서비스에 적합하지 않은 기사를 식별하세요.

제외 기준:
- 속보/단신: 단순 사실 전달만 있는 기사
- 사건/사고: 교통사고, 화재, 범죄 등
- 인사/발령: 임명, 승진, 사퇴 등
- 부고/동정: 사망, 조문 등
- 반복성: 매일 반복되는 시황 기사 (증시 마감, 환율 마감 등)
- 홍보성: 광고성 기사, 기업 보도자료

기사 목록:
{chr(10).join(article_list)}

JSON 형식으로 제외할 기사만 출력하세요:
{{"excluded": [{{"id": "뉴스ID", "reason": "제외사유"}}]}}

제외할 기사가 없으면: {{"excluded": []}}"""

        try:
            import asyncio

            request_body = json.dumps({
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": 1024,
                "messages": [
                    {"role": "user", "content": prompt}
                ]
            })

            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                None,
                lambda: self.bedrock_client.invoke_model(
                    modelId=self.model_id,
                    contentType="application/json",
                    accept="application/json",
                    body=request_body
                )
            )

            response_body = json.loads(response['body'].read())
            response_text = response_body.get("content", [{}])[0].get("text", "")

            # Parse JSON response
            json_match = re.search(r'\{[\s\S]*\}', response_text)
            if json_match:
                result = json.loads(json_match.group(0))
                excluded = result.get("excluded", [])
                return {item["id"]: item["reason"] for item in excluded}

        except Exception as e:
            logger.error(f"AI filter error: {e}")

        return {}


# Singleton instance
_filter_service = None


def get_filter_service() -> ArticleFilterService:
    """Get or create singleton ArticleFilterService instance."""
    global _filter_service
    if _filter_service is None:
        _filter_service = ArticleFilterService()
    return _filter_service
