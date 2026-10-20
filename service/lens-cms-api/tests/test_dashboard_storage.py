"""실제 SQL을 loopback 격리 PostgreSQL에서 검사. 운영 환경변수/DB 모듈 사용 없음."""
import contextlib
import importlib
import os
from pathlib import Path
import sys
import types
from concurrent.futures import ThreadPoolExecutor

import psycopg2
from psycopg2.extras import RealDictCursor
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


@pytest.fixture
def repo(monkeypatch):
    # 별도 로컬 DB만 허용하며 테스트용 최소 기존 테이블을 만든다.
    if os.environ.get('LENS_ACCOUNT_TEST_DB') != 'loopback':
        pytest.skip('전용 loopback 테스트 DB를 명시해야 실행합니다.')
    def connect():
        return psycopg2.connect(host='127.0.0.1', port=5432, dbname='lens_local', user='lens_local', password='lens-local-only')
    @contextlib.contextmanager
    def cursor():
        conn = connect()
        try:
            with conn, conn.cursor(cursor_factory=RealDictCursor) as cur:
                yield cur
        finally:
            conn.close()
    with cursor() as cur:
        cur.execute('DROP SCHEMA public CASCADE; CREATE SCHEMA public')
        cur.execute("""
            CREATE TABLE users(id varchar(64) PRIMARY KEY,email varchar(255) NOT NULL UNIQUE,status varchar(16) DEFAULT 'active');
            CREATE TABLE topics(slug text PRIMARY KEY,is_active bool NOT NULL);
            CREATE TABLE publications(id bigint PRIMARY KEY,slug text UNIQUE,title text,published_at timestamptz,status text,deleted_at timestamptz);
            CREATE TABLE publication_slug_history(old_slug text PRIMARY KEY,publication_id bigint REFERENCES publications);
            CREATE TABLE issue_letters(id bigint PRIMARY KEY,slug text UNIQUE,title text,deck text,read_minutes int,published_at timestamptz,status text,deleted_at timestamptz);
            CREATE TABLE user_content_completions(session_id uuid PRIMARY KEY,user_id varchar(64),content_key varchar(96),completed_at timestamptz);
            CREATE TABLE letter_editors(id bigint PRIMARY KEY,slug text UNIQUE,name text,is_active bool);
            CREATE TABLE issue_letter_editors(letter_id bigint,editor_id bigint,position int);
            INSERT INTO letter_editors VALUES(1,'mincheol','민철',true),(2,'haeun','하은',true),(3,'inactive','비활성',false);
            CREATE TABLE issue_letter_categories(letter_id bigint,category_slug text,is_primary bool);
            INSERT INTO topics VALUES ('rates',true),('old',false);
            INSERT INTO publications VALUES(42,'123','뉴스',now(),'published',null),(123,'draft','비공개',null,'draft',null);
            INSERT INTO publication_slug_history VALUES('past',42);
            INSERT INTO issue_letters VALUES(1,'one','첫 레터','요약',3,now(),'published',null),(2,'two','둘째 레터','요약',5,now(),'published',null),(3,'hidden','비공개','숨김',3,now(),'draft',null);
            INSERT INTO issue_letter_categories VALUES(1,'finance',true),(2,'industry',true);
        """)
        cur.execute(Path(__file__).resolve().parents[3].joinpath('docs/architecture/lens-erd-src/lens_schema_v1.48_2026-10-14.sql').read_text())
        cur.execute(Path(__file__).resolve().parents[3].joinpath('docs/architecture/lens-erd-src/lens_schema_v1.53_2026-10-14.sql').read_text())
        cur.execute(Path(__file__).resolve().parents[3].joinpath('docs/architecture/lens-erd-src/lens_schema_v1.54_2026-10-14.sql').read_text())
    module = types.ModuleType('db'); module.get_cursor = cursor
    monkeypatch.setitem(sys.modules, 'db', module)
    monkeypatch.setenv('ADMIN_INTERNAL_TOKEN', 'test-local-internal')
    for name in ('dashboard_repo', 'interests_repo', 'topics_repo'):
        monkeypatch.delitem(sys.modules, name, raising=False)
    return importlib.import_module('dashboard_repo'), cursor


