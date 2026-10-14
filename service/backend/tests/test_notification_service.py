"""알림 source opt-in·빈 후보·worker 경계를 외부 요청 없이 검사."""
import datetime as dt
import pytest
from services.user import notifications
from repositories.dashboard_repository import DashboardRepository
import notification_worker as worker


def test_preview_uses_exact_interest_without_latest_fallback_or_quote_exposure(monkeypatch):
    now=dt.datetime.now(dt.timezone.utc).isoformat();seen=[]
    def request(self,method,path,owner,body=None,query=None):
        assert owner=='a';seen.append(path)
        if path=='/notifications/context':return {'preferences':{'briefing':True,'followups':False,'weekly':False},'due_types':['briefing'],'revision':1,'config':{'mode':'dry_run','policy_version':'v1'},'notified_keys':[], 'source_fingerprint':'hash','delivery':{}}
        if path=='/notifications/inputs':return {'preferences':{'interests':[],'minutes':0},'categories':[], 'keywords':[], 'sentence_words':[], 'selected_topics':[], 'coverage':{'unmatched':0,'news_count':0,'letter_count':0},'sentence_total':0,'recent_sentences':[]}
        if path=='/recommendation-candidates':return {'items':[{'content_key':'publication:1','kind':'publication','id':'1','title':'관계없는 제목','summary':'','published_at':now,'category_keys':[],'keywords':[],'read_minutes':1,'formats':['letter'],'viewed':False,'saved':False,'href':'/lens/one'}], 'latest':[]}
        if path=='/notifications/candidates':return {'server_now':now,'followups':[], 'weekly':{'read_days':0,'saved_contents':0}}
        raise AssertionError(path)
    monkeypatch.setattr(DashboardRepository,'request',request)
    result=notifications.preview('a')
    assert result['empty'] and result['items']==[] and result['actual_sent'] is False
    assert 'context' not in result and 'source_fingerprint' not in result
    assert '/notifications/inputs' in seen


def test_worker_dry_run_refuses_live_before_planning_or_claiming(monkeypatch):
    calls=[]
    def request(*args,**kwargs):calls.append(args);return {'mode':'live','owners':['a']}
    monkeypatch.setattr(worker,'request',request)
    monkeypatch.setattr(worker,'preview',lambda *a,**k:pytest.fail('live planning must not run'))
    with pytest.raises(RuntimeError):worker.run()
    assert len(calls)==1


def test_worker_oneshot_claims_once_and_records_simulated_status(monkeypatch):
    claims=iter([{'claimed':True,'delivery_id':'d','subscription_id':'s','lease_token':'l'},{'claimed':False}])
    def request(method,path,owner,body=None):
        if path=='/notifications/due':return {'mode':'dry_run','owners':['a']}
        assert owner=='a'
        if path.endswith('/claim'):
            assert body=={'mode':'dry_run'}
            return next(claims)
        assert path.endswith('/send-claim') and 'claimed' not in body and body['mode']=='dry_run'
        return {'status':'simulated','actual_sent':False}
    monkeypatch.setattr(worker,'request',request)
    monkeypatch.setattr(worker,'preview',lambda owner,scheduled,expected_mode:{'planned':True})
    assert worker.run()==[{'planned':True,'processed':['simulated']}]


def test_send_claim_client_timeout_exceeds_provider_timeout(monkeypatch):
    from clients.pg import dashboard
    seen=[]
    def request(method,path,**kwargs):seen.append(kwargs['timeout_seconds']);return {}
    monkeypatch.setattr(dashboard,'_request',request)
    dashboard.request('POST','/notifications/send-claim','a',body={})
    dashboard.request('GET','/notifications/due','')
    assert seen==[30,8]


def test_worker_continues_other_accounts_after_sanitized_failure(monkeypatch,caplog):
    def request(method,path,owner,body=None):
        if path=='/notifications/due':return {'mode':'dry_run','owners':['a','b']}
        return {'claimed':False}
    def preview(owner,scheduled,expected_mode):
        if owner=='a':raise RuntimeError('private endpoint must not leak')
        return {'planned':True}
    monkeypatch.setattr(worker,'request',request);monkeypatch.setattr(worker,'preview',preview)
    result=worker.run()
    assert len(result)==2 and result[0]['error']=='DEPENDENCY_UNAVAILABLE' and result[1]['planned']
    assert 'private endpoint' not in caplog.text


