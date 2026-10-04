"""
Article Collector Lambda Function
Collects Seoul Economic articles from S3 XML and saves them to DynamoDB.

Data Source: S3 XML (s3://sedaily-news-xml-storage/daily-xml/)
Storage: DynamoDB (sedaily-mbti-articles-dev)

2026-08-24 — 실제 수집 로직(S3 XML fetch·중복/변경 감지·DynamoDB 저장·
article_data 조립)은 services/article_collection_service.py로 뺐다(코드
리팩토링 감사 Track B, God 파일 분해). 이 파일은 이제 EventBridge 트리거
진입점만 담당한다.
"""
import logging
import asyncio

from services.articles.collection import collect_articles

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


def lambda_handler(event: dict, context) -> dict:
    """
    AWS Lambda handler for scheduled article collection.
    Triggered by EventBridge on schedule.
    """
    logger.info(f"Article collection triggered: {event}")
    result = asyncio.run(collect_articles(24, event=event))
    # Reflect collection failure in the HTTP status so any non-EventBridge
    # caller (or future API Gateway wiring) can detect it. Previously this
    # always returned 200 even when `collect_articles` had raised internally
    # and produced `{"status": "error", ...}`.
    status_code = 500 if isinstance(result, dict) and result.get("status") == "error" else 200
    return {
        "statusCode": status_code,
        "body": result,
    }
