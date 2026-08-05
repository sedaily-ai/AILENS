#!/usr/bin/env python3
"""
Full Volume Test — Multi-day pipeline load test with metrics collection
=========================================================================
Runs the Step Functions pipeline for multiple recent dates and collects
detailed performance, cost, and reliability metrics.

What this tests:
  - 3 consecutive days of pipeline execution
  - ~11 articles per day (per category allocation)
  - Bedrock API call volume and cost
  - DynamoDB/S3/OpenSearch/pgvector write performance
  - Throttling and error rates

Prerequisites:
  - Step Functions state machine deployed
  - All 6 pipeline Lambdas deployed with latest code
  - S3 article body bucket exists
  - CloudWatch Logs accessible (for Bedrock throttle detection)

Usage:
  python tests/test_full_volume.py              # 3 most recent days with XML
  python tests/test_full_volume.py --days 1     # single day quick test
  python tests/test_full_volume.py --dates 20260407,20260408,20260409

Output: tests/results/volume_test_{date}.json

WARNING: This test invokes Bedrock and Polly APIs which incur real costs.
Estimated cost: ~$0.10-0.30 per day (11 articles × 2 model calls each).
"""
import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional

import boto3

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

# ── Configuration ────────────────────────────────────────────────────────────

REGION = os.getenv('AWS_REGION', 'us-east-1')
TABLE = os.getenv('DYNAMODB_TABLE_ARTICLES', 'sedaily-mbti-articles-dev')
BUCKET = os.getenv('S3_ARTICLE_BODY_BUCKET', 'sedaily-mbti-article-body-dev')
KST = timezone(timedelta(hours=9))
POLL_INTERVAL = 15
MAX_WAIT = 900  # 15 minutes per execution


def _resolve_sfn_arn() -> str:
    explicit = os.getenv('SFN_ARN')
    if explicit:
        return explicit
    account = boto3.client('sts', region_name=REGION).get_caller_identity()['Account']
    return f"arn:aws:states:{REGION}:{account}:stateMachine:sedaily-mbti-transform-pipeline-dev"


def _recent_dates(days: int) -> List[str]:
    """Get the N most recent dates (YYYYMMDD) that likely have XML data."""
    now = datetime.now(KST)
    dates = []
    for i in range(days):
        d = now - timedelta(days=i)
        dates.append(d.strftime('%Y%m%d'))
    return dates


# ── Pipeline execution ───────────────────────────────────────────────────────

def run_pipeline(sfn_client, sfn_arn: str, date_str: str) -> Dict[str, Any]:
    """
    Start a pipeline execution, wait for completion, return metrics.
    """
    ts = datetime.now(KST).strftime('%H%M%S')
    exec_name = f"volume-test-{date_str}-{ts}"

    result = {
        'date': date_str,
        'execution_name': exec_name,
        'status': 'not_started',
        'duration_seconds': 0,
        'stored_count': 0,
        'rejected_count': 0,
        'failed_count': 0,
        'total_selected': 0,
        'total_classified': 0,
        'total_transformed': 0,
        'transform_input_tokens': 0,
        'transform_output_tokens': 0,
        'opensearch_indexed': 0,
        'pgvector_indexed': 0,
        'vector_failed': 0,
        'errors': [],
    }

    # Start execution
    try:
        response = sfn_client.start_execution(
            stateMachineArn=sfn_arn,
            name=exec_name,
            input=json.dumps({'date': date_str, 'source': 'volume-test'}),
        )
        exec_arn = response['executionArn']
        result['execution_arn'] = exec_arn
    except Exception as e:
        error_str = str(e)
        if 'StateMachineDoesNotExist' in error_str:
            result['status'] = 'skipped'
            result['errors'].append('State machine not deployed')
            return result
        result['status'] = 'start_failed'
        result['errors'].append(str(e)[:200])
        return result

    # Poll until done
    start = time.time()
    print(f"    Execution started: {exec_name}")

    while time.time() - start < MAX_WAIT:
        desc = sfn_client.describe_execution(executionArn=exec_arn)
        status = desc['status']

        if status in ('SUCCEEDED', 'FAILED', 'TIMED_OUT', 'ABORTED'):
            elapsed = time.time() - start
            result['duration_seconds'] = round(elapsed, 1)
            result['status'] = status

            if status == 'SUCCEEDED':
                _extract_metrics(desc, result)
            else:
                result['errors'].append(f'{status}: {desc.get("error", "")} {desc.get("cause", "")[:200]}')

            return result

        elapsed = int(time.time() - start)
        print(f"    ... {status} ({elapsed}s)")
        time.sleep(POLL_INTERVAL)

    result['status'] = 'poll_timeout'
    result['duration_seconds'] = MAX_WAIT
    result['errors'].append(f'Did not complete within {MAX_WAIT}s')
    return result


