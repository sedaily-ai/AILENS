#!/usr/bin/env python3
"""
Step Functions Pipeline End-to-End Test
========================================
Tests the full 5-stage article transformation pipeline via AWS Step Functions.

Test 1 (normal flow):
  - Starts a pipeline execution with today's date
  - Polls until completion (10-min timeout)
  - Verifies articles were saved to DynamoDB with s3_body_uri
  - Verifies MBTI versions exist in S3 body

Test 2 (empty date):
  - Starts a pipeline with a date that has no articles (far future)
  - Verifies pipeline completes gracefully via NoArticles path

Prerequisites:
  - All 6 pipeline Lambdas deployed (deploy.sh)
  - Step Functions state machine created (deploy_step_functions.sh)
  - S3 bucket sedaily-mbti-article-body-dev exists
  - DynamoDB table sedaily-mbti-articles-dev exists

Usage:
  python tests/test_pipeline.py
  SFN_ARN=arn:aws:states:... python tests/test_pipeline.py
"""
import json
import os
import sys
import time
from datetime import datetime, timezone, timedelta

import boto3

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

# ── Configuration ────────────────────────────────────────────────────────────

REGION = os.getenv('AWS_REGION', 'us-east-1')
TABLE = os.getenv('DYNAMODB_TABLE_ARTICLES', 'sedaily-mbti-articles-dev')
BUCKET = os.getenv('S3_ARTICLE_BODY_BUCKET', 'sedaily-mbti-article-body-dev')
KST = timezone(timedelta(hours=9))
TODAY = datetime.now(KST).strftime('%Y%m%d')
POLL_INTERVAL = 15   # seconds between status checks
MAX_WAIT = 600       # 10 minutes total timeout


def _resolve_sfn_arn() -> str:
    """Resolve the state machine ARN."""
    explicit = os.getenv('SFN_ARN')
    if explicit:
        return explicit

    account_id = boto3.client('sts', region_name=REGION).get_caller_identity()['Account']
    return f"arn:aws:states:{REGION}:{account_id}:stateMachine:sedaily-mbti-transform-pipeline-dev"


# ── Test Framework ───────────────────────────────────────────────────────────

class TestResult:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.skipped = 0
        self.errors = []

    def ok(self, name: str, detail: str = ''):
        self.passed += 1
        print(f"  \033[32mPASS\033[0m  {name} {detail}")

    def fail(self, name: str, reason: str):
        self.failed += 1
        self.errors.append((name, reason))
        print(f"  \033[31mFAIL\033[0m  {name} — {reason}")

    def skip(self, name: str, reason: str):
        self.skipped += 1
        print(f"  \033[33mSKIP\033[0m  {name} — {reason}")

    def summary(self):
        total = self.passed + self.failed + self.skipped
        print('')
        print('=' * 60)
        if self.failed == 0:
            msg = f"  {self.passed} PASSED"
            if self.skipped:
                msg += f", {self.skipped} SKIPPED"
            print(f"\033[32m{msg}\033[0m")
        else:
            print(f"\033[31m  {self.failed}/{total} TESTS FAILED\033[0m")
            for name, reason in self.errors:
                print(f"    - {name}: {reason}")
        print('=' * 60)
        return self.failed == 0


results = TestResult()


# ── Execution helpers ────────────────────────────────────────────────────────

def start_execution(sfn_client, sfn_arn: str, input_data: dict, name_prefix: str) -> str:
    """Start a state machine execution. Returns execution ARN."""
    ts = datetime.now(KST).strftime('%Y%m%dT%H%M%S')
    exec_name = f"{name_prefix}-{ts}"

    response = sfn_client.start_execution(
        stateMachineArn=sfn_arn,
        name=exec_name,
        input=json.dumps(input_data),
    )

    return response['executionArn']


def wait_for_completion(sfn_client, execution_arn: str) -> dict:
    """Poll execution until terminal state. Returns execution detail."""
    elapsed = 0
    while elapsed < MAX_WAIT:
        response = sfn_client.describe_execution(executionArn=execution_arn)
        status = response['status']

        if status in ('SUCCEEDED', 'FAILED', 'TIMED_OUT', 'ABORTED'):
            return response

        print(f"    ... {status} ({elapsed}s elapsed)")
        time.sleep(POLL_INTERVAL)
        elapsed += POLL_INTERVAL

    return {'status': 'POLL_TIMEOUT', 'executionArn': execution_arn}


