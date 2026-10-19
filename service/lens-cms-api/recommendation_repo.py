"""열람 분야·추천 입력 primitive. 소유자 필터와 공개 상태는 SQL에서 적용."""
from db import get_cursor
from dashboard_repo import _account, _preferences
from content_resolver import DashboardError
from content_metadata import CATEGORY_SQL, load_cards
from personal_repo import _ARCHIVE_SELECT, _archive_to_dict

EVIDENCE = """WITH evidence AS (
 SELECT content_key,last_seen_at FROM user_content_views WHERE user_id=%s AND last_seen_at>now()-interval '90 days'
 UNION
 SELECT 'publication:'||publication_id,read_at FROM user_readings WHERE user_id=%s AND publication_id IS NOT NULL AND read_at>now()-interval '90 days'
), keys AS (SELECT DISTINCT content_key FROM evidence), meta AS MATERIALIZED (
 SELECT k.content_key,ARRAY["""+CATEGORY_SQL+"""] AS cats
 FROM keys k JOIN publications p ON k.content_key='publication:'||p.id LEFT JOIN categories c ON c.id=p.category_id
 WHERE p.status='published' AND p.deleted_at IS NULL
 UNION ALL
 SELECT k.content_key,ARRAY(SELECT category_slug FROM issue_letter_categories WHERE letter_id=l.id)
 FROM keys k JOIN issue_letters l ON k.content_key='issue_letter:'||l.id WHERE l.status='published' AND l.deleted_at IS NULL
) """


def inputs(owner, *, include_recent=True):
    with get_cursor() as cur:
        _account(cur,owner)
        cur.execute('SELECT * FROM user_lens_preferences WHERE user_id=%s',(owner,))
        preferences=_preferences(cur.fetchone())
        cur.execute(EVIDENCE+'SELECT category AS key,count(DISTINCT content_key) AS n FROM meta CROSS JOIN LATERAL unnest(cats) category WHERE category IS NOT NULL GROUP BY category ORDER BY n DESC,category LIMIT 9',(owner,owner))
        categories=[dict(row) for row in cur.fetchall()]
        cur.execute(EVIDENCE+"SELECT (SELECT count(*) FROM keys WHERE NOT EXISTS(SELECT 1 FROM meta WHERE meta.content_key=keys.content_key)) AS unmatched,(SELECT count(*) FROM keys WHERE content_key LIKE 'publication:%%') AS news_count,(SELECT count(*) FROM keys WHERE content_key LIKE 'issue_letter:%%') AS letter_count",(owner,owner))
        coverage=dict(cur.fetchone())
        cur.execute("SELECT count(*) AS n FROM user_readings WHERE user_id=%s AND publication_id IS NULL AND read_at>now()-interval '90 days'",(owner,))
        coverage['unmatched']+=cur.fetchone()['n']
        # 저장 문장 관련 글(문장 단어 추출·sentence_id)은 2026-10-19 기능 다이어트로 제거했다.
        cur.execute('SELECT count(*) AS n FROM user_archives WHERE user_id=%s',(owner,))
        total=cur.fetchone()['n']
        recent=[]
        if include_recent:
            cur.execute(_ARCHIVE_SELECT+' WHERE ua.user_id=%s ORDER BY ua.saved_at DESC,ua.id DESC LIMIT 3',(owner,))
            recent=[_archive_to_dict(row) for row in cur.fetchall()]
        from account_connections_repo import followed
        followed_editors=followed(cur,owner)
        # 형식 비율 계산은 제거됐다. 예전 service/backend가 data['format_preference']를 직접 읽어
        # 키가 없으면 대시보드 전체가 실패하므로 빈 값(None)으로만 남긴다. 다음 정리 때 제거.
        return {'format_preference':None,'followed_editors':followed_editors,'preferences':preferences,'categories':categories,
                'coverage':coverage,'recent_sentences':recent,'sentence_total':total}


def candidates(owner,payload):
    kind=payload.get('kind') if isinstance(payload,dict) else None
    if kind not in ('publication','issue_letter'):
        raise DashboardError(400,'INVALID_ARGUMENT','추천 종류를 확인해 주세요.')
    # terms(저장 문장 단어 일치)는 제거됐다. 예전 service/backend가 보내도 받기만 하고 쓰지 않는다. 다음 정리 때 제거.
    cats=payload.get('categories',[])
    if not isinstance(cats,list) or len(cats)>9 or not all(isinstance(x,str) and len(x)<=64 for x in cats):
        raise DashboardError(400,'INVALID_ARGUMENT','추천 조건을 확인해 주세요.')
    editors=payload.get('editors',[])
    if not isinstance(editors,list) or len(editors)>50 or any(not isinstance(e,str) or not 0<len(e)<=32 for e in editors):
        raise DashboardError(400,'INVALID_ARGUMENT','에디터 조건을 확인해 주세요.')
    with get_cursor() as cur:
        _account(cur,owner)
        items=load_cards(cur,kind,owner=owner,categories=cats,editors=editors,match=True,exclude_seen=kind=='publication')
        latest=load_cards(cur,kind,owner=owner,exclude_seen=kind=='publication',limit=20)
        return {'items':items,'latest':latest,'candidate_limit':200}
