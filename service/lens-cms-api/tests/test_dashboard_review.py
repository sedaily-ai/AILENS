"""대시보드 전체 리뷰의 재현 사례. 전용 loopback fixture만 사용."""
import importlib
import json
import sys
from test_dashboard_storage import repo
from test_activity_recommendations import modules
from test_completion_rewards import complete
from test_notifications import notifications,setup,prepare,subscription
import pytest


def test_empty_bodies_not_recommended_or_reward_eligible(modules):
    _,_,recommendation,cur=modules
    completion=importlib.import_module('completion_repo')
    with cur() as c:
        c.execute("UPDATE rendition_blocks SET content='   ',image_url=NULL")
        c.execute("UPDATE issue_letter_sections SET paragraphs='[[\"   \"]]'")
        assert not completion.metadata(c,'publication:42','letter',{'category_keys':[]})['completion_enabled']
        assert not completion.metadata(c,'issue_letter:1','letter',{'category_keys':[]})['completion_enabled']
    assert recommendation.candidates('a',{'kind':'publication','categories':['industry'],'terms':[]})['items']==[]
    assert recommendation.candidates('a',{'kind':'issue_letter','categories':['finance'],'terms':[]})['items']==[]


def test_future_content_not_recommended(modules):
    _,_,recommendation,cur=modules
    with cur() as c:
        c.execute("UPDATE publications SET published_at=now()+interval '1 day' WHERE id=43")
        c.execute("UPDATE issue_letters SET published_at=now()+interval '1 day'")
    assert [r['id'] for r in recommendation.candidates('a',{'kind':'publication','categories':['industry'],'terms':[]})['items']]==['42']
    assert recommendation.candidates('a',{'kind':'issue_letter','categories':['finance'],'terms':[]})['items']==[]


def test_legacy_rendition_sentence_resolves_source_in_dashboard(modules):
    _,_,recommendation,cur=modules
    with cur() as c:c.execute("INSERT INTO user_archives(user_id,rendition_id,content) VALUES('a',10,'담은 문장')")
    row=recommendation.inputs('a')['recent_sentences'][0]
    assert row['content_key']=='publication:42' and row['href']=='/lens/123'


def test_device_count_not_truncated_and_removal_settles_delivery(notifications):
    r,d,_,cur,_=notifications;_,device=setup(r);assert prepare(r,d,cur)['planned']
    r.remove('a',device['id'])
    with cur() as c:
        c.execute('SELECT status FROM user_notification_deliveries');assert c.fetchone()['status']=='canceled'
        c.execute("UPDATE user_push_subscriptions SET active=true,updated_at=now()-interval '3 days'")
        c.execute("INSERT INTO user_push_subscriptions(id,user_id,endpoint_hash,subscription_encrypted,encryption_key_version,active,simulated) SELECT md5(i::text)::uuid,'a',md5(i::text)||md5(i::text),'unused','v1',false,true FROM generate_series(1,50) i")
    assert r.get('a')['delivery']['active_subscriptions']==1


def test_worker_due_claim_rotates_even_empty_candidates(notifications):
    r,d,inputs,cur,_=notifications
    for owner in ('a','b'):
        setup(r,owner);prepare(r,d,cur,owner,build_only=True)
    first=inputs.due(limit=1,claim_mode='dry_run')['owners']
    second=inputs.due(limit=1,claim_mode='dry_run')['owners']
    assert first==['a'] and second==['b']


def test_lock_clock_uses_wall_time(notifications):
    r,_,_,cur,_=notifications
    with cur() as c:
        before=r.clock(c);c.execute('SELECT pg_sleep(0.05)');after=r.clock(c)
    assert (after-before).total_seconds()>=.04


def test_blocked_account_cannot_use_archive_crud(modules,monkeypatch):
    dashboard,_,_,cur=modules
    dashboard.replace_preferences('a',{'revision':0,'minutes':0,'interests':[]})
    with cur() as c:c.execute("UPDATE users SET status='blocked' WHERE id='a'")
    monkeypatch.delitem(__import__('sys').modules,'personal_repo',raising=False)
    personal=importlib.import_module('personal_repo')
    for operation in (lambda:personal.list_archived_sentences('a'),lambda:personal.save_archived_sentence('a','문장','123'),lambda:personal.delete_archived_sentence('a','1')):
        with pytest.raises(dashboard.DashboardError) as error:operation()
        assert error.value.status==403


