"""준비된 실제 본문 판별 SQL. TEXT 블록과 JSONB 레터 문단을 구분한다."""
BLOCK_READABLE_SQL = "(b.content::text ~ '[^[:space:]]' OR b.image_url ~ '[^[:space:]]')"
# 문단의 plain string 또는 화면에 렌더되는 rich text/차트 필드만 검사한다.
# href/block 같은 메타데이터 문자열만 있는 항목은 본문으로 보지 않는다.
_paths = ('$[*][*]', '$.**.text', '$.**.label', '$.**.title', '$.**.value')
ISSUE_BODY_READABLE_SQL = '(' + ' OR '.join(
    "jsonb_path_exists(COALESCE(s.paragraphs,'[]'::jsonb), '"+path+' ? (@.type() == "string" && @ like_regex "[^[:space:]]")'+"')"
    for path in _paths
) + ')'
