"""열람 전용(view-only-v1) 이용 신호 계약. 실제 loopback DB.

추천은 10초 열람(viewed)만 쓴다. 완료 판정·완료 기록·리워드 평가는 하지 않고,
예전 웹이 읽는 응답 키(completion·completed·reward·awards)는 빈 값으로 남긴다.
기존 완료·리워드 원장의 행은 그대로 둔다.
"""
import importlib
import uuid
import pytest
from test_activity_recommendations import modules
from test_dashboard_storage import repo

__all__ = ['repo', 'modules']

LEGACY_COMPLETION = {'completion_enabled':False,'group_key':None,'panel_ids':[],'panel_urls':[],'duration_seconds':None,'media_url':None,'pending_reason':None}
LEDGERS = ('user_content_completions','user_content_first_completions','user_daily_stamps','user_weekly_badges')


@pytest.fixture
def formats(modules):
    # 뉴스 42에 웹툰 컷 5개와 듣기 파일(100초)을 붙인다. 형식이 달라도 열람만 판정하는지 본다.
    dashboard,activity,recommendation,cursor=modules
    with cursor() as cur:
        cur.execute('ALTER TABLE webtoon_panels ADD COLUMN id bigserial,ADD COLUMN position int')
        cur.execute("INSERT INTO renditions VALUES(20,42,'webtoon','ready')")
        cur.execute("INSERT INTO webtoon_panels(rendition_id,image_url,position) SELECT 20,'local.png',i FROM generate_series(1,5) i")
        cur.execute("INSERT INTO renditions VALUES(21,42,'podcast','ready'); INSERT INTO media_assets(rendition_id,file_url,duration_seconds) VALUES(21,'local.mp3',100)")
    return dashboard,activity,recommendation,cursor


def event(activity,cursor,owner='a',key='publication:42',fmt='letter',visible=30000,**legacy):
    session=activity.create_session(owner,{'content_key':key,'format':fmt})
    with cursor() as cur:
        cur.execute("UPDATE user_content_sessions SET started_at=now()-interval '60 seconds',updated_at=now()-interval '60 seconds' WHERE id=%s",(session['session_id'],))
    payload={'session_id':session['session_id'],'event_id':str(uuid.uuid4()),'session_seq':1,'event_type':'progress','visible_ms':visible,**legacy}
    return session,payload


def counts(cursor):
    with cursor() as cur:
        result={}
        for table in LEDGERS:
            cur.execute(f'SELECT count(*) AS n FROM {table}');result[table]=cur.fetchone()['n']
        return result


def test_session_keeps_empty_legacy_completion_shape_without_rules(formats):
    _,a,_,cur=formats
    for fmt in ('letter','webtoon','podcast'):
        session=a.create_session('a',{'content_key':'publication:42','format':fmt})
        assert set(session)=={'session_id','content_key','format','started_at','rule_version','completion','reward_evaluation_enabled'}
        assert session['completion']==LEGACY_COMPLETION and session['rule_version']=='view-only-v1'
        assert session['reward_evaluation_enabled'] is False
        with cur() as c:
            c.execute('SELECT completion_rules,rule_version FROM user_content_sessions WHERE id=%s',(session['session_id'],))
            row=c.fetchone()
        assert row['completion_rules']=={} and row['rule_version']=='view-only-v1'
    with pytest.raises(a.DashboardError) as err:a.create_session('a',{'content_key':'publication:42','format':'video'})
    assert err.value.status==400