def test_preferences_owner_revision_and_atomic_validation(repo):
    r, cur = repo
    assert r.get_preferences('a')['revision'] == 0
    body = {'revision': 0, 'interests': [{'type':'topic','key':'rates'}]}
    first = r.replace_preferences('a', body)
    # minutes는 옛 계정 API 호환으로 DB 값을 그대로 싣는다(새 코드는 쓰지 않는다. 다음 정리 때 제거).
    assert first['revision'] == 1 and first['minutes'] == 0
    assert r.get_preferences('b')['interests'] == []
    with pytest.raises(r.DashboardError) as error:
        r.replace_preferences('a', body)
    assert error.value.status == 409
    with pytest.raises(r.DashboardError):
        r.replace_preferences('a', {**body,'revision':1,'interests':[{'type':'topic','key':'missing'}]})
    assert r.get_preferences('a') == first
    with cur() as c:
        c.execute("UPDATE users SET status='suspended' WHERE id='a'")
    with pytest.raises(r.DashboardError) as error:
        r.get_preferences('a')
    assert error.value.status == 403


def test_reading_time_removed_keeps_stored_minutes_and_inactive_interest(repo):
    r,cursor=repo
    legacy=[{'type':'topic','key':'rates'}]
    r.replace_preferences('a',{'revision':0,'interests':legacy})
    # 기존 계정에 남은 읽을 시간 값은 DB에 그대로 두고 읽거나 덮어쓰지 않는다.
    with cursor() as cur:
        cur.execute("UPDATE user_lens_preferences SET minutes=10 WHERE user_id='a'")
        cur.execute("UPDATE topics SET is_active=false WHERE slug='rates'")
    for body in ({'revision':1,'minutes':10},{'revision':1,'minutes':0,'interests':legacy},{'revision':1}):
        with pytest.raises(r.DashboardError) as error:r.replace_preferences('a',body)
        assert error.value.status==400
    # 이미 고른 비활성 주제는 다시 저장할 수 있다.
    result=r.replace_preferences('a',{'revision':1,'interests':legacy})
    # 관심만 바꾸고, 저장된 읽을 시간(10분)은 덮지 않는다. 응답의 minutes는 옛 계정 API 호환용 DB 값이다.
    assert result['interests']==legacy and result['revision']==2 and result['minutes']==10
    assert r.get_preferences('a')['minutes']==10 and r.get_preferences('b')['minutes']==0
    with pytest.raises(r.DashboardError) as error:r.replace_preferences('a',{'revision':1,'interests':[]})
    assert error.value.status==409 and r.get_preferences('a')==result
    assert r.replace_preferences('fresh',{'revision':0,'interests':[]})['interests']==[]
    with cursor() as cur:
        cur.execute("SELECT user_id,minutes FROM user_lens_preferences WHERE user_id IN ('a','fresh') ORDER BY user_id")
        assert [tuple(row.values()) for row in cur.fetchall()]==[('a',10),('fresh',0)]


def test_concurrent_initial_preferences_one_winner(repo):
    r, _ = repo
    body = {'revision':0,'interests':[]}
    def save(_):
        try:
            return r.replace_preferences('race',body)['revision']
        except r.DashboardError as error:
            return error.status
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(save, range(2))) == [1,409]


def test_inactive_existing_interest_preserved_but_new_rejected(repo):
    r, cursor = repo
    with pytest.raises(r.DashboardError):
        r.replace_preferences('a', {'revision':0,'interests':[{'type':'topic','key':'old'}]})
    r.replace_preferences('a', {'revision':0,'interests':[{'type':'topic','key':'rates'}]})
    with cursor() as cur:
        cur.execute("UPDATE topics SET is_active=false WHERE slug='rates'")
    assert r.replace_preferences('a', {'revision':1,'interests':[{'type':'topic','key':'rates'}]})['revision'] == 2


