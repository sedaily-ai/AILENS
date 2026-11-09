"""S3 이미지·네이버 목록의 날짜별 현황. 빅카인즈는 전수 확인하지 않는다."""
import json
from datetime import date, timedelta

import naver_daily as nd

PREFIX = 'timemachine-newspaper/availability/v1/'


def build_year(s3, bucket, year, today):
    end = min(date(year, 12, 31), today)
    start = max(date(year, 1, 1), date(1960, 8, 1))
    if start > end:
        raise ValueError('확인할 수 없는 연도입니다')
    found, token = set(), None
    while True:
        args = {'Bucket': bucket, 'Prefix': f'timemachine-newspaper/img/{year}/'}
        if token:
            args['ContinuationToken'] = token
        page = s3.list_objects_v2(**args)
        for obj in page.get('Contents', []):
            key = obj['Key']
            tail = key[len(args['Prefix']):]
            try:
                month, filename = tail.split('/')
                day = date.fromisoformat(f'{filename[:4]}-{filename[4:6]}-{filename[6:8]}')
                if filename == f'{day:%Y%m%d}.jpg' and month == f'{day:%m}' and day.year == year:
                    found.add(day)
            except (ValueError, IndexError):
                continue
        if not page.get('IsTruncated'):
            break
        token = page.get('NextContinuationToken')
        if not token:
            raise ValueError('이미지 목록이 불완전해요')
    naver = nd.load_year(s3, bucket, year)
    covered = nd.covered_days(naver, start, end)
    days = {}
    counts = {'photo_available': 0, 'photo_unavailable': 0, 'photo_unknown': 0, 'front_available': 0, 'front_unknown': 0}
    day = start
    while day <= end:
        image = 'available' if day in found else 'unknown' if day == today else 'unavailable'
        front = 'available' if day.isoformat() in naver['days'] else 'unknown'
        days[day.isoformat()] = {'photo': image, 'front': front, 'day': 'unknown', 'naver_checked': day in covered}
        counts[f'photo_{image}'] += 1
        counts[f'front_{front}'] += 1
        day += timedelta(days=1)
    return {'schema': 1, 'year': year, 'through': end.isoformat(), 'days': days, 'counts': counts}


def save_year(s3, bucket, doc, now):
    key = f"{PREFIX}{doc['year']}.json"
    listed = s3.list_objects_v2(Bucket=bucket, Prefix=key, MaxKeys=1).get('Contents', [])
    condition = {'IfNoneMatch': '*'}
    if any(obj['Key'] == key for obj in listed):
        existing = s3.get_object(Bucket=bucket, Key=key)
        if 'ETag' not in existing:
            raise ValueError('기존 현황의 버전을 확인할 수 없어요')
        condition = {'IfMatch': existing['ETag']}
        previous = json.loads(existing['Body'].read().decode('utf-8'))
        if not isinstance(previous, dict):
            raise ValueError('기존 현황 파일을 읽을 수 없어요')
        previous.pop('updated_at', None)
        if previous == doc:
            return 'unchanged'
    doc['updated_at'] = now.isoformat(timespec='seconds')
    body = (json.dumps(doc, ensure_ascii=False, separators=(',', ':')) + '\n').encode('utf-8')
    s3.put_object(Bucket=bucket, Key=key, Body=body,
                  ContentType='application/json; charset=utf-8', CacheControl='public, max-age=600', **condition)
    return 'saved'


def build_summary(s3, bucket, today):
    """연도별 현황에서 확인 범위와 개수를 모은다. 누락된 연도는 범위에 포함하지 않는다."""
    years = {}
    for year in range(1960, today.year + 1):
        key = f'{PREFIX}{year}.json'
        listed = s3.list_objects_v2(Bucket=bucket, Prefix=key, MaxKeys=1).get('Contents', [])
        if not any(obj['Key'] == key for obj in listed):
            continue
        doc = json.loads(s3.get_object(Bucket=bucket, Key=key)['Body'].read().decode('utf-8'))
        if doc.get('schema') != 1 or doc.get('year') != year or not isinstance(doc.get('counts'), dict):
            raise ValueError(f'{year}년 현황 형식이 잘못됐어요')
        years[str(year)] = {'through': doc['through'], 'updated_at': doc['updated_at'], 'counts': doc['counts']}
    return {'schema': 1, 'years': years}


def save_summary(s3, bucket, doc, now):
    key = f'{PREFIX}summary.json'
    listed = s3.list_objects_v2(Bucket=bucket, Prefix=key, MaxKeys=1).get('Contents', [])
    condition = {'IfNoneMatch': '*'}
    if any(obj['Key'] == key for obj in listed):
        existing = s3.get_object(Bucket=bucket, Key=key)
        condition = {'IfMatch': existing['ETag']}
        previous = json.loads(existing['Body'].read().decode('utf-8'))
        previous.pop('updated_at', None)
        if previous == doc:
            return 'unchanged'
    doc['updated_at'] = now.isoformat(timespec='seconds')
    body = (json.dumps(doc, ensure_ascii=False, separators=(',', ':')) + '\n').encode('utf-8')
    s3.put_object(Bucket=bucket, Key=key, Body=body, ContentType='application/json; charset=utf-8',
                  CacheControl='public, max-age=600', **condition)
    return 'saved'
