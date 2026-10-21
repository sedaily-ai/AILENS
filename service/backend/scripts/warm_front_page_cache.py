"""생일 1면 캐시 미리 채우기 — 날짜마다 get_front_page_data 를 로컬에서 불러 DynamoDB 캐시(timemachine_frontv2_*)를 채운다.

실행: cd service/backend && AWS_DEFAULT_REGION=us-east-1 uv run --no-project --with boto3==1.35.0 --with requests==2.32.3 \\
        python scripts/warm_front_page_cache.py --state-dir <폴더> [--from 1990-01-01] [--to <오늘-7일>] [--workers 3] [--dry-run]

- 대상: --from ~ --to(기본 1990-01-01 ~ 오늘(KST)-7일) 또는 --dates 파일(한 줄에 날짜 하나).
- 서버와 같은 함수(handlers.timeline.time_machine.get_front_page_data)를 그대로 부른다. 이미 캐시가 있는 날은 GetItem 만 하고
  넘어간다. 쓰기는 조건부 PutItem 이라 살아 있는 항목을 덮어쓰지 않는다. 보관 1년 미만 결과(이슈 순위 실패, 최근 날짜의 0건)는
  쓰지 않고 retry-dates.txt 에 남긴다.
- 날짜를 --workers 개의 연속 구간으로 나눠 구간마다 오름차순으로 돈다(토요일이 일요일보다 먼저 끝나야 거슬러 간 날의 캐시
  재사용이 걸린다). 동시 빅카인즈 요청은 최대 workers×2 — worker 마다 1 + 이슈 순위 자리(time_machine._ranking_slots) workers 개.
  그날 기사가 없어 버린 순위 요청도 끝날 때까지 자리를 쥐고, 자리가 없으면 그날 기사부터 묻는다. 끝내기 전에 남은 순위 요청이
  모두 끝나기를 기다려(호출 제한 + 5초까지) 그 응답의 한도·차단도 멈춤 이유와 종료 코드에 넣는다.
- 상태 폴더(--state-dir): checkpoint.json(구간별 다음 날짜 — 다시 실행하면 이어 간다), written-keys.txt(쓰려 한 키 — 되돌릴 때 이
  키만 지운다), results.jsonl(날짜별 결과, 제목·본문 없음), retry-dates.txt, notable.jsonl(kind=none·no_paper 결과, 사람이 훑어볼 것),
  progress.log, summary.json. 날짜마다 results·notable 줄을 디스크까지 내린 뒤에 체크포인트를 올린다 — 그 사이에 끊기면 이어 갈 때
  같은 날을 다시 한다(쓴 캐시는 조건부 PutItem 이 지킨다). 그 기록이 실패하면 멈춘다.
- written-keys.txt 는 PutItem 을 보내기 *전에* 키를 덧붙이고 디스크까지 내린다. 그래서 PutItem 이 성공한 직후 끊기거나 응답 없이
  시간이 넘어도(서버에서는 썼을 수 있다) 키가 목록에 있다. 대신 실제로는 쓰지 않은 키(조건 실패로 이미 있던 항목, 실패한 쓰기)도
  들어가 목록이 실제보다 넓을 수 있다 — 대상이 캐시라 더 지워도 다음 조회 때 서버가 다시 만들 뿐이라 이 쪽을 골랐다(쓰기 전 기록과
  항목 대조로 정확히 가르는 방법은 쓰지 않는다). 같은 날을 다시 쓰면 키가 두 번 들어갈 수 있으니 되돌릴 때 sort -u 로 지운다.
  키를 남기지 못하면 PutItem 을 보내지 않고 멈춘다.
- summary.json 은 이어 간 실행 전체의 누적이다. 처리·새로 씀·이미 있음·실패·잠정은 results.jsonl(날짜별)에서 다시 세고, 빅카인즈
  호출·쓰기·버린 순위·경과는 지난 summary.json 에 이번 실행 몫을 더한다(이번 실행 몫만은 this_run). 앞 실행이 요약을 남기지 못하고
  끊겼으면 그 실행의 호출 수를 알 수 없어 calls_partial 이 true 다.
- 체크포인트 신원: 날짜 목록·workers·dry-run 여부·서버 코드(CODE_FILES 내용의 SHA-1)가 하나라도 다르면 이어 가지 않는다. --restart 는
  이전 실행 파일(체크포인트·results·notable·retry-dates·summary·progress)을 previous/<시각>/ 로 옮기고 새로 시작한다.
  written-keys.txt 는 옮기지 않고 이어 쓴다(이 폴더에서 쓰려 한 키 전체가 되돌릴 목록).
- 멈춤(즉시): 연속 실패 5회, 최근 시도 100건 중 실패 11건 이상(10% 초과), 빅카인즈 HTTP 429·403·401 또는 한도·쿼터로 보이는 응답,
  Ctrl-C. 멈추면 새 날짜를 시작하지 않고 진행 중인 날짜의 다음 빅카인즈 요청과 쓰기도 막는다(쓰기 한도에서 기다리던 쓰기도 기다린
  뒤 다시 확인해 보내지 않는다). 이유는 progress.log·summary.json 에
  남고 종료 코드는 2. 실패 = 예외 또는 basis ranking_failed(이미 있음은 세지 않는다).
- 시작 전에 캐시 표의 과금 모드를 describe 로 확인한다. PROVISIONED 면 쓰기·읽기를 용량의 절반 이하로 늦춘다(다른 기능도 쓰는 표).
  실제 실행에서 확인하지 못하면 시작하지 않는다.
- --dry-run: DynamoDB 를 읽지도 쓰지도 않고 메모리 표로 돌려 결과만 results.jsonl 에 남긴다. --code-root 로 다른 트리(예: 옛 커밋을
  git archive 로 푼 service/backend)의 로직을 돌리고, --compare OLD.jsonl NEW.jsonl 로 두 결과를 날짜별로 비교한다(내용이 다른 날이나
  한쪽에만 있는 날이 있으면 종료 코드 3).
빅카인즈 API 키는 서버 코드가 SSM 에서만 읽는다. 이 스크립트는 요청 본문·인자·키를 어디에도 기록하지 않는다.
"""
import argparse
import hashlib
import json
import logging
import os
import re
import subprocess
import sys
import tempfile
import threading
import time
from collections import Counter, deque
from concurrent.futures import ThreadPoolExecutor
from datetime import date as Date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Callable, Dict, List, Optional, Tuple

BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
KST = timezone(timedelta(hours=9))
FIRST_DATE = '1990-01-01'  # 빅카인즈 보관본 시작(time_machine.BIGKINDS_MIN_DATE)
DEFAULT_LAG_DAYS = 7
REGION = 'us-east-1'

CONSECUTIVE_FAILURES = 5
WINDOW = 100
WINDOW_FAILURES = 11  # 최근 100건 중 10% 초과
STOP_STATUSES = (401, 403, 429)
SMALL_BODY_BYTES = 4096  # 정상 응답(수백 KB~수 MB)보다 훨씬 작은 오류 응답만 열어 본다
QUOTA_RE = re.compile(r'한도|쿼터|초과|제한|limit|quota|exceed|too many', re.IGNORECASE)
_TOKEN_RE = re.compile(r'[A-Za-z0-9_-]{20,}')  # 오류 문구에 키처럼 긴 값이 섞여도 남기지 않는다
MIN_KEEP_SECONDS = 365 * 86400
CACHE_ATTRS = frozenset({'news_id', 'item_type', 'date', 'data', 'cached_at', 'expires_at'})
CALL_KINDS = ('day', 'ranking', 'front', 'front_count')
PROGRESS_EVERY = 50
EXIT_STOPPED, EXIT_DIFF = 2, 3
COMPARE_FIELDS = ('kind', 'date_kind', 'shown_date', 'reason', 'basis', 'article_ids', 'coverage', 'data_sha1')
# 결과를 정하는 서버 파일(코드 루트 기준). 체크포인트 신원에 내용 SHA-1 로 들어간다 — 저장소의 다른 커밋에는 흔들리지 않는다.
CODE_FILES = ('handlers/timeline/time_machine.py', 'services/timeline/bigkinds_search.py',
              'services/timeline/front_calendar.py', 'services/timeline/front_page_calendar.json')
CHECKPOINT_IDENTITY = (('dates_sha1', '날짜 범위'), ('workers', 'workers'), ('dry_run', 'dry-run 여부'), ('code_sha1', '서버 코드'))
# 실행마다 따로인 파일. --restart 는 이것들을 previous/ 아래로 옮긴다(written-keys.txt 는 이어 쓴다).
RUN_FILES = ('checkpoint.json', 'results.jsonl', 'notable.jsonl', 'retry-dates.txt', 'summary.json', 'progress.log')


class StopRequested(RuntimeError):
    """멈춤이 정해진 뒤 새 빅카인즈 요청을 막는다."""


# ─── 인자·날짜 ────────────────────────────────────────────────────────────────

def _iso(value: str, parser: argparse.ArgumentParser, name: str) -> str:
    try:
        return Date.fromisoformat(value.strip()).isoformat()
    except ValueError:
        parser.error(f'{name}: YYYY-MM-DD 형식이 아님')


def parse_args(argv=None, today: Optional[Date] = None) -> argparse.Namespace:
    today = today or datetime.now(KST).date()
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('--state-dir', help='진행·결과 파일 폴더(필수)')
    parser.add_argument('--from', dest='start', default=FIRST_DATE)
    parser.add_argument('--to', dest='end', default=(today - timedelta(days=DEFAULT_LAG_DAYS)).isoformat())
    parser.add_argument('--dates', help='범위 대신 이 파일의 날짜(한 줄에 하나)')
    parser.add_argument('--workers', type=int, default=3)
    parser.add_argument('--dry-run', action='store_true', help='DynamoDB 를 읽지도 쓰지도 않는다')
    parser.add_argument('--code-root', help='(dry-run 전용) 이 service/backend 트리의 로직을 쓴다')
    parser.add_argument('--budget', type=float, default=60, help='날짜당 찾기 예산 초(서버 20초 대신)')
    parser.add_argument('--call-timeout', type=float, default=40, help='빅카인즈 호출당 제한 초(서버 10~20초 대신)')
    parser.add_argument('--restart', action='store_true',
                        help='체크포인트를 새로 시작(이전 실행 파일은 previous/ 로 옮기고 written-keys.txt 는 이어 씀)')
    parser.add_argument('--compare', nargs=2, metavar=('OLD', 'NEW'), help='두 results.jsonl 비교만 하고 끝')
    parser.add_argument('--verbose', action='store_true')
    args = parser.parse_args(argv)
    if args.compare:
        return args
    if not args.state_dir:
        parser.error('--state-dir 가 필요합니다')
    if args.code_root and not args.dry_run:
        parser.error('--code-root 는 --dry-run 에서만 씁니다(다른 트리의 로직으로 캐시를 쓰지 않는다)')
    if args.workers < 1:
        parser.error('--workers 는 1 이상')
    args.start, args.end = _iso(args.start, parser, '--from'), _iso(args.end, parser, '--to')
    if args.end >= today.isoformat():
        parser.error('--to 는 오늘(KST)보다 앞이어야 합니다(오늘 신문은 저장하지 않는다)')
    if args.start < FIRST_DATE or args.start > args.end:
        parser.error(f'--from 은 {FIRST_DATE} 이후이고 --to 이하여야 합니다')
    if args.dates:
        with open(args.dates, encoding='utf-8') as fp:
            days = sorted({_iso(line, parser, '--dates') for line in fp if line.strip()})
        if not days or days[0] < FIRST_DATE or days[-1] >= today.isoformat():
            parser.error(f'--dates 의 날짜는 {FIRST_DATE} 이후, 오늘 전이어야 합니다')
        args.days = days
    else:
        first, last = Date.fromisoformat(args.start), Date.fromisoformat(args.end)
        args.days = [(first + timedelta(days=i)).isoformat() for i in range((last - first).days + 1)]
    return args


