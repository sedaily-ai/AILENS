"""격리 loopback 알림·동의·암호화·중복·기기 전환·전송 실패 검사."""
import datetime as dt
import importlib
import json
from pathlib import Path
import sys
import uuid
import base64
import psycopg2
from concurrent.futures import ThreadPoolExecutor
import pytest
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.serialization import Encoding,PublicFormat
from test_completion_rewards import complete
from test_activity_recommendations import modules
from test_dashboard_storage import repo


def subscription(endpoint='https://push.invalid/local-device'):
    key=ec.generate_private_key(ec.SECP256R1()).public_key().public_bytes(Encoding.X962,PublicFormat.UncompressedPoint)
    enc=lambda b:base64.urlsafe_b64encode(b).decode().rstrip('=')
    return {'subscription':{'endpoint':endpoint,'keys':{'p256dh':enc(key),'auth':enc(b'x'*16)},'expirationTime':None},'permission':'simulated'}


@pytest.fixture
def notifications(complete,monkeypatch):
    dashboard,_,_,cursor=complete
    monkeypatch.setenv('LENS_PUSH_MODE','dry_run');monkeypatch.setenv('LENS_PUSH_ENCRYPTION_KEY',Fernet.generate_key().decode());monkeypatch.setenv('LENS_PUSH_POLICY_VERSION','fixture-v1')
    with cursor() as c:
        c.execute("DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='lens_service_app') THEN CREATE ROLE lens_service_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT; END IF; END $$;")
        for version in ('51','52'):c.execute(Path(__file__).resolve().parents[3].joinpath(f'docs/architecture/lens-erd-src/lens_schema_v1.{version}_2026-10-14.sql').read_text())
        c.execute(Path(__file__).resolve().parents[3].joinpath('docs/architecture/lens-erd-src/lens_schema_v1.55_2026-10-15.sql').read_text())
    for name in ('notification_policy','notifications_repo','notification_delivery_repo','notification_inputs','push_provider'):
        monkeypatch.delitem(sys.modules,name,raising=False)
    return importlib.import_module('notifications_repo'),importlib.import_module('notification_delivery_repo'),importlib.import_module('notification_inputs'),cursor,dashboard


def setup(r,owner='a'):
    p={**r.policy.DEFAULT,'briefing':True,'time':'08:00'}
    state=r.save(owner,{'revision':0,'preferences':p})
    r.consent(owner,{'channel':'web_push','granted':True,'policy_version':r.policy.policy_version()})
    sub=r.register(owner,subscription(f'https://push.invalid/{owner}'))
    return state,sub


def test_read_only_app_locks_followups_without_update_permission(notifications):
    _,_,_,cursor,_=notifications
    with cursor() as cur:
        # 최소 fixture는 public 스키마를 재생성하므로 기존 운영 역할의 USAGE도 복원한다.
        cur.execute('GRANT USAGE ON SCHEMA public TO lens_service_app')
        cur.execute("INSERT INTO content_followup_links VALUES('publication:42','publication:43',true,now()),('issue_letter:1','publication:43',true,now())")
    with cursor() as cur:
        cur.execute('SET LOCAL ROLE lens_service_app')
        cur.execute("SELECT has_table_privilege(current_user,'content_followup_links','UPDATE') AS writable")
        assert not cur.fetchone()['writable']
        cur.execute('SAVEPOINT write_probe')
        with pytest.raises(psycopg2.errors.InsufficientPrivilege):
            cur.execute("UPDATE content_followup_links SET editor_approved=false")
        cur.execute('ROLLBACK TO SAVEPOINT write_probe')
        cur.execute("SELECT public.lock_notification_followup_sources(ARRAY['publication:42']::text[])")
        # 동일 source의 승인 변경은 기다리고, 무관한 관계 변경은 막지 않는다.
        with pytest.raises(psycopg2.errors.LockNotAvailable):
            with cursor() as other:
                other.execute("SET LOCAL lock_timeout='50ms'")
                other.execute("UPDATE content_followup_links SET editor_approved=false WHERE source_content_key='publication:42'")
        with cursor() as other:
            other.execute("SET LOCAL lock_timeout='50ms'")
            other.execute("UPDATE content_followup_links SET editor_approved=false WHERE source_content_key='issue_letter:1'")
    with cursor() as cur:
        cur.execute("SELECT EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a WHERE p.oid='public.lock_notification_followup_sources(text[])'::regprocedure AND a.grantee=0 AND a.privilege_type='EXECUTE') AS public_execute")
        assert not cur.fetchone()['public_execute']


