"""기존 비공개 DynamoDB 기사 캐시의 보유 상태만 공개 현황에 반영한다."""
import json
from datetime import date, datetime, timedelta, timezone

import availability_v2

CHECKPOINT_KEY = 'ops/status/bigkinds-cache-index.json'
START = date(1990, 1, 1)


def _load_progress(s3, bucket):
    page = s3.list_objects_v2(Bucket=bucket, Prefix=CHECKPOINT_KEY, MaxKeys=1)
    if not any(item['Key'] == CHECKPOINT_KEY for item in page.get('Contents', [])):
        return START, {'IfNoneMatch': '*'}
    obj = s3.get_object(Bucket=bucket, Key=CHECKPOINT_KEY)
    doc = json.loads(obj['Body'].read())
    day = date.fromisoformat(doc['next_date'])
    if doc.get('schema') != 1 or day < START or not obj.get('ETag'):
        raise ValueError('캐시 색인 진행 상태를 읽을 수 없어요')
    return day, {'IfMatch': obj['ETag']}


def _read_items(client, table, dates):
    from boto3.dynamodb.types import TypeDeserializer
    decoder = TypeDeserializer()
    keys = [{'news_id': {'S': f'timemachine_frontv2_{day}'}} for day in dates]
    keys += [{'news_id': {'S': f'timemachine_frontv2_none_{day}'}} for day in dates]
    projection = ('#id,#exp,#at,#data.#date,#data.#kind,#data.#datekind,'
                  '#data.#shown,#data.#reason,#data.#articles[0].#news')
    names = {'#id': 'news_id', '#exp': 'expires_at', '#at': 'cached_at', '#data': 'data',
             '#date': 'date', '#kind': 'kind', '#datekind': 'date_kind', '#shown': 'shown_date',
             '#reason': 'reason', '#articles': 'articles', '#news': 'news_id'}
    result = client.batch_get_item(RequestItems={table: {'Keys': keys, 'ProjectionExpression': projection,
                                                         'ExpressionAttributeNames': names}})
    if result.get('UnprocessedKeys'):
        raise RuntimeError('캐시 항목을 모두 읽지 못했어요')
    return [{key: decoder.deserialize(value) for key, value in item.items()}
            for item in result.get('Responses', {}).get(table, [])]


def _fact(item, day, today, now):
    """만료·임시 캐시와 날짜가 불일치하는 응답은 버린다."""
    try:
        expiry = float(item['expires_at'])
        checked = datetime.fromisoformat(item['cached_at'])
        if checked.tzinfo is None or expiry <= now.timestamp():
            return None
        if day > today - timedelta(days=30) and (now - checked).total_seconds() >= 6 * 3600:
            return None
        data = item['data']
        if data['date'] != day.isoformat():
            return None
        if data.get('shown_date') == day.isoformat() and data.get('kind') in ('front', 'day') and data.get('articles'):
            return data['kind'], 'available', checked
        if data.get('date_kind') in ('front', 'day') and data.get('reason') in ('sunday', 'no_paper', 'archive_missing'):
            return data['date_kind'], 'unavailable', checked
    except (KeyError, TypeError, ValueError, OverflowError):
        pass
    return None


def run(s3, dynamodb, bucket, table, today, *, now=None, max_dates=600):
    """날짜당 두 키를 50일씩 조회하고, 전체 범위를 끝내면 다시 처음부터 순환한다."""
    if not 1 <= max_dates <= 600:
        raise ValueError('회차당 최대 600일입니다')
    now = now or datetime.now(timezone.utc)
    start, condition = _load_progress(s3, bucket)
    if start >= today:
        start = START
    end = min(start + timedelta(days=max_dates), today)
    dates = [(start + timedelta(days=i)).isoformat() for i in range((end - start).days)]
    if not dates:
        return {'processed': 0, 'next_date': start.isoformat()}
    items = []
    for offset in range(0, len(dates), 50):
        items.extend(_read_items(dynamodb, table, dates[offset:offset + 50]))
    by_key = {item.get('news_id'): item for item in items}
    grouped = {}
    for iso in dates:
        day = date.fromisoformat(iso)
        # 서비스 조회와 같이 양성 캐시를 먼저 사용한다.
        for key in (f'timemachine_frontv2_{iso}', f'timemachine_frontv2_none_{iso}'):
            item = by_key.get(key)
            fact = _fact(item, day, today, now) if item else None
            if fact:
                grouped.setdefault(day.year, []).append((iso, fact))
                break
    for year, facts in grouped.items():
        key = f'{availability_v2.PREFIX}{year}.json'
        page = s3.list_objects_v2(Bucket=bucket, Prefix=key, MaxKeys=1)
        if not any(item['Key'] == key for item in page.get('Contents', [])):
            doc = availability_v2.build_year(s3, bucket, year, today)
            availability_v2.save_year(s3, bucket, doc, now)
        obj = s3.get_object(Bucket=bucket, Key=key)
        doc = json.loads(obj['Body'].read())
        if doc.get('schema') != 2 or doc.get('year') != year or not obj.get('ETag') or not isinstance(doc.get('days'), dict):
            raise ValueError('연도 현황을 읽을 수 없어요')
        changed = False
        for iso, (kind, status, checked) in facts:
            row = doc['days'].get(iso)
            if not isinstance(row, dict):
                raise ValueError('날짜 현황이 없어요')
            if checked.timestamp() <= availability_v2._checked_at(row.get('bigkinds_checked_at')):
                continue
            row['bigkinds_front' if kind == 'front' else 'bigkinds_day'] = status
            row['bigkinds_checked_at'] = checked.isoformat(timespec='seconds')
            changed = True
        if changed:
            doc['updated_at'] = now.isoformat(timespec='seconds')
            s3.put_object(Bucket=bucket, Key=key, Body=json.dumps(doc, ensure_ascii=False, separators=(',', ':')).encode(),
                          ContentType='application/json; charset=utf-8', CacheControl='public, max-age=600', IfMatch=obj['ETag'])
    next_day = START if end >= today else end
    s3.put_object(Bucket=bucket, Key=CHECKPOINT_KEY,
                  Body=json.dumps({'schema': 1, 'next_date': next_day.isoformat()}).encode(),
                  ContentType='application/json', CacheControl='no-store', **condition)
    return {'processed': len(dates), 'next_date': next_day.isoformat()}
