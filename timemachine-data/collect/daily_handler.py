"""AWS Lambda 진입점 — 타임머신 신문의 네이버 1면 목록 일일 수집, 누락 목록, 알림 지표.

이미지 수집(lambda_handler.py)과 별개 함수다. 이미지 수집은 e-Paper 최신호만 받을 수 있어 놓치면 되돌릴 수 없지만, 네이버 목록은 지난 날도 받을 수 있어
이 함수는 매시간 돌며 아직 확인하지 못한 날을 다시 시도한다(자동 재시도).

환경 변수
  NEWSPAPER_BUCKET  (필수)
  NAVER_DAILY       'on' 이 아니면 네이버에 요청하지 않는다(기본 꺼짐). 이미지 누락 목록과 지표는 꺼져 있어도 만든다.
  NAVER_DAILY_FROM  NAVER_DAILY=on 일 때 필수. 일일 수집 시작일(YYYY-MM-DD) — 이 날부터 확인하지 못한 날을 네이버 누락으로 센다.
날짜 지정 재처리  이벤트에 {"dates": ["2026-11-03", ...]} 또는 {"from": "...", "to": "..."} (최대 31일, 선택 "force": true 면 확인한 날도 다시 받음).
                  이 경우에도 NAVER_DAILY 가 'on' 이어야 한다.
출력  로그는 한 줄 JSON(토큰 없음). 누락 목록은 비공개 위치(ops/status/missing.json)에 쓴다 — 공개 경로 timemachine-newspaper/ 밖이다.
지표  CloudWatch 임베디드 지표(EMF)를 로그로 내보낸다: NaverMissingDays, ImageMissingDays, NaverBlocked, NaverErrors, NaverSaved.
"""
import json
import os
import time
from datetime import date, datetime, timedelta, timezone

import naver_daily as nd

KST = timezone(timedelta(hours=9))
NAMESPACE = 'Sedaily/LENS/TimemachineNewspaper'
MISSING_KEY = 'ops/status/missing.json'
IMG_PREFIX = 'timemachine-newspaper/img/'
# 누락으로 보는 기간: 수집이 시작된 날부터. 이미지는 e-Paper 일일 수집을 시작한 2026-11-03 이후만 우리가 만든 데이터다.
IMAGE_CAPTURE_FROM = date(2026, 11, 3)
NAVER_GRACE_DAYS = 2        # 최근 이틀은 아직 수집 중일 수 있어 누락으로 세지 않는다
# 네이버 일일 수집 누락은 NAVER_DAILY_FROM(켤 때 정하는 날짜, 환경 변수) 이후만 센다. 그 전(2011-07-09~)은 일일 수집이 아니라 과거 수집(백필)의
# 몫이라 누락으로 세면 알림이 계속 울린다. 과거분은 백필 개수(naver_backfill)로 정보만 적는다.
IMAGE_DEADLINE_HOUR = 12    # 이 시각(KST)이 지나도 오늘 이미지가 없으면 누락. 새 호가 올라오는 시각을 측정한 뒤 조정한다.
LIST_LIMIT = 60             # 누락 목록에 담는 날짜 수 상한(파일이 커지지 않게)


def _log(event='daily', **fields):
    print(json.dumps({'event': event, **fields}, ensure_ascii=False))


def _emf(**values):
    """임베디드 지표 한 줄(로그에서 CloudWatch 가 지표로 읽는다)."""
    print(json.dumps({
        '_aws': {'Timestamp': int(time.time() * 1000), 'CloudWatchMetrics': [
            {'Namespace': NAMESPACE, 'Dimensions': [[]], 'Metrics': [{'Name': k, 'Unit': 'Count'} for k in values]}]},
        **values}))


def _s3(region):
    import boto3  # AWS 에서만 쓴다
    return boto3.client('s3', region_name=region)


def paperless_or_suspended(day: date) -> bool:
    """일요일자가 없는 날과 발행 중단 기간(이미지가 없어도 누락이 아닌 날)."""
    return nd.is_paperless_sunday(day) or date(1980, 11, 26) <= day <= date(1988, 7, 31)


