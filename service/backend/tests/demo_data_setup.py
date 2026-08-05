#!/usr/bin/env python3
"""
Demo Data Setup — Prepare data for the 6/11 서울경제 최종 데모
================================================================
Creates sample data across all services to ensure the demo has
rich, realistic content to showcase.

What it creates:
  1. Demo user with reading history (30 articles across 7 days)
  2. Archived sentences (8 sentences from various articles)
  3. User profile with MBTI group, temperature, badges
  4. Verifies pipeline-generated articles exist (7 days)

Usage:
  python tests/demo_data_setup.py                # full setup
  python tests/demo_data_setup.py --cleanup      # remove demo data

Demo user: demo-user-sedaily
"""
import argparse
import asyncio
import json
import os
import sys
import uuid
from datetime import datetime, timezone, timedelta

import boto3

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from repositories.personal_repository import get_personal_repository
from models.personal import UserProfile, ReadingRecord, ArchivedSentence

REGION = os.getenv('AWS_REGION', 'us-east-1')
KST = timezone(timedelta(hours=9))
DEMO_USER = 'demo-user-sedaily'

SAMPLE_SENTENCES = [
    ('삼성전자가 1분기 영업이익 6조원을 기록하며 시장 기대를 상회했다.', '삼성전자 1분기 실적 발표'),
    ('AI 기술은 인간의 창의성을 대체하는 것이 아니라 증폭시키는 도구다.', 'AI 시대의 인간 창의성'),
    ('원달러 환율이 1,300원대에 안착하면서 수출기업 실적 개선이 기대된다.', '환율 안정과 수출 전망'),
    ('주식시장에서 가장 위험한 말은 "이번엔 다르다"이다.', '글로벌 증시 전망'),
    ('기후변화 대응은 더 이상 선택이 아닌 생존의 문제가 되었다.', '탄소중립과 에너지 전환'),
    ('반도체 수출이 3개월 연속 증가세를 보이며 경기 회복 신호를 보내고 있다.', '반도체 수출 호조'),
    ('청년 주거 문제는 경제적 이슈를 넘어 사회 구조적 문제로 확장되고 있다.', '청년 주거 실태'),
    ('디지털 경제 시대에 데이터는 21세기의 새로운 원유라고 불린다.', '데이터 경제와 개인정보'),
]


async def setup_demo_user():
    """Create demo user with rich profile data."""
    repo = get_personal_repository()

    print('  Creating demo user profile...')
    profile = UserProfile(
        user_id=DEMO_USER,
        email='demo@sedaily.com',
        name='데모 사용자',
        mbti_group='NT',
        temperature=68.5,
        badges=['first_login', 'reader_10', 'reader_50', 'streak_7', 'weekly_5'],
        title='분석의 달인',
    )
    await repo.save_user_profile(profile)
    print(f'    Profile: {DEMO_USER} ({profile.mbti_group}, temp={profile.temperature})')


async def setup_reading_history():
    """Create 30 reading records over 7 days."""
    repo = get_personal_repository()

    print('  Creating reading history...')

    # Get real article IDs from DynamoDB
    dynamodb = boto3.resource('dynamodb', region_name=REGION)
    table = dynamodb.Table('sedaily-mbti-articles-dev')
    from boto3.dynamodb.conditions import Key

    article_ids = []
    for cat in ['경제', 'IT_과학', '사회', '정치', '문화']:
        try:
            resp = table.query(
                IndexName='category-published_at-index',
                KeyConditionExpression=Key('category').eq(cat),
                ScanIndexForward=False,
                Limit=8,
            )
            for item in resp.get('Items', []):
                article_ids.append({
                    'id': item['news_id'],
                    'title': item.get('title_ko', f'Article {item["news_id"][:8]}'),
                    'cat': cat,
                })
        except Exception:
            pass

    if not article_ids:
        print('    [WARN] No articles in DynamoDB — using placeholder IDs')
        for i in range(30):
            article_ids.append({'id': f'DEMO_ART_{i:03d}', 'title': f'Demo Article {i}', 'cat': '경제'})

    now = datetime.now(KST)
    count = 0
    for i, art in enumerate(article_ids[:30]):
        days_ago = i // 5  # ~5 articles per day over 6 days
        read_at = (now - timedelta(days=days_ago, hours=i % 12)).isoformat()

        record = ReadingRecord(
            user_id=DEMO_USER,
            article_id=art['id'],
            article_title=art['title'],
            read_at=read_at,
        )
        await repo.save_reading_record(record)
        count += 1

    print(f'    {count} reading records created')


