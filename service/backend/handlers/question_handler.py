"""
Daily Question Handler Lambda Function
Generates AI-powered daily questions based on today's news articles.

Questions are generated on-demand (first GET request for a date triggers
Claude generation) and cached in the Personal DB table.

Storage: Personal DB (sedaily-mbti-personal-dev)
  PK: __questions__    SK: DATE#YYYYMMDD
"""
import json
import logging
import asyncio
from typing import Dict, Any, List
from datetime import datetime, timezone, timedelta

import boto3
from botocore.config import Config

from config import settings
from config.constants import (
    CORS_HEADERS,
    BEDROCK_MODEL_ID_HAIKU,
    DYNAMODB_TABLE_ARTICLES_DEV,
)
from services.prompt_loader import load_prompt
from common.feature_flag import is_enabled

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

KST = timezone(timedelta(hours=9))
BEDROCK_CONFIG = Config(read_timeout=60, connect_timeout=10, retries={'max_attempts': 2})

QUESTIONS_USER_ID = '__questions__'


def _cors(status_code: int, body: Any) -> dict:
    return {
        'statusCode': status_code,
        'headers': CORS_HEADERS,
        'body': json.dumps(body, ensure_ascii=False, default=str),
    }


# ── Personal DB access ──────────────────────────────────────────────────────

_personal_table = None

def _get_personal_table():
    global _personal_table
    if _personal_table is None:
        _personal_table = boto3.resource(
            'dynamodb', region_name='us-east-1'
        ).Table(settings.dynamodb_table_personal)
    return _personal_table


def _get_cached_questions(date_str: str) -> list | None:
    """Return cached questions for a date, or None if not generated yet."""
    try:
        resp = _get_personal_table().get_item(
            Key={'user_id': QUESTIONS_USER_ID, 'sk': f'DATE#{date_str}'}
        )
        item = resp.get('Item')
        if item and item.get('questions'):
            return json.loads(item['questions']) if isinstance(item['questions'], str) else item['questions']
    except Exception as e:
        logger.error(f"Failed to read cached questions: {e}")
    return None


def _save_questions(date_str: str, questions: list):
    """Cache generated questions for a date."""
    try:
        _get_personal_table().put_item(Item={
            'user_id': QUESTIONS_USER_ID,
            'sk': f'DATE#{date_str}',
            'questions': json.dumps(questions, ensure_ascii=False),
            'generated_at': datetime.now(KST).isoformat(),
            'question_count': len(questions),
        })
    except Exception as e:
        logger.error(f"Failed to save questions: {e}")


# ── Article fetching ─────────────────────────────────────────────────────────

def _fetch_article_titles(date_str: str) -> List[str]:
    """Fetch today's article titles via the category-published_at GSI."""
    from config.constants import CATEGORIES_KOREAN
    date_prefix = f"{date_str[:4]}-{date_str[4:6]}-{date_str[6:8]}"

    try:
        table = boto3.resource('dynamodb', region_name='us-east-1').Table(
            DYNAMODB_TABLE_ARTICLES_DEV
        )
        titles: List[str] = []
        # Query each category via the GSI to collect titles across categories
        for cat in CATEGORIES_KOREAN:
            resp = table.query(
                IndexName='category-published_at-index',
                KeyConditionExpression=boto3.dynamodb.conditions.Key('category').eq(cat)
                    & boto3.dynamodb.conditions.Key('published_at').begins_with(date_prefix),
                ProjectionExpression='title_ko',
                Limit=10,
            )
            for item in resp.get('Items', []):
                if item.get('title_ko'):
                    titles.append(item['title_ko'])

        logger.info(f"Fetched {len(titles)} article titles for {date_str}")
        return titles[:30]
    except Exception as e:
        logger.error(f"Failed to fetch article titles: {e}")
        return []


# ── Claude generation ────────────────────────────────────────────────────────

