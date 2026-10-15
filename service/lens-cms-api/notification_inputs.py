"""알림 후보 입력. 허용된 최근 열람 분야를 쓰며 최근 문장 원문은 반환하지 않는다."""
import datetime as dt
from db import get_cursor
from content_resolver import ARCHIVE_SOURCE_JOIN_SQL
from dashboard_repo import _account
import notifications_repo as repo
import notification_policy as policy
from recommendation_repo import inputs as recommendation_inputs
from content_metadata import load_cards
from completion_repo import week_start
from notification_delivery_repo import fingerprint,notified_keys


def context(owner):
    with get_cursor() as cur:
        _account(cur,owner);data=repo.view(cur,owner);now=repo.clock(cur);data['server_now']=now.isoformat();data['source_fingerprint']=fingerprint(cur,owner);data['notified_keys']=list(notified_keys(cur,owner));data['due_types']=policy.due_types(data['preferences'],now);return data


def inputs(owner):
    with get_cursor() as cur:
        _account(cur,owner);state=repo.state(cur,owner)
    data=recommendation_inputs(owner,include_recent=False)
    if not state['preferences']['categorySource']:data['categories']=[]
    return data


def candidates(owner):
    with get_cursor() as cur:
        _account(cur,owner);now=repo.clock(cur)
        cur.execute(f"""WITH saved AS (
         SELECT 'issue_letter:'||issue_letter_id AS key,saved_at FROM user_letter_bookmarks WHERE user_id=%s
         UNION ALL SELECT 'publication:'||ap.id,ua.saved_at FROM user_archives ua {ARCHIVE_SOURCE_JOIN_SQL} WHERE ua.user_id=%s AND ap.id IS NOT NULL
        ) SELECT DISTINCT f.target_content_key AS key FROM content_followup_links f JOIN saved s ON s.key=f.source_content_key WHERE f.editor_approved AND f.created_at>=s.saved_at LIMIT 100""",(owner,owner))
        keys=[r['key'] for r in cur.fetchall()];cards=[]
        for kind in ('publication','issue_letter'):
            ids=[int(key.split(':')[1]) for key in keys if key.startswith(kind+':')]
            if ids:cards.extend(load_cards(cur,kind,owner=owner,ids=ids,limit=100))
        cards=[c for c in cards if not c['viewed'] and dt.datetime.fromisoformat(c['published_at'])>=now-dt.timedelta(hours=72)]
        start=week_start((now+dt.timedelta(hours=9)).date())-dt.timedelta(days=7)
        cur.execute("SELECT (SELECT count(*) FROM user_archives WHERE user_id=%s AND (saved_at AT TIME ZONE 'Asia/Seoul')::date BETWEEN %s AND %s)+(SELECT count(*) FROM user_letter_bookmarks WHERE user_id=%s AND (saved_at AT TIME ZONE 'Asia/Seoul')::date BETWEEN %s AND %s) AS n",(owner,start,start+dt.timedelta(days=6),owner,start,start+dt.timedelta(days=6)))
        saved=cur.fetchone()['n']
        cur.execute('SELECT count(DISTINCT completed_day) AS n FROM user_content_completions WHERE user_id=%s AND completed_day BETWEEN %s AND %s',(owner,start,start+dt.timedelta(days=6)));read_days=cur.fetchone()['n']
    return {'followups':cards,'weekly':{'start':start.isoformat(),'end':(start+dt.timedelta(days=6)).isoformat(),'read_days':read_days,'saved_contents':saved},'server_now':now.isoformat(),'mode':policy.mode()}


def due(limit=100,claim_mode=None):
    if type(limit) is not int or not 1<=limit<=100:policy.invalid()
    if claim_mode is not None and claim_mode!=policy.mode():raise policy.DashboardError(409,'MODE_CHANGED','발송 모드가 바뀌었어요.')
    with get_cursor() as cur:
        if claim_mode is not None:
            cur.execute("SELECT pg_advisory_xact_lock(hashtextextended('lens-push-operations',0))")
            if claim_mode!=policy.mode():raise policy.DashboardError(409,'MODE_CHANGED','발송 모드가 바뀌었어요.')
        now=repo.clock(cur)
        cur.execute("""SELECT p.user_id,p.preferences FROM user_notification_preferences p
         JOIN user_notification_consents c ON c.user_id=p.user_id AND c.granted AND c.policy_version=%s
         JOIN users u ON u.id=p.user_id AND u.status='active'
         CROSS JOIN LATERAL (SELECT timezone(p.preferences->>'timezone',%s::timestamptz) AS local) moment
         WHERE NOT (p.preferences->>'paused')::boolean
         AND to_char(moment.local,'HH24:MI') BETWEEN '08:00' AND '20:59'
         AND to_char(moment.local,'HH24:MI')>=p.preferences->>'time'
         AND (((p.preferences->>'briefing')::boolean OR (p.preferences->>'followups')::boolean)
           AND (p.preferences->>'frequency'='daily' OR EXTRACT(isodow FROM moment.local) IN(1,3,5))
          OR (p.preferences->>'weekly')::boolean AND EXTRACT(dow FROM moment.local)=(p.preferences->>'weeklyDay')::int)
         AND EXISTS(SELECT 1 FROM user_push_subscriptions s WHERE s.user_id=p.user_id AND s.active AND s.simulated=%s AND (s.expires_at IS NULL OR s.expires_at>now()))
         ORDER BY p.scan_checked_at NULLS FIRST,p.user_id LIMIT %s""",(policy.policy_version(),now,policy.mode()=='dry_run',limit))
        rows=cur.fetchall()
        if claim_mode is not None and rows:
            cur.execute('UPDATE user_notification_preferences SET scan_checked_at=clock_timestamp() WHERE user_id=ANY(%s)',([r['user_id'] for r in rows],))
    return {'owners':[r['user_id'] for r in rows if policy.due_types(r['preferences'],now)],'server_now':now.isoformat(),'mode':policy.mode()}
