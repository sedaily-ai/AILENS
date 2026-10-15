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
        seen.append((owner,body)); return {'revision':1,'interests':[],'minutes':0,'updated_at':None}
    monkeypatch.setattr(service.DashboardRepository,'request',call)
    for token in [None,'bad',tokens(exp=0)]:
        assert dashboard.lambda_handler(event(token=token),None)['statusCode']==401
    response=dashboard.lambda_handler(event(token=tokens(),params={'user_id':'victim'}),None)
    assert response['statusCode']==200 and response['headers']['Cache-Control']=='private, no-store'
    assert seen[-1][0]=='fixture-a'
    for body in [{'revision':True,'minutes':0,'interests':[]},{'revision':0,'minutes':7,'interests':[]},{'revision':0,'minutes':0,'interests':[{'type':'wrong','key':'x'}]}, {'user_id':'victim','revision':0,'minutes':0,'interests':[]}]:
        assert dashboard.lambda_handler(event(method='PUT',token=tokens(),body=body),None)['statusCode']==400


def test_reading_time_update_preserves_legacy_fields_on_storage_side(monkeypatch,tokens):
    from services.user import dashboard as service
    seen=[]
    def call(self,method,path,owner,body=None,query=None):
        seen.append(body);return {'revision':2,'interests':[{'type':'topic','key':'rates'}],'minutes':10}
    monkeypatch.setattr(service.DashboardRepository,'request',call)
    response=dashboard.lambda_handler(event(method='PUT',token=tokens(),body={'revision':1,'minutes':10}),None)
    assert response['statusCode']==200 and seen==[{'revision':1,'minutes':10}]
    assert json.loads(response['body'])['interests']==[{'type':'topic','key':'rates'}]


def test_account_handler_strips_named_stage_prefix(monkeypatch,tokens):
    # 운영 HTTP API는 스테이지 dev라 rawPath가 /dev/api/v2/me/... 로 들어온다(archive 로그로 확인).
    seen=[]
    def call(method, path, owner, body=None, query=None):
        seen.append(path); return {'revision':1,'interests':[],'minutes':0,'updated_at':None}
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
    ('/api/v2/me/format-preference','GET',200),
    ('/api/v2/me/followed-editors','GET',200),
    ('/api/v2/me/followed-editors/mincheol','PUT',200),
    ('/api/v2/me/followed-editors/mincheol','DELETE',200),
    ('/api/v2/me/imports/bookmarks','POST',200),
    ('/api/v2/me/notifications/preferences','GET',200),
    ('/api/v2/me/notifications/preferences','PUT',200),
    ('/api/v2/me/notifications/consent','PUT',200),
    ('/api/v2/me/notifications/preview','GET',200),
    ('/api/v2/me/push-subscriptions','POST',200),
    ('/api/v2/me/push-subscriptions/fixture','DELETE',200),
    ('/api/v2/me/activity/sessions','POST',201),
    ('/api/v2/me/activity/events','POST',200),
    ('/api/v2/me/dashboard','GET',200),
    ('/api/v2/me/activity','GET',200),
    ('/api/v2/me/rewards','GET',200),
    ('/api/v2/me/recommendations','GET',200),
    ('/api/v2/me/sentences/1/recommendations','GET',200),
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


@pytest.mark.parametrize('path', ['/api/v2/me/activity/events','/api/v2/me/push-subscriptions'])
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
