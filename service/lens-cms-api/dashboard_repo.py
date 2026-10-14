"""나의 LENS 계정 설정·레터 저장. owner는 인증된 내부 호출에서만 받는다."""
import base64
import datetime as dt
import hmac
import json
import os
from urllib.parse import quote

from psycopg2.extras import Json
from db import get_cursor
from content_resolver import DashboardError, resolve_content
from interests_repo import validate_interest_items
from letter_errors import LetterError


def _account(cur, owner, create=False, write=False):
    if not isinstance(owner, str) or not owner or len(owner) > 64:
        raise DashboardError(400, 'INVALID_ARGUMENT', '계정 식별자를 확인해 주세요.')
    if create:
        cur.execute("INSERT INTO users(id,email) VALUES (%s,%s) ON CONFLICT DO NOTHING", (owner, f'{owner}@unknown.local'))
    cur.execute('SELECT status FROM users WHERE id=%s ' + ('FOR UPDATE' if create or write else 'FOR SHARE'), (owner,))
    row = cur.fetchone()
    if create and not row or row and row['status'] != 'active':
        raise DashboardError(403, 'ACCOUNT_UNAVAILABLE', '이 계정은 이용할 수 없어요.')


def _preferences(row):
    return {'interests': row['interests'] if row else [], 'minutes': row['minutes'] if row else 0,
            'revision': row['revision'] if row else 0, 'updated_at': row['updated_at'].isoformat() if row else None}


def get_preferences(owner):
    with get_cursor() as cur:
        _account(cur, owner)
        cur.execute('SELECT * FROM user_lens_preferences WHERE user_id=%s', (owner,))
        return _preferences(cur.fetchone())


def replace_preferences(owner, payload):
    if not isinstance(payload, dict) or set(payload) != {'interests', 'minutes', 'revision'}:
        raise DashboardError(400, 'INVALID_ARGUMENT', '관심·읽을 시간·revision을 보내 주세요.')
    revision, minutes = payload['revision'], payload['minutes']
    if type(revision) is not int or revision < 0 or revision >= 2**63 or type(minutes) is not int or minutes not in (0, 5, 10):
        raise DashboardError(400, 'INVALID_ARGUMENT', '설정 값이 올바르지 않아요.')
    try:
        pairs = validate_interest_items(payload['interests'])
    except LetterError as exc:
        raise DashboardError(400, 'INVALID_ARGUMENT', str(exc)) from exc
    clean = [{'type': t, 'key': k} for t, k in pairs]
    with get_cursor() as cur:
        _account(cur, owner, create=True)
        # 사용자 단위 lock으로 최초 생성(0→1)도 동시 전체 교체와 같은 규칙 적용.
        cur.execute('SELECT id FROM users WHERE id=%s FOR UPDATE', (owner,))
        cur.execute('SELECT * FROM user_lens_preferences WHERE user_id=%s FOR UPDATE', (owner,))
        previous = cur.fetchone()
        if (previous['revision'] if previous else 0) != revision:
            raise DashboardError(409, 'REVISION_CONFLICT', '다른 기기에서 설정이 바뀌었어요. 다시 확인해 주세요.')
        old = {(item['type'], item['key']) for item in previous['interests']} if previous else set()
        topics = [key for kind, key in pairs if kind == 'topic']
        if topics:
            cur.execute('SELECT slug,is_active FROM topics WHERE slug=ANY(%s)', (topics,))
            states = {r['slug']: r['is_active'] for r in cur.fetchall()}
            if any(key not in states or (not states[key] and ('topic', key) not in old) for key in topics):
                raise DashboardError(400, 'UNKNOWN_INTEREST', '현재 선택할 수 없는 주제가 포함돼 있어요.')
        cur.execute('INSERT INTO user_lens_preferences(user_id,interests,minutes,revision) VALUES (%s,%s,%s,1) '
                    'ON CONFLICT(user_id) DO UPDATE SET interests=EXCLUDED.interests,minutes=EXCLUDED.minutes,'
                    'revision=user_lens_preferences.revision+1,updated_at=now() RETURNING *', (owner, Json(clean), minutes))
        return _preferences(cur.fetchone())


def _cursor_key():
    key = os.environ.get('ADMIN_INTERNAL_TOKEN', '')
    if not key:
        raise DashboardError(503, 'DEPENDENCY_UNAVAILABLE', '목록 조회 설정이 준비되지 않았어요.')
    return key.encode()


def _encode_cursor(data):
    raw = json.dumps(data, separators=(',', ':')).encode()
    return base64.urlsafe_b64encode(raw + hmac.digest(_cursor_key(), raw, 'sha256')).decode()


def _decode_cursor(cursor, owner, query, read="all"):
    try:
        if not isinstance(cursor, str) or len(cursor) > 2048:
            raise ValueError()
        decoded = base64.b64decode(cursor, altchars=b'-_', validate=True)
        raw, signature = decoded[:-32], decoded[-32:]
        if not hmac.compare_digest(signature, hmac.digest(_cursor_key(), raw, 'sha256')):
            raise ValueError()
        data = json.loads(raw)
        if data['owner'] != owner or data['q'] != query or data.get('read','all') != read or not 0 < int(data['id']) < 2**63:
            raise ValueError()
        when = dt.datetime.fromisoformat(data['at'])
        if when.tzinfo is None:
            raise ValueError()
        return when, int(data['id'])
    except (ValueError, KeyError, TypeError, UnicodeError) as exc:
        raise DashboardError(400, 'INVALID_CURSOR', '목록을 처음부터 다시 확인해 주세요.') from exc


