"""계정 알림 설정·동의·암호화 기기. 입력의 owner는 내부 인증 호출만 사용."""
import datetime as dt
import hashlib
import hmac
import uuid
from psycopg2.extras import Json
from db import get_cursor
from dashboard_repo import _account
from content_resolver import DashboardError
import notification_policy as policy


def lock(cur,owner):
    # 초기 전달 규모의 단일 직렬화 경계: 계정 전환/철회/전송 사이 lock 순서 충돌 방지.
    cur.execute("SELECT pg_advisory_xact_lock(hashtextextended('lens-push-operations',0))")
    _account(cur,owner,create=True)


def clock(cur):
    cur.execute('SELECT clock_timestamp() AS now');return cur.fetchone()['now']


def state(cur,owner):
    cur.execute('SELECT * FROM user_notification_preferences WHERE user_id=%s',(owner,));row=cur.fetchone()
    cur.execute('SELECT * FROM user_notification_consents WHERE user_id=%s',(owner,));consent=cur.fetchone()
    return {'revision':row['revision'] if row else 0,'preferences':row['preferences'] if row else dict(policy.DEFAULT),'consent':consent}


def settle(cur,owner=None,sid=None):
    scope='d.user_id=%s' if owner is not None else 'd.id IN(SELECT delivery_id FROM user_notification_delivery_targets WHERE subscription_id=%s)'
    cur.execute("""UPDATE user_notification_deliveries d SET status=CASE
     WHEN EXISTS(SELECT 1 FROM user_notification_delivery_targets t WHERE t.delivery_id=d.id AND t.status='unknown') THEN 'unknown'
     WHEN EXISTS(SELECT 1 FROM user_notification_delivery_targets t WHERE t.delivery_id=d.id AND t.status IN('accepted','simulated')) THEN 'done'
     WHEN NOT EXISTS(SELECT 1 FROM user_notification_delivery_targets t WHERE t.delivery_id=d.id AND t.status<>'canceled') THEN 'canceled'
     ELSE 'failed' END WHERE """+scope+""" AND d.status IN('queued','processing')
     AND NOT EXISTS(SELECT 1 FROM user_notification_delivery_targets t WHERE t.delivery_id=d.id AND t.status IN('queued','retry','sending'))""",(owner if owner is not None else sid,))


def cancel_targets(cur,owner=None,sid=None):
    scope='d.user_id=%s' if owner is not None else 't.subscription_id=%s'
    # live의 leased target은 프로세스 중단 직전에 전송했을 가능성이 있다.
    # 철회는 재전송을 막으며, 미확정 흔적을 canceled로 지우지 않는다.
    cur.execute("""UPDATE user_notification_delivery_targets t SET
     status=CASE WHEN d.mode='live' AND t.status='sending' THEN 'unknown' ELSE 'canceled' END,
     lease_token=NULL,lease_until=NULL,next_attempt_at=NULL FROM user_notification_deliveries d
     WHERE d.id=t.delivery_id AND """+scope+" AND t.status IN('queued','retry','sending')",(owner if owner is not None else sid,))
    settle(cur,owner,sid)


def cancel(cur,owner):
    cancel_targets(cur,owner=owner)


def view(cur,owner):
    data=state(cur,owner);p,c=data['preferences'],data['consent'];config=policy.public_config()
    cur.execute('SELECT id,active,simulated,created_at,updated_at FROM user_push_subscriptions WHERE user_id=%s AND (expires_at IS NULL OR expires_at>now()) ORDER BY active DESC,(simulated=%s) DESC,updated_at DESC LIMIT 50',(owner,config['mode']=='dry_run'))
    subs=[{**dict(row),'id':str(row['id']),'created_at':row['created_at'].isoformat(),'updated_at':row['updated_at'].isoformat()} for row in cur.fetchall()]
    cur.execute('SELECT count(*) AS n FROM user_push_subscriptions WHERE user_id=%s AND active AND simulated=%s AND (expires_at IS NULL OR expires_at>clock_timestamp())',(owner,config['mode']=='dry_run'))
    active=cur.fetchone()['n']
    blocked=[]
    if not any(p[k] for k in ('briefing','followups','weekly')):blocked.append('no_types')
    if not policy.consent_valid(c):blocked.append('no_consent' if not c or not c['granted'] else 'policy_pending')
    if not active:blocked.append('no_subscription')
    if not config['supported']:blocked.append('provider_unavailable')
    cur.execute('SELECT max(sent_at) AS sent,max(simulated_at) AS simulated FROM user_notification_deliveries WHERE user_id=%s',(owner,));last=cur.fetchone()
    consent={'channel':'web_push','granted':bool(c and c['granted']),'policy_version':c['policy_version'] if c else config['policy_version'],'agreed_at':c['agreed_at'].isoformat() if c and c['agreed_at'] else None,'revoked_at':c['revoked_at'].isoformat() if c and c['revoked_at'] else None,'current':policy.consent_valid(c)}
    return {**data,'consent':consent,'config':config,'subscriptions':subs,'delivery':{'mode':config['mode'],'supported':config['supported'],'status':'paused' if p['paused'] else 'blocked' if blocked else 'ready','blocked_reasons':blocked,'active_subscriptions':active,'last_sent_at':last['sent'].isoformat() if last['sent'] else None,'last_simulated_at':last['simulated'].isoformat() if last['simulated'] else None}}


def get(owner):
    with get_cursor() as cur:
        _account(cur,owner);return view(cur,owner)


