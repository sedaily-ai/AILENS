"""추천/신호용 경량 공개 메타데이터 SQL. 본문·미디어 대본은 반환하지 않는다."""
from urllib.parse import quote
from zoneinfo import ZoneInfo
from content_body import BLOCK_READABLE_SQL,ISSUE_BODY_READABLE_SQL

CATEGORY_NAMES = {'markets':'시그널','property':'부동산','economy':'경제','finance':'금융','industry':'산업','politics':'정치','national':'사회','international':'국제','culture':'문화'}
CATEGORY_ALIASES = {**{v:k for k,v in CATEGORY_NAMES.items()}, '증시':'markets','금융·정책':'finance'}
CATEGORY_SQL = "CASE " + " ".join(f"WHEN COALESCE(p.admin_extra#>>'{{body_inline,category}}',c.slug)='{label}' THEN '{key}'" for label,key in CATEGORY_ALIASES.items()) + " ELSE COALESCE(p.admin_extra#>>'{body_inline,category}',c.slug) END"
KEYWORDS_SQL = "jsonb_path_query_array(COALESCE(p.admin_extra,'{}'::jsonb), '$.body_inline.lenses[*].keywords[*] ? (@.term != \"\" && @.explain != \"\").term')"
FORMATS_SQL = f"""ARRAY(SELECT r.format FROM renditions r WHERE r.publication_id=p.id AND r.status='ready' AND (
 (r.format='letter' AND EXISTS(SELECT 1 FROM rendition_blocks b WHERE b.rendition_id=r.id AND {BLOCK_READABLE_SQL})) OR
 (r.format='webtoon' AND EXISTS(SELECT 1 FROM webtoon_panels w WHERE w.rendition_id=r.id AND w.image_url ~ '[^[:space:]]')) OR
 (r.format IN ('podcast','video') AND EXISTS(SELECT 1 FROM media_assets m WHERE m.rendition_id=r.id AND m.file_url ~ '[^[:space:]]'))
) ORDER BY r.format)"""


