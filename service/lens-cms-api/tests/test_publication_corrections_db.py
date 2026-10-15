"""정정 CLI를 별도 loopback PostgreSQL에서만 실행한다. 운영 연결은 사용하지 않는다."""
import contextlib
import getpass
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import sys
import types

import psycopg2
from psycopg2.extras import Json, RealDictCursor
import pytest

from test_publication_corrections import module, PLAN, sample

ROOT = Path(__file__).resolve().parents[1]
PLAN_FILE = ROOT / 'seed/2026-10-15-audit-corrections.json'


@pytest.fixture
def local_db(monkeypatch):
    # 기존 계정 테스트 DB·기본 포트 대신 이 테스트 전용 클러스터만 허용한다.
    if os.environ.get('LENS_CORRECTIONS_TEST_PORT') != '55439':
        pytest.skip('별도 loopback 클러스터의 55439 포트를 명시해야 실행합니다.')
    kwargs = dict(host='127.0.0.1', port=55439, dbname='lens_corrections_test', user=getpass.getuser())
    @contextlib.contextmanager
    def cursor():
        conn = psycopg2.connect(**kwargs)
        try:
            with conn, conn.cursor(cursor_factory=RealDictCursor) as cur:
                yield cur
        finally:
            conn.close()
    for key, value in {'HOST':'127.0.0.1','PORT':'55439','DATABASE':'lens_corrections_test',
                       'USER':getpass.getuser(),'PASSWORD':'local-only'}.items():
        monkeypatch.setenv('LENS_PG_' + key, value)
    with cursor() as cur:
        cur.execute('DROP SCHEMA public CASCADE; CREATE SCHEMA public')
        cur.execute('''
            CREATE TABLE publications(id bigserial PRIMARY KEY,slug text UNIQUE,title text,subtitle text,
                source_url text,status text,deleted_at timestamptz,admin_extra jsonb,updated_at timestamptz DEFAULT now(),
                published_at timestamptz DEFAULT now(),created_at timestamptz DEFAULT now(),cover_image_url text);
            CREATE TABLE renditions(id bigserial PRIMARY KEY,publication_id bigint REFERENCES publications,
                format text,status text,label text,UNIQUE(publication_id,format));
            CREATE TABLE rendition_blocks(id bigserial PRIMARY KEY,rendition_id bigint REFERENCES renditions,
                position smallint,block_type text DEFAULT 'text',content text,image_url text,UNIQUE(rendition_id,position));
            CREATE TABLE media_assets(id bigserial PRIMARY KEY,rendition_id bigint UNIQUE REFERENCES renditions,
                media_type text,file_url text,thumbnail_url text,transcript text);
            CREATE TABLE webtoon_panels(id bigserial PRIMARY KEY,rendition_id bigint REFERENCES renditions,
                position smallint,image_url text,dialogue text,UNIQUE(rendition_id,position));
        ''')
        for item in PLAN:
            pub = sample(item)
            pub['admin_extra']['body_inline']['lenses'][0]['keywords'] = [
                {'term':'EPC','explain':'설계·조달·시공'}, {'term':'','explain':'잘못된 용어'}]
            cur.execute('INSERT INTO publications(slug,title,subtitle,source_url,status,admin_extra) VALUES(%s,%s,%s,%s,%s,%s) RETURNING id',
                        (pub['slug'],pub['title'],pub['subtitle'],item['source_url'],'published',Json(pub['admin_extra'])))
            pid = cur.fetchone()['id']
            for lens in pub['admin_extra']['body_inline']['lenses']:
                fmt = module.FORMATS[lens['label']]
                cur.execute('INSERT INTO renditions(publication_id,format,status,label) VALUES(%s,%s,%s,%s) RETURNING id',
                            (pid,fmt,'ready',lens['label']))
                rid = cur.fetchone()['id']
                for pos, text in enumerate(lens.get('paragraphs', [])):
                    cur.execute('INSERT INTO rendition_blocks(rendition_id,position,content) VALUES(%s,%s,%s)', (rid,pos,text))
                if 'transcript' in lens:
                    cur.execute('INSERT INTO media_assets(rendition_id,media_type,file_url,transcript) VALUES(%s,%s,%s,%s)',
                                (rid,'audio',lens['media_url'],lens['transcript']))
                for pos, image in enumerate(lens.get('images', [])):
                    cur.execute('INSERT INTO webtoon_panels(rendition_id,position,image_url,dialogue) VALUES(%s,%s,%s,%s)',
                                (rid,pos,image['url'],image['caption']))
    return cursor


def snapshot(cursor):
    with cursor() as cur:
        tables = ['publications','renditions','rendition_blocks','media_assets','webtoon_panels']
        out = {}
        for table in tables:
            cur.execute(f'SELECT * FROM {table} ORDER BY id')
            out[table] = [dict(row) for row in cur.fetchall()]
        cur.execute('SELECT last_value,is_called FROM rendition_blocks_id_seq')
        out['block_sequence'] = dict(cur.fetchone())
        return out