def test_bookmarks_idempotent_private_cursor_and_unpublished_removal(repo):
    r, cursor = repo
    first = r.set_bookmark('a','1',True)
    assert r.set_bookmark('a','1',True) == first
    assert r.set_bookmark('a','0001',True) == first
    r.set_bookmark('a','2',True)
    with cursor() as cur:
        cur.execute("INSERT INTO issue_letter_editors VALUES(1,1,0),(1,2,1),(1,3,2)")
    assert r.list_bookmarks('b')['total'] == 0
    with cursor() as cur:
        cur.execute("UPDATE user_letter_bookmarks SET saved_at='2026-10-14T00:00:00Z'")
    page = r.list_bookmarks('a',1)
    assert page['total'] == 2 and page['items'][0]['letter_id'] == '2'
    assert page['items'][0]['content']['available'] and 'read_minutes' not in page['items'][0]['content']
    next_page = r.list_bookmarks('a',1,page['next_cursor'])
    assert next_page['items'][0]['letter_id'] == '1' and next_page['next_cursor'] is None
    assert next_page['items'][0]['content']['editors'] == ['mincheol','haeun']
    for owner, q, token in [('b','',page['next_cursor']),('a','one',page['next_cursor']),('a','',page['next_cursor'][:-4]+'abcd')]:
        with pytest.raises(r.DashboardError) as err:
            r.list_bookmarks(owner,1,token,q)
        assert err.value.code == 'INVALID_CURSOR'
    with cursor() as cur:
        cur.execute("UPDATE issue_letters SET status='archived' WHERE id=1")
    content = next(x for x in r.list_bookmarks('a')['items'] if x['letter_id']=='1')['content']
    assert not content['available'] and 'title' not in content and 'editors' not in content
    assert r.set_bookmark('a','1',False)['saved'] is False
    assert r.set_bookmark('a','1',False)['saved'] is False
    with pytest.raises(r.DashboardError):
        r.set_bookmark('a','3',True)


def test_resolver_explicit_namespaces_and_old_slug(repo):
    r, _ = repo
    assert r.resolve('a','publication','slug','123')['content_key'] == 'publication:42'
    assert r.resolve('a','publication','slug','past')['content_key'] == 'publication:42'
    letter = r.resolve('a','issue_letter','id','1')
    assert letter['content_key'] == 'issue_letter:1' and 'read_minutes' not in letter
    for kind, typ, key in [('publication','id','123'),('publication','article_no','123'),('issue_letter','id','3'),('issue_letter','id','-1')]:
        with pytest.raises(r.DashboardError):
            r.resolve('a',kind,typ,key)


def test_internal_routes_require_token_and_preserve_conflict(repo,monkeypatch):
    r, _ = repo
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    import route_guards
    monkeypatch.setattr(route_guards,'_ADMIN_TOKEN','test-local-internal')
    monkeypatch.delitem(sys.modules,'routes_dashboard',raising=False)
    router = importlib.import_module('routes_dashboard')
    monkeypatch.setattr(router,'dashboard_repo',r)
    app=FastAPI();app.include_router(router.router)
    client=TestClient(app)
    url='/internal/personal/lens/preferences?user_id=a'
    assert client.get(url).status_code==401
    headers={'X-Internal-Token':'test-local-internal'}
    assert client.get(url,headers=headers).json()['revision']==0
    payload={'revision':0,'interests':[]}
    assert client.put(url,headers=headers,json={**payload,'minutes':5}).status_code==400
    assert client.put(url,headers=headers,json=payload).status_code==200
    conflict=client.put(url,headers=headers,json=payload)
    assert conflict.status_code==409 and conflict.json()['detail']['code']=='REVISION_CONFLICT'



def test_archive_uses_same_publication_resolver_and_returns_stable_key(repo,monkeypatch):
    r, cursor = repo
    r.replace_preferences('a', {'revision':0,'interests':[]})
    with cursor() as cur:
        cur.execute("CREATE TABLE renditions(id bigint PRIMARY KEY,publication_id bigint)")
        cur.execute("CREATE TABLE user_archives(id bigserial PRIMARY KEY,user_id varchar(64) REFERENCES users(id),article_no text REFERENCES publications(slug),rendition_id bigint,sentence_hash text,content text,saved_at timestamptz DEFAULT now(),UNIQUE(user_id,sentence_hash))")
    monkeypatch.delitem(sys.modules,'personal_repo',raising=False)
    personal=importlib.import_module('personal_repo')
    first=personal.save_archived_sentence('a','문장 1','past')
    assert first['article_no']=='123' and first['content_key']=='publication:42' and first['href']=='/lens/123'
    second=personal.save_archived_sentence('a','문장 2','publication:42')
    assert second['content_key']==first['content_key']
    assert personal.list_archived_sentences('b')==[]
    with pytest.raises(r.DashboardError):
        personal.save_archived_sentence('a','문장 3','publication:123')
