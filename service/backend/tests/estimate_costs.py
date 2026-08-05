#!/usr/bin/env python3
"""
Cost Estimation Tool — AWS Usage Analysis + Budget Projection
==============================================================
Queries CloudWatch metrics for the last 7 days and estimates costs
for all AI LENS backend services.

Reports:
  - Daily average cost by service
  - Monthly projected cost
  - Breakdown: Bedrock, DynamoDB, S3, Lambda, OpenSearch, RDS
  - Budget runway: months remaining from $26,000 credit

Usage:
  python tests/estimate_costs.py
  python tests/estimate_costs.py --days 14     # last 14 days

Output: tests/results/cost_estimate_{date}.json
"""
import argparse
import json
import os
import sys
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List

import boto3

REGION = os.getenv('AWS_REGION', 'us-east-1')
KST = timezone(timedelta(hours=9))
TODAY = datetime.now(KST).strftime('%Y-%m-%d')

# AWS Jump Start credit budget
TOTAL_BUDGET_USD = 26_000

# ── Pricing constants (us-east-1, as of 2026-04) ────────────────────────────

PRICING = {
    # Bedrock (per 1M tokens)
    'bedrock_claude_haiku_input':  0.25,
    'bedrock_claude_haiku_output': 1.25,
    'bedrock_nova_lite_input':     0.06,
    'bedrock_nova_lite_output':    0.24,
    'bedrock_nova_pro_input':      0.80,
    'bedrock_nova_pro_output':     3.20,
    'bedrock_titan_embed_input':   0.02,

    # DynamoDB On-Demand (per million)
    'dynamodb_wru_per_million':    1.25,
    'dynamodb_rru_per_million':    0.25,

    # S3
    's3_storage_per_gb_month':     0.023,
    's3_put_per_1000':             0.005,
    's3_get_per_1000':             0.0004,

    # Lambda
    'lambda_per_million_requests': 0.20,
    'lambda_per_gb_second':        0.0000166667,

    # OpenSearch (t3.small.search)
    'opensearch_instance_hourly':  0.036,   # ~$26/month

    # RDS (db.t3.micro PostgreSQL)
    'rds_instance_hourly':         0.018,   # ~$13/month
    'rds_storage_per_gb_month':    0.115,
}


# ── CloudWatch metric queries ────────────────────────────────────────────────

def get_metric_sum(
    cw, namespace: str, metric: str,
    dimensions: List[Dict],
    start: datetime, end: datetime,
    period: int = 86400,
) -> List[Dict]:
    """Query CloudWatch for a sum metric over daily periods."""
    try:
        resp = cw.get_metric_statistics(
            Namespace=namespace,
            MetricName=metric,
            Dimensions=dimensions,
            StartTime=start,
            EndTime=end,
            Period=period,
            Statistics=['Sum'],
        )
        return resp.get('Datapoints', [])
    except Exception:
        return []


def get_metric_avg(
    cw, namespace: str, metric: str,
    dimensions: List[Dict],
    start: datetime, end: datetime,
    period: int = 86400,
) -> List[Dict]:
    """Query CloudWatch for an average metric."""
    try:
        resp = cw.get_metric_statistics(
            Namespace=namespace,
            MetricName=metric,
            Dimensions=dimensions,
            StartTime=start,
            EndTime=end,
            Period=period,
            Statistics=['Average'],
        )
        return resp.get('Datapoints', [])
    except Exception:
        return []


# ── Cost calculators ─────────────────────────────────────────────────────────

