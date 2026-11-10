#!/usr/bin/env python3
"""서울경제 1면 원본 CSV 전체를 월별 서비스 데이터(index/v2)로 변환한다.

원본 CSV는 수정하지 않는다. CSV의 행 순서와 모든 기사 필드(ID, 발행일, 제목,
부제목, 본문)를 보존하며, 화면은 선택한 달 파일 하나만 받아 쓴다.
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any


class BuildError(Exception):
    pass


def read_archive(source: Path) -> tuple[dict[str, list[dict[str, str]]], dict[str, Any]]:
    monthly: dict[str, dict[str, list[dict[str, str]]]] = defaultdict(lambda: defaultdict(list))
    seen_ids: set[str] = set()
    annual: dict[int, dict[str, int]] = {}
    files = sorted(source.glob("*.csv"))
    if len(files) != 37 or [p.stem for p in files] != [str(y) for y in range(1990, 2027)]:
        raise BuildError("1990.csv~2026.csv 연도 파일 37개가 모두 있어야 합니다")

    for path in files:
        year = int(path.stem)
        stats = {"rows": 0, "dates": set(), "nonempty_titles": 0}
        with path.open(encoding="utf-8-sig", newline="") as stream:
            reader = csv.DictReader(stream)
            required = {"ID", "발행일", "제목", "부제목", "본문"}
            if not required.issubset(reader.fieldnames or []):
                raise BuildError(f"{path.name}: 필요한 열이 없습니다")
            for line, row in enumerate(reader, start=2):
                article_id = (row.get("ID") or "").strip()
                raw_date = (row.get("발행일") or "").strip()
                if len(raw_date) != 8 or not raw_date.isdigit() or int(raw_date[:4]) != year:
                    raise BuildError(f"{path.name} {line}행: 발행일이 파일 연도와 맞지 않습니다")
                if not article_id:
                    raise BuildError(f"{path.name} {line}행: ID가 비었습니다")
                if article_id in seen_ids:
                    raise BuildError(f"{path.name} {line}행: 중복 ID {article_id}")
                seen_ids.add(article_id)
                iso = f"{raw_date[:4]}-{raw_date[4:6]}-{raw_date[6:8]}"
                article = {
                    "id": article_id,
                    "title": (row.get("제목") or "").strip(),
                    "subtitle": (row.get("부제목") or "").strip(),
                    "body": (row.get("본문") or "").strip(),
                }
                monthly[raw_date[:6]][iso].append(article)
                stats["rows"] += 1
                stats["dates"].add(iso)
                stats["nonempty_titles"] += bool(article["title"])
        annual[year] = {
            "rows": stats["rows"],
            "issue_dates": len(stats["dates"]),
            "nonempty_titles": stats["nonempty_titles"],
        }

    return {month: dict(days) for month, days in monthly.items()}, {
        "schema": 2,
        "source": "sedaily-front-page-csv",
        "years": annual,
        "total_rows": len(seen_ids),
        "total_months": len(monthly),
        "total_issue_dates": sum(len(days) for days in monthly.values()),
    }


def write_archive(monthly: dict[str, dict[str, list[dict[str, str]]]], out: Path) -> list[tuple[str, int, int, int]]:
    root = out / "index" / "v2"
    results = []
    for month, days in sorted(monthly.items()):
        year, mm = month[:4], month[4:]
        target = root / year / f"{mm}.json"
        target.parent.mkdir(parents=True, exist_ok=True)
        doc = {"schema": 2, "year": int(year), "month": int(mm), "days": days}
        content = (json.dumps(doc, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")
        target.write_bytes(content)
        results.append((month, len(days), sum(map(len, days.values())), len(content)))
    return results


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, required=True, help="연도별 원본 CSV 37개가 있는 폴더")
    parser.add_argument("--out", type=Path, required=True, help="서비스용 파일 출력 폴더")
    args = parser.parse_args()
    try:
        monthly, summary = read_archive(args.source_dir)
        results = write_archive(monthly, args.out)
    except (OSError, csv.Error, UnicodeError, BuildError) as exc:
        print(f"실패: {exc}", file=sys.stderr)
        return 1
    print(f"원본 행: {summary['total_rows']:,}")
    print(f"발행일: {summary['total_issue_dates']:,}일")
    print(f"월 파일: {len(results):,}개")
    print(f"출력 용량: {sum(size for _, _, _, size in results):,}바이트")
    print(f"최대 월 파일: {max(size for _, _, _, size in results):,}바이트")
    print("연도 | 기사 행 | 발행일 | 제목 있는 행")
    for year, stats in summary["years"].items():
        print(f"{year} | {stats['rows']:,} | {stats['issue_dates']:,} | {stats['nonempty_titles']:,}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
