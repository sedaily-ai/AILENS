"""AWS Lambda 진입점 — e-Paper 최신호 1면 이미지를 받아 S3 timemachine-newspaper/img/YYYY/MM/YYYYMMDD.jpg 에 저장한다.

EventBridge 가 매시간 부른다(timemachine-data/aws/provision.sh). 같은 호를 여러 번 받아도 안전하다 —
이미 같은 파일이 있으면 건너뛰고, 같은 날짜에 다른 파일이 있으면 그대로 두고 실패로 알린다.
환경 변수: NEWSPAPER_BUCKET(필수). 로그는 한 줄 JSON 이며 토큰·서명값은 들어가지 않는다.
"""
import json
import os

import fetch_epaper_front as ep


def _log(**fields):
    print(json.dumps({'event': 'capture', **fields}, ensure_ascii=False))


def handler(event, context):
    bucket = os.environ.get('NEWSPAPER_BUCKET')
    if not bucket:
        raise RuntimeError('환경 변수 NEWSPAPER_BUCKET 이 없어요')
    region = os.environ.get('AWS_REGION', 'us-east-1')
    try:
        issue, data, (width, height) = ep.fetch_latest()
        status = ep.save_s3(bucket, region, issue.key, data)
    except ep.CaptureError as e:
        _log(status='error', message=ep.mask(e))
        raise RuntimeError(ep.mask(e)) from None
    summary = {'date': issue.iso_date, 'status': status, 'width': width, 'height': height, 'bytes': len(data)}
    _log(**summary)
    if status == 'conflict':
        raise RuntimeError(f'같은 날짜({issue.iso_date})에 다른 파일이 이미 있어 그대로 뒀어요')
    return summary
