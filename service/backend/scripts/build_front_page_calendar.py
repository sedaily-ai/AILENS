"""생일 1면 대체용 '1면 없는 날' 목록 수집 — 면 번호가 있는 시기의 날짜마다 빅카인즈 1면 기사 수를 센다.

결과: services/timeline/front_page_calendar.json (Lambda zip 에 함께 들어간다, 형식은 services/timeline/front_calendar.py)
- 대상: 1994-01-01~1996-07-31, 2017-11-13~--until(기본 어제, KST). 1996-09-29 이후 일요일은 휴간 규칙이라 세지 않는다.
- 호출은 본문 없이 면 번호·송고 시각만 받는 가벼운 조회(count_front_page) 날짜당 1회, 약 3,700회.
- 끝내 응답을 받지 못한 날은 unknown 에 남는다. 서버는 그런 날을 목록 밖으로 보고 그때 직접 확인하므로,
  커밋 전에 --recheck-unknown 으로 unknown 을 비운다.
- 2026-10-20 첫 수집은 3개 동시·호출당 10초 제한으로 약 63분 걸렸고 21일이 실패해 --recheck-unknown(40초)으로
  다시 셌다(43초). 기사가 가장 많은 2018~2019년이 느리다.
실행: cd service/backend && AWS_DEFAULT_REGION=us-east-1 python3 scripts/build_front_page_calendar.py [--until YYYY-MM-DD]
      남은 unknown 다시 세기: ... build_front_page_calendar.py --recheck-unknown --workers 2
키는 SSM 에서만 읽고 출력하지 않는다.
"""
import argparse
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime, timedelta

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from common.dates.validation import KST  # noqa: E402
from handlers.timeline.time_machine import FRONT_PAGE_ERAS, SUNDAY_CLOSED_FROM  # noqa: E402
from services.timeline import bigkinds_search  # noqa: E402
from services.timeline.front_calendar import CALENDAR_PATH  # noqa: E402

RETRIES = 3


def _days(start: date, end: date):
    day = start
    while day <= end:
        yield day
        day += timedelta(days=1)


def _targets(until: date):
    """(날짜 문자열, 판별 기준)과 확인 구간 목록."""
    targets, covers = [], []
    for start, end, match in FRONT_PAGE_ERAS:
        last = min(until, date.fromisoformat(end)) if end else until
        first = date.fromisoformat(start)
        if last < first:
            continue
        covers.append([first.isoformat(), last.isoformat()])
        for day in _days(first, last):
            iso = day.isoformat()
            if iso >= SUNDAY_CLOSED_FROM and day.weekday() == 6:
                continue
            targets.append((iso, match))
    return targets, covers


def _count(iso: str, match: str):
    for attempt in range(RETRIES):
        try:
            return iso, bigkinds_search.count_front_page(iso, match)
        except Exception:  # noqa: BLE001
            time.sleep(1.5 * (attempt + 1))
    return iso, None


def main(argv=None) -> int:
    yesterday = (datetime.now(KST) - timedelta(days=1)).date()
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('--until', default=yesterday.isoformat())
    parser.add_argument('--workers', type=int, default=3)
    parser.add_argument('--out', default=str(CALENDAR_PATH))
    # 2018~2019년처럼 기사가 많은 날은 동시 호출 중 1면 확인이 서버 기본값(10초)을 넘기기도 한다. 수집만 넉넉히 기다린다.
    parser.add_argument('--timeout', type=float, default=40)
    parser.add_argument('--recheck-unknown', action='store_true', help='기존 결과 파일의 unknown 날짜만 다시 센다')
    args = parser.parse_args(argv)
    bigkinds_search.FRONT_COUNT_TIMEOUT_SECONDS = args.timeout

    if args.recheck_unknown:
        with open(args.out, encoding='utf-8') as fp:
            previous = json.load(fp)
        eras = {iso: match for iso, match in _targets(date.fromisoformat(previous['covers'][-1][1]))[0]}
        targets, covers = [(iso, eras[iso]) for iso in previous['unknown']], previous['covers']
        no_front, unknown = list(previous['no_front']), []
    else:
        targets, covers = _targets(date.fromisoformat(args.until))
        no_front, unknown = [], []
    started = time.monotonic()
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = [pool.submit(_count, iso, match) for iso, match in targets]
        for done, future in enumerate(as_completed(futures), 1):
            iso, count = future.result()
            if count is None:
                unknown.append(iso)
            elif count == 0:
                no_front.append(iso)
            if done % 200 == 0:
                print(f'{done}/{len(targets)} no_front={len(no_front)} unknown={len(unknown)} '
                      f'{time.monotonic() - started:.0f}s', file=sys.stderr, flush=True)

    out = {'generated_at': datetime.now(KST).isoformat(timespec='seconds'), 'covers': covers,
           'no_front': sorted(no_front), 'unknown': sorted(unknown)}
    with open(args.out, 'w', encoding='utf-8') as fp:
        json.dump(out, fp, ensure_ascii=False, indent=1)
        fp.write('\n')
    print(f'checked={len(targets)} no_front={len(no_front)} unknown={len(unknown)} '
          f'{time.monotonic() - started:.0f}s -> {args.out}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
