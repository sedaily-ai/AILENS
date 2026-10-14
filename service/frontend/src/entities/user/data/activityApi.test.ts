import { describe,it,expect,vi } from 'vitest';
const request=vi.hoisted(()=>vi.fn());
vi.mock('@/shared/lib/auth/authFetch',()=>({authFetch:request}));
vi.mock('@/shared/config/apiClient',()=>({API_URL:'http://127.0.0.1:4102'}));
import { startContentSession,reportContentView } from './activityApi';
describe('추천용 이용 신호',()=>{
 it('등록 콘텐츠 ID를 resolve한 뒤 실제 포맷과 visible 값만 전달한다',async()=>{
  request.mockResolvedValueOnce(new Response(JSON.stringify({content_key:'publication:42'}))).mockResolvedValueOnce(new Response(JSON.stringify({session_id:'session'}))).mockResolvedValueOnce(new Response(JSON.stringify({viewed:true,completed:false})));
  const controller=new AbortController();await startContentSession('news','123','webtoon',controller.signal);await reportContentView('session','event',10000,controller.signal);
  expect(request.mock.calls[0][0]).toContain('kind=publication&key_type=slug&key=123');
  expect(JSON.parse(request.mock.calls[1][1].body)).toEqual({content_key:'publication:42',format:'webtoon'});
  expect(JSON.parse(request.mock.calls[2][1].body)).toEqual({session_id:'session',event_id:'event',session_seq:1,event_type:'progress',visible_ms:10000});
  expect(request.mock.calls[2][1].signal).toBe(controller.signal);
 });
});