async def setup_archives():
    """Create 8 archived sentences."""
    repo = get_personal_repository()

    print('  Creating archived sentences...')

    now = datetime.now(KST)
    for i, (text, title) in enumerate(SAMPLE_SENTENCES):
        created = (now - timedelta(days=i // 3, hours=i * 2)).isoformat()
        sentence = ArchivedSentence(
            id=f'{DEMO_USER}-DEMO_ART_{i:03d}-{created[:15].replace(":", "")}',
            user_id=DEMO_USER,
            text=text,
            article_id=f'DEMO_ART_{i:03d}',
            article_title=title,
            created_at=created,
        )
        await repo.save_archived_sentence(sentence)

    print(f'    {len(SAMPLE_SENTENCES)} sentences archived')


def check_pipeline_articles():
    """Verify that pipeline-generated articles exist for recent days."""
    print('  Checking pipeline articles...')

    dynamodb = boto3.resource('dynamodb', region_name=REGION)
    table = dynamodb.Table('sedaily-mbti-articles-dev')
    from boto3.dynamodb.conditions import Key

    now = datetime.now(KST)
    results = {}

    for days_ago in range(7):
        date = (now - timedelta(days=days_ago)).strftime('%Y-%m-%d')
        try:
            resp = table.query(
                IndexName='category-published_at-index',
                KeyConditionExpression=Key('category').eq('경제') & Key('published_at').begins_with(date),
                Select='COUNT',
            )
            count = resp.get('Count', 0)
            results[date] = count
        except Exception:
            results[date] = 0

    for date, count in sorted(results.items()):
        status = '✓' if count > 0 else '✗'
        print(f'    {status} {date}: {count} articles')

    return results


def check_s3_bodies():
    """Check S3 article body bucket has files."""
    print('  Checking S3 article bodies...')

    s3 = boto3.client('s3', region_name=REGION)
    bucket = 'sedaily-mbti-article-body-dev'

    try:
        resp = s3.list_objects_v2(Bucket=bucket, Prefix='articles/', MaxKeys=10)
        count = resp.get('KeyCount', 0)
        total = resp.get('Contents', [])
        print(f'    S3 body files: {count}+ objects')
        return count
    except Exception as e:
        print(f'    [WARN] S3 check failed: {e}')
        return 0


async def cleanup():
    """Remove all demo user data."""
    print('  Cleaning up demo user data...')

    dynamodb = boto3.resource('dynamodb', region_name=REGION)
    table = dynamodb.Table(os.getenv('DYNAMODB_TABLE_PERSONAL', 'sedaily-mbti-personal-dev'))

    from boto3.dynamodb.conditions import Key
    resp = table.query(KeyConditionExpression=Key('user_id').eq(DEMO_USER))
    items = resp.get('Items', [])

    for item in items:
        table.delete_item(Key={'user_id': item['user_id'], 'sk': item['sk']})

    print(f'    Deleted {len(items)} items for {DEMO_USER}')


def main():
    parser = argparse.ArgumentParser(description='Demo data setup')
    parser.add_argument('--cleanup', action='store_true', help='Remove demo data')
    args = parser.parse_args()

    print('')
    print('=' * 60)
    print('  Demo Data Setup — 6/11 서울경제 최종 데모')
    print(f'  Demo user: {DEMO_USER}')
    print('=' * 60)
    print('')

    if args.cleanup:
        asyncio.run(cleanup())
        print('\nDone.')
        return

    # Setup user data
    asyncio.run(setup_demo_user())
    asyncio.run(setup_reading_history())
    asyncio.run(setup_archives())

    # Verify infrastructure
    print('')
    print('── Infrastructure Checks ──')
    print('')
    check_pipeline_articles()
    check_s3_bodies()

    print('')
    print('Done. Demo user ready: ' + DEMO_USER)
    print('')


if __name__ == '__main__':
    main()