def prepare(r,d,cur,owner='a',build_only=False,expected_mode='dry_run'):
    with cur() as c:
        # fixture clock only; API uses server clock. Current UTC from DB is tested below.
        now=r.clock(c);tz='Asia/Seoul' if 8<=now.astimezone(dt.timezone(dt.timedelta(hours=9))).hour<21 else 'UTC' if 8<=now.hour<21 else 'America/New_York'
        p=r.state(c,owner)['preferences'];p={**p,'timezone':tz,'time':'08:00'}
    current=r.get(owner);r.save(owner,{'revision':current['revision'],'preferences':p})
    with cur() as c:
        state=r.state(c,owner);fingerprint=d.fingerprint(c,owner)
    body={'preferences_revision':state['revision'],'consent_version':r.policy.policy_version(),'source_fingerprint':fingerprint,'payload':{'types':['briefing'],'content_keys':['publication:43'],'weekly_period':None}}
    return body if build_only else d.plan(owner,body,expected_mode=expected_mode)


def test_settings_revision_consent_and_owner(notifications):
    r,_,_,cur,_=notifications
    assert not r.get('a')['consent']['granted'] and r.get('a')['revision']==0
    state,_=setup(r)
    assert r.get('b')['revision']==0
    with pytest.raises(r.DashboardError) as err:r.save('a',{'revision':0,'preferences':state['preferences']})
    assert err.value.status==409
    now=r.get('a')['consent']['agreed_at']
    r.consent('a',{'channel':'web_push','granted':True,'policy_version':'fixture-v1'})
    assert r.get('a')['consent']['agreed_at']==now
    with cur() as c:c.execute('SELECT count(*) AS n FROM user_notification_consent_events');assert c.fetchone()['n']==1
    with pytest.raises(r.DashboardError):r.consent('a',{'channel':'web_push','granted':True,'policy_version':'old'})


def test_subscription_encrypted_validation_transfer_and_logout(notifications):
    r,_,_,cur,_=notifications
    with pytest.raises(r.DashboardError):r.register('a',subscription())
    for owner in ('a','b'):r.consent(owner,{'channel':'web_push','granted':True,'policy_version':'fixture-v1'})
    body=subscription();first=r.register('a',body)
    assert not r.register('a',body)['created']
    with cur() as c:
        c.execute('SELECT subscription_encrypted FROM user_push_subscriptions');cipher=c.fetchone()['subscription_encrypted']
        assert body['subscription']['endpoint'] not in cipher and 'p256dh' not in cipher
    assert 'endpoint' not in json.dumps(r.get('a'))
    with pytest.raises(r.DashboardError) as err:r.register('b',subscription())
    assert err.value.status==409
    moved=r.register('b',body);assert moved['id']==first['id'] and r.get('a')['delivery']['active_subscriptions']==0
    with pytest.raises(r.DashboardError) as err:r.remove('a',first['id'])
    assert err.value.status==404
    assert not r.remove('b',first['id'])['active']
    for bad in ['http://push.invalid/a','https://127.0.0.1/a','https://push.invalid:9000/a','https://push.invalid/a#fragment','https://user:secret@push.invalid/a']:
        with pytest.raises(r.DashboardError):r.register('b',{**body,'subscription':{**body['subscription'],'endpoint':bad}})


