"""개인 조회 인증 및 신규 handler 계약. 네트워크/JWKS 호출 없음."""
import datetime as dt
import json
from types import SimpleNamespace

import jwt
from cryptography.hazmat.primitives.asymmetric import rsa
import pytest

from core import auth
from handlers.user import archive, dashboard


def event(path='/api/v2/me/preferences', method='GET', token=None, params=None, body=None):
    return {'rawPath':path,'requestContext':{'http':{'method':method,'path':path}},'headers':{'Authorization':f'Bearer {token}'} if token else {}, 'queryStringParameters':params or {}, 'body':json.dumps(body or {})}


@pytest.fixture
def tokens(monkeypatch):
    key = rsa.generate_private_key(public_exponent=65537,key_size=2048)
    monkeypatch.setattr(auth,'_get_jwks_client',lambda: SimpleNamespace(get_signing_key_from_jwt=lambda token: SimpleNamespace(key=key.public_key())))
    now = dt.datetime.now(dt.timezone.utc)
    def token(**changes):
        return jwt.encode({'sub':'fixture-a','aud':auth.settings.cognito_app_client_id,'iss':auth._issuer(),'token_use':'id','exp':now+dt.timedelta(minutes=10),**changes},key,algorithm='RS256')
    return token


def test_archive_requires_valid_id_token_and_ignores_claimed_owner(monkeypatch,tokens):
    async def listed(params):
        assert params['user_id']=='fixture-a'
        return {'statusCode':200,'body':'{}'}
    monkeypatch.setattr(archive.svc,'handle_list',listed)
    for token in [None, 'invalid', tokens(token_use='access'),tokens(exp=0),tokens(aud='other'),tokens(iss='other'),tokens(exp=None),tokens(sub='')]:
        assert archive.lambda_handler(event('/api/archive',token=token,params={'user_id':'victim'}),None)['statusCode']==401
    assert archive.lambda_handler(event('/api/archive',token=tokens(),params={'user_id':'victim'}),None)['statusCode']==200
    async def popular(params): return {'statusCode':200,'body':'{}'}
    monkeypatch.setattr(archive.svc,'handle_popular',popular)
    assert archive.lambda_handler(event('/api/archive/popular'),None)['statusCode']==200


def test_account_handler_auth_private_cache_and_invalid_payload(monkeypatch,tokens):
    from services.user import dashboard as service
    seen=[]
    def call(self, method, path, owner, body=None, query=None):
        seen.append((owner,body)); return {'revision':1,'interests':[],'updated_at':None}
    monkeypatch.setattr(service.DashboardRepository,'request',call)
    for token in [None,'bad',tokens(exp=0)]:
        assert dashboard.lambda_handler(event(token=token),None)['statusCode']==401
    response=dashboard.lambda_handler(event(token=tokens(),params={'user_id':'victim'}),None)
    assert response['statusCode']==200 and response['headers']['Cache-Control']=='private, no-store'
    assert seen[-1][0]=='fixture-a'
    for body in [{'revision':True,'interests':[]},{'revision':0,'interests':[{'type':'wrong','key':'x'}]}, {'user_id':'victim','revision':0,'interests':[]}]:
        assert dashboard.lambda_handler(event(method='PUT',token=tokens(),body=body),None)['statusCode']==400


def test_preferences_put_ignores_legacy_reading_time(monkeypatch,tokens):
    # 읽을 시간(minutes)은 제거됐다. 예전 웹이 보내도 400 없이 값을 버리고, 시간만 바꾸는 요청은 아무것도 쓰지 않는다.
    from services.user import dashboard as service
    seen=[]
    current={'revision':2,'interests':[{'type':'topic','key':'rates'}],'updated_at':None}
    def call(self,method,path,owner,body=None,query=None):
        seen.append((method,body));return current
    monkeypatch.setattr(service.DashboardRepository,'request',call)
    for body in [{'revision':1},{'interests':[]},{'revision':'1','minutes':10},{'revision':1,'minutes':10,'interests':[],'extra':1}]:
        assert dashboard.lambda_handler(event(method='PUT',token=tokens(),body=body),None)['statusCode']==400
    assert seen==[]
    # 예전 읽을 시간 저장: 쓰기 없이 현재 설정(관심 포함)을 그대로 돌려준다.
    for minutes in (5,10,0):
        seen.clear()
        response=dashboard.lambda_handler(event(method='PUT',token=tokens(),body={'revision':1,'minutes':minutes}),None)
        assert response['statusCode']==200 and seen==[('GET',None)]
        assert json.loads(response['body'])==current
    # 관심과 함께 온 minutes는 버리고 관심·revision만 저장 계층으로 보낸다.
    for body in [{'revision':1,'minutes':5,'interests':[{'type':'topic','key':'rates'}]},{'revision':1,'interests':[{'type':'topic','key':'rates'}]}]:
        seen.clear()
        response=dashboard.lambda_handler(event(method='PUT',token=tokens(),body=body),None)
        assert response['statusCode']==200 and seen==[('PUT',{'revision':1,'interests':[{'type':'topic','key':'rates'}]})]
        assert json.loads(response['body'])['interests']==[{'type':'topic','key':'rates'}]


