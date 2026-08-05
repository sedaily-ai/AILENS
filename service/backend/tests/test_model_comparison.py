#!/usr/bin/env python3
"""
Model Comparison Test — Claude vs Nova Pro for MBTI Article Rewriting
======================================================================
Runs the same MBTI transformation prompts through both models on a
diverse set of articles and collects quantitative metrics.

Quality evaluation (tone, factual accuracy) is done separately by
the editorial team using the generated output files.

Metrics collected per article per model:
  - response_time_ms
  - input_tokens, output_tokens
  - cost (USD)
  - complete (all 4 MBTI versions present)
  - truncated (any version body < 100 chars)

Output: tests/results/model_comparison_{date}.json

Usage:
  python tests/test_model_comparison.py              # full 20 articles
  python tests/test_model_comparison.py --quick 3    # quick test with 3 articles

Prerequisites:
  - AWS credentials with Bedrock access (Claude Haiku + Nova Pro)
  - DynamoDB articles table with articles (or S3 XML for today)
  - ~20 minutes for full run (20 articles × 2 models × ~30s each)
"""
import argparse
import asyncio
import json
import logging
import os
import re
import sys
import time
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional

import boto3
from botocore.config import Config

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from clients.mbti_transform_service import MbtiTransformService
from config.constants import (
    BEDROCK_MODEL_ID_HAIKU,
    BEDROCK_MODEL_ID_NOVA_PRO,
    BEDROCK_REGION,
    MBTI_GROUPS,
    CATEGORIES_KOREAN,
)

logging.basicConfig(level=logging.WARNING)
logger = logging.getLogger(__name__)

KST = timezone(timedelta(hours=9))
TODAY = datetime.now(KST).strftime('%Y-%m-%d')
TODAY_YYYYMMDD = datetime.now(KST).strftime('%Y%m%d')

# Cost per 1M tokens (USD)
COST = {
    'claude_haiku': {'input': 0.25, 'output': 1.25},
    'nova_pro':     {'input': 0.80, 'output': 3.20},
}

# Target article counts per category
TARGET_DISTRIBUTION = {
    '경제': 5, 'IT_과학': 3, '사회': 3, '정치': 2,
    '문화': 2, '스포츠': 2, '국제': 3,
}

BEDROCK_CONFIG = Config(read_timeout=300, connect_timeout=60, retries={'max_attempts': 2})


# ── Fetch test articles ──────────────────────────────────────────────────────

def fetch_test_articles(total: int = 20) -> List[Dict[str, Any]]:
    """
    Fetch a diverse set of articles from DynamoDB GSI.
    Falls back to S3 XML if DynamoDB has too few.
    """
    from config import settings
    dynamodb = boto3.resource('dynamodb', region_name=settings.region)
    table = dynamodb.Table(settings.dynamodb_table_articles)
    from boto3.dynamodb.conditions import Key

    articles = []
    seen_ids = set()

    # Query each category
    for category, target in TARGET_DISTRIBUTION.items():
        if len(articles) >= total:
            break

        try:
            resp = table.query(
                IndexName='category-published_at-index',
                KeyConditionExpression=Key('category').eq(category),
                ScanIndexForward=False,
                Limit=target * 3,
            )

            for item in resp.get('Items', []):
                if len(articles) >= total:
                    break

                nid = item.get('news_id', '')
                content = item.get('content_ko', '')

                # Need sufficient content for meaningful transformation
                if nid in seen_ids or not content or len(content) < 300:
                    continue

                # Count how many from this category we already have
                cat_count = sum(1 for a in articles if a['category'] == category)
                if cat_count >= target:
                    break

                seen_ids.add(nid)
                articles.append({
                    'news_id': nid,
                    'title': item.get('title_ko', ''),
                    'sub_title': item.get('sub_title_ko', ''),
                    'content': content[:3000],
                    'category': category,
                })

        except Exception as e:
            logger.warning(f"Failed to fetch {category}: {e}")

    # Fallback to S3 XML if not enough articles
    if len(articles) < total:
        try:
            from clients.s3_xml_client import S3XMLClient
            s3_client = S3XMLClient(region='ap-northeast-2')
            xml_articles = asyncio.run(s3_client.get_articles_by_date(TODAY_YYYYMMDD))

            for a in xml_articles:
                if len(articles) >= total:
                    break
                if a.nsid in seen_ids or not a.content_clean or len(a.content_clean) < 300:
                    continue
                if a.action == 'D':
                    continue

                seen_ids.add(a.nsid)
                articles.append({
                    'news_id': a.nsid,
                    'title': a.title,
                    'sub_title': a.sub_title or '',
                    'content': a.content_clean[:3000],
                    'category': a.main_category,
                })
        except Exception as e:
            logger.warning(f"S3 XML fallback failed: {e}")

    return articles


