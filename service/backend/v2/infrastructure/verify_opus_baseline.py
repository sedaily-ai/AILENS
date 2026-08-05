"""verify_opus_baseline.py — TASK-2.3 Phase B prep.

Measures Opus 4.6 baseline latency and verifies whether 1-hour cache TTL is
honored on Bedrock for ``us.anthropic.claude-opus-4-6-v1:0``. Results inform:

* ``core2_transform.WAVE_DEADLINE_BUFFER_S`` sizing (Phase B constant)
* TASK-2.3 cache TTL strategy decision (Option Z: deferred per .clauderules
  #1; this script confirms the underlying capability but the Phase B handler
  intentionally does not exercise it — kept for a future TASK)

This is a one-shot diagnostic tool, NOT part of the deployed Lambda code.
Sits in v2/infrastructure/ alongside other measurement / provisioning utils.

Usage
-----
    cd backend
    python3 v2/infrastructure/verify_opus_baseline.py [flags]

Flags
-----
    --small             use 3k-char article (~$0.60 instead of ~$2.05)
    --skip-phase2       latency only, no 6-min cache TTL sleep
    --skip-confirm      bypass interactive cost confirmation
    --article-id <id>   reproduce with specific news_id (else auto-select from S3)

Defaults are full-mode (~$2.05, ~16 min wall-clock). A cost preview + confirm
prompt fires before any billable call. AWS account is verified against the
expected production account (887078546492) at startup; a mismatch aborts.

Output
------
Prints a structured JSON block to stdout intended for direct paste into the
TASK-2.3 prep commit body. Includes selected article news_id (for
reproducibility via ``--article-id``), per-call usage, and PASS/FAIL verdicts.

Network path
------------
Defaults to the public Bedrock endpoint
(``bedrock-runtime.us-east-1.amazonaws.com``). Latency includes the
local ↔ us-east-1 round-trip; production Lambda inside
``vpce-08cbef4cbd9f0c830`` will see lower latency. Treat measurements as
upper bounds (sizing-conservative).
"""
from __future__ import annotations

import argparse
import json
import sys
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

import boto3
from botocore.config import Config


# ── Constants ──────────────────────────────────────────────────────────────────

EXPECTED_ACCOUNT = "887078546492"
# Inference profile ID for Opus 4.6 in account 887078546492.
# Note: AWS dropped the ``:0`` version suffix for Opus 4.6+ (older models like
# 4.5 retain ``...-v1:0``). v1 ``config/constants.py`` still has the stale
# ``...-v1:0`` form which Bedrock rejects with ValidationException —
# surfaced here, flagged for a separate v1 fix (out of scope per .clauderules #1).
MODEL_ID = "us.anthropic.claude-opus-4-6-v1"
REGION = "us-east-1"
S3_BUCKET = "sedaily-mbti-article-body-v2-dev"
S3_PREFIX = "articles/"

# Cost estimates per call. Opus 4.6 pricing: input $15/M, output $75/M.
# Realistic article ≈ 6000 chars ≈ 9500 input tokens; max_tokens=1500 output.
COST_FULL_PER_CALL = 0.143 + 0.113   # ≈ $0.256 per call
COST_SMALL_PER_CALL = 0.067 + 0.060  # ≈ $0.127 per call

# Phase 1: 1 warmup + 5 measured. Phase 2: 2 calls (TTL Run A + Run B).
N_WARMUP = 1
N_MEASURED = 5

# Phase 2 sleep: must exceed default 5-min ephemeral TTL while staying under 1h.
PHASE2_SLEEP_S = 360

# Boto3 timeout: generous (we measure latency, never throttle it ourselves).
BEDROCK_CONFIG = Config(
    read_timeout=600,
    connect_timeout=60,
    retries={"max_attempts": 2},
)

ARTICLE_SIZE_FULL_MIN = 4000
ARTICLE_SIZE_FULL_MAX = 8000
ARTICLE_SIZE_SMALL_MIN = 1500
ARTICLE_SIZE_SMALL_MAX = 3500

GROUP_LABELS = {
    "NT": "전략형 분석가",
    "NF": "가치형 해석자",
    "ST": "실용형 실무자",
    "SF": "공감형 소통가",
}


# ── AWS account verification ───────────────────────────────────────────────────


def verify_aws_account() -> Dict[str, str]:
    """Abort if active credentials point to a different AWS account."""
    sts = boto3.client("sts")
    identity = sts.get_caller_identity()
    account = identity["Account"]
    if account != EXPECTED_ACCOUNT:
        print(f"ERROR: Wrong AWS account ({account}). Expected {EXPECTED_ACCOUNT}.")
        print("Check $AWS_PROFILE or ~/.aws/credentials.")
        sys.exit(1)
    print(f"Account: {account}")
    print(f"Caller:  {identity['Arn']}")
    return identity