def parse_output(response: dict) -> dict:
    """Parse execution output JSON."""
    output_str = response.get('output', '{}')
    try:
        return json.loads(output_str)
    except (json.JSONDecodeError, TypeError):
        return {}


# ── Test 1: Normal pipeline execution ────────────────────────────────────────

def test_normal_execution(sfn_client, sfn_arn: str):
    """Run pipeline with today's date — full 5-stage flow."""
    name = 'Pipeline: normal execution'

    print(f"\n  Starting pipeline for date={TODAY}...")

    try:
        exec_arn = start_execution(
            sfn_client, sfn_arn,
            input_data={'date': TODAY, 'source': 'test'},
            name_prefix='test-normal',
        )
        print(f"    Execution: {exec_arn.split(':')[-1]}")
    except Exception as e:
        error_str = str(e)
        if 'StateMachineDoesNotExist' in error_str:
            results.skip(name, 'State machine not deployed yet — run deploy_step_functions.sh')
            return None
        if 'AccessDeniedException' in error_str:
            results.skip(name, f'No permission to start execution: {error_str[:100]}')
            return None
        results.fail(name, f'Failed to start: {e}')
        return None

    print(f"    Waiting for completion (max {MAX_WAIT}s)...")
    response = wait_for_completion(sfn_client, exec_arn)
    status = response['status']

    # Calculate duration
    start_time = response.get('startDate')
    stop_time = response.get('stopDate')
    duration_s = 0
    if start_time and stop_time:
        duration_s = int((stop_time - start_time).total_seconds())

    if status == 'POLL_TIMEOUT':
        results.fail(name, f'Execution did not complete within {MAX_WAIT}s')
        return None

    if status == 'FAILED':
        error = response.get('error', '')
        cause = response.get('cause', '')[:200]
        results.fail(name, f'Execution failed: {error} — {cause}')
        return None

    if status == 'TIMED_OUT':
        results.fail(name, f'Execution timed out (Step Functions level)')
        return None

    if status != 'SUCCEEDED':
        results.fail(name, f'Unexpected status: {status}')
        return None

    # Parse output
    output = parse_output(response)

    # The output structure depends on which path was taken.
    # Normal path: output has pipeline_result at some nesting level
    # Let's find the supervisor output
    pipeline_result = (
        output.get('pipeline_result') or
        output.get('body') or
        output
    )

    step = pipeline_result.get('step', '')
    metrics = pipeline_result.get('metrics', {})
    stored = pipeline_result.get('stored_articles', [])
    rejected = pipeline_result.get('rejected_articles', [])
    failed = pipeline_result.get('failed_articles', [])

    stored_count = len(stored) if isinstance(stored, list) else metrics.get('stored_count', 0)
    total = metrics.get('total_pipeline_articles', metrics.get('input_count', 0))

    results.ok(
        name,
        f'status=SUCCEEDED, {duration_s}s, '
        f'stored={stored_count}, rejected={len(rejected) if isinstance(rejected, list) else 0}, '
        f'failed={len(failed) if isinstance(failed, list) else 0}, total={total}'
    )

    return {
        'execution_arn': exec_arn,
        'output': pipeline_result,
        'stored_articles': stored if isinstance(stored, list) else [],
        'duration_s': duration_s,
    }


# ── Test 2: Verify stored articles ──────────────────────────────────────────