# ── Model invocation ─────────────────────────────────────────────────────────

async def transform_with_claude(
    service: MbtiTransformService,
    article: Dict[str, Any],
) -> Dict[str, Any]:
    """Transform using Claude Haiku. Returns metrics + output."""
    start = time.time()
    try:
        result = await service.transform_article(
            title=article['title'],
            subtitle=article.get('sub_title', ''),
            content=article['content'],
            category=article['category'],
        )
        elapsed = int((time.time() - start) * 1000)

        versions = result.get('versions', {})
        usage = result.get('usage', {})

        return {
            'success': True,
            'response_time_ms': elapsed,
            'input_tokens': usage.get('input_tokens', 0),
            'output_tokens': usage.get('output_tokens', 0),
            'cache_read_tokens': usage.get('cache_read_input_tokens', 0),
            'complete': _check_complete(versions),
            'truncated': _check_truncated(versions),
            'versions': versions,
        }

    except Exception as e:
        elapsed = int((time.time() - start) * 1000)
        return {
            'success': False,
            'response_time_ms': elapsed,
            'error': str(e)[:200],
            'input_tokens': 0,
            'output_tokens': 0,
            'complete': False,
            'truncated': True,
            'versions': {},
        }


async def transform_with_nova(
    article: Dict[str, Any],
    system_prompt: str,
) -> Dict[str, Any]:
    """Transform using Nova Pro via Bedrock Converse API."""
    client = boto3.client('bedrock-runtime', region_name=BEDROCK_REGION, config=BEDROCK_CONFIG)

    user_message = (
        f"다음 경제 기사를 4가지 MBTI 그룹 스타일(NT, NF, ST, SF)로 변환해주세요.\n\n"
        f"[원본 제목] {article['title']}\n"
        f"[원본 부제목] {article.get('sub_title', '없음')}\n"
        f"[카테고리] {article.get('category', '경제')}\n\n"
        f"[원본 기사]\n{article['content']}"
    )

    start = time.time()
    try:
        # Nova Pro uses the Converse API (messages format)
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None,
            lambda: client.converse(
                modelId=BEDROCK_MODEL_ID_NOVA_PRO,
                system=[{'text': system_prompt}],
                messages=[{'role': 'user', 'content': [{'text': user_message}]}],
                inferenceConfig={'maxTokens': 8192, 'temperature': 0.3},
            ),
        )

        elapsed = int((time.time() - start) * 1000)

        text = response.get('output', {}).get('message', {}).get('content', [{}])[0].get('text', '')
        usage = response.get('usage', {})
        input_tokens = usage.get('inputTokens', 0)
        output_tokens = usage.get('outputTokens', 0)

        # Parse JSON from response
        json_match = re.search(r'\{[\s\S]*\}', text)
        if not json_match:
            return {
                'success': False, 'response_time_ms': elapsed,
                'error': 'No JSON in response', 'input_tokens': input_tokens,
                'output_tokens': output_tokens, 'complete': False, 'truncated': True,
                'versions': {},
            }

        versions = json.loads(json_match.group(0))

        return {
            'success': True,
            'response_time_ms': elapsed,
            'input_tokens': input_tokens,
            'output_tokens': output_tokens,
            'cache_read_tokens': 0,
            'complete': _check_complete(versions),
            'truncated': _check_truncated(versions),
            'versions': versions,
        }

    except Exception as e:
        elapsed = int((time.time() - start) * 1000)
        return {
            'success': False, 'response_time_ms': elapsed,
            'error': str(e)[:200], 'input_tokens': 0, 'output_tokens': 0,
            'complete': False, 'truncated': True, 'versions': {},
        }


def _check_complete(versions: dict) -> bool:
    """All 4 MBTI groups present with title + body."""
    for g in MBTI_GROUPS:
        v = versions.get(g, {})
        if not v.get('title') or not v.get('body'):
            return False
    return True


