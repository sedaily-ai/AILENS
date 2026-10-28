import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/config/apiClient', () => ({ CMS_API_URL: 'https://cms.test' }));
import { fetchLensPosts, lensListMemoState, markLensListMemoStale } from './cmsPostsApi';

function respond(ids: string[]) {
  return new Response(JSON.stringify({ posts: ids.map((id) => ({ id, date: '2026-10-28', lenses: [] })) }), { status: 200 });
}

describe('lens list memo (stale-while-revalidate)', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('webhook marks the list stale but keeps serving it, then swaps in the refreshed list', async () => {
    fetchMock.mockResolvedValueOnce(respond(['a']));
    expect((await fetchLensPosts(1000)).map((p) => p.id)).toEqual(['a']); // 보관본 없음 → 기다려서 받음
    expect(lensListMemoState()).toBe('fresh');

    expect((await fetchLensPosts(1000)).map((p) => p.id)).toEqual(['a']); // 신선 → 다시 받지 않음
    expect(fetchMock).toHaveBeenCalledTimes(1);

    markLensListMemoStale();
    expect(lensListMemoState()).toBe('stale');
    let release!: (r: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>((r) => { release = r; }));
    expect((await fetchLensPosts(1000)).map((p) => p.id)).toEqual(['a']); // 오래됨 → 기다리지 않고 옛 목록
    expect(fetchMock).toHaveBeenCalledTimes(2); // 뒤에서 새로 받기 시작

    release(respond(['b', 'a']));
    await vi.waitFor(() => expect(lensListMemoState()).toBe('fresh'));
    expect((await fetchLensPosts(1000)).map((p) => p.id)).toEqual(['b', 'a']);
  });

  it('keeps the old list when the background refresh fails', async () => {
    markLensListMemoStale();
    fetchMock.mockResolvedValue(new Response('down', { status: 503 }));
    const before = (await fetchLensPosts(1000)).map((p) => p.id);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect((await fetchLensPosts(1000)).map((p) => p.id)).toEqual(before);
  });
});
