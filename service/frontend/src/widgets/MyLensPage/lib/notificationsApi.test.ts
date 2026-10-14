import { describe,it,expect,vi } from 'vitest';
const request=vi.hoisted(()=>vi.fn());
vi.mock('@/shared/lib/auth/authFetch',()=>({authFetch:request}));
vi.mock('@/shared/config/apiClient',()=>({API_URL:'http://127.0.0.1:4102'}));
import { mutateNotifications,NotificationSaveError } from './notificationsApi';
describe('계정 알림 저장',()=>{
 it('revision 충돌을 성공/동의로 바꾸지 않는다',async()=>{
  request.mockResolvedValue(new Response(JSON.stringify({error:{message:'다른 기기 변경'}}),{status:409}));
  await expect(mutateNotifications('/notifications/preferences',{revision:1,preferences:{}},new AbortController().signal)).rejects.toBeInstanceOf(NotificationSaveError);
  expect(request.mock.calls[0][1].cache).toBe('no-store');expect(request.mock.calls[0][1].body).not.toContain('granted');
 });
});
