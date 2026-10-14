"""완료 메타데이터 snapshot과 동일 트랜잭션의 완료/스탬프/배지 저장."""
import datetime as dt
from zoneinfo import ZoneInfo
from urllib.parse import urlsplit
from completion_rules import VERSION
from content_body import BLOCK_READABLE_SQL,ISSUE_BODY_READABLE_SQL

BADGES = [('steady_week','꾸준한 시선',3),('discovery_week','새로운 발견',3),('revisit_week','다시 보는 깊이',2)]


def metadata(cur, key, fmt, card):
    kind, lid = key.split(':')
    cur.execute('SELECT group_key FROM content_reward_groups WHERE content_key=%s',(key,))
    mapping = cur.fetchone()
    group = mapping['group_key'] if mapping else key if kind=='publication' else None
    primary_category=next(iter(card['category_keys']),None)
    if kind=='issue_letter':
        cur.execute('SELECT category_slug FROM issue_letter_categories WHERE letter_id=%s AND is_primary ORDER BY category_slug LIMIT 1',(int(lid),))
        primary=cur.fetchone()
        primary_category=primary['category_slug'] if primary and primary['category_slug'] in card['category_keys'] else None
    panels, panel_urls, duration, media_url, body_hash = [], [], None, None, None
    if fmt=='letter':
        if kind=='publication':
            cur.execute(f"SELECT md5(string_agg(concat_ws('|',b.content::text,b.image_url,b.position::text),'|' ORDER BY b.position,b.id)) AS hash FROM rendition_blocks b JOIN renditions r ON r.id=b.rendition_id WHERE r.publication_id=%s AND r.format='letter' AND r.status='ready' AND {BLOCK_READABLE_SQL}",(int(lid),))
        else:
            cur.execute(f"SELECT md5(string_agg(s.paragraphs::text,'|' ORDER BY s.position)) AS hash FROM issue_letter_sections s WHERE s.letter_id=%s AND {ISSUE_BODY_READABLE_SQL}",(int(lid),))
        body_hash=cur.fetchone()['hash']
    if kind=='publication' and fmt=='webtoon':
        cur.execute("SELECT w.id,w.image_url FROM webtoon_panels w JOIN renditions r ON r.id=w.rendition_id WHERE r.publication_id=%s AND r.format='webtoon' AND r.status='ready' AND w.image_url ~ '[^[:space:]]' ORDER BY w.position,w.id",(int(lid),))
        rows=cur.fetchall();panels=[str(row['id']) for row in rows];panel_urls=[row['image_url'] for row in rows]
    if kind=='publication' and fmt in ('podcast','video'):
        cur.execute("SELECT m.duration_seconds,m.file_url FROM media_assets m JOIN renditions r ON r.id=m.rendition_id WHERE r.publication_id=%s AND r.format=%s AND r.status='ready' AND m.file_url ~ '[^[:space:]]'",(int(lid),fmt))
        row = cur.fetchone()
        duration = float(row['duration_seconds']) if row and row['duration_seconds'] is not None else None
        media_url = row['file_url'] if row else None
    embedded=(urlsplit(media_url or '').hostname or '').lower().removeprefix('www.') in ('youtube.com','youtu.be','m.youtube.com','tv.naver.com')
    enabled = fmt=='letter' and body_hash is not None or fmt=='webtoon' and 0<len(panels)<=500 or fmt in ('podcast','video') and duration is not None and bool(media_url) and not embedded
    return {'completion_enabled':enabled,'group_key':group,'primary_category':primary_category,
            'body_hash':body_hash,'panel_ids':panels,'panel_urls':panel_urls,'duration_seconds':duration,'media_url':media_url,'minimum_visible_ms':30000 if fmt=='letter' else 10000 if fmt=='webtoon' else None,
            'coverage_ratio':.8,'pending_reason':None if enabled else 'DIRECT_MEDIA_REQUIRED' if embedded else 'BODY_REQUIRED' if fmt=='letter' else 'MEDIA_METADATA_REQUIRED'}


def week_start(day):
    return day-dt.timedelta(days=day.weekday())


