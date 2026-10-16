"""원장 전체의 KST 주/월/년 집계. 조회로 보상/완료를 생성하지 않는다."""
import calendar
import datetime as dt
from db import get_cursor
from dashboard_repo import _account
from content_resolver import DashboardError
from completion_repo import BADGES, week_start


def server_today(cur):
    cur.execute("SELECT (now() AT TIME ZONE 'Asia/Seoul')::date AS today,(started_at AT TIME ZONE 'Asia/Seoul')::date AS coverage_start FROM content_completion_coverage WHERE singleton")
    return cur.fetchone()


def anchor_date(value, today, coverage, boundary_week=False):
    try:
        day=dt.date.fromisoformat(value) if value is not None else today
        if value is not None and day.isoformat()!=value:raise ValueError()
        boundary=boundary_week and coverage.year==day.year+1 and week_start(day)+dt.timedelta(days=6)>=dt.date(coverage.year,1,1)
        if not (coverage.year<=day.year<=today.year or boundary) or day>today:raise ValueError()
        return day
    except (ValueError,TypeError):
        raise DashboardError(400,'INVALID_ARGUMENT','수집 시작 연도부터 오늘까지의 날짜를 선택해 주세요.') from None


def activity(owner, period='week', anchor=None):
    if period not in ('week','month','year'):raise DashboardError(400,'INVALID_ARGUMENT','주/월/연 기간을 선택해 주세요.')
    with get_cursor() as cur:
        _account(cur,owner)
        clock=server_today(cur);today,coverage=clock['today'],clock['coverage_start']
        day=anchor_date(anchor,today,coverage,period=='week')
        start=week_start(day) if period=='week' else day.replace(day=1) if period=='month' else day.replace(month=1,day=1)
        end=start+dt.timedelta(days=6) if period=='week' else start.replace(day=calendar.monthrange(start.year,start.month)[1]) if period=='month' else start.replace(month=12,day=31)
        args=(owner,start,end)
        cur.execute('SELECT completed_day AS day,count(DISTINCT COALESCE(group_key,content_key)) AS n FROM user_content_completions WHERE user_id=%s AND completed_day BETWEEN %s AND %s GROUP BY completed_day',args)
        daily={r['day']:r['n'] for r in cur.fetchall()}
        cur.execute('SELECT stamp_day FROM user_daily_stamps WHERE user_id=%s AND stamp_day BETWEEN %s AND %s',args)
        stamps={r['stamp_day'] for r in cur.fetchall()}
        cur.execute('SELECT count(DISTINCT COALESCE(group_key,content_key)) AS contents,count(DISTINCT completed_day) AS read_days,count(*) FILTER(WHERE group_key IS NULL) AS pending FROM user_content_completions WHERE user_id=%s AND completed_day BETWEEN %s AND %s',args)
        totals=dict(cur.fetchone())
        cur.execute('SELECT primary_category AS key,count(DISTINCT COALESCE(group_key,content_key)) AS count FROM user_content_completions WHERE user_id=%s AND completed_day BETWEEN %s AND %s AND primary_category IS NOT NULL GROUP BY primary_category ORDER BY count DESC,key',args)
        cats=[dict(row) for row in cur.fetchall()]
        days=[{'date':(start+dt.timedelta(days=i)).isoformat(),'completed_contents':daily.get(start+dt.timedelta(days=i),0),'stamped':start+dt.timedelta(days=i) in stamps,'future':start+dt.timedelta(days=i)>today,'covered':start+dt.timedelta(days=i)>=coverage} for i in range((end-start).days+1)]
        months=[]
        if period=='year':
            cur.execute('SELECT EXTRACT(month FROM completed_day)::int AS month,count(DISTINCT COALESCE(group_key,content_key)) AS completed_contents,count(DISTINCT completed_day) AS read_days FROM user_content_completions WHERE user_id=%s AND completed_day BETWEEN %s AND %s GROUP BY month',args)
            monthly={r['month']:dict(r) for r in cur.fetchall()}
            for m in range(1,13):
                months.append({'month':m,**monthly.get(m,{'completed_contents':0,'read_days':0}),'stamp_days':sum(d['stamped'] for d in days if int(d['date'][5:7])==m),'covered':start.replace(month=m,day=calendar.monthrange(start.year,m)[1])>=coverage,'future':start.replace(month=m)>today})
        return {'status':'ready','error':None,'data':{'period':period,'start':start.isoformat(),'end':end.isoformat(),'today':today.isoformat(),'timezone':'Asia/Seoul','coverage_start':coverage.isoformat(),'completed_contents':totals['contents'],'read_days':totals['read_days'],'stamp_days':len(stamps),'pending_rewards':totals['pending'],'days':days,'months':months,'categories':cats}}


def rewards(owner, week=None):
    with get_cursor() as cur:
        _account(cur,owner)
        clock=server_today(cur);today=clock['today']
        start=anchor_date(week,today,clock['coverage_start'],True) if week else week_start(today)
        if start.weekday()!=0:raise DashboardError(400,'INVALID_ARGUMENT','주 시작일은 월요일이에요.')

        cur.execute('SELECT badge_id,earned_at,rule_version FROM user_weekly_badges WHERE user_id=%s AND week_start=%s',(owner,start))
        earned={r['badge_id']:r for r in cur.fetchall()}
        cur.execute('SELECT stamp_day,awarded_at FROM user_daily_stamps WHERE user_id=%s AND stamp_day BETWEEN %s AND %s ORDER BY stamp_day',(owner,start,start+dt.timedelta(days=6)))
        stamps=[{'date':r['stamp_day'].isoformat(),'awarded_at':r['awarded_at'].isoformat()} for r in cur.fetchall()]
        badges=[{'id':bid,'title':title,'rule_version':earned[bid]['rule_version'] if bid in earned else 'completion-v1','period_key':start.isoformat(),'earned':bid in earned,'earned_at':earned[bid]['earned_at'].isoformat() if bid in earned else None,'progress':{'current':target if bid in earned else 0,'target':target}} for bid,title,target in BADGES]
        return {'status':'ready','error':None,'data':{'week_start':start.isoformat(),'week_end':(start+dt.timedelta(days=6)).isoformat(),'today':today.isoformat(),'coverage_start':clock['coverage_start'].isoformat(),'timezone':'Asia/Seoul','goal_days':3,'stamp_days':len(stamps),'stamps':stamps,'badges':badges}}
