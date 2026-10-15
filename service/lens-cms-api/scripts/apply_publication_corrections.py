#!/usr/bin/env python3
"""검토한 기사 정정안을 적용한다. 기본은 검증만, --apply는 백업·계획 SHA 필수.

publications 원본 JSON과 공개 조회용 문단·대본·캡션을 한 트랜잭션에서 수정한다.
기존 값이 계획과 하나라도 다르면 전체 중단한다. URL·미디어 파일·발행 상태는 보존한다.
"""
import argparse
import copy
from contextlib import contextmanager
import hashlib
import json
import os
from pathlib import Path

TOP_FIELDS = {'headline': 'title', 'context': 'subtitle'}
LENS_FIELDS = {'question', 'bullets', 'paragraphs', 'transcript', 'images'}
FORMATS = {'레터': 'letter', '웹툰': 'webtoon', '팟캐스트': 'podcast', '영상': 'video'}


def revise(publication, changes):
    result = copy.deepcopy(publication)
    for change in changes:
        path = change['path']
        if len(path) == 1 and path[0] in TOP_FIELDS:
            parent, key = result, TOP_FIELDS[path[0]]
        elif len(path) == 3 and path[0] == 'lenses' and path[1] in FORMATS and path[2] in LENS_FIELDS:
            items = result['admin_extra']['body_inline']['lenses']
            matches = [item for item in items if item.get('label') == path[1]]
            if len(matches) != 1:
                raise ValueError(f'형식이 단일 항목이 아님: {path[1]}')
            parent, key = matches[0], path[2]
        else:
            raise ValueError(f'허용되지 않은 수정 경로: {path}')
        if parent.get(key) != change['before']:
            raise ValueError(f'기존 값 변경 감지: {publication["slug"]} {path}')
        if key == 'images':
            # 미디어 파일이나 순서는 변경하지 않고 캡션만 정정한다.
            old, new = change['before'], change['after']
            if len(old) != len(new) or any(a.get('url') != b.get('url') for a, b in zip(old, new)):
                raise ValueError('이미지 URL 또는 순서 변경은 허용하지 않음')
        parent[key] = copy.deepcopy(change['after'])
    return result


def projection(cur, pub_id, change, lock=False):
    """공개 투영은 조회만 한다. 적용 모드에서만 부모·자식 행을 잠근다."""
    path = change['path']
    if len(path) != 3 or path[2] not in {'paragraphs', 'transcript', 'images'}:
        return None
    fmt, field = FORMATS[path[1]], path[2]
    suffix = ' FOR UPDATE' if lock else ''
    cur.execute('SELECT * FROM renditions WHERE publication_id=%s AND format=%s' + suffix, (pub_id, fmt))
    rows = cur.fetchall()
    if len(rows) != 1 or rows[0]['status'] != 'ready':
        raise ValueError(f'단일 ready rendition 필요: {pub_id}/{fmt}')
    rendition = dict(rows[0])
    rid = rendition['id']
    if field == 'paragraphs':
        cur.execute('SELECT * FROM rendition_blocks WHERE rendition_id=%s ORDER BY position' + suffix, (rid,))
        children = [dict(row) for row in cur.fetchall()]
        if any(row['block_type'] != 'text' or row['image_url'] for row in children):
            raise ValueError('문단이 아닌 블록은 정정할 수 없음')
        actual = [row['content'] for row in children]
        if len(change['after']) < len(children):
            raise ValueError('문단 삭제 요청')
    elif field == 'transcript':
        cur.execute('SELECT * FROM media_assets WHERE rendition_id=%s' + suffix, (rid,))
        children = [dict(row) for row in cur.fetchall()]
        actual = children[0]['transcript'] if len(children) == 1 else None
        if len(children) != 1:
            raise ValueError('단일 media asset 필요')
    else:
        cur.execute('SELECT * FROM webtoon_panels WHERE rendition_id=%s ORDER BY position' + suffix, (rid,))
        children = [dict(row) for row in cur.fetchall()]
        actual = [{'url': row['image_url'], 'caption': row['dialogue'] or ''} for row in children]
    if actual != change['before']:
        raise ValueError(f'공개 투영 기존 값 변경 감지: {pub_id}/{field}')
    return {'rendition': rendition, 'field': field, 'rows': children}


