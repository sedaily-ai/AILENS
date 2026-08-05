#!/usr/bin/env python3
"""
Performance Benchmark — Latency measurements for demo presentation
====================================================================
Measures response times across all backend services and generates
a performance report.

Tests:
  1. API endpoint latencies (all routes)
  2. DynamoDB GSI search latency
  3. Bedrock model latency (embed, transform)
  4. Overall dashboard metrics collection time

Usage:
  python tests/test_performance.py
  python tests/test_performance.py --quick    # API latency only

Output: tests/results/performance_{date}.json
"""
import argparse
import asyncio
import json
import os
import sys
import time
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List

import requests

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

API_URL = os.getenv('API_URL', 'https://chzwwtjtgk.execute-api.us-east-1.amazonaws.com/dev')
REGION = os.getenv('AWS_REGION', 'us-east-1')
KST = timezone(timedelta(hours=9))
TODAY = datetime.now(KST).strftime('%Y-%m-%d')
TODAY_YYYYMMDD = datetime.now(KST).strftime('%Y%m%d')
TIMEOUT = 30


def timed_get(path: str) -> Dict[str, Any]:
    start = time.time()
    try:
        resp = requests.get(f'{API_URL}{path}', timeout=TIMEOUT)
        ms = int((time.time() - start) * 1000)
        return {'status': resp.status_code, 'latency_ms': ms, 'ok': resp.status_code == 200}
    except Exception as e:
        ms = int((time.time() - start) * 1000)
        return {'status': 0, 'latency_ms': ms, 'ok': False, 'error': str(e)[:100]}


def timed_post(path: str, body: dict) -> Dict[str, Any]:
    start = time.time()
    try:
        resp = requests.post(f'{API_URL}{path}', json=body, headers={'Content-Type': 'application/json'}, timeout=TIMEOUT)
        ms = int((time.time() - start) * 1000)
        return {'status': resp.status_code, 'latency_ms': ms, 'ok': resp.status_code == 200}
    except Exception as e:
        ms = int((time.time() - start) * 1000)
        return {'status': 0, 'latency_ms': ms, 'ok': False, 'error': str(e)[:100]}


# ── API Latency Tests ────────────────────────────────────────────────────────

def test_api_latencies() -> List[Dict[str, Any]]:
    """Measure all API endpoint response times."""
    tests = [
        ('GET', '/s3-articles', f'/s3-articles?date={TODAY_YYYYMMDD}&limit=5'),
        ('POST', '/api/search', None),
        ('POST', '/api/chat', None),
        ('GET', '/time-machine', '/time-machine?date=2025-06-15'),
        ('GET', '/api/metrics/dashboard', '/api/metrics/dashboard?days=3'),
        ('GET', '/api/recommend', '/api/recommend?user_id=perf-test&limit=3'),
        ('GET', '/api/archive', '/api/archive?user_id=perf-test'),
    ]

    bodies = {
        '/api/search': {'query': '*', 'filters': {'published_from': '2026-04-01', 'published_until': TODAY}, 'page': 1, 'page_size': 5},
        '/api/chat': {'message': '오늘 경제 뉴스', 'mbti_group': 'NT', 'conversation_history': []},
    }

    results = []
    for method, name, path in tests:
        actual_path = path or name
        print(f'  {method:4} {name:<30}', end='', flush=True)

        if method == 'GET':
            r = timed_get(actual_path)
        else:
            r = timed_post(actual_path, bodies.get(name, {}))

        status_icon = '✓' if r['ok'] else '✗' if r['status'] > 0 else '⊘'
        print(f'  {status_icon} {r["latency_ms"]:>6}ms  (HTTP {r["status"]})')

        results.append({
            'endpoint': name,
            'method': method,
            **r,
        })

    return results


# ── Direct service latencies ─────────────────────────────────────────────────

def test_dynamodb_latency() -> Dict[str, Any]:
    """Measure DynamoDB GSI query latency."""
    import boto3
    from boto3.dynamodb.conditions import Key

    dynamodb = boto3.resource('dynamodb', region_name=REGION)
    table = dynamodb.Table('sedaily-mbti-articles-dev')

    timings = []
    for cat in ['경제', 'IT_과학', '사회']:
        start = time.time()
        try:
            table.query(
                IndexName='category-published_at-index',
                KeyConditionExpression=Key('category').eq(cat),
                ScanIndexForward=False,
                Limit=5,
            )
            timings.append(int((time.time() - start) * 1000))
        except Exception:
            timings.append(-1)

    return {
        'service': 'dynamodb_gsi',
        'queries': len(timings),
        'avg_ms': round(sum(t for t in timings if t >= 0) / max(len([t for t in timings if t >= 0]), 1)),
        'timings_ms': timings,
    }


