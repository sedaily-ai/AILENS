"""DB 계획·lease·전송 직전 검사. dry_run과 live 원장을 분리한다."""
import datetime as dt
import hashlib
import json
import uuid
from zoneinfo import ZoneInfo
from psycopg2.extras import Json
from db import get_cursor
from content_resolver import DashboardError,ARCHIVE_SOURCE_JOIN_SQL
from content_metadata import load_cards
import notification_policy as policy
import notifications_repo as repo
import push_provider
from recommendation_repo import EVIDENCE


def fingerprint(cur,owner):
    cur.execute(f"""SELECT md5(concat_ws('|',
     (SELECT revision::text FROM user_lens_preferences WHERE user_id=%s),
     (SELECT string_agg(id::text||':'||saved_at::text,',' ORDER BY id) FROM user_archives WHERE user_id=%s),
     (SELECT string_agg(issue_letter_id::text||':'||saved_at::text,',' ORDER BY issue_letter_id) FROM user_letter_bookmarks WHERE user_id=%s),
     (SELECT string_agg(content_key||':'||last_seen_at::text,',' ORDER BY content_key) FROM user_content_views WHERE user_id=%s),
     (SELECT count(*)::text FROM user_content_completions WHERE user_id=%s),
     (SELECT string_agg(f.source_content_key||':'||f.target_content_key||':'||f.editor_approved::text||':'||f.created_at::text,',' ORDER BY f.source_content_key,f.target_content_key) FROM content_followup_links f WHERE f.source_content_key IN(SELECT 'issue_letter:'||issue_letter_id FROM user_letter_bookmarks WHERE user_id=%s UNION SELECT 'publication:'||ap.id FROM user_archives ua {ARCHIVE_SOURCE_JOIN_SQL} WHERE ua.user_id=%s AND ap.id IS NOT NULL))
    )) AS value""",(owner,owner,owner,owner,owner,owner,owner))
    base=cur.fetchone()['value']
    cur.execute(EVIDENCE+"SELECT md5(COALESCE(string_agg(content_key||':'||cats::text||':'||words::text,',' ORDER BY content_key),'')) AS value FROM meta",(owner,owner))
    metadata=cur.fetchone()['value']
    from format_preference_repo import preference
    formats=json.dumps(preference(cur,owner),sort_keys=True)
    return hashlib.sha256((base+':'+metadata+':'+formats).encode()).hexdigest()


def candidate_signature(rows):
    fields=('content_key','category_keys','keywords','title','summary','published_at','formats')
    snapshot=[{key:row[key] for key in fields} for row in sorted(rows,key=lambda r:r['content_key'])]
    return hashlib.sha256(json.dumps(snapshot,sort_keys=True,ensure_ascii=False).encode()).hexdigest()


def cards(cur,owner,keys,exclude_delivery=None):
    rows=[]
    for kind in ('publication','issue_letter'):
        ids=[int(k.split(':')[1]) for k in keys if k.startswith(kind+':')]
        if ids:rows.extend(load_cards(cur,kind,owner=owner,ids=ids,limit=4))
    notified=notified_keys(cur,owner,exclude_delivery)
    now=repo.clock(cur)
    available={r['content_key']:r for r in rows if r['content_key'] not in notified and not r['viewed'] and dt.datetime.fromisoformat(r['published_at'])>=now-dt.timedelta(hours=72)}
    return [available[key] for key in dict.fromkeys(keys) if key in available]


def notified_keys(cur,owner,exclude_delivery=None):
    cur.execute("SELECT payload FROM user_notification_deliveries d WHERE user_id=%s AND mode=%s AND (%s::uuid IS NULL OR id<>%s::uuid) AND (sent_at IS NOT NULL OR simulated_at IS NOT NULL OR EXISTS(SELECT 1 FROM user_notification_delivery_targets t WHERE t.delivery_id=d.id AND t.status IN ('sending','unknown')))",(owner,policy.mode(),exclude_delivery,exclude_delivery))
    return {key for row in cur.fetchall() for key in row['payload']['content_keys']}


def weekly_already_notified(cur,owner,period,exclude_delivery=None):
    if not period:return False
    cur.execute("SELECT 1 FROM user_notification_deliveries d WHERE user_id=%s AND mode=%s AND (%s::uuid IS NULL OR id<>%s::uuid) AND payload->'weekly_period'=%s::jsonb AND (sent_at IS NOT NULL OR simulated_at IS NOT NULL OR EXISTS(SELECT 1 FROM user_notification_delivery_targets t WHERE t.delivery_id=d.id AND t.status IN ('sending','unknown'))) LIMIT 1",(owner,policy.mode(),exclude_delivery,exclude_delivery,Json(period)))
    return cur.fetchone() is not None