def test_parallel_plan_single_receipt_and_no_actual_send(notifications):
    r,d,_,cur,_=notifications;setup(r)
    body=prepare(r,d,cur,build_only=True)
    with ThreadPoolExecutor(max_workers=2) as pool:plans=list(pool.map(lambda _:d.plan('a',body),range(2)))
    assert sum(plan['planned'] for plan in plans)==1
    assert not prepare(r,d,cur)['planned'] # settings update cancels previous plan but same date cannot be duplicated
    # A fresh account tests the true single claim/receipt path.
    setup(r,'b');plan=prepare(r,d,cur,'b');assert plan['planned']
    with ThreadPoolExecutor(max_workers=2) as pool:claims=list(pool.map(lambda _:d.claim('b'),range(2)))
    assert sum(x['claimed'] for x in claims)==1
    claim=next(x for x in claims if x['claimed']);claim.pop('claimed')
    result=d.send_claim('b',claim);assert result['status']=='simulated' and not result['actual_sent']
    assert not d.send_claim('b',claim)['processed']
    assert r.get('b')['delivery']['last_sent_at'] is None and r.get('b')['delivery']['last_simulated_at']


def test_withdrawal_pause_and_account_transfer_cancel_before_send(notifications):
    r,d,_,cur,_=notifications;_,s=setup(r);prepare(r,d,cur)
    claim=d.claim('a');assert claim.pop('claimed')
    r.consent('a',{'channel':'web_push','granted':False,'policy_version':'fixture-v1'})
    assert not d.send_claim('a',claim)['processed'] and r.get('a')['delivery']['active_subscriptions']==0
    with cur() as c:c.execute('SELECT status FROM user_notification_deliveries');assert c.fetchone()['status']=='canceled'


@pytest.mark.parametrize('result,expected',[({'status':'gone','code':'HTTP_410'},'gone'),({'status':'unknown','code':'NETWORK_OUTCOME_UNKNOWN'},'unknown'),({'status':'retry','code':'HTTP_429'},'retry')])
def test_provider_failures_not_false_success(notifications,monkeypatch,result,expected):
    r,d,_,cur,_=notifications;setup(r)
    monkeypatch.setenv('LENS_PUSH_MODE','live')
    original_config=r.policy.public_config
    monkeypatch.setattr(r.policy,'public_config',lambda:{**original_config(),'supported':True})
    # 실제 모드의 구독 검증은 유지하고, 전송 adapter만 대역으로 처리한다.
    with cur() as c:c.execute('DELETE FROM user_push_subscriptions')
    live_body=subscription('https://fcm.googleapis.com/fixture-provider-never-contacted')
    live_body['permission']='granted'
    r.register('a',live_body)
    prepare(r,d,cur,expected_mode='live')
    monkeypatch.setattr(d.push_provider,'send',lambda *args:result)
    claim=d.claim('a',expected_mode='live');claim.pop('claimed');reply=d.send_claim('a',claim,expected_mode='live')
    assert reply['status']==expected and not reply['actual_sent']
    if expected=='gone':assert r.get('a')['delivery']['active_subscriptions']==0
    assert not d.claim('a',expected_mode='live')['claimed']
    if expected=='retry':
        for _ in range(2):
            with cur() as c:c.execute('UPDATE user_notification_delivery_targets SET next_attempt_at=now()')
            claim=d.claim('a',expected_mode='live');claim.pop('claimed');reply=d.send_claim('a',claim,expected_mode='live')
        assert reply['status']=='failed'


def test_inputs_exclude_unconsented_sentences_and_followup_requires_approval(notifications):
    r,_,i,cur,dashboard=notifications;setup(r)
    with cur() as c:
        c.execute("INSERT INTO user_archives(user_id,article_no,content) VALUES('a','123','반도체와 민감한 원문')")
        c.execute("INSERT INTO content_followup_links VALUES('publication:42','publication:43',false,now()+interval '1 second')")
    assert i.inputs('a')['sentence_words']==[] and i.inputs('a')['recent_sentences']==[]
    assert i.candidates('a')['followups']==[]
    with cur() as c:c.execute('UPDATE content_followup_links SET editor_approved=true')
    assert i.candidates('a')['followups'][0]['content_key']=='publication:43'
    assert i.inputs('b')['sentence_words']==[]


