"""실제 loopback PostgreSQL에서 열람 집계와 전체 삭제를 검증한다."""
import importlib
from contextlib import contextmanager
from pathlib import Path
import uuid

import pytest
from psycopg2 import errors
from test_activity_recommendations import modules
from test_dashboard_storage import repo

__all__ = ['repo', 'modules']


def record(activity, cursor, owner='a', key='publication:42'):
    session = activity.create_session(owner, {'content_key': key, 'format': 'letter'})
    with cursor() as cur:
        cur.execute("UPDATE user_content_sessions SET started_at=now()-interval '12 seconds',updated_at=now()-interval '12 seconds' WHERE id=%s", (session['session_id'],))
    payload = {'session_id': session['session_id'], 'event_id': str(uuid.uuid4()),
               'session_seq': 1, 'event_type': 'progress', 'visible_ms': 10000}
    assert activity.accept_event(owner, payload)['viewed']
    return session, payload


def test_measured_views_count_distinct_contents_within_90_days(modules):
    _, activity, recommendation, cursor = modules
    record(activity, cursor)
    record(activity, cursor)  # 같은 기사 재열람
    record(activity, cursor, key='issue_letter:1')
    with cursor() as cur:
        cur.execute("INSERT INTO user_readings VALUES('a',42,now())")  # 옛 기록과도 중복
        cur.execute("INSERT INTO user_content_views VALUES('a','publication:43',now()-interval '91 days','observed')")
    result = recommendation.inputs('a')
    assert {r['key']: r['n'] for r in result['categories']} == {'industry': 1, 'finance': 1}
    assert result['coverage']['news_count'] == 1 and result['coverage']['letter_count'] == 1
    assert recommendation.inputs('b')['categories'] == []
    with cursor() as cur:
        cur.execute("UPDATE user_content_views SET last_seen_at=now()-interval '91 days' WHERE content_key='publication:42'")
        cur.execute("UPDATE user_readings SET read_at=now()-interval '91 days'")
    assert recommendation.inputs('a')['categories'] == [{'key': 'finance', 'n': 1}]


def test_clear_is_owner_scoped_removes_old_sessions_and_preserves_saves(modules):
    dashboard, activity, recommendation, cursor = modules
    session, old_event = record(activity, cursor)
    record(activity, cursor, owner='b')
    dashboard.set_bookmark('a', '1', True)
    dashboard.replace_preferences('a', {'revision': 0, 'interests': [{'type': 'topic', 'key': 'rates'}]})
    follow = importlib.import_module('account_connections_repo')
    follow.set_followed('a', 'mincheol', True)
    with cursor() as cur:
        cur.execute(Path(__file__).resolve().parents[3].joinpath('docs/architecture/lens-erd-src/lens_schema_v1.57_2026-10-20.sql').read_text())
        cur.execute("INSERT INTO user_article_bookmarks(user_id,publication_id) VALUES('a',42)")
        cur.execute("INSERT INTO user_archives(user_id,article_no,content) VALUES('a','123','보존할 문장')")
        cur.execute("INSERT INTO user_readings VALUES('a',42,now()),('a',null,now()-interval '100 days'),('b',42,now())")
        cur.execute("INSERT INTO user_content_completions(session_id,user_id,content_key,group_key,format,completed_at,completed_day,rule_version,first_completion) VALUES(%s,'a','publication:42','publication:42','letter',now(),current_date,'completion-v1',true)", (session['session_id'],))
        cur.execute("INSERT INTO user_content_first_completions VALUES('a','publication:42',%s,now())", (session['session_id'],))
        cur.execute("INSERT INTO user_daily_stamps VALUES('a',current_date,now(),%s)", (session['session_id'],))
        cur.execute("INSERT INTO user_weekly_badges VALUES('a',current_date,'steady_week',now(),'completion-v1')")
    assert activity.clear_history('a', {'confirm': True})['deleted']
    assert activity.clear_history('a', {'confirm': True})['deleted']  # 재시도도 안전
    assert recommendation.inputs('a')['categories'] == []
    assert recommendation.inputs('a')['coverage'] == {'unmatched': 0, 'news_count': 0, 'letter_count': 0}
    assert recommendation.inputs('b')['categories'] == [{'key': 'industry', 'n': 1}]
    for payload in (old_event, {**old_event, 'event_id': str(uuid.uuid4()), 'session_seq': 2, 'visible_ms': 20000}):
        with pytest.raises(activity.DashboardError) as error:
            activity.accept_event('a', payload)
        assert error.value.status == 404  # 지우기 전 탭·이벤트 재전송이 기록을 부활시키지 않는다.
    with cursor() as cur:
        for table in ('user_content_views', 'user_readings', 'user_content_sessions', 'user_content_events',
                      'user_content_completions', 'user_content_first_completions', 'user_daily_stamps', 'user_weekly_badges'):
            cur.execute(f'SELECT count(*) AS n FROM {table} WHERE user_id=%s', ('a',))
            assert cur.fetchone()['n'] == 0
        for table in ('user_article_bookmarks', 'user_letter_bookmarks', 'user_archives', 'user_followed_editors'):
            cur.execute(f'SELECT count(*) AS n FROM {table} WHERE user_id=%s', ('a',))
            assert cur.fetchone()['n'] == 1
    assert dashboard.get_preferences('a')['interests'] == [{'type': 'topic', 'key': 'rates'}]
    record(activity, cursor)  # 이후 새로 읽는 콘텐츠는 다시 집계된다.
    assert recommendation.inputs('a')['categories'] == [{'key': 'industry', 'n': 1}]


