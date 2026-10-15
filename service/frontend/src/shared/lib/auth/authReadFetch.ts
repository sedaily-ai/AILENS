import { authFetch } from './authFetch';

/** 개인 조회만 일시적 연결/게이트웨이 실패에 한 번 재시도한다. 쓰기 요청에는 사용하지 않는다. */
export async function authReadFetch(url: string, signal?: AbortSignal): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    signal?.throwIfAborted();
    try {
      const response = await authFetch(url, { method: 'GET', signal, cache: 'no-store' });
      if (attempt === 0 && [502, 503, 504].includes(response.status)) continue;
      return response;
    } catch (error) {
      signal?.throwIfAborted();
      if (!(error instanceof TypeError)) throw error;
      if (attempt === 0) continue;
      throw new Error('연결이 원활하지 않아 불러오지 못했어요. 잠시 후 다시 시도해 주세요.', { cause: error });
    }
  }
}