def image_days(s3, bucket, start: date, end: date) -> set:
    """S3 img/ 에 있는 날짜 집합(start~end 달별 목록 조회)."""
    found = set()
    month = date(start.year, start.month, 1)
    while month <= end:
        prefix = f'{IMG_PREFIX}{month.year}/{month.month:02d}/'
        token = None
        while True:
            kwargs = {'Bucket': bucket, 'Prefix': prefix}
            if token:
                kwargs['ContinuationToken'] = token
            page = s3.list_objects_v2(**kwargs)
            for obj in page.get('Contents', []):
                name = obj['Key'].rsplit('/', 1)[-1]
                if len(name) == 12 and name.endswith('.jpg') and name[:8].isdigit():
                    try:
                        found.add(date(int(name[:4]), int(name[4:6]), int(name[6:8])))
                    except ValueError:
                        pass
            if not page.get('IsTruncated'):
                break
            token = page.get('NextContinuationToken')
        month = date(month.year + (month.month == 12), month.month % 12 + 1, 1)
    return found


def _missing_naver(s3, bucket, start: date, end: date) -> list:
    """start~end 중 연도 파일이 확인하지 못한(일요일자 없는 날 제외) 날짜, 오래된 순서."""
    out, docs, day = [], {}, start
    while day <= end:
        doc = docs.get(day.year)
        if doc is None:
            doc = docs[day.year] = nd.load_year(s3, bucket, day.year)
        year_end = min(end, date(day.year, 12, 31))
        known = nd.covered_days(doc, day, year_end)
        out.extend(d for d in (day + timedelta(days=i) for i in range((year_end - day).days + 1))
                   if d not in known and not nd.is_paperless_sunday(d))
        day = date(day.year + 1, 1, 1)
    return out


def _latest(days: list) -> dict:
    """개수는 전체, 날짜는 최근 것부터 LIST_LIMIT 개(오래된 날은 잘려도 최근 누락이 먼저 보인다)."""
    newest = sorted(days, reverse=True)
    return {'count': len(days), 'dates': [d.isoformat() for d in newest[:LIST_LIMIT]], 'truncated': len(days) > LIST_LIMIT}


def build_missing(s3, bucket, now: datetime, naver_from: date = None) -> dict:
    """아직 없는 날. naver: naver_from 이후 연도 파일이 확인하지 못한 날(일일 수집 누락), naver_backfill: 그 전 2011-07-09~ 확인하지 못한 날 수(정보만),
    image: e-Paper 일일 수집 이후 사진이 없는 발행 예상일. naver_from 이 없으면 네이버 일일 수집을 켜지 않은 것이라 naver 는 비워 둔다."""
    today = now.astimezone(KST).date()
    naver_end = today - timedelta(days=NAVER_GRACE_DAYS)
    naver = _missing_naver(s3, bucket, naver_from, naver_end) if naver_from and naver_from <= naver_end else []
    backfill_end = min(naver_end, naver_from - timedelta(days=1)) if naver_from else naver_end
    backfill = len(_missing_naver(s3, bucket, nd.NAVER_FROM, backfill_end)) if backfill_end >= nd.NAVER_FROM else 0
    have = image_days(s3, bucket, IMAGE_CAPTURE_FROM, today)
    image_end = today if now.astimezone(KST).hour >= IMAGE_DEADLINE_HOUR else today - timedelta(days=1)
    image = [d for d in (IMAGE_CAPTURE_FROM + timedelta(days=i) for i in range((image_end - IMAGE_CAPTURE_FROM).days + 1))
             if d not in have and not paperless_or_suspended(d)]
    return {
        'schema': 1, 'generated_at': now.astimezone(KST).isoformat(timespec='seconds'),
        'naver_from': naver_from.isoformat() if naver_from else None,
        'naver': _latest(naver), 'naver_backfill': backfill, 'image': _latest(image),
    }