def test_visible_only_report_is_viewed_after_ten_seconds(formats):
    _,a,_,cur=formats
    session=a.create_session('a',{'content_key':'publication:42','format':'letter'})
    with cur() as c:c.execute("UPDATE user_content_sessions SET started_at=now()-interval '12 seconds',updated_at=now()-interval '12 seconds' WHERE id=%s",(session['session_id'],))
    first={'event_id':str(uuid.uuid4()),'session_id':session['session_id'],'session_seq':1,'event_type':'progress','visible_ms':5000}
    early=a.accept_event('a',first)
    assert early['accepted'] and not early['viewed'] and early['completed'] is False
    with cur() as c:
        c.execute('SELECT count(*) AS n FROM user_content_views');assert c.fetchone()['n']==0
        c.execute("UPDATE user_content_sessions SET updated_at=now()-interval '6 seconds' WHERE id=%s",(session['session_id'],))
    second={**first,'event_id':str(uuid.uuid4()),'session_seq':2,'visible_ms':10000}
    result=a.accept_event('a',second)
    assert set(result)=={'accepted','event_id','session_id','session_seq','viewed','completed','reward','awards','rule_version','reward_evaluation_enabled'}
    assert result['viewed'] and result['completed'] is False and result['awards']==[]
    assert result['reward']=={'status':'disabled','stamp_awarded':False,'pending_reason':None}
    assert result['rule_version']=='view-only-v1' and result['reward_evaluation_enabled'] is False
    assert a.accept_event('a',second)==result
    with cur() as c:
        c.execute("SELECT count(*) AS n FROM user_content_views WHERE user_id='a' AND content_key='publication:42'");assert c.fetchone()['n']==1


@pytest.mark.parametrize(('fmt','legacy'),[
    ('letter',{'scroll_ratio':1,'active_ms':30000}),
    ('letter',{'scroll_ratio':5,'active_ms':-1,'viewed_panel_ids':'bad','consumed_ranges':[[9,1]]}),
    ('webtoon',{'scroll_ratio':0,'viewed_panel_ids':['1','2','3','4','5','not-a-panel'],'consumed_ranges':[]}),
    ('podcast',{'active_ms':999999999,'consumed_ranges':[[0,40],[20,9999]],'scroll_ratio':'bad'}),
])
def test_legacy_progress_fields_are_accepted_and_ignored(formats,fmt,legacy):
    _,a,_,cur=formats
    session,payload=event(a,cur,fmt=fmt,**legacy)
    result=a.accept_event('a',payload)
    assert result['accepted'] and result['viewed'] and result['completed'] is False
    assert a.accept_event('a',payload)==result
    with cur() as c:
        c.execute('SELECT visible_ms,active_ms,scroll_ratio,viewed_panel_ids,consumed_ranges FROM user_content_sessions WHERE id=%s',(session['session_id'],))
        row=c.fetchone()
    # 완료용 값은 저장하지 않는다. 열 기본값 그대로다.
    assert row['visible_ms']==30000 and row['active_ms']==0 and row['scroll_ratio']==0
    assert row['viewed_panel_ids']==[] and row['consumed_ranges']==[]


def test_unknown_keys_and_server_time_limits_still_rejected(formats):
    _,a,_,cur=formats
    _,payload=event(a,cur)
    for bad in ({**payload,'completed':True},{**payload,'user_id':'b'}):
        with pytest.raises(a.DashboardError) as err:a.accept_event('a',bad)
        assert err.value.status==400
    with pytest.raises(a.DashboardError) as err:a.accept_event('a',{**payload,'visible_ms':120000})
    assert err.value.status==400
    with pytest.raises(a.DashboardError) as err:a.accept_event('b',payload)
    assert err.value.status==404


