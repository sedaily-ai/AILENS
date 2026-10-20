import { describe,it,expect,vi,beforeEach,afterEach } from 'vitest';
const request=vi.hoisted(()=>vi.fn());
vi.mock('@/shared/lib/auth/authFetch',()=>({authFetch:request}));
vi.mock('@/shared/config/apiClient',()=>({API_URL:'http://127.0.0.1:4102'}));
import { startContentSession,reportContentProgress,clearAccountReadingHistory,ACCOUNT_VIEW_CHANGED } from './activityApi';
import { readingSignalKey, readingHistoryResetKey, READING_HISTORY_CLEARED } from '../lib/readingSignals';
beforeEach(() => request.mockReset());
afterEach(() => vi.unstubAllGlobals());
describe('추천용 이용 신호',()=>{
 it('등록 콘텐츠 ID를 resolve한 뒤 실제 포맷과 visible 값만 전달한다',async()=>{
  request.mockResolvedValueOnce(new Response(JSON.stringify({content_key:'publication:42'}))).mockResolvedValueOnce(new Response(JSON.stringify({session_id:'session'}))).mockResolvedValueOnce(new Response(JSON.stringify({viewed:true})));
  const controller=new AbortController();await startContentSession('news','123','webtoon',controller.signal);
  const result=await reportContentProgress('session','event',2,{visible_ms:10000},controller.signal);
  expect(request.mock.calls[0][0]).toContain('kind=publication&key_type=slug&key=123');
  expect(JSON.parse(request.mock.calls[1][1].body)).toEqual({content_key:'publication:42',format:'webtoon'});
  expect(JSON.parse(request.mock.calls[2][1].body)).toEqual({session_id:'session',event_id:'event',session_seq:2,event_type:'progress',visible_ms:10000});
  expect(request.mock.calls[2][1].signal).toBe(controller.signal);
  expect(result.viewed).toBe(true);
 });
});

describe('계정 열람 기록 전체 삭제', () => {
 function browser() {
  const values = new Map([[readingSignalKey('account:a'), 'a-history'], [readingSignalKey('account:b'), 'b-history']]);
  vi.stubGlobal('localStorage', {getItem:(key:string)=>values.get(key)??null,removeItem:(key:string)=>values.delete(key),setItem:(key:string,value:string)=>values.set(key,value)});
  const window = new EventTarget();
  vi.stubGlobal('window', window);
  return {values,window};
 }
 it('확인된 계정 삭제만 요청하고 서버 성공 후 해당 계정 캐시와 추천을 갱신한다', async () => {
  const {values,window} = browser();
  const cleared = vi.fn(), changed = vi.fn();
  window.addEventListener(READING_HISTORY_CLEARED, cleared);
  window.addEventListener(ACCOUNT_VIEW_CHANGED, changed);
  request.mockResolvedValue(new Response(JSON.stringify({deleted:true})));
  const controller = new AbortController();
  await clearAccountReadingHistory('a', controller.signal);
  expect(request).toHaveBeenCalledWith('http://127.0.0.1:4102/api/v2/me/activity/history', expect.objectContaining({
   method:'DELETE',body:'{"confirm":true}',signal:controller.signal,cache:'no-store',
  }));
  expect(values.has(readingSignalKey('account:a'))).toBe(false);
  expect(values.get(readingSignalKey('account:b'))).toBe('b-history');
  expect(values.has(readingHistoryResetKey('account:a'))).toBe(true);
  expect(cleared).toHaveBeenCalledOnce();expect(changed).toHaveBeenCalledOnce();
 });
 it.each([401,403,503])('HTTP %i 실패는 기록을 남기고 오류로 처리한다', async status => {
  const {values,window} = browser();
  const changed=vi.fn();window.addEventListener(ACCOUNT_VIEW_CHANGED,changed);
  request.mockResolvedValue(new Response('{}',{status}));
  await expect(clearAccountReadingHistory('a',new AbortController().signal)).rejects.toMatchObject({status});
  expect(values.get(readingSignalKey('account:a'))).toBe('a-history');expect(changed).not.toHaveBeenCalled();
 });
 it('삭제 확인 없는 200 응답이나 취소된 요청을 성공으로 표시하지 않는다', async () => {
  const {values}=browser();
  request.mockResolvedValue(new Response('{}'));
  await expect(clearAccountReadingHistory('a',new AbortController().signal)).rejects.toMatchObject({status:503});
  request.mockResolvedValue(new Response('{"deleted":true}'));
  const controller=new AbortController();controller.abort();
  await expect(clearAccountReadingHistory('a',controller.signal)).rejects.toThrow();
  expect(values.get(readingSignalKey('account:a'))).toBe('a-history');
 });
});