def review(cur, plan, lock=False):
    originals, revisions, projections = [], [], []
    suffix = ' FOR UPDATE' if lock else ''
    for item in plan:
        cur.execute('SELECT * FROM publications WHERE slug=%s AND source_url=%s AND deleted_at IS NULL AND status=%s' + suffix,
                    (item['slug'], item['source_url'], 'published'))
        matches = cur.fetchall()
        if len(matches) != 1:
            raise ValueError(f'단일 발행 기사 필요: {item["slug"]}')
        original = dict(matches[0])
        originals.append(original)
        revisions.append(revise(original, item['changes']))
        projections.append([projection(cur, original['id'], change, lock) for change in item['changes']])
    return originals, revisions, projections


def project(cur, change, checked):
    """동일 트랜잭션에서 이미 검증·잠근 행에만 정정한다."""
    if checked is None:
        return
    rid, field, rows = checked['rendition']['id'], checked['field'], checked['rows']
    after = change['after']
    if field == 'paragraphs':
        for i, text in enumerate(after):
            if i < len(rows):
                cur.execute('UPDATE rendition_blocks SET content=%s WHERE id=%s', (text, rows[i]['id']))
            else:
                position = (rows[-1]['position'] + i - len(rows) + 1) if rows else i
                cur.execute("INSERT INTO rendition_blocks (rendition_id,position,block_type,content) VALUES (%s,%s,'text',%s)", (rid, position, text))
    elif field == 'transcript':
        cur.execute('UPDATE media_assets SET transcript=%s WHERE id=%s', (after, rows[0]['id']))
    else:
        for row, replacement in zip(rows, after):
            if row['dialogue'] != replacement['caption']:
                cur.execute('UPDATE webtoon_panels SET dialogue=%s WHERE id=%s', (replacement['caption'], row['id']))


@contextmanager
def correction_cursor(apply=False):
    # 서비스의 전역 풀을 import하지 않는다. 기본 모드는 접속부터 read-only이며 성공해도 rollback한다.
    import psycopg2
    from psycopg2.extras import RealDictCursor
    keys = ('LENS_PG_HOST', 'LENS_PG_DATABASE', 'LENS_PG_USER', 'LENS_PG_PASSWORD')
    if any(not os.environ.get(key) for key in keys):
        raise ValueError('LENS_PG_HOST/DATABASE/USER/PASSWORD 환경변수를 모두 지정해야 합니다')
    conn = psycopg2.connect(host=os.environ[keys[0]], dbname=os.environ[keys[1]],
                            user=os.environ[keys[2]], password=os.environ[keys[3]],
                            port=int(os.environ.get('LENS_PG_PORT') or '5432'), connect_timeout=5,
                            options=f"-c default_transaction_read_only={'off' if apply else 'on'} -c statement_timeout=20000 -c lock_timeout=5000")
    try:
        conn.set_session(readonly=not apply, isolation_level='REPEATABLE READ')
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            yield cur
        if apply:
            conn.commit()
        else:
            conn.rollback()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('plan', type=Path)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--expected-plan-sha')
    parser.add_argument('--backup', type=Path)
    args = parser.parse_args(argv)
    raw = args.plan.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    if args.apply and (args.expected_plan_sha != digest or not args.backup):
        parser.error('--apply에는 일치하는 --expected-plan-sha와 새 --backup 경로가 필요합니다')
    plan = json.loads(raw)['articles']
    if len({p['slug'] for p in plan}) != len(plan):
        parser.error('중복 기사 계획')
    with correction_cursor(args.apply) as cur:
        originals, revisions, projections = review(cur, plan, lock=args.apply)
        if args.apply:
            # 배타 생성으로 이전 백업 덮어쓰기를 막는다. 실패하면 DB도 커밋하지 않는다.
            fd = os.open(args.backup, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(fd, 'w') as out:
                json.dump({'plan_sha256': digest, 'publications': originals, 'projections': projections, 'plan': plan}, out, ensure_ascii=False, indent=2, default=str)
            for item, revision, checked in zip(plan, revisions, projections):
                for change, projected in zip(item['changes'], checked):
                    project(cur, change, projected)
                cur.execute('UPDATE publications SET title=%s,subtitle=%s,admin_extra=%s,updated_at=clock_timestamp() WHERE id=%s',
                            (revision['title'], revision['subtitle'], json.dumps(revision['admin_extra'], ensure_ascii=False), revision['id']))
                if cur.rowcount != 1:
                    raise ValueError('publication 갱신 실패')
    print(json.dumps({'applied': args.apply, 'articles': len(plan), 'plan_sha256': digest, 'backup': str(args.backup) if args.apply else None}, ensure_ascii=False))


if __name__ == '__main__':
    main()
