import { afterEach, expect, it, vi } from 'vitest';
vi.mock('@/shared/config/apiClient', () => ({ CMS_API_URL: 'http://127.0.0.1:4102' }));
vi.mock('../lib/deviceId', () => ({ getDeviceId: () => 'local-device' }));
import { subscribeByEmail } from './interestApi';
afterEach(() => vi.unstubAllGlobals());
it('신규 구독에는 선택한 에디터만 보내고 관심사로 변환하지 않는다', async () => {
  const request = vi.fn().mockResolvedValue(new Response('{}'));
  vi.stubGlobal('fetch', request);
  expect(await subscribeByEmail({ email: 'reader@example.com', editors: ['mincheol'], frequency: 'daily', sendHour: 8 })).toEqual({ ok: true });
  expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({ email: 'reader@example.com', editors: ['mincheol'], frequency: 'daily', send_hour: 8, consent: true });
});
