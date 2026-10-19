"""저장한 기사(v1.57 user_article_bookmarks): 기사 화면 '저장'과 나의 LENS 내 서랍 '저장한 기사'."""
from pathlib import Path

import pytest

from test_dashboard_storage import repo
from test_activity_recommendations import modules

__all__ = ['repo', 'modules']

V157 = Path(__file__).resolve().parents[3].joinpath('docs/architecture/lens-erd-src/lens_schema_v1.57_2026-10-20.sql')


@pytest.fixture
def articles(modules):
    dashboard, _, _, cursor = modules
    # 두 번 적용해도 오류 없이 같은 결과여야 한다(운영 재적용·account_schema 재실행).
    for _ in range(2):
        with cursor() as cur:
            cur.execute(V157.read_text())
    return dashboard, cursor


def test_migration_adds_cascade_lookup_index(articles):
    _, cursor = articles
    with cursor() as cur:
        cur.execute("SELECT indexname FROM pg_indexes WHERE tablename='user_article_bookmarks' ORDER BY indexname")
        assert [r['indexname'] for r in cur.fetchall()] == ['user_article_bookmarks_owner_saved_idx', 'user_article_bookmarks_pkey', 'user_article_bookmarks_publication_idx']


def test_article_without_viewable_format_is_not_saved(articles):
    # 목록이 카드로 보여 줄 수 없는(준비된 형식이 없는) 기사는 저장하자마자 '볼 수 없음'이 되지 않게 처음부터 404다.
    r, cursor = articles
    with cursor() as cur:
        cur.execute("UPDATE renditions SET status='draft' WHERE publication_id=43")
    with pytest.raises(r.DashboardError) as error:
        r.set_article_bookmark('a', '43', True)
    assert error.value.status == 404 and r.list_article_bookmarks('a')['total'] == 0


def test_cards_and_preferences_keep_keys_old_account_api_reads(articles):
    # 계정 API만 되돌리는 롤백·배포 사이: 옛 rank()는 card['read_minutes'], 옛 추천은 preferences['minutes']를 바로 읽는다.
    from content_metadata import load_cards
    r, cursor = articles
    with cursor() as cur:
        letters = load_cards(cur, 'issue_letter', owner='a', limit=5)
        news = load_cards(cur, 'publication', owner='a', limit=5)
    assert letters and all('read_minutes' in card for card in letters)
    assert news and all(card['read_minutes'] is None for card in news)
    assert 'minutes' in r.get_preferences('a')


def test_save_list_state_and_remove_are_owner_scoped(articles):
    r, cursor = articles
    assert r.get_article_bookmark('a', '42') == {'article_id': '42', 'saved': False, 'saved_at': None}
    first = r.set_article_bookmark('a', '42', True)
    assert first['saved'] and first['saved_at']
    # 다시 눌러도 처음 저장 시각을 유지한다.
    assert r.set_article_bookmark('a', '42', True)['saved_at'] == first['saved_at']
    r.set_article_bookmark('a', '43', True)
    listed = r.list_article_bookmarks('a')
    assert listed['total'] == 2 and [i['article_id'] for i in listed['items']] == ['43', '42']
    item = next(i for i in listed['items'] if i['article_id'] == '42')
    assert item['content']['available'] and item['content']['slug'] == '123' and item['content']['title'] == '뉴스'
    assert item['content']['href'].endswith('/123') and item['content']['content_key'] == 'publication:42'
    # 다른 계정에는 보이지 않는다.
    assert r.list_article_bookmarks('b')['total'] == 0 and not r.get_article_bookmark('b', '42')['saved']
    assert r.set_article_bookmark('a', '42', False) == {'article_id': '42', 'saved': False, 'saved_at': None}
    assert [i['article_id'] for i in r.list_article_bookmarks('a')['items']] == ['43']
    # 이미 해제한 것을 다시 해제해도 오류가 아니다.
    assert not r.set_article_bookmark('a', '42', False)['saved']


def test_only_public_articles_can_be_saved_but_hidden_ones_stay_removable(articles):
    r, cursor = articles
    for missing in ('123', '999'):  # 비공개 초안, 없는 기사
        with pytest.raises(r.DashboardError) as error:
            r.set_article_bookmark('a', missing, True)
        assert error.value.status == 404
    for bad in ('0', '-1', 'abc', '١٢', '9' * 30):
        with pytest.raises(r.DashboardError) as error:
            r.get_article_bookmark('a', bad)
        assert error.value.status == 400
    r.set_article_bookmark('a', '42', True)
    with cursor() as cur:
        cur.execute("UPDATE publications SET status='draft' WHERE id=42")
    listed = r.list_article_bookmarks('a')
    assert listed['items'][0]['content'] == {'content_key': 'publication:42', 'kind': 'publication', 'available': False}
    assert not r.set_article_bookmark('a', '42', False)['saved']
    assert r.list_article_bookmarks('a')['total'] == 0


def test_cursor_pages_without_duplicates_and_rejects_letter_cursor(articles):
    r, cursor = articles
    r.set_article_bookmark('a', '42', True)
    r.set_article_bookmark('a', '43', True)
    page = r.list_article_bookmarks('a', limit=1)
    assert page['count'] == 1 and page['total'] == 2 and page['next_cursor']
    rest = r.list_article_bookmarks('a', limit=1, cursor=page['next_cursor'])
    assert [i['article_id'] for i in page['items'] + rest['items']] == ['43', '42'] and rest['next_cursor'] is None
    with pytest.raises(r.DashboardError) as error:
        r.list_article_bookmarks('b', limit=1, cursor=page['next_cursor'])
    assert error.value.code == 'INVALID_CURSOR'
    # 레터 목록 커서와 섞지 않는다.
    r.set_bookmark('a', '1', True); r.set_bookmark('a', '2', True)
    letter_cursor = r.list_bookmarks('a', limit=1)['next_cursor']
    with pytest.raises(r.DashboardError) as error:
        r.list_article_bookmarks('a', limit=1, cursor=letter_cursor)
    assert error.value.code == 'INVALID_CURSOR'
    with pytest.raises(r.DashboardError) as error:
        r.list_bookmarks('a', limit=1, cursor=page['next_cursor'])
    assert error.value.code == 'INVALID_CURSOR'


def test_account_delete_and_article_delete_cascade(articles):
    r, cursor = articles
    r.set_article_bookmark('a', '42', True)
    r.set_article_bookmark('a', '43', True)
    with cursor() as cur:
        cur.execute('DELETE FROM renditions WHERE publication_id=43')
        cur.execute('DELETE FROM rendition_blocks WHERE rendition_id=11')
        cur.execute('DELETE FROM publications WHERE id=43')
        cur.execute('SELECT count(*) AS n FROM user_article_bookmarks');assert cur.fetchone()['n'] == 1
        cur.execute("DELETE FROM users WHERE id='a'")
        cur.execute('SELECT count(*) AS n FROM user_article_bookmarks');assert cur.fetchone()['n'] == 0
