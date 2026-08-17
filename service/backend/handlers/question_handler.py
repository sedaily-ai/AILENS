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
from typing import List
from datetime import datetime, timezone, timedelta

import boto3
from boto3.dynamodb.conditions import Key
from botocore.config import Config

from config import settings
from config.constants import (
    BEDROCK_MODEL_ID_HAIKU,
    DYNAMODB_TABLE_ARTICLES_DEV,
)
from services.prompt_loader import load_prompt
from common.feature_flag import is_enabled
from core.decorators import lambda_handler as handler_decorator
from core.response import error_response, success_response

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

KST = timezone(timedelta(hours=9))
BEDROCK_CONFIG = Config(read_timeout=60, connect_timeout=10, retries={'max_attempts': 2})

QUESTIONS_USER_ID = '__questions__'


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
                KeyConditionExpression=Key('category').eq(cat)
                    & Key('published_at').begins_with(date_prefix),
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
            })
        valid.append(normalized)

    return valid


# ── Lambda entry point ───────────────────────────────────────────────────────

@handler_decorator
def lambda_handler(event: dict, context) -> dict:
    """
    Routes:
        GET  /api/questions?date=YYYYMMDD  — Get (or generate) daily questions
        POST /api/questions                — Save user answer
        OPTIONS                            — CORS preflight
    """
    if event.get('source') == 'aws.events' or event.get('warmup'):
        return success_response({'status': 'warm'})

    rc = event.get('requestContext', {})
    if 'http' in rc:
        method = rc['http'].get('method', 'GET')
    else:
        method = event.get('httpMethod', 'GET')

    params = event.get('queryStringParameters') or {}

    if method == 'OPTIONS':
        return success_response({'message': 'OK'})

    if not is_enabled("question"):
        return error_response("question disabled by admin", status_code=503)

    # GET /api/questions?date=YYYYMMDD
    if method == 'GET':
        date_str = params.get('date', datetime.now(KST).strftime('%Y%m%d'))

        # Check cache
        cached = _get_cached_questions(date_str)
        if cached:
            return success_response({'questions': cached, 'source': 'cache'})

        # Generate from today's articles
        titles = _fetch_article_titles(date_str)
        if not titles:
            return success_response({'questions': [], 'source': 'no_articles'})

        questions = _generate_questions(titles)
        if questions:
            _save_questions(date_str, questions)

        return success_response({'questions': questions, 'source': 'generated'})

    # POST /api/questions — save answer
    if method == 'POST':
        body = json.loads(event.get('body', '{}'))
        user_id = body.get('user_id', '')
        question_id = body.get('question_id', '')
        option_id = body.get('option_id', '')

        if not user_id or not question_id:
            return error_response("user_id and question_id are required", status_code=400)

        # Store in personal DB
        date_str = datetime.now(KST).strftime('%Y%m%d')
        _get_personal_table().put_item(Item={
            'user_id': user_id,
            'sk': f'ANSWER#{date_str}#{question_id}',
            'question_id': question_id,
            'option_id': option_id,
            'answered_at': datetime.now(KST).isoformat(),
        })

        return success_response({'saved': True})

    return error_response("Method not allowed", status_code=405)
