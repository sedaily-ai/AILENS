"""Post-TASK-7-Z-3 health diagnostic v3 — read-only, autonomous.

v2 → v3
-------
v2 had a parser bug in the issue-type aggregation: it tried to read
the `issues` field from CloudWatch Logs Insights `fields ... issues`
output and `json.loads` it as a string. Insights does not always
return nested arrays as parseable JSON strings — actual v2 run on
2026-04-30T05:31 returned hallucination_count=0 / structural_count=0
even though raw_log_peek clearly showed 100% hallucination rejects.
v3 drops `fields ... issues` entirely; pulls @message itself, parses
the full JSON object Python-side using a depth-counted brace scan
(same approach _parse_ai_issues uses on Nova responses). Insulated
from any Insights nested-field serialization quirks.

v1 → v2 (kept for context)
--------------------------
v1's `parse @message '"event":"*"'` was missing the space after the
colon. Python json.dumps default separator emits '"event": "value"'.
v2 dropped parse, used 7 individual exact-match queries.

Purpose
-------
Verify that the Validator contract fix (commit 9d13cf3) is actually
producing transformed_at rows in production, and quantify the residual
Nova Lite hallucination reject rate so we can decide between three
remediation paths (a/b/c) per the chat session plan:

  (a) Natural accumulation only — Validator fix is enough, no further
      action needed beyond pushing the 7 unpushed commits.
  (b) Nova Lite reject rate is meaningful — improve the prompt
      (excerpt parity, requested-group filter on Nova issues).
  (c) Nova Lite reject rate is critical — emergency disable AI check
      via env var, drain backlog, re-enable after redesign.

This script is read-only. It mutates nothing in AWS, RDS, S3, or git.
The only side effect is writing two artifacts:

  /tmp/diagnostic-{ts}.json   — full machine-readable findings
  /tmp/diagnostic-{ts}.md     — human-readable report

Run from inside the v2 VPC (CloudShell or bastion) so Section B (RDS)
can connect. Outside-VPC runs gracefully skip Section B and still
produce A/C/D/E findings.

Usage
-----
    cd backend
    export $(grep -v '^#' .env.v2 | xargs)
    python3 v2/tools/post_validator_fix_diagnostic.py

    # or limit window:
    python3 v2/tools/post_validator_fix_diagnostic.py --hours 12

Exit codes
----------
    0  — diagnostic complete, recommendation printed
    2  — env var missing, RDS unreachable AND CloudWatch unreachable,
         or other setup issue (recommendation still printed if any
         data was collected)
    3  — fatal AWS error mid-run (partial JSON saved)
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

# ── Configuration ─────────────────────────────────────────────────────────────

REGION = "us-east-1"
DEFAULT_WINDOW_HOURS = 24

LAMBDA_NAMES = {
    "collector":  "sedaily-mbti-v2-collector-dev",
    "selector":   "sedaily-mbti-v2-selector-dev",
    "transform":  "sedaily-mbti-v2-transform-dev",
    "feed":       "sedaily-mbti-v2-feed-dev",
    "article":    "sedaily-mbti-v2-article-dev",
}

EVENTBRIDGE_RULE_PREFIX = "sedaily-mbti-v2-"
RDS_INSTANCE_ID = "sedaily-mbti-pgvector-v2-dev"
S3_ARTICLE_V2_BUCKET = os.getenv(
    "S3_ARTICLE_BODY_V2_BUCKET", "sedaily-mbti-article-body-v2-dev"
)

# The commit message for 9d13cf3 says "11 invocations/hour with 0 errors".
# Use these as decision thresholds (% of validator outcomes):
DECISION_BANDS = {
    "natural":    (0.00, 0.20),   # < 20% → path (a)
    "improve":    (0.20, 0.60),   # 20-60% → path (b)
    "emergency":  (0.60, 1.01),   # >= 60% → path (c)
}

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("diagnostic")

# Suppress noisy boto3 INFO chatter
for noisy in ("botocore", "boto3", "urllib3", "s3transfer"):
    logging.getLogger(noisy).setLevel(logging.WARNING)


# ── Data classes ──────────────────────────────────────────────────────────────


@dataclass
class SectionResult:
    name: str
    status: str  # "ok" | "skipped" | "error"
    detail: str = ""
    data: Dict[str, Any] = field(default_factory=dict)


@dataclass
class DiagnosticReport:
    started_at: str
    finished_at: str = ""
    region: str = REGION
    window_hours: int = DEFAULT_WINDOW_HOURS
    sections: Dict[str, SectionResult] = field(default_factory=dict)
    recommendation: Dict[str, Any] = field(default_factory=dict)


# ── Section A: AWS resource health ────────────────────────────────────────────


def section_a_resources(report: DiagnosticReport) -> SectionResult:
    """Lambda + EventBridge + RDS state. Read-only AWS calls."""
    logger.info("Section A — AWS resource health")
    try:
        import boto3
    except ImportError:
        return SectionResult(
            "A", "error", "boto3 not installed (pip install boto3)"
        )

    out: Dict[str, Any] = {
        "lambdas": {}, "eventbridge_rules": [], "rds": {}
    }

    try:
        lam = boto3.client("lambda", region_name=REGION)
    except Exception as exc:
        return SectionResult("A", "error", f"lambda client init: {exc}")

    for label, fn in LAMBDA_NAMES.items():
        try:
            cfg = lam.get_function_configuration(FunctionName=fn)
            out["lambdas"][label] = {
                "name": fn,
                "state": cfg.get("State"),
                "last_modified": cfg.get("LastModified"),
                "code_sha256": cfg.get("CodeSha256"),
                "runtime": cfg.get("Runtime"),
                "memory_mb": cfg.get("MemorySize"),
                "timeout_s": cfg.get("Timeout"),
                "reserved_concurrency": None,
                "env_keys": sorted((cfg.get("Environment") or {}).get("Variables", {}).keys()),
            }
            try:
                rc = lam.get_function_concurrency(FunctionName=fn)
                out["lambdas"][label]["reserved_concurrency"] = rc.get("ReservedConcurrentExecutions")
            except Exception:
                pass
        except lam.exceptions.ResourceNotFoundException:
            out["lambdas"][label] = {"name": fn, "error": "ResourceNotFoundException"}
        except Exception as exc:
            out["lambdas"][label] = {"name": fn, "error": f"{type(exc).__name__}: {exc}"}

    # EventBridge rules — list, then describe each
    try:
        eb = boto3.client("events", region_name=REGION)
        paginator = eb.get_paginator("list_rules")
        rules: List[Dict[str, Any]] = []
        for page in paginator.paginate(NamePrefix=EVENTBRIDGE_RULE_PREFIX):
            for r in page.get("Rules", []):
                rules.append({
                    "name": r.get("Name"),
                    "state": r.get("State"),
                    "schedule": r.get("ScheduleExpression"),
                    "arn": r.get("Arn"),
                })
        out["eventbridge_rules"] = rules
    except Exception as exc:
        out["eventbridge_rules"] = [{"error": f"{type(exc).__name__}: {exc}"}]

    # RDS
    try:
        rds = boto3.client("rds", region_name=REGION)
        d = rds.describe_db_instances(DBInstanceIdentifier=RDS_INSTANCE_ID)
        inst = d["DBInstances"][0]
        out["rds"] = {
            "id": inst.get("DBInstanceIdentifier"),
            "status": inst.get("DBInstanceStatus"),
            "class": inst.get("DBInstanceClass"),
            "engine": inst.get("Engine"),
            "engine_version": inst.get("EngineVersion"),
            "endpoint": (inst.get("Endpoint") or {}).get("Address"),
            "port": (inst.get("Endpoint") or {}).get("Port"),
            "vpc_sg_ids": [s["VpcSecurityGroupId"] for s in inst.get("VpcSecurityGroups", [])],
            "publicly_accessible": inst.get("PubliclyAccessible"),
            "storage_gb": inst.get("AllocatedStorage"),
        }

        # SG state final verify (per user explicit request)
        if out["rds"]["vpc_sg_ids"]:
            ec2 = boto3.client("ec2", region_name=REGION)
            sgs = ec2.describe_security_groups(GroupIds=out["rds"]["vpc_sg_ids"])
            out["rds"]["sg_ingress_audit"] = []
            for sg in sgs.get("SecurityGroups", []):
                ingress = [{
                    "protocol": p.get("IpProtocol"),
                    "from": p.get("FromPort"),
                    "to": p.get("ToPort"),
                    "cidrs": [r.get("CidrIp") for r in p.get("IpRanges", [])],
                    "sg_refs": [g.get("GroupId") for g in p.get("UserIdGroupPairs", [])],
                } for p in sg.get("IpPermissions", [])]
                out["rds"]["sg_ingress_audit"].append({
                    "sg_id": sg.get("GroupId"),
                    "name": sg.get("GroupName"),
                    "ingress": ingress,
                })
    except Exception as exc:
        out["rds"] = {"error": f"{type(exc).__name__}: {exc}"}

    return SectionResult("A", "ok", "AWS resources collected", data=out)


# ── Section B: CloudWatch reject rate ─────────────────────────────────────────


def _run_insights_query(cw, lg_name: str, start_ts: int, end_ts: int,
                         query: str, timeout_s: int = 60):
    """Helper: start an Insights query and poll until Complete or timeout."""
    q = cw.start_query(
        logGroupName=lg_name,
        startTime=start_ts,
        endTime=end_ts,
        queryString=query,
    )
    qid = q["queryId"]
    for _ in range(timeout_s):
        r = cw.get_query_results(queryId=qid)
        if r["status"] in ("Complete", "Failed", "Cancelled", "Timeout"):
            return r
        time.sleep(1.0)
    return r  # last polled state


def section_b_reject_rate(report: DiagnosticReport) -> SectionResult:
    """Query CloudWatch Logs Insights on Transform Lambda log group.

    v2 changes (vs prior diagnostic version):
      1. BUG FIX — old parse pattern was '"event":"*"' (no space after
         colon) but Python json.dumps default emits '"event": "value"'
         (one space after colon). All 1545 lines fell to <no_event>.
         Fix: do not rely on `parse` at all; use 7 individual exact-
         match `filter` queries. Bulletproof against any JSON formatter
         change.
      2. ADD — issues-type distribution. Pulls up to 50 most recent
         validation_failure samples and aggregates the `type` field
         across them (structural types vs hallucination). Lets us
         distinguish:
           - high hallucination ratio → Nova FP suspected (path b)
           - high structural ratio → Opus output is malformed (need
             different fix)
      3. ADD — raw log line peek (3 lines) so Claude Code can confirm
         the JSON shape if any future formatter change re-breaks parse.
    """
    logger.info("Section B — CloudWatch reject rate (window=%dh)", report.window_hours)
    try:
        import boto3
    except ImportError:
        return SectionResult("B", "error", "boto3 not installed")

    lg_name = f"/aws/lambda/{LAMBDA_NAMES['transform']}"
    end = datetime.now(timezone.utc)
    start = end - timedelta(hours=report.window_hours)
    start_ts = int(start.timestamp())
    end_ts = int(end.timestamp())

    cw = boto3.client("logs", region_name=REGION)

    # The 7 events the transform handler emits. Order matters for substring
    # disambiguation: transform_run_complete contains 'transform_complete',
    # transform_full_failure contains 'transform_failure' substring etc.
    # We use exact JSON-shape match: '"event": "<name>"' to dodge that.
    event_names = [
        "transform_complete",
        "transform_validation_failure",
        "transform_full_failure",
        "transform_partial_failure",
        "transform_run_complete",
        "transform_empty_batch",
        "transform_deadline_skip",
        "transform_error",
    ]

    counts: Dict[str, int] = {}
    per_event_errors: Dict[str, str] = {}
    for ev_name in event_names:
        # Insights `like` accepts regex literals between slashes. We escape
        # nothing because event names are [a-z_] only.
        query = f"""
        fields @timestamp
        | filter @message like /"event": "{ev_name}"/
        | stats count() as n
        """
        try:
            r = _run_insights_query(cw, lg_name, start_ts, end_ts, query)
            if r["status"] != "Complete":
                per_event_errors[ev_name] = f"query {r['status']}"
                counts[ev_name] = 0
                continue
            n = 0
            for row in r.get("results", []):
                kv = {f["field"]: f["value"] for f in row}
                n = int(kv.get("n", "0"))
            counts[ev_name] = n
        except Exception as exc:
            per_event_errors[ev_name] = f"{type(exc).__name__}: {exc}"
            counts[ev_name] = 0

    completed = counts.get("transform_complete", 0)
    val_fail = counts.get("transform_validation_failure", 0)

    # Nova reject ratio: validation_failures / (completed + validation_failures)
    denom = completed + val_fail
    nova_reject_ratio = (val_fail / denom) if denom > 0 else None

    # v3 CHANGE — pull @message directly. Insights' `fields ... issues`
    # output was inconsistent across runs (v2's hallucination_count=0
    # despite clear hallucination rejects in raw_log_peek). @message is
    # the raw JSON line we control via core2_transform.py; no Insights
    # serialization in between.
    sample_query = """
    fields @timestamp, @message
    | filter @message like /transform_validation_failure/
    | sort @timestamp desc
    | limit 50
    """
    raw_msgs: List[Dict[str, str]] = []
    try:
        rs = _run_insights_query(cw, lg_name, start_ts, end_ts, sample_query)
        if rs["status"] == "Complete":
            for row in rs.get("results", []):
                kv = {f["field"]: f["value"] for f in row}
                raw_msgs.append({
                    "timestamp": kv.get("@timestamp", ""),
                    "message": kv.get("@message", ""),
                })
        else:
            raw_msgs = []
    except Exception as exc:
        raw_msgs = []
        logger.warning("sample query failed: %s", exc)

    # Python-side JSON parse with depth-counted brace scan. Same approach
    # as _parse_ai_issues in core2/validator.py — works regardless of
    # whether Lambda runtime prepends [ERROR] / timestamp / RequestId
    # before the JSON.
    samples: List[Dict[str, Any]] = []
    type_counts: Dict[str, int] = {}
    parse_failures = 0
    other_event_skipped = 0
    for rm in raw_msgs:
        msg = rm["message"]
        start_brace = msg.find("{")
        if start_brace == -1:
            parse_failures += 1
            continue
        depth = 0
        end_brace = -1
        for i in range(start_brace, len(msg)):
            ch = msg[i]
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    end_brace = i
                    break
        if end_brace == -1:
            parse_failures += 1
            continue
        try:
            parsed = json.loads(msg[start_brace:end_brace + 1])
        except json.JSONDecodeError:
            parse_failures += 1
            continue
        if not isinstance(parsed, dict):
            parse_failures += 1
            continue
        # Substring filter caught lines that *contain*
        # "transform_validation_failure" but aren't the validation_failure
        # event itself (theoretically possible if news_id or detail text
        # contains that string). Skip them.
        if parsed.get("event") != "transform_validation_failure":
            other_event_skipped += 1
            continue
        issues = parsed.get("issues", [])
        if isinstance(issues, list):
            for it in issues:
                if isinstance(it, dict):
                    t = str(it.get("type", "<unknown>"))
                    type_counts[t] = type_counts.get(t, 0) + 1
        samples.append({
            "timestamp": rm["timestamp"],
            "news_id": parsed.get("news_id"),
            "requested_groups": parsed.get("requested_groups"),
            "ai_check_used": parsed.get("ai_check_used"),
            "issues": issues,
        })

    # Aggregate
    structural_types = {
        "missing", "missing_title", "missing_body",
        "body_too_short", "body_too_long", "wrong_language",
    }
    hallucination_total = type_counts.get("hallucination", 0)
    structural_total = sum(v for k, v in type_counts.items() if k in structural_types)

    issue_type_summary = {
        "type_counts": type_counts,
        "hallucination_count": hallucination_total,
        "structural_count": structural_total,
        "samples_parsed_ok": len(samples),
        "samples_unparseable": parse_failures,
        "samples_other_event_skipped": other_event_skipped,
        "raw_messages_fetched": len(raw_msgs),
    }

    # Raw line peek — first 3 lines from the log group in window. Lets
    # Claude Code confirm exact JSON shape if anything looks off.
    raw_peek_query = """
    fields @timestamp, @message
    | filter @message like /transform_/
    | sort @timestamp desc
    | limit 3
    """
    raw_peek: List[str] = []
    try:
        rp = _run_insights_query(cw, lg_name, start_ts, end_ts, raw_peek_query)
        if rp["status"] == "Complete":
            for row in rp.get("results", []):
                kv = {f["field"]: f["value"] for f in row}
                msg = kv.get("@message", "")
                # Trim long messages
                if len(msg) > 500:
                    msg = msg[:500] + "...[truncated]"
                raw_peek.append(msg)
    except Exception as exc:
        raw_peek = [f"raw peek failed: {exc}"]

    return SectionResult(
        "B", "ok",
        f"reject_ratio={nova_reject_ratio}, "
        f"hallucination={hallucination_total}, structural={structural_total}",
        data={
            "log_group": lg_name,
            "window_start_utc": start.isoformat(),
            "window_end_utc": end.isoformat(),
            "counts": counts,
            "per_event_query_errors": per_event_errors,
            "nova_reject_ratio": nova_reject_ratio,
            "issue_type_distribution": issue_type_summary,
            "validation_failure_samples": samples[:5],  # keep only 5 in main artifact
            "raw_log_peek": raw_peek,
        },
    )


# ── Section C: RDS retry-loop check + queue depth ─────────────────────────────


def section_c_rds(report: DiagnosticReport) -> SectionResult:
    """Detect deterministic Nova reject loops + report queue depth.

    Skipped (not error) when running outside the v2 VPC — RDS won't be
    reachable.
    """
    logger.info("Section C — RDS retry loop check")
    host = os.getenv("PG_V2_HOST", "")
    pwd = os.getenv("PG_V2_PASSWORD", "")
    if not host or not pwd:
        return SectionResult(
            "C", "skipped",
            "PG_V2_HOST or PG_V2_PASSWORD not set — skipping RDS section. "
            "Run from inside the v2 VPC after `export $(grep -v ^# backend/.env.v2 | xargs)`."
        )

    try:
        import pg8000.native
    except ImportError:
        return SectionResult(
            "C", "error",
            "pg8000 not installed — `pip install pg8000` from backend/v2/requirements.txt"
        )

    user = os.getenv("PG_V2_USER", "ailens")
    db = os.getenv("PG_V2_DATABASE", "ailens_v2")
    port = int(os.getenv("PG_V2_PORT", "5432"))

    try:
        conn = pg8000.native.Connection(
            host=host, port=port, user=user, password=pwd, database=db,
            timeout=15,
        )
    except Exception as exc:
        return SectionResult(
            "C", "error",
            f"RDS connect failed ({host}:{port}): {type(exc).__name__}: {exc}. "
            "If outside VPC, run from CloudShell in the v2 subnets."
        )

    out: Dict[str, Any] = {}
    try:
        # Queue depth — selected, not yet transformed
        rows = conn.run(
            """
            SELECT COUNT(*) AS pending
            FROM article_selections
            WHERE selected = TRUE AND transformed_at IS NULL
            """
        )
        out["queue_pending"] = int(rows[0][0]) if rows else 0

        # Failed articles with selection rows still pending — retry-loop suspects
        rows = conn.run(
            """
            SELECT a.news_id,
                   a.status,
                   a.created_at,
                   a.updated_at,
                   COUNT(s.*) FILTER (WHERE s.selected = TRUE) AS selected_count,
                   COUNT(s.*) FILTER (WHERE s.selected = TRUE AND s.transformed_at IS NULL) AS pending_count
            FROM articles a
            JOIN article_selections s ON s.news_id = a.news_id
            WHERE a.status = 'failed'
            GROUP BY a.news_id, a.status, a.created_at, a.updated_at
            HAVING COUNT(s.*) FILTER (WHERE s.selected = TRUE AND s.transformed_at IS NULL) > 0
            ORDER BY a.updated_at DESC
            LIMIT 50
            """
        )
        retry_suspects = []
        for r in rows:
            retry_suspects.append({
                "news_id": r[0], "status": r[1],
                "created_at": str(r[2]), "updated_at": str(r[3]),
                "selected_count": int(r[4]), "pending_count": int(r[5]),
            })
        out["retry_loop_suspects"] = retry_suspects
        out["retry_loop_suspect_count"] = len(retry_suspects)

        # Status distribution
        rows = conn.run(
            "SELECT status, COUNT(*) FROM articles GROUP BY status ORDER BY 2 DESC"
        )
        out["articles_status_distribution"] = {r[0]: int(r[1]) for r in rows}

        # transformed_at progress in last 24h
        rows = conn.run(
            """
            SELECT date_trunc('hour', transformed_at) AS h, COUNT(*) AS n
            FROM article_selections
            WHERE transformed_at IS NOT NULL
              AND transformed_at >= NOW() - INTERVAL '24 hours'
            GROUP BY 1 ORDER BY 1
            """
        )
        out["transformed_hourly_24h"] = [
            {"hour_utc": str(r[0]), "n": int(r[1])} for r in rows
        ]

        # Per-MBTI selected/transformed today
        rows = conn.run(
            """
            SELECT mbti_type,
                   COUNT(*) FILTER (WHERE selected) AS selected,
                   COUNT(*) FILTER (WHERE selected AND transformed_at IS NOT NULL) AS transformed
            FROM article_selections
            WHERE selection_date = (NOW() AT TIME ZONE 'Asia/Seoul')::date
            GROUP BY mbti_type
            ORDER BY mbti_type
            """
        )
        out["today_per_mbti"] = [
            {"mbti": r[0], "selected": int(r[1]), "transformed": int(r[2])}
            for r in rows
        ]
    except Exception as exc:
        out["query_error"] = f"{type(exc).__name__}: {exc}"
    finally:
        try:
            conn.close()
        except Exception:
            pass

    return SectionResult("C", "ok", "RDS state collected", data=out)


# ── Section D: Sample rejections — fetch original + versions for review ───────


def section_d_samples(report: DiagnosticReport) -> SectionResult:
    """For each validation_failure sample from B, pull original.json +
    version_*.json from S3 so a human (or Claude Code) can judge whether
    the Nova flag was a false positive.

    Skipped if Section B yielded no samples.
    """
    logger.info("Section D — Sample rejection content")
    sec_b = report.sections.get("B")
    if sec_b is None or sec_b.status != "ok":
        return SectionResult("D", "skipped", "Section B not OK")

    samples = sec_b.data.get("validation_failure_samples") or []
    if not samples:
        return SectionResult("D", "skipped", "No validation_failure samples in window")

    try:
        import boto3
    except ImportError:
        return SectionResult("D", "error", "boto3 not installed")

    s3 = boto3.client("s3", region_name=REGION)
    enriched: List[Dict[str, Any]] = []
    for s in samples[:5]:
        nid = s.get("news_id", "")
        if not nid or "error" in s:
            enriched.append({"sample": s, "error": "no news_id"})
            continue
        bundle: Dict[str, Any] = {"news_id": nid, "log_fields": s}
        for fname in ("original.json", "version_NT.json", "version_NF.json",
                      "version_ST.json", "version_SF.json"):
            try:
                obj = s3.get_object(
                    Bucket=S3_ARTICLE_V2_BUCKET, Key=f"{nid}/{fname}"
                )
                content = json.loads(obj["Body"].read())
                # Trim long bodies for report readability
                if isinstance(content, dict):
                    for k in ("body", "content_ko", "content_clean"):
                        if k in content and isinstance(content[k], str) and len(content[k]) > 800:
                            content[k] = content[k][:800] + "...[truncated]"
                bundle[fname] = content
            except s3.exceptions.NoSuchKey:
                bundle[fname] = None  # not all 4 versions exist (per-MBTI)
            except Exception as exc:
                bundle[fname] = {"error": f"{type(exc).__name__}: {exc}"}
        enriched.append(bundle)

    return SectionResult(
        "D", "ok", f"{len(enriched)} samples enriched",
        data={"samples": enriched, "bucket": S3_ARTICLE_V2_BUCKET},
    )


# ── Section E: Validator fix deployment verification ──────────────────────────


def section_e_deployment(report: DiagnosticReport) -> SectionResult:
    """Verify the Transform Lambda's deployed code is post-9d13cf3.

    We can't directly hash-compare to a git commit (Lambda CodeSha256 is
    of the zip, not source), but we can:
      1. Read LastModified timestamp of Transform Lambda
      2. Compare to commit 9d13cf3 timestamp (2026-04-29 11:02 KST)
      3. Flag if Lambda hasn't been redeployed since
    """
    logger.info("Section E — Validator fix deployment verification")
    sec_a = report.sections.get("A")
    if sec_a is None or sec_a.status != "ok":
        return SectionResult("E", "skipped", "Section A not OK")
    transform = sec_a.data.get("lambdas", {}).get("transform", {})
    lm = transform.get("last_modified")
    if not lm:
        return SectionResult("E", "skipped", "Transform Lambda LastModified missing")

    # 9d13cf3 commit timestamp: 2026-04-29 11:02 KST = 2026-04-29 02:02 UTC
    fix_commit_utc = datetime(2026, 4, 29, 2, 2, 0, tzinfo=timezone.utc)
    try:
        # Lambda LastModified format: "2026-04-29T03:14:15.000+0000" or similar
        lm_clean = lm.replace("+0000", "+00:00") if "+0000" in lm else lm
        deployed = datetime.fromisoformat(lm_clean.replace("Z", "+00:00"))
        if deployed.tzinfo is None:
            deployed = deployed.replace(tzinfo=timezone.utc)
    except Exception as exc:
        return SectionResult(
            "E", "error", f"LastModified parse: {lm} → {exc}"
        )

    delta_h = (deployed - fix_commit_utc).total_seconds() / 3600.0
    return SectionResult(
        "E", "ok",
        f"Transform Lambda deployed {delta_h:+.1f}h relative to validator fix commit",
        data={
            "transform_last_modified_utc": deployed.isoformat(),
            "validator_fix_commit_utc": fix_commit_utc.isoformat(),
            "hours_since_fix": delta_h,
            "appears_post_fix": delta_h > 0,
        },
    )


# ── Decision logic ────────────────────────────────────────────────────────────


def decide(report: DiagnosticReport) -> Dict[str, Any]:
    """Translate findings into a path recommendation and concrete next steps."""
    sec_b = report.sections.get("B")
    sec_c = report.sections.get("C")
    sec_e = report.sections.get("E")

    rationale: List[str] = []
    blockers: List[str] = []

    # Pre-check: deployment
    if sec_e and sec_e.status == "ok":
        if not sec_e.data.get("appears_post_fix", False):
            blockers.append(
                "Transform Lambda LastModified is BEFORE validator fix commit — "
                "9d13cf3 may not be deployed. Run `cd backend && ./v2/deploy-v2.sh transform`."
            )
        else:
            rationale.append(
                f"Transform Lambda was redeployed {sec_e.data['hours_since_fix']:.1f}h "
                "after the validator fix commit — fix should be live."
            )

    if sec_c and sec_c.status == "ok":
        suspects = sec_c.data.get("retry_loop_suspect_count", 0)
        if suspects > 0:
            blockers.append(
                f"{suspects} articles in 'failed' status still have selected+pending rows — "
                "deterministic retry loop. Path (c) emergency disable likely warranted."
            )
        rationale.append(
            f"Queue depth: {sec_c.data.get('queue_pending', '?')} selected+pending rows."
        )
        per_mbti = sec_c.data.get("today_per_mbti", [])
        if per_mbti:
            today_summary = ", ".join(
                f"{r['mbti']}={r['transformed']}/{r['selected']}" for r in per_mbti
            )
            rationale.append(f"Today (KST) per-MBTI transformed/selected: {today_summary}")

    # Path decision based on Nova reject rate
    path = None
    rate = None
    if sec_b and sec_b.status == "ok":
        rate = sec_b.data.get("nova_reject_ratio")
        if rate is None:
            rationale.append("No transform_complete or transform_validation_failure events in window — too small a sample.")
        else:
            for name, (lo, hi) in DECISION_BANDS.items():
                if lo <= rate < hi:
                    path = {"natural": "a", "improve": "b", "emergency": "c"}[name]
                    break
            rationale.append(
                f"Nova reject ratio = {rate:.1%} → band '{path}' "
                f"(thresholds: <20% a, 20-60% b, ≥60% c)"
            )

        # Refine path with issue-type distribution. If reject is mostly
        # structural (Opus emitting bad output), path (b) prompt fix won't
        # help — that needs a different fix not in this RUNBOOK. Flag it.
        itd = sec_b.data.get("issue_type_distribution", {})
        h = itd.get("hallucination_count", 0)
        s = itd.get("structural_count", 0)
        total = h + s
        if total > 0:
            hall_share = h / total
            rationale.append(
                f"Issue type breakdown: hallucination={h}, structural={s} "
                f"({hall_share:.0%} hallucination)"
            )
            if path == "b" and hall_share < 0.5:
                blockers.append(
                    f"Path (b) prompt fix only addresses hallucination FPs, but "
                    f"{1-hall_share:.0%} of rejects are structural (Opus output "
                    f"malformed). Need separate investigation before applying (b). "
                    f"See sec_b.data.issue_type_distribution.type_counts."
                )
            if path == "c" and hall_share < 0.5:
                rationale.append(
                    "Note: path (c) disables Nova entirely. With "
                    f"{1-hall_share:.0%} structural rejects, structural check "
                    "still catches those — disabling Nova is still safe but "
                    "won't drain backlog completely until structural cause is fixed."
                )

    # If retry-loop blockers, escalate to (c) regardless of rate band
    if blockers and any("retry loop" in b for b in blockers):
        path = "c"
        rationale.append("ESCALATED to path (c) by retry-loop blocker.")

    if path is None:
        path = "a-default"
        rationale.append(
            "Insufficient data to choose between a/b/c — defaulting to (a) "
            "(safest: just push pending commits, observe further). Re-run "
            "this script after another 4-12h of accumulation."
        )

    next_steps = build_next_steps(path, report)
    return {
        "recommended_path": path,
        "nova_reject_ratio": rate,
        "rationale": rationale,
        "blockers": blockers,
        "next_steps": next_steps,
    }


def build_next_steps(path: str, report: DiagnosticReport) -> List[str]:
    """Concrete shell commands Claude Code can execute next."""
    steps: List[str] = []
    if path in ("a", "a-default"):
        steps += [
            "# Path (a) — natural accumulation. Validator fix is live.",
            "# 1. Push the 7 unpushed commits (no CI/CD, no production impact):",
            "git push origin feature/backend-redesign",
            "# 2. Apply TASKS.md additions for TASK-7-Z series (see RUNBOOK.md §3).",
            "# 3. Re-run this diagnostic in 6h to confirm queue is draining.",
        ]
    elif path == "b":
        steps += [
            "# Path (b) — improve Nova Lite hallucination prompt.",
            "# Apply patch from RUNBOOK.md §4-B (excerpt parity + group filter + threshold).",
            "# 1. Edit backend/v2/core2/validator.py per §4-B",
            "# 2. Run: cd backend && python3 -m pytest v2/tests/test_validator.py -v",
            "# 3. Deploy: cd backend && ./v2/deploy-v2.sh transform",
            "# 4. Re-run this diagnostic in 4h to verify reject ratio dropped.",
            "# 5. Then push: git push origin feature/backend-redesign",
        ]
    elif path == "c":
        steps += [
            "# Path (c) — EMERGENCY: disable AI check, drain backlog.",
            "# 1. Edit backend/v2/core2/validator.py per RUNBOOK.md §4-C",
            "#    (adds VALIDATOR_AI_CHECK_DISABLED env var; default false)",
            "# 2. Run: cd backend && python3 -m pytest v2/tests/test_validator.py -v",
            "# 3. Deploy: cd backend && ./v2/deploy-v2.sh transform",
            "# 4. Set env var on Transform Lambda (non-secret, allowed by .clauderules #6):",
            "      aws lambda update-function-configuration \\",
            f"        --function-name {LAMBDA_NAMES['transform']} --region {REGION} \\",
            "        --environment 'Variables={VALIDATOR_AI_CHECK_DISABLED=1,...keep existing...}'",
            "      # NOTE: get-function-configuration first, merge env vars manually,",
            "      # do not overwrite with empty.",
            "# 5. Reset failed-loop articles (additive; safe): see RUNBOOK.md §5.",
            "# 6. Re-run diagnostic in 2h to verify backlog draining.",
        ]
    return steps


# ── Output formatting ─────────────────────────────────────────────────────────


def render_markdown(report: DiagnosticReport) -> str:
    rec = report.recommendation or {}
    lines: List[str] = []
    lines.append(f"# Post-validator-fix diagnostic — {report.started_at}")
    lines.append("")
    lines.append(f"- region: `{report.region}`")
    lines.append(f"- window: last {report.window_hours}h")
    lines.append("")
    lines.append("## Recommendation")
    path = rec.get("recommended_path", "?")
    lines.append(f"**Path: `{path}`** "
                 f"(Nova reject ratio = {rec.get('nova_reject_ratio')})")
    lines.append("")
    if rec.get("blockers"):
        lines.append("**Blockers:**")
        for b in rec["blockers"]:
            lines.append(f"- ⚠️ {b}")
        lines.append("")
    lines.append("**Rationale:**")
    for r in rec.get("rationale", []):
        lines.append(f"- {r}")
    lines.append("")
    lines.append("**Next steps (Claude Code executes):**")
    lines.append("```bash")
    for s in rec.get("next_steps", []):
        lines.append(s)
    lines.append("```")
    lines.append("")
    lines.append("## Section results")
    for name in ("A", "B", "C", "D", "E"):
        sec = report.sections.get(name)
        if sec is None:
            continue
        emoji = {"ok": "✅", "skipped": "⏭️", "error": "❌"}.get(sec.status, "?")
        lines.append(f"### {emoji} Section {name} — {sec.status}")
        if sec.detail:
            lines.append(f"_{sec.detail}_")
        lines.append("")
    lines.append("## Full data")
    lines.append("See companion `.json` file for the complete data dump.")
    return "\n".join(lines)


# ── Main ──────────────────────────────────────────────────────────────────────


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Post-TASK-7-Z-3 health diagnostic"
    )
    parser.add_argument("--hours", type=int, default=DEFAULT_WINDOW_HOURS,
                        help="CloudWatch + RDS window in hours (default 24)")
    parser.add_argument("--out-dir", default="/tmp",
                        help="Output directory for JSON + MD report")
    args = parser.parse_args()

    started = datetime.now(timezone.utc)
    report = DiagnosticReport(
        started_at=started.isoformat(),
        window_hours=args.hours,
    )

    sections = [
        ("A", section_a_resources),
        ("B", section_b_reject_rate),
        ("C", section_c_rds),
        ("D", section_d_samples),
        ("E", section_e_deployment),
    ]
    for name, fn in sections:
        try:
            result = fn(report)
            report.sections[name] = result
            logger.info("Section %s: %s — %s", name, result.status, result.detail)
        except Exception as exc:
            report.sections[name] = SectionResult(
                name, "error", f"unhandled: {type(exc).__name__}: {exc}"
            )
            logger.exception("Section %s crashed", name)

    report.recommendation = decide(report)
    report.finished_at = datetime.now(timezone.utc).isoformat()

    # Persist
    ts = started.strftime("%Y%m%dT%H%M%SZ")
    json_path = os.path.join(args.out_dir, f"diagnostic-{ts}.json")
    md_path = os.path.join(args.out_dir, f"diagnostic-{ts}.md")
    try:
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(
                {
                    "started_at": report.started_at,
                    "finished_at": report.finished_at,
                    "region": report.region,
                    "window_hours": report.window_hours,
                    "sections": {k: asdict(v) for k, v in report.sections.items()},
                    "recommendation": report.recommendation,
                },
                f, indent=2, ensure_ascii=False, default=str,
            )
        with open(md_path, "w", encoding="utf-8") as f:
            f.write(render_markdown(report))
    except Exception as exc:
        logger.error("Failed to persist artifacts: %s", exc)

    # Always print the markdown to stdout for immediate review
    print()
    print("=" * 78)
    print(render_markdown(report))
    print("=" * 78)
    print(f"\nArtifacts:\n  {json_path}\n  {md_path}")

    # Exit code
    err_sections = [s for s in report.sections.values() if s.status == "error"]
    if len(err_sections) >= 3:
        return 3
    return 0


if __name__ == "__main__":
    sys.exit(main())
