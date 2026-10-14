"""형식 선호·계정 팔로우·서버 읽음·명시 이관의 실제 loopback SQL 회귀."""
import importlib
import uuid
from concurrent.futures import ThreadPoolExecutor
from test_dashboard_storage import repo
from test_activity_recommendations import modules
from test_completion_rewards import complete,event
import pytest


def test_format_deduplicates_sessions_and_insufficient_samples(complete):
    _,a,_,cur=complete
    f=importlib.import_module('format_preference_repo')
    for _ in range(3):
        _,payload=event(a,cur,visible=10000)
        a.accept_event('a',payload)
    with cur() as c:
        p=f.preference(c,'a')
        assert p['status']=='insufficient_data' and p['qualified_contents']==1
        assert p['distribution'][0]['score']==1 and p['preferred_format'] is None
        assert f.preference(c,'b')['qualified_contents']==0
    _,payload=event(a,cur,scroll_ratio=1);a.accept_event('a',payload)
    with cur() as c:assert f.preference(c,'a')['distribution'][0]['score']==3


def test_format_ignores_single_format_letters_and_passive_media(complete):
    _,a,_,cur=complete;f=importlib.import_module('format_preference_repo')
    for key,fmt in [('issue_letter:1','letter'),('publication:42','podcast'),('publication:42','webtoon')]:
        _,payload=event(a,cur,key=key,fmt=fmt,visible=10000)
        a.accept_event('a',payload)
    with cur() as c:assert f.preference(c,'a')['qualified_contents']==0
    session,p=event(a,cur,fmt='podcast',visible=15000,active_ms=12000,consumed_ranges=[[0,12]])
    a.accept_event('a',p)
    with cur() as c:assert next(r for r in f.preference(c,'a')['distribution'] if r['format']=='podcast')['score']==1


def test_format_ready_ties_and_ninety_day_expiry(modules):
    _,a,_,cur=modules;f=importlib.import_module('format_preference_repo')
    with cur() as c:
        c.execute("INSERT INTO publications(id,slug,title,published_at,status,category_id) VALUES(44,'third','세 번째',now(),'published',1)")
        c.execute("INSERT INTO renditions VALUES(12,44,'letter','ready');INSERT INTO rendition_blocks(rendition_id,content) VALUES(12,'본문')")
    sessions=[]
    for key in ['publication:42','publication:43','publication:44']:
        session=a.create_session('a',{'content_key':key,'format':'letter'});sessions.append(session['session_id'])
        with cur() as c:c.execute('UPDATE user_content_sessions SET visible_ms=10000 WHERE id=%s',(session['session_id'],))
    with cur() as c:
        p=f.preference(c,'a');assert p['status']=='ready' and p['preferred_format']=='letter'
        c.execute("UPDATE user_content_sessions SET updated_at=clock_timestamp()-interval '91 days' WHERE id=%s",(sessions[-1],))
        assert f.preference(c,'a')['status']=='insufficient_data'
        c.execute("UPDATE publications SET status='draft' WHERE id=42")
        assert f.preference(c,'a')['qualified_contents']==1


def test_follow_owner_idempotency_active_editor_and_real_author_candidates(modules):
    d,_,r,cur=modules;f=importlib.import_module('account_connections_repo')
    assert f.set_followed('a','mincheol',True)['following']
    f.set_followed('a','mincheol',True)
    assert f.list_followed('a')['total']==1 and f.list_followed('b')['total']==0
    assert d.get_preferences('a')['interests']==[]
    with cur() as c:c.execute('INSERT INTO issue_letter_editors VALUES(1,1,0)')
    cards=r.candidates('a',{'kind':'issue_letter','categories':[],'terms':[],'editors':['mincheol']})['items']
    assert [c['id'] for c in cards]==['1'] and cards[0]['editors']==['mincheol']
    with pytest.raises(f.DashboardError):f.set_followed('a','inactive',True)
    with cur() as c:c.execute("UPDATE letter_editors SET is_active=false WHERE slug='mincheol'")
    assert not f.list_followed('a')['items'][0]['active']
    assert not r.candidates('a',{'kind':'issue_letter','categories':[],'terms':[],'editors':['mincheol']})['items']
    f.set_followed('a','mincheol',False);f.set_followed('a','mincheol',False)
    assert f.list_followed('a')['total']==0


def test_server_completed_filter_cursor_bound_to_read_and_owner(complete):
    d,a,_,cur=complete
    d.set_bookmark('a','1',True);d.set_bookmark('a','2',True)
    _,p=event(a,cur,key='issue_letter:1',scroll_ratio=1);assert a.accept_event('a',p)['completed']
    assert [r['letter_id'] for r in d.list_bookmarks('a',read='unread')['items']]==['2']
    assert [r['letter_id'] for r in d.list_bookmarks('a',read='completed')['items']]==['1']
    assert d.list_bookmarks('b',read='completed')['total']==0
    cursor=d.list_bookmarks('a',limit=1)['next_cursor']
    with pytest.raises(d.DashboardError):d.list_bookmarks('a',limit=1,cursor=cursor,read='unread')