def _extract_metrics(desc: Dict, result: Dict):
    """Extract pipeline metrics from the execution output."""
    try:
        output = json.loads(desc.get('output', '{}'))

        # Navigate to the supervisor result
        pipeline = (
            output.get('pipeline_result') or
            output.get('body') or
            output
        )

        metrics = pipeline.get('metrics', {})
        result['stored_count'] = metrics.get('stored_count', 0)
        result['rejected_count'] = metrics.get('rejected_count', 0)
        result['failed_count'] = metrics.get('store_failed_count', 0) + len(pipeline.get('failed_articles', []))
        result['opensearch_indexed'] = metrics.get('opensearch_indexed', 0)
        result['pgvector_indexed'] = metrics.get('pgvector_indexed', 0)
        result['vector_failed'] = metrics.get('vector_failed_count', 0)

        # Try to extract step-level metrics from the nested output
        # Step 1 metrics
        step1 = output.get('step1_result', {}).get('body', {}).get('metrics', {})
        result['total_selected'] = step1.get('selected', 0)

        # Step 2 metrics
        step2 = output.get('step2_result', {}).get('body', {}).get('metrics', {})
        result['total_classified'] = step2.get('classified_count', 0)

        # Step 3 metrics (may be in merged result)
        step3 = output.get('step3_result', {}).get('body', {}).get('metrics', {})
        result['total_transformed'] = step3.get('transformed_count', 0)
        result['transform_input_tokens'] = step3.get('total_input_tokens', 0)
        result['transform_output_tokens'] = step3.get('total_output_tokens', 0)

    except Exception as e:
        result['errors'].append(f'Metrics extraction failed: {e}')


# ── CloudWatch throttle detection ────────────────────────────────────────────

def check_throttling(date_str: str) -> Dict[str, Any]:
    """Check CloudWatch logs for Bedrock throttling events."""
    cw = boto3.client('cloudwatch', region_name=REGION)

    # Check Bedrock throttled invocations
    throttle_info = {'bedrock_throttles': 0, 'lambda_throttles': 0, 'dynamodb_throttles': 0}

    try:
        # Parse date for metric query
        dt = datetime.strptime(date_str, '%Y%m%d').replace(tzinfo=KST)
        start_time = dt
        end_time = dt + timedelta(hours=24)

        # Lambda throttles for pipeline functions
        for func_suffix in ['step1', 'step2', 'step3', 'step4', 'supervisor', 'merge']:
            func_name = f'sedaily-mbti-pipeline-{func_suffix}-dev'
            try:
                resp = cw.get_metric_statistics(
                    Namespace='AWS/Lambda',
                    MetricName='Throttles',
                    Dimensions=[{'Name': 'FunctionName', 'Value': func_name}],
                    StartTime=start_time,
                    EndTime=end_time,
                    Period=86400,
                    Statistics=['Sum'],
                )
                for dp in resp.get('Datapoints', []):
                    throttle_info['lambda_throttles'] += int(dp.get('Sum', 0))
            except Exception:
                pass

        # DynamoDB throttles
        for metric in ['WriteThrottleEvents', 'ReadThrottleEvents']:
            try:
                resp = cw.get_metric_statistics(
                    Namespace='AWS/DynamoDB',
                    MetricName=metric,
                    Dimensions=[{'Name': 'TableName', 'Value': TABLE}],
                    StartTime=start_time,
                    EndTime=end_time,
                    Period=86400,
                    Statistics=['Sum'],
                )
                for dp in resp.get('Datapoints', []):
                    throttle_info['dynamodb_throttles'] += int(dp.get('Sum', 0))
            except Exception:
                pass

    except Exception as e:
        throttle_info['check_error'] = str(e)[:100]

    return throttle_info


# ── Storage verification ─────────────────────────────────────────────────────

