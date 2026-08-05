"""
News Briefing Generator Service
Generates MBTI-styled daily news briefings from collected articles.
Called after article_collector finishes to cache briefings for the chatbot.
"""
import json
import logging
from typing import Dict, Any, List
from datetime import datetime, timezone, timedelta

import boto3
from botocore.config import Config

from config.constants import (
    BEDROCK_MODEL_ID_SONNET,
    MBTI_GROUPS,
    ALL_CATEGORIES,
)

logger = logging.getLogger(__name__)

BEDROCK_CONFIG = Config(
    read_timeout=120,
    connect_timeout=30,
    retries={'max_attempts': 3}
)

BRIEFING_SYSTEM_PROMPT = """당신은 서울경제신문의 뉴스 브리핑 생성 AI입니다.
주어진 기사 목록을 바탕으로 4가지 MBTI 그룹(NT, NF, ST, SF)에 맞춘 오늘의 뉴스 브리핑을 생성하세요.

각 브리핑은 300~500자 내외로, 모든 카테고리의 핵심 뉴스를 포함해야 합니다.

## NT (분석가)
성격: 논리적이고 분석적인 사고를 좋아합니다. 핵심을 빠르게 파악하고 구조화해서 설명합니다. 데이터와 근거를 중시하며, 효율적인 커뮤니케이션을 선호합니다.
브리핑 방향: 핵심 데이터와 수치를 앞세워 구조화된 형태로 정리. 넘버링, 비교 분석, 인사이트 도출.
예시: "핵심 포인트 3가지로 정리해드릴게요. 첫째, ..."

## NF (이야기꾼)
성격: 성찰적이고 의미를 중시합니다. 사람과 가치에 관심이 많고, 큰 그림과 맥락을 잘 파악합니다. 공감과 이해를 중요하게 생각합니다.
브리핑 방향: 뉴스의 사회적 의미와 맥락을 중심으로 서술. 사람에게 미치는 영향, 가치 판단, 질문을 통한 사고 유도.
예시: "이 뉴스가 우리에게 시사하는 바가 있어요. 함께 생각해볼까요?"

## ST (실용주의자)
성격: 정확하고 체계적인 것을 좋아합니다. 사실과 데이터에 집중하며, 실용적인 정보를 중시합니다. 신뢰할 수 있는 정보 전달이 중요합니다.
브리핑 방향: 팩트 중심의 체계적 정리. 출처와 근거 명시, 실용적 시사점 도출.
예시: "확인된 사실을 정리하면 다음과 같습니다. ✓ 첫째..."

## SF (공감러)
성격: 친근하고 공감을 잘 합니다. 어려운 것도 쉽게 설명하며, 실생활과 연결해서 이야기합니다. 독자와의 소통을 즐깁니다.
브리핑 방향: 친구에게 설명하듯 쉽고 재미있게. 비유와 예시 활용, 실생활 관련성 강조.
예시: "쉽게 말하면요, 이건 우리 월급에 직접 영향을 주는 거예요"

반드시 아래 JSON 형식으로만 응답하세요:
{
  "briefing_NT": "...",
  "briefing_NF": "...",
  "briefing_ST": "...",
  "briefing_SF": "..."
}"""


class BriefingGenerator:
    """Generates cached news briefings for the chatbot."""

    def __init__(self, region: str = 'us-east-1'):
        self.client = boto3.client(
            'bedrock-runtime',
            region_name=region,
            config=BEDROCK_CONFIG,
        )

    def _build_articles_context(self, articles: List[Dict[str, Any]]) -> str:
        """Build article context grouped by category."""
        by_category: Dict[str, List[Dict]] = {}
        for article in articles:
            cat = article.get('category', '기타')
            by_category.setdefault(cat, []).append(article)

        lines = []
        for cat in ALL_CATEGORIES:
            cat_articles = by_category.get(cat, [])
            if not cat_articles:
                continue
            lines.append(f"\n## {cat}")
            for i, a in enumerate(cat_articles, 1):
                title = a.get('title_ko', '')
                # Extract key_points from any available MBTI version
                key_points = []
                for group in MBTI_GROUPS:
                    version = a.get(f'version_{group}', {})
                    if isinstance(version, dict) and version.get('key_points'):
                        key_points = version['key_points']
                        break
                kp_str = ' / '.join(key_points[:3]) if key_points else ''
                content_preview = a.get('content_ko', '')[:200] if not kp_str else ''
                lines.append(f"{i}. {title}")
                if kp_str:
                    lines.append(f"   핵심: {kp_str}")
                elif content_preview:
                    lines.append(f"   내용: {content_preview}")

        return '\n'.join(lines)

    async def generate_briefing(self, articles: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Generate 4 MBTI-styled briefings from the given articles.

        Args:
            articles: List of article dicts from DynamoDB (with version_NT etc.)

        Returns:
            Dict with briefing_NT, briefing_NF, briefing_ST, briefing_SF,
            plus metadata (generated_at, articles_count, source_articles, etc.)
        """
        kst = timezone(timedelta(hours=9))
        now_kst = datetime.now(kst)

        context = self._build_articles_context(articles)

        user_message = f"오늘 날짜: {now_kst.strftime('%Y년 %m월 %d일')}\n\n[수집된 기사 목록]{context}"

        request_body = json.dumps({
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 2048,
            "system": [
                {
                    "type": "text",
                    "text": BRIEFING_SYSTEM_PROMPT,
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            "messages": [
                {"role": "user", "content": user_message}
            ],
        })

        logger.info(f"Generating news briefing from {len(articles)} articles")

        response = self.client.invoke_model(
            modelId=BEDROCK_MODEL_ID_SONNET,
            contentType="application/json",
            accept="application/json",
            body=request_body,
        )

        response_body = json.loads(response['body'].read())
        raw_text = response_body.get('content', [{}])[0].get('text', '{}')

        # Parse JSON from response (handle markdown code blocks)
        cleaned = raw_text.strip()
        if cleaned.startswith('```'):
            cleaned = cleaned.split('\n', 1)[-1].rsplit('```', 1)[0].strip()

        briefings = json.loads(cleaned)

        # Build source article references
        source_articles = []
        for a in articles:
            source_articles.append({
                'news_id': a.get('news_id', ''),
                'title': a.get('title_ko', '')[:80],
                'category': a.get('category', ''),
            })

        # Collect categories covered
        categories_covered = list(set(a.get('category', '') for a in articles if a.get('category')))

        usage = response_body.get('usage', {})

        result = {
            'briefing_NT': briefings.get('briefing_NT', ''),
            'briefing_NF': briefings.get('briefing_NF', ''),
            'briefing_ST': briefings.get('briefing_ST', ''),
            'briefing_SF': briefings.get('briefing_SF', ''),
            'generated_at': now_kst.isoformat(),
            'date': now_kst.strftime('%Y-%m-%d'),
            'articles_count': len(articles),
            'source_articles': source_articles,
            'categories_covered': categories_covered,
            'generation_usage': {
                'input_tokens': usage.get('input_tokens', 0),
                'output_tokens': usage.get('output_tokens', 0),
            },
        }

        logger.info(
            f"News briefing generated: {len(articles)} articles, "
            f"{len(categories_covered)} categories, "
            f"tokens: {usage.get('input_tokens', 0)}+{usage.get('output_tokens', 0)}"
        )

        return result