@pytest.mark.parametrize('notified',[[],['publication:8','publication:7','publication:6']])
def test_preview_filters_ineligible_before_cutoff_and_reserves_followup(monkeypatch,notified):
    now=dt.datetime.now(dt.timezone.utc)
    def card(i,age=0):
        return {'content_key':f'publication:{i}','kind':'publication','id':str(i),'title':str(i),'summary':'',
          'published_at':(now-dt.timedelta(hours=age)).isoformat(),'category_keys':['industry'],'keywords':[],
          'read_minutes':1,'formats':['letter'],'viewed':False,'saved':False,'href':f'/lens/{i}'}
    def request(self,method,path,owner,body=None,query=None):
        if path=='/notifications/context':return {'preferences':{'briefing':True,'followups':True,'weekly':False},'due_types':['briefing','followups'],'revision':1,'config':{'mode':'dry_run','policy_version':'v1'},'notified_keys':notified,'source_fingerprint':'h','delivery':{}}
        if path=='/notifications/inputs':return {'preferences':{'interests':[{'type':'category','key':'industry'}],'minutes':0},'categories':[], 'keywords':[], 'sentence_words':[], 'selected_topics':[], 'coverage':{'unmatched':0,'news_count':0,'letter_count':0},'sentence_total':0}
        if path=='/recommendation-candidates':return {'items':[card(i) for i in range(1,9)]+[card(9,80)] if body['kind']=='publication' else [],'latest':[]}
        if path=='/notifications/candidates':return {'server_now':now.isoformat(),'followups':[card(20)],'weekly':{'read_days':0,'saved_contents':0}}
        if path=='/format-preference':return {'status':'insufficient_data'}
        raise AssertionError(path)
    monkeypatch.setattr(DashboardRepository,'request',request)
    result=notifications.preview('a')
    assert len(result['items'])==4
    assert '/lens/20' in [c['href'] for c in result['items']]
    assert not any(c['href']==f'/lens/{k.split(":")[1]}' for c in result['items'] for k in notified)
    assert '/lens/9' not in [c['href'] for c in result['items']]


def test_worker_pins_batch_mode_through_plan_claim_and_send(monkeypatch):
    seen=[];claims=iter([{'claimed':True,'delivery_id':'d','subscription_id':'s','lease_token':'l'},{'claimed':False}])
    def request(method,path,owner,body=None):
        if path=='/notifications/due':return {'mode':'dry_run','owners':['a']}
        seen.append((path,body))
        if path=='/notifications/claim':return next(claims)
        assert body['mode']=='dry_run'
        return {'status':'simulated','actual_sent':False}
    def preview(owner,scheduled,expected_mode):
        assert scheduled and expected_mode=='dry_run'
        seen.append(('plan',expected_mode));return {'planned':True}
    monkeypatch.setattr(worker,'request',request);monkeypatch.setattr(worker,'preview',preview)
    assert worker.run()[0]['processed']==['simulated']
    assert seen[0]==('plan','dry_run') and seen[1][1]=={'mode':'dry_run'}


def test_scheduled_preview_refuses_context_mode_switch_before_candidates(monkeypatch):
    def request(self,method,path,owner,body=None,query=None):
        assert path=='/notifications/context'
        return {'config':{'mode':'live'}}
    monkeypatch.setattr(DashboardRepository,'request',request)
    from models.dashboard import DashboardError
    with pytest.raises(DashboardError) as err:notifications.preview('a',scheduled=True,expected_mode='dry_run')
    assert err.value.status==409


def test_worker_mode_switch_failure_is_isolated_and_no_send_attempted(monkeypatch):
    calls=[]
    def request(method,path,owner,body=None):
        calls.append((path,owner))
        if path=='/notifications/due':return {'mode':'dry_run','owners':['a','b']}
        assert path=='/notifications/claim' and body=={'mode':'dry_run'}
        return {'claimed':False}
    def preview(owner,scheduled,expected_mode):
        assert expected_mode=='dry_run'
        if owner=='a':raise RuntimeError('mode changed')
        return {'planned':True}
    monkeypatch.setattr(worker,'request',request);monkeypatch.setattr(worker,'preview',preview)
    result=worker.run()
    assert result[0]['error']=='DEPENDENCY_UNAVAILABLE' and result[1]['planned']
    assert not any(path=='/notifications/send-claim' for path,_ in calls)
