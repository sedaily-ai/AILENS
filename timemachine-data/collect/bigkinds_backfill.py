"""Rate-limited backfill of the existing private time-machine cache.

A separate checkpoint advances only after a successful response. The public
availability file is not inferred from a response for a substituted date.
"""
import json
import time
from datetime import date, datetime, timedelta, timezone

import availability_v2

CHECKPOINT_KEY = 'ops/status/bigkinds-backfill.json'
PAUSE_KEY = 'ops/status/bigkinds-backfill-paused.json'
FAILURE_KEY = 'ops/status/bigkinds-backfill-failures.json'
MAX_FAILURES = 3


class Rejected(RuntimeError):
    """공급자가 요청을 거부해 즉시 멈춰야 하는 경우."""
START = availability_v2.BIGKINDS_START


def is_paused(s3, bucket):
    page = s3.list_objects_v2(Bucket=bucket, Prefix=PAUSE_KEY, MaxKeys=1)
    return any(item['Key'] == PAUSE_KEY for item in page.get('Contents', []))


def pause(s3, bucket, now):
    body = json.dumps({'schema': 1, 'paused_at': now.isoformat(timespec='seconds')}).encode('utf-8')
    s3.put_object(Bucket=bucket, Key=PAUSE_KEY, Body=body, ContentType='application/json', CacheControl='no-store')


def _failure_state(s3, bucket):
    page = s3.list_objects_v2(Bucket=bucket, Prefix=FAILURE_KEY, MaxKeys=1)
    if not any(item['Key'] == FAILURE_KEY for item in page.get('Contents', [])):
        return 0, {'IfNoneMatch': '*'}
    obj = s3.get_object(Bucket=bucket, Key=FAILURE_KEY)
    doc = json.loads(obj['Body'].read())
    count = doc.get('count')
    if doc.get('schema') != 1 or type(count) is not int or count < 0 or not obj.get('ETag'):
        raise ValueError('실패 횟수 기록을 읽을 수 없어요')
    return count, {'IfMatch': obj['ETag']}


def note_failure(s3, bucket):
    count, condition = _failure_state(s3, bucket)
    count += 1
    body = json.dumps({'schema': 1, 'count': count}).encode('utf-8')
    s3.put_object(Bucket=bucket, Key=FAILURE_KEY, Body=body, ContentType='application/json',
                  CacheControl='no-store', **condition)
    return count


def clear_failures(s3, bucket):
    count, condition = _failure_state(s3, bucket)
    if count:
        s3.put_object(Bucket=bucket, Key=FAILURE_KEY, Body=b'{"schema":1,"count":0}',
                      ContentType='application/json', CacheControl='no-store', **condition)


def _checkpoint(s3, bucket):
    listed = s3.list_objects_v2(Bucket=bucket, Prefix=CHECKPOINT_KEY, MaxKeys=1).get('Contents', [])
    if not any(item['Key'] == CHECKPOINT_KEY for item in listed):
        return START, {'IfNoneMatch': '*'}
    obj = s3.get_object(Bucket=bucket, Key=CHECKPOINT_KEY)
    doc = json.loads(obj['Body'].read().decode('utf-8'))
    if doc.get('schema') != 1 or not obj.get('ETag'):
        raise ValueError('수집 진행 상태를 읽을 수 없어요')
    day = date.fromisoformat(doc['next_date'])
    if day < START:
        raise ValueError('수집 진행 날짜가 범위를 벗어났어요')
    return day, {'IfMatch': obj['ETag']}



