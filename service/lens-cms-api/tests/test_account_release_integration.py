"""공개 JWT handler → 실제 내부 라우트 → 전용 loopback DB 통합 인수."""
import datetime as dt
import importlib
import io
import json
from pathlib import Path
import sys
from types import SimpleNamespace
import urllib.error
import uuid

import jwt
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest

from test_dashboard_storage import repo
from test_activity_recommendations import modules
from test_view_only_activity import formats
from test_notifications import notifications, subscription


__all__ = ['repo','modules','formats','notifications']


@pytest.fixture
def account_api(request, monkeypatch):
    _, _, _, cursor, dashboard_repo = request.getfixturevalue('notifications')
    backend=Path(__file__).resolve().parents[2]/'backend'
    monkeypatch.syspath_prepend(str(backend))
    import route_guards
    monkeypatch.setattr(route_guards,'_ADMIN_TOKEN','test-local-internal')
    monkeypatch.delitem(sys.modules,'routes_dashboard',raising=False)
    router=importlib.import_module('routes_dashboard')
    monkeypatch.setattr(router,'dashboard_repo',dashboard_repo)
    app=FastAPI();app.include_router(router.router)
    client=TestClient(app)
    from clients.pg import personal
    from core import auth
    from handlers.user import dashboard
    monkeypatch.setattr(personal,'_API_URL','http://127.0.0.1:4199')
    monkeypatch.setattr(personal,'_TOKEN','test-local-internal')
    key=rsa.generate_private_key(public_exponent=65537,key_size=2048)
    monkeypatch.setattr(auth,'_get_jwks_client',lambda:SimpleNamespace(get_signing_key_from_jwt=lambda _:SimpleNamespace(key=key.public_key())))
    # 소켓을 열지 않고 HTTP 요청/헤더/본문 그대로 실제 FastAPI router로 전달한다.
    def internal(request,timeout=None):
        response=client.request(request.method,request.full_url.replace('http://127.0.0.1:4199',''),headers=dict(request.header_items()),content=request.data)
        if response.status_code>=400:
            raise urllib.error.HTTPError(request.full_url,response.status_code,'fixture',response.headers,io.BytesIO(response.content))
        return io.BytesIO(response.content)
    monkeypatch.setattr(personal.urllib.request,'urlopen',internal)
    def call(path,method='GET',body=None,owner='a',expected=200,expired=False,query=None):
        now=dt.datetime.now(dt.timezone.utc)
        token=jwt.encode({'sub':owner,'aud':auth.settings.cognito_app_client_id,'iss':auth._issuer(),'token_use':'id','exp':now+dt.timedelta(minutes=-1 if expired else 10)},key,algorithm='RS256')
        event={'rawPath':'/api/v2/me'+path,'requestContext':{'http':{'method':method}},'headers':{'Authorization':'Bearer '+token},'body':json.dumps(body or {}),'queryStringParameters':query or {}}
        result=dashboard.lambda_handler(event,None)
        assert result['statusCode']==expected,(path,result)
        assert result['headers']['Cache-Control']=='private, no-store'
        return json.loads(result['body'])
    return call,cursor,personal


def test_account_roundtrip_preferences_bookmarks_follows_import_and_expiry(account_api):
    call,cursor,_=account_api
    saved=call('/preferences','PUT',{'revision':0,'interests':[{'type':'category','key':'industry'}]})
    assert saved['revision']==1 and saved['minutes']==0  # minutes: 옛 계정 API 호환용 DB 값(다음 정리 때 제거)
    assert call('/preferences',owner='b')['revision']==0
    call('/preferences','PUT',{'revision':0,'interests':[]},expected=409)
    # 예전에 5분을 고른 계정: 예전 웹이 읽을 시간을 저장해도 400 없이 아무것도 쓰지 않는다(관심·revision·저장된 5분 그대로).
    with cursor() as cur:
        cur.execute("UPDATE user_lens_preferences SET minutes=5 WHERE user_id='a'")
    assert call('/preferences','PUT',{'revision':1,'minutes':10})=={**saved,'minutes':5}
    with cursor() as cur:
        cur.execute("SELECT minutes,revision FROM user_lens_preferences WHERE user_id='a'");assert dict(cur.fetchone())=={'minutes':5,'revision':1}
    call('/preferences',expired=True,expected=401)
    assert call('/preferences')=={**saved,'minutes':5}
    # 시간 제한이 남아 있어도 레터 추천은 비지 않는다(예전 웹의 minutes 질의도 무시).
    for query in ({'tab':'home'},{'tab':'home','minutes':'5'}):
        letters=call('/dashboard',query=query)['letters']
        assert letters['status']=='ready' and 'minutes_budget' not in letters['data']
    call('/letter-bookmarks/1','PUT')
    assert call('/letter-bookmarks')['total']==1
    assert call('/letter-bookmarks',owner='b')['total']==0
    call('/followed-editors/mincheol','PUT')
    assert call('/followed-editors')['total']==1
    assert call('/followed-editors',owner='b')['total']==0
    payload={'source':'browser-bookmarks-v1','import_id':str(uuid.uuid4()),'slugs':['two']}
    assert call('/imports/bookmarks','POST',payload)['accepted'][0]['slug']=='two'
    call('/letter-bookmarks/2','DELETE')
    call('/imports/bookmarks','POST',payload)
    assert call('/letter-bookmarks')['total']==1
    call('/followed-editors/mincheol','DELETE')
    assert call('/followed-editors')['total']==0


