"""실제 loopback 원장: 완료·동시 지급·재열람·KST·전체 기간 조회."""
import datetime as dt
import importlib
from concurrent.futures import ThreadPoolExecutor
import uuid
import pytest
from test_activity_recommendations import modules
from test_dashboard_storage import repo


@pytest.fixture
def complete(modules,monkeypatch):
    dashboard,activity,_,cursor=modules
    with cursor() as cur:
        cur.execute('ALTER TABLE webtoon_panels ADD COLUMN id bigserial,ADD COLUMN position int')
        cur.execute("INSERT INTO renditions VALUES(20,42,'webtoon','ready')")
        cur.execute("INSERT INTO webtoon_panels(rendition_id,image_url,position) SELECT 20,'local.png',i FROM generate_series(1,5) i")
        cur.execute("INSERT INTO renditions VALUES(21,42,'podcast','ready'); INSERT INTO media_assets(rendition_id,file_url,duration_seconds) VALUES(21,'local.mp3',100)")
        cur.execute("UPDATE content_completion_coverage SET started_at='2024-01-01T00:00:00Z'")
    for name in ('reading_records_repo',):monkeypatch.delitem(__import__('sys').modules,name,raising=False)
    return dashboard,activity,importlib.import_module('reading_records_repo'),cursor


def event(activity,cursor,owner='a',key='publication:42',fmt='letter',visible=30000,**progress):
    session=activity.create_session(owner,{'content_key':key,'format':fmt})
    with cursor() as cur:
        cur.execute("UPDATE user_content_sessions SET started_at=now()-interval '60 seconds',updated_at=now()-interval '60 seconds' WHERE id=%s",(session['session_id'],))
    payload={'session_id':session['session_id'],'event_id':str(uuid.uuid4()),'session_seq':1,'event_type':'progress','visible_ms':visible,**progress}
    return session,payload


def test_reading_threshold_duplicate_same_group_and_owner(complete):
    _,a,records,cur=complete
    session,p=event(a,cur,scroll_ratio=.79)
    assert not a.accept_event('a',p)['completed']
    with cur() as c:c.execute("UPDATE user_content_sessions SET updated_at=now()-interval '6 seconds' WHERE id=%s",(session['session_id'],))
    p={**p,'event_id':str(uuid.uuid4()),'session_seq':2,'visible_ms':36000,'scroll_ratio':.8}
    result=a.accept_event('a',p)
    assert result['completed'] and result['reward']['stamp_awarded']
    assert a.accept_event('a',p)==result
    with pytest.raises(a.DashboardError) as err:a.accept_event('b',p)
    assert err.value.status==404
    session2,p2=event(a,cur,fmt='webtoon',visible=10000,viewed_panel_ids=[])
    p2['viewed_panel_ids']=session2['completion']['panel_ids'][:4]
    result2=a.accept_event('a',p2)
    assert result2['completed'] and not result2['reward']['stamp_awarded']
    data=records.activity('a')['data']
    assert data['completed_contents']==1 and data['stamp_days']==1
    assert records.activity('b')['data']['completed_contents']==0


def test_simultaneous_completion_one_stamp_and_first_record(complete):
    _,a,records,cur=complete
    pending=[event(a,cur,scroll_ratio=1)[1] for _ in range(2)]
    with ThreadPoolExecutor(max_workers=2) as pool:
        results=list(pool.map(lambda p:a.accept_event('a',p),pending))
    assert sum(r['reward']['stamp_awarded'] for r in results)==1
    with cur() as c:
        c.execute('SELECT count(*) AS n FROM user_content_first_completions');assert c.fetchone()['n']==1
        c.execute('SELECT count(*) AS n FROM user_content_completions');assert c.fetchone()['n']==2
    assert records.rewards('a')['data']['stamp_days']==1


def test_media_union_seek_excess_and_missing_duration(complete):
    _,a,_,cur=complete
    session,p=event(a,cur,fmt='podcast',visible=40000,active_ms=40000,consumed_ranges=[[0,40],[20,80]])
    result=a.accept_event('a',p)
    assert result['completed']
    _,bad=event(a,cur,fmt='podcast',visible=10000,active_ms=10000,consumed_ranges=[[0,80]])
    with pytest.raises(a.DashboardError) as err:a.accept_event('a',bad)
    assert err.value.status==400
    _,bad=event(a,cur,fmt='podcast',visible=40000,active_ms=40000,consumed_ranges=[[0,101]])
    with pytest.raises(a.DashboardError):a.accept_event('a',bad)
    with cur() as c:c.execute('UPDATE media_assets SET duration_seconds=NULL')
    session,empty=event(a,cur,fmt='podcast',visible=40000,active_ms=40000)
    assert not session['completion']['completion_enabled']
    result=a.accept_event('a',empty)
    assert not result['completed'] and result['reward']['pending_reason']=='MEDIA_METADATA_REQUIRED'


