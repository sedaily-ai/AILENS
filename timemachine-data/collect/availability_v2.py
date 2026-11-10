"""타임머신 자료의 날짜별 보유 현황. 원본과 기존 v1은 변경하지 않는다."""
import json
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import availability

PREFIX = 'timemachine-newspaper/availability/v2/'
EPAPER_PREFIX = 'timemachine-newspaper/epaper/'
# 서울경제 제공 원본 CSV가 현재 확보된 구간. BigKinds 과거 백필과 캐시 색인은
# 원본 구간 다음 날짜부터 이어간다. CSV 갱신 시 이 기준을 함께 옮긴다.
PRIMARY_ARTICLE_FROM = date(1990, 1, 1)
PRIMARY_ARTICLE_THROUGH = date(2026, 10, 31)
BIGKINDS_START = PRIMARY_ARTICLE_THROUGH + timedelta(days=1)
CALENDAR_PATH = Path(__file__).with_name('front_page_calendar.json')
LOCAL_CALENDAR_PATH = Path(__file__).resolve().parents[2] / 'service/backend/services/timeline/front_page_calendar.json'


def load_calendar():
    path = CALENDAR_PATH if CALENDAR_PATH.exists() else LOCAL_CALENDAR_PATH
    try:
        data = json.loads(path.read_text(encoding='utf-8'))
        ranges = [(date.fromisoformat(a), date.fromisoformat(b)) for a, b in data['covers']]
        missing = {date.fromisoformat(d) for d in data['no_front']}
        unknown = {date.fromisoformat(d) for d in data['unknown']}
        checked = data['generated_at']
        if not isinstance(checked, str) or any(a > b for a, b in ranges):
            raise ValueError('invalid calendar')
        return ranges, missing, unknown, checked
    except (OSError, ValueError, TypeError, KeyError):
        return [], set(), set(), None


def _epaper_dates(s3, bucket, year):
    """정해진 경로의 기록만 세며, 미완료 목록은 오류로 처리한다."""
    prefix = f'{EPAPER_PREFIX}{year}/'
    found, token = set(), None
    while True:
        args = {'Bucket': bucket, 'Prefix': prefix}
        if token:
            args['ContinuationToken'] = token
        page = s3.list_objects_v2(**args)
        for item in page.get('Contents', []):
            tail = item['Key'][len(prefix):]
            try:
                month, filename = tail.split('/')
                day = date.fromisoformat(f'{filename[:4]}-{filename[4:6]}-{filename[6:8]}')
                if filename == f'{day:%Y%m%d}.json' and month == f'{day:%m}' and day.year == year:
                    found.add(day)
            except (ValueError, IndexError):
                continue
        if not page.get('IsTruncated'):
            return found
        token = page.get('NextContinuationToken')
        if not token:
            raise ValueError('e-Paper 목록이 불완전해요')


def build_year(s3, bucket, year, today, *, v1=None):
    """v1의 사진·네이버 현황과 e-Paper 기록 유무를 출처별로 정리한다.

    e-Paper 객체의 존재는 기록 존재만 뜻한다. 기사나 1면 여부를 추정하지 않는다.
    빅카인즈는 아직 확인하지 않았으므로 unknown으로 둔다.
    """
    existing = v1 if v1 is not None else availability.build_year(s3, bucket, year, today)
    records = _epaper_dates(s3, bucket, year)
    ranges, missing, unknown, checked = load_calendar()
    days = {}
    for iso, value in existing['days'].items():
        day = date.fromisoformat(iso)
        calendar_known = (day not in unknown and any(start <= day <= end for start, end in ranges)
                          and not (day >= date(1996, 9, 29) and day.weekday() == 6))
        days[iso] = {
            'photo': value['photo'],
            'naver_front': value['front'],
            'epaper_record': 'available' if day in records else 'unknown',
            'bigkinds_front': ('unavailable' if day in missing else 'available') if calendar_known else 'unknown',
            'bigkinds_day': 'unknown',
        }
        if calendar_known:
            days[iso]['bigkinds_checked_at'] = checked
    return {'schema': 2, 'year': year, 'through': existing['through'], 'days': days}


def _checked_at(value):
    try:
        parsed = datetime.fromisoformat(value)
        return parsed.astimezone(timezone.utc).timestamp() if parsed.tzinfo else 0
    except (TypeError, ValueError, OverflowError):
        return 0


def save_year(s3, bucket, doc, now):
    """조건부 쓰기로 다른 수집기의 현황을 보존한다."""
    key = f"{PREFIX}{doc['year']}.json"
    listed = s3.list_objects_v2(Bucket=bucket, Prefix=key, MaxKeys=1).get('Contents', [])
    condition = {'IfNoneMatch': '*'}
    if any(item['Key'] == key for item in listed):
        existing = s3.get_object(Bucket=bucket, Key=key)
        if not existing.get('ETag'):
            raise ValueError('기존 현황의 버전을 확인할 수 없어요')
        previous = json.loads(existing['Body'].read().decode('utf-8'))
        if previous.get('schema') != 2 or previous.get('year') != doc['year'] or not isinstance(previous.get('days'), dict):
            raise ValueError('기존 현황 형식이 잘못됐어요')
        for day, data in doc['days'].items():
            old = previous['days'].get(day, {})
            if isinstance(old, dict):
                if _checked_at(old.get('bigkinds_observed_at') or old.get('bigkinds_checked_at')) >= _checked_at(data.get('bigkinds_checked_at')):
                    for field in ('bigkinds_front', 'bigkinds_day', 'bigkinds_checked_at', 'bigkinds_observed_at'):
                        if field in old:
                            data[field] = old[field]
        condition = {'IfMatch': existing['ETag']}
        previous.pop('updated_at', None)
        if previous == doc:
            return 'unchanged'
    doc['updated_at'] = now.isoformat(timespec='seconds')
    body = (json.dumps(doc, ensure_ascii=False, separators=(',', ':')) + '\n').encode('utf-8')
    s3.put_object(Bucket=bucket, Key=key, Body=body, ContentType='application/json; charset=utf-8',
                  CacheControl='public, max-age=600', **condition)
    return 'saved'