def test_dst_schedule_and_quiet_hours(notifications):
    r,_,_,_,_=notifications;p={**r.policy.DEFAULT,'briefing':True,'weekly':True,'timezone':'America/New_York','time':'08:00','weeklyDay':0}
    assert r.policy.due_types(p,dt.datetime(2026,11,1,13,0,tzinfo=dt.timezone.utc))==['briefing','weekly']
    assert r.policy.due_types(p,dt.datetime(2026,11,1,6,0,tzinfo=dt.timezone.utc))==[]
    p['frequency']='threeDays';assert r.policy.due_types(p,dt.datetime(2026,11,1,13,0,tzinfo=dt.timezone.utc))==['weekly']


def test_changed_interest_or_read_record_cancels_prepared_delivery(notifications):
    r,d,_,cur,dashboard=notifications;setup(r);prepare(r,d,cur)
    claim=d.claim('a');claim.pop('claimed')
    dashboard.replace_preferences('a',{'revision':0,'minutes':0,'interests':[{'type':'category','key':'finance'}]})
    assert d.send_claim('a',claim)['status']=='canceled'
    assert r.get('a')['delivery']['last_simulated_at'] is None


def test_old_lease_unknown_never_reclaimed_and_timezone_cooldown(notifications):
    r,d,_,cur,_=notifications;setup(r);prepare(r,d,cur)
    claim=d.claim('a');assert claim['claimed']
    with cur() as c:c.execute("UPDATE user_notification_delivery_targets SET lease_until=now()-interval '1 minute'")
    assert not d.claim('a')['claimed']
    with cur() as c:
        c.execute('SELECT status FROM user_notification_delivery_targets');assert c.fetchone()['status']=='unknown'
    assert not prepare(r,d,cur)['planned']


def test_two_devices_same_bundle_and_old_content_not_notified_twice(notifications):
    r,d,_,cur,_=notifications;setup(r);r.register('a',subscription('https://push.invalid/second'))
    prepare(r,d,cur)
    for _ in range(2):
        claimed=d.claim('a');assert claimed.pop('claimed')
        assert d.send_claim('a',claimed)['status']=='simulated'
    with cur() as c:
        assert d.cards(c,'a',['publication:43'])==[]
        c.execute('SELECT count(*) AS n FROM user_notification_delivery_targets WHERE status=\'simulated\'');assert c.fetchone()['n']==2


def test_internal_notification_routes_require_token(notifications,monkeypatch):
    r,_,_,_,_=notifications
    import route_guards
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    monkeypatch.setattr(route_guards,'_ADMIN_TOKEN','fixture-token')
    monkeypatch.delitem(sys.modules,'routes_dashboard',raising=False)
    routes=importlib.import_module('routes_dashboard')
    app=FastAPI();app.include_router(routes.router);client=TestClient(app)
    assert client.get('/internal/personal/lens/notifications/preferences?user_id=a').status_code==401
    assert client.post('/internal/personal/lens/notifications/due',json={'mode':'dry_run','limit':1}).status_code==401
    assert client.post('/internal/personal/lens/notifications/due',headers={'X-Internal-Token':'fixture-token'},json={'mode':'live','limit':1}).status_code==409
    response=client.get('/internal/personal/lens/notifications/preferences?user_id=a',headers={'X-Internal-Token':'fixture-token'})
    assert response.status_code==200 and not response.json()['consent']['granted']