def test_live_leased_target_stays_uncertain_when_revoked(notifications):
    r,d,_,cur,_=notifications;_,device=setup(r);prepare(r,d,cur)
    assert d.claim('a')['claimed']
    with cur() as c:c.execute("UPDATE user_notification_deliveries SET mode='live'")
    r.remove('a',device['id'])
    with cur() as c:
        c.execute('SELECT status FROM user_notification_deliveries');assert c.fetchone()['status']=='unknown'
        c.execute('SELECT status FROM user_notification_delivery_targets');assert c.fetchone()['status']=='unknown'


def test_future_or_missing_publication_date_is_unavailable_in_saved_list(repo):
    r,cur=repo;r.set_bookmark('a','1',True)
    for when in ("now()+interval '1 day'",'NULL'):
        with cur() as c:c.execute(f'UPDATE issue_letters SET published_at={when} WHERE id=1')
        row=r.list_bookmarks('a')['items'][0]['content']
        assert not row['available'] and 'title' not in row
        with pytest.raises(r.DashboardError) as error:r.resolve('a','issue_letter','id','1')
        assert error.value.status==404


def test_due_batches_reach_accounts_beyond_first_hundred(notifications):
    r,d,i,cur,_=notifications;setup(r);prepare(r,d,cur,build_only=True)
    p=r.get('a')['preferences']
    with cur() as c:
        c.execute("INSERT INTO users(id,email) SELECT 'account-'||lpad(n::text,3,'0'),'account-'||n||'@fixture.invalid' FROM generate_series(1,104) n")
        c.execute("INSERT INTO user_notification_preferences(user_id,preferences,revision) SELECT id,%s,1 FROM users WHERE id LIKE 'account-%%'",(__import__('psycopg2.extras',fromlist=['Json']).Json(p),))
        c.execute("INSERT INTO user_notification_consents(user_id,granted,policy_version,agreed_at) SELECT id,true,%s,now() FROM users WHERE id LIKE 'account-%%'",(r.policy.policy_version(),))
        c.execute("INSERT INTO user_push_subscriptions(id,user_id,endpoint_hash,subscription_encrypted,encryption_key_version,simulated) SELECT md5(id)::uuid,id,md5(id)||md5(id),'batch-only','v1',true FROM users WHERE id LIKE 'account-%%'")
    first=i.due(100,'dry_run')['owners'];second=i.due(100,'dry_run')['owners']
    assert len(first)==100 and len(set(first+second))==105


@pytest.mark.parametrize('target', [False,True])
def test_notification_metadata_edit_cancels_stale_recommendation(notifications,target):
    r,d,_,cur,_=notifications;setup(r)
    with cur() as c:c.execute("INSERT INTO user_content_views(user_id,content_key,last_seen_at) VALUES('a','publication:42',now())")
    assert prepare(r,d,cur)['planned'];claim=d.claim('a');claim.pop('claimed')
    with cur() as c:
        c.execute("UPDATE publications SET admin_extra=%s,category_id=NULL WHERE id=%s",(json.dumps({'body_inline':{'category':'금융','lenses':[]}}),43 if target else 42))
    assert d.send_claim('a',claim)['status']=='canceled'


def test_existing_reading_history_and_save_keep_articles_alias(repo,monkeypatch):
    dashboard,cur=repo
    dashboard.replace_preferences('a',{'revision':0,'minutes':0,'interests':[]})
    with cur() as c:
        c.execute("""CREATE TABLE articles(article_no text PRIMARY KEY,title text);
        INSERT INTO articles VALUES('original-news','기존 기사');
        CREATE TABLE user_readings(id bigserial PRIMARY KEY,user_id varchar(64),article_no text,publication_id bigint,
          read_at timestamptz DEFAULT now(),read_count int NOT NULL DEFAULT 1);
        CREATE UNIQUE INDEX legacy_reading_article ON user_readings(user_id,article_no) WHERE article_no IS NOT NULL;
        CREATE UNIQUE INDEX legacy_reading_publication ON user_readings(user_id,publication_id) WHERE publication_id IS NOT NULL;
        INSERT INTO user_readings(user_id,article_no) VALUES('a','original-news');""")
    monkeypatch.delitem(sys.modules,'personal_repo',raising=False)
    personal=importlib.import_module('personal_repo')
    assert personal.list_reading_history('a')[0]['article_title']=='기존 기사'
    assert personal.list_reading_history('b')==[]
    saved=personal.save_reading_record('a',article_no='original-news')
    assert saved['read_count']==2 and saved['article_title']=='기존 기사'
    assert personal.save_reading_record('a',publication_id=42)['publication_id']==42
