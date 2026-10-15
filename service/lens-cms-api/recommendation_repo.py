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


def inputs(owner, sentence_id=None, include_recent=True):
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
        target=''
        params=[owner]
        if sentence_id is not None:
            if not isinstance(sentence_id,str) or not sentence_id.isascii() or not sentence_id.isdigit() or not 0<int(sentence_id)<2**63:
                raise DashboardError(404,'NOT_FOUND','문장을 찾을 수 없어요.')
            target=' AND id=%s'; params.append(int(sentence_id))
            cur.execute('SELECT id FROM user_archives WHERE user_id=%s'+target,params)
            if not cur.fetchone():
                raise DashboardError(404,'NOT_FOUND','문장을 찾을 수 없어요.')
        sentence_words=[]
        if sentence_id is not None:
            cur.execute("SELECT word,count(*) AS n FROM user_archives CROSS JOIN LATERAL regexp_split_to_table(lower(normalize(content,NFKC)),'[^a-z0-9가-힣]+') word WHERE user_id=%s"+target+" AND length(word) BETWEEN 2 AND 40 GROUP BY word ORDER BY n DESC,word LIMIT 64",params)
            sentence_words=[dict(row) for row in cur.fetchall()]
        cur.execute('SELECT count(*) AS n FROM user_archives WHERE user_id=%s',(owner,))
        total=cur.fetchone()['n']
        recent=[]
        if include_recent:
            cur.execute(_ARCHIVE_SELECT+' WHERE ua.user_id=%s ORDER BY ua.saved_at DESC,ua.id DESC LIMIT 3',(owner,))
            recent=[_archive_to_dict(row) for row in cur.fetchall()]
        from format_preference_repo import preference
        from account_connections_repo import followed
        format_preference=preference(cur,owner)
        followed_editors=followed(cur,owner)
        return {'format_preference':format_preference,'followed_editors':followed_editors,'preferences':preferences,'categories':categories,'sentence_words':sentence_words,
                'coverage':coverage,'recent_sentences':recent,'sentence_total':total}


def candidates(owner,payload):
    kind=payload.get('kind') if isinstance(payload,dict) else None
    if kind not in ('publication','issue_letter'):
        raise DashboardError(400,'INVALID_ARGUMENT','추천 종류를 확인해 주세요.')
    cats,terms=payload.get('categories',[]),payload.get('terms',[])
    if not isinstance(cats,list) or len(cats)>9 or not all(isinstance(x,str) and len(x)<=64 for x in cats) or not isinstance(terms,list) or len(terms)>64 or not all(isinstance(x,str) and 2<=len(x)<=64 for x in terms):
        raise DashboardError(400,'INVALID_ARGUMENT','추천 조건을 확인해 주세요.')
    editors=payload.get('editors',[])
    if not isinstance(editors,list) or len(editors)>50 or any(not isinstance(e,str) or not 0<len(e)<=32 for e in editors):
        raise DashboardError(400,'INVALID_ARGUMENT','에디터 조건을 확인해 주세요.')
    with get_cursor() as cur:
        _account(cur,owner)
        items=load_cards(cur,kind,owner=owner,categories=cats,terms=terms,editors=editors,match=True,exclude_seen=kind=='publication')
        latest=load_cards(cur,kind,owner=owner,exclude_seen=kind=='publication',limit=20)
        return {'items':items,'latest':latest,'candidate_limit':200}