def _generate_questions(titles: List[str]) -> list:
    """Generate 3 daily questions from article titles using Claude."""
    prompt_template = load_prompt('question', 'daily_question')

    titles_text = '\n'.join(f"- {t}" for t in titles)
    user_message = f"{prompt_template}\n\n오늘의 기사 제목 목록:\n{titles_text}"

    bedrock = boto3.client('bedrock-runtime', region_name='us-east-1', config=BEDROCK_CONFIG)

    body = json.dumps({
        'anthropic_version': 'bedrock-2023-05-31',
        'max_tokens': 2048,
        'messages': [{'role': 'user', 'content': user_message}],
    })

    response = bedrock.invoke_model(
        modelId=BEDROCK_MODEL_ID_HAIKU,
        contentType='application/json',
        accept='application/json',
        body=body,
    )

    resp = json.loads(response['body'].read())
    text = resp.get('content', [{}])[0].get('text', '')

    # Parse JSON array from response
    import re
    json_match = re.search(r'\[[\s\S]*\]', text)
    if not json_match:
        logger.error(f"No JSON array found in Claude response: {text[:200]}")
        return []

    questions = json.loads(json_match.group(0))

    # Validate and normalize
    valid = []
    for q in questions[:3]:
        if not q.get('question') or not q.get('options'):
            continue
        qi = len(valid) + 1
        normalized = {
            'id': f'q_ai_{qi}',
            'question': q['question'],
            'subtitle': q.get('subtitle', ''),
            'options': [],
        }
        for j, opt in enumerate(q.get('options', [])[:4]):
            normalized['options'].append({
                'id': f'opt_{qi}_{j+1}',
                'label': opt.get('label', ''),
                'desc': opt.get('desc', ''),
                'mbti': opt.get('mbti', ['NT', 'NF', 'ST', 'SF'][j]),
            })
        valid.append(normalized)

    return valid


# ── Lambda entry point ───────────────────────────────────────────────────────

def lambda_handler(event: dict, context) -> dict:
    """
    Routes:
        GET  /api/questions?date=YYYYMMDD  — Get (or generate) daily questions
        POST /api/questions                — Save user answer
        OPTIONS                            — CORS preflight
    """
    try:
        if event.get('source') == 'aws.events' or event.get('warmup'):
            return _cors(200, {'status': 'warm'})

        rc = event.get('requestContext', {})
        if 'http' in rc:
            method = rc['http'].get('method', 'GET')
        else:
            method = event.get('httpMethod', 'GET')

        params = event.get('queryStringParameters') or {}

        if method == 'OPTIONS':
            return _cors(200, {'message': 'OK'})

        if not is_enabled("question"):
            return {
                "statusCode": 503,
                "headers": {**CORS_HEADERS, "Content-Type": "application/json"},
                "body": json.dumps({"error": "question disabled by admin"}),
            }

        # GET /api/questions?date=YYYYMMDD
        if method == 'GET':
            date_str = params.get('date', datetime.now(KST).strftime('%Y%m%d'))

            # Check cache
            cached = _get_cached_questions(date_str)
            if cached:
                return _cors(200, {'questions': cached, 'source': 'cache'})

            # Generate from today's articles
            titles = _fetch_article_titles(date_str)
            if not titles:
                return _cors(200, {'questions': [], 'source': 'no_articles'})

            questions = _generate_questions(titles)
            if questions:
                _save_questions(date_str, questions)

            return _cors(200, {'questions': questions, 'source': 'generated'})

        # POST /api/questions — save answer
        if method == 'POST':
            body = json.loads(event.get('body', '{}'))
            user_id = body.get('user_id', '')
            question_id = body.get('question_id', '')
            option_id = body.get('option_id', '')
            mbti = body.get('mbti', '')

            if not user_id or not question_id:
                return _cors(400, {'error': 'user_id and question_id are required'})

            # Store in personal DB
            date_str = datetime.now(KST).strftime('%Y%m%d')
            _get_personal_table().put_item(Item={
                'user_id': user_id,
                'sk': f'ANSWER#{date_str}#{question_id}',
                'question_id': question_id,
                'option_id': option_id,
                'mbti': mbti,
                'answered_at': datetime.now(KST).isoformat(),
            })

            return _cors(200, {'saved': True})

        return _cors(405, {'error': 'Method not allowed'})

    except Exception as e:
        logger.error(f"Question handler error: {e}", exc_info=True)
        return _cors(500, {'error': 'Internal server error'})