def test_due_query_and_weekly_period_dedup(notifications):
    r,d,i,cur,_=notifications;setup(r);body=prepare(r,d,cur,build_only=True)
    assert 'a' in i.due()['owners']
    with cur() as c:
        now=r.clock(c);p=r.state(c,'a')['preferences'];local=now.astimezone(__import__('zoneinfo').ZoneInfo(p['timezone']))
    state=r.get('a');p={**p,'weekly':True,'weeklyDay':(local.weekday()+1)%7}
    r.save('a',{'revision':state['revision'],'preferences':p})
    with cur() as c:
        state=r.state(c,'a');body['preferences_revision']=state['revision'];body['source_fingerprint']=d.fingerprint(c,'a')
    start=(now+dt.timedelta(hours=9)).date();start-=dt.timedelta(days=start.weekday()+7)
    body['payload']={'types':['weekly'],'content_keys':[],'weekly_period':{'start':start.isoformat(),'end':(start+dt.timedelta(days=6)).isoformat()}}
    assert d.plan('a',body)['planned'];claim=d.claim('a');claim.pop('claimed')
    assert d.send_claim('a',claim)['status']=='simulated'
    with cur() as c:
        c.execute("UPDATE user_notification_deliveries SET simulated_at=now()-interval '25 hours',schedule_date=schedule_date-1")
    assert d.plan('a',body)=={'planned':False,'reason':'no_content'}


def test_editor_relation_revocation_cancels_before_transport(notifications):
    r,d,_,cur,_=notifications;setup(r)
    with cur() as c:
        c.execute("INSERT INTO user_archives(user_id,article_no,content) VALUES('a','123','저장 원문')")
        c.execute("INSERT INTO content_followup_links VALUES('publication:42','publication:43',true,now()+interval '1 second')")
    assert prepare(r,d,cur)['planned'];claim=d.claim('a');claim.pop('claimed')
    with cur() as c:c.execute('UPDATE content_followup_links SET editor_approved=false')
    assert d.send_claim('a',claim)['status']=='canceled'
    assert r.get('a')['delivery']['last_simulated_at'] is None


def test_delivery_keeps_selected_relevance_order_across_content_kinds(notifications):
    _,d,_,cur,dashboard=notifications
    dashboard.replace_preferences('a',{'revision':0,'minutes':0,'interests':[]})
    keys=['issue_letter:2','publication:43','publication:42','issue_letter:1']
    with cur() as c:
        assert [card['content_key'] for card in d.cards(c,'a',keys)]==keys
        assert d.cards(c,'b',keys)[0]['content_key']==keys[0]


def test_format_evidence_changes_only_owners_notification_fingerprint(notifications):
    _,d,_,cur,dashboard=notifications
    dashboard.replace_preferences('a',{'revision':0,'minutes':0,'interests':[]})
    activity=importlib.import_module('activity_repo')
    with cur() as c:
        before_a=d.fingerprint(c,'a');before_b=d.fingerprint(c,'b')
    session=activity.create_session('a',{'content_key':'publication:42','format':'letter'})
    with cur() as c:
        c.execute('UPDATE user_content_sessions SET visible_ms=10000 WHERE id=%s',(session['session_id'],))
        assert d.fingerprint(c,'a')!=before_a and d.fingerprint(c,'b')==before_b


def test_delivery_cancels_if_owner_changes_format_evidence_after_plan(notifications):
    r,d,_,cur,_=notifications;setup(r)
    assert prepare(r,d,cur)['planned']
    claim=d.claim('a');claim.pop('claimed')
    activity=importlib.import_module('activity_repo')
    session=activity.create_session('a',{'content_key':'publication:42','format':'letter'})
    with cur() as c:c.execute('UPDATE user_content_sessions SET visible_ms=10000 WHERE id=%s',(session['session_id'],))
    assert d.send_claim('a',claim)['status']=='canceled'
    assert r.get('a')['delivery']['last_simulated_at'] is None


