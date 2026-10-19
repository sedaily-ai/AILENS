"""계정 팔로우·저장 레터·명시 이관의 실제 loopback SQL 회귀."""
import base64
import importlib
import json
import sys
import uuid
from concurrent.futures import ThreadPoolExecutor
from test_dashboard_storage import repo
from test_activity_recommendations import modules
from test_view_only_activity import formats,event
import pytest


def test_follow_owner_idempotency_active_editor_and_real_author_candidates(modules):
    d,_,r,cur=modules;f=importlib.import_module('account_connections_repo')
    assert f.set_followed('a','mincheol',True)['following']
    f.set_followed('a','mincheol',True)
    assert f.list_followed('a')['total']==1 and f.list_followed('b')['total']==0
    assert d.get_preferences('a')['interests']==[]
    with cur() as c:c.execute('INSERT INTO issue_letter_editors VALUES(1,1,0)')
    cards=r.candidates('a',{'kind':'issue_letter','categories':[],'editors':['mincheol']})['items']
    assert [c['id'] for c in cards]==['1'] and cards[0]['editors']==['mincheol']
    with pytest.raises(f.DashboardError):f.set_followed('a','inactive',True)
    with cur() as c:c.execute("UPDATE letter_editors SET is_active=false WHERE slug='mincheol'")
    assert not f.list_followed('a')['items'][0]['active']
    assert not r.candidates('a',{'kind':'issue_letter','categories':[],'editors':['mincheol']})['items']
    f.set_followed('a','mincheol',False);f.set_followed('a','mincheol',False)
    assert f.list_followed('a')['total']==0


def test_saved_letters_keep_old_completion_record_without_read_filter_or_mark(formats):
    # 읽음 배지·미읽음 필터와 완료 판정은 제거됐다. 예전 완료 행은 남고 새 완료 행은 생기지 않으며,
    # 저장 목록·추천 카드에는 completed를 싣지 않는다.
    d,a,_,cur=formats
    d.set_bookmark('a','1',True);d.set_bookmark('a','2',True)
    old,_=event(a,cur,key='issue_letter:1')
    with cur() as c:c.execute("INSERT INTO user_content_completions(session_id,user_id,content_key,format,completed_at,completed_day,rule_version) VALUES(%s,'a','issue_letter:1','letter',now(),current_date,'completion-v1')",(old['session_id'],))
    _,p=event(a,cur,key='issue_letter:1',scroll_ratio=1);assert a.accept_event('a',p)['completed'] is False
    with cur() as c:
        c.execute("SELECT count(*) AS n FROM user_content_completions WHERE user_id='a' AND content_key='issue_letter:1'");assert c.fetchone()['n']==1
    listed=d.list_bookmarks('a')
    assert listed['total']==2 and sorted(x['letter_id'] for x in listed['items'])==['1','2']
    assert all('completed' not in x['content'] for x in listed['items'])
    r=importlib.import_module('recommendation_repo')
    for kind in ('issue_letter','publication'):
        cards=r.candidates('a',{'kind':kind,'categories':[]})['latest']
        assert cards and all('completed' not in card and {'viewed','saved'}<=set(card) for card in cards)


def test_bookmark_cursor_drops_read_and_accepts_only_unfiltered_legacy_cursor(formats):
    d,_,_,cur=formats
    d.set_bookmark('a','1',True);d.set_bookmark('a','2',True)
    with cur() as c:c.execute("UPDATE user_letter_bookmarks SET saved_at='2026-10-14T00:00:00Z'")
    page=d.list_bookmarks('a',limit=1)
    raw=base64.urlsafe_b64decode(page['next_cursor'])[:-32]
    assert 'read' not in json.loads(raw)
    expected=d.list_bookmarks('a',limit=1,cursor=page['next_cursor'])['items']
    assert [x['letter_id'] for x in expected]==['1']
    # 배포 전 CMS가 만든 커서는 read 키를 갖는다. 'all'은 같은 목록이라 이어서 받고, 거른 목록의 커서는 처음부터 다시 받게 한다.
    old={'owner':'a','q':'','at':page['items'][0]['saved_at'],'id':page['items'][0]['letter_id']}
    assert d.list_bookmarks('a',limit=1,cursor=d._encode_cursor({**old,'read':'all'}))['items']==expected
    for read in ('unread','completed'):
        with pytest.raises(d.DashboardError) as err:d.list_bookmarks('a',limit=1,cursor=d._encode_cursor({**old,'read':read}))
        assert err.value.code=='INVALID_CURSOR'
    with pytest.raises(d.DashboardError) as err:d.list_bookmarks('b',limit=1,cursor=page['next_cursor'])
    assert err.value.code=='INVALID_CURSOR'


def test_bookmark_route_ignores_legacy_read_query(formats,monkeypatch):
    d,a,_,cur=formats
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    import route_guards
    d.set_bookmark('a','1',True);d.set_bookmark('a','2',True)
    _,p=event(a,cur,key='issue_letter:1',scroll_ratio=1);a.accept_event('a',p)
    monkeypatch.setattr(route_guards,'_ADMIN_TOKEN','test-local-internal')
    monkeypatch.delitem(sys.modules,'routes_dashboard',raising=False)
    router=importlib.import_module('routes_dashboard')
    monkeypatch.setattr(router,'dashboard_repo',d)
    app=FastAPI();app.include_router(router.router);client=TestClient(app)
    headers={'X-Internal-Token':'test-local-internal'}
    for read in ('unread','completed','all','bogus'):
        res=client.get(f'/internal/personal/lens/letter-bookmarks?user_id=a&read={read}',headers=headers)
        assert res.status_code==200 and res.json()['total']==2
        assert all('completed' not in x['content'] for x in res.json()['items'])


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


def test_preferred_link_has_canonical_category_date_without_legacy_redirect(modules):
    _,_,recommendation,cur=modules
    cards=recommendation.candidates('a',{'kind':'publication','categories':['industry']})['items']
    assert all(c['canonical_href'].startswith('/industry/') for c in cards)
    with cur() as c:c.execute("UPDATE publications SET admin_extra='{}' WHERE id=42")
    cards=recommendation.candidates('a',{'kind':'publication','categories':['industry']})['items']
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
