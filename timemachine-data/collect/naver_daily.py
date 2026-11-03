"""네이버 신문보기(서울경제 011) 1면 목록을 하루 단위로 받아 S3 연도 파일(timemachine-newspaper/index/v1/YYYY.json)에 이어 붙인다.

화면이 읽는 연도 파일 v1 형식 그대로다(timemachine-data/README.md "데이터 구조"). 연도 파일의 text_covers 는 "그 날짜를 확인했다"는 선언이라,
확인하지 못한 날(받기 실패·아직 올라오지 않은 오늘)은 text_covers 에 넣지 않는다. 그런 날은 화면이 빅카인즈로 채우고, 다음 실행이 다시 시도한다.

받는 방식(네이버 서버 부담을 줄이려고 작게 유지한다):
- 요청마다 0.7초 쉬고, 수집기라고 밝히는 User-Agent 를 쓴다. 403·429 가 오면 재시도하지 않고 그 실행을 바로 멈춘다.
- 일요일(1996-09-29부터 일요일자 없음)은 받지 않고 '1면 없음'으로 확인 처리한다.
- 오늘은 오전 6~14시(KST) 사이에만 받는다. 목록이 아직 없으면 '아직'이라 확인 처리하지 않는다. 지난 날은 목록이 없으면 '1면 없음'으로 확인 처리한다.
이 모듈은 AWS Lambda 에서만 S3 를 쓴다(boto3 는 호출하는 쪽이 클라이언트를 넘긴다).
"""
from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta, timezone
from typing import Any, Callable, Dict, Iterable, List, Optional, Tuple

import crawl_naver_front as cnf

KST = timezone(timedelta(hours=9))
NAVER_FROM = date(2011, 7, 9)            # 이 날부터 네이버에 서울경제 1면 목록이 있다
SUNDAY_CLOSED_FROM = date(1996, 9, 29)   # 이 날부터 일요일자 신문이 없다
UA = 'SedailyLENS-timemachine/1.0 (+https://ailens.sedaily.ai)'
EMPTY_NOTICE = '발행된 종이신문이 없거나'
S3_INDEX_PREFIX = 'timemachine-newspaper/index/v1/'
S3_CACHE_CONTROL = 'public, max-age=600'
SCHEMA = 1
TIMEOUT_SECONDS = 20
ATTEMPTS = 3
SPACING_SECONDS = 0.7
LOOKBACK_DAYS = 7
TODAY_FROM_HOUR, TODAY_UNTIL_HOUR = 6, 14
MAX_EXPLICIT_DAYS = 31


class NaverError(Exception):
    pass


class Blocked(NaverError):
    """403·429 — 더 요청하지 않고 멈춘다. results 에 멈추기 전까지의 날짜별 상태가 들어 있다."""

    def __init__(self, message: str, results: Optional[Dict[str, str]] = None):
        super().__init__(message)
        self.results = results or {}


# ---------- 받기·읽기 ----------

def fetch_page(day: date, opener: Callable = urllib.request.urlopen, sleep: Callable = time.sleep) -> str:
    url = cnf.URL.format(cnf.PRESS, day.strftime('%Y%m%d'))
    request = urllib.request.Request(url, headers={'User-Agent': UA})
    last = ''
    for attempt in range(ATTEMPTS):
        try:
            with opener(request, timeout=TIMEOUT_SECONDS) as response:
                return response.read().decode('utf-8')
        except urllib.error.HTTPError as e:
            if e.code in (403, 429):
                raise Blocked(f'네이버가 요청을 막았어요(HTTP {e.code})') from None
            last = f'HTTP {e.code}'
        except Exception as e:  # noqa: BLE001 - 네트워크 오류는 종류와 상관없이 같은 방식으로 다시 시도한다
            last = type(e).__name__
        if attempt < ATTEMPTS - 1:
            sleep(2 * (attempt + 1))
    raise NaverError(f'{day.isoformat()} 받기 실패({last})')


def read_page(src: str, day: date) -> Optional[List[Dict[str, Any]]]:
    """1면 기사 [{rank, title, url}] (순위는 1부터 다시 매긴다). 1면이 없다는 안내면 None. 구조가 달라졌으면 NaverError."""
    rows = cnf.parse_page1(src, day)
    if rows:
        articles = [{'rank': i, 'title': r['title'], 'url': r['url']} for i, r in enumerate(rows, 1)]
        if any(not a['title'] or not a['url'].startswith('https://') for a in articles):
            raise NaverError(f'{day.isoformat()} 기사 제목이나 주소 형식이 달라졌어요')
        return articles
    if EMPTY_NOTICE in src:
        return None
    raise NaverError(f'{day.isoformat()} 페이지 구조가 달라졌어요(1면 목록도 없음 안내도 찾지 못함)')


