import { beforeEach, describe, expect, it, vi } from 'vitest';

const request = vi.hoisted(() => vi.fn());
vi.mock('./authFetch', () => ({ authFetch: request }));
import { authReadFetch } from './authReadFetch';

describe('개인 조회의 제한된 복구', () => {
  beforeEach(() => { request.mockReset(); });

  it('연결이 한 번 끊겨도 같은 GET을 다시 읽고 정상 데이터를 반환한다', async () => {
    request.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(new Response('{"count":1}'));
    const signal = new AbortController().signal;
    expect(await (await authReadFetch('/account/api/archive', signal)).json()).toEqual({ count: 1 });
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1]).toEqual(['/account/api/archive', { method: 'GET', signal, cache: 'no-store' }]);
  });

  it.each([502, 503, 504])('HTTP %i 후에는 한 번만 다시 읽는다', async (status) => {
    request.mockResolvedValueOnce(new Response(null, { status })).mockResolvedValueOnce(new Response('{}'));
    expect((await authReadFetch('/dashboard')).status).toBe(200);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('계속 실패하면 한국어 안내를 반환하고 더 요청하지 않는다', async () => {
    request.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(authReadFetch('/dashboard')).rejects.toThrow('연결이 원활하지 않아 불러오지 못했어요.');
    expect(request).toHaveBeenCalledTimes(2);
  });

  it.each([400, 401, 403, 429])('HTTP %i는 재시도하지 않는다', async (status) => {
    request.mockResolvedValue(new Response(null, { status }));
    expect((await authReadFetch('/dashboard')).status).toBe(status);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('로그인 오류도 재시도하지 않는다', async () => {
    const error = Object.assign(new Error('not signed in'), { name: 'NotSignedInError' });
    request.mockRejectedValue(error);
    await expect(authReadFetch('/dashboard')).rejects.toBe(error);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('탭 이동으로 취소된 요청을 다시 시작하지 않는다', async () => {
    const controller = new AbortController();
    request.mockImplementationOnce(async () => {
      controller.abort();
      throw new TypeError('Failed to fetch');
    });
    await expect(authReadFetch('/dashboard', controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(request).toHaveBeenCalledTimes(1);
    request.mockClear();
    await expect(authReadFetch('/dashboard', controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(request).not.toHaveBeenCalled();
  });

  it('연속된 503도 2회로 끝내고 호출부가 실패를 처리하도록 응답을 반환한다', async () => {
    request.mockResolvedValue(new Response(null, { status: 503 }));
    expect((await authReadFetch('/dashboard')).status).toBe(503);
    expect(request).toHaveBeenCalledTimes(2);
  });
});
