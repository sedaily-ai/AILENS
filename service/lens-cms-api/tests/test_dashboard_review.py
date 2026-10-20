"""대시보드 전체 리뷰의 재현 사례. 전용 loopback fixture만 사용.

알림 워커 재현 사례는 워커와 함께 지웠다(2026-10-20 기능 다이어트로 알림 워커 제거).
"""
import importlib
from contextlib import contextmanager
import sys
from test_dashboard_storage import repo
from test_activity_recommendations import modules
import pytest


def test_empty_bodies_not_recommended(modules):
    _,_,recommendation,cur=modules
    with cur() as c:
        c.execute("UPDATE rendition_blocks SET content='   ',image_url=NULL")
        c.execute("UPDATE issue_letter_sections SET paragraphs='[[\"   \"]]'")
    assert recommendation.candidates('a',{'kind':'publication','categories':['industry']})['items']==[]
    assert recommendation.candidates('a',{'kind':'issue_letter','categories':['finance']})['items']==[]


def test_future_content_not_recommended(modules):
    _,_,recommendation,cur=modules
    with cur() as c:
        c.execute("UPDATE publications SET published_at=now()+interval '1 day' WHERE id=43")
        c.execute("UPDATE issue_letters SET published_at=now()+interval '1 day'")
    assert [r['id'] for r in recommendation.candidates('a',{'kind':'publication','categories':['industry']})['items']]==['42']
    assert recommendation.candidates('a',{'kind':'issue_letter','categories':['finance']})['items']==[]


def test_legacy_rendition_sentence_resolves_source_in_dashboard(modules):
    _,_,recommendation,cur=modules
    with cur() as c:c.execute("INSERT INTO user_archives(user_id,rendition_id,content) VALUES('a',10,'담은 문장')")
    row=recommendation.inputs('a')['recent_sentences'][0]
    assert row['content_key']=='publication:42' and row['href']=='/lens/123'


def test_rediscovery_samples_all_saved_sentences_with_owner_isolation(modules,monkeypatch):
    _,_,recommendation,cursor=modules
    assert recommendation.inputs('a')['recent_sentences']==[]
    with cursor() as cur:
        cur.execute("INSERT INTO user_archives(user_id,article_no,content) VALUES('a','123','문장 하나'),('a','123','문장 둘'),('b','123','다른 계정 문장')")
    data=recommendation.inputs('a')
    assert data['sentence_total']==2
    assert {row['text'] for row in data['recent_sentences']}=={'문장 하나','문장 둘'}
    with cursor() as cur:
        cur.execute("INSERT INTO user_archives(user_id,article_no,content,saved_at) SELECT 'a','123','오래된 문장 '||n,now()-interval '1 year' FROM generate_series(1,40) n")
    @contextmanager
    def seeded_cursor():
        with cursor() as cur:
            cur.execute('SELECT setseed(0.42)')
            yield cur
    monkeypatch.setattr(recommendation,'get_cursor',seeded_cursor)
    data=recommendation.inputs('a')
    assert data['sentence_total']==42 and len(data['recent_sentences'])==3
    assert len({row['id'] for row in data['recent_sentences']})==3
    assert any(row['text'].startswith('오래된 문장') for row in data['recent_sentences'])
    assert all(row['user_id']=='a' and row['href']=='/lens/123' for row in data['recent_sentences'])
    assert [row['text'] for row in recommendation.inputs('b')['recent_sentences']]==['다른 계정 문장']
    assert recommendation.inputs('a',include_recent=False)['recent_sentences']==[]


def test_blocked_account_cannot_use_archive_crud(modules,monkeypatch):
    dashboard,_,_,cur=modules
    dashboard.replace_preferences('a',{'revision':0,'interests':[]})
    with cur() as c:c.execute("UPDATE users SET status='blocked' WHERE id='a'")
    monkeypatch.delitem(__import__('sys').modules,'personal_repo',raising=False)
    personal=importlib.import_module('personal_repo')
    for operation in (lambda:personal.list_archived_sentences('a'),lambda:personal.save_archived_sentence('a','문장','123'),lambda:personal.delete_archived_sentence('a','1')):
        with pytest.raises(dashboard.DashboardError) as error:operation()
        assert error.value.status==403


def test_future_or_missing_publication_date_is_unavailable_in_saved_list(repo):
    r,cur=repo;r.set_bookmark('a','1',True)
    for when in ("now()+interval '1 day'",'NULL'):
        with cur() as c:c.execute(f'UPDATE issue_letters SET published_at={when} WHERE id=1')
        row=r.list_bookmarks('a')['items'][0]['content']
        assert not row['available'] and 'title' not in row
        with pytest.raises(r.DashboardError) as error:r.resolve('a','issue_letter','id','1')
        assert error.value.status==404


def test_existing_reading_history_and_save_keep_articles_alias(repo,monkeypatch):
    dashboard,cur=repo
    dashboard.replace_preferences('a',{'revision':0,'interests':[]})
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