def estimate_bedrock_cost(cw, start: datetime, end: datetime, days: int) -> Dict:
    """Estimate Bedrock costs from invocation counts."""
    models = {
        'claude_haiku': {
            'id': 'us.anthropic.claude-3-5-haiku-20241022-v1:0',
            'avg_input_tokens': 2000,
            'avg_output_tokens': 2500,
        },
        'nova_lite': {
            'id': 'amazon.nova-lite-v1:0',
            'avg_input_tokens': 1500,
            'avg_output_tokens': 800,
        },
        'titan_embed': {
            'id': 'amazon.titan-embed-text-v2:0',
            'avg_input_tokens': 500,
            'avg_output_tokens': 0,
        },
    }

    result = {'total_daily': 0, 'models': {}}

    for name, info in models.items():
        datapoints = get_metric_sum(
            cw, 'AWS/Bedrock', 'Invocations',
            [{'Name': 'ModelId', 'Value': info['id']}],
            start, end,
        )

        total_invocations = sum(dp.get('Sum', 0) for dp in datapoints)
        daily_avg = total_invocations / max(days, 1)

        # Estimate tokens from invocation count
        est_input_tokens = total_invocations * info['avg_input_tokens']
        est_output_tokens = total_invocations * info['avg_output_tokens']

        if 'claude' in name:
            cost = (est_input_tokens * PRICING['bedrock_claude_haiku_input'] +
                    est_output_tokens * PRICING['bedrock_claude_haiku_output']) / 1_000_000
        elif 'nova_lite' in name:
            cost = (est_input_tokens * PRICING['bedrock_nova_lite_input'] +
                    est_output_tokens * PRICING['bedrock_nova_lite_output']) / 1_000_000
        elif 'titan' in name:
            cost = est_input_tokens * PRICING['bedrock_titan_embed_input'] / 1_000_000
        else:
            cost = 0

        result['models'][name] = {
            'total_invocations': int(total_invocations),
            'daily_avg_invocations': round(daily_avg, 1),
            'est_input_tokens': int(est_input_tokens),
            'est_output_tokens': int(est_output_tokens),
            'total_cost': round(cost, 4),
            'daily_cost': round(cost / max(days, 1), 4),
        }

        result['total_daily'] += cost / max(days, 1)

    result['total_daily'] = round(result['total_daily'], 4)
    return result


def estimate_dynamodb_cost(cw, start: datetime, end: datetime, days: int) -> Dict:
    """Estimate DynamoDB costs from consumed capacity."""
    tables = ['sedaily-mbti-articles-dev', 'sedaily-mbti-personal-dev', 'sedaily-mbti-podcast-dev']
    total_wcu = 0
    total_rcu = 0

    for table in tables:
        wcu_data = get_metric_sum(
            cw, 'AWS/DynamoDB', 'ConsumedWriteCapacityUnits',
            [{'Name': 'TableName', 'Value': table}],
            start, end,
        )
        rcu_data = get_metric_sum(
            cw, 'AWS/DynamoDB', 'ConsumedReadCapacityUnits',
            [{'Name': 'TableName', 'Value': table}],
            start, end,
        )
        total_wcu += sum(dp.get('Sum', 0) for dp in wcu_data)
        total_rcu += sum(dp.get('Sum', 0) for dp in rcu_data)

    write_cost = (total_wcu / 1_000_000) * PRICING['dynamodb_wru_per_million']
    read_cost = (total_rcu / 1_000_000) * PRICING['dynamodb_rru_per_million']
    total = write_cost + read_cost

    return {
        'total_wcu': int(total_wcu),
        'total_rcu': int(total_rcu),
        'daily_wcu': round(total_wcu / max(days, 1), 0),
        'daily_rcu': round(total_rcu / max(days, 1), 0),
        'total_cost': round(total, 4),
        'daily_cost': round(total / max(days, 1), 4),
    }


def estimate_lambda_cost(cw, start: datetime, end: datetime, days: int) -> Dict:
    """Estimate Lambda costs from invocations and duration."""
    functions = [
        'sedaily-mbti-article-collector-dev', 'sedaily-mbti-search-dev',
        'sedaily-mbti-article-dev', 'sedaily-mbti-chatbot-dev',
        'sedaily-mbti-archive-dev', 'sedaily-mbti-podcast-dev',
        'sedaily-mbti-recommend-dev',
        'sedaily-mbti-pipeline-step1-dev', 'sedaily-mbti-pipeline-step2-dev',
        'sedaily-mbti-pipeline-step3-dev', 'sedaily-mbti-pipeline-step4-dev',
        'sedaily-mbti-pipeline-supervisor-dev',
    ]

    total_invocations = 0
    total_duration_ms = 0

    for func in functions:
        inv = get_metric_sum(
            cw, 'AWS/Lambda', 'Invocations',
            [{'Name': 'FunctionName', 'Value': func}],
            start, end,
        )
        dur = get_metric_sum(
            cw, 'AWS/Lambda', 'Duration',
            [{'Name': 'FunctionName', 'Value': func}],
            start, end,
        )
        total_invocations += sum(dp.get('Sum', 0) for dp in inv)
        total_duration_ms += sum(dp.get('Sum', 0) for dp in dur)

    # Cost: $0.20 per 1M requests + $0.0000166667 per GB-second
    # Assume average 512MB memory
    gb_seconds = (total_duration_ms / 1000) * 0.5  # 512MB = 0.5GB
    request_cost = (total_invocations / 1_000_000) * PRICING['lambda_per_million_requests']
    compute_cost = gb_seconds * PRICING['lambda_per_gb_second']
    total = request_cost + compute_cost

    return {
        'total_invocations': int(total_invocations),
        'daily_invocations': round(total_invocations / max(days, 1), 0),
        'total_duration_seconds': round(total_duration_ms / 1000, 1),
        'total_gb_seconds': round(gb_seconds, 1),
        'total_cost': round(total, 4),
        'daily_cost': round(total / max(days, 1), 4),
    }