def test_embedding_latency() -> Dict[str, Any]:
    """Measure Bedrock Titan embedding latency."""
    try:
        from clients.embedding_client import EmbeddingClient
        client = EmbeddingClient()

        # Short text
        start = time.time()
        client.embed_text('삼성전자 1분기 실적 분석')
        short_ms = int((time.time() - start) * 1000)

        # Medium text
        text = '삼성전자가 1분기 영업이익 6조원을 달성했다. ' * 20
        start = time.time()
        client.embed_text(text)
        medium_ms = int((time.time() - start) * 1000)

        return {
            'service': 'bedrock_embedding',
            'short_text_ms': short_ms,
            'medium_text_ms': medium_ms,
        }
    except Exception as e:
        return {'service': 'bedrock_embedding', 'error': str(e)[:100]}


def test_metrics_collection_latency() -> Dict[str, Any]:
    """Measure how long the metrics dashboard takes to collect."""
    try:
        from services.metrics_service import get_metrics_service
        svc = get_metrics_service()

        start = time.time()
        asyncio.run(svc.get_dashboard(3))
        ms = int((time.time() - start) * 1000)

        return {'service': 'metrics_dashboard', 'latency_ms': ms}
    except Exception as e:
        return {'service': 'metrics_dashboard', 'error': str(e)[:100]}


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description='Performance benchmark')
    parser.add_argument('--quick', action='store_true', help='API latency only')
    args = parser.parse_args()

    print('')
    print('=' * 60)
    print('  Performance Benchmark — AI LENS Backend')
    print(f'  API: {API_URL}')
    print(f'  Date: {TODAY}')
    print('=' * 60)
    print('')

    report: Dict[str, Any] = {'date': TODAY, 'api_url': API_URL}

    # API latencies
    print('── API Endpoint Latencies ──')
    print('')
    api_results = test_api_latencies()
    report['api_latencies'] = api_results

    ok_latencies = [r['latency_ms'] for r in api_results if r['ok']]
    if ok_latencies:
        report['api_summary'] = {
            'tested': len(api_results),
            'ok': len(ok_latencies),
            'avg_ms': round(sum(ok_latencies) / len(ok_latencies)),
            'min_ms': min(ok_latencies),
            'max_ms': max(ok_latencies),
            'p95_ms': sorted(ok_latencies)[int(len(ok_latencies) * 0.95)] if len(ok_latencies) >= 2 else max(ok_latencies),
        }
        print(f'\n  Summary: {len(ok_latencies)}/{len(api_results)} OK, avg={report["api_summary"]["avg_ms"]}ms, p95={report["api_summary"]["p95_ms"]}ms')

    if not args.quick:
        # DynamoDB
        print('\n── DynamoDB GSI Latency ──\n')
        ddb = test_dynamodb_latency()
        report['dynamodb'] = ddb
        print(f'  GSI query avg: {ddb.get("avg_ms", "?")}ms ({ddb.get("queries", 0)} queries)')

        # Embedding
        print('\n── Bedrock Embedding Latency ──\n')
        emb = test_embedding_latency()
        report['embedding'] = emb
        if 'error' not in emb:
            print(f'  Short text: {emb["short_text_ms"]}ms')
            print(f'  Medium text: {emb["medium_text_ms"]}ms')
        else:
            print(f'  Error: {emb["error"]}')

        # Metrics collection
        print('\n── Metrics Dashboard Collection ──\n')
        met = test_metrics_collection_latency()
        report['metrics_collection'] = met
        if 'error' not in met:
            print(f'  Dashboard collection: {met["latency_ms"]}ms')
        else:
            print(f'  Error: {met["error"]}')

    # Save report
    results_dir = os.path.join(os.path.dirname(__file__), 'results')
    os.makedirs(results_dir, exist_ok=True)
    filename = f"performance_{TODAY.replace('-', '')}.json"
    filepath = os.path.join(results_dir, filename)

    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(report, f, ensure_ascii=False, indent=2, default=str)

    print(f'\n  Report saved: {filepath}')
    print('')


if __name__ == '__main__':
    main()
