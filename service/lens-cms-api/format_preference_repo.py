"""최근 90일의 실제 뉴스 형식 이용. 반복 세션 대신 콘텐츠/형식별 최대 근거만 사용."""
FORMATS = ('letter', 'webtoon', 'podcast', 'video')


def preference(cur, owner):
    cur.execute("""WITH evidence AS (
      SELECT s.content_key,s.format,bool_or(c.session_id IS NOT NULL) AS completed
      FROM user_content_sessions s
      JOIN publications p ON s.content_key='publication:'||p.id
      LEFT JOIN user_content_completions c ON c.session_id=s.id AND c.user_id=s.user_id
      WHERE s.user_id=%s AND s.updated_at>clock_timestamp()-interval '90 days'
       AND p.status='published' AND p.deleted_at IS NULL AND p.published_at<=clock_timestamp()
       AND (c.session_id IS NOT NULL OR s.visible_ms>=10000 AND (
        s.format='letter' OR s.format='webtoon' AND jsonb_array_length(s.viewed_panel_ids)>0
        OR s.format IN ('podcast','video') AND s.active_ms>=10000))
      GROUP BY s.content_key,s.format
    ) SELECT format,count(*) AS viewed,count(*) FILTER(WHERE completed) AS completed,
      sum(CASE WHEN completed THEN 3 ELSE 1 END) AS score,
      (SELECT count(DISTINCT content_key) FROM evidence) AS contents
    FROM evidence GROUP BY format""", (owner,))
    rows = {r['format']:r for r in cur.fetchall() if r['format'] in FORMATS}
    total = sum(int(r['score']) for r in rows.values())
    contents = next((int(r['contents']) for r in rows.values()), 0)
    scores = sorted({int(r['score']) for r in rows.values()}, reverse=True)
    distribution = [{'format':fmt,'viewed_contents':int(rows.get(fmt,{}).get('viewed',0)),
        'completed_contents':int(rows.get(fmt,{}).get('completed',0)),
        'score':int(rows.get(fmt,{}).get('score',0)),
        'share':round(int(rows.get(fmt,{}).get('score',0))/total,4) if total else 0,
        'rank':scores.index(int(rows[fmt]['score']))+1 if fmt in rows and contents>=3 else None} for fmt in FORMATS]
    leaders = [r['format'] for r in distribution if r['score'] and r['score']==max(scores,default=0)]
    return {'status':'ready' if contents>=3 else 'insufficient_data','algorithm_version':'format-v1',
        'window_days':90,'minimum_contents':3,'qualified_contents':contents,
        'preferred_format':leaders[0] if contents>=3 and len(leaders)==1 else None,'distribution':distribution}
