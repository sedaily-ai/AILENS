"""알림 oneshot worker. 기본 dry_run; API process 안에 timer를 만들지 않는다."""
import argparse
import json
import logging
import os
from urllib.parse import urlsplit
from clients.pg.dashboard import request
from services.user.notifications import preview


def run(limit=100,allow_live=False):
    due=request('GET','/notifications/due','')
    if due['mode']!='dry_run' and not allow_live:raise RuntimeError('실제 발송 서버는 dry_run worker에서 호출할 수 없습니다.')
    batch=request('POST','/notifications/due','',body={'mode':due['mode'],'limit':limit})
    if batch['mode']!=due['mode']:raise RuntimeError('발송 모드가 바뀌었습니다.')
    result=[]
    for owner in batch['owners']:
        processed=[];phase='plan';plan={}
        try:
            plan=preview(owner,scheduled=True,expected_mode=due['mode'])
            for _ in range(50):
                phase='claim';claim=request('POST','/notifications/claim',owner,body={'mode':due['mode']})
                if not claim['claimed']:break
                claim={k:v for k,v in claim.items() if k!='claimed'}
                phase='send';processed.append(request('POST','/notifications/send-claim',owner,body={**claim,'mode':due['mode']})['status'])
            result.append({'planned':plan.get('planned',False),'processed':processed})
        except Exception as exc:
            logging.getLogger(__name__).warning('Notification worker phase=%s failure=%s',phase,type(exc).__name__)
            result.append({'planned':plan.get('planned',False),'processed':processed,'error':'DEPENDENCY_UNAVAILABLE'})
    return result


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--limit',type=int,default=100);parser.add_argument('--live',action='store_true');args=parser.parse_args()
    host=urlsplit(os.environ.get('LENS_CMS_API_URL','')).hostname
    if not args.live and host not in ('127.0.0.1','localhost','::1'):raise SystemExit('로컬 검증은 내부 API loopback 주소를 명시해야 합니다.')
    if args.live and os.environ.get('LENS_PUSH_LIVE_ENABLED')!='true':raise SystemExit('실제 발송은 별도 운영 활성화가 필요합니다.')
    if not 1<=args.limit<=100:raise SystemExit('limit은1~100입니다.')
    print(json.dumps(run(args.limit,args.live),ensure_ascii=False))
