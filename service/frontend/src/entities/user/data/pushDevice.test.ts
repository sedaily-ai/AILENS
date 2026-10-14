import { describe,it,expect,vi,beforeEach } from 'vitest';
const fetch=vi.hoisted(()=>vi.fn());
vi.mock('@/shared/lib/auth/authFetch',()=>({authFetch:fetch}));
vi.mock('@/shared/config/apiClient',()=>({API_URL:'http://127.0.0.1:4102'}));
import { connectPushDevice,disconnectPushDevice,currentPushDevice } from './pushDevice';
describe('로컬 푸시 기기',()=>{
 const values=new Map<string,string>();
 beforeEach(()=>{values.clear();fetch.mockReset();vi.stubGlobal('localStorage',{getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v),removeItem:(k:string)=>values.delete(k)});});
 it('dry_run은 native 권한/PushManager를 호출하지 않고 합성 기기로 계정 API를 연결한다',async()=>{
  const permission=vi.fn();vi.stubGlobal('Notification',{requestPermission:permission});
  fetch.mockImplementation(async()=>new Response(JSON.stringify({id:'local-id',active:true,simulated:true})));
  await connectPushDevice('a',{mode:'dry_run',supported:true,policy_version:'v1',vapid_public_key:null},new AbortController().signal);
  expect(permission).not.toHaveBeenCalled();
  const body=JSON.parse(fetch.mock.calls[0][1].body);expect(body.permission).toBe('simulated');expect(body.subscription.endpoint).toMatch(/^https:\/\/push.invalid\//);
  expect(currentPushDevice('a')).toBe('local-id');expect(currentPushDevice('b')).toBeNull();
  await disconnectPushDevice('a','local-id','dry_run');expect(fetch.mock.calls[1][0]).toContain('/push-subscriptions/local-id');expect(currentPushDevice('a')).toBeNull();
 });
 it('다른 기기를 해제할 때 현재 브라우저의 구독은 해제하지 않는다',async()=>{
  values.set('lens-push-device:a',JSON.stringify({id:'current',mode:'live'}));
  const unsubscribe=vi.fn(),getRegistration=vi.fn(async()=>({active:{scriptURL:'http://localhost/lens-push-sw.js'},pushManager:{getSubscription:async()=>({unsubscribe})}}));
  vi.stubGlobal('navigator',{serviceWorker:{getRegistration}});
  fetch.mockImplementation(async()=>new Response('{}'));
  await disconnectPushDevice('a','other','live');
  expect(getRegistration).not.toHaveBeenCalled();expect(currentPushDevice('a')).toBe('current');
  await disconnectPushDevice('a','current','live');expect(unsubscribe).toHaveBeenCalledOnce();expect(currentPushDevice('a')).toBeNull();
 });
 it('live 경로는 명시적 연결 호출에서만 권한·구독을 요청하고 계정에 저장한다',async()=>{
  const permission=vi.fn(async()=>'granted'),subscribe=vi.fn(async()=>({toJSON:()=>({endpoint:'https://fcm.googleapis.com/synthetic',keys:{p256dh:'synthetic',auth:'synthetic'}})}));
  vi.stubGlobal('Notification',{requestPermission:permission});vi.stubGlobal('isSecureContext',true);
  vi.stubGlobal('window',{PushManager:{},Notification:globalThis.Notification});
  const register=vi.fn(async()=>({pushManager:{getSubscription:async()=>null,subscribe}}));
  vi.stubGlobal('navigator',{serviceWorker:{register,ready:Promise.resolve({})}});
  fetch.mockImplementation(async()=>new Response(JSON.stringify({id:'live-id',active:true,simulated:false})));
  await connectPushDevice('a',{mode:'live',supported:true,policy_version:'v1',vapid_public_key:'eA'},new AbortController().signal);
  expect(permission).toHaveBeenCalledOnce();expect(register).toHaveBeenCalledWith('/lens-push-sw.js',{scope:'/'});
  expect(subscribe).toHaveBeenCalledOnce();expect(JSON.parse(fetch.mock.calls[0][1].body).permission).toBe('granted');
  expect(currentPushDevice('a')).toBe('live-id');
 });
 it('브라우저 권한 거부는 서버 구독을 만들지 않는다',async()=>{
  vi.stubGlobal('Notification',{requestPermission:async()=>'denied'});vi.stubGlobal('isSecureContext',true);
  vi.stubGlobal('window',{PushManager:{},Notification:globalThis.Notification});const register=vi.fn();vi.stubGlobal('navigator',{serviceWorker:{register}});
  await expect(connectPushDevice('a',{mode:'live',supported:true,policy_version:'v1',vapid_public_key:'eA'},new AbortController().signal)).rejects.toThrow('허용');
  expect(register).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
 });
});