def test_account_recommendation_view_signal_notifications_and_dependency(account_api):
    call,cursor,personal=account_api
    call('/preferences','PUT',{'revision':0,'interests':[{'type':'category','key':'industry'}]})
    # 공개 프론트가 사용하는 조회 계약을 실제 service/router/SQL을 통해 읽는다.
    # 형식 비율·기간 기록·리워드 조회는 제거돼 공개 API에서 404다.
    for removed in ('/format-preference','/activity','/rewards'):
        assert call(removed,expected=404)['error']['code']=='NOT_FOUND'
    assert call('/recommendations',query={'kind':'news','reason':'all','limit':'4'})['algorithm_version']=='recent-category-editor-v3'
    session=call('/activity/sessions','POST',{'content_key':'publication:42','format':'letter'},expected=201)
    assert session['completion']['completion_enabled'] is False and session['completion']['panel_ids']==[]
    with cursor() as cur:
        cur.execute("UPDATE user_content_sessions SET started_at=now()-interval '60 seconds',updated_at=now()-interval '60 seconds' WHERE id=%s",(session['session_id'],))
    # 예전 웹 payload(scroll_ratio 포함)도 400 없이 받고, 열람만 판정한다.
    progress={'session_id':session['session_id'],'event_id':str(uuid.uuid4()),'session_seq':1,'event_type':'progress','visible_ms':30000,'scroll_ratio':1}
    result=call('/activity/events','POST',progress)
    assert result['viewed'] and result['completed'] is False and not result['reward']['stamp_awarded']
    assert call('/activity/events','POST',progress)==result
    with cursor() as cur:
        cur.execute('SELECT count(*) AS n FROM user_content_completions');assert cur.fetchone()['n']==0
    state=call('/notifications/preferences')
    call('/notifications/preferences','PUT',{'revision':state['revision'],'preferences':{**state['preferences'],'briefing':True}})
    call('/notifications/consent','PUT',{'channel':'web_push','granted':True,'policy_version':state['config']['policy_version']})
    device=call('/push-subscriptions','POST',subscription(),expected=201)
    assert call('/notifications/preferences')['delivery']['active_subscriptions']==1
    assert call('/notifications/preferences',owner='b')['delivery']['active_subscriptions']==0
    preview=call('/notifications/preview')
    assert preview['mode']=='dry_run' and not preview['actual_sent']
    call('/push-subscriptions/'+device['id'],'DELETE')
    call('/notifications/consent','PUT',{'channel':'web_push','granted':False,'policy_version':state['config']['policy_version']})
    assert not call('/notifications/preferences')['consent']['granted']
    summary=call('/dashboard')
    assert summary['scope']=='account'
    # 예전 화면 호환용 키만 남고 계산·조회하지 않는다. 알림 설정은 웹이 쓰지 않아 대시보드에서 묻지 않는다(/notifications/*는 그대로).
    assert all(summary[key]=={'status':'unavailable','data':None,'error':None} for key in ('format_preference','weekly_activity','weekly_rewards','notifications'))
    assert all(summary[key]['status']=='ready' for key in ('preferences','saved_letters','news','letters'))
    personal._TOKEN='wrong-test-token'
    call('/preferences',expected=503)
