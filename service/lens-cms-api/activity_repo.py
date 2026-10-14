"""계정 이용 신호와 completion-v1 원자적 완료·리워드 판정."""
import hashlib
import json
import uuid
from psycopg2.extras import Json
from db import get_cursor
from dashboard_repo import _account
from content_resolver import DashboardError, resolve_content
from content_metadata import load_cards
import completion_repo
import completion_rules


def create_session(owner, payload):
    if not isinstance(payload,dict) or set(payload) != {'content_key','format'} or not isinstance(payload['content_key'],str):
        raise DashboardError(400,'INVALID_ARGUMENT','콘텐츠와 형식을 확인해 주세요.')
    parts=payload['content_key'].split(':')
    if len(parts)!=2:
        raise DashboardError(400,'INVALID_ARGUMENT','안정 콘텐츠 키가 필요해요.')
    with get_cursor() as cur:
        _account(cur,owner,create=True)
        content=resolve_content(cur,parts[0],'id',parts[1])
        cards=load_cards(cur,parts[0],owner=owner,ids=[int(content['id'])],limit=1)
        if not cards or payload['format'] not in cards[0]['formats']:
            raise DashboardError(400,'INVALID_ARGUMENT','제공하지 않는 콘텐츠 형식이에요.')
        cur.execute("SELECT count(*) AS n FROM user_content_sessions WHERE user_id=%s AND started_at>now()-interval '24 hours'",(owner,))
        if cur.fetchone()['n']>=500:
            raise DashboardError(429,'RATE_LIMITED','오늘의 이용 신호 한도를 넘었어요.')
        session_id=str(uuid.uuid4())
        rules=completion_repo.metadata(cur,content['content_key'],payload['format'],cards[0])
        cur.execute('INSERT INTO user_content_sessions(id,user_id,content_key,format,completion_rules,rule_version) VALUES(%s,%s,%s,%s,%s,%s) RETURNING started_at', (session_id,owner,content['content_key'],payload['format'],Json(rules),completion_rules.VERSION))
        started=cur.fetchone()['started_at'].isoformat()
    return {'session_id':session_id,'content_key':content['content_key'],'format':payload['format'],'started_at':started,'rule_version':completion_rules.VERSION,'completion':rules,'reward_evaluation_enabled':bool(rules['completion_enabled'] and rules['group_key'])}