def plan_chunks(count: int, workers: int) -> List[Tuple[int, int]]:
    """0..count-1 을 workers 개 이하의 연속 구간(양 끝 포함)으로 고르게 나눈다."""
    bounds = [count * i // workers for i in range(workers + 1)]
    return [(bounds[i], bounds[i + 1] - 1) for i in range(workers) if bounds[i] < bounds[i + 1]]


# ─── 멈춤·호출 세기 ────────────────────────────────────────────────────────────

class Guard:
    """멈춤 판단. 이유가 정해지면 새 날짜·새 빅카인즈 요청·캐시 쓰기를 모두 막는다."""

    def __init__(self):
        self._lock = threading.Lock()
        self.reason: Optional[str] = None
        self._consecutive = 0
        self._recent = deque(maxlen=WINDOW)

    def stop(self, reason: str) -> None:
        with self._lock:
            if self.reason is None:
                self.reason = reason

    def check(self) -> None:
        if self.reason:
            raise StopRequested(self.reason)

    def record(self, failed: bool) -> None:
        """시도한 날짜 하나의 결과(이미 있음은 넣지 않는다)."""
        with self._lock:
            self._consecutive = self._consecutive + 1 if failed else 0
            self._recent.append(failed)
            consecutive, failures, seen = self._consecutive, sum(self._recent), len(self._recent)
        if consecutive >= CONSECUTIVE_FAILURES:
            self.stop(f'연속 실패 {consecutive}회')
        elif failures >= WINDOW_FAILURES:
            self.stop(f'최근 시도 {seen}건 중 실패 {failures}건(10% 초과)')


def stop_reason_for(res) -> Optional[str]:
    """빅카인즈 응답이 한도·차단으로 보이면 멈출 이유, 아니면 None."""
    status = getattr(res, 'status_code', None)
    if status in STOP_STATUSES:
        return f'빅카인즈 HTTP {status}'
    content = getattr(res, 'content', None)
    if not isinstance(content, (bytes, bytearray)) or len(content) >= SMALL_BODY_BYTES:
        return None
    try:
        body = json.loads(content)
    except ValueError:
        return None
    if not isinstance(body, dict) or body.get('result') in (0, None):
        return None
    reason = str(body.get('reason') or '')
    if QUOTA_RE.search(reason):
        return f"빅카인즈 한도·쿼터로 보이는 응답(result={body.get('result')}): {_TOKEN_RE.sub('***', reason)[:80]}"
    return None


class Calls:
    def __init__(self):
        self._lock = threading.Lock()
        self.counts: Counter = Counter()

    def add(self, kind: str) -> None:
        with self._lock:
            self.counts[kind] += 1

    def snapshot(self) -> Dict[str, int]:
        with self._lock:
            return {k: self.counts[k] for k in CALL_KINDS + ('http_error',)}


def call_kind(bs, url: str, payload: Optional[dict]) -> str:
    if url == bs.BIGKINDS_ISSUE_URL:
        return 'ranking'
    fields = list(((payload or {}).get('argument') or {}).get('fields') or [])
    if fields == list(bs.FRONT_COUNT_FIELDS):
        return 'front_count'
    return 'front' if 'printing_page' in fields else 'day'


def counting_post(original: Callable, bs, calls: Calls, guard: Guard) -> Callable:
    """빅카인즈 POST 를 감싼다 — 멈춘 뒤에는 보내지 않고, 보내기 직전에 종류별로 세고, 한도 응답이면 멈춘다.
    bigkinds_search._post(url, payload, timeout) 와 옛 코드의 requests.post(url, json=payload, timeout=…) 를 함께 받는다."""
    def post(url, *args, **kwargs):
        guard.check()
        calls.add(call_kind(bs, url, kwargs.get('json', args[0] if args else None)))
        try:
            res = original(url, *args, **kwargs)
        except Exception:
            calls.add('http_error')
            raise
        reason = stop_reason_for(res)
        if reason:
            guard.stop(reason)
        return res
    return post


class _DiscardCounter(logging.Handler):
    """서버 코드가 남기는 '버린 이슈 순위' 줄을 센다(옛 코드에는 없어 0)."""

    def __init__(self, message: Optional[str]):
        super().__init__(logging.INFO)
        self.message, self.count = message, 0

    def emit(self, record):
        if self.message and record.getMessage() == self.message:
            self.count += 1


# ─── 캐시 표 ──────────────────────────────────────────────────────────────────

class Limiter:
    """초당 rate 단위 이하로 늦춘다(rate 가 없으면 제한 없음). 모자라면 빚으로 두고 그만큼 잔다."""

    def __init__(self, rate: Optional[float], clock: Callable[[], float] = time.monotonic,
                 sleep: Callable[[float], None] = time.sleep):
        self.rate, self._clock, self._sleep = rate, clock, sleep
        self._lock = threading.Lock()
        self._tokens = rate or 0.0
        self._last = clock()

    def take(self, units: float) -> None:
        if not self.rate:
            return
        with self._lock:
            now = self._clock()
            self._tokens = min(self.rate, self._tokens + (now - self._last) * self.rate) - units
            self._last = now
            wait = -self._tokens / self.rate if self._tokens < 0 else 0.0
        if wait > 0:
            self._sleep(wait)


def item_units(item: dict) -> int:
    """쓰기 용량 단위(1KB 당 1). 크기는 JSON 길이로 어림한다."""
    return max(1, -(-len(json.dumps(item, default=str, ensure_ascii=False).encode('utf-8')) // 1024))


class _Store:
    """get_front_page_data 가 쓰는 표 자리에 끼운다. 날짜별 쓰기 결과를 기록한다."""

    def __init__(self, guard: Guard, clock: Callable[[], float] = time.time):
        self.guard, self.clock = guard, clock
        self._lock = threading.Lock()
        self._notes: Dict[str, Tuple[str, Optional[float]]] = {}
        self.writes = 0

    def _note(self, item: dict, outcome: str) -> None:
        ttl_days = round((float(item['expires_at']) - self.clock()) / 86400, 2)
        with self._lock:
            self._notes[item['date']] = (outcome, ttl_days)

    def pop(self, day: str) -> Tuple[Optional[str], Optional[float]]:
        with self._lock:
            return self._notes.pop(day, (None, None))

    def put_item(self, Item):
        if self.guard.reason:
            return self._note(Item, 'blocked')
        if float(Item['expires_at']) - self.clock() < MIN_KEEP_SECONDS:
            return self._note(Item, 'provisional')  # 잠정 결과는 쓰지 않고 다시 시도한다
        self._note(Item, self._write(Item))

    def _write(self, item: dict) -> str:
        raise NotImplementedError


class MemoryStore(_Store):
    """--dry-run 표. 실제 DynamoDB 는 부르지 않는다. 같은 실행 안의 거슬러 간 날 재사용은 실제 실행과 똑같이 걸린다."""

    def __init__(self, guard: Guard, clock: Callable[[], float] = time.time):
        super().__init__(guard, clock)
        self.items: Dict[str, dict] = {}

    def get_item(self, Key):
        item = self.items.get(Key['news_id'])
        return {'Item': item} if item else {}

    def _write(self, item: dict) -> str:
        self.items[item['news_id']] = item
        return 'written'


class DynamoStore(_Store):
    """실제 표. 읽기·쓰기 한도를 지키고, 살아 있는 항목은 덮어쓰지 않으며, 쓰려는 키를 PutItem 전에 파일에 남긴다."""

    def __init__(self, table, guard: Guard, reads: Limiter, writes: Limiter, keys_path: str,
                 clock: Callable[[], float] = time.time):
        super().__init__(guard, clock)
        self.table, self.reads, self.write_limit, self.keys_path = table, reads, writes, keys_path

    def get_item(self, Key):
        self.reads.take(0.5)  # 4KB 이하 일관성 없는 읽기
        return self.table.get_item(Key=Key)

    def _write(self, item: dict) -> str:
        self.write_limit.take(item_units(item))
        if self.guard.reason:  # 쓰기 한도에서 기다리는 동안 다른 worker 가 멈춤을 정했으면 보내지 않는다
            return 'blocked'
        # 키를 먼저 디스크까지 남기고 PutItem 을 보낸다. 성공 직후 끊기거나 결과를 모르는 시간 초과여도 되돌릴 목록에 남는다.
        # 조건 실패·실패한 쓰기의 키도 남아 목록이 실제보다 넓어질 수 있다 — 캐시라 더 지워도 다음 조회가 다시 만든다(모듈 설명).
        try:
            with self._lock, open(self.keys_path, 'a', encoding='utf-8') as fp:
                fp.write(item['news_id'] + '\n')
                fp.flush()
                os.fsync(fp.fileno())
        except OSError as e:
            self.guard.stop(f'written-keys.txt 에 키를 남기지 못함({type(e).__name__})')
            return 'blocked'
        try:
            self.table.put_item(Item=item, ConditionExpression='attribute_not_exists(news_id) OR expires_at < :now',
                                ExpressionAttributeValues={':now': int(self.clock())})
        except Exception as e:  # noqa: BLE001
            code = (getattr(e, 'response', None) or {}).get('Error', {}).get('Code')
            if code == 'ConditionalCheckFailedException':
                return 'exists'
            logging.getLogger(__name__).warning('캐시 쓰기 실패: %s', type(e).__name__)
            return 'write_failed'
        with self._lock:
            self.writes += 1
        return 'written'


def capacity_limits(client, table_name: str) -> dict:
    """과금 모드와 쓰기·읽기 한도(PROVISIONED 면 용량의 절반, 단위/초). 캐시 항목이 들어가는 GSI 의 쓰기 용량도 본다."""
    desc = client.describe_table(TableName=table_name)['Table']
    mode = (desc.get('BillingModeSummary') or {}).get('BillingMode') or 'PROVISIONED'
    info = {'table': table_name, 'billing_mode': mode, 'arn': desc.get('TableArn'), 'write_limit': None, 'read_limit': None}
    if mode == 'PROVISIONED':
        throughput = desc.get('ProvisionedThroughput') or {}
        wcu = [throughput.get('WriteCapacityUnits', 0)]
        for gsi in desc.get('GlobalSecondaryIndexes') or []:
            if {k['AttributeName'] for k in gsi.get('KeySchema') or []} <= CACHE_ATTRS:
                wcu.append((gsi.get('ProvisionedThroughput') or {}).get('WriteCapacityUnits', 0))
        info.update(write_limit=max(min(wcu) / 2, 0.1), read_limit=max(throughput.get('ReadCapacityUnits', 0) / 2, 0.1),
                    wcu=wcu, rcu=throughput.get('ReadCapacityUnits'))
    return info


def service_tag(client, arn: Optional[str]) -> str:
    try:
        tags = client.list_tags_of_resource(ResourceArn=arn)['Tags']
        return next((t['Value'] for t in tags if t['Key'] == 'Service'), '없음')
    except Exception:  # noqa: BLE001
        return '확인 못함'


# ─── 실행 ────────────────────────────────────────────────────────────────────

def _plain(value):
    if isinstance(value, Decimal):
        return int(value) if value % 1 == 0 else float(value)
    raise TypeError(type(value).__name__)


def _clean(value):
    return json.loads(json.dumps(value, default=_plain, ensure_ascii=False))


def summarize_result(result: dict) -> dict:
    """results.jsonl 한 줄에 넣을 결과(제목·본문 없이 기사 번호와 coverage, 저장될 data 전체의 SHA-1)."""
    data = _clean({k: v for k, v in result.items() if k not in ('status', 'cached')})
    articles = data.get('articles') or []
    return {'kind': data.get('kind'), 'date_kind': data.get('date_kind'), 'shown_date': data.get('shown_date'),
            'reason': data.get('reason'), 'basis': data.get('basis'),
            'article_ids': [a.get('news_id') for a in articles], 'coverage': [a.get('coverage') for a in articles],
            'data_sha1': hashlib.sha1(json.dumps(data, sort_keys=True, ensure_ascii=False).encode('utf-8')).hexdigest()}


def _write_json(path: str, value) -> None:
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as fp:
        json.dump(value, fp, ensure_ascii=False, indent=1)
        fp.write('\n')
        fp.flush()
        os.fsync(fp.fileno())
    os.replace(tmp, path)


def _append_line(handle, value) -> None:
    """JSON 한 줄을 덧붙이고 디스크까지 내린다(체크포인트를 올리기 전에 부른다)."""
    handle.write(json.dumps(value, ensure_ascii=False) + '\n')
    handle.flush()
    os.fsync(handle.fileno())


def code_digest(code_root: Optional[str]) -> str:
    """CODE_FILES 내용의 SHA-1(없는 파일은 없음으로 넣는다)."""
    root = code_root or BACKEND_DIR
    digest = hashlib.sha1()
    for rel in CODE_FILES:
        digest.update(rel.encode() + b'\0')
        try:
            with open(os.path.join(root, rel), 'rb') as fp:
                digest.update(fp.read())
        except FileNotFoundError:
            digest.update(b'missing')
        digest.update(b'\0')
    return digest.hexdigest()


def _archive_run_files(state_dir: str) -> Optional[str]:
    """--restart: 이전 실행 파일을 previous/<시각>-*/ 로 옮긴다. 옮긴 폴더(없으면 None)."""
    present = [name for name in RUN_FILES if os.path.exists(os.path.join(state_dir, name))]
    if not present:
        return None
    os.makedirs(os.path.join(state_dir, 'previous'), exist_ok=True)
    dest = tempfile.mkdtemp(prefix=datetime.now(KST).strftime('%Y%m%dT%H%M%S-'), dir=os.path.join(state_dir, 'previous'))
    for name in present:
        os.replace(os.path.join(state_dir, name), os.path.join(dest, name))
    return dest


def _load_checkpoint(path: str, days: List[str], workers: int, dry_run: bool, code_sha1: str) -> dict:
    fresh = {'from': days[0], 'to': days[-1], 'dates_sha1': hashlib.sha1('\n'.join(days).encode()).hexdigest(),
             'count': len(days), 'workers': workers, 'dry_run': dry_run, 'code_sha1': code_sha1,
             'chunks': [{'first': a, 'last': b, 'next': a} for a, b in plan_chunks(len(days), workers)]}
    if not os.path.exists(path):
        return fresh
    with open(path, encoding='utf-8') as fp:
        saved = json.load(fp)
    differ = [label for key, label in CHECKPOINT_IDENTITY if saved.get(key) != fresh[key]]
    if differ:
        raise SystemExit(f"체크포인트와 다릅니다: {', '.join(differ)}({path}). 이어 가려면 같은 인자·코드로, 새로 하려면 "
                         '--restart(이전 실행 파일은 previous/ 로 옮긴다) 또는 새 --state-dir')
    return saved


def wait_for_rankings(slots, count: int, timeout: float, say: Callable[[str], None]) -> int:
    """남은 이슈 순위 요청(버렸거나 예산을 넘겨 기다리지 않은 것)이 모두 끝나 자리 count 개가 돌아올 때까지 timeout 초까지 기다린다.
    끝나지 않은 요청 수를 돌려준다. 받은 자리는 다시 돌려 둔다."""
    taken = 0
    while taken < count and slots.acquire(blocking=False):
        taken += 1
    if taken < count:
        say(f'남은 이슈 순위 요청 {count - taken}개가 끝나기를 기다림(최대 {timeout:g}초)')
        deadline = time.monotonic() + timeout
        while taken < count and slots.acquire(timeout=max(deadline - time.monotonic(), 0)):
            taken += 1
    for _ in range(taken):
        slots.release()
    return count - taken


def _elapsed(seconds: float) -> str:
    s = int(seconds)
    return f'{s // 3600:02d}:{s % 3600 // 60:02d}:{s % 60:02d}'


def _code_version(code_root: Optional[str]) -> str:
    root = code_root or BACKEND_DIR
    try:
        rev = subprocess.run(['git', '-C', root, 'rev-parse', '--short', 'HEAD'], capture_output=True, text=True, timeout=10)
        if rev.returncode == 0 and not code_root:
            return rev.stdout.strip()
    except Exception:  # noqa: BLE001
        pass
    return root


def run(args, tm, bs, *, table=None, dynamodb=None, err=None) -> int:
    """날짜를 처리하고 상태 폴더에 결과를 남긴다. 종료 코드(0 끝, 1 시작 못함, 2 멈춤)."""
    err = err or sys.stderr
    os.makedirs(args.state_dir, exist_ok=True)
    path = lambda name: os.path.join(args.state_dir, name)  # noqa: E731
    archived = _archive_run_files(args.state_dir) if args.restart else None
    resumed = os.path.exists(path('checkpoint.json'))
    checkpoint = _load_checkpoint(path('checkpoint.json'), args.days, args.workers, args.dry_run, code_digest(args.code_root))
    # 이어 가면 요약을 앞 실행들과 합친다. 앞 요약이 없거나 그 뒤의 결과 줄이 있으면 요약 없이 끊긴 실행이 있었다는 뜻이다.
    previous = _read_summary(path('summary.json')) if resumed else None
    calls_partial = resumed and (previous is None or bool(previous.get('calls_partial')) or
                                 previous.get('processed') != tally_results(path('results.jsonl'), args.days)['processed'])
    prev = previous or {}
    progress = open(path('progress.log'), 'a', encoding='utf-8')

    def say(line: str) -> None:
        line = ('[dry-run] ' if args.dry_run else '') + line
        print(line, file=err, flush=True)
        progress.write(f'{datetime.now(KST).isoformat(timespec="seconds")} {line}\n')
        progress.flush()

    if archived:
        say(f'--restart: 이전 실행 파일을 {archived} 로 옮김(written-keys.txt 는 이어 씀)')

    try:
        limits = capacity_limits(dynamodb, tm.CACHE_TABLE)
    except Exception as e:  # noqa: BLE001
        if not args.dry_run:
            say(f'시작 안 함: 표 {tm.CACHE_TABLE} 과금 모드를 확인하지 못함({type(e).__name__})')
            progress.close()
            return 1
        limits = {'table': tm.CACHE_TABLE, 'billing_mode': f'확인 못함({type(e).__name__})', 'arn': None,
                  'write_limit': None, 'read_limit': None}
    tag = service_tag(dynamodb, limits.get('arn')) if limits.get('arn') else '확인 못함'
    say(f"표 {limits['table']} · 과금 모드 {limits['billing_mode']} · 쓰기 한도 {limits['write_limit'] or '없음'}/초 · "
        f"읽기 한도 {limits['read_limit'] or '없음'}/초 · Service 태그 {tag}")
    say(f'대상 {len(args.days)}일({args.days[0]}~{args.days[-1]}) · workers {args.workers} · 동시 빅카인즈 요청 최대 {args.workers * 2} · '
        f'코드 {_code_version(args.code_root)} · 예산 {args.budget:g}초 · 호출 제한 {args.call_timeout:g}초')

    guard, calls = Guard(), Calls()
    if args.dry_run:
        store: _Store = MemoryStore(guard)
    else:
        store = DynamoStore(table, guard, Limiter(limits['read_limit']), Limiter(limits['write_limit']),
                            path('written-keys.txt'))
    original_table = tm._get_table
    tm._get_table = lambda: store
    tm.FRONT_SEARCH_BUDGET_SECONDS = args.budget
    bs.FRONT_PAGE_TIMEOUT_SECONDS = bs.ISSUE_TIMEOUT_SECONDS = bs.FRONT_COUNT_TIMEOUT_SECONDS = args.call_timeout
    # 새 코드는 빅카인즈 POST 를 모두 bigkinds_search._post 로 보내고, 옛 코드는 requests.post 를 바로 부른다.
    holder, post_name = (bs, '_post') if hasattr(bs, '_post') else (bs.requests, 'post')
    original_post = getattr(holder, post_name)
    setattr(holder, post_name, counting_post(original_post, bs, calls, guard))
    # 이슈 순위 자리를 worker 수만큼 둔다(동시 요청 최대 workers×2). 옛 코드에는 없다(순위를 함께 부르지 않는다).
    original_slots = getattr(tm, '_ranking_slots', None)
    slots = threading.BoundedSemaphore(args.workers)
    if original_slots is not None:
        tm._ranking_slots = slots
    unfinished_rankings = 0
    discarded = _DiscardCounter(getattr(tm, 'RANKING_DISCARDED_LOG', None))
    tm_logger = getattr(tm, 'logger', None)
    if tm_logger is not None:
        tm_logger.addHandler(discarded)

    _write_json(path('checkpoint.json'), checkpoint)
    pending = sum(c['last'] - c['next'] + 1 for c in checkpoint['chunks'])
    lock = threading.Lock()
    outcomes: Counter = Counter()
    results = open(path('results.jsonl'), 'a', encoding='utf-8')
    notable = open(path('notable.jsonl'), 'a', encoding='utf-8')
    started, per_date = time.monotonic(), args.workers == 1
    done = [0]

    def progress_line() -> str:
        c = calls.snapshot()
        return (f"처리 {done[0]}/{pending} · 새로 씀 {outcomes['written']} · 이미 있음 {outcomes['exists']} · "
                f"실패 {outcomes['failed']} · 잠정 {outcomes['provisional']} · 빅카인즈 {sum(c[k] for k in CALL_KINDS)}회"
                f"(그날 기사 {c['day']}·순위 {c['ranking']}·1면 {c['front']}·1면 확인 {c['front_count']}, "
                f"버린 순위 {discarded.count}, HTTP 오류 {c['http_error']}) · 경과 {_elapsed(time.monotonic() - started)}")

    def process(day: str) -> dict:
        before, t0 = calls.snapshot() if per_date else None, time.monotonic()
        record: dict = {'date': day}
        try:
            result = tm.get_front_page_data(day)
        except StopRequested:
            outcome, result = 'stopped', None
        except Exception as e:  # noqa: BLE001 — 형식 이름만 남긴다
            outcome, result, record['error'] = 'failed', None, type(e).__name__
        else:
            written, ttl_days = store.pop(day)
            outcome = 'exists' if result.get('cached') else {
                'written': 'written', 'provisional': 'provisional', 'exists': 'exists', 'blocked': 'stopped',
            }.get(written, 'failed')
            if outcome == 'failed':
                record['error'] = 'WriteFailed' if written else 'NoWrite'
            record.update(summarize_result(result), ttl_days=ttl_days)
        if guard.reason and outcome in ('failed', 'provisional'):
            outcome = 'stopped'  # 멈춤 때문에 끝나지 못한 날짜 — 이어 갈 때 다시 한다
        record['outcome'] = outcome
        record['seconds'] = round(time.monotonic() - t0, 2)
        if before is not None:
            after = calls.snapshot()
            record['calls'] = {k: after[k] - before[k] for k in after if after[k] != before[k]}
        if outcome not in ('exists', 'stopped'):
            guard.record(outcome == 'failed' or record.get('basis') == 'ranking_failed')
        return record

    def run_chunk(chunk: dict) -> None:
        while chunk['next'] <= chunk['last'] and not guard.reason:
            day = args.days[chunk['next']]
            try:
                record = process(day)
                if record['outcome'] == 'stopped':
                    return
                with lock:
                    # 결과 줄을 먼저 디스크에 남기고 체크포인트를 올린다. 거꾸로 하면 그 사이에 끊긴 날짜가 캐시에도
                    # retry-dates 에도 없이 완료로 넘어간다.
                    _append_line(results, record)
                    if record.get('kind') == 'none' or record.get('reason') == 'no_paper':
                        _append_line(notable, {k: record.get(k) for k in ('date', 'kind', 'reason', 'shown_date', 'basis', 'outcome')})
                    chunk['next'] += 1
                    _write_json(path('checkpoint.json'), checkpoint)
                    outcomes[record['outcome']] += 1
                    done[0] += 1
                    if done[0] % PROGRESS_EVERY == 0:
                        say(progress_line())
            except Exception as e:  # noqa: BLE001 — 남기지 못한 날짜는 완료로 치지 않고 멈춘다(이어 갈 때 그날부터)
                guard.stop(f'{day} 결과를 남기지 못함({type(e).__name__})')
                return

    with ThreadPoolExecutor(max_workers=len(checkpoint['chunks']), thread_name_prefix='warm') as pool:
        futures = [pool.submit(run_chunk, c) for c in checkpoint['chunks'] if c['next'] <= c['last']]
        try:
            for future in futures:
                future.result()
        except KeyboardInterrupt:
            guard.stop('사용자 중단(Ctrl-C)')
            for future in futures:
                future.result()
    if original_slots is not None:
        # 늦게 온 순위 응답의 한도·차단도 멈춤 이유에 넣는다. 감싼 POST 는 그 뒤에 되돌린다.
        unfinished_rankings = wait_for_rankings(slots, args.workers, args.call_timeout + 5, say)
        if unfinished_rankings:
            say(f'끝나지 않은 이슈 순위 요청 {unfinished_rankings}개(결과는 버려진다)')
        tm._ranking_slots = original_slots
    for handle in (results, notable):
        handle.close()
    if tm_logger is not None:
        tm_logger.removeHandler(discarded)
    setattr(holder, post_name, original_post)
    tm._get_table = original_table

    _write_retry_dates(path('results.jsonl'), path('retry-dates.txt'))
    say(progress_line())
    snap, elapsed = calls.snapshot(), time.monotonic() - started
    counts = tally_results(path('results.jsonl'), args.days)
    total_calls = {k: (prev.get('calls') or {}).get(k, 0) + snap[k] for k in snap}
    calls_total = sum(total_calls[k] for k in CALL_KINDS)
    runs = prev.get('runs', 1) + 1 if resumed else 1
    total_elapsed = prev.get('elapsed_seconds', 0) + elapsed
    if resumed:
        say(f"누적(실행 {runs}회): 처리 {counts['processed']}/{len(args.days)} · 새로 씀 {counts['written']} · "
            f"이미 있음 {counts['exists']} · 실패 {counts['failed']} · 잠정 {counts['provisional']} · 빅카인즈 {calls_total}회"
            f"{'(요약 없이 끊긴 앞 실행 몫 빠짐)' if calls_partial else ''} · 경과 {_elapsed(total_elapsed)}")
    if guard.reason:
        say(f'멈춤: {guard.reason}')
    _write_json(path('summary.json'), {
        'dry_run': args.dry_run, 'code': _code_version(args.code_root), 'from': args.days[0], 'to': args.days[-1],
        'targets': len(args.days), 'workers': args.workers, 'processed': counts['processed'],
        'written': counts['written'], 'exists': counts['exists'], 'failed': counts['failed'],
        'provisional': counts['provisional'], 'writes': prev.get('writes', 0) + store.writes, 'calls': total_calls,
        'calls_total': calls_total, 'calls_partial': calls_partial,
        'ranking_discarded': prev.get('ranking_discarded', 0) + discarded.count,
        'rankings_unfinished': prev.get('rankings_unfinished', 0) + unfinished_rankings, 'stop_reason': guard.reason,
        'elapsed_seconds': round(total_elapsed, 1), 'runs': runs,
        'this_run': {'processed': done[0], 'written': outcomes['written'], 'writes': store.writes,
                     'calls_total': sum(snap[k] for k in CALL_KINDS), 'elapsed_seconds': round(elapsed, 1)},
        'finished_at': datetime.now(KST).isoformat(timespec='seconds'),
        'table': {k: limits.get(k) for k in ('table', 'billing_mode', 'write_limit', 'read_limit')}, 'service_tag': tag,
    })
    progress.close()
    return EXIT_STOPPED if guard.reason else 0


def _last_by_date(path: str) -> Dict[str, dict]:
    rows: Dict[str, dict] = {}
    if os.path.exists(path):
        with open(path, encoding='utf-8') as fp:
            for line in fp:
                if line.strip():
                    row = json.loads(line)
                    rows[row['date']] = row
    return rows


def tally_results(results_path: str, days: List[str]) -> Counter:
    """results.jsonl 에서 대상 날짜별 결과를 센다(이어 간 실행 전체). processed 는 결과를 남긴 날짜 수. 같은 날 줄이 여럿이면(결과를
    남긴 뒤 체크포인트 전에 끊겨 다시 한 날 — 두 번째는 앞서 쓴 캐시를 읽어 '이미 있음'이 된다) 한 번이라도 쓴 날은 written."""
    wanted, final = set(days), {}
    if os.path.exists(results_path):
        with open(results_path, encoding='utf-8') as fp:
            for line in fp:
                if line.strip():
                    row = json.loads(line)
                    if row['date'] in wanted and final.get(row['date']) != 'written':
                        final[row['date']] = row.get('outcome')
    counts = Counter(final.values())
    counts['processed'] = len(final)
    return counts


def _read_summary(path: str) -> Optional[dict]:
    try:
        with open(path, encoding='utf-8') as fp:
            return json.load(fp)
    except (FileNotFoundError, ValueError):
        return None


def _write_retry_dates(results_path: str, out_path: str) -> None:
    rows = _last_by_date(results_path)
    retry = sorted(d for d, r in rows.items() if r.get('outcome') in ('failed', 'provisional'))
    with open(out_path, 'w', encoding='utf-8') as fp:
        fp.write(''.join(d + '\n' for d in retry))


# ─── 비교 ────────────────────────────────────────────────────────────────────

def _unusable(row: dict) -> bool:
    return row.get('outcome') in ('failed', 'stopped') or row.get('basis') == 'ranking_failed'


def _short(value) -> str:
    text = json.dumps(value, ensure_ascii=False)
    return text if len(text) <= 120 else text[:117] + '…'


def compare(old_path: str, new_path: str, out=None) -> int:
    """두 results.jsonl 을 날짜별(마지막 줄)로 비교한다. 내용이 다른 날이나 한쪽에만 있는 날(잘린 결과)이 있으면 3.
    저장 기간 차이는 정보로만 낸다."""
    out = out or sys.stdout
    old, new = _last_by_date(old_path), _last_by_date(new_path)
    same, differ, excluded, ttl_changed = 0, [], 0, 0
    one_side = sorted(set(old) ^ set(new))
    more_calls, extra = 0, 0
    for day in sorted(set(old) & set(new)):
        a, b = old[day], new[day]
        if isinstance(a.get('calls'), dict) and isinstance(b.get('calls'), dict):
            delta = sum(b['calls'].get(k, 0) for k in CALL_KINDS) - sum(a['calls'].get(k, 0) for k in CALL_KINDS)
            if delta > 0:
                more_calls, extra = more_calls + 1, extra + delta
        if _unusable(a) or _unusable(b):
            excluded += 1
            continue
        fields = [f for f in COMPARE_FIELDS if a.get(f) != b.get(f)]
        if fields:
            differ.append(day)
            print(f'다름 {day}: ' + '; '.join(f'{f} {_short(a.get(f))} → {_short(b.get(f))}' for f in fields), file=out)
        else:
            same += 1
        if a.get('ttl_days') != b.get('ttl_days'):
            ttl_changed += 1
    print(f'같음 {same} · 다름 {len(differ)} · 비교 제외(실패·멈춤·ranking_failed) {excluded} · 한쪽에만 있음 {len(one_side)} · '
          f'저장 기간이 달라진 날 {ttl_changed}(정보)', file=out)
    if one_side:
        print('한쪽에만 있음: ' + ', '.join(one_side[:20]) + (' …' if len(one_side) > 20 else ''), file=out)
    for label, results_path in (('옛', old_path), ('새', new_path)):
        summary_path = os.path.join(os.path.dirname(os.path.abspath(results_path)), 'summary.json')
        if os.path.exists(summary_path):
            with open(summary_path, encoding='utf-8') as fp:
                s = json.load(fp)
            print(f"{label} 로직: 빅카인즈 {s.get('calls_total')}회 {s.get('calls')} · 버린 순위 {s.get('ranking_discarded')}", file=out)
    print(f'새 로직이 더 많이 부른 날 {more_calls}일 · 그 합 +{extra}회(날짜별 호출 수가 있는 날만)', file=out)
    return EXIT_DIFF if differ or one_side else 0


# ─── 진입점 ──────────────────────────────────────────────────────────────────

def load_code(code_root: Optional[str]):
    """서버 코드를 불러온다. --code-root 면 그 트리(옛 커밋)의 handlers·services·common·config 를 쓴다."""
    sys.path.insert(0, os.path.abspath(code_root) if code_root else BACKEND_DIR)
    from config.constants import DYNAMODB_TABLE_ARTICLES_DEV
    from handlers.timeline import time_machine as tm
    from services.timeline import bigkinds_search as bs
    if tm.CACHE_TABLE != DYNAMODB_TABLE_ARTICLES_DEV:
        raise SystemExit(f'캐시 표가 {DYNAMODB_TABLE_ARTICLES_DEV} 가 아닙니다(DYNAMODB_TABLE_ARTICLES 환경 변수 확인)')
    return tm, bs


def main(argv=None) -> int:
    args = parse_args(argv)
    if args.compare:
        return compare(*args.compare)
    logging.basicConfig(level=logging.WARNING, format='%(levelname)s %(name)s: %(message)s')
    for handler in logging.getLogger().handlers:
        # 서버 코드의 INFO 줄(캐시 히트 등)은 화면에 내지 않는다. 버린 순위 셈은 따로 붙인 핸들러가 한다.
        handler.setLevel(logging.INFO if args.verbose else logging.WARNING)
    tm, bs = load_code(args.code_root)
    import boto3
    dynamodb = boto3.client('dynamodb', region_name=REGION)
    table = None if args.dry_run else boto3.resource('dynamodb', region_name=REGION).Table(tm.CACHE_TABLE)
    return run(args, tm, bs, table=table, dynamodb=dynamodb)


if __name__ == '__main__':
    sys.exit(main())
