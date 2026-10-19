"""두 번째 묶음의 실제 SQL·소유권·중복 검사. 전용 loopback DB만 사용."""
import importlib
import json
from pathlib import Path
import sys
import uuid
import pytest
from test_dashboard_storage import repo


@pytest.fixture
def modules(repo,monkeypatch):
    dashboard,cursor=repo
    with cursor() as cur:
        cur.execute("""
          DROP TABLE user_content_completions;
          ALTER TABLE publications ADD COLUMN subtitle text, ADD COLUMN category_id bigint, ADD COLUMN admin_extra jsonb DEFAULT '{}';
          ALTER TABLE topics ADD COLUMN id bigserial, ADD COLUMN name text;
          UPDATE topics SET name='금리' WHERE slug='rates';
          CREATE TABLE categories(id bigint PRIMARY KEY,slug text);
          INSERT INTO categories VALUES(1,'industry');
          CREATE TABLE renditions(id bigint PRIMARY KEY,publication_id bigint,format text,status text);
          CREATE TABLE rendition_blocks(rendition_id bigint,content text,id bigserial,position int DEFAULT 0,image_url text);
          CREATE TABLE webtoon_panels(rendition_id bigint,image_url text);
          CREATE TABLE media_assets(rendition_id bigint,file_url text);
          CREATE TABLE issue_letter_topics(letter_id bigint,topic_id bigint,is_primary bool);
          CREATE TABLE issue_letter_sections(letter_id bigint,position int,paragraphs jsonb);
          INSERT INTO issue_letter_sections VALUES(1,0,'[["본문"]]'),(2,0,'[["본문"]]');
          INSERT INTO issue_letter_topics SELECT 1,id,true FROM topics WHERE slug='rates';
          CREATE TABLE user_readings(user_id varchar(64),publication_id bigint,read_at timestamptz);
          CREATE TABLE user_archives(id bigserial PRIMARY KEY,user_id varchar(64),article_no text,rendition_id bigint,content text,saved_at timestamptz DEFAULT now());
          UPDATE publications SET category_id=1,subtitle='본문 키워드로 추천';
          INSERT INTO renditions VALUES(10,42,'letter','ready');
          INSERT INTO rendition_blocks(rendition_id,content) VALUES(10,'["본문"]');
        """)
        extra={'body_inline':{'category':'산업','lenses':[{'label':'읽기','keywords':[{'term':'반도체','explain':'등록 설명'}]}]}}
        cur.execute('UPDATE publications SET admin_extra=%s WHERE id=42',(json.dumps(extra),))
        cur.execute("INSERT INTO publications(id,slug,title,published_at,status,subtitle,category_id,admin_extra) VALUES(43,'next','키워드 없는 제목',now(),'published','요약',1,%s)",(json.dumps(extra),))
        cur.execute("INSERT INTO renditions VALUES(11,43,'letter','ready'); INSERT INTO rendition_blocks(rendition_id,content) VALUES(11,'[\"본문\"]')")
        cur.execute(Path(__file__).resolve().parents[3].joinpath('docs/architecture/lens-erd-src/lens_schema_v1.49_2026-10-14.sql').read_text())
        cur.execute(Path(__file__).resolve().parents[3].joinpath('docs/architecture/lens-erd-src/lens_schema_v1.50_2026-10-14.sql').read_text())
    for name in ('activity_repo','recommendation_repo','content_metadata'):
        monkeypatch.delitem(sys.modules,name,raising=False)
    return dashboard,importlib.import_module('activity_repo'),importlib.import_module('recommendation_repo'),cursor


