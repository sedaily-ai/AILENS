"""명시한 PG 연결만 사용. SQL 복사와 적용을 분리하고 첫 오류에서 중단한다."""
import argparse
import os
from pathlib import Path
import subprocess

import psycopg2

SERVICE = Path(__file__).resolve().parents[1]
MIGRATIONS = SERVICE / 'migrations'
ACCOUNT_TABLES = {
    'users': 'SELECT,INSERT,UPDATE', 'user_archives': 'SELECT,INSERT,DELETE',
    'user_readings': 'SELECT,DELETE',
    'publications': 'SELECT', 'issue_letters': 'SELECT', 'letter_editors': 'SELECT',
    'issue_letter_editors': 'SELECT', 'issue_letter_categories': 'SELECT', 'media_assets': 'SELECT',
    'user_lens_preferences': 'SELECT,INSERT,UPDATE,DELETE',
    'user_letter_bookmarks': 'SELECT,INSERT,UPDATE,DELETE',
    'user_article_bookmarks': 'SELECT,INSERT,UPDATE,DELETE',
    'user_content_views': 'SELECT,INSERT,UPDATE,DELETE',
    'user_content_sessions': 'SELECT,INSERT,UPDATE,DELETE',
    'user_content_events': 'SELECT,INSERT,UPDATE,DELETE',
    'user_content_completions': 'SELECT,INSERT,UPDATE,DELETE',
    'user_content_first_completions': 'SELECT,INSERT,UPDATE,DELETE',
    'user_daily_stamps': 'SELECT,INSERT,UPDATE,DELETE',
    'user_weekly_badges': 'SELECT,INSERT,UPDATE,DELETE',
    'user_notification_preferences': 'SELECT,INSERT,UPDATE,DELETE',
    'user_notification_consents': 'SELECT,INSERT,UPDATE,DELETE',
    'user_notification_consent_events': 'SELECT,INSERT,UPDATE,DELETE',
    'user_push_subscriptions': 'SELECT,INSERT,UPDATE,DELETE',
    'user_notification_deliveries': 'SELECT,INSERT,UPDATE,DELETE',
    'user_notification_delivery_targets': 'SELECT,INSERT,UPDATE,DELETE',
    'user_followed_editors': 'SELECT,INSERT,UPDATE,DELETE',
    'user_lens_imports': 'SELECT,INSERT',
    'content_reward_groups': 'SELECT', 'content_followup_links': 'SELECT',
    'content_completion_coverage': 'SELECT',
}


def connection(app=False):
    keys = ('LENS_PG_HOST', 'LENS_PG_DATABASE', 'LENS_PG_USER', 'LENS_PG_PASSWORD') if app else ('PGHOST', 'PGDATABASE', 'PGUSER', 'PGPASSWORD')
    for key in keys:
        if not os.environ.get(key):
            raise RuntimeError(f'필수 연결 환경변수 누락: {key}')
    return psycopg2.connect(host=os.environ[keys[0]], dbname=os.environ[keys[1]],
                            user=os.environ[keys[2]], password=os.environ[keys[3]],
                            port=int(os.environ.get('PGPORT') or '5432'),  # 템플릿의 빈 PGPORT= 도 기본 포트
                            connect_timeout=5, options='-c lock_timeout=5000 -c statement_timeout=120000')


def files():
    root = MIGRATIONS if MIGRATIONS.exists() and list(MIGRATIONS.glob('*.sql')) else SERVICE.parents[1] / 'docs/architecture/lens-erd-src'
    result = []
    for version in range(48, 58):  # v1.57 저장한 기사까지
        matches = list(root.glob(f'lens_schema_v1.{version}_*.sql'))
        if len(matches) != 1:
            raise RuntimeError(f'v1.{version} SQL 누락/중복')
        result.append(matches[0])
    return result


def check(conn):
    with conn.cursor() as cur:
        for table, privileges in ACCOUNT_TABLES.items():
            cur.execute('SELECT to_regclass(%s)', ('public.' + table,))
            if cur.fetchone()[0] is None:
                raise RuntimeError(f'필수 테이블 누락: {table}')
            for privilege in privileges.split(','):
                cur.execute('SELECT has_table_privilege(current_user,%s,%s)', ('public.' + table, privilege))
                if not cur.fetchone()[0]:
                    raise RuntimeError(f'앱 역할 권한 누락: {table}/{privilege}')
        for table in ('content_followup_links', 'content_reward_groups'):
            for privilege in ('INSERT', 'UPDATE', 'DELETE'):
                cur.execute('SELECT has_table_privilege(current_user,%s,%s)', ('public.' + table, privilege))
                if cur.fetchone()[0]:
                    raise RuntimeError(f'앱 역할 편집 테이블 쓰기 권한 금지: {table}')
        cur.execute("SELECT has_sequence_privilege(current_user,'public.user_notification_consent_events_id_seq','USAGE,SELECT')")
        if not cur.fetchone()[0]:
            raise RuntimeError('앱 역할 sequence 권한 누락')
        cur.execute("SELECT p.prosecdef, p.proconfig, pg_get_userbyid(p.proowner), current_user, has_function_privilege(current_user,p.oid,'EXECUTE') FROM pg_proc p WHERE p.oid=to_regprocedure('public.lock_notification_followup_sources(text[])')")
        row = cur.fetchone()
        if not row or not row[0] or 'search_path=pg_catalog, pg_temp' not in (row[1] or []) or row[2] == row[3] or not row[4]:
            raise RuntimeError('v1.55 함수 소유권/security/search_path/EXECUTE 확인 실패')
        cur.execute("SELECT EXISTS (SELECT 1 FROM pg_proc p, LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid=to_regprocedure('public.lock_notification_followup_sources(text[])') AND a.grantee=0 AND a.privilege_type='EXECUTE')")
        if cur.fetchone()[0]:
            raise RuntimeError('PUBLIC 함수 EXECUTE 금지')
        cur.execute("SELECT has_schema_privilege(current_user,'public','CREATE')")
        if cur.fetchone()[0]:
            raise RuntimeError('앱 역할 public CREATE 금지')
        # IF NOT EXISTS로 잘못된 기존 컬럼 정의가 가려지는 주요 경계를 확인한다.
        expected = [('users', 'id', 'character varying', 64),
                    ('issue_letter_categories', 'category_slug', 'character varying', 32),
                    ('user_lens_imports', 'import_id', 'uuid', None),
                    ('media_assets', 'duration_seconds', 'numeric', None),
                    ('user_notification_preferences', 'scan_checked_at', 'timestamp with time zone', None)]
        for table, column, kind, length in expected:
            cur.execute('SELECT data_type, character_maximum_length FROM information_schema.columns WHERE table_schema=%s AND table_name=%s AND column_name=%s', ('public', table, column))
            if cur.fetchone() != (kind, length):
                raise RuntimeError(f'스키마 타입 불일치: {table}.{column}')
        cur.execute("SELECT count(*) FROM pg_constraint WHERE conrelid='public.user_lens_imports'::regclass AND conname='user_lens_imports_user_id_snapshot_hash_key'")
        if cur.fetchone()[0]:
            raise RuntimeError('v1.54 snapshot UNIQUE 제거 필요')


