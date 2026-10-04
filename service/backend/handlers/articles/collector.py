"""
Article Collector Lambda Function
Collects Seoul Economic articles from S3 XML and saves them to DynamoDB.

Data Source: S3 XML (s3://sedaily-news-xml-storage/daily-xml/)
Storage: DynamoDB (sedaily-mbti-articles-dev)

수집 로직(S3 XML 조회, 중복·변경 감지, DynamoDB 저장)은 services/articles/collection.py 에
있으며, 이 파일은 EventBridge 트리거 진입점만 담당한다.
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
    # 수집 실패(status == "error")를 HTTP 상태 코드에 반영해 EventBridge 외 호출자도 감지할 수 있게 한다.
    status_code = 500 if isinstance(result, dict) and result.get("status") == "error" else 200
    return {
        "statusCode": status_code,
        "body": result,
    }
