"""일반 카테고리 선정 프롬프트(pipelines/mustknow_auto/selection_prompt.md)를
여러 날짜에 대해 반복 실행하고 결과를 기록하는 실험 하네스.

목적은 "평가 인프라 구축"이 아니라 "프롬프트 반복 속도"(docs/evaluation/
harness/README.md와 같은 원칙) — v1.6 이후 프롬프트를 고칠 때마다 손으로
스크립트를 새로 짜지 않고 이 스크립트로 바로 여러 날짜 재검증한다.

사용법(pipelines/ 에 PYTHONPATH가 안 잡혀 있어도 되게 이 파일이 직접
sys.path를 세팅한다):

  cd docs/evaluation/selection-harness
  AWS_PROFILE=default python3 run.py --dates 20260918 20260919 20260920
  AWS_PROFILE=default python3 run.py --recent 10   # 최근 10일(S3에서 자동 탐색)

결과: runs/<date>/result.json(원본 응답) + runs/summary.md(날짜별 요약,
누적 append) — runs/는 .gitignore 대상(docs/evaluation/.gitignore).
"""
from __future__ import annotations

import argparse
import json
import sys
import xml.etree.ElementTree as ET
from collections import Counter
from datetime import datetime, timedelta
from pathlib import Path

_HERE = Path(__file__).parent
_PIPELINES = _HERE.parent.parent.parent / "pipelines"
sys.path.insert(0, str(_PIPELINES))
sys.path.insert(0, str(_PIPELINES / "common"))
sys.path.insert(0, str(_PIPELINES / "mustknow_auto"))

from discovery import pipeline as discovery  # noqa: E402
import classify  # noqa: E402

_EXCLUDE_CATEGORIES = {"연예", "스포츠", "피플", "오피니언"}
_MIN_CONTENT_LEN = 300
_SELECTION_PROMPT_PATH = _PIPELINES / "mustknow_auto" / "selection_prompt.md"
_RUNS_DIR = _HERE / "runs"


def _tab_of(a: dict) -> str | None:
    """run.py::_tab_of()와 동일 로직 — 이 파이프라인이 공식 소스, 여기는
    실험용 사본이라 run.py가 바뀌면 여기도 같이 갱신할 것."""
    if a.get("is_market_signal"):
        return "시그널"
    if a["top_category"] == "증권":
        return "증권"
    if a["top_category"] == "산업":
        return "산업"
    return None


def _build_general_pool(all_articles: list[dict]) -> list[dict]:
    """run.py::main()의 fresh 사전필터 + 일반 소거 로직 사본(seen 테이블
    제외는 이 실험에선 안 함 — 매번 그날 전체를 새로 평가)."""
    pool = [a for a in all_articles if a["content_len"] >= _MIN_CONTENT_LEN]
    pool = [a for a in pool if "AI 프리즘" not in (a["sub_title"] or "")]
    pool = [a for a in pool if not (a["title"] or "").startswith("기업 공시 [")]
    pool = [a for a in pool if a["top_category"] not in _EXCLUDE_CATEGORIES and _tab_of(a) is None]
    return pool


def run_one_date(date: str, profile: str | None) -> dict:
    root_el = discovery._download_root(discovery._s3_client(profile), date)
    if root_el is None:
        return {"date": date, "error": "daily-xml 없음"}
    all_articles = [a for item in root_el if (a := discovery._parse_item(item)) is not None]
    general_pool = _build_general_pool(all_articles)

    guide = _SELECTION_PROMPT_PATH.read_text(encoding="utf-8")
    result = classify.select_general_articles(guide, general_pool, context_articles=all_articles)

    out_dir = _RUNS_DIR / date
    out_dir.mkdir(parents=True, exist_ok=True)
    payload = {
        "date": date,
        "all_articles_count": len(all_articles),
        "general_pool_count": len(general_pool),
        "result": result,
    }
    (out_dir / "result.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return payload


def _summarize(payload: dict) -> str:
    date = payload["date"]
    if "error" in payload:
        return f"| {date} | ERROR: {payload['error']} | | | |"
    result = payload.get("result")
    if result is None:
        return f"| {date} | 파싱 실패(None) | {payload['general_pool_count']} | - | - |"
    selected = result.get("selected", [])
    cats = Counter(row.get("category") for row in selected)
    cat_str = ", ".join(f"{k}{v}" for k, v in cats.most_common())
    ctx = (result.get("today_context") or "")[:80]
    return (
        f"| {date} | {len(selected)}건 선정 (소거후 {payload['general_pool_count']}건) "
        f"| 카테고리 {len(cats)}종: {cat_str} | 최대쏠림 {max(cats.values()) if cats else 0}건 "
        f"| {ctx}... |"
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dates", nargs="+", help="YYYYMMDD 여러 개")
    parser.add_argument("--recent", type=int, help="오늘부터 N일 전까지")
    parser.add_argument("--profile", default="default")
    args = parser.parse_args()

    if args.recent:
        today = datetime.now()
        dates = [(today - timedelta(days=i)).strftime("%Y%m%d") for i in range(1, args.recent + 1)]
    elif args.dates:
        dates = args.dates
    else:
        parser.error("--dates 또는 --recent 중 하나는 필요합니다")

    _RUNS_DIR.mkdir(parents=True, exist_ok=True)
    summary_lines = ["| 날짜 | 선정 결과 | 카테고리 분포 | 쏠림 | today_context |", "|---|---|---|---|---|"]
    for date in dates:
        print(f"=== {date} 실행 중... ===")
        payload = run_one_date(date, args.profile)
        line = _summarize(payload)
        summary_lines.append(line)
        print(line)

    summary_path = _RUNS_DIR / "summary.md"
    header = f"\n## {datetime.now().isoformat(timespec='seconds')} 실행\n\n"
    with open(summary_path, "a", encoding="utf-8") as f:
        f.write(header + "\n".join(summary_lines) + "\n")
    print(f"\n요약 저장: {summary_path}")


if __name__ == "__main__":
    main()
