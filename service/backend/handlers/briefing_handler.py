"""
News Briefing Generator Lambda Function
Generates MBTI-styled daily news briefings and caches them for the chatbot.

Runs independently from article_collector — can be triggered by:
  - EventBridge schedule (e.g., every 1-2 hours)
  - EventBridge rule chained after article_collector completes
  - Manual invocation

Reads the latest transformed articles from DynamoDB across ALL categories,
generates 4 MBTI-styled briefings via Claude Haiku, and stores them as a
single cached item (news_briefing_latest) for the chatbot to read.
"""
import logging
import json
import asyncio
from datetime import datetime, timezone, timedelta

import boto3
from boto3.dynamodb.conditions import Key

from clients.dynamodb_client import DynamoDBClient
from services.briefing_generator import BriefingGenerator
from config.constants import (
    CORS_HEADERS,
    DYNAMODB_TABLE_ARTICLES_DEV,
    ALL_CATEGORIES,
    CATEGORY_SEARCH_ALIASES,
    GSI_CATEGORY_DATE,
)

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


def _fetch_s3_body(s3_body_uri: str) -> dict:
    """Fetch article body JSON from S3."""
    try:
        if not s3_body_uri or not s3_body_uri.startswith('s3://'):
            return {}
        parts = s3_body_uri.replace('s3://', '').split('/', 1)
        s3 = boto3.client('s3', region_name='ap-northeast-2')
        resp = s3.get_object(Bucket=parts[0], Key=parts[1])
        return json.loads(resp['Body'].read().decode('utf-8'))
    except Exception as e:
        logger.warning(f"Failed to fetch S3 body: {e}")
        return {}


def fetch_recent_transformed_articles(limit_per_category: int = 3) -> list:
    """
    Fetch recent articles from DynamoDB, enriched with S3 body content.
    Includes articles that have content_ko or MBTI versions in S3.
    """
    dynamodb = boto3.resource('dynamodb', region_name='us-east-1')
    table = dynamodb.Table(DYNAMODB_TABLE_ARTICLES_DEV)

    all_articles = []
    seen_ids = set()

    for category in ALL_CATEGORIES:
        aliases = CATEGORY_SEARCH_ALIASES.get(category, [category])

        for alias in aliases:
            try:
                response = table.query(
                    IndexName=GSI_CATEGORY_DATE,
                    KeyConditionExpression=Key('category').eq(alias),
                    ScanIndexForward=False,
                    Limit=limit_per_category,
                )

                for item in response.get('Items', []):
                    news_id = item.get('news_id', '')
                    if news_id in seen_ids:
                        continue

                    # Fetch body from S3
                    s3_uri = item.get('s3_body_uri', '')
                    if s3_uri:
                        body = _fetch_s3_body(s3_uri)
                        item['content_ko'] = body.get('content_ko', '')[:500]
                        for g in ['NT', 'NF', 'ST', 'SF']:
                            ver = body.get(f'version_{g}')
                            if isinstance(ver, dict):
                                item[f'version_{g}'] = ver

                    if not item.get('content_ko') and not item.get('title_ko'):
                        continue

                    seen_ids.add(news_id)
                    all_articles.append(item)

                    if len([a for a in all_articles if a.get('category') == alias]) >= limit_per_category:
                        break

            except Exception as e:
                logger.warning(f"Failed to query category '{alias}': {e}")

    logger.info(f"Fetched {len(all_articles)} articles across {len(ALL_CATEGORIES)} categories")
    return all_articles


async def generate_and_save_briefing() -> dict:
    """Main logic: fetch articles, generate briefing, save to DynamoDB."""
    articles = fetch_recent_transformed_articles(limit_per_category=3)

    if not articles:
        return {
            'generated': False,
            'reason': 'No transformed articles found',
        }

    briefing_gen = BriefingGenerator(region='us-east-1')
    briefing_data = await briefing_gen.generate_briefing(articles)

    dynamodb_client = DynamoDBClient()
    saved = await dynamodb_client.save_news_briefing(briefing_data)

    return {
        'generated': saved,
        'articles_count': len(articles),
        'categories': briefing_data.get('categories_covered', []),
        'generated_at': briefing_data.get('generated_at', ''),
        'usage': briefing_data.get('generation_usage', {}),
    }


def lambda_handler(event: dict, context) -> dict:
    """
    Lambda handler for news briefing generation.

    Can be invoked by:
      - EventBridge scheduled rule
      - EventBridge event from article_collector completion
      - Direct invocation (for testing)

    Response:
    {
        "status": "success",
        "generated": true,
        "articles_count": 11,
        "categories": ["경제", "IT_과학", ...],
        "generated_at": "2026-04-06T14:30:00+09:00"
    }
    """
    try:
        # Handle HTTP API (if exposed as API endpoint)
        request_context = event.get('requestContext', {})
        if 'http' in request_context:
            http_method = request_context['http'].get('method', 'GET')
        else:
            http_method = event.get('httpMethod', None)

        if http_method == 'OPTIONS':
            return {
                'statusCode': 200,
                'headers': CORS_HEADERS,
                'body': '',
            }

        logger.info("Starting news briefing generation")

        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            result = loop.run_until_complete(generate_and_save_briefing())
        finally:
            loop.close()

        response_body = {
            'status': 'success',
            **result,
        }

        logger.info(f"Briefing generation complete: {result}")

        # If called via HTTP API, return HTTP response
        if http_method:
            return {
                'statusCode': 200,
                'headers': CORS_HEADERS,
                'body': json.dumps(response_body, ensure_ascii=False),
            }

        # If called by EventBridge/direct invocation, return plain dict
        return response_body

    except Exception as e:
        logger.error(f"Briefing generation failed: {e}", exc_info=True)

        error_body = {
            'status': 'error',
            'error': str(e)[:300],
        }

        if event.get('httpMethod') or 'http' in event.get('requestContext', {}):
            return {
                'statusCode': 500,
                'headers': CORS_HEADERS,
                'body': json.dumps(error_body, ensure_ascii=False),
            }

        return error_body