def test_never_completes_and_existing_ledgers_stay(formats):
    _,a,_,cur=formats
    old,_=event(a,cur)
    with cur() as c:
        # 배포 전 완료 판정으로 쌓인 원장 행.
        c.execute("INSERT INTO user_content_completions(session_id,user_id,content_key,group_key,format,completed_at,completed_day,rule_version,first_completion) VALUES(%s,'a','publication:42','publication:42','letter',now()-interval '1 day',(now() AT TIME ZONE 'Asia/Seoul')::date-1,'completion-v1',true)",(old['session_id'],))
        c.execute("INSERT INTO user_content_first_completions VALUES('a','publication:42',%s,now()-interval '1 day')",(old['session_id'],))
        c.execute("INSERT INTO user_daily_stamps VALUES('a',(now() AT TIME ZONE 'Asia/Seoul')::date-1,now(),%s)",(old['session_id'],))
        c.execute("INSERT INTO user_weekly_badges VALUES('a',date_trunc('week',now())::date,'steady_week',now(),'completion-v1')")
        c.execute('SELECT * FROM user_content_completions');before=[dict(r) for r in c.fetchall()]
    assert counts(cur)=={table:1 for table in LEDGERS}
    # 예전에는 완료였던 보고들: 레터 스크롤 끝, 웹툰 전체 컷, 듣기 전체 구간.
    full_panels=[str(n) for n in range(1,6)]
    for key,fmt,legacy in [('publication:42','letter',{'scroll_ratio':1}),('issue_letter:1','letter',{'scroll_ratio':1}),
                           ('publication:42','webtoon',{'viewed_panel_ids':full_panels}),('publication:42','podcast',{'active_ms':30000,'consumed_ranges':[[0,100]]})]:
        _,payload=event(a,cur,key=key,fmt=fmt,**legacy)
        result=a.accept_event('a',payload)
        assert result['viewed'] and result['completed'] is False and result['awards']==[] and not result['reward']['stamp_awarded']
    with cur() as c:
        c.execute('SELECT * FROM user_content_completions');after=[dict(r) for r in c.fetchall()]
    assert after==before and counts(cur)=={table:1 for table in LEDGERS}


def test_viewed_report_still_feeds_category_news_and_followed_letters(formats):
    _,a,recommendation,cur=formats
    session=a.create_session('a',{'content_key':'publication:42','format':'letter'})
    with cur() as c:c.execute("UPDATE user_content_sessions SET started_at=now()-interval '12 seconds',updated_at=now()-interval '12 seconds' WHERE id=%s",(session['session_id'],))
    assert a.accept_event('a',{'event_id':str(uuid.uuid4()),'session_id':session['session_id'],'session_seq':1,'event_type':'progress','visible_ms':10000})['viewed']
    data=recommendation.inputs('a')
    assert data['categories']==[{'key':'industry','n':1}]
    # 형식 비율은 계산하지 않는다. 예전 service/backend 호환용 키만 빈 값으로 남는다.
    assert data['format_preference'] is None
    assert recommendation.inputs('b')['categories']==[]
    news=recommendation.candidates('a',{'kind':'publication','categories':['industry']})
    assert [c['content_key'] for c in news['items']]==['publication:43']
    follow=importlib.import_module('account_connections_repo')
    follow.set_followed('a','mincheol',True)
    with cur() as c:c.execute('INSERT INTO issue_letter_editors VALUES(1,1,0)')
    letters=recommendation.candidates('a',{'kind':'issue_letter','categories':[],'editors':['mincheol']})
    assert [c['id'] for c in letters['items']]==['1']


def test_registered_media_duration_admin_write_not_exposed_as_completion(formats):
    _,a,_,cur=formats
    admin=importlib.import_module('admin_posts_repo')
    for bad in [True,0,-1,float('nan'),float('inf'),86401,'120']:
        with pytest.raises(ValueError):admin._media_duration({'duration_seconds':bad})
    with cur() as c:
        c.execute('ALTER TABLE media_assets ADD COLUMN media_type text,ADD COLUMN thumbnail_url text,ADD COLUMN transcript text; CREATE UNIQUE INDEX fixture_media_unique ON media_assets(rendition_id)')
        c.execute("INSERT INTO renditions VALUES(22,43,'video','ready')")
        admin._write_format_body(c,22,'video',{'video_url':'local.mp4','duration_seconds':120},None,0)
        c.execute('SELECT duration_seconds FROM media_assets WHERE rendition_id=22');assert c.fetchone()['duration_seconds']==120
    session=a.create_session('a',{'content_key':'publication:43','format':'video'})
    assert session['completion']==LEGACY_COMPLETION