def load_cards(cur, kind, *, owner=None, ids=None, categories=(), terms=(), limit=200, exclude_seen=False, match=False, editors=()):
    if kind == 'publication':
        table, alias = 'publications', 'p'
        select = f"p.id,p.slug,p.title,COALESCE(p.subtitle,'') AS summary,p.published_at,ARRAY[{CATEGORY_SQL}] AS category_keys,{KEYWORDS_SQL} AS keywords,{FORMATS_SQL} AS formats,NULL::int AS read_minutes,p.admin_extra#>>'{{body_inline,category}}' AS canonical_category"
        join = ' LEFT JOIN categories c ON c.id=p.category_id'
        words = f"p.title||' '||COALESCE(p.subtitle,'')||' '||({KEYWORDS_SQL})::text"
        cats = f"ARRAY[{CATEGORY_SQL}]"
        saved = "false"
        seen = "EXISTS(SELECT 1 FROM user_content_views v WHERE v.user_id=(SELECT owner FROM actor) AND v.content_key='publication:'||p.id) OR EXISTS(SELECT 1 FROM user_readings h WHERE h.user_id=(SELECT owner FROM actor) AND h.publication_id=p.id)"
        excluded = "NOT EXISTS(SELECT 1 FROM user_archives a WHERE a.user_id=(SELECT owner FROM actor) AND (a.article_no=p.slug OR a.rendition_id IN (SELECT id FROM renditions WHERE publication_id=p.id)))"
    else:
        table, alias = 'issue_letters', 'l'
        select = "l.id,l.slug,l.title,l.deck AS summary,l.published_at,ARRAY(SELECT category_slug FROM issue_letter_categories WHERE letter_id=l.id ORDER BY is_primary DESC,category_slug) AS category_keys,ARRAY(SELECT t.name FROM issue_letter_topics lt JOIN topics t ON t.id=lt.topic_id WHERE lt.letter_id=l.id ORDER BY lt.is_primary DESC,t.name) AS keywords,ARRAY['letter']::text[] AS formats,l.read_minutes,NULL::text AS canonical_category"
        join = ''
        words = "l.title||' '||l.deck||' '||COALESCE((SELECT string_agg(t.name,' ') FROM issue_letter_topics lt JOIN topics t ON t.id=lt.topic_id WHERE lt.letter_id=l.id),'')"
        cats = 'ARRAY(SELECT category_slug FROM issue_letter_categories WHERE letter_id=l.id)'
        saved = "EXISTS(SELECT 1 FROM user_letter_bookmarks b WHERE b.user_id=(SELECT owner FROM actor) AND b.issue_letter_id=l.id)"
        seen = "EXISTS(SELECT 1 FROM user_content_views v WHERE v.user_id=(SELECT owner FROM actor) AND v.content_key='issue_letter:'||l.id)"
        excluded = 'true'
    params = [owner]
    completed=f"EXISTS(SELECT 1 FROM user_content_completions ce WHERE ce.user_id=(SELECT owner FROM actor) AND ce.content_key='{kind}:'||{alias}.id)"
    sql = f"WITH actor AS (SELECT %s::varchar AS owner) SELECT {select},({saved}) AS saved,({seen}) AS viewed,({completed}) AS completed FROM {table} {alias}{join} WHERE {alias}.status='published' AND {alias}.deleted_at IS NULL AND {alias}.published_at<=clock_timestamp()"
    if kind == 'publication':
        sql += f' AND cardinality({FORMATS_SQL})>0'
    else:
        sql += f' AND EXISTS(SELECT 1 FROM issue_letter_sections s WHERE s.letter_id=l.id AND {ISSUE_BODY_READABLE_SQL})'
    if ids is not None:
        sql += f' AND {alias}.id=ANY(%s)'; params.append(ids)
    if exclude_seen:
        sql += f' AND NOT ({seen}) AND {excluded}'
    if match:
        sql += f" AND ({cats} && %s::text[] OR EXISTS(SELECT 1 FROM unnest(%s::text[]) AS t(term) WHERE strpos(lower(normalize({words},NFKC)),t.term)>0))"
        params += [list(categories), list(terms)]
        if kind=='issue_letter' and editors:
            sql=sql[:-1]+" OR EXISTS(SELECT 1 FROM issue_letter_editors ie JOIN letter_editors e ON e.id=ie.editor_id WHERE ie.letter_id=l.id AND e.is_active AND e.slug=ANY(%s)))"
            params.append(list(editors))
    sql += f' ORDER BY {alias}.published_at DESC,{alias}.id DESC LIMIT %s'; params.append(limit)
    cur.execute(sql, params)
    rows = cur.fetchall()
    authored={}
    if kind=='issue_letter' and rows:
        cur.execute('SELECT ie.letter_id,e.slug FROM issue_letter_editors ie JOIN letter_editors e ON e.id=ie.editor_id WHERE ie.letter_id=ANY(%s) AND e.is_active ORDER BY ie.position,e.slug',([r['id'] for r in rows],))
        for row in cur.fetchall():authored.setdefault(row['letter_id'],[]).append(row['slug'])
    return [{**dict(row), 'id':str(row['id']), 'content_key':f"{kind}:{row['id']}", 'kind':kind,'editors':authored.get(row['id'],[]),
             'canonical_href':f"/{CATEGORY_ALIASES.get(row['canonical_category'],'news')}/{row['published_at'].astimezone(ZoneInfo('Asia/Seoul')).strftime('%Y/%m/%d')}/{quote(row['slug'],safe='')}" if kind=='publication' else f"/letter/{quote(row['slug'],safe='')}",
             'href':f"/{'lens' if kind=='publication' else 'letter'}/{quote(row['slug'],safe='')}",
             'published_at':row['published_at'].isoformat(), 'availability':'available',
             'category_keys':[key for key in row['category_keys'] if key in CATEGORY_NAMES], 'keywords':list(dict.fromkeys(word for word in row['keywords'] if isinstance(word,str) and 2<=len(word)<=40))} for row in rows]