def test_saved_letters_ignore_legacy_read_filter(monkeypatch,tokens):
    # 읽음 필터는 제거됐다. 옛 화면이 보내는 read는 값과 관계없이 400 없이 무시하고 CMS로 넘기지 않는다.
    from services.user import dashboard as service
    seen=[]
    def call(self,method,path,owner,body=None,query=None):
        seen.append(query);return {'items':[],'count':0,'total':0,'next_cursor':None}
    monkeypatch.setattr(service.DashboardRepository,'request',call)
    for read in ('unread','completed','all','bogus'):
        response=dashboard.lambda_handler(event('/api/v2/me/letter-bookmarks',token=tokens(),params={'read':read,'limit':'200','cursor':'c'}),None)
        assert response['statusCode']==200
    assert seen==[{'limit':'200','cursor':'c'}]*4
    assert dashboard.lambda_handler(event('/api/v2/me/letter-bookmarks',token=tokens(),params={'sort':'old'}),None)['statusCode']==400
    assert len(seen)==4


def test_account_handler_strips_named_stage_prefix(monkeypatch,tokens):
    # 운영 HTTP API는 스테이지 dev라 rawPath가 /dev/api/v2/me/... 로 들어온다(archive 로그로 확인).
    seen=[]
    def call(method, path, owner, body=None, query=None):
        seen.append(path); return {'revision':1,'interests':[],'updated_at':None}
    monkeypatch.setattr(dashboard,'dispatch',call)
    request=event('/dev/api/v2/me/preferences',token=tokens())
    request['requestContext']['stage']='dev'
    assert dashboard.lambda_handler(request,None)['statusCode']==200
    assert seen[-1]=='/preferences'
    other=event('/dev/api/v2/me/preferences',token=tokens())
    other['requestContext']['stage']='prod'
    assert dashboard.lambda_handler(other,None)['statusCode']==404


def test_dependency_error_is_not_empty_success(monkeypatch,tokens):
    def broken(*args,**kwargs): raise RuntimeError('fixture failure')
    monkeypatch.setattr(dashboard,'dispatch',broken)
    result=dashboard.lambda_handler(event(token=tokens()),None)
    assert result['statusCode']==503 and json.loads(result['body'])['error']['code']=='DEPENDENCY_UNAVAILABLE'


@pytest.mark.parametrize('path,method,status',[
    ('/api/v2/me/followed-editors','GET',200),
    ('/api/v2/me/followed-editors/mincheol','PUT',200),
    ('/api/v2/me/followed-editors/mincheol','DELETE',200),
    ('/api/v2/me/imports/bookmarks','POST',200),
    ('/api/v2/me/activity/sessions','POST',201),
    ('/api/v2/me/activity/events','POST',200),
    ('/api/v2/me/dashboard','GET',200),
])
def test_second_bundle_endpoints_require_owner_auth(monkeypatch,tokens,path,method,status):
    seen=[]
    def dispatched(method,path,owner,body,params):
        seen.append(owner)
        return {'accepted':True}
    monkeypatch.setattr(dashboard,'dispatch',dispatched)
    assert dashboard.lambda_handler(event(path,method),None)['statusCode']==401
    response=dashboard.lambda_handler(event(path,method,tokens(),params={'user_id':'victim'}),None)
    assert response['statusCode']==status and seen==['fixture-a']
    assert response['headers']['Cache-Control']=='private, no-store'


@pytest.mark.parametrize('path,params',[
    ('/api/v2/me/format-preference',{}),
    ('/api/v2/me/activity',{'period':'week'}),
    ('/api/v2/me/activity',{}),
    ('/api/v2/me/rewards',{'week':'2026-10-12'}),
    # 저장 문장 관련 글(2026-10-19 제거). 예전 화면은 404를 '관련 뉴스를 불러오지 못했어요'로만 보여 준다.
    ('/api/v2/me/sentences/1/recommendations',{}),
    ('/api/v2/me/sentences/1/recommendations',{'limit':'3'}),
])
def test_removed_record_routes_are_404_without_dependency_call(monkeypatch,tokens,path,params):
    # 형식 비율·기간 기록·리워드·저장 문장 관련 글 조회는 제거됐다. 저장 계층을 부르지 않고 기존 방식대로 404다.
    from services.user import dashboard as service
    monkeypatch.setattr(service.DashboardRepository,'request',lambda *a,**k:pytest.fail('removed route must not call storage'))
    response=dashboard.lambda_handler(event(path,'GET',tokens(),params=params),None)
    assert response['statusCode']==404 and json.loads(response['body'])['error']['code']=='NOT_FOUND'