# ── Phase 0: System prompt size comparison (free, no Bedrock calls) ───────────


def _prompts_dir() -> Path:
    """``backend/prompts/transform/`` resolved from this file's location."""
    return Path(__file__).resolve().parents[2] / "prompts" / "transform"


def load_group_prompt_md(group: str) -> str:
    return (_prompts_dir() / f"{group.lower()}.md").read_text(encoding="utf-8")


def build_group_system_prompt(group: str) -> str:
    """Mirror v1 ``MbtiTransformService._build_group_system_prompt`` (line 113-138)
    so the verify-time system prompt byte-matches what production sends — this
    matters if we ever extend the script to assert cache reuse against
    production-warmed cache entries."""
    label = GROUP_LABELS[group]
    group_prompt = load_group_prompt_md(group)
    return f"""당신은 서울경제신문의 MBTI 맞춤형 뉴스 변환 전문가입니다.
다음 경제 기사를 [{label}] 스타일로 변환합니다.
아래 가이드라인을 정확히 따라주세요.

{group_prompt}

[출력 형식] 반드시 아래 JSON으로 출력:
{{
  "title": "제목 (50자 내외)",
  "subtitle": "부제목 (1~2문장)",
  "body": "본문 (마크다운)",
  "key_points": ["핵심 포인트 1", "핵심 포인트 2", "핵심 포인트 3"],
  "closing_line": "마무리 한 줄"
}}"""


def phase0_compare_group_sizes() -> Dict[str, Any]:
    """Free comparison of 4 group system prompts. Warn if >20% spread.

    Single-group latency (NT) generalizes safely only when the four group
    system prompts are within ~20% of each other in size. Larger spread →
    NT-only measurement understates latency on bigger groups.
    """
    print("\nPhase 0: System prompt size comparison (no Bedrock calls)")
    sizes = {g: len(build_group_system_prompt(g)) for g in ("NT", "NF", "ST", "SF")}
    for g, n in sizes.items():
        print(f"  {g}: {n:>6,d} chars")
    smallest = min(sizes.values())
    largest = max(sizes.values())
    spread = (largest - smallest) / smallest
    largest_group = max(sizes, key=sizes.get)
    warning = None
    if spread > 0.20:
        warning = (
            f"WARN: spread {spread:.1%} > 20%. NT-only latency may underestimate "
            f"larger groups (e.g. {largest_group} = {largest:,d} chars vs "
            f"NT = {sizes['NT']:,d}). Consider Phase D re-measurement on larger groups."
        )
        print(f"  {warning}")
    else:
        print(f"  Spread: {spread:.1%} — within 20% threshold; NT measurement representative")
    return {
        "sizes_chars": sizes,
        "spread_ratio": round(spread, 4),
        "warning": warning,
    }


# ── Sample article from S3 ─────────────────────────────────────────────────────


def fetch_sample_article(article_id: Optional[str], small_mode: bool) -> Dict[str, Any]:
    """Fetch one ``original.json`` from the v2 S3 bucket.

    ``article_id`` overrides auto-select for reproducibility. Auto mode walks
    the first 100 keys and picks the first article in the size band
    appropriate for the requested mode (full / small).
    """
    s3 = boto3.client("s3", region_name=REGION)

    if article_id:
        key = f"{S3_PREFIX}{article_id}/original.json"
        print(f"\nFetching sample article from S3: {key} (--article-id specified)")
        article = json.loads(
            s3.get_object(Bucket=S3_BUCKET, Key=key)["Body"].read().decode("utf-8")
        )
        content = article.get("content_ko") or ""
        if not content:
            raise RuntimeError(f"article {article_id} has no content_clean/content")
        return {
            "news_id": article_id,
            "title": article.get("title_ko", ""),
            "content": content,
            "char_count": len(content),
            "source": f"s3://{S3_BUCKET}/{key} (--article-id)",
        }

    print("\nFetching sample article from S3 (auto-select)")
    target_min, target_max = (
        (ARTICLE_SIZE_SMALL_MIN, ARTICLE_SIZE_SMALL_MAX)
        if small_mode
        else (ARTICLE_SIZE_FULL_MIN, ARTICLE_SIZE_FULL_MAX)
    )
    paginator = s3.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=S3_BUCKET, Prefix=S3_PREFIX, MaxKeys=100):
        for obj in page.get("Contents", []):
            if not obj["Key"].endswith("/original.json"):
                continue
            try:
                resp = s3.get_object(Bucket=S3_BUCKET, Key=obj["Key"])
                article = json.loads(resp["Body"].read().decode("utf-8"))
            except Exception as exc:
                print(f"  skip {obj['Key']}: {exc}")
                continue
            content = article.get("content_ko") or ""
            n = len(content)
            if target_min <= n <= target_max:
                news_id = obj["Key"].split("/")[1]
                print(f"  selected news_id={news_id} ({n:,} chars) [{obj['Key']}]")
                return {
                    "news_id": news_id,
                    "title": article.get("title_ko", ""),
                    "content": content,
                    "char_count": n,
                    "source": f"s3://{S3_BUCKET}/{obj['Key']} (auto)",
                }
    raise RuntimeError(
        f"no S3 article found in size range [{target_min}, {target_max}] in entire bucket. "
        f"Try --article-id <id> or --small."
    )


