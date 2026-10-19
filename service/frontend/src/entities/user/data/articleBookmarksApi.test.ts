import { beforeEach, describe, expect, it, vi } from 'vitest';
const read = vi.hoisted(() => vi.fn());
const write = vi.hoisted(() => vi.fn());
vi.mock('@/shared/lib/auth/authReadFetch', () => ({ authReadFetch: read }));
vi.mock('@/shared/lib/auth/authFetch', () => ({ authFetch: write }));
vi.mock('@/shared/config/apiClient', () => ({ API_URL: 'http://127.0.0.1:4102' }));
import { getArticleBookmarkState, isArticleBookmarkAuthError, listArticleBookmarks, resolveArticleId, setArticleBookmark, ArticleBookmarkError } from './articleBookmarksApi';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const item = (id: string) => ({ article_id: id, saved_at: '2026-10-20T00:00:00+00:00', content: { content_key: `publication:${id}`, kind: 'publication', available: true, title: `기사 ${id}` } });

describe('저장한 기사 계정 API', () => {
  beforeEach(() => { read.mockReset(); write.mockReset(); });

  it('기사 slug를 공개 기사 ID로 확인하고 그 ID로 상태를 읽는다', async () => {
    read.mockResolvedValueOnce(json({ id: '42', content_key: 'publication:42' })).mockResolvedValueOnce(json({ article_id: '42', saved: true }));
    expect(await resolveArticleId('2026-10-19-제목 a')).toBe('42');
    expect(read.mock.calls[0][0]).toBe('http://127.0.0.1:4102/api/v2/me/content/resolve?kind=publication&key_type=slug&key=2026-10-19-%EC%A0%9C%EB%AA%A9%20a');
    expect(await getArticleBookmarkState('42')).toBe(true);
    expect(read.mock.calls[1][0]).toBe('http://127.0.0.1:4102/api/v2/me/article-bookmarks/42');
  });

  it('저장은 PUT, 해제는 DELETE로 보내고 서버가 알려 준 상태를 돌려준다', async () => {
    write.mockResolvedValueOnce(json({ article_id: '42', saved: true })).mockResolvedValueOnce(json({ article_id: '42', saved: false }));
    expect(await setArticleBookmark('42', true)).toBe(true);
    expect(write.mock.calls[0][0]).toBe('http://127.0.0.1:4102/api/v2/me/article-bookmarks/42');
    expect(write.mock.calls[0][1]).toMatchObject({ method: 'PUT', cache: 'no-store' });
    expect(await setArticleBookmark('42', false)).toBe(false);
    expect(write.mock.calls[1][1]).toMatchObject({ method: 'DELETE' });
  });

  it('목록은 커서를 끝까지 이어 받고, 같은 커서가 되돌아오면 멈춘다', async () => {
    read.mockResolvedValueOnce(json({ items: [item('43')], next_cursor: 'c1' })).mockResolvedValueOnce(json({ items: [item('42')], next_cursor: null }));
    expect((await listArticleBookmarks()).map((i) => i.article_id)).toEqual(['43', '42']);
    expect(read.mock.calls[1][0]).toBe('http://127.0.0.1:4102/api/v2/me/article-bookmarks?limit=200&cursor=c1');
    read.mockReset();
    read.mockImplementation(async () => json({ items: [item('1')], next_cursor: 'same' }));
    expect(await listArticleBookmarks(undefined, 25)).toHaveLength(2);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('모양이 틀린 응답·오류 응답은 실패로 알리고, 401은 로그인 필요로 구분한다', async () => {
    read.mockResolvedValueOnce(json({ items: 'broken' }));
    await expect(listArticleBookmarks()).rejects.toBeInstanceOf(ArticleBookmarkError);
    read.mockResolvedValueOnce(json({ id: 'not-a-number' }));
    await expect(resolveArticleId('x')).rejects.toBeInstanceOf(ArticleBookmarkError);
    write.mockResolvedValueOnce(json({ error: { message: '로그인이 필요해요' } }, 401));
    const error = await setArticleBookmark('42', true).catch((e) => e);
    expect(error).toMatchObject({ status: 401, message: '로그인이 필요해요' });
    expect(isArticleBookmarkAuthError(error)).toBe(true);
    expect(isArticleBookmarkAuthError(new ArticleBookmarkError(503, 'x'))).toBe(false);
  });
});