@pytest.mark.parametrize('payload', [None, {}, {'confirm': False}, {'confirm': 1}, {'confirm': 'true'}, {'confirm': True, 'user_id': 'b'}])
def test_clear_requires_explicit_confirmation(modules, payload):
    _, activity, recommendation, cursor = modules
    record(activity, cursor)
    with pytest.raises(activity.DashboardError) as error:
        activity.clear_history('a', payload)
    assert error.value.code == 'CONFIRMATION_REQUIRED'
    assert recommendation.inputs('a')['categories'] == [{'key': 'industry', 'n': 1}]


def test_clear_rolls_back_every_table_if_a_delete_fails(modules):
    _, activity, recommendation, cursor = modules
    record(activity, cursor)
    with cursor() as cur:
        cur.execute("INSERT INTO user_readings VALUES('a',42,now())")
        cur.execute("""CREATE FUNCTION prevent_fixture_delete() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN RAISE EXCEPTION 'fixture delete failure'; END $$;
            CREATE TRIGGER prevent_fixture_delete BEFORE DELETE ON user_readings
            FOR EACH ROW EXECUTE FUNCTION prevent_fixture_delete()""")
    with pytest.raises(Exception, match='fixture delete failure'):
        activity.clear_history('a', {'confirm': True})
    assert recommendation.inputs('a')['categories'] == [{'key': 'industry', 'n': 1}]
    with cursor() as cur:
        for table in ('user_content_views', 'user_content_sessions', 'user_content_events', 'user_readings'):
            cur.execute(f'SELECT count(*) AS n FROM {table} WHERE user_id=%s', ('a',))
            assert cur.fetchone()['n'] == 1


def test_clear_works_with_restricted_role_and_requires_legacy_delete(modules, monkeypatch):
    _, activity, _, cursor = modules
    record(activity, cursor)
    record(activity, cursor, owner='b')
    with cursor() as cur:
        cur.execute("INSERT INTO user_readings VALUES('a',42,now())")
    role = 'history_fixture_' + uuid.uuid4().hex
    tables = ('user_daily_stamps', 'user_content_first_completions', 'user_weekly_badges',
              'user_content_completions', 'user_content_events', 'user_content_sessions',
              'user_content_views', 'user_readings')
    with cursor() as cur:
        cur.execute(f'CREATE ROLE {role} NOLOGIN')
        cur.execute(f'GRANT USAGE ON SCHEMA public TO {role}')
        cur.execute(f'GRANT SELECT, UPDATE ON users TO {role}')
        cur.execute(f"GRANT SELECT, DELETE ON {','.join(tables)} TO {role}")
        cur.execute(f'REVOKE DELETE ON user_readings FROM {role}')
    @contextmanager
    def restricted_cursor():
        with cursor() as cur:
            cur.execute(f'SET LOCAL ROLE {role}')
            yield cur
    monkeypatch.setattr(activity, 'get_cursor', restricted_cursor)
    try:
        with pytest.raises(errors.InsufficientPrivilege):
            activity.clear_history('a', {'confirm': True})
        with cursor() as cur:
            cur.execute("SELECT count(*) AS n FROM user_content_views WHERE user_id='a'")
            assert cur.fetchone()['n'] == 1  # 권한이 부족하면 먼저 실행한 DELETE도 모두 롤백한다.
            cur.execute(f'GRANT DELETE ON user_readings TO {role}')
        assert activity.clear_history('a', {'confirm': True})['deleted']
        with cursor() as cur:
            cur.execute('SELECT user_id FROM user_content_views')
            assert [row['user_id'] for row in cur.fetchall()] == ['b']
            cur.execute("SELECT count(*) AS n FROM user_readings WHERE user_id='a'")
            assert cur.fetchone()['n'] == 0
    finally:
        with cursor() as cur:
            cur.execute(f'DROP OWNED BY {role}')
            cur.execute(f'DROP ROLE {role}')