# ── Single Bedrock invoke ──────────────────────────────────────────────────────


def invoke_once(
    client: Any,
    system_prompt: str,
    user_msg: str,
    *,
    ttl_1h: bool,
    max_tokens: int = 1500,
) -> Dict[str, Any]:
    """One Opus 4.6 call. Returns wall-clock latency + usage breakdown.

    cache_control:
      ``{"type": "ephemeral"}``           — default 5min TTL
      ``{"type": "ephemeral", "ttl": "1h"}`` — extended 1h TTL (per AWS Jan 2026 GA)

    Verify both shapes by toggling ``ttl_1h``.
    """
    cache_control: Dict[str, str] = {"type": "ephemeral"}
    if ttl_1h:
        cache_control["ttl"] = "1h"
    body = json.dumps({
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": max_tokens,
        "system": [
            {"type": "text", "text": system_prompt, "cache_control": cache_control}
        ],
        "messages": [{"role": "user", "content": user_msg}],
    })
    start = time.time()
    response = client.invoke_model(
        modelId=MODEL_ID,
        contentType="application/json",
        accept="application/json",
        body=body,
    )
    latency_s = round(time.time() - start, 3)
    payload = json.loads(response["body"].read())
    usage = payload.get("usage", {})
    # Bedrock Opus 4.6+ usage includes a ``cache_creation`` breakdown by TTL
    # bucket — absent on older models that only support 5m. Both fields may
    # be 0 when the breakpoint matched an existing cache (pure read) or on
    # the very first call before any cache writes.
    creation_breakdown = usage.get("cache_creation") or {}
    return {
        "latency_s": latency_s,
        "input_tokens": usage.get("input_tokens", 0),
        "output_tokens": usage.get("output_tokens", 0),
        "cache_creation_input_tokens": usage.get("cache_creation_input_tokens", 0),
        "cache_read_input_tokens": usage.get("cache_read_input_tokens", 0),
        "ephemeral_5m_creation_tokens": creation_breakdown.get("ephemeral_5m_input_tokens", 0),
        "ephemeral_1h_creation_tokens": creation_breakdown.get("ephemeral_1h_input_tokens", 0),
        "stop_reason": payload.get("stop_reason"),
    }


def build_user_msg(article: Dict[str, Any]) -> str:
    """Mirror v1 user-message format from
    ``MbtiTransformService.transform_single_group`` (line 170-177).
    """
    return (
        f"다음 경제 기사를 NT 스타일로 변환해주세요.\n\n"
        f"[원본 제목] {article.get('title', '')}\n"
        f"[원본 부제목] 없음\n"
        f"[카테고리] 경제\n\n"
        f"[원본 기사]\n{article['content']}"
    )


# ── Phase 1: latency baseline ──────────────────────────────────────────────────


def percentile(sorted_list: List[float], pct: float) -> float:
    """Nearest-rank percentile (no interpolation). pct in [0, 100]."""
    if not sorted_list:
        return float("nan")
    idx = max(0, min(len(sorted_list) - 1, int(round(pct / 100.0 * len(sorted_list))) - 1))
    return sorted_list[idx]


