import { describe, it, expect, vi, beforeEach } from 'vitest';
const request = vi.hoisted(() => vi.fn());
vi.mock('@/shared/lib/auth/authFetch', () => ({ authFetch: request }));
vi.mock('@/shared/config/apiClient', () => ({ API_URL: 'http://127.0.0.1:4102' }));
import { AccountApiError, getAccountBookmarks, getLensPreferences, putLensPreferences, setAccountBookmark, getAccountFollows, setAccountFollow, importBrowserBookmarks } from './accountApi';
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
describe('계정 저장 API 어댑터', () => {
  beforeEach(() => request.mockReset());
  it('관심 저장은 owner 없이 revision과 전체 설정만 보낸다', async () => {
    request.mockResolvedValue(response({ revision: 2, interests: [], minutes: 5 }));
    await putLensPreferences({ revision: 1, interests: [], minutes: 5, updated_at: null });
    expect(request.mock.calls[0][0]).toBe('http://127.0.0.1:4102/api/v2/me/preferences');
    expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({ revision: 1, interests: [], minutes: 5 });
    expect(request.mock.calls[0][1].cache).toBe('no-store');
  });
  it('충돌·인증·서버 실패는 저장 성공으로 바꾸지 않는다', async () => {
    for (const status of [401,409,503]) {
      request.mockResolvedValue(response({ error: { code: 'FIXTURE', message: 'fixture' } },status));
      await expect(putLensPreferences({ revision: 0, interests: [], minutes: 0, updated_at: null })).rejects.toMatchObject({ status, code: 'FIXTURE' });
    }
    expect(AccountApiError.prototype).toBeInstanceOf(Error);
  });
  it('숫자처럼 보이는 slug도 명시적으로 resolve한 뒤 안정 ID로 저장한다', async () => {
    request.mockResolvedValueOnce(response({ id:'42' })).mockResolvedValueOnce(response({ saved:true }));
    await setAccountBookmark('123',true);
    expect(request.mock.calls[0][0]).toContain('kind=issue_letter&key_type=slug&key=123');
    expect(request.mock.calls[1][0]).toContain('/letter-bookmarks/42');
    expect(request.mock.calls[1][1].method).toBe('PUT');
  });
  it('비공개 저장 항목은 resolver 없이 보유 ID로 해제한다', async () => {
    request.mockResolvedValue(response({ saved:false }));
    await setAccountBookmark('',false,'42');
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][1].method).toBe('DELETE');
  });
  it('계정 목록은 cursor를 따라 조회하고 중간 실패를 빈 성공으로 숨기지 않는다', async () => {
    request.mockResolvedValueOnce(response({ items:[{letter_id:'1'}], next_cursor:'a+b=' })).mockResolvedValueOnce(response({ items:[{letter_id:'2'}], next_cursor:null }));
    expect(await getAccountBookmarks()).toHaveLength(2);
    expect(request.mock.calls[1][0]).toContain('cursor=a%2Bb%3D');
    request.mockResolvedValue(response({},503));
    await expect(getAccountBookmarks()).rejects.toBeInstanceOf(AccountApiError);
  });
});

describe('팔로우·관심 설정 조회 복구', () => {
  beforeEach(() => { request.mockReset(); });

  it('팔로우 연결이 한 번 끊기면 같은 GET을 다시 읽어 기존 항목을 반환한다', async () => {
    const data = { items: [{ id: 'mincheol', active: true }], total: 1 };
    const signal = new AbortController().signal;
    request.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(response(data));
    expect(await getAccountFollows(signal)).toEqual(data);
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls.every(([url, options]) => url.endsWith('/followed-editors') && options.method === 'GET' && options.signal === signal && options.cache === 'no-store')).toBe(true);
  });

  it.each([502, 503, 504])('관심 설정 HTTP %i는 한 번 재조회해 저장된 값을 반환한다', async status => {
    const data = { interests: [{ type: 'category', key: 'industry' }], minutes: 5, revision: 3, updated_at: null };
    request.mockResolvedValueOnce(response({}, status)).mockResolvedValueOnce(response(data));
    expect(await getLensPreferences()).toEqual(data);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('지속적인 연결 실패는 한국어 오류로 끝내고 수동 재조회로 복구한다', async () => {
    request.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(getAccountFollows()).rejects.toThrow('연결이 원활하지 않아 불러오지 못했어요.');
    expect(request).toHaveBeenCalledTimes(2);
    request.mockResolvedValueOnce(response({ items: [], total: 0 }));
    expect(await getAccountFollows()).toEqual({ items: [], total: 0 });
    expect(request).toHaveBeenCalledTimes(3);
  });

  it.each([401, 403, 429])('HTTP %i는 재시도 없이 원래 계정 오류를 유지한다', async status => {
    request.mockResolvedValue(response({ error: { code: 'FIXTURE', message: 'fixture' } }, status));
    await expect(getAccountFollows()).rejects.toMatchObject({ status, code: 'FIXTURE' });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('탭 전환으로 취소된 조회는 재시작하지 않는다', async () => {
    const controller = new AbortController();
    request.mockImplementationOnce(() => { controller.abort(); throw new TypeError('Failed to fetch'); });
    await expect(getAccountFollows(controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('팔로우 저장·해제·관심 저장·가져오기 실패는 자동 재시도하지 않는다', async () => {
    request.mockRejectedValue(new TypeError('Failed to fetch'));
    const operations = [
      () => setAccountFollow('mincheol', true),
      () => setAccountFollow('mincheol', false),
      () => putLensPreferences({ interests: [], minutes: 5, revision: 3, updated_at: null }),
      () => importBrowserBookmarks(['one'], 'local-import'),
    ];
    for (const operation of operations) await expect(operation()).rejects.toThrow('Failed to fetch');
    expect(request).toHaveBeenCalledTimes(operations.length);
  });
});

describe('계정 연결 API',()=>{
 beforeEach(()=>request.mockReset());
 it('서버 완료 필터를 모든 cursor 페이지에 유지한다',async()=>{
  request.mockResolvedValueOnce(response({items:[{letter_id:'1'}],next_cursor:'next'})).mockResolvedValueOnce(response({items:[],next_cursor:null}));
  await getAccountBookmarks(undefined,'unread');
  expect(request.mock.calls.every(call=>call[0].includes('read=unread'))).toBe(true);
 });
 it('팔로우는 계정 API만 호출하고 관심 전체를 다시 저장하지 않는다',async()=>{
  request.mockResolvedValue(response({items:[],following:true}));await getAccountFollows();await setAccountFollow('mincheol',true);
  expect(request.mock.calls[0][0]).toContain('/me/followed-editors');expect(request.mock.calls[1][1].method).toBe('PUT');expect(request.mock.calls.some(call=>call[0].includes('/preferences'))).toBe(false);
 });
 it('가져오기는 명시적으로 선택한 slug와 멱등 ID만 전송한다',async()=>{
  request.mockResolvedValue(response({accepted:[],rejected:[]}));await importBrowserBookmarks(['one'],'local-import');
  expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({source:'browser-bookmarks-v1',import_id:'local-import',slugs:['one']});expect(request.mock.calls[0][1].method).toBe('POST');
 });
});
