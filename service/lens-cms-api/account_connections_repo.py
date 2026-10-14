"""기존 사전을 사용하는 계정 팔로우 및 사용자 선택 북마크 이관."""
import hashlib
import json
import uuid
from urllib.parse import quote
from psycopg2.extras import Json
from db import get_cursor
from dashboard_repo import _account
from content_resolver import DashboardError


def followed(cur,owner):
    cur.execute("""SELECT e.slug AS id,e.name,e.is_active AS active,f.followed_at
      FROM user_followed_editors f JOIN letter_editors e ON e.id=f.editor_id
      WHERE f.user_id=%s ORDER BY f.followed_at DESC,e.slug""",(owner,))
    items=[{**dict(r),'href':f"/letter/editors/{quote(r['id'],safe='')}",'followed_at':r['followed_at'].isoformat()} for r in cur.fetchall()]
    return {'items':items,'total':len(items)}


def list_followed(owner):
    with get_cursor() as cur:
        _account(cur,owner)
        return followed(cur,owner)


def set_followed(owner,slug,following):
    if not isinstance(slug,str) or not 0<len(slug)<=32 or any(c not in 'abcdefghijklmnopqrstuvwxyz0123456789-' for c in slug):
        raise DashboardError(400,'INVALID_ARGUMENT','에디터 식별자를 확인해 주세요.')
    with get_cursor() as cur:
        _account(cur,owner,create=following,write=True)
        cur.execute('SELECT id,is_active FROM letter_editors WHERE slug=%s FOR SHARE',(slug,))
        editor=cur.fetchone()
        if not editor or following and not editor['is_active']:
            raise DashboardError(404,'NOT_FOUND','현재 팔로우할 수 없는 에디터예요.')
        if following:
            cur.execute('INSERT INTO user_followed_editors(user_id,editor_id) VALUES(%s,%s) ON CONFLICT DO NOTHING',(owner,editor['id']))
        else:
            cur.execute('DELETE FROM user_followed_editors WHERE user_id=%s AND editor_id=%s',(owner,editor['id']))
        return {'editor_id':slug,'following':following}


def import_bookmarks(owner,body):
    if not isinstance(body,dict) or set(body)!={'import_id','source','slugs'} or body['source']!='browser-bookmarks-v1':
        raise DashboardError(400,'INVALID_ARGUMENT','가져올 브라우저 북마크를 확인해 주세요.')
    try: import_id=str(uuid.UUID(body['import_id']))
    except (ValueError,TypeError,AttributeError) as exc:
        raise DashboardError(400,'INVALID_ARGUMENT','가져오기 ID를 확인해 주세요.') from exc
    values=body['slugs']
    if not isinstance(values,list) or not 1<=len(values)<=200 or any(not isinstance(v,str) or not v.strip() or len(v)>200 for v in values):
        raise DashboardError(400,'INVALID_ARGUMENT','레터는 1~200편을 선택해 주세요.')
    slugs=sorted(set(v.strip() for v in values))
    digest=hashlib.sha256(json.dumps(slugs,ensure_ascii=False,separators=(',',':')).encode()).hexdigest()
    with get_cursor() as cur:
        _account(cur,owner,create=True,write=True)
        cur.execute('SELECT snapshot_hash,result FROM user_lens_imports WHERE user_id=%s AND import_id=%s',(owner,import_id))
        previous=cur.fetchone()
        if previous and previous['snapshot_hash']!=digest:
            raise DashboardError(409,'IDEMPOTENCY_CONFLICT','같은 가져오기 ID의 선택 목록이 달라요.')
        if previous:return {**previous['result'],'replayed':True}
        # UUID마다 입력을 묶는다. 동일 목록의 새 요청도 별도 영수증을 남긴다.
        cur.execute("SELECT count(*) AS n FROM user_lens_imports WHERE user_id=%s AND imported_at>clock_timestamp()-interval '24 hours'",(owner,))
        if cur.fetchone()['n']>=20:raise DashboardError(429,'RATE_LIMITED','가져오기는 하루 20회까지 할 수 있어요.')
        cur.execute('SELECT result FROM user_lens_imports WHERE user_id=%s AND snapshot_hash=%s ORDER BY imported_at DESC,import_id DESC LIMIT 1',(owner,digest))
        snapshot=cur.fetchone()
        accepted=list(snapshot['result']['accepted']) if snapshot else []
        processed={row['slug'] for row in accepted}
        cur.execute("SELECT id,slug FROM issue_letters WHERE slug=ANY(%s) AND status='published' AND deleted_at IS NULL AND published_at<=clock_timestamp() FOR SHARE",(slugs,))
        available={r['slug']:r['id'] for r in cur.fetchall()}
        rejected=[];added=False
        for slug in slugs:
            if slug in processed:continue  # 해제한 항목을 재생성하지 않는다.
            if slug not in available:rejected.append({'slug':slug,'code':'NOT_AVAILABLE'});continue
            lid=available[slug]
            cur.execute('INSERT INTO user_letter_bookmarks(user_id,issue_letter_id) VALUES(%s,%s) ON CONFLICT DO NOTHING',(owner,lid))
            accepted.append({'slug':slug,'content_key':f'issue_letter:{lid}'});added=True
        result={'import_id':import_id,'replayed':bool(snapshot) and not added,'accepted':accepted,'rejected':rejected}
        cur.execute('INSERT INTO user_lens_imports(user_id,import_id,snapshot_hash,result,imported_at) VALUES(%s,%s,%s,%s,clock_timestamp())',(owner,import_id,digest,Json(result)))
        return result