def _naver_from():
    text = os.environ.get('NAVER_DAILY_FROM', '').strip()
    try:
        return date.fromisoformat(text) if text else None
    except ValueError:
        raise RuntimeError(f'NAVER_DAILY_FROM 형식이 맞지 않아요: {text!r} (예: 2026-11-04)') from None


def write_missing(s3, bucket, report: dict) -> None:
    s3.put_object(Bucket=bucket, Key=MISSING_KEY, Body=(json.dumps(report, ensure_ascii=False, indent=1) + '\n').encode('utf-8'),
                  ContentType='application/json; charset=utf-8', CacheControl='no-store')


def handler(event, context, *, now=None, s3_client=None):
    bucket = os.environ.get('NEWSPAPER_BUCKET')
    if not bucket:
        raise RuntimeError('환경 변수 NEWSPAPER_BUCKET 이 없어요')
    region = os.environ.get('AWS_REGION', 'us-east-1')
    now = now or datetime.now(timezone.utc)
    s3 = s3_client or _s3(region)
    today = now.astimezone(KST).date()
    enabled = os.environ.get('NAVER_DAILY', '').lower() == 'on'
    # 켜져 있으면 일일 수집 시작일이 반드시 있어야 한다(없으면 누락 기준이 없어 알림이 틀린다). 꺼져 있으면 네이버 누락은 세지 않는다.
    naver_from = _naver_from() if enabled else None
    if enabled and naver_from is None:
        raise RuntimeError('NAVER_DAILY 가 on 이면 NAVER_DAILY_FROM(일일 수집 시작일, 예: 2026-11-04)도 필요해요')
    event = event if isinstance(event, dict) else {}

    try:
        explicit = nd.parse_targets(event, today)
    except ValueError as e:
        _log(status='error', message=str(e))
        raise RuntimeError(str(e)) from None

    results, blocked = {}, None
    if not enabled:
        _log(naver='off', message='NAVER_DAILY 가 on 이 아니라 네이버에 요청하지 않았어요')
        if explicit:
            raise RuntimeError('NAVER_DAILY 가 on 이 아니라 다시 처리하지 않았어요')
    else:
        if explicit:
            days, force = explicit
        else:
            covered = set()
            for year in sorted({(today - timedelta(days=i)).year for i in range(nd.LOOKBACK_DAYS + 1)}):
                covered |= nd.covered_days(nd.load_year(s3, bucket, year), date(year, 1, 1), date(year, 12, 31))
            days, force = nd.pending_dates(today, now.astimezone(KST).hour, covered), False
        try:
            results = nd.collect(days, s3=s3, bucket=bucket, now=now, force=force)
        except nd.Blocked as e:
            results, blocked = e.results, e
    counts = {}
    for status in results.values():
        counts[status.split(':', 1)[0]] = counts.get(status.split(':', 1)[0], 0) + 1
    errors = [f'{d}: {s[6:]}' for d, s in results.items() if s.startswith('error:')]

    report = None
    try:
        report = build_missing(s3, bucket, now, naver_from)
        write_missing(s3, bucket, report)
    except Exception as e:  # noqa: BLE001 - 누락 목록은 덤이라 수집 결과를 막지 않는다
        _log('missing', status='error', message=f'{type(e).__name__}')
    _emf(NaverSaved=counts.get('saved', 0), NaverErrors=len(errors), NaverBlocked=1 if blocked else 0,
         **({'NaverMissingDays': report['naver']['count'], 'ImageMissingDays': report['image']['count']} if report else {}))
    summary = {'enabled': enabled, 'explicit': bool(explicit), 'counts': counts, 'errors': errors[:10],
               **({'missing': {'naver': report['naver']['count'], 'image': report['image']['count']}} if report else {})}
    _log(**summary)
    if blocked:
        raise RuntimeError(str(blocked))
    if errors:
        raise RuntimeError(f'{len(errors)}일을 받지 못했어요: ' + '; '.join(errors[:3]))
    return summary