def weekly_progress(cur, owner, week):
    end = week+dt.timedelta(days=7)
    cur.execute('SELECT count(*) AS n FROM user_daily_stamps WHERE user_id=%s AND stamp_day>=%s AND stamp_day<%s',(owner,week,end))
    steady = cur.fetchone()['n']
    cur.execute('SELECT count(DISTINCT primary_category) AS n FROM user_content_completions WHERE user_id=%s AND completed_day>=%s AND completed_day<%s AND first_completion AND primary_category IS NOT NULL',(owner,week,end))
    discovery = cur.fetchone()['n']
    cur.execute('SELECT count(DISTINCT group_key) AS n FROM user_content_completions WHERE user_id=%s AND completed_day>=%s AND completed_day<%s AND qualifying_revisit',(owner,week,end))
    return {'steady_week':steady,'discovery_week':discovery,'revisit_week':cur.fetchone()['n']}


def saved_before(cur, owner, key, started):
    kind, lid = key.split(':')
    if kind=='issue_letter':
        cur.execute('SELECT 1 FROM user_letter_bookmarks WHERE user_id=%s AND issue_letter_id=%s AND saved_at<%s',(owner,int(lid),started))
    else:
        cur.execute('SELECT 1 FROM user_archives a JOIN publications p ON p.id=%s WHERE a.user_id=%s AND a.saved_at<%s AND (a.article_no=p.slug OR a.rendition_id IN(SELECT id FROM renditions WHERE publication_id=p.id)) LIMIT 1',(int(lid),owner,started))
    return cur.fetchone() is not None


def record(cur, owner, session, now):
    rules = session['completion_rules']; group = rules.get('group_key')
    day = now.astimezone(ZoneInfo('Asia/Seoul')).date()
    cur.execute('SELECT * FROM user_content_completions WHERE session_id=%s',(session['id'],))
    previous = cur.fetchone()
    if previous:
        return {'status':'already_awarded' if group else 'pending','stamp_awarded':False,'pending_reason':None if group else 'REWARD_GROUP_REQUIRED'},[]
    cur.execute('INSERT INTO user_content_completions(session_id,user_id,content_key,group_key,format,primary_category,completed_at,completed_day,rule_version) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s)',(session['id'],owner,session['content_key'],group,session['format'],rules.get('primary_category'),now,day,VERSION))
    if group is None:
        return {'status':'pending','stamp_awarded':False,'pending_reason':'REWARD_GROUP_REQUIRED'},[]
    cur.execute('INSERT INTO user_content_first_completions(user_id,group_key,session_id,completed_at) VALUES(%s,%s,%s,%s) ON CONFLICT DO NOTHING RETURNING session_id',(owner,group,session['id'],now))
    first = cur.fetchone() is not None
    revisit = False
    if not first:
        cur.execute('SELECT max(completed_at) AS last FROM user_content_completions WHERE user_id=%s AND group_key=%s AND session_id<>%s',(owner,group,session['id']))
        last = cur.fetchone()['last']
        revisit = bool(last and last+dt.timedelta(minutes=30)<=session['started_at'] and saved_before(cur,owner,session['content_key'],session['started_at']))
    cur.execute('UPDATE user_content_completions SET first_completion=%s,qualifying_revisit=%s WHERE session_id=%s',(first,revisit,session['id']))
    stamped = False
    awards = []
    if first:
        cur.execute('INSERT INTO user_daily_stamps(user_id,stamp_day,awarded_at,source_session_id) VALUES(%s,%s,%s,%s) ON CONFLICT DO NOTHING RETURNING stamp_day',(owner,day,now,session['id']))
        stamped = cur.fetchone() is not None
        if stamped:awards.append({'type':'stamp','date':day.isoformat()})
    week = week_start(day)
    progress = weekly_progress(cur,owner,week)
    for bid,title,target in BADGES:
        if progress[bid]>=target:
            cur.execute('INSERT INTO user_weekly_badges(user_id,week_start,badge_id,earned_at,rule_version) VALUES(%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING RETURNING badge_id',(owner,week,bid,now,VERSION))
            if cur.fetchone():awards.append({'type':'badge','id':bid,'title':title,'week_start':week.isoformat()})
    return {'status':'awarded' if awards else 'already_awarded','stamp_awarded':stamped,'pending_reason':None},awards