def test_visible_signal_deduplicated_and_no_reward(modules):
    _,activity,recommendation,cursor=modules
    session=activity.create_session('a',{'content_key':'publication:42','format':'letter'})
    assert not session['reward_evaluation_enabled']
    payload={'event_id':str(uuid.uuid4()),'session_id':session['session_id'],'session_seq':1,'event_type':'progress','visible_ms':10000}
    with cursor() as cur:
        cur.execute("UPDATE user_content_sessions SET started_at=now()-interval '12 seconds',updated_at=now()-interval '12 seconds' WHERE id=%s",(session['session_id'],))
    result=activity.accept_event('a',payload)
    assert result['viewed'] and not result['completed'] and result['awards']==[]
    assert activity.accept_event('a',payload)==result
    with pytest.raises(activity.DashboardError) as error:activity.accept_event('b',payload)
    assert error.value.status==404
    with pytest.raises(activity.DashboardError) as error:activity.accept_event('a',{**payload,'visible_ms':11000})
    assert error.value.status==409
    with cursor() as cur:cur.execute('SELECT count(*) AS n FROM user_content_views');assert cur.fetchone()['n']==1
    data=recommendation.inputs('a')
    assert data['categories'][0]['n']==1 and 'keywords' not in data
    assert recommendation.inputs('b')['categories']==[]


def test_rejects_unsupported_expired_and_impossible_progress(modules):
    _,activity,_,cursor=modules
    with pytest.raises(activity.DashboardError):activity.create_session('a',{'content_key':'publication:42','format':'video'})
    session=activity.create_session('a',{'content_key':'publication:42','format':'letter'})
    payload={'event_id':str(uuid.uuid4()),'session_id':session['session_id'],'session_seq':1,'event_type':'progress','visible_ms':20000}
    with pytest.raises(activity.DashboardError) as error:activity.accept_event('a',payload)
    assert error.value.status==400
    with cursor() as cur:cur.execute("UPDATE user_content_sessions SET started_at=now()-interval '25 hours' WHERE id=%s",(session['session_id'],))
    with pytest.raises(activity.DashboardError) as error:activity.accept_event('a',{**payload,'visible_ms':0})
    assert error.value.code=='SESSION_EXPIRED'


def test_old_history_and_registered_keyword_metadata_are_used(modules):
    dashboard,_,recommendation,cursor=modules
    dashboard.replace_preferences('a',{'revision':0,'interests':[]})
    with cursor() as cur:
        cur.execute("INSERT INTO user_content_views VALUES('a','publication:42',now(),'observed')")
        cur.execute("INSERT INTO user_readings VALUES('a',42,now()),('a',null,now())")
    data=recommendation.inputs('a')
    assert data['categories'][0]['n']==1 and data['coverage']['unmatched']==1
    candidates=recommendation.candidates('a',{'kind':'publication','categories':['industry']})
    assert [row['content_key'] for row in candidates['items']]==['publication:43']
    assert '반도체' in candidates['items'][0]['keywords']
    assert '반도체' not in candidates['items'][0]['title']
    assert candidates['items'][0]['formats']==['letter']


def test_letter_category_matching_accepts_actual_varchar_schema(modules):
    _,_,recommendation,cursor=modules
    # v1.38의 실제 category_slug는 VARCHAR(32)이며 최소 fixture의 TEXT와 다르다.
    with cursor() as cur:
        cur.execute('ALTER TABLE issue_letter_categories ALTER COLUMN category_slug TYPE varchar(32)')
    category=recommendation.candidates('a',{'kind':'issue_letter','categories':['finance']})
    assert [row['content_key'] for row in category['items']]==['issue_letter:1']


