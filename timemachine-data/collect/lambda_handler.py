"""AWS Lambda 진입점 — e-Paper 최신호 1면 이미지를 받아 S3 timemachine-newspaper/img/YYYY/MM/YYYYMMDD.jpg 에 저장하고,
그날 1면 기사 제목·영역도 timemachine-newspaper/epaper/YYYY/MM/YYYYMMDD.json 에 저장한다.

EventBridge 가 매일 13·14·15시 10분(KST)에 부른다(timemachine-data/aws/provision.sh). 같은 호를 여러 번 받아도 안전하다 —
이미 같은 파일이 있으면 건너뛰고, 같은 날짜에 다른 이미지가 있으면 그대로 두고 실패로 알린다.
기사 기록 실패 시 이미지는 보존하고, 예약 실행은 오류로 기록해 다음 회차에 다시 확인한다.
환경 변수: NEWSPAPER_BUCKET(필수). 로그는 한 줄 JSON 이며 토큰·서명값은 들어가지 않는다.
"""
import json
import os
from datetime import datetime, timedelta, timezone

import fetch_epaper_front as ep


def _log(event='capture', **fields):
    print(json.dumps({'event': event, **fields}, ensure_ascii=False))


def _save_articles(issue, width, height, size, bucket, region):
    try:
        return ep.save_articles(issue, width, height, size, bucket=bucket, region=region)
    except Exception as e:  # noqa: BLE001 - 기사 기록은 덤이라 어떤 문제든 이미지 수집을 막지 않는다
        _log('epaper', status='error', message=ep.mask(f'{type(e).__name__}: {e}'))
        return 'error'


def handler(event, context):
    bucket = os.environ.get('NEWSPAPER_BUCKET')
    if not bucket:
        raise RuntimeError('환경 변수 NEWSPAPER_BUCKET 이 없어요')
    region = os.environ.get('AWS_REGION', 'us-east-1')
    if isinstance(event, dict) and event.get('source') == 'aws.events':
        import boto3
        today = datetime.now(timezone(timedelta(hours=9))).strftime('%Y%m%d')
        s3 = boto3.client('s3', region_name=region)
        keys = [f'timemachine-newspaper/img/{today[:4]}/{today[4:6]}/{today}.jpg',
                f'timemachine-newspaper/epaper/{today[:4]}/{today[4:6]}/{today}.json']
        if all(any(item['Key'] == key for item in s3.list_objects_v2(Bucket=bucket, Prefix=key, MaxKeys=1).get('Contents', [])) for key in keys):
            _log(status='already_complete', date=today)
            return {'date': today, 'status': 'already_complete'}
    try:
        issue, data, (width, height) = ep.fetch_latest()
        status = ep.save_s3(bucket, region, issue.key, data)
    except ep.CaptureError as e:
        _log(status='error', message=ep.mask(e))
        raise RuntimeError(ep.mask(e)) from None
    summary = {'date': issue.iso_date, 'status': status, 'width': width, 'height': height, 'bytes': len(data)}
    if status != 'conflict':
        summary['epaper'] = _save_articles(issue, width, height, len(data), bucket, region)
    _log(**summary)
    if isinstance(event, dict) and event.get('source') == 'aws.events' and summary.get('epaper') == 'error':
        raise RuntimeError('이미지는 보존했지만 기사 기록을 저장하지 못했어요')
    if status == 'conflict':
        raise RuntimeError(f'같은 날짜({issue.iso_date})에 다른 파일이 이미 있어 그대로 뒀어요')
    return summary