def baseline(conn):
    """첫 DDL 전에 기존 DB·앱 역할의 연결과 선행 스키마를 확인한다."""
    with conn.cursor() as cur:
        cur.execute("SELECT current_user, current_setting('server_version_num')::int")
        user, version = cur.fetchone()
        if user != os.environ.get('LENS_PG_USER') or user == os.environ.get('PGUSER') or version < 140000:
            raise RuntimeError('앱 역할/마이그레이션 역할/DB 버전 불일치')
        for table in ('users','publications','issue_letters','media_assets','letter_editors','issue_letter_editors','issue_letter_categories','user_archives'):
            cur.execute('SELECT to_regclass(%s)', ('public.'+table,))
            if cur.fetchone()[0] is None:
                raise RuntimeError(f'기존 선행 테이블 누락: {table}')
            for privilege in ACCOUNT_TABLES[table].split(','):
                cur.execute('SELECT has_table_privilege(current_user,%s,%s)', ('public.'+table,privilege))
                if not cur.fetchone()[0]:
                    raise RuntimeError(f'기존 선행 권한 누락: {table}/{privilege}')
        for table,column,expected in (('users','id',('character varying',64)),('issue_letter_categories','category_slug',('character varying',32))):
            cur.execute('SELECT data_type,character_maximum_length FROM information_schema.columns WHERE table_schema=%s AND table_name=%s AND column_name=%s',('public',table,column))
            if cur.fetchone()!=expected:
                raise RuntimeError(f'기존 선행 타입 불일치: {table}.{column}')
        cur.execute("SELECT has_schema_privilege(current_user,'public','CREATE')")
        if cur.fetchone()[0]:
            raise RuntimeError('앱 역할 public CREATE 금지')


def apply(backup):
    if not backup or not backup.is_file() or backup.stat().st_size == 0:
        raise RuntimeError('검증한 pg_dump custom 백업 경로 필요')
    subprocess.run(['pg_restore', '--list', str(backup)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
    for migration_key,app_key in (('PGHOST','LENS_PG_HOST'),('PGDATABASE','LENS_PG_DATABASE')):
        if not os.environ.get(migration_key) or os.environ.get(migration_key) != os.environ.get(app_key):
            raise RuntimeError('마이그레이션/앱 연결 대상 불일치 — 적용 중단')
    sql_files = files()
    with connection(app=True) as app_conn:
        baseline(app_conn)
    with connection() as conn:
        conn.autocommit = True
        with conn.cursor() as cur:
            cur.execute("SELECT current_user, current_setting('server_version_num')::int")
            user, version = cur.fetchone()
            if user == os.environ.get('LENS_PG_USER', 'lens_service_app') or version < 140000:
                raise RuntimeError('별도 마이그레이션 역할과 PostgreSQL 14 이상 필요')
            cur.execute("SELECT pg_try_advisory_lock(1448055)")
            if not cur.fetchone()[0]:
                raise RuntimeError('다른 계정 마이그레이션 진행 중')
            try:
                for path in sql_files:
                    cur.execute(path.read_text())
                    print(path.name + ': 적용 완료')
            except Exception:
                cur.execute('ROLLBACK')
                raise RuntimeError('SQL 적용 중단: 현재 파일 transaction 롤백. 앞서 완료된 버전은 보존; 수정 후 재실행') from None
            finally:
                cur.execute('SELECT pg_advisory_unlock(1448055)')
    with connection(app=True) as conn:
        check(conn)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--baseline', action='store_true')
    parser.add_argument('--backup', type=Path)
    args = parser.parse_args()
    try:
        if args.apply:
            apply(args.backup)
        else:
            with connection(app=True) as conn:
                (baseline if args.baseline else check)(conn)
        print('계정 DB 선행 검사 통과 (자료량·실행계획·복구 리허설은 별도 확인)')
    except (RuntimeError,ValueError) as exc:
        raise SystemExit(str(exc)) from None
    except Exception:
        # psycopg 오류에 자료/연결 비밀이 포함될 수 있어 원문은 출력하지 않는다.
        raise SystemExit('계정 DB 검사/적용 실패: 연결·DDL·역할·백업을 확인한 뒤 재실행하세요.') from None
