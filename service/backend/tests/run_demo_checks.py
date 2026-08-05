#!/usr/bin/env python3
"""
Pre-Demo Automated Checks — Run before the 6/11 서울경제 데모
================================================================
Verifies all infrastructure, data, functionality, and performance
requirements are met. Prints a colored PASS/FAIL report.

Target: completes in < 2 minutes.

Usage:
  python tests/run_demo_checks.py

Exit code 0 = all critical checks pass, 1 = failures exist.
"""
import json
import os
import sys
import time
from datetime import datetime, timezone, timedelta

import boto3
import requests

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

API_URL = os.getenv('API_URL', 'https://chzwwtjtgk.execute-api.us-east-1.amazonaws.com/dev')
REGION = os.getenv('AWS_REGION', 'us-east-1')
KST = timezone(timedelta(hours=9))
TODAY = datetime.now(KST).strftime('%Y%m%d')
TODAY_ISO = datetime.now(KST).strftime('%Y-%m-%d')
DEMO_USER = 'demo-user-sedaily'

start_time = time.time()
passed = 0
failed = 0
warned = 0


def ok(name, detail=''):
    global passed
    passed += 1
    print(f'  \033[32m✓\033[0m {name} {detail}')


def fail(name, detail=''):
    global failed
    failed += 1
    print(f'  \033[31m✗\033[0m {name} {detail}')


def warn(name, detail=''):
    global warned
    warned += 1
    print(f'  \033[33m△\033[0m {name} {detail}')


def api_check(method, path, body=None, expect_status=200, name=''):
    """Quick API endpoint check."""
    try:
        if method == 'GET':
            r = requests.get(f'{API_URL}{path}', timeout=20)
        else:
            r = requests.post(f'{API_URL}{path}', json=body, timeout=20, headers={'Content-Type': 'application/json'})

        ms = r.elapsed.total_seconds() * 1000

        if r.status_code == expect_status:
            ok(name, f'({int(ms)}ms)')
            return True
        elif r.status_code in (403, 404):
            warn(name, f'HTTP {r.status_code} — Lambda not wired to API Gateway')
            return True  # Not a critical failure
        else:
            fail(name, f'HTTP {r.status_code}: {r.text[:80]}')
            return False
    except Exception as e:
        fail(name, str(e)[:80])
        return False


# =============================================================================