def phase1_latency(client: Any, system_prompt: str, user_msg: str) -> Dict[str, Any]:
    """Sequential single-group calls. ``N_WARMUP`` dropped, ``N_MEASURED`` retained."""
    print(f"\nPhase 1: Latency baseline (NT group, sequential, "
          f"{N_WARMUP} warmup + {N_MEASURED} measured)")
    samples: List[float] = []
    raw_results: List[Dict[str, Any]] = []
    for i in range(N_WARMUP + N_MEASURED):
        result = invoke_once(client, system_prompt, user_msg, ttl_1h=False)
        if i < N_WARMUP:
            print(f"  [warmup {i+1}/{N_WARMUP}] {result['latency_s']:6.2f}s — DROPPED")
        else:
            samples.append(result["latency_s"])
            raw_results.append(result)
            print(f"  [measure {i-N_WARMUP+1}/{N_MEASURED}] {result['latency_s']:6.2f}s "
                  f"in={result['input_tokens']} out={result['output_tokens']} "
                  f"cache_creation={result['cache_creation_input_tokens']} "
                  f"cache_read={result['cache_read_input_tokens']}")
    samples.sort()
    return {
        "n_samples": len(samples),
        "min_s": samples[0],
        "p50_s": percentile(samples, 50),
        "p95_s": percentile(samples, 95),
        "p99_s": percentile(samples, 99),
        "max_s": samples[-1],
        "raw_latencies_s": samples,
        "raw_results": raw_results,
        "note": (
            f"n={len(samples)} samples — p99 with this n is the max; treat as "
            "upper bound only. Also: measured from local (public Bedrock endpoint), "
            "production VPCE path will be lower."
        ),
    }


# ── Phase 2: TTL 1h verification ───────────────────────────────────────────────


def phase2_ttl_check(client: Any, system_prompt: str, user_msg: str) -> Dict[str, Any]:
    """Run A → sleep > 5min → Run B. ``cache_read>0`` in Run B = 1h TTL works.

    Failure modes distinguishable by output:
    * Run A returns ``cache_creation>0`` then Run B returns ``cache_read>0``
      → 1h TTL honored (PASS)
    * Run B returns ``cache_read=0`` despite identical body
      → Bedrock either silently dropped the ``ttl`` field or only honors the
        5min default for this model/account (FAIL)
    * Either run raises ``ValidationException`` mentioning ``ttl``
      → Bedrock rejected the field outright (caught by outer handler; not
        expected per Jan 2026 GA announcement)
    """
    # Unique marker so Phase 2 creates a FRESH cache entry isolated from any
    # 5min-TTL cache Phase 1 may have just written. Without this, Run A would
    # read Phase 1's stale cache (Anthropic doesn't upgrade TTL on cache hit),
    # and Run B would see false FAIL when the 1h TTL is actually honored.
    # Marker is at the START of the system prompt so it's part of the cache
    # key prefix (cache_control breakpoint sits at the END of the system text).
    marker = f"[verify-run: {uuid.uuid4()}]\n\n"
    p2_system_prompt = marker + system_prompt
    print(f"\nPhase 2: TTL 1h verification (sleep {PHASE2_SLEEP_S}s = "
          f"{PHASE2_SLEEP_S//60}min between calls)")
    print(f"  [cache key isolation] prepended marker: {marker.strip()}")
    print("  [Run A] invoking with cache_control.ttl=1h ...")
    result_a = invoke_once(client, p2_system_prompt, user_msg, ttl_1h=True)
    print(f"    cache_creation={result_a['cache_creation_input_tokens']} "
          f"(5m={result_a['ephemeral_5m_creation_tokens']}, "
          f"1h={result_a['ephemeral_1h_creation_tokens']}) "
          f"cache_read={result_a['cache_read_input_tokens']} "
          f"latency={result_a['latency_s']}s")
    if result_a["cache_creation_input_tokens"] == 0:
        print("    WARN: Run A had no cache_creation — marker collision unlikely "
              "but possible. Verify result_a.cache_read=0 below.")
    elif result_a["ephemeral_1h_creation_tokens"] == 0 and result_a["ephemeral_5m_creation_tokens"] > 0:
        print("    EARLY-FAIL SIGNAL: Run A wrote to 5m bucket despite ttl='1h' — "
              "Bedrock silently ignored the 1h request on this model. "
              "Run B will likely FAIL.")
    elif result_a["ephemeral_1h_creation_tokens"] > 0:
        print("    EARLY-PASS SIGNAL: Run A wrote to 1h bucket — Bedrock accepted "
              "ttl='1h'. Proceeding to verify 6min survival.")
    print(f"  [sleeping {PHASE2_SLEEP_S}s — exceeds default 5min TTL, "
          f"within claimed 1h TTL]")
    time.sleep(PHASE2_SLEEP_S)
    print("  [Run B] invoking same prompt ...")
    result_b = invoke_once(client, p2_system_prompt, user_msg, ttl_1h=True)
    print(f"    cache_creation={result_b['cache_creation_input_tokens']} "
          f"(5m={result_b['ephemeral_5m_creation_tokens']}, "
          f"1h={result_b['ephemeral_1h_creation_tokens']}) "
          f"cache_read={result_b['cache_read_input_tokens']} "
          f"latency={result_b['latency_s']}s")
    passed = result_b["cache_read_input_tokens"] > 0
    return {
        "run_a": result_a,
        "run_b": result_b,
        "sleep_s": PHASE2_SLEEP_S,
        "cache_key_marker": marker.strip(),
        "ttl_1h_supported": passed,
        "verdict": (
            "PASS: 1h TTL honored on Opus 4.6 — cache_read>0 after 6min sleep "
            "with isolated cache key"
            if passed
            else "FAIL: cache_read=0 after 6min — Bedrock either silently ignored "
                 "ttl='1h' or only honors 5min default for this model"
        ),
    }