def test_letter_without_mapping_records_pending_then_explicit_mapping(complete):
    _,a,records,cur=complete
    _,p=event(a,cur,key='issue_letter:1',scroll_ratio=1)
    r=a.accept_event('a',p)
    assert r['completed'] and r['reward']['status']=='pending' and not r['awards']
    assert records.activity('a')['data']['pending_rewards']==1
    with cur() as c:c.execute("INSERT INTO content_reward_groups VALUES('issue_letter:1','publication:42',now())")
    _,p=event(a,cur,key='issue_letter:1',scroll_ratio=1)
    assert a.accept_event('a',p)['reward']['stamp_awarded']
    with cur() as c:c.execute('UPDATE issue_letter_categories SET is_primary=false WHERE letter_id=1')
    assert a.create_session('a',{'content_key':'issue_letter:1','format':'letter'})['completion']['primary_category'] is None


def test_revisit_two_saved_completed_groups_only_distinct_later_sessions(complete):
    dashboard,a,records,cur=complete
    completion=importlib.import_module('completion_repo')
    for lid in (1,2):
        with cur() as c:c.execute('INSERT INTO content_reward_groups(content_key,group_key) VALUES(%s,%s)',(f'issue_letter:{lid}',f'issue_letter:{lid}'))
        first=a.create_session('a',{'content_key':f'issue_letter:{lid}','format':'letter'})
        with cur() as c:
            c.execute('SELECT *,now() AS current FROM user_content_sessions WHERE id=%s',(first['session_id'],));s=c.fetchone()
            completion.record(c,'a',s,s['current']-dt.timedelta(hours=2))
        dashboard.set_bookmark('a',str(lid),True)
        with cur() as c:c.execute("UPDATE user_letter_bookmarks SET saved_at=now()-interval '1 hour' WHERE user_id='a' AND issue_letter_id=%s",(lid,))
        _,p=event(a,cur,key=f'issue_letter:{lid}',scroll_ratio=1)
        assert a.accept_event('a',p)['completed']
    badges={b['id']:b for b in records.rewards('a')['data']['badges']}
    assert badges['revisit_week']['earned'] and badges['revisit_week']['progress']['current']==2
    _,p=event(a,cur,key='issue_letter:1',scroll_ratio=1)
    assert not a.accept_event('a',p)['reward']['stamp_awarded']
    assert records.rewards('a')['data']['stamp_days']==1


def test_kst_boundary_badges_and_leap_year_full_sql_counts(complete):
    dashboard,a,records,cur=complete
    completion=importlib.import_module('completion_repo')
    dashboard.replace_preferences('a',{'revision':0,'minutes':0,'interests':[]})
    for i,category in enumerate(['industry','finance','culture']):
        session=a.create_session('a',{'content_key':'publication:42','format':'letter'})
        with cur() as c:
            c.execute('SELECT * FROM user_content_sessions WHERE id=%s',(session['session_id'],));s=c.fetchone()
            s['completion_rules']={**s['completion_rules'],'group_key':f'publication:{100+i}','primary_category':category}
            now=dt.datetime(2026,10,11+i,15,0,tzinfo=dt.timezone.utc) # KST 월/화/수
            completion.record(c,'a',s,now)
    week=records.rewards('a','2026-10-12')['data']
    assert [s['date'] for s in week['stamps']]==['2026-10-12','2026-10-13','2026-10-14']
    assert all(b['earned'] for b in week['badges'] if b['id']!='revisit_week')
    with cur() as c:
        c.execute("INSERT INTO user_content_sessions(id,user_id,content_key,format) SELECT md5(('history-'||i)::text)::uuid,'a','publication:'||i,'letter' FROM generate_series(1,301) i")
        c.execute("INSERT INTO user_content_completions(session_id,user_id,content_key,group_key,format,completed_at,completed_day,rule_version) SELECT id,'a',content_key,content_key,format,'2024-02-29T03:00:00Z','2024-02-29','fixture' FROM user_content_sessions WHERE rule_version='visible-v1'")
    year=records.activity('a','year','2024-02-29')['data']
    assert len(year['days'])==366 and year['completed_contents']==301
    assert year['months'][1]['completed_contents']==301 and year['months'][1]['read_days']==1
    assert len(records.activity('a','month','2024-02-29')['data']['days'])==29
    for anchor in ['2024-02-30','2099-01-01','2023-12-01']:
        with pytest.raises(a.DashboardError):records.activity('a','year',anchor)