def estimate_s3_cost(cw, start: datetime, end: datetime, days: int) -> Dict:
    """Estimate S3 costs from storage and requests."""
    buckets = ['sedaily-mbti-article-body-dev', 'sedaily-mbti-audio-dev']
    total_bytes = 0
    total_puts = 0
    total_gets = 0

    for bucket in buckets:
        size = get_metric_avg(
            cw, 'AWS/S3', 'BucketSizeBytes',
            [{'Name': 'BucketName', 'Value': bucket}, {'Name': 'StorageType', 'Value': 'StandardStorage'}],
            start, end,
        )
        if size:
            total_bytes = max(total_bytes, max(dp.get('Average', 0) for dp in size))

        puts = get_metric_sum(
            cw, 'AWS/S3', 'PutRequests',
            [{'Name': 'BucketName', 'Value': bucket}],
            start, end,
        )
        gets = get_metric_sum(
            cw, 'AWS/S3', 'GetRequests',
            [{'Name': 'BucketName', 'Value': bucket}],
            start, end,
        )
        total_puts += sum(dp.get('Sum', 0) for dp in puts)
        total_gets += sum(dp.get('Sum', 0) for dp in gets)

    storage_gb = total_bytes / (1024 ** 3)
    storage_cost = storage_gb * PRICING['s3_storage_per_gb_month']
    request_cost = (total_puts / 1000) * PRICING['s3_put_per_1000'] + (total_gets / 1000) * PRICING['s3_get_per_1000']
    total = storage_cost + request_cost

    return {
        'storage_gb': round(storage_gb, 3),
        'total_puts': int(total_puts),
        'total_gets': int(total_gets),
        'monthly_storage_cost': round(storage_cost, 4),
        'request_cost': round(request_cost, 4),
        'daily_cost': round(total / max(days, 1), 4),
    }


