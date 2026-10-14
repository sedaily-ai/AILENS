/* Web Push 전용: fetch/cache 가로채기 없음. 실제 mode에서 사용자 연결 후만 등록. */
self.addEventListener('push',event=>{
 let value={};try{value=event.data?.json()??{};}catch{return;}
 const title=typeof value.title==='string'?value.title.slice(0,100):'나의 LENS';
 const body=typeof value.body==='string'?value.body.slice(0,200):'새로운 소식을 확인해 보세요.';
 event.waitUntil(self.registration.showNotification(title,{body,tag:typeof value.tag==='string'?value.tag.slice(0,64):undefined,data:{url:typeof value.url==='string'?value.url:'/my-lens'}}));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 let target=new URL('/my-lens',self.location.origin);
 try{const proposed=new URL(event.notification.data?.url??'/my-lens',self.location.origin);if(proposed.origin===self.location.origin&&/^\/(?:my-lens(?:[/?#]|$)|lens\/|letter\/)/.test(proposed.pathname))target=proposed;}catch{/* 안전한 대시보드로 이동 */}
 event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async windows=>{
  const existing=windows.find(client=>new URL(client.url).origin===self.location.origin);
  if(existing){await existing.navigate(target.href);return existing.focus();}return self.clients.openWindow(target.href);
 }));
});
