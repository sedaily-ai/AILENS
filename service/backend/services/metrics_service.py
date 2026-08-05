"""
Metrics Service — Collect, aggregate, and store operational metrics
====================================================================
Provides a unified metrics collection API for the demo dashboard.

Metrics collected:
  - Pipeline: execution time, articles processed, success/failure counts
  - Bedrock: invocations, tokens, estimated cost by model
  - User engagement: reads, archives, podcast plays
  - Search: OpenSearch hit rate, DynamoDB GSI fallback rate
  - Cost: daily/monthly breakdown by service

Storage: DynamoDB articles table with item_type='metric'
  PK: news_id = "metric_{type}_{date}"
"""
import logging
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional

import boto3
from boto3.dynamodb.conditions import Key, Attr

from config import settings
from config.constants import (
    AWS_REGION_DEFAULT,
    CATEGORIES_KOREAN,
    MBTI_GROUPS,
)

logger = logging.getLogger(__name__)

KST = timezone(timedelta(hours=9))


class MetricsService:
    """Collects and aggregates operational metrics from multiple sources."""

    def __init__(self, region: str = AWS_REGION_DEFAULT):
        self._region = region
        self._cw = boto3.client('cloudwatch', region_name=region)

    # ── Pipeline metrics ─────────────────────────────────────────────────

    async def get_pipeline_metrics(self, days: int = 7) -> Dict[str, Any]:
        """Pipeline performance from collection logs in DynamoDB."""
        dynamodb = boto3.resource('dynamodb', region_name=self._region)
        table = dynamodb.Table(settings.dynamodb_table_articles)

        cutoff = (datetime.now(KST) - timedelta(days=days)).strftime('%Y-%m-%d')

        try:
            resp = table.scan(
                FilterExpression=Attr('item_type').eq('collection_log') & Attr('date').gte(cutoff),
                Limit=100,
            )
            logs = resp.get('Items', [])
        except Exception as e:
            logger.warning(f"Collection log scan failed: {e}")
            logs = []

        if not logs:
            return {'period_days': days, 'runs': 0}

        durations = []
        total_new = 0
        total_failed = 0
        total_transformed = 0

        for log in logs:
            dur = log.get('duration_seconds', 0)
            if dur:
                durations.append(float(dur))
            total_new += int(log.get('new_articles', 0))
            total_failed += int(log.get('failed_articles', 0))
            total_transformed += int(log.get('transformed_articles', log.get('new_articles', 0)))

        durations.sort()
        n = len(durations)

        return {
            'period_days': days,
            'runs': len(logs),
            'total_articles': total_new,
            'total_transformed': total_transformed,
            'total_failed': total_failed,
            'avg_duration_seconds': round(sum(durations) / n, 1) if n else 0,
            'p95_duration_seconds': round(durations[int(n * 0.95)] if n >= 2 else (durations[0] if n else 0), 1),
            'p99_duration_seconds': round(durations[int(n * 0.99)] if n >= 2 else (durations[0] if n else 0), 1),
            'success_rate': round((len(logs) - sum(1 for l in logs if l.get('status') == 'error')) / len(logs) * 100, 1),
        }

    # ── Bedrock usage metrics ────────────────────────────────────────────

    async def get_bedrock_metrics(self, days: int = 7) -> Dict[str, Any]:
        """Bedrock model usage from CloudWatch."""
        end = datetime.now(timezone.utc)
        start = end - timedelta(days=days)

        models = {
            'claude_haiku': 'us.anthropic.claude-3-5-haiku-20241022-v1:0',
            'nova_lite': 'amazon.nova-lite-v1:0',
            'titan_embed': 'amazon.titan-embed-text-v2:0',
        }

        cost_rates = {
            'claude_haiku': {'input': 0.25, 'output': 1.25},
            'nova_lite': {'input': 0.06, 'output': 0.24},
            'titan_embed': {'input': 0.02, 'output': 0},
        }

        result = {'period_days': days, 'models': {}, 'total_cost_daily': 0}

        for name, model_id in models.items():
            try:
                resp = self._cw.get_metric_statistics(
                    Namespace='AWS/Bedrock',
                    MetricName='Invocations',
                    Dimensions=[{'Name': 'ModelId', 'Value': model_id}],
                    StartTime=start, EndTime=end,
                    Period=86400, Statistics=['Sum'],
                )
                total = sum(dp.get('Sum', 0) for dp in resp.get('Datapoints', []))
            except Exception:
                total = 0

            avg_in = 2000 if 'claude' in name else 1500 if 'nova' in name else 500
            avg_out = 2500 if 'claude' in name else 800 if 'nova' in name else 0
            rates = cost_rates[name]
            est_cost = (total * avg_in * rates['input'] + total * avg_out * rates['output']) / 1_000_000

            result['models'][name] = {
                'invocations': int(total),
                'daily_avg': round(total / max(days, 1), 1),
                'estimated_cost': round(est_cost, 4),
            }
            result['total_cost_daily'] += est_cost / max(days, 1)

        result['total_cost_daily'] = round(result['total_cost_daily'], 4)
        return result

    # ── User engagement metrics ──────────────────────────────────────────

    async def get_engagement_metrics(self, days: int = 7) -> Dict[str, Any]:
        """User engagement from Personal DB."""
        dynamodb = boto3.resource('dynamodb', region_name=self._region)
        table = dynamodb.Table(settings.dynamodb_table_personal)

        cutoff = (datetime.now(KST) - timedelta(days=days)).isoformat()

        # Count readings
        try:
            resp = table.scan(
                FilterExpression=Attr('item_type').eq('reading_record') & Attr('read_at').gte(cutoff),
                Select='COUNT', Limit=5000,
            )
            read_count = resp.get('Count', 0)
        except Exception:
            read_count = 0

        # Count archives
        try:
            resp = table.scan(
                FilterExpression=Attr('item_type').eq('archived_sentence') & Attr('created_at').gte(cutoff),
                Select='COUNT', Limit=5000,
            )
            archive_count = resp.get('Count', 0)
        except Exception:
            archive_count = 0

        # Count unique users (profiles)
        try:
            resp = table.scan(
                FilterExpression=Attr('sk').eq('PROFILE'),
                Select='COUNT', Limit=5000,
            )
            user_count = resp.get('Count', 0)
        except Exception:
            user_count = 0

        # Podcast plays
        try:
            podcast_table = dynamodb.Table(settings.dynamodb_table_podcast)
            resp = podcast_table.scan(
                FilterExpression=Attr('status').eq('completed'),
                Select='COUNT', Limit=5000,
            )
            podcast_count = resp.get('Count', 0)
        except Exception:
            podcast_count = 0

        return {
            'period_days': days,
            'total_reads': read_count,
            'daily_reads': round(read_count / max(days, 1), 1),
            'total_archives': archive_count,
            'total_users': user_count,
            'total_podcasts_generated': podcast_count,
        }

    # ── Search quality metrics ───────────────────────────────────────────

    async def get_search_metrics(self, days: int = 7) -> Dict[str, Any]:
        """Search quality from Lambda logs (CloudWatch)."""
        end = datetime.now(timezone.utc)
        start = end - timedelta(days=days)

        # Chatbot invocations (total)
        chatbot_total = 0
        try:
            resp = self._cw.get_metric_statistics(
                Namespace='AWS/Lambda', MetricName='Invocations',
                Dimensions=[{'Name': 'FunctionName', 'Value': 'sedaily-mbti-chatbot-dev'}],
                StartTime=start, EndTime=end, Period=86400 * days, Statistics=['Sum'],
            )
            chatbot_total = int(sum(dp.get('Sum', 0) for dp in resp.get('Datapoints', [])))
        except Exception:
            pass

        # Search invocations
        search_total = 0
        try:
            resp = self._cw.get_metric_statistics(
                Namespace='AWS/Lambda', MetricName='Invocations',
                Dimensions=[{'Name': 'FunctionName', 'Value': 'sedaily-mbti-search-dev'}],
                StartTime=start, EndTime=end, Period=86400 * days, Statistics=['Sum'],
            )
            search_total = int(sum(dp.get('Sum', 0) for dp in resp.get('Datapoints', [])))
        except Exception:
            pass

        return {
            'period_days': days,
            'chatbot_invocations': chatbot_total,
            'search_invocations': search_total,
            'opensearch_configured': bool(settings.opensearch_endpoint),
            'pgvector_configured': bool(settings.pg_password),
        }

    # ── Cost breakdown ───────────────────────────────────────────────────

    async def get_cost_breakdown(self, days: int = 7) -> Dict[str, Any]:
        """Cost breakdown by service."""
        bedrock = await self.get_bedrock_metrics(days)

        # Lambda cost estimate
        end = datetime.now(timezone.utc)
        start = end - timedelta(days=days)
        lambda_cost = 0
        try:
            resp = self._cw.get_metric_statistics(
                Namespace='AWS/Lambda', MetricName='Duration',
                StartTime=start, EndTime=end, Period=86400 * days, Statistics=['Sum'],
            )
            total_ms = sum(dp.get('Sum', 0) for dp in resp.get('Datapoints', []))
            gb_seconds = (total_ms / 1000) * 0.5
            lambda_cost = gb_seconds * 0.0000166667
        except Exception:
            pass

        # Fixed costs
        opensearch_daily = 0.036 * 24 if settings.opensearch_endpoint else 0
        rds_daily = 0.018 * 24 if settings.pg_password else 0

        bedrock_daily = bedrock['total_cost_daily']
        total_daily = bedrock_daily + lambda_cost / max(days, 1) + opensearch_daily + rds_daily

        return {
            'period_days': days,
            'bedrock_daily': round(bedrock_daily, 4),
            'lambda_daily': round(lambda_cost / max(days, 1), 4),
            'opensearch_daily': round(opensearch_daily, 2),
            'rds_daily': round(rds_daily, 2),
            'total_daily': round(total_daily, 2),
            'total_monthly': round(total_daily * 30, 2),
            'budget_remaining': 26000,
            'budget_months': round(26000 / max(total_daily * 30, 0.01), 1),
        }

    # ── Dashboard aggregate ──────────────────────────────────────────────

    async def get_dashboard(self, days: int = 7) -> Dict[str, Any]:
        """All metrics combined for the demo dashboard."""
        pipeline = await self.get_pipeline_metrics(days)
        bedrock = await self.get_bedrock_metrics(days)
        engagement = await self.get_engagement_metrics(days)
        search = await self.get_search_metrics(days)
        costs = await self.get_cost_breakdown(days)

        return {
            'generated_at': datetime.now(KST).isoformat(),
            'period_days': days,
            'pipeline': pipeline,
            'bedrock': bedrock,
            'engagement': engagement,
            'search': search,
            'costs': costs,
        }


# Singleton
_service: Optional[MetricsService] = None


def get_metrics_service() -> MetricsService:
    global _service
    if _service is None:
        _service = MetricsService()
    return _service