def list_bookmarks(owner, limit=50, cursor=None, q='', read='all'):
    if type(limit) is not int or not 1 <= limit <= 200 or not isinstance(q, str) or len(q.strip()) > 120 or read not in ('all','unread','completed'):
        raise DashboardError(400, 'INVALID_ARGUMENT', '목록 조회 조건을 확인해 주세요.')
    q = q.strip()
    after = _decode_cursor(cursor, owner, q, read) if cursor else None
    with get_cursor() as cur:
        _account(cur, owner)
        base = 'FROM user_letter_bookmarks b JOIN issue_letters l ON l.id=b.issue_letter_id WHERE b.user_id=%s'
        params = [owner]
        completed="EXISTS(SELECT 1 FROM user_content_completions ce WHERE ce.user_id=b.user_id AND ce.content_key='issue_letter:'||l.id)"
        if read!='all':base += ' AND '+('NOT ' if read=='unread' else '')+completed
        if q:
            # 비공개 자료의 제목으로 검색할 수 없다.
            base += " AND l.status='published' AND l.deleted_at IS NULL AND l.published_at<=clock_timestamp() AND position(lower(%s) in lower(l.title))>0"
            params.append(q)
        cur.execute('SELECT count(*) AS total ' + base, params)
        total = cur.fetchone()['total']
        if after:
            base += ' AND (b.saved_at,b.issue_letter_id)<(%s,%s)'
            params += list(after)
        cur.execute('SELECT b.issue_letter_id,b.saved_at,b.version,l.slug,l.title,l.deck,l.read_minutes,l.published_at,'
                    f'l.status,l.deleted_at,(l.published_at<=clock_timestamp()) AS publish_due,({completed}) AS completed ' + base + ' ORDER BY b.saved_at DESC,b.issue_letter_id DESC LIMIT %s', params + [limit + 1])
        rows = cur.fetchall()
        more = len(rows) > limit
        rows = rows[:limit]
        ids = [r['issue_letter_id'] for r in rows if r['status'] == 'published' and r['deleted_at'] is None and bool(r['publish_due'])]
        categories = {i: [] for i in ids}
        if ids:
            cur.execute('SELECT letter_id,category_slug FROM issue_letter_categories WHERE letter_id=ANY(%s) ORDER BY is_primary DESC,category_slug', (ids,))
            for r in cur.fetchall():
                categories[r['letter_id']].append(r['category_slug'])
        items = []
        for r in rows:
            lid = str(r['issue_letter_id'])
            available = r['status'] == 'published' and r['deleted_at'] is None and bool(r['publish_due'])
            content = {'content_key': f'issue_letter:{lid}', 'kind': 'issue_letter', 'available': available, 'completed': bool(r['completed'])}
            if available:
                content.update(slug=r['slug'], title=r['title'], summary=r['deck'], read_minutes=r['read_minutes'],
                               published_at=r['published_at'].isoformat(), href=f"/letter/{quote(r['slug'], safe='')}", categories=categories[r['issue_letter_id']])
            items.append({'letter_id': lid, 'saved_at': r['saved_at'].isoformat(), 'version': r['version'], 'content': content})
        next_cursor = _encode_cursor({'owner': owner, 'q': q, 'at': rows[-1]['saved_at'].isoformat(), 'id': str(rows[-1]['issue_letter_id']), 'read':read}) if more else None
        return {'items': items, 'count': len(items), 'total': total, 'next_cursor': next_cursor}


def set_bookmark(owner, letter_id, saved):
    # DELETE도 입력형식 검증. 미발행/삭제 항목을 본인이 해제하는 것은 허용.
    if not isinstance(letter_id, str) or not letter_id.isascii() or not letter_id.isdigit() or not 0 < int(letter_id) < 2**63:
        raise DashboardError(400, 'INVALID_ARGUMENT', '레터 ID를 확인해 주세요.')
    letter_id = str(int(letter_id))
    with get_cursor() as cur:
        _account(cur, owner, create=saved)
        if saved:
            resolve_content(cur, 'issue_letter', 'id', letter_id)
            cur.execute('INSERT INTO user_letter_bookmarks(user_id,issue_letter_id) VALUES(%s,%s) '
                        'ON CONFLICT(user_id,issue_letter_id) DO UPDATE SET version=user_letter_bookmarks.version RETURNING saved_at,version', (owner, int(letter_id)))
            row = cur.fetchone()
        else:
            cur.execute('DELETE FROM user_letter_bookmarks WHERE user_id=%s AND issue_letter_id=%s RETURNING saved_at,version', (owner, int(letter_id)))
            row = cur.fetchone()
        return {'letter_id': letter_id, 'saved': saved, 'saved_at': row['saved_at'].isoformat() if row else None, 'version': row['version'] if row else 0}


def resolve(owner, kind, key_type, key):
    with get_cursor() as cur:
        _account(cur, owner)
        result = resolve_content(cur, kind, key_type, key)
        if result['published_at']:
            result['published_at'] = result['published_at'].isoformat()
        return result