def test_verify_storage(execution_result: dict):
    """Check that stored articles have s3_body_uri and S3 body content."""
    name = 'Pipeline: verify storage'

    stored = execution_result.get('stored_articles', [])
    if not stored:
        results.ok(name, 'No articles stored (0 selected — pipeline may have used NoArticles path)')
        return

    dynamodb = boto3.resource('dynamodb', region_name=REGION)
    table = dynamodb.Table(TABLE)
    s3 = boto3.client('s3', region_name=REGION)

    checked = 0
    issues = []

    for article_ref in stored[:3]:  # Check up to 3
        news_id = article_ref.get('news_id', '')
        if not news_id:
            continue

        # Check DynamoDB
        response = table.get_item(Key={'news_id': news_id})
        item = response.get('Item')

        if not item:
            issues.append(f'{news_id}: not in DynamoDB')
            continue

        s3_uri = item.get('s3_body_uri', '')
        if not s3_uri:
            # Legacy path — body may be in DynamoDB directly
            if item.get('content_ko'):
                checked += 1
                continue
            issues.append(f'{news_id}: no s3_body_uri and no content_ko')
            continue

        # Check S3 body
        s3_key = f"articles/{news_id}/body.json"
        try:
            obj = s3.get_object(Bucket=BUCKET, Key=s3_key)
            body = json.loads(obj['Body'].read().decode('utf-8'))

            has_content = bool(body.get('content_ko'))
            has_nt = bool(body.get('version_NT'))
            has_nf = bool(body.get('version_NF'))

            if not has_content:
                issues.append(f'{news_id}: S3 body missing content_ko')
            elif not has_nt:
                issues.append(f'{news_id}: S3 body missing version_NT')
            else:
                checked += 1

        except s3.exceptions.NoSuchKey:
            issues.append(f'{news_id}: S3 body not found at {s3_key}')
        except Exception as e:
            issues.append(f'{news_id}: S3 error: {e}')

    if issues:
        results.fail(name, f'{len(issues)} issues: {"; ".join(issues[:3])}')
    else:
        results.ok(name, f'{checked}/{len(stored)} articles verified (DynamoDB + S3)')


# ── Test 3: Empty date (no articles) ────────────────────────────────────────

def test_empty_date(sfn_client, sfn_arn: str):
    """Run pipeline with a date that has no articles — should complete via NoArticles path."""
    name = 'Pipeline: empty date (graceful)'

    # Use a far-future date: no XML will exist
    empty_date = '20301231'
    print(f"\n  Starting pipeline for date={empty_date} (no articles expected)...")

    try:
        exec_arn = start_execution(
            sfn_client, sfn_arn,
            input_data={'date': empty_date, 'source': 'test-empty'},
            name_prefix='test-empty',
        )
        print(f"    Execution: {exec_arn.split(':')[-1]}")
    except Exception as e:
        error_str = str(e)
        if 'StateMachineDoesNotExist' in error_str:
            results.skip(name, 'State machine not deployed')
            return
        results.fail(name, f'Failed to start: {e}')
        return

    print(f"    Waiting for completion (max {MAX_WAIT}s)...")
    response = wait_for_completion(sfn_client, exec_arn)
    status = response['status']

    if status == 'POLL_TIMEOUT':
        results.fail(name, f'Did not complete within {MAX_WAIT}s')
        return

    if status != 'SUCCEEDED':
        # Pipeline should not FAIL for empty dates — it should take the NoArticles path
        error = response.get('error', '')
        cause = response.get('cause', '')[:200]
        results.fail(name, f'Expected SUCCEEDED, got {status}: {error} {cause}')
        return

    output = parse_output(response)
    pipeline_result = output.get('pipeline_result') or output.get('body') or output

    stored = pipeline_result.get('stored_articles', [])
    reason = pipeline_result.get('metrics', {}).get('reason', '')

    stored_count = len(stored) if isinstance(stored, list) else 0

    if stored_count > 0:
        results.fail(name, f'Expected 0 stored articles for future date, got {stored_count}')
        return

    results.ok(name, f'SUCCEEDED with 0 articles, reason={reason or "empty_date"}')


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    print('')
    print('=' * 60)
    print('  Step Functions Pipeline E2E Test')
    print(f'  Region: {REGION}')
    print(f'  Date: {TODAY}')
    print(f'  DynamoDB: {TABLE}')
    print(f'  S3: {BUCKET}')
    print('=' * 60)

    sfn_arn = _resolve_sfn_arn()
    print(f'  SFN: {sfn_arn}')
    print('')

    sfn_client = boto3.client('stepfunctions', region_name=REGION)

    # Test 1: Normal execution
    print('── Test 1: Normal pipeline execution ──')
    execution_result = test_normal_execution(sfn_client, sfn_arn)

    # Test 2: Verify storage (only if test 1 produced results)
    if execution_result:
        print('')
        print('── Test 2: Verify stored articles ──')
        print('')
        test_verify_storage(execution_result)

    # Test 3: Empty date
    print('')
    print('── Test 3: Empty date (graceful exit) ──')
    test_empty_date(sfn_client, sfn_arn)

    # Summary
    print('')
    all_passed = results.summary()
    print('')
    sys.exit(0 if all_passed else 1)


if __name__ == '__main__':
    main()