def eligible(cur,owner,state,now):
    if not policy.public_config()['supported'] or not policy.consent_valid(state['consent']) or not policy.due_types(state['preferences'],now):return False
    cur.execute('SELECT count(*) AS n FROM user_push_subscriptions WHERE user_id=%s AND active AND simulated=%s AND (expires_at IS NULL OR expires_at>%s)',(owner,policy.mode()=='dry_run',now))
    return cur.fetchone()['n']>0


def expected_mode_guard(expected_mode):
    if expected_mode not in ('dry_run','live'):policy.invalid()
    if policy.mode()!=expected_mode:raise DashboardError(409,'MODE_CHANGED','발송 모드가 바뀌었어요.')
    return expected_mode


def plan(owner,body,expected_mode='dry_run'):
    expected_mode_guard(expected_mode)
    allowed={'preferences_revision','consent_version','source_fingerprint','payload'}
    if not isinstance(body,dict) or set(body)!=allowed:policy.invalid()
    payload=body['payload']
    if not isinstance(payload,dict) or set(payload)!={'types','content_keys','weekly_period'} or not isinstance(payload['types'],list) or any(not isinstance(t,str) for t in payload['types']) or not set(payload['types'])<={'briefing','followups','weekly'} or not isinstance(payload['content_keys'],list) or len(payload['content_keys'])>4:policy.invalid()
    for key in payload['content_keys']:
        if not isinstance(key,str) or not __import__('re').fullmatch(r'(publication|issue_letter):[1-9][0-9]{0,18}',key):policy.invalid()
    if payload['weekly_period'] is not None:
        period=payload['weekly_period']
        if not isinstance(period,dict) or set(period)!={'start','end'}:policy.invalid()
        try:
            start=dt.date.fromisoformat(period['start']);end=dt.date.fromisoformat(period['end'])
            if start.weekday()!=0 or end!=start+dt.timedelta(days=6):policy.invalid()
        except (ValueError,TypeError):policy.invalid()
    with get_cursor() as cur:
        repo.lock(cur,owner);expected_mode_guard(expected_mode);now=repo.clock(cur);state=repo.state(cur,owner)
        if not eligible(cur,owner,state,now):return {'planned':False,'reason':'not_ready_or_not_due'}
        if state['revision']!=body['preferences_revision'] or body['consent_version']!=policy.policy_version() or body['source_fingerprint']!=fingerprint(cur,owner):return {'planned':False,'reason':'inputs_changed'}
        if not set(payload['types'])<=set(policy.due_types(state['preferences'],now)):return {'planned':False,'reason':'not_due'}
        expected_start=(now+dt.timedelta(hours=9)).date()
        expected_start-=dt.timedelta(days=expected_start.weekday()+7)
        if payload['weekly_period'] and ('weekly' not in payload['types'] or payload['weekly_period']['start']!=expected_start.isoformat()):policy.invalid('지난주 기록 기간을 확인해 주세요.')
        selected=cards(cur,owner,payload['content_keys'])
        keys=[r['content_key'] for r in selected]
        payload={**payload,'weekly_period':None if weekly_already_notified(cur,owner,payload['weekly_period']) else payload['weekly_period']}
        if not keys and payload['weekly_period'] is None:return {'planned':False,'reason':'no_content'}
        cur.execute("SELECT 1 FROM user_notification_deliveries d WHERE d.user_id=%s AND d.mode=%s AND (COALESCE(d.sent_at,d.simulated_at)>%s-interval '24 hours' OR EXISTS(SELECT 1 FROM user_notification_delivery_targets t WHERE t.delivery_id=d.id AND t.status IN ('sending','unknown') AND d.created_at>%s-interval '24 hours')) LIMIT 1",(owner,expected_mode,now,now))
        if cur.fetchone():return {'planned':False,'reason':'cooldown'}
        day=now.astimezone(ZoneInfo(state['preferences']['timezone'])).date();did=str(uuid.uuid4())
        compact={**payload,'content_keys':keys,'source_fingerprint':body['source_fingerprint'],'candidate_signature':candidate_signature(selected)}
        expected_mode_guard(expected_mode)
        cur.execute('INSERT INTO user_notification_deliveries(id,user_id,schedule_date,schedule_timezone,mode,payload,preferences_revision,consent_version) VALUES(%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT(user_id,schedule_date,mode) DO NOTHING RETURNING id',(did,owner,day,state['preferences']['timezone'],expected_mode,Json(compact),state['revision'],body['consent_version']))
        if not cur.fetchone():return {'planned':False,'reason':'already_planned'}
        cur.execute('INSERT INTO user_notification_delivery_targets(delivery_id,subscription_id) SELECT %s,id FROM user_push_subscriptions WHERE user_id=%s AND active AND simulated=%s AND (expires_at IS NULL OR expires_at>%s)',(did,owner,expected_mode=='dry_run',now))
        return {'planned':True,'delivery_id':did,'mode':expected_mode}


