"""개인 홈 집계. 미지원과 정상 빈 결과를 구분한다."""
import datetime as dt
import urllib.error
from models.dashboard import DashboardError
from repositories.dashboard_repository import DashboardRepository
from services.user.recommendations import profile,recommend


def ready(data):return {'status':'ready','data':data,'error':None}

def unavailable():return {'status':'unavailable','data':None,'error':None}

def area(fn):
    try:return ready(fn())
    except urllib.error.HTTPError as exc:
        if exc.code in (401,403):raise
        return {'status':'error','data':None,'error':{'code':'DEPENDENCY_UNAVAILABLE','message':'이 영역을 불러오지 못했어요.','retryable':True}}
    except (OSError,RuntimeError):
        return {'status':'error','data':None,'error':{'code':'DEPENDENCY_UNAVAILABLE','message':'이 영역을 불러오지 못했어요.','retryable':True}}


def get_dashboard(owner,params):
    tab=params.get('tab')
    if tab not in (None,'home','archive','records','settings'):
        raise DashboardError(400,'INVALID_ARGUMENT','대시보드 탭을 확인해 주세요.')
    repo=DashboardRepository()
    data=repo.request('GET','/recommendation-inputs',owner)
    try:minutes=int(params.get('minutes',data['preferences']['minutes']))
    except (ValueError,TypeError) as exc:raise DashboardError(400,'INVALID_ARGUMENT','읽을 시간을 확인해 주세요.') from exc
    if minutes not in (0,5,10):raise DashboardError(400,'INVALID_ARGUMENT','읽을 시간은 0/5/10분이에요.')
    return {'schema_version':1,'scope':'account','generated_at':dt.datetime.now(dt.timezone.utc).isoformat(),
            'format_preference':ready(data['format_preference']),'preferences':ready(data['preferences']),'profile':ready(profile(data)),
            'news':area(lambda:recommend(owner,{'kind':'news','limit':4},inputs=data)) if tab in (None,'home') else unavailable(),
            'letters':area(lambda:recommend(owner,{'kind':'letter','limit':3,'minutes':minutes},inputs=data)) if tab in (None,'home') else unavailable(),
            'saved_letters':area(lambda:repo.request('GET','/letter-bookmarks',owner,query={'limit':3})) if tab!='settings' else unavailable(),
            'recent_sentences':ready({'items':[{**row,'article_id':row.get('article_no') or ''} for row in data['recent_sentences']],'total':data['sentence_total']}),
            'followed_editors':ready(data['followed_editors']),'weekly_rewards':unavailable(),
            'weekly_activity':_weekly(repo,owner) if tab in (None,'home','archive','settings') else unavailable(),
            'notifications':area(lambda:repo.request('GET','/notifications/preferences',owner)) if tab in (None,'archive') else unavailable()}


def _weekly(repo,owner):
    response=area(lambda:repo.request('GET','/activity',owner,query={'period':'week'}))
    return response['data'] if response['status']=='ready' else response
