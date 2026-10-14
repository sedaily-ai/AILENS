import { API_URL } from '@/shared/config/apiClient';
import { authFetch } from '@/shared/lib/auth/authFetch';
export interface PushConfig {mode:'dry_run'|'live';supported:boolean;policy_version:string;vapid_public_key:string|null}
const deviceKey=(owner:string)=>`lens-push-device:${owner}`;
const encode=(value:Uint8Array)=>btoa(String.fromCharCode(...value)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
const decode=(value:string)=>Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/').padEnd(Math.ceil(value.length/4)*4,'=')),c=>c.charCodeAt(0));
const current=(signal:AbortSignal)=>{if(signal.aborted)throw new DOMException('취소됨','AbortError');};
async function request<T>(path:string,method:string,body:unknown,signal?:AbortSignal):Promise<T>{
 let response:Response;
 try{response=await authFetch(`${API_URL}/api/v2/me${path}`,{method,signal,cache:'no-store',headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});}catch(error){if(!signal?.aborted&&error instanceof Error&&error.name==='NotSignedInError')window.dispatchEvent(new Event('lens-dashboard-auth-required'));throw error;}
 const data=await response.json();
 if(!response.ok){if(response.status===401&&!signal?.aborted)window.dispatchEvent(new Event('lens-dashboard-auth-required'));throw new Error(data?.error?.message??'기기 연결을 확인해 주세요.');}return data as T;
}
export function currentPushDevice(owner:string):string|null{
 try{return JSON.parse(localStorage.getItem(deviceKey(owner))??'null')?.id??null;}catch{return null;}
}
export async function connectPushDevice(owner:string,config:PushConfig,signal:AbortSignal){
 if(!config.supported)throw new Error('서버의 푸시 연결 설정이 필요해요.');
 let subscription:PushSubscriptionJSON,permission:'simulated'|'granted';
 if(config.mode==='dry_run'){
  const pair=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);current(signal);
  const raw=await crypto.subtle.exportKey('raw',pair.publicKey);current(signal);
  subscription={endpoint:`https://push.invalid/${crypto.randomUUID()}`,expirationTime:null,keys:{p256dh:encode(new Uint8Array(raw)),auth:encode(crypto.getRandomValues(new Uint8Array(16)))}};permission='simulated';
 }else{
  if(!isSecureContext||!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window)||!config.vapid_public_key)throw new Error('이 브라우저에서 푸시 연결을 사용할 수 없어요.');
  const allowed=await Notification.requestPermission();current(signal);
  if(allowed!=='granted')throw new Error('브라우저에서 알림 권한을 허용해 주세요.');
  const worker=await navigator.serviceWorker.register('/lens-push-sw.js',{scope:'/'});current(signal);
  await navigator.serviceWorker.ready;current(signal);
  const existing=await worker.pushManager.getSubscription();current(signal);
  const sub=existing??await worker.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:decode(config.vapid_public_key)});current(signal);
  subscription=sub.toJSON();permission='granted';
 }
 const result=await request<{id:string;active:boolean;simulated:boolean}>('/push-subscriptions','POST',{subscription,permission},signal);current(signal);
 try{localStorage.setItem(deviceKey(owner),JSON.stringify({id:result.id,mode:config.mode}));}catch{/* 서버 저장은 유지, 재연결/로그아웃 때 브라우저 구독을 확인한다. */}
 return result;
}
export async function disconnectPushDevice(owner:string,id:string,mode:'dry_run'|'live',signal?:AbortSignal){
 await request(`/push-subscriptions/${encodeURIComponent(id)}`,'DELETE',null,signal);
 const isCurrent=currentPushDevice(owner)===id;
 if(isCurrent){try{localStorage.removeItem(deviceKey(owner));}catch{/* 새 연결은 서버 ID로 처리 */}}
 if(isCurrent&&mode==='live'&&'serviceWorker' in navigator){const worker=await navigator.serviceWorker.getRegistration('/');if(worker?.active?.scriptURL.endsWith('/lens-push-sw.js'))await (await worker.pushManager.getSubscription())?.unsubscribe();}
}
/** signOut 전에 현재 기기를 해제한다. 서버 실패 시에도 native 구독은 종료한다. */
export async function detachPushBeforeLogout(owner:string){
 let stored:{id:string;mode:'dry_run'|'live'}|null=null;
 try{stored=JSON.parse(localStorage.getItem(deviceKey(owner))??'null');}catch{/* 브라우저 구독 확인으로 진행 */}
 if(stored){const abort=new AbortController();const timer=setTimeout(()=>abort.abort(),5000);try{await disconnectPushDevice(owner,stored.id,stored.mode,abort.signal);}catch{/* 로그인 종료를 막지 않는다. */}finally{clearTimeout(timer);}}
 if(stored?.mode!=='dry_run'&&typeof navigator!=='undefined'&&'serviceWorker' in navigator){
  try{const worker=await navigator.serviceWorker.getRegistration('/');if(worker?.active?.scriptURL.endsWith('/lens-push-sw.js'))await (await worker.pushManager.getSubscription())?.unsubscribe();}catch{/* provider410으로 서버에서도 정리 */}
 }
}