def test_default_cli_is_readonly_without_locks_writes_backup_or_sequence_change(local_db, monkeypatch, tmp_path, capsys):
    before = snapshot(local_db)
    real = module.correction_cursor
    @contextlib.contextmanager
    def checked(apply=False):
        assert apply is False
        with real(apply) as cur:
            cur.execute('SHOW transaction_read_only')
            assert next(iter(cur.fetchone().values())) == 'on'
            yield cur
    monkeypatch.setattr(module,'correction_cursor',checked)
    backup = tmp_path / 'must-not-exist.json'
    module.main([str(PLAN_FILE),'--backup',str(backup)])
    assert json.loads(capsys.readouterr().out)['applied'] is False
    assert not backup.exists()
    assert snapshot(local_db) == before
    with real() as cur:
        with pytest.raises(psycopg2.errors.ReadOnlySqlTransaction):
            cur.execute("UPDATE publications SET title='forbidden'")


@pytest.mark.parametrize('table,column,value', [
    ('rendition_blocks','content','편집된 문단'),
    ('media_assets','transcript','편집된 대본'),
    ('webtoon_panels','dialogue','편집된 캡션'),
    ('renditions','status','failed'),
    ('rendition_blocks','block_type','image'),
])
def test_preflight_rejects_projection_drift_before_any_write(local_db, table, column, value, tmp_path):
    with local_db() as cur:
        cur.execute(f'UPDATE {table} SET {column}=%s WHERE id=(SELECT min(id) FROM {table})',(value,))
    before = snapshot(local_db)
    with pytest.raises(ValueError):
        module.main([str(PLAN_FILE)])
    backup = tmp_path / 'rejected.json'
    with pytest.raises(ValueError):
        module.main([str(PLAN_FILE),'--apply','--expected-plan-sha',hashlib.sha256(PLAN_FILE.read_bytes()).hexdigest(),'--backup',str(backup)])
    assert not backup.exists()
    assert snapshot(local_db) == before


def test_missing_rendition_is_rejected(local_db):
    with local_db() as cur:
        cur.execute("UPDATE renditions SET format='video' WHERE id=(SELECT min(id) FROM renditions WHERE format='podcast')")
    with pytest.raises(ValueError, match='rendition'):
        module.main([str(PLAN_FILE)])


def apply_args(backup):
    return [str(PLAN_FILE),'--apply','--expected-plan-sha',hashlib.sha256(PLAN_FILE.read_bytes()).hexdigest(),'--backup',str(backup)]


def test_local_apply_keeps_unrelated_fields_and_backups_include_projections(local_db, tmp_path):
    before = snapshot(local_db)
    backup = tmp_path / 'backup.json'
    module.main(apply_args(backup))
    saved = json.loads(backup.read_text())
    assert backup.stat().st_mode & 0o777 == 0o600
    assert len(saved['publications']) == 5
    assert sum(p is not None for article in saved['projections'] for p in article) == 6
    after = snapshot(local_db)
    for old, new, item in zip(before['publications'],after['publications'],PLAN):
        expected = module.revise(old,item['changes'])
        assert {k:v for k,v in new.items() if k!='updated_at'} == {k:v for k,v in expected.items() if k!='updated_at'}
    assert after['renditions'] == before['renditions']
    assert [r['id'] for r in after['rendition_blocks'][:len(before['rendition_blocks'])]] == [r['id'] for r in before['rendition_blocks']]
    with local_db() as cur:
        for item in PLAN:
            cur.execute('SELECT id FROM publications WHERE slug=%s',(item['slug'],))
            pid=cur.fetchone()['id']
            for change in item['changes']:
                module.projection(cur,pid,{**change,'before':change['after']})
    with pytest.raises(ValueError,match='기존 값'):
        module.main(apply_args(tmp_path/'second.json'))


def test_failure_during_local_apply_rolls_back_all_five_articles(local_db, monkeypatch, tmp_path):
    before = snapshot(local_db)
    project = module.project
    def fail_on_second(cur, change, checked):
        if checked and checked['field']=='transcript':
            raise RuntimeError('injected failure after first article blocks changed')
        project(cur,change,checked)
    monkeypatch.setattr(module,'project',fail_on_second)
    with pytest.raises(RuntimeError,match='injected failure'):
        module.main(apply_args(tmp_path/'rollback.json'))
    after=snapshot(local_db)
    # PostgreSQL sequences are not transactional; table rows must be fully rolled back.
    assert {k:v for k,v in after.items() if k!='block_sequence'} == {k:v for k,v in before.items() if k!='block_sequence'}


def test_repo_to_summary_retains_terms_without_fetching_bodies(local_db, monkeypatch):
    fake=types.ModuleType('db');fake.get_cursor=local_db
    monkeypatch.setitem(sys.modules,'db',fake)
    spec=importlib.util.spec_from_file_location('correction_words_repo',ROOT/'cms_posts_repo.py')
    repo=importlib.util.module_from_spec(spec);spec.loader.exec_module(repo)
    from cms_posts_shaping import shape_lens_summary
    posts=repo.list_published_posts('lens',None,1000)
    results=[shape_lens_summary(post) for post in posts]
    assert len(results)==5
    for result in results:
        assert sum(len(l['keywords']) for l in result['lenses'])==1
        assert [k for l in result['lenses'] for k in l['keywords']]==[{'term':'EPC','explain':'설계·조달·시공'}]
        assert all(not (set(l)&{'paragraphs','images','transcript','media_url'}) for l in result['lenses'])
