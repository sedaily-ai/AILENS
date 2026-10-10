#!/usr/bin/env python3
"""DynamoDB 잔여 데이터 → Postgres 이관(v1.36) — mustknow 본 후보 · 오늘의 질문 · 관리자 job.

테이블 3개(candidate_seen·daily_questions·admin_jobs)는 먼저 마스터 계정으로 만들어 둬야 한다(lens_schema_v1.36_2026-10-09.sql).
기본은 드라이런이다(DynamoDB를 읽어 백업 JSON만 만들고 서버에는 쓰지 않는다). --apply 를 줘야 lens-cms-api 에 쓴다.
재실행해도 안전하다(seen: ON CONFLICT DO NOTHING, 질문: 먼저 저장된 값 유지, job: 이미 있으면 건너뜀).

사용(pipelines/ 에서):
  python3 scripts/ddb_to_pg_v136.py seen      --backup <경로.json> [--apply]
  python3 scripts/ddb_to_pg_v136.py questions --backup <경로.json> [--apply]
  python3 scripts/ddb_to_pg_v136.py jobs      --backup <경로.json> [--days 30] [--apply]

검증: 끝에 DynamoDB 건수와 Postgres 건수를 대조해 출력한다(seen). DynamoDB 테이블은 이 스크립트가 지우지 않는다.
"""
import argparse
import json
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "common"))

BASE = "http://13.223.179.151"
REGION = "us-east-1"
SEEN_TABLE = "sedaily-lens-mustknow-seen-dev"
PERSONAL_TABLE = "sedaily-mbti-personal-dev"
CONFIG_TABLE = "sedaily-mbti-admin-config-dev"
BATCH = 500


def _token() -> str:
    import boto3  # noqa: lazy

    return boto3.client("ssm", region_name=REGION).get_parameter(
        Name="/sedaily-mbti/admin/lens-cms-api-token", WithDecryption=True
    )["Parameter"]["Value"]