def test_import_partial_repeat_does_not_resurrect_removed_and_owner_isolated(repo):
    d,cur=repo;f=importlib.import_module('account_connections_repo')
    body={'import_id':str(uuid.uuid4()),'source':'browser-bookmarks-v1','slugs':['one','one','missing','hidden']}
    first=f.import_bookmarks('a',body)
    assert len(first['accepted'])==1 and len(first['rejected'])==2
    d.set_bookmark('a','1',False)
    replay=f.import_bookmarks('a',{**body,'import_id':str(uuid.uuid4())})
    assert replay['replayed'] and d.list_bookmarks('a')['total']==0
    assert f.import_bookmarks('b',body)['replayed'] is False and d.list_bookmarks('b')['total']==1
    with pytest.raises(d.DashboardError) as e:f.import_bookmarks('a',{**body,'slugs':['two']})
    assert e.value.status==409
    with cur() as c:
        c.execute('SELECT count(*) AS n FROM user_lens_preferences');assert c.fetchone()['n']==0


def test_import_concurrent_same_snapshot_each_nonce_bound(repo):
    _,cur=repo;f=importlib.import_module('account_connections_repo')
    def run(_):return f.import_bookmarks('a',{'import_id':str(uuid.uuid4()),'source':'browser-bookmarks-v1','slugs':['one']})
    with ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(run,range(2)))
    assert sorted(r['replayed'] for r in results)==[False,True]
    with cur() as c:
        c.execute('SELECT count(*) AS n FROM user_lens_imports');assert c.fetchone()['n']==2
        c.execute('SELECT count(*) AS n FROM user_letter_bookmarks');assert c.fetchone()['n']==1


def test_import_invalid_empty_or_blocked_is_atomic(repo):
    d,cur=repo;f=importlib.import_module('account_connections_repo')
    body={'import_id':str(uuid.uuid4()),'source':'browser-bookmarks-v1','slugs':['one']}
    for bad in [{**body,'slugs':[]},{**body,'slugs':['one',None]},{**body,'source':'other'},{**body,'user_id':'b'}]:
        with pytest.raises(d.DashboardError):f.import_bookmarks('a',bad)
    d.set_bookmark('a','2',True)
    with cur() as c:c.execute("UPDATE users SET status='blocked' WHERE id='a'")
    with pytest.raises(d.DashboardError) as e:f.import_bookmarks('a',body)
    assert e.value.status==403


def test_ready_formats_can_tie_without_invented_preferred_format(complete):
    _,a,_,cur=complete;f=importlib.import_module('format_preference_repo')
    with cur() as c:
        c.execute("INSERT INTO publications(id,slug,title,published_at,status,category_id) VALUES(44,'third','세 번째',now(),'published',1)")
        c.execute("INSERT INTO renditions VALUES(12,44,'letter','ready'),(22,43,'webtoon','ready'),(23,44,'webtoon','ready'); INSERT INTO rendition_blocks(rendition_id,content) VALUES(12,'본문')")
        c.execute("INSERT INTO webtoon_panels(rendition_id,image_url,position) VALUES(22,'local.png',0),(23,'local.png',0)")
    for key in ['publication:42','publication:43','publication:44']:
        for fmt in ['letter','webtoon']:
            session=a.create_session('a',{'content_key':key,'format':fmt})
            with cur() as c:c.execute("UPDATE user_content_sessions SET visible_ms=10000,viewed_panel_ids=%s::jsonb WHERE id=%s",('["1"]',session['session_id']))
    with cur() as c:
        result=f.preference(c,'a')
        assert result['status']=='ready' and result['qualified_contents']==3 and result['preferred_format'] is None
        assert [r['rank'] for r in result['distribution'][:2]]==[1,1]


def test_preferred_link_has_canonical_category_date_without_legacy_redirect(modules):
    _,_,recommendation,cur=modules
    cards=recommendation.candidates('a',{'kind':'publication','categories':['industry'],'terms':[]})['items']
    assert all(c['canonical_href'].startswith('/industry/') for c in cards)
    with cur() as c:c.execute("UPDATE publications SET admin_extra='{}' WHERE id=42")
    cards=recommendation.candidates('a',{'kind':'publication','categories':['industry'],'terms':[]})['items']
    assert next(c for c in cards if c['id']=='42')['canonical_href'].startswith('/news/')


def test_import_replayed_nonce_is_bound_and_rejected_can_be_retried(repo):
    d,cur=repo;f=importlib.import_module('account_connections_repo')
    body={'import_id':str(uuid.uuid4()),'source':'browser-bookmarks-v1','slugs':['one','hidden']}
    first=f.import_bookmarks('a',body);assert len(first['rejected'])==1
    alias={**body,'import_id':str(uuid.uuid4())}
    assert f.import_bookmarks('a',alias)['replayed']
    with pytest.raises(d.DashboardError) as e:f.import_bookmarks('a',{**alias,'slugs':['two']})
    assert e.value.status==409
    d.set_bookmark('a','1',False)
    with cur() as c:c.execute("UPDATE issue_letters SET status='published' WHERE slug='hidden'")
    retry=f.import_bookmarks('a',{**body,'import_id':str(uuid.uuid4())})
    assert not retry['replayed'] and retry['rejected']==[]
    assert [r['letter_id'] for r in d.list_bookmarks('a')['items']]==['3']
    assert f.import_bookmarks('a',alias)['rejected']==first['rejected']