def estimate_fixed_costs() -> Dict:
    """Fixed monthly costs for provisioned services."""
    opensearch_monthly = PRICING['opensearch_instance_hourly'] * 24 * 30
    rds_monthly = PRICING['rds_instance_hourly'] * 24 * 30 + 20 * PRICING['rds_storage_per_gb_month']

    return {
        'opensearch_monthly': round(opensearch_monthly, 2),
        'rds_monthly': round(rds_monthly, 2),
        'total_fixed_monthly': round(opensearch_monthly + rds_monthly, 2),
        'total_fixed_daily': round((opensearch_monthly + rds_monthly) / 30, 2),
    }


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description='Estimate AWS costs')
    parser.add_argument('--days', type=int, default=7, help='Number of days to analyze')
    args = parser.parse_args()

    days = args.days
    end_time = datetime.now(timezone.utc)
    start_time = end_time - timedelta(days=days)

    print('')
    print('=' * 60)
    print('  AI LENS Cost Estimation')
    print(f'  Period: last {days} days')
    print(f'  Budget: ${TOTAL_BUDGET_USD:,} (AWS Jump Start)')
    print('=' * 60)
    print('')

    cw = boto3.client('cloudwatch', region_name=REGION)

    # Collect costs
    print('  Querying CloudWatch metrics...')
    bedrock = estimate_bedrock_cost(cw, start_time, end_time, days)
    dynamodb = estimate_dynamodb_cost(cw, start_time, end_time, days)
    lambda_cost = estimate_lambda_cost(cw, start_time, end_time, days)
    s3 = estimate_s3_cost(cw, start_time, end_time, days)
    fixed = estimate_fixed_costs()

    # Totals
    daily_variable = (
        bedrock['total_daily'] +
        dynamodb['daily_cost'] +
        lambda_cost['daily_cost'] +
        s3['daily_cost']
    )
    daily_total = daily_variable + fixed['total_fixed_daily']
    monthly_total = daily_total * 30

    # Budget runway
    if monthly_total > 0:
        months_remaining = TOTAL_BUDGET_USD / monthly_total
    else:
        months_remaining = float('inf')

    report = {
        'analysis_date': TODAY,
        'period_days': days,
        'budget_usd': TOTAL_BUDGET_USD,
        'bedrock': bedrock,
        'dynamodb': dynamodb,
        'lambda': lambda_cost,
        's3': s3,
        'fixed_infrastructure': fixed,
        'summary': {
            'daily_variable_cost': round(daily_variable, 4),
            'daily_fixed_cost': round(fixed['total_fixed_daily'], 4),
            'daily_total_cost': round(daily_total, 4),
            'monthly_projected_cost': round(monthly_total, 2),
            'yearly_projected_cost': round(monthly_total * 12, 2),
            'budget_months_remaining': round(months_remaining, 1) if months_remaining != float('inf') else 'infinite',
            'budget_percent_per_month': round(monthly_total / TOTAL_BUDGET_USD * 100, 2) if monthly_total > 0 else 0,
        },
    }

    # Save report
    results_dir = os.path.join(os.path.dirname(__file__), 'results')
    os.makedirs(results_dir, exist_ok=True)
    filename = f"cost_estimate_{TODAY.replace('-', '')}.json"
    filepath = os.path.join(results_dir, filename)

    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(report, f, ensure_ascii=False, indent=2, default=str)

    # Print report
    print('')
    print('  ┌─────────────────────────────────────────────────────┐')
    print(f'  │  {"Service":<25} {"Daily":>10} {"Monthly":>10}   │')
    print('  ├─────────────────────────────────────────────────────┤')
    print(f'  │  {"Bedrock (Claude+Nova)":<25} ${bedrock["total_daily"]:>8.4f} ${bedrock["total_daily"]*30:>8.2f}   │')
    print(f'  │  {"DynamoDB":<25} ${dynamodb["daily_cost"]:>8.4f} ${dynamodb["daily_cost"]*30:>8.2f}   │')
    print(f'  │  {"Lambda":<25} ${lambda_cost["daily_cost"]:>8.4f} ${lambda_cost["daily_cost"]*30:>8.2f}   │')
    print(f'  │  {"S3":<25} ${s3["daily_cost"]:>8.4f} ${s3["daily_cost"]*30:>8.2f}   │')
    print(f'  │  {"OpenSearch (fixed)":<25} ${fixed["total_fixed_daily"]/2:>8.4f} ${fixed["opensearch_monthly"]:>8.2f}   │')
    print(f'  │  {"RDS pgvector (fixed)":<25} ${fixed["total_fixed_daily"]/2:>8.4f} ${fixed["rds_monthly"]:>8.2f}   │')
    print('  ├─────────────────────────────────────────────────────┤')
    print(f'  │  {"TOTAL":<25} ${daily_total:>8.4f} ${monthly_total:>8.2f}   │')
    print('  └─────────────────────────────────────────────────────┘')
    print('')
    print(f'  Budget: ${TOTAL_BUDGET_USD:,}')
    print(f'  Monthly burn: ${monthly_total:.2f} ({report["summary"]["budget_percent_per_month"]}% of budget)')

    if months_remaining == float('inf'):
        print(f'  Runway: no usage detected yet')
    else:
        print(f'  Runway: {months_remaining:.1f} months at current rate')
        if months_remaining < 6:
            print(f'  \033[31m  ⚠ WARNING: Budget will be exhausted in {months_remaining:.0f} months!\033[0m')
        elif months_remaining < 12:
            print(f'  \033[33m  ⚠ NOTE: Budget covers ~{months_remaining:.0f} months\033[0m')
        else:
            print(f'  \033[32m  ✓ Budget is healthy ({months_remaining:.0f} months)\033[0m')

    print('')
    print(f'  Detailed breakdown:')
    print(f'    Bedrock invocations: {sum(m["total_invocations"] for m in bedrock["models"].values()):,}')
    print(f'    DynamoDB WCU: {dynamodb["total_wcu"]:,} ({dynamodb["daily_wcu"]:.0f}/day)')
    print(f'    Lambda invocations: {lambda_cost["total_invocations"]:,} ({lambda_cost["daily_invocations"]:.0f}/day)')
    print(f'    S3 storage: {s3["storage_gb"]:.3f} GB')
    print('')
    print(f'  Report saved: {filepath}')
    print('')


if __name__ == '__main__':
    main()