def accept_event(owner,payload):
    required={'event_id','session_id','session_seq','event_type','visible_ms'}
    allowed=required|{'active_ms','scroll_ratio','viewed_panel_ids','consumed_ranges','client_occurred_at'}
    if not isinstance(payload,dict) or not required<=set(payload) or not set(payload)<=allowed:
        raise DashboardError(400,'INVALID_ARGUMENT','진행 신호 형식을 확인해 주세요.')
    try:
        event_id,session_id=str(uuid.UUID(payload['event_id'])),str(uuid.UUID(payload['session_id']))
    except (ValueError,TypeError,AttributeError) as exc:
        raise DashboardError(400,'INVALID_ARGUMENT','이벤트/세션 ID가 올바르지 않아요.') from exc
    seq,visible=payload['session_seq'],payload['visible_ms']
    if type(seq) is not int or not 0<seq<2**31 or type(visible) is not int or not 0<=visible<=86400000 or payload['event_type'] not in ('progress','ended'):
        raise DashboardError(400,'INVALID_ARGUMENT','진행 값을 확인해 주세요.')
    ratio=payload.get('scroll_ratio',0)
    if type(ratio) not in (int,float) or not 0<=ratio<=1:
        raise DashboardError(400,'INVALID_ARGUMENT','스크롤 값을 확인해 주세요.')
    digest=hashlib.sha256(json.dumps(payload,sort_keys=True,separators=(',',':')).encode()).hexdigest()
    with get_cursor() as cur:
        _account(cur,owner,write=True)
        cur.execute('SELECT *,now() AS server_now FROM user_content_sessions WHERE id=%s AND user_id=%s FOR UPDATE',(session_id,owner))
        session=cur.fetchone()
        if not session:
            raise DashboardError(404,'NOT_FOUND','이용 세션을 찾을 수 없어요.')
        cur.execute('SELECT user_id,payload_hash,result FROM user_content_events WHERE event_id=%s',(event_id,))
        previous=cur.fetchone()
        if previous:
            if previous['user_id']!=owner:
                raise DashboardError(404,'NOT_FOUND','이벤트를 찾을 수 없어요.')
            if previous['payload_hash']!=digest:
                raise DashboardError(409,'IDEMPOTENCY_CONFLICT','같은 이벤트 ID의 내용이 달라요.')
            return previous['result']
        cur.execute("SELECT count(*) AS n FROM user_content_events WHERE user_id=%s AND received_at>now()-interval '1 minute'",(owner,))
        if cur.fetchone()['n']>=120:
            raise DashboardError(429,'RATE_LIMITED','진행 보고가 너무 많아요. 잠시 뒤 다시 시도해 주세요.')
        now=session['server_now']
        elapsed_ms=int((now-session['started_at']).total_seconds()*1000)
        delta_ms=int((now-session['updated_at']).total_seconds()*1000)
        if session['ended_at'] or elapsed_ms>86400000:
            raise DashboardError(409,'SESSION_EXPIRED','이용 세션이 종료됐어요.')
        if seq!=session['last_seq']+1:
            raise DashboardError(409,'SEQUENCE_CONFLICT','진행 순서를 다시 확인해 주세요.')
        if session['last_seq'] and delta_ms<5000:
            raise DashboardError(429,'RATE_LIMITED','진행 보고 간격이 너무 짧아요.')
        if visible<session['visible_ms'] or visible>elapsed_ms+2000 or visible-session['visible_ms']>delta_ms+2000:
            raise DashboardError(400,'INVALID_ARGUMENT','서버 경과 시간과 맞지 않는 진행 값이에요.')
        kind,lid=session['content_key'].split(':')
        resolve_content(cur,kind,'id',lid)  # 전송 중 비공개화한 자료는 새 관심을 만들지 않는다.
        viewed=visible>=10000 and elapsed_ms>=10000
        completed,progress=completion_rules.progress(session,payload,elapsed_ms,delta_ms)
        reward={'status':'not_eligible','stamp_awarded':False,'pending_reason':session['completion_rules'].get('pending_reason')}
        awards=[]
        if completed:
            cards=load_cards(cur,kind,owner=owner,ids=[int(lid)],limit=1)
            if not cards or completion_repo.metadata(cur,session['content_key'],session['format'],cards[0])!=session['completion_rules']:
                raise DashboardError(409,'CONTENT_CHANGED','콘텐츠 기준이 바뀌었어요. 다시 열어 주세요.')
            reward,awards=completion_repo.record(cur,owner,session,now)
        result={'accepted':True,'event_id':event_id,'session_id':session_id,'session_seq':seq,'viewed':viewed,'completed':completed,'reward':reward,'awards':awards,'rule_version':session['rule_version'],'reward_evaluation_enabled':bool(session['completion_rules'].get('completion_enabled') and session['completion_rules'].get('group_key'))}
        cur.execute('INSERT INTO user_content_events(event_id,user_id,session_id,session_seq,payload_hash,result) VALUES(%s,%s,%s,%s,%s,%s) ON CONFLICT(event_id) DO NOTHING RETURNING event_id', (event_id,owner,session_id,seq,digest,Json(result)))
        if cur.fetchone() is None:
            raise DashboardError(409,'IDEMPOTENCY_CONFLICT','이벤트가 다른 요청에서 사용됐어요.')
        cur.execute('UPDATE user_content_sessions SET visible_ms=%s,last_seq=%s,updated_at=now(),ended_at=%s WHERE id=%s', (visible,seq,now if payload['event_type']=='ended' else None,session_id))
        cur.execute('UPDATE user_content_sessions SET active_ms=%s,scroll_ratio=%s,viewed_panel_ids=%s,consumed_ranges=%s WHERE id=%s',(progress['active_ms'],progress['scroll_ratio'],Json(progress['viewed_panel_ids']),Json(progress['consumed_ranges']),session_id))
        if viewed:
            cur.execute("INSERT INTO user_content_views(user_id,content_key,last_seen_at) VALUES(%s,%s,now()) ON CONFLICT(user_id,content_key) DO UPDATE SET last_seen_at=EXCLUDED.last_seen_at", (owner,session['content_key']))
    return result