def test_legacy_sessions_never_retroactively_award_and_metadata_change_rejected(complete):
    _,a,_,cur=complete
    session,p=event(a,cur,scroll_ratio=1)
    with cur() as c:c.execute("UPDATE user_content_sessions SET completion_rules='{}',rule_version='visible-v1' WHERE id=%s",(session['session_id'],))
    r=a.accept_event('a',p)
    assert r['viewed'] and not r['completed'] and not r['awards']
    _,p=event(a,cur,scroll_ratio=1)
    with cur() as c:c.execute("INSERT INTO content_reward_groups(content_key,group_key) VALUES('publication:42',NULL)")
    with pytest.raises(a.DashboardError) as err:a.accept_event('a',p)
    assert err.value.code=='CONTENT_CHANGED'


def test_completion_failure_rolls_back_stamp_and_event(complete,monkeypatch):
    _,a,_,cur=complete
    completion=importlib.import_module('completion_repo')
    original=completion.weekly_progress
    def failed(*args):raise RuntimeError('fixture rollback')
    _,payload=event(a,cur,scroll_ratio=1)
    monkeypatch.setattr(completion,'weekly_progress',failed)
    with pytest.raises(RuntimeError):a.accept_event('a',payload)
    with cur() as c:
        for table in ('user_content_completions','user_content_first_completions','user_daily_stamps','user_content_events'):
            c.execute(f'SELECT count(*) AS n FROM {table}');assert c.fetchone()['n']==0
    monkeypatch.setattr(completion,'weekly_progress',original)
    assert a.accept_event('a',payload)['reward']['stamp_awarded']


def test_registered_media_duration_admin_write_and_year_boundary(complete):
    _,a,records,cur=complete
    admin=importlib.import_module('admin_posts_repo')
    for bad in [True,0,-1,float('nan'),float('inf'),86401,'120']:
        with pytest.raises(ValueError):admin._media_duration({'duration_seconds':bad})
    with cur() as c:
        c.execute('ALTER TABLE media_assets ADD COLUMN media_type text,ADD COLUMN thumbnail_url text,ADD COLUMN transcript text; CREATE UNIQUE INDEX fixture_media_unique ON media_assets(rendition_id)')
        c.execute("INSERT INTO renditions VALUES(22,43,'video','ready')")
        admin._write_format_body(c,22,'video',{'video_url':'local.mp4','duration_seconds':120},None,0)
    session=a.create_session('a',{'content_key':'publication:43','format':'video'})
    assert session['completion']['duration_seconds']==120 and session['completion']['completion_enabled']
    _,payload=event(a,cur,key='publication:43',fmt='video',visible=50000,active_ms=50000,consumed_ranges=[[0,96]])
    assert a.accept_event('a',payload)['completed']
    with cur() as c:c.execute("UPDATE media_assets SET file_url='https://www.youtube.com/watch?v=fixture' WHERE rendition_id=22")
    pending=a.create_session('a',{'content_key':'publication:43','format':'video'})
    assert not pending['completion']['completion_enabled'] and pending['completion']['pending_reason']=='DIRECT_MEDIA_REQUIRED'
    assert records.anchor_date('2025-12-29',dt.date(2026,1,1),dt.date(2026,1,1),True)==dt.date(2025,12,29)
    with pytest.raises(a.DashboardError):records.anchor_date('2025-12-22',dt.date(2026,1,1),dt.date(2026,1,1),True)


def test_body_edit_invalidates_session_and_empty_letter_unavailable(complete):
    _,a,_,cur=complete
    _,payload=event(a,cur,scroll_ratio=1)
    with cur() as c:c.execute("UPDATE rendition_blocks SET content='[\"다른 본문\"]' WHERE rendition_id=10")
    with pytest.raises(a.DashboardError) as err:a.accept_event('a',payload)
    assert err.value.code=='CONTENT_CHANGED'
    with cur() as c:c.execute('DELETE FROM issue_letter_sections WHERE letter_id=1')
    with pytest.raises(a.DashboardError) as err:a.create_session('a',{'content_key':'issue_letter:1','format':'letter'})
    assert err.value.status==400