def _call(tok: str, method: str, path: str, body=None):
    req = urllib.request.Request(
        f"{BASE}{path}",
        data=None if body is None else json.dumps(body, ensure_ascii=False).encode("utf-8"),
        headers={"X-Internal-Token": tok, "Content-Type": "application/json"},
        method=method,
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        raise SystemExit(f"서버가 거절함 {method} {path} HTTP {e.code}: {e.read().decode()[:400]}")


def _scan(table: str, **kw):
    import boto3  # noqa: lazy

    t = boto3.Session(region_name=REGION).resource("dynamodb").Table(table)
    items, key = [], None
    while True:
        resp = t.scan(**kw, **({"ExclusiveStartKey": key} if key else {}))
        items += resp.get("Items", [])
        key = resp.get("LastEvaluatedKey")
        if not key:
            return items


def _plain(v):
    if isinstance(v, Decimal):
        return float(v) if v % 1 else int(v)
    if isinstance(v, dict):
        return {k: _plain(x) for k, x in v.items()}
    if isinstance(v, (list, set)):
        return [_plain(x) for x in v]
    return v


def _backup(path: str, data) -> None:
    Path(path).write_text(json.dumps(data, ensure_ascii=False, indent=1, default=str), encoding="utf-8")
    print(f"백업 저장: {path}")


def cmd_seen(args) -> None:
    rows = [_plain(i) for i in _scan(SEEN_TABLE)]
    _backup(args.backup, rows)
    known = {"article_key", "seen_at", "tab", "score", "reasoning", "manual", "excluded_from_general", "reason"}
    items = []
    for r in rows:
        items.append({
            "pipeline": "mustknow",
            "article_key": r["article_key"],
            "seen_at": r.get("seen_at"),
            "tab": r.get("tab"),
            "score": r.get("score"),
            "reasoning": r.get("reasoning"),
            "is_manual": bool(r.get("manual", False)),
            "excluded_from_general": bool(r.get("excluded_from_general", False)),
            "reason": r.get("reason"),
            "detail": {k: v for k, v in r.items() if k not in known},
        })
    print(f"DynamoDB seen {len(items)}건 ({'실제 적용' if args.apply else '드라이런'})")
    tok = _token()
    inserted = skipped = 0
    for i in range(0, len(items), BATCH):
        res = _call(tok, "POST", "/internal/candidate-seen/bulk", {"items": items[i : i + BATCH], "dry_run": not args.apply})
        inserted += res.get("inserted", 0)
        skipped += res.get("skipped", 0)
    pg = _call(tok, "GET", "/internal/candidate-seen/count?pipeline=mustknow")["count"]
    print(f"신규 {inserted} · 이미 있음 {skipped} · Postgres(mustknow) 현재 {pg}건 / DynamoDB {len(items)}건")
    if args.apply and pg < len(items):
        raise SystemExit("건수 불일치 — 이관 누락 가능, 확인 필요")


def cmd_questions(args) -> None:
    rows = [_plain(i) for i in _scan(PERSONAL_TABLE, FilterExpression="user_id = :u", ExpressionAttributeValues={":u": "__questions__"})]
    _backup(args.backup, rows)
    todo = []
    for r in rows:
        sk = r.get("sk", "")
        if not sk.startswith("DATE#"):
            continue
        raw = sk[5:]
        date = f"{raw[:4]}-{raw[4:6]}-{raw[6:8]}" if len(raw) == 8 and raw.isdigit() else raw
        q = r.get("questions")
        questions = json.loads(q) if isinstance(q, str) else q
        if questions:
            todo.append((date, questions, r.get("generated_at")))
    print(f"DynamoDB 질문 캐시 {len(todo)}건 ({'실제 적용' if args.apply else '드라이런'})")
    if not args.apply:
        return
    tok = _token()
    for date, questions, generated_at in sorted(todo):
        _call(tok, "PUT", f"/internal/daily-questions/{date}", {"questions": questions, "generated_at": generated_at})
    print(f"완료: {len(todo)}건 저장(이미 있던 날짜는 기존 값 유지)")


def cmd_jobs(args) -> None:
    cutoff = (datetime.now(timezone.utc) - timedelta(days=args.days)).isoformat()
    kinds = {"WEBTOONLAB": "webtoon_cut", "PROMPTTEST": "prompt_test"}
    rows = [_plain(i) for i in _scan(CONFIG_TABLE, FilterExpression="pk IN (:a, :b)", ExpressionAttributeValues={":a": "WEBTOONLAB", ":b": "PROMPTTEST"})]
    _backup(args.backup, rows)
    recent = [r for r in rows if str(r.get("created_at") or r.get("updated_at") or "") >= cutoff]
    print(f"job 전체 {len(rows)}건 중 최근 {args.days}일 {len(recent)}건 ({'실제 적용' if args.apply else '드라이런'}) — 나머지는 백업 JSON 으로만 보관")
    if not args.apply:
        return
    tok = _token()
    done = 0
    for r in recent:
        kind = kinds[r["pk"]]
        job_id = r["sk"].split("/", 1)[-1]
        status = r.get("status", "done")
        status = {"pending": "pending", "running": "running", "done": "done", "error": "error"}.get(status, "done")
        payload = {k: v for k, v in r.items() if k not in ("pk", "sk", "status", "error", "created_at", "updated_at") and k not in ("image_url", "bg_url", "output")}
        result = {k: r[k] for k in ("image_url", "bg_url", "output") if k in r}
        try:
            _call(tok, "POST", "/internal/admin-jobs", {"kind": kind, "job_id": job_id, "payload": payload})
        except SystemExit as e:
            if "409" not in str(e):
                raise
            continue  # 이미 있음 — 재실행 안전
        _call(tok, "PATCH", f"/internal/admin-jobs/{kind}/{job_id}", {"status": status, "error": r.get("error"), "result": result})
        done += 1
    print(f"완료: {done}건 이관")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("what", choices=["seen", "questions", "jobs"])
    ap.add_argument("--backup", required=True)
    ap.add_argument("--days", type=int, default=30)
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()
    {"seen": cmd_seen, "questions": cmd_questions, "jobs": cmd_jobs}[args.what](args)


if __name__ == "__main__":
    main()