# ── Cost confirmation ──────────────────────────────────────────────────────────


def estimate_cost(small: bool, skip_phase2: bool) -> float:
    per_call = COST_SMALL_PER_CALL if small else COST_FULL_PER_CALL
    n_calls = N_WARMUP + N_MEASURED + (0 if skip_phase2 else 2)
    return per_call * n_calls


def confirm_cost(mode_str: str, est_cost: float, est_min: int) -> bool:
    print(f"\n  Mode:           {mode_str}")
    print(f"  Estimated cost: ${est_cost:.2f}")
    print(f"  Wall-clock:     ~{est_min} min")
    response = input("  Proceed? [y/N]: ").strip().lower()
    return response == "y"


# ── Main ───────────────────────────────────────────────────────────────────────


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Measure Opus 4.6 baseline latency + verify 1h cache TTL on Bedrock."
    )
    parser.add_argument("--small", action="store_true",
                        help="use 3k-char article (~$0.60 vs ~$2.05)")
    parser.add_argument("--skip-phase2", action="store_true",
                        help="latency only, skip 6-min cache TTL verification")
    parser.add_argument("--skip-confirm", action="store_true",
                        help="bypass cost confirmation prompt")
    parser.add_argument("--article-id", type=str, default=None,
                        help="reproduce with specific news_id (else auto-select)")
    args = parser.parse_args()

    print("=== verify_opus_baseline.py ===")
    print(f"Model:    {MODEL_ID}")
    print(f"Region:   {REGION}")
    print("Endpoint: public (default boto3 resolution)")

    verify_aws_account()
    phase0 = phase0_compare_group_sizes()

    article = fetch_sample_article(args.article_id, args.small)
    system_prompt = build_group_system_prompt("NT")
    user_msg = build_user_msg(article)

    print(f"\nSelected article: news_id={article['news_id']}")
    print(f"  source:              {article['source']}")
    print(f"  content_chars:       {article['char_count']:,}")
    print(f"  user_msg_chars:      {len(user_msg):,}")
    print(f"  system_prompt_chars: {len(system_prompt):,}")

    mode_str = "small" if args.small else "full"
    if args.skip_phase2:
        mode_str += " (no Phase 2)"
    est_cost = estimate_cost(args.small, args.skip_phase2)
    n_calls = N_WARMUP + N_MEASURED + (0 if args.skip_phase2 else 2)
    # ~80s per Opus call avg, plus 6-min Phase 2 sleep, +1 min buffer.
    est_min = int((n_calls * 80 + (0 if args.skip_phase2 else PHASE2_SLEEP_S)) / 60) + 1

    if not args.skip_confirm:
        if not confirm_cost(mode_str, est_cost, est_min):
            print("Aborted by user.")
            return 1

    client = boto3.client("bedrock-runtime", region_name=REGION, config=BEDROCK_CONFIG)
    p1 = phase1_latency(client, system_prompt, user_msg)
    p2 = None if args.skip_phase2 else phase2_ttl_check(client, system_prompt, user_msg)

    summary = {
        "model_id": MODEL_ID,
        "region": REGION,
        "endpoint": "public",
        "mode": mode_str,
        "estimated_cost_usd": round(est_cost, 2),
        "sample_article": {
            "news_id": article["news_id"],
            "char_count": article["char_count"],
            "source": article["source"],
        },
        "system_prompt_chars": len(system_prompt),
        "phase0_group_sizes": phase0,
        "phase1_latency": p1,
        "phase2_cache_ttl": p2,
    }
    print("\n=== RESULTS (JSON for C1 commit body) ===")
    print(json.dumps(summary, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