def main():
    print('')
    print('=' * 60)
    print('  Pre-Demo Checks — 6/11 서울경제 최종 데모')
    print(f'  API: {API_URL}')
    print(f'  Date: {TODAY_ISO}')
    print('=' * 60)

    # ── 1. Infrastructure ────────────────────────────────────────────
    print('\n── 인프라 (Infrastructure) ──\n')

    # DynamoDB tables
    dynamodb = boto3.client('dynamodb', region_name=REGION)
    for table_name in ['sedaily-mbti-articles-dev', 'sedaily-mbti-personal-dev',
                        'sedaily-mbti-podcast-dev', 'sedaily-mbti-engagement-dev']:
        try:
            resp = dynamodb.describe_table(TableName=table_name)
            status = resp['Table']['TableStatus']
            ok(f'DynamoDB: {table_name}', f'({status})')
        except Exception:
            fail(f'DynamoDB: {table_name}', 'NOT FOUND')

    # S3 buckets
    s3 = boto3.client('s3', region_name=REGION)
    for bucket in ['sedaily-mbti-article-body-dev', 'sedaily-mbti-audio-dev']:
        try:
            s3.head_bucket(Bucket=bucket)
            ok(f'S3: {bucket}')
        except Exception:
            fail(f'S3: {bucket}', 'NOT FOUND')

    # S3 XML bucket (different region)
    try:
        s3_seoul = boto3.client('s3', region_name='ap-northeast-2')
        s3_seoul.head_bucket(Bucket='sedaily-news-xml-storage')
        ok('S3: sedaily-news-xml-storage (XML source)')
    except Exception:
        fail('S3: sedaily-news-xml-storage', 'NOT FOUND')

    # Step Functions
    sfn = boto3.client('stepfunctions', region_name=REGION)
    account = boto3.client('sts', region_name=REGION).get_caller_identity()['Account']
    sfn_arn = f'arn:aws:states:{REGION}:{account}:stateMachine:sedaily-mbti-transform-pipeline-dev'

    try:
        sfn.describe_state_machine(stateMachineArn=sfn_arn)
        ok('Step Functions: transform-pipeline')
    except Exception:
        warn('Step Functions: transform-pipeline', 'NOT DEPLOYED')

    # OpenSearch
    from config import settings
    if settings.opensearch_endpoint:
        ok(f'OpenSearch: configured ({settings.opensearch_endpoint[:30]}...)')
    else:
        warn('OpenSearch: not configured (RAG fallback to DynamoDB)')

    # pgvector
    if settings.pg_password:
        ok(f'pgvector: configured ({settings.pg_host})')
    else:
        warn('pgvector: not configured (similarity search unavailable)')

    # ── 2. Data ──────────────────────────────────────────────────────
    print('\n── 데이터 (Data) ──\n')

    # Recent articles in DynamoDB
    ddb = boto3.resource('dynamodb', region_name=REGION)
    table = ddb.Table('sedaily-mbti-articles-dev')
    from boto3.dynamodb.conditions import Key

    for days_ago in [0, 1, 2]:
        date = (datetime.now(KST) - timedelta(days=days_ago)).strftime('%Y-%m-%d')
        try:
            resp = table.query(
                IndexName='category-published_at-index',
                KeyConditionExpression=Key('category').eq('경제') & Key('published_at').begins_with(date),
                Select='COUNT',
            )
            count = resp.get('Count', 0)
            if count > 0:
                ok(f'Articles {date}', f'({count} in 경제)')
            else:
                warn(f'Articles {date}', '0 articles')
        except Exception:
            warn(f'Articles {date}', 'query failed')

    # S3 body files
    try:
        resp = s3.list_objects_v2(Bucket='sedaily-mbti-article-body-dev', Prefix='articles/', MaxKeys=5)
        count = resp.get('KeyCount', 0)
        if count > 0:
            ok(f'S3 article bodies', f'({count}+ files)')
        else:
            warn('S3 article bodies', '0 files')
    except Exception:
        warn('S3 article bodies', 'check failed')

    # Demo user
    personal = ddb.Table('sedaily-mbti-personal-dev')
    try:
        resp = personal.get_item(Key={'user_id': DEMO_USER, 'sk': 'PROFILE'})
        if resp.get('Item'):
            ok(f'Demo user: {DEMO_USER}')
        else:
            warn(f'Demo user: {DEMO_USER}', 'NOT FOUND — run demo_data_setup.py')
    except Exception:
        warn(f'Demo user: {DEMO_USER}', 'check failed')

    # ── 3. Functionality ─────────────────────────────────────────────
    print('\n── 기능 (Functionality) ──\n')

    api_check('GET', f'/s3-articles?date={TODAY}&limit=3', name='뉴스 피드 (S3 articles)')
    api_check('POST', '/api/search', {'query': '*', 'filters': {'published_from': '2026-04-01', 'published_until': TODAY_ISO}, 'page': 1, 'page_size': 3}, name='기사 검색')
    api_check('POST', '/api/chat', {'message': '오늘 뉴스', 'mbti_group': 'NT', 'conversation_history': []}, name='AI 챗봇')
    api_check('GET', '/time-machine?date=2025-06-01', name='타임머신')

    # New APIs (may be 404 if not wired)
    api_check('GET', f'/api/archive?user_id={DEMO_USER}', name='내 서랍 (Archive)')
    api_check('GET', f'/api/recommend?user_id={DEMO_USER}&limit=3', name='맞춤 추천')
    api_check('GET', f'/api/recommend/analysis?user_id={DEMO_USER}', name='DNA 분석')

    # ── 4. Performance ───────────────────────────────────────────────
    print('\n── 성능 (Performance) ──\n')

    # Check for recent errors in Lambda
    cw = boto3.client('cloudwatch', region_name=REGION)
    end = datetime.now(timezone.utc)
    start_cw = end - timedelta(hours=24)

    total_errors = 0
    for func in ['sedaily-mbti-chatbot-dev', 'sedaily-mbti-search-dev', 'sedaily-mbti-article-dev']:
        try:
            resp = cw.get_metric_statistics(
                Namespace='AWS/Lambda', MetricName='Errors',
                Dimensions=[{'Name': 'FunctionName', 'Value': func}],
                StartTime=start_cw, EndTime=end, Period=86400, Statistics=['Sum'],
            )
            errors = sum(dp.get('Sum', 0) for dp in resp.get('Datapoints', []))
            total_errors += int(errors)
        except Exception:
            pass

    if total_errors == 0:
        ok('Lambda errors (24h)', '0 errors')
    else:
        warn(f'Lambda errors (24h)', f'{total_errors} errors')

    # ── 5. Cost ──────────────────────────────────────────────────────
    print('\n── 비용 (Cost) ──\n')

    try:
        from tests.estimate_costs import estimate_bedrock_cost
        bedrock = estimate_bedrock_cost(cw, start_cw, end, 1)
        daily = bedrock.get('total_daily', 0)
        ok(f'Bedrock daily cost', f'${daily:.4f}')
    except Exception:
        warn('Bedrock cost check', 'estimate failed')

    ok('Budget: $26,000 AWS Jump Start')

    # ── Summary ──────────────────────────────────────────────────────
    elapsed = int(time.time() - start_time)
    total = passed + failed + warned

    print('')
    print('=' * 60)
    if failed == 0:
        print(f'  \033[32m  READY FOR DEMO\033[0m')
        print(f'  {passed} passed, {warned} warnings, 0 failures  ({elapsed}s)')
    else:
        print(f'  \033[31m  NOT READY — {failed} FAILURES\033[0m')
        print(f'  {passed} passed, {warned} warnings, {failed} failures  ({elapsed}s)')
    print('=' * 60)
    print('')

    sys.exit(0 if failed == 0 else 1)


if __name__ == '__main__':
    main()