def _record_available(s3, bucket, day, body, today=None):
    """선택한 날짜의 확인 결과만 현황에 기록한다."""
    kind = body.get('kind')
    if body.get('shown_date') == day.isoformat() and kind in ('front', 'day') and body.get('articles'):
        status, target_kind = 'available', kind
    elif body.get('date_kind') in ('front', 'day') and body.get('reason') in ('sunday', 'no_paper', 'archive_missing'):
        status, target_kind = 'unavailable', body['date_kind']
    else:
        return
    key = f'timemachine-newspaper/availability/v2/{day.year}.json'
    listed = s3.list_objects_v2(Bucket=bucket, Prefix=key, MaxKeys=1).get('Contents', [])
    if not any(item['Key'] == key for item in listed):
        if today is None:
            raise RuntimeError('해당 연도 현황 파일이 아직 없어요')
        doc = availability_v2.build_year(s3, bucket, day.year, today)
        availability_v2.save_year(s3, bucket, doc, datetime.now(timezone.utc))
    obj = s3.get_object(Bucket=bucket, Key=key)
    doc = json.loads(obj['Body'].read().decode('utf-8'))
    if doc.get('schema') != 2 or doc.get('year') != day.year or not obj.get('ETag'):
        raise ValueError('해당 연도 현황 파일을 읽을 수 없어요')
    row = doc.get('days', {}).get(day.isoformat())
    if not isinstance(row, dict):
        raise ValueError('해당 날짜 현황이 없어요')
    field = 'bigkinds_front' if target_kind == 'front' else 'bigkinds_day'
    if (target_kind == 'front' and today and day <= today - timedelta(days=30)
            and row.get(field) in ('available', 'unavailable') and not body.get('_newly_fetched')):
        return
    row[field] = status
    row['bigkinds_observed_at'] = datetime.now(timezone.utc).isoformat(timespec='seconds')
    if body.get('_newly_fetched'):
        row['bigkinds_checked_at'] = row['bigkinds_observed_at']
    doc['updated_at'] = row['bigkinds_observed_at']
    s3.put_object(Bucket=bucket, Key=key, Body=json.dumps(doc, ensure_ascii=False, separators=(',', ':')).encode('utf-8'),
                  ContentType='application/json; charset=utf-8', CacheControl='public, max-age=600', IfMatch=obj['ETag'])

def _fetch_confirmed(client, function_name, day, sleep):
    event = {'httpMethod': 'GET', 'queryStringParameters': {'front': day.isoformat()}}

    def invoke():
        result = client.invoke(FunctionName=function_name, InvocationType='RequestResponse',
                               Payload=json.dumps(event).encode('utf-8'))
        if result.get('FunctionError'):
            raise RuntimeError('빅카인즈 조회 함수를 실행하지 못했어요')
        response = json.loads(result['Payload'].read())
        body = json.loads(response['body'])
        if response.get('statusCode') != 200:
            if body.get('code') == 'BIGKINDS_REJECTED':
                raise Rejected('빅카인즈가 요청을 거부했어요')
            raise RuntimeError('빅카인즈 조회 실패로 수집을 중단했어요')
        if body.get('date') != day.isoformat() or body.get('kind') not in ('front', 'day', 'none'):
            raise ValueError('빅카인즈 조회 결과가 예상 형식과 달라요')
        if body.get('basis') == 'ranking_failed':
            raise RuntimeError('기사 순위를 확인하지 못했어요')
        return body

    body = invoke()
    newly_fetched = body.get('cached') is not True
    if newly_fetched:
        sleep(1)
        body = invoke()
        if body.get('cached') is not True:
            raise RuntimeError('조회 결과가 캐시에 저장되지 않아 수집을 중단했어요')
    body['_newly_fetched'] = newly_fetched
    return body


def refresh_recent(s3, client, bucket, function_name, today, *, remaining_ms=None, sleep=time.sleep):
    """전날의 기사 캐시와 현황을 다시 확인한다."""
    if remaining_ms is not None and remaining_ms() < 70000:
        return {'processed': 0}
    day = today - timedelta(days=1)
    body = _fetch_confirmed(client, function_name, day, sleep)
    _record_available(s3, bucket, day, body, today)
    return {'processed': 1, 'date': day.isoformat()}


def run(s3, client, bucket, function_name, today, *, max_dates=2, remaining_ms=None, sleep=time.sleep):
    """회차당 최대 2일을 확인하고 실패하면 해당 날짜에서 멈춘다."""
    if not 1 <= max_dates <= 2:
        raise ValueError('회차당 처리량은 1~2일이어야 해요')
    day, condition = _checkpoint(s3, bucket)
    completed = 0
    while completed < max_dates and day < today:
        if remaining_ms is not None and remaining_ms() < 70000:
            break
        body = _fetch_confirmed(client, function_name, day, sleep)
        _record_available(s3, bucket, day, body, today)
        day += timedelta(days=1)
        s3.put_object(Bucket=bucket, Key=CHECKPOINT_KEY,
                      Body=json.dumps({'schema': 1, 'next_date': day.isoformat()}).encode('utf-8'),
                      ContentType='application/json', CacheControl='no-store', **condition)
        # 다음 반복에는 새 ETag가 필요하다. 읽기를 다시 해 최신 버전을 확인한다.
        day, condition = _checkpoint(s3, bucket)
        completed += 1
        if completed < max_dates:
            sleep(1)
    return {'processed': completed, 'next_date': day.isoformat()}