# ---------- 연도 파일 ----------

def new_year_doc(year: int) -> Dict[str, Any]:
    return {'schema': SCHEMA, 'year': year, 'updated_at': '', 'text_covers': [], 'days': {}}


def add_cover(covers: Iterable[Iterable[str]], day: date) -> List[List[str]]:
    """확인한 기간 목록에 하루를 더하고 맞닿은 기간은 합친다."""
    spans = sorted((date.fromisoformat(a), date.fromisoformat(b)) for a, b in covers)
    spans.append((day, day))
    spans.sort()
    merged: List[List[date]] = []
    for start, end in spans:
        if merged and start <= merged[-1][1] + timedelta(days=1):
            merged[-1][1] = max(merged[-1][1], end)
        else:
            merged.append([start, end])
    return [[a.isoformat(), b.isoformat()] for a, b in merged]


def covered_days(doc: Dict[str, Any], start: date, end: date) -> set:
    """doc 의 확인한 기간 안에 있는 날짜 중 [start, end] 구간만."""
    out = set()
    for a, b in doc['text_covers']:
        lo, hi = max(date.fromisoformat(a), start), min(date.fromisoformat(b), end)
        out.update(lo + timedelta(days=i) for i in range((hi - lo).days + 1))
    return out


def apply_day(doc: Dict[str, Any], day: date, articles: Optional[List[Dict[str, Any]]], now_iso: str) -> str:
    """하루를 연도 파일에 반영한다. 'saved'(목록 저장) · 'no_list'(1면 없음으로 확인) · 'kept'(이미 있는 목록을 비우지 않음)."""
    key = day.isoformat()
    if articles is None and key in doc['days']:
        return 'kept'   # 다시 받았더니 없다고 나와도 있던 목록을 지우지 않는다(일시적인 빈 화면일 수 있다)
    if articles is not None:
        doc['days'][key] = {'articles': articles}
    doc['text_covers'] = add_cover(doc['text_covers'], day)
    doc['updated_at'] = now_iso
    return 'saved' if articles is not None else 'no_list'


def encode_doc(doc: Dict[str, Any]) -> bytes:
    return (json.dumps(doc, ensure_ascii=False, separators=(',', ':')) + '\n').encode('utf-8')


def _year_key(year: int) -> str:
    return f'{S3_INDEX_PREFIX}{year}.json'


def load_year(s3: Any, bucket: str, year: int) -> Dict[str, Any]:
    """S3 의 연도 파일. 없으면 새 문서. 있는데 형식이 다르면 덮어쓰지 않으려고 NaverError."""
    key = _year_key(year)
    try:
        listed = s3.list_objects_v2(Bucket=bucket, Prefix=key, MaxKeys=1).get('Contents', [])
        if not any(obj['Key'] == key for obj in listed):
            return new_year_doc(year)
        raw = json.loads(s3.get_object(Bucket=bucket, Key=key)['Body'].read().decode('utf-8-sig'))
    except (ValueError, KeyError):
        raise NaverError(f'{key} 를 읽지 못했어요. 덮어쓰지 않았어요') from None
    except Exception as e:  # noqa: BLE001
        raise NaverError(f'S3 확인 실패({type(e).__name__})') from None
    if not isinstance(raw, dict) or raw.get('schema') != SCHEMA or raw.get('year') != year \
            or not isinstance(raw.get('text_covers'), list) or not isinstance(raw.get('days'), dict):
        raise NaverError(f'{key} 형식이 달라요. 덮어쓰지 않았어요')
    return raw


def save_year(s3: Any, bucket: str, doc: Dict[str, Any]) -> None:
    try:
        s3.put_object(Bucket=bucket, Key=_year_key(doc['year']), Body=encode_doc(doc),
                      ContentType='application/json; charset=utf-8', CacheControl=S3_CACHE_CONTROL)
    except Exception as e:  # noqa: BLE001
        raise NaverError(f'S3 저장 실패({type(e).__name__})') from None