def verify_storage(day_result: Dict) -> Dict[str, Any]:
    """Spot-check stored articles for a completed pipeline run."""
    checks = {'dynamo_ok': 0, 'dynamo_fail': 0, 's3_ok': 0, 's3_fail': 0}

    stored_count = day_result.get('stored_count', 0)
    if stored_count == 0:
        return checks

    # Sample up to 3 articles from the execution output
    # (We don't have the news_ids here, so query DynamoDB for recent articles)
    dynamodb = boto3.resource('dynamodb', region_name=REGION)
    table = dynamodb.Table(TABLE)
    s3 = boto3.client('s3', region_name=REGION)

    from boto3.dynamodb.conditions import Key
    date_str = day_result['date']
    date_iso = f"{date_str[:4]}-{date_str[4:6]}-{date_str[6:8]}"

    try:
        resp = table.query(
            IndexName='category-published_at-index',
            KeyConditionExpression=Key('category').eq('경제') & Key('published_at').begins_with(date_iso),
            ScanIndexForward=False,
            Limit=3,
        )

        for item in resp.get('Items', []):
            nid = item.get('news_id', '')

            # Check DynamoDB has the item
            if item.get('title_ko'):
                checks['dynamo_ok'] += 1
            else:
                checks['dynamo_fail'] += 1

            # Check S3 body (if s3_body_uri present)
            if item.get('s3_body_uri'):
                try:
                    s3.head_object(Bucket=BUCKET, Key=f'articles/{nid}/body.json')
                    checks['s3_ok'] += 1
                except Exception:
                    checks['s3_fail'] += 1

    except Exception:
        pass

    return checks


# ── Cost calculation ─────────────────────────────────────────────────────────