@pytest.mark.parametrize('path,method',[
    # 2026-10-20 기능 다이어트: 공개 알림 설정·동의·미리보기, 웹 푸시 기기, 대시보드와 겹치던 추천 조회.
    ('/api/v2/me/notifications/preferences','GET'),
    ('/api/v2/me/notifications/preferences','PUT'),
    ('/api/v2/me/notifications/consent','GET'),
    ('/api/v2/me/notifications/consent','PUT'),
    ('/api/v2/me/notifications/preview','GET'),
    ('/api/v2/me/push-subscriptions','POST'),
    ('/api/v2/me/push-subscriptions/fixture','DELETE'),
    ('/api/v2/me/recommendations','GET'),
])
def test_removed_notification_and_recommendation_routes_are_404(monkeypatch,tokens,path,method):
    # CMS를 부르지 않고 계정 API가 바로 404를 준다(CMS 404→503 변환을 타지 않는다). 웹 푸시 기기 등록의 201도 없다.
    from services.user import dashboard as service
    monkeypatch.setattr(service.DashboardRepository,'request',lambda *a,**k:pytest.fail('removed route must not call storage'))
    params={'kind':'news'} if path.endswith('/recommendations') else None
    response=dashboard.lambda_handler(event(path,method,tokens(),params=params,body={'subscription':{}}),None)
    assert response['statusCode']==404 and json.loads(response['body'])['error']['code']=='NOT_FOUND'


@pytest.mark.parametrize('path,body',[
    ('/api/v2/me/activity/sessions',{'content_key':'publication:42','format':'letter'}),
    ('/api/v2/me/activity/events',{'event_id':'e','session_id':'s','session_seq':1,'event_type':'progress','visible_ms':10000,'scroll_ratio':1}),
])
def test_view_reporting_routes_still_forward_body_unchanged(monkeypatch,tokens,path,body):
    # 열람 보고는 경로가 비슷하지만 유지한다. 예전 웹의 완료용 값도 그대로 CMS로 넘기고 CMS가 무시한다.
    from services.user import dashboard as service
    seen=[]
    def call(self,method,internal,owner,body=None,query=None):
        seen.append((method,internal,owner,body));return {'session_id':'s'}
    monkeypatch.setattr(service.DashboardRepository,'request',call)
    response=dashboard.lambda_handler(event(path,'POST',tokens(),body=body),None)
    assert response['statusCode']==(201 if path.endswith('/sessions') else 200)
    assert seen==[('POST',path.removeprefix('/api/v2/me'),'fixture-a',body)]


@pytest.mark.parametrize('path', ['/api/v2/me/activity/events','/api/v2/me/imports/bookmarks'])
def test_non_object_request_is_400_without_dependency_call(monkeypatch,tokens,path):
    monkeypatch.setattr(dashboard,'dispatch',lambda *a:pytest.fail('invalid body must not call dependency'))
    request=event(path,'POST',tokens());request['body']='[]'
    assert dashboard.lambda_handler(request,None)['statusCode']==400


@pytest.mark.parametrize('body', ['[]','invalid-json','{"text":null,"article_id":"123"}'])
def test_archive_invalid_input_is_400(monkeypatch,tokens,body):
    req=event('/api/archive','POST',tokens());req['body']=body
    assert archive.lambda_handler(req,None)['statusCode']==400


def test_archive_invalid_limit_and_dependency_failure_are_not_404(monkeypatch,tokens):
    assert archive.lambda_handler(event('/api/archive',token=tokens(),params={'limit':'-1'}),None)['statusCode']==400
    assert archive.lambda_handler(event('/api/archive',token=tokens(),params={'limit':'bad'}),None)['statusCode']==400
    import urllib.error
    async def broken(**kwargs):raise urllib.error.HTTPError('http://127.0.0.1',503,'fixture',{},None)
    monkeypatch.setattr(archive.svc,'get_personal_repository',lambda:SimpleNamespace(delete_archived_sentence=broken))
    assert archive.lambda_handler(event('/api/archive/1','DELETE',tokens()),None)['statusCode']==503