def _check_truncated(versions: dict) -> bool:
    """Any version body shorter than 100 chars."""
    for g in MBTI_GROUPS:
        v = versions.get(g, {})
        body = v.get('body', '')
        body_text = body if isinstance(body, str) else '\n'.join(body) if isinstance(body, list) else ''
        if len(body_text) < 100:
            return True
    return False


def _calc_cost(model_key: str, input_tokens: int, output_tokens: int) -> float:
    """Calculate cost in USD."""
    rates = COST.get(model_key, {'input': 0, 'output': 0})
    return (input_tokens * rates['input'] + output_tokens * rates['output']) / 1_000_000


# ── Main comparison ──────────────────────────────────────────────────────────

async def run_comparison(articles: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Run both models on all articles and collect metrics."""

    # Claude service (now uses parallel per-group calls internally)
    claude_service = MbtiTransformService(model_id=BEDROCK_MODEL_ID_HAIKU, region=BEDROCK_REGION)
    # Build a combined prompt for Nova comparison (Claude no longer uses combined prompts)
    group_prompts = {g: claude_service._load_group_prompt(g) or '' for g in MBTI_GROUPS}
    system_prompt = "4가지 MBTI 그룹 스타일로 변환하세요.\n\n" + "\n\n".join(
        f"[{g}]\n{p}" for g, p in group_prompts.items()
    )

    per_article = []
    claude_totals = {'times': [], 'costs': [], 'complete': 0, 'in_tok': 0, 'out_tok': 0, 'success': 0}
    nova_totals = {'times': [], 'costs': [], 'complete': 0, 'in_tok': 0, 'out_tok': 0, 'success': 0}

    total = len(articles)

    for idx, article in enumerate(articles):
        nid = article['news_id']
        cat = article['category']
        title_short = article['title'][:40]

        print(f"\n  [{idx+1}/{total}] {nid} ({cat}) {title_short}...")

        # Claude
        print(f"    Claude Haiku... ", end='', flush=True)
        claude_result = await transform_with_claude(claude_service, article)
        c_ms = claude_result['response_time_ms']
        c_cost = _calc_cost('claude_haiku', claude_result['input_tokens'], claude_result['output_tokens'])
        c_ok = '✓' if claude_result['success'] else '✗'
        print(f"{c_ok} {c_ms}ms, ${c_cost:.4f}")

        claude_totals['times'].append(c_ms)
        claude_totals['costs'].append(c_cost)
        claude_totals['in_tok'] += claude_result['input_tokens']
        claude_totals['out_tok'] += claude_result['output_tokens']
        if claude_result['complete']:
            claude_totals['complete'] += 1
        if claude_result['success']:
            claude_totals['success'] += 1

        # Nova Pro
        print(f"    Nova Pro...     ", end='', flush=True)
        nova_result = await transform_with_nova(article, system_prompt)
        n_ms = nova_result['response_time_ms']
        n_cost = _calc_cost('nova_pro', nova_result['input_tokens'], nova_result['output_tokens'])
        n_ok = '✓' if nova_result['success'] else '✗'
        print(f"{n_ok} {n_ms}ms, ${n_cost:.4f}")

        nova_totals['times'].append(n_ms)
        nova_totals['costs'].append(n_cost)
        nova_totals['in_tok'] += nova_result['input_tokens']
        nova_totals['out_tok'] += nova_result['output_tokens']
        if nova_result['complete']:
            nova_totals['complete'] += 1
        if nova_result['success']:
            nova_totals['success'] += 1

        per_article.append({
            'news_id': nid,
            'category': cat,
            'title': article['title'][:80],
            'content_length': len(article['content']),
            'claude': {
                'success': claude_result['success'],
                'response_time_ms': c_ms,
                'input_tokens': claude_result['input_tokens'],
                'output_tokens': claude_result['output_tokens'],
                'cost_usd': round(c_cost, 6),
                'complete': claude_result['complete'],
                'truncated': claude_result['truncated'],
                'error': claude_result.get('error', ''),
            },
            'nova_pro': {
                'success': nova_result['success'],
                'response_time_ms': n_ms,
                'input_tokens': nova_result['input_tokens'],
                'output_tokens': nova_result['output_tokens'],
                'cost_usd': round(n_cost, 6),
                'complete': nova_result['complete'],
                'truncated': nova_result['truncated'],
                'error': nova_result.get('error', ''),
            },
        })

        # Throttle between articles
        await asyncio.sleep(2)

    # Build summary
    def summarize(totals, model_name, total_count):
        times = totals['times']
        costs = totals['costs']
        return {
            'model_id': BEDROCK_MODEL_ID_HAIKU if 'claude' in model_name else BEDROCK_MODEL_ID_NOVA_PRO,
            'success_count': totals['success'],
            'success_rate': round(totals['success'] / total_count * 100, 1) if total_count else 0,
            'avg_response_time_ms': int(sum(times) / len(times)) if times else 0,
            'min_response_time_ms': min(times) if times else 0,
            'max_response_time_ms': max(times) if times else 0,
            'total_input_tokens': totals['in_tok'],
            'total_output_tokens': totals['out_tok'],
            'avg_cost_per_article': round(sum(costs) / len(costs), 6) if costs else 0,
            'total_cost_usd': round(sum(costs), 4),
            'completion_rate': round(totals['complete'] / total_count * 100, 1) if total_count else 0,
        }

    return {
        'test_date': TODAY,
        'total_articles': total,
        'categories': {cat: sum(1 for a in articles if a['category'] == cat) for cat in set(a['category'] for a in articles)},
        'claude_haiku': summarize(claude_totals, 'claude', total),
        'nova_pro': summarize(nova_totals, 'nova', total),
        'per_article': per_article,
    }


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description='Claude vs Nova Pro comparison')
    parser.add_argument('--quick', type=int, default=0, help='Quick test with N articles')
    args = parser.parse_args()

    target_count = args.quick if args.quick > 0 else 20

    print('')
    print('=' * 60)
    print('  Model Comparison: Claude Haiku vs Nova Pro')
    print(f'  Date: {TODAY}')
    print(f'  Target: {target_count} articles')
    print('=' * 60)

    # Fetch articles
    print(f'\n  Fetching {target_count} test articles...')
    articles = fetch_test_articles(total=target_count)
    print(f'  Found {len(articles)} articles')

    if not articles:
        print('  No articles found — cannot run comparison')
        sys.exit(1)

    # Distribution
    cats = {}
    for a in articles:
        cats[a['category']] = cats.get(a['category'], 0) + 1
    print(f'  Distribution: {cats}')

    # Run comparison
    print(f'\n  Running comparison ({len(articles)} articles × 2 models)...')
    report = asyncio.run(run_comparison(articles))

    # Save report
    results_dir = os.path.join(os.path.dirname(__file__), 'results')
    os.makedirs(results_dir, exist_ok=True)
    filename = f"model_comparison_{TODAY.replace('-', '')}.json"
    filepath = os.path.join(results_dir, filename)

    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(report, f, ensure_ascii=False, indent=2, default=str)

    # Print summary
    c = report['claude_haiku']
    n = report['nova_pro']

    print('')
    print('=' * 60)
    print('  COMPARISON RESULTS')
    print('=' * 60)
    print('')
    print(f'  {"Metric":<30} {"Claude Haiku":>15} {"Nova Pro":>15}')
    print(f'  {"-"*30} {"-"*15} {"-"*15}')
    print(f'  {"Success rate":<30} {c["success_rate"]:>14.1f}% {n["success_rate"]:>14.1f}%')
    print(f'  {"Completion rate (4/4)":<30} {c["completion_rate"]:>14.1f}% {n["completion_rate"]:>14.1f}%')
    print(f'  {"Avg response time":<30} {c["avg_response_time_ms"]:>12}ms {n["avg_response_time_ms"]:>12}ms')
    print(f'  {"Avg cost per article":<30} ${c["avg_cost_per_article"]:>13.4f} ${n["avg_cost_per_article"]:>13.4f}')
    print(f'  {"Total cost":<30} ${c["total_cost_usd"]:>13.4f} ${n["total_cost_usd"]:>13.4f}')
    print(f'  {"Total input tokens":<30} {c["total_input_tokens"]:>15,} {n["total_input_tokens"]:>15,}')
    print(f'  {"Total output tokens":<30} {c["total_output_tokens"]:>15,} {n["total_output_tokens"]:>15,}')
    print('')
    print(f'  Report saved: {filepath}')
    print('')


if __name__ == '__main__':
    main()