# ---------- 어느 날을 받을지 ----------

def is_paperless_sunday(day: date) -> bool:
    return day >= SUNDAY_CLOSED_FROM and day.weekday() == 6


def pending_dates(today: date, hour: int, covered: Iterable[date], lookback: int = LOOKBACK_DAYS) -> List[date]:
    """오늘부터 lookback 일 전까지 아직 확인하지 않은 날(오래된 날부터). 오늘은 받는 시간대에서만."""
    known = set(covered)
    out = []
    for back in range(lookback, -1, -1):
        day = today - timedelta(days=back)
        if day < NAVER_FROM or day in known:
            continue
        if back == 0 and not TODAY_FROM_HOUR <= hour <= TODAY_UNTIL_HOUR:
            continue
        out.append(day)
    return out


def parse_targets(event: Dict[str, Any], today: date) -> Optional[Tuple[List[date], bool]]:
    """날짜 지정 재처리 요청 {"dates": [...]} 또는 {"from": ..., "to": ...} (선택 "force": true). 지정이 없으면 None."""
    if not isinstance(event, dict) or not (event.get('dates') or event.get('from') or event.get('to')):
        return None
    try:
        if event.get('dates'):
            days = sorted({date.fromisoformat(str(text)) for text in event['dates']})
        else:
            start, end = date.fromisoformat(str(event.get('from'))), date.fromisoformat(str(event.get('to')))
            days = [start + timedelta(days=i) for i in range((end - start).days + 1)]
    except ValueError:
        raise ValueError('날짜는 YYYY-MM-DD 형식이어야 하고 from 과 to 를 함께 줘야 해요') from None
    if not days:
        raise ValueError('from 이 to 보다 늦어요')
    if len(days) > MAX_EXPLICIT_DAYS:
        raise ValueError(f'한 번에 {MAX_EXPLICIT_DAYS}일까지만 다시 처리해요(요청 {len(days)}일)')
    if days[0] < NAVER_FROM or days[-1] > today:
        raise ValueError(f'날짜는 {NAVER_FROM} 부터 오늘({today})까지여야 해요')
    return days, bool(event.get('force'))


# ---------- 실행 ----------

def collect(days: Iterable[date], *, s3: Any, bucket: str, now: datetime, fetch: Optional[Callable[[date], str]] = None,
            sleep: Optional[Callable[[float], None]] = None, force: bool = False) -> Dict[str, Any]:
    """days 를 차례로 받아 연도 파일에 반영한다. 반환: {날짜: 상태}.
    상태: saved · no_list · sunday · pending(오늘 목록이 아직 없음) · kept · covered · error:<이유>. 403·429 면 지금까지를 저장한 뒤 Blocked.
    fetch·sleep 은 부를 때 찾는다(기본 인자로 두면 정의 시점의 함수가 고정돼 바꿔 끼울 수 없다)."""
    fetch = fetch or fetch_page
    sleep = sleep or time.sleep
    today = now.astimezone(KST).date()
    now_iso = now.astimezone(KST).isoformat(timespec='seconds')
    docs: Dict[int, Dict[str, Any]] = {}
    dirty: set = set()
    results: Dict[str, str] = {}
    blocked: Optional[Blocked] = None
    fetched = 0
    for day in days:
        key = day.isoformat()
        try:
            doc = docs.get(day.year) or docs.setdefault(day.year, load_year(s3, bucket, day.year))
            if not force and day in covered_days(doc, day, day):
                results[key] = 'covered'
                continue
            sunday = is_paperless_sunday(day)
            if sunday:
                articles = None   # 일요일자가 없는 날은 받지 않는다
            else:
                if fetched:
                    sleep(SPACING_SECONDS)
                fetched += 1
                articles = read_page(fetch(day), day)
            if articles is None and day == today and not sunday:
                results[key] = 'pending'   # 오늘 목록이 아직 올라오지 않았을 수 있어 확인 처리하지 않는다
                continue
            outcome = apply_day(doc, day, articles, now_iso)
            results[key] = 'sunday' if sunday and outcome == 'no_list' else outcome
            dirty.add(day.year)
        except Blocked as e:
            blocked = e
            results[key] = f'error:{e}'
            break
        except NaverError as e:
            results[key] = f'error:{e}'
    for year in sorted(dirty):
        save_year(s3, bucket, docs[year])
    if blocked:
        raise Blocked(str(blocked), results)
    return results