@pytest.mark.parametrize('status',[403,503,'network'])
def test_archive_delete_preserves_dependency_status(monkeypatch,tokens,status):
    import urllib.error
    async def broken(**kwargs):
        if status=='network':raise urllib.error.URLError('local refused')
        raise urllib.error.HTTPError('http://127.0.0.1',status,'fixture',{},None)
    monkeypatch.setattr(archive.svc,'get_personal_repository',lambda:SimpleNamespace(delete_archived_sentence=broken))
    assert archive.lambda_handler(event('/api/archive/1','DELETE',tokens()),None)['statusCode']==(403 if status==403 else 503)


def test_archive_personal_errors_are_private_and_popular_is_public(monkeypatch):
    for method in ('GET','POST','DELETE','PUT'):
        response=archive.lambda_handler(event('/api/archive',method=method),None)
        assert response['headers']['Cache-Control']=='private, no-store'
    response=archive.lambda_handler(event('/api/archive/not-popular/popular'),None)
    assert response['statusCode']==401
    async def public(params):return {'statusCode':200,'headers':{},'body':'{}'}
    monkeypatch.setattr(archive.svc,'handle_popular',public)
    assert 'Cache-Control' not in archive.lambda_handler(event('/api/archive/popular'),None)['headers']


def test_article_bookmarks_validate_and_forward_to_storage(monkeypatch,tokens):
    # 저장한 기사(2026-10-20): 목록·상태·저장·해제. 잘못된 ID·조건은 저장 계층에 닿기 전에 400이다.
    from services.user import dashboard as service
    seen=[]
    def call(self,method,path,owner,body=None,query=None):
        seen.append((method,path,owner,query));return {'items':[],'count':0,'total':0,'next_cursor':None} if path=='/article-bookmarks' else {'article_id':'42','saved':method=='PUT','saved_at':None}
    monkeypatch.setattr(service.DashboardRepository,'request',call)
    assert dashboard.lambda_handler(event('/api/v2/me/article-bookmarks',token=tokens(),params={'limit':'200','cursor':'c','user_id':'victim'}),None)['statusCode']==400
    response=dashboard.lambda_handler(event('/api/v2/me/article-bookmarks',token=tokens(),params={'limit':'200','cursor':'c'}),None)
    assert response['statusCode']==200 and response['headers']['Cache-Control']=='private, no-store'
    assert seen[-1]==('GET','/article-bookmarks','fixture-a',{'limit':'200','cursor':'c'})
    for params in ({'limit':'0'},{'limit':'201'},{'limit':'x'},{'sort':'old'}):
        assert dashboard.lambda_handler(event('/api/v2/me/article-bookmarks',token=tokens(),params=params),None)['statusCode']==400
    for method in ('GET','PUT','DELETE'):
        assert dashboard.lambda_handler(event('/api/v2/me/article-bookmarks/42',method,tokens()),None)['statusCode']==200
        assert seen[-1][:3]==(method,'/article-bookmarks/42','fixture-a')
    count=len(seen)
    for bad in ('0','abc','4.2','9'*30,'%EF%BC%91'):
        assert dashboard.lambda_handler(event(f'/api/v2/me/article-bookmarks/{bad}','PUT',tokens()),None)['statusCode']==400
    assert dashboard.lambda_handler(event('/api/v2/me/article-bookmarks/42','POST',tokens()),None)['statusCode']==404
    assert len(seen)==count
    assert dashboard.lambda_handler(event('/api/v2/me/article-bookmarks/42','PUT'),None)['statusCode']==401



def test_article_bookmarks_old_cms_default_404_stays_404(monkeypatch,tokens):
    # 배포 사이(계정 API 먼저, CMS 나중): 옛 CMS에는 저장한 기사 경로가 없어 FastAPI 기본 404({"detail":"Not Found"})를 준다.
    # 웹이 버튼을 숨기고 서랍을 빈 목록으로 보이려면 503이 아닌 404여야 한다. 다른 경로의 같은 응답은 그대로 503이다.
    import io
    import urllib.error
    from services.user import dashboard as service
    def old_cms(self,method,path,owner,body=None,query=None):
        raise urllib.error.HTTPError('http://127.0.0.1'+path,404,'Not Found',{},io.BytesIO(b'{"detail":"Not Found"}'))
    monkeypatch.setattr(service.DashboardRepository,'request',old_cms)
    for path,method in (('/api/v2/me/article-bookmarks','GET'),('/api/v2/me/article-bookmarks/42','GET'),('/api/v2/me/article-bookmarks/42','PUT')):
        result=dashboard.lambda_handler(event(path,method,tokens()),None)
        assert result['statusCode']==404 and json.loads(result['body'])['error']['code']=='NOT_FOUND'
    result=dashboard.lambda_handler(event('/api/v2/me/letter-bookmarks',token=tokens()),None)
    assert result['statusCode']==503