def claim(owner,expected_mode='dry_run'):
    expected_mode_guard(expected_mode)
    with get_cursor() as cur:
        repo.lock(cur,owner);expected_mode_guard(expected_mode)
        cur.execute("UPDATE user_notification_delivery_targets t SET status='unknown',last_error_code='LEASE_OUTCOME_UNKNOWN' FROM user_notification_deliveries d WHERE t.delivery_id=d.id AND d.user_id=%s AND t.status='sending' AND t.lease_until<clock_timestamp()",(owner,))
        cur.execute("UPDATE user_notification_deliveries d SET status='unknown' WHERE d.user_id=%s AND d.status='processing' AND EXISTS(SELECT 1 FROM user_notification_delivery_targets t WHERE t.delivery_id=d.id AND t.status='unknown') AND NOT EXISTS(SELECT 1 FROM user_notification_delivery_targets t WHERE t.delivery_id=d.id AND t.status IN ('queued','retry','sending'))",(owner,))
        cur.execute("SELECT t.* FROM user_notification_delivery_targets t JOIN user_notification_deliveries d ON d.id=t.delivery_id WHERE d.user_id=%s AND d.mode=%s AND d.status IN ('queued','processing') AND t.status IN ('queued','retry') AND (t.next_attempt_at IS NULL OR t.next_attempt_at<=clock_timestamp()) ORDER BY d.created_at,t.subscription_id FOR UPDATE OF t SKIP LOCKED LIMIT 1",(owner,expected_mode))
        target=cur.fetchone()
        if not target:return {'claimed':False}
        token=str(uuid.uuid4())
        cur.execute("UPDATE user_notification_delivery_targets SET status='sending',lease_token=%s,lease_until=clock_timestamp()+interval '2 minutes',attempt_count=attempt_count+1 WHERE delivery_id=%s AND subscription_id=%s",(token,target['delivery_id'],target['subscription_id']))
        cur.execute("UPDATE user_notification_deliveries SET status='processing' WHERE id=%s",(target['delivery_id'],))
        return {'claimed':True,'delivery_id':str(target['delivery_id']),'subscription_id':str(target['subscription_id']),'lease_token':token}