def test_mode_switch_refuses_dry_run_plan_and_claim_without_live_mutation(notifications,monkeypatch):
    r,d,_,cur,_=notifications;setup(r);body=prepare(r,d,cur,build_only=True)
    monkeypatch.setenv('LENS_PUSH_MODE','live')
    for operation in (lambda:d.plan('a',body),lambda:d.claim('a')):
        with pytest.raises(r.DashboardError) as err:operation()
        assert err.value.status==409 and err.value.code=='MODE_CHANGED'
    with cur() as c:
        c.execute('SELECT count(*) AS n FROM user_notification_deliveries');assert c.fetchone()['n']==0


def test_mode_switch_before_send_preserves_lease_and_never_sends(notifications,monkeypatch):
    r,d,_,cur,_=notifications;setup(r);prepare(r,d,cur)
    claim=d.claim('a');claim.pop('claimed')
    monkeypatch.setenv('LENS_PUSH_MODE','live')
    monkeypatch.setattr(d.push_provider,'send',lambda *args:pytest.fail('dry_run may never call provider'))
    with pytest.raises(r.DashboardError) as err:d.send_claim('a',claim)
    assert err.value.status==409
    with cur() as c:
        c.execute('SELECT status,lease_token FROM user_notification_delivery_targets');target=c.fetchone()
        assert target['status']=='sending' and str(target['lease_token'])==claim['lease_token']
        c.execute('SELECT sent_at,simulated_at FROM user_notification_deliveries');row=c.fetchone()
        assert row['sent_at'] is None and row['simulated_at'] is None


def test_mode_switch_at_final_provider_boundary_records_no_actual_send(notifications,monkeypatch):
    r,d,_,cur,_=notifications;setup(r);prepare(r,d,cur)
    claim=d.claim('a');claim.pop('claimed')
    original=r.policy.decrypt
    def decrypt(*args):
        value=original(*args);monkeypatch.setenv('LENS_PUSH_MODE','live');return value
    monkeypatch.setattr(r.policy,'decrypt',decrypt)
    monkeypatch.setattr(d.push_provider,'send',lambda *args:pytest.fail('dry_run may never call provider'))
    result=d.send_claim('a',claim)
    assert result['processed'] and result['status']=='failed' and not result['actual_sent']
    with cur() as c:
        c.execute('SELECT sent_at,simulated_at FROM user_notification_deliveries');row=c.fetchone()
        assert row['sent_at'] is None and row['simulated_at'] is None


def test_dry_run_delivery_does_not_delegate_mode_to_provider(notifications,monkeypatch):
    r,d,_,cur,_=notifications;setup(r);prepare(r,d,cur)
    claim=d.claim('a');claim.pop('claimed')
    monkeypatch.setattr(d.push_provider,'send',lambda *args:pytest.fail('dry_run may never call provider'))
    reply=d.send_claim('a',claim)
    assert reply['status']=='simulated' and reply['actual_sent'] is False


def test_internal_operations_require_explicit_mode_before_mutation(notifications,monkeypatch):
    _,d,_,_,_=notifications
    import route_guards
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    monkeypatch.setattr(route_guards,'_ADMIN_TOKEN','fixture-token')
    monkeypatch.delitem(sys.modules,'routes_dashboard',raising=False)
    routes=importlib.import_module('routes_dashboard')
    app=FastAPI();app.include_router(routes.router);client=TestClient(app)
    headers={'X-Internal-Token':'fixture-token'}
    for suffix in ('plans','claim','send-claim'):
        response=client.post(f'/internal/personal/lens/notifications/{suffix}?user_id=a',headers=headers,json={})
        assert response.status_code==400
    monkeypatch.setattr(d,'send_claim',lambda owner,body,expected_mode:{'body_keys':sorted(body),'mode':expected_mode})
    response=client.post('/internal/personal/lens/notifications/send-claim?user_id=a',headers=headers,json={'mode':'dry_run','delivery_id':'d','subscription_id':'s','lease_token':'l'})
    assert response.json()=={'body_keys':['delivery_id','lease_token','subscription_id'],'mode':'dry_run'}
