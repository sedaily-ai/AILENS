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
    # 옛 화면이 보내는 minutes(읽을 시간)는 기능 제거 후에도 거부하지 않고 무시한다.
    # format_preference·weekly_activity·weekly_rewards·notifications는 예전 화면 호환용 키다(예전 웹은 server.data?.format_preference.data,
    # server.data?.notifications.status를 바로 읽어 키가 없으면 화면이 죽는다). 계산·조회 없이 unavailable로만 둔다. 다음 정리 때 제거.
    # 알림 설정은 웹 푸시 제거(2026-10-19) 뒤 웹이 쓰지 않아 CMS에 묻지 않는다. 공개 알림 경로는 2026-10-20에 지웠다(알림 워커만 남음).
    return {'schema_version':1,'scope':'account','generated_at':dt.datetime.now(dt.timezone.utc).isoformat(),
            'format_preference':unavailable(),'preferences':ready(data['preferences']),'profile':ready(profile(data)),
            'news':area(lambda:recommend(owner,{'kind':'news','limit':4},inputs=data)) if tab in (None,'home') else unavailable(),
            'letters':area(lambda:recommend(owner,{'kind':'letter','limit':3},inputs=data)) if tab in (None,'home') else unavailable(),
            'saved_letters':area(lambda:repo.request('GET','/letter-bookmarks',owner,query={'limit':3})) if tab!='settings' else unavailable(),
            'recent_sentences':ready({'items':[{**row,'article_id':row.get('article_no') or ''} for row in data['recent_sentences']],'total':data['sentence_total']}),
            'followed_editors':ready(data['followed_editors']),'weekly_rewards':unavailable(),'weekly_activity':unavailable(),
            'notifications':unavailable()}