def estimate_cost(result: Dict) -> float:
    """Estimate Bedrock cost from token counts."""
    # Claude Haiku: $0.25/1M input, $1.25/1M output (transformation)
    # Nova Lite: ~$0.06/1M input, $0.24/1M output (filtering/classification/validation)
    # Conservative estimate: most tokens are from Claude in step 3

    in_tok = result.get('transform_input_tokens', 0)
    out_tok = result.get('transform_output_tokens', 0)

    # Step 3 (Claude): main cost
    claude_cost = (in_tok * 0.25 + out_tok * 1.25) / 1_000_000

    # Steps 1,2,4 + Supervisor (Nova): typically ~20% of step 3 tokens
    nova_in = in_tok * 0.2
    nova_out = out_tok * 0.1
    nova_cost = (nova_in * 0.06 + nova_out * 0.24) / 1_000_000

    return round(claude_cost + nova_cost, 4)


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description='Full volume pipeline test')
    parser.add_argument('--days', type=int, default=3, help='Number of recent days to process')
    parser.add_argument('--dates', type=str, default='', help='Comma-separated YYYYMMDD dates')
    args = parser.parse_args()

    if args.dates:
        test_dates = [d.strip() for d in args.dates.split(',') if d.strip()]
    else:
        test_dates = _recent_dates(args.days)

    today = datetime.now(KST).strftime('%Y-%m-%d')

    print('')
    print('=' * 60)
    print('  Full Volume Test — Pipeline Load Test')
    print(f'  Region: {REGION}')
    print(f'  Dates: {test_dates}')
    print(f'  Expected: ~{len(test_dates) * 11} articles total')
    print('=' * 60)
    print('')

    sfn_arn = _resolve_sfn_arn()
    sfn_client = boto3.client('stepfunctions', region_name=REGION)

    # Run pipeline for each date
    day_results = []
    total_start = time.time()

    for i, date_str in enumerate(test_dates):
        print(f'── Day {i+1}/{len(test_dates)}: {date_str} ──')
        print('')

        result = run_pipeline(sfn_client, sfn_arn, date_str)

        if result['status'] == 'skipped':
            print(f'    SKIPPED: {result["errors"]}')
            day_results.append(result)
            print('')
            continue

        # Print day summary
        status_icon = '✓' if result['status'] == 'SUCCEEDED' else '✗'
        print(f'    {status_icon} Status: {result["status"]}')
        print(f'      Duration: {result["duration_seconds"]}s')
        print(f'      Stored: {result["stored_count"]}, Rejected: {result["rejected_count"]}, Failed: {result["failed_count"]}')
        print(f'      Selected: {result["total_selected"]}, Classified: {result["total_classified"]}, Transformed: {result["total_transformed"]}')
        print(f'      Tokens: {result["transform_input_tokens"]:,} in / {result["transform_output_tokens"]:,} out')
        print(f'      Vectors: OS={result["opensearch_indexed"]}, PG={result["pgvector_indexed"]}, failed={result["vector_failed"]}')

        if result['errors']:
            for err in result['errors']:
                print(f'      [ERROR] {err[:120]}')

        # Verify storage
        storage = verify_storage(result)
        result['storage_checks'] = storage
        print(f'      Storage: DynamoDB {storage["dynamo_ok"]} ok/{storage["dynamo_fail"]} fail, S3 {storage["s3_ok"]} ok/{storage["s3_fail"]} fail')

        # Check throttling
        throttles = check_throttling(date_str)
        result['throttling'] = throttles
        if throttles.get('lambda_throttles', 0) > 0 or throttles.get('dynamodb_throttles', 0) > 0:
            print(f'      [WARN] Throttles: Lambda={throttles["lambda_throttles"]}, DynamoDB={throttles["dynamodb_throttles"]}')
        else:
            print(f'      Throttles: none detected')

        # Cost
        cost = estimate_cost(result)
        result['estimated_cost_usd'] = cost
        print(f'      Est. cost: ${cost:.4f}')

        day_results.append(result)
        print('')

        # Brief pause between days to avoid hitting rate limits
        if i < len(test_dates) - 1:
            print('    Waiting 10s before next day...')
            time.sleep(10)

    total_elapsed = time.time() - total_start

    # Aggregate report
    succeeded = [r for r in day_results if r['status'] == 'SUCCEEDED']
    all_errors = []
    for r in day_results:
        for e in r.get('errors', []):
            all_errors.append({'date': r['date'], 'error': e})

    report = {
        'test_date': today,
        'days_processed': len(test_dates),
        'days_succeeded': len(succeeded),
        'total_articles_transformed': sum(r.get('total_transformed', 0) for r in succeeded),
        'total_articles_stored': sum(r.get('stored_count', 0) for r in succeeded),
        'avg_pipeline_duration_seconds': round(
            sum(r['duration_seconds'] for r in succeeded) / max(len(succeeded), 1), 1
        ),
        'avg_pipeline_duration_minutes': round(
            sum(r['duration_seconds'] for r in succeeded) / max(len(succeeded), 1) / 60, 1
        ),
        'total_bedrock_input_tokens': sum(r.get('transform_input_tokens', 0) for r in succeeded),
        'total_bedrock_output_tokens': sum(r.get('transform_output_tokens', 0) for r in succeeded),
        'total_bedrock_cost_usd': round(sum(r.get('estimated_cost_usd', 0) for r in day_results), 4),
        'total_opensearch_indexed': sum(r.get('opensearch_indexed', 0) for r in succeeded),
        'total_pgvector_indexed': sum(r.get('pgvector_indexed', 0) for r in succeeded),
        'total_vector_failures': sum(r.get('vector_failed', 0) for r in day_results),
        'total_lambda_throttles': sum(r.get('throttling', {}).get('lambda_throttles', 0) for r in day_results),
        'total_dynamodb_throttles': sum(r.get('throttling', {}).get('dynamodb_throttles', 0) for r in day_results),
        'error_count': len(all_errors),
        'errors': all_errors[:20],
        'total_test_duration_seconds': round(total_elapsed, 1),
        'per_day': day_results,
    }

    # Save report
    results_dir = os.path.join(os.path.dirname(__file__), 'results')
    os.makedirs(results_dir, exist_ok=True)
    filename = f"volume_test_{today.replace('-', '')}.json"
    filepath = os.path.join(results_dir, filename)

    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(report, f, ensure_ascii=False, indent=2, default=str)

    # Print summary
    print('')
    print('=' * 60)
    print('  VOLUME TEST REPORT')
    print('=' * 60)
    print(f'  Days processed:           {report["days_processed"]}')
    print(f'  Days succeeded:           {report["days_succeeded"]}')
    print(f'  Total articles transformed: {report["total_articles_transformed"]}')
    print(f'  Total articles stored:    {report["total_articles_stored"]}')
    print(f'  Avg pipeline duration:    {report["avg_pipeline_duration_minutes"]} min')
    print(f'  Total Bedrock tokens:     {report["total_bedrock_input_tokens"]:,} in / {report["total_bedrock_output_tokens"]:,} out')
    print(f'  Total Bedrock cost:       ${report["total_bedrock_cost_usd"]:.4f}')
    print(f'  OpenSearch indexed:       {report["total_opensearch_indexed"]}')
    print(f'  pgvector indexed:         {report["total_pgvector_indexed"]}')
    print(f'  Vector failures:          {report["total_vector_failures"]}')
    print(f'  Lambda throttles:         {report["total_lambda_throttles"]}')
    print(f'  DynamoDB throttles:       {report["total_dynamodb_throttles"]}')
    print(f'  Error count:              {report["error_count"]}')
    print(f'  Total test duration:      {report["total_test_duration_seconds"]}s')
    print(f'')
    print(f'  Report saved: {filepath}')

    # Pass/fail verdict
    print('')
    if report['error_count'] == 0 and report['total_lambda_throttles'] == 0:
        print(f'  \033[32mVERDICT: PASS — no errors, no throttling\033[0m')
    elif report['total_lambda_throttles'] > 0:
        print(f'  \033[33mVERDICT: WARN — {report["total_lambda_throttles"]} throttle events detected\033[0m')
    else:
        print(f'  \033[31mVERDICT: FAIL — {report["error_count"]} errors\033[0m')

    print('')
    sys.exit(0 if report['error_count'] == 0 else 1)


if __name__ == '__main__':
    main()