def test_saved_sentence_words_never_match_and_source_stays_excluded(modules):
    _,_,recommendation,cursor=modules
    with cursor() as cur:
        cur.execute("INSERT INTO user_archives(user_id,article_no,content) VALUES('a','123','10월 반도체가 미래를 바꿉니다') RETURNING id");sid=str(cur.fetchone()['id'])
    # 저장 문장 관련 글(문장 단어 일치)은 제거됐다. 입력에 문장 단어가 없고, 문장을 넣어 부르는 길도 없다.
    assert 'sentence_words' not in recommendation.inputs('a')
    with pytest.raises(TypeError):recommendation.inputs('a',sid)
    # 예전 service/backend가 보내는 terms는 받기만 하고 쓰지 않는다: '10월'·'반도체' 단어만으로는 후보가 생기지 않는다.
    for kind in ('publication','issue_letter'):
        assert recommendation.candidates('a',{'kind':kind,'categories':[],'terms':['10월','반도체','레터']})['items']==[]
    # 문장을 담은 원문은 계속 뉴스 추천 후보에서 빠지고, 문장을 지우면 다시 후보가 된다.
    assert [row['content_key'] for row in recommendation.candidates('a',{'kind':'publication','categories':['industry']})['items']]==['publication:43']
    with cursor() as cur:cur.execute('DELETE FROM user_archives WHERE id=%s',(sid,))
    assert {row['content_key'] for row in recommendation.candidates('a',{'kind':'publication','categories':['industry']})['items']}=={'publication:42','publication:43'}


def test_no_view_before_server_threshold_and_sequence_is_monotonic(modules):
    _,activity,_,cursor=modules
    session=activity.create_session('a',{'content_key':'publication:42','format':'letter'})
    payload={'event_id':str(uuid.uuid4()),'session_id':session['session_id'],'session_seq':1,'event_type':'progress','visible_ms':10000}
    with cursor() as cur:
        cur.execute("UPDATE user_content_sessions SET started_at=now()-interval '9 seconds',updated_at=now()-interval '9 seconds' WHERE id=%s",(session['session_id'],))
    assert not activity.accept_event('a',payload)['viewed']
    with cursor() as cur:
        cur.execute('SELECT count(*) AS n FROM user_content_views');assert cur.fetchone()['n']==0
    with pytest.raises(activity.DashboardError) as error:
        activity.accept_event('a',{**payload,'event_id':str(uuid.uuid4()),'session_seq':3})
    assert error.value.code=='SEQUENCE_CONFLICT'
    with pytest.raises(activity.DashboardError) as error:
        activity.accept_event('a',{**payload,'event_id':str(uuid.uuid4()),'session_seq':2})
    assert error.value.status==429
    with cursor() as cur:
        cur.execute("UPDATE user_content_sessions SET started_at=now()-interval '20 seconds',updated_at=now()-interval '6 seconds' WHERE id=%s",(session['session_id'],))
    with pytest.raises(activity.DashboardError) as error:
        activity.accept_event('a',{**payload,'event_id':str(uuid.uuid4()),'session_seq':2,'visible_ms':9000})
    assert error.value.status==400
    with cursor() as cur:cur.execute("UPDATE publications SET status='draft' WHERE id=42")
    with pytest.raises(activity.DashboardError) as error:
        activity.accept_event('a',{**payload,'event_id':str(uuid.uuid4()),'session_seq':2,'visible_ms':15000})
    assert error.value.status==404


def test_no_candidates_without_actual_ready_content(modules):
    _,_,recommendation,cursor=modules
    with cursor() as cur:
        cur.execute("UPDATE renditions SET status='processing' WHERE publication_id=43")
    assert [row['content_key'] for row in recommendation.candidates('a',{'kind':'publication','categories':['industry']})['items']]==['publication:42']
    with cursor() as cur:cur.execute('DELETE FROM rendition_blocks')
    result=recommendation.candidates('a',{'kind':'publication','categories':['industry']})
    assert result['items']==[] and result['latest']==[]


def test_session_creation_rate_limit_serialized_per_account(modules):
    dashboard,activity,_,cursor=modules
    dashboard.replace_preferences('a',{'revision':0,'interests':[]})
    with cursor() as cur:
        cur.execute("INSERT INTO user_content_sessions(id,user_id,content_key,format) SELECT md5(i::text)::uuid,'a','publication:42','letter' FROM generate_series(1,500) i")
    with pytest.raises(activity.DashboardError) as error:
        activity.create_session('a',{'content_key':'publication:42','format':'letter'})
    assert error.value.status==429
    assert activity.create_session('b',{'content_key':'publication:42','format':'letter'})['session_id']
