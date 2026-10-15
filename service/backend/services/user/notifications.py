"""개인 알림 후보 계획. 전송 작업은 내부 DB worker operation이 최종 재검사한다."""
import datetime as dt
from repositories.dashboard_repository import DashboardRepository
from services.user.recommendations import profile,rank


def preview(owner,scheduled=False,expected_mode='dry_run'):
    repo=DashboardRepository();context=repo.request('GET','/notifications/context',owner)
    if scheduled and context['config']['mode']!=expected_mode:
        from models.dashboard import DashboardError
        raise DashboardError(409,'MODE_CHANGED','발송 모드가 바뀌었어요.')
    p=dict(context['preferences']);enabled=context['due_types'] if scheduled else [k for k in ('briefing','followups','weekly') if p[k]]
    if scheduled:
        for kind in ('briefing','followups','weekly'):p[kind]=kind in enabled
    extra=repo.request('GET','/notifications/candidates',owner)
    now=dt.datetime.fromisoformat(extra['server_now'])
    notified=set(context['notified_keys'])
    def eligible(card):
        return not card['viewed'] and card['content_key'] not in notified and dt.datetime.fromisoformat(card['published_at'])>=now-dt.timedelta(hours=72)
    picks=[];followups=[]
    if p['briefing']:
        data=repo.request('GET','/notifications/inputs',owner)
        prof=profile(data)
        cats=[r['key'] for r in prof['categories']]
        pool=repo.request('POST','/recommendation-candidates',owner,body={'kind':'publication','categories':cats,'terms':[],'editors':[]})
        picks.extend(rank([card for card in pool['items'] if eligible(card)],data,prof,limit=4)['items'])
    if p['followups']:
        followups=[card for card in extra['followups'] if eligible(card)]
        picks.extend(followups)
    picks.sort(key=lambda card:(card['published_at'],card['content_key']),reverse=True)
    by_key={}
    for card in picks:by_key.setdefault(card['content_key'],card)
    unique=list(by_key.values())[:4]
    # 후속 글을 함께 선택했다면 브리핑에 밀려 영구 누락되지 않도록 한 자리를 확보한다.
    if followups and not any(card['content_key'] in {f['content_key'] for f in followups} for card in unique):
        best=max(followups,key=lambda card:(card['published_at'],card['content_key']))
        unique=unique[:3]+[best]
    weekly=extra['weekly'] if p['weekly'] and (extra['weekly']['read_days'] or extra['weekly']['saved_contents']) else None
    payload={'types':enabled,'content_keys':[c['content_key'] for c in unique],'weekly_period':{'start':weekly['start'],'end':weekly['end']} if weekly else None}
    result={'mode':context['config']['mode'],'preferences_revision':context['revision'],'content_count':len(unique),'weekly':weekly,'payload':payload,'context':context,'empty':not unique and not weekly}
    if not scheduled:
        return {'mode':result['mode'],'content_count':len(unique),'items':[{'title':c['title'],'href':c['href']} for c in unique],'weekly':weekly,'empty':result['empty'],'delivery':context['delivery'],'actual_sent':False}
    # 내부 operation에서 owner/revision/일정/공개/미열람을 다시 확인한다.
    return repo.request('POST','/notifications/plans',owner,body={'mode':expected_mode,'preferences_revision':context['revision'],'consent_version':context['config']['policy_version'],'source_fingerprint':context['source_fingerprint'],'payload':payload})


def dispatch(owner,method,path,body,params):
    from models.dashboard import DashboardError
    repo=DashboardRepository()
    if params:raise DashboardError(400,'INVALID_ARGUMENT','알림 요청 조건을 확인해 주세요.')
    if path=='/notifications/preview' and method=='GET':return preview(owner)
    if path in ('/notifications/preferences','/notifications/consent') and method in ('GET','PUT'):
        return repo.request(method,path,owner,body=body if method=='PUT' else None)
    if path=='/push-subscriptions' and method=='POST':return repo.request(method,path,owner,body=body)
    if path.startswith('/push-subscriptions/') and method=='DELETE':return repo.request(method,path,owner)
    raise DashboardError(404,'NOT_FOUND','지원하지 않는 알림 API예요.')
