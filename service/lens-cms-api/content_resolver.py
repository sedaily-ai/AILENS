"""개인 저장의 콘텐츠 정본. 숫자 slug를 ID로 추정하지 않는다."""
from urllib.parse import quote


class DashboardError(Exception):
    def __init__(self, status, code, message):
        self.status, self.code, self.message = status, code, message
        super().__init__(message)


def resolve_content(cur, kind: str, key_type: str, key: str) -> dict:
    if kind not in ('publication', 'issue_letter') or key_type not in ('id', 'slug'):
        raise DashboardError(400, 'INVALID_ARGUMENT', '콘텐츠 종류와 식별자 형식을 확인해 주세요.')
    if not isinstance(key, str) or not key or len(key) > 255:
        raise DashboardError(400, 'INVALID_ARGUMENT', '콘텐츠 식별자를 확인해 주세요.')
    if key_type == 'id' and (not key.isascii() or not key.isdigit() or not 0 < int(key) < 2**63):
        raise DashboardError(400, 'INVALID_ARGUMENT', '콘텐츠 ID를 확인해 주세요.')
    if kind == 'publication':
        if key_type == 'id':
            cur.execute("SELECT id,slug,title,published_at FROM publications WHERE id=%s AND status='published' AND deleted_at IS NULL AND published_at<=clock_timestamp()", (int(key),))
        else:
            cur.execute("SELECT p.id,p.slug,p.title,p.published_at FROM publications p WHERE p.status='published' AND p.deleted_at IS NULL AND p.published_at<=clock_timestamp() "
                        "AND (p.slug=%s OR (NOT EXISTS (SELECT 1 FROM publications WHERE slug=%s) AND p.id IN "
                        "(SELECT publication_id FROM publication_slug_history WHERE old_slug=%s)))", (key, key, key))
    else:
        field = 'id' if key_type == 'id' else 'slug'  # allowlist only
        cur.execute(f"SELECT id,slug,title,published_at,deck FROM issue_letters WHERE {field}=%s "
                    "AND status='published' AND deleted_at IS NULL AND published_at<=clock_timestamp()", (int(key) if key_type == 'id' else key,))
    row = cur.fetchone()
    if row is None:
        raise DashboardError(404, 'NOT_FOUND', '공개된 콘텐츠를 찾을 수 없어요.')
    return {**dict(row), 'id': str(row['id']), 'content_key': f"{kind}:{row['id']}",
            'href': f"/{'lens' if kind == 'publication' else 'letter'}/{quote(row['slug'], safe='')}", 'kind': kind}

# 실제 서랍의 두 기존 source 경로를 같은 publication으로 연결한다.
ARCHIVE_SOURCE_JOIN_SQL = """LEFT JOIN renditions ar ON ar.id=ua.rendition_id
LEFT JOIN publications ap ON ap.slug=ua.article_no OR (ua.article_no IS NULL AND ap.id=ar.publication_id)"""