def save(owner,body):
    p=policy.preferences(body)
    with get_cursor() as cur:
        lock(cur,owner);previous=state(cur,owner)
        if previous['revision']!=body['revision']:raise DashboardError(409,'REVISION_CONFLICT','다른 기기에서 설정이 바뀌었어요. 다시 확인해 주세요.')
        cur.execute('INSERT INTO user_notification_preferences(user_id,preferences,revision) VALUES(%s,%s,1) ON CONFLICT(user_id) DO UPDATE SET preferences=EXCLUDED.preferences,revision=user_notification_preferences.revision+1,updated_at=now()',(owner,Json(p)))
        cancel(cur,owner)
        return view(cur,owner)


def consent(owner,body):
    if not isinstance(body,dict) or set(body)!={'channel','granted','policy_version'} or body['channel']!='web_push' or type(body['granted']) is not bool or not isinstance(body['policy_version'],str) or len(body['policy_version'])>64:policy.invalid()
    if body['granted'] and body['policy_version']!=policy.policy_version():raise DashboardError(409,'POLICY_VERSION_CHANGED','변경된 수신 동의 내용을 다시 확인해 주세요.')
    with get_cursor() as cur:
        lock(cur,owner);old=state(cur,owner)['consent'];now=clock(cur)
        changed=not old or old['granted']!=body['granted'] or old['policy_version']!=body['policy_version']
        if changed:
            cur.execute('INSERT INTO user_notification_consents(user_id,granted,policy_version,agreed_at,revoked_at) VALUES(%s,%s,%s,%s,%s) ON CONFLICT(user_id) DO UPDATE SET granted=EXCLUDED.granted,policy_version=EXCLUDED.policy_version,agreed_at=EXCLUDED.agreed_at,revoked_at=EXCLUDED.revoked_at,updated_at=now()',(owner,body['granted'],body['policy_version'],now if body['granted'] else old['agreed_at'] if old else None,None if body['granted'] else now))
            cur.execute('INSERT INTO user_notification_consent_events(user_id,granted,policy_version) VALUES(%s,%s,%s)',(owner,body['granted'],body['policy_version']))
        if not body['granted']:
            cur.execute('UPDATE user_push_subscriptions SET active=false,revoked_at=now(),updated_at=now() WHERE user_id=%s',(owner,));cancel(cur,owner)
        return view(cur,owner)


def register(owner,body):
    with get_cursor() as cur:
        lock(cur,owner);now=clock(cur);s,simulated=policy.subscription(body,now)
        if not policy.consent_valid(state(cur,owner)['consent']):raise DashboardError(400,'NO_CONSENT','먼저 개인화 푸시 수신에 동의해 주세요.')
        endpoint_hash=hashlib.sha256(s['endpoint'].encode()).hexdigest()
        cur.execute('SELECT * FROM user_push_subscriptions WHERE endpoint_hash=%s FOR UPDATE',(endpoint_hash,));previous=cur.fetchone()
        if previous and previous['user_id']!=owner:
            old=policy.decrypt(previous['subscription_encrypted'],previous['encryption_key_version'])
            if not hmac.compare_digest(policy.decode64(old['keys']['p256dh']),policy.decode64(s['keys']['p256dh'])) or not hmac.compare_digest(policy.decode64(old['keys']['auth']),policy.decode64(s['keys']['auth'])):raise DashboardError(409,'SUBSCRIPTION_CONFLICT','이 기기의 연결 정보를 다시 확인해 주세요.')
            cancel_targets(cur,sid=previous['id'])
        if not previous:
            cur.execute("SELECT count(*) AS n FROM user_push_subscriptions WHERE user_id=%s AND created_at>now()-interval '24 hours'",(owner,))
            if cur.fetchone()['n']>=50:raise DashboardError(429,'RATE_LIMITED','오늘의 기기 연결 한도를 넘었어요.')
        sid=str(previous['id']) if previous else str(uuid.uuid4())
        expiration=dt.datetime.fromtimestamp(s['expirationTime']/1000,dt.timezone.utc) if s['expirationTime'] is not None else None
        cur.execute('INSERT INTO user_push_subscriptions(id,user_id,endpoint_hash,subscription_encrypted,encryption_key_version,simulated,expires_at) VALUES(%s,%s,%s,%s,%s,%s,%s) ON CONFLICT(endpoint_hash) DO UPDATE SET user_id=EXCLUDED.user_id,subscription_encrypted=EXCLUDED.subscription_encrypted,encryption_key_version=EXCLUDED.encryption_key_version,simulated=EXCLUDED.simulated,expires_at=EXCLUDED.expires_at,active=true,revoked_at=NULL,updated_at=now() RETURNING created_at',(sid,owner,endpoint_hash,policy.encrypt(s),policy.key_version(),simulated,expiration))
        return {'id':sid,'active':True,'simulated':simulated,'created_at':cur.fetchone()['created_at'].isoformat(),'created':previous is None}


def remove(owner,sid):
    try:sid=str(uuid.UUID(sid))
    except (ValueError,TypeError,AttributeError):raise DashboardError(404,'NOT_FOUND','기기를 찾을 수 없어요.') from None
    with get_cursor() as cur:
        lock(cur,owner)
        cur.execute('UPDATE user_push_subscriptions SET active=false,revoked_at=now(),updated_at=now() WHERE id=%s AND user_id=%s RETURNING id',(sid,owner))
        if not cur.fetchone():raise DashboardError(404,'NOT_FOUND','기기를 찾을 수 없어요.')
        cancel_targets(cur,sid=sid)
        return {'id':sid,'active':False}