def send_claim(owner,body,expected_mode='dry_run'):
    expected_mode_guard(expected_mode)
    if not isinstance(body,dict) or set(body)!={'delivery_id','subscription_id','lease_token'}:policy.invalid()
    try:body={k:str(uuid.UUID(v)) for k,v in body.items()}
    except (ValueError,TypeError,AttributeError):policy.invalid()
    with get_cursor() as cur:
        repo.lock(cur,owner);expected_mode_guard(expected_mode);now=repo.clock(cur)
        cur.execute('SELECT * FROM user_notification_deliveries WHERE id=%s AND user_id=%s FOR UPDATE',(body['delivery_id'],owner));delivery=cur.fetchone()
        cur.execute('SELECT * FROM user_notification_delivery_targets WHERE delivery_id=%s AND subscription_id=%s FOR UPDATE',(body['delivery_id'],body['subscription_id']));target=cur.fetchone()
        if not delivery or not target:raise DashboardError(404,'NOT_FOUND','전달 작업을 찾을 수 없어요.')
        if target['status']!='sending' or str(target['lease_token'])!=body['lease_token'] or target['lease_until']<=now:return {'processed':False,'status':'lease_unavailable'}
        cur.execute('SELECT * FROM user_push_subscriptions WHERE id=%s FOR UPDATE',(body['subscription_id'],));sub=cur.fetchone()
        state=repo.state(cur,owner);payload=delivery['payload']
        # 계정 row lock으로 archive/bookmark 변경을 직렬화한다.
        # publication의 slug cascade와 역순인 자식 행 lock을 추가하지 않는다.
        # 조회 전용 관계 테이블의 UPDATE 권한을 넓히지 않고 동일 트랜잭션에서 잠근다.
        cur.execute(f"SELECT public.lock_notification_followup_sources(ARRAY(SELECT 'issue_letter:'||issue_letter_id FROM user_letter_bookmarks WHERE user_id=%s UNION SELECT 'publication:'||ap.id FROM user_archives ua {ARCHIVE_SOURCE_JOIN_SQL} WHERE ua.user_id=%s AND ap.id IS NOT NULL)::text[])",(owner,owner));cur.fetchone()
        valid=delivery['mode']==expected_mode and delivery['status'] in ('queued','processing') and sub and sub['user_id']==owner and sub['active'] and (sub['expires_at'] is None or sub['expires_at']>now) and sub['simulated']==(expected_mode=='dry_run')
        valid=bool(valid and set(payload['types'])<=set(policy.due_types(state['preferences'],now)) and eligible(cur,owner,state,now) and state['revision']==delivery['preferences_revision'] and delivery['consent_version']==policy.policy_version() and payload['source_fingerprint']==fingerprint(cur,owner))
        available=[]
        if valid:
            # 부모를 먼저 잠근 뒤 메타데이터를 다시 읽는다. 편집 도중의 stale card를 사용하지 않는다.
            for kind,table in [('publication','publications'),('issue_letter','issue_letters')]:
                ids=[int(key.split(':')[1]) for key in payload['content_keys'] if key.startswith(kind+':')]
                if ids:
                    cur.execute(f"SELECT id FROM {table} WHERE id=ANY(%s) ORDER BY id FOR SHARE",(ids,));cur.fetchall()
            available=cards(cur,owner,payload['content_keys'],delivery['id'])
            valid=payload.get('candidate_signature')==candidate_signature(available)
        result={'status':'canceled','code':'CONDITIONS_CHANGED'}
        weekly=payload['weekly_period'] if valid and not weekly_already_notified(cur,owner,payload['weekly_period'],delivery['id']) else None
        if valid and (available or weekly):
            try:
                subscription=policy.decrypt(sub['subscription_encrypted'],sub['encryption_key_version'])
                policy.subscription({'subscription':subscription,'permission':'simulated' if sub['simulated'] else 'granted'},now)
                message={'title':'나의 LENS 소식','body':f"관심에 맞는 새 글 {len(available)}편을 확인해 보세요." if available else '지난주의 관심 기록을 확인해 보세요.','url':'/my-lens#ml-news','tag':body['delivery_id']}
                # dry_run은 동적 provider mode에 맡기지 않고 이 경계에서 외부 호출을 차단한다.
                expected_mode_guard(expected_mode)
                result={'status':'simulated','code':None} if expected_mode=='dry_run' else push_provider.send(subscription,message,body['delivery_id'])
            except DashboardError:result={'status':'failed','code':'SUBSCRIPTION_UNAVAILABLE'}
        status=result['status']
        if status=='retry' and target['attempt_count']>=3:status='failed'
        retry_at=now+dt.timedelta(minutes=2**target['attempt_count']) if status=='retry' else None
        cur.execute('UPDATE user_notification_delivery_targets SET status=%s,last_error_code=%s,next_attempt_at=%s,processed_at=%s,lease_token=NULL,lease_until=NULL WHERE delivery_id=%s AND subscription_id=%s',(status,result['code'],retry_at,now,body['delivery_id'],body['subscription_id']))
        if status=='gone':cur.execute('UPDATE user_push_subscriptions SET active=false,revoked_at=%s WHERE id=%s',(now,body['subscription_id']))
        if status in ('accepted','simulated'):
            column='sent_at' if status=='accepted' else 'simulated_at'
            cur.execute(f'UPDATE user_notification_deliveries SET {column}=COALESCE({column},%s) WHERE id=%s',(now,body['delivery_id']))
        cur.execute('SELECT status FROM user_notification_delivery_targets WHERE delivery_id=%s',(body['delivery_id'],));statuses=[r['status'] for r in cur.fetchall()]
        overall='processing' if any(s in ('queued','sending','retry') for s in statuses) else 'unknown' if 'unknown' in statuses else 'done' if any(s in ('accepted','simulated') for s in statuses) else 'canceled' if all(s=='canceled' for s in statuses) else 'failed'
        cur.execute('UPDATE user_notification_deliveries SET status=%s WHERE id=%s',(overall,body['delivery_id']))
        return {'processed':True,'status':status,'mode':expected_mode,'actual_sent':status=='accepted'}
