import { describe,it,expect,vi,beforeEach } from 'vitest';
const request=vi.hoisted(()=>vi.fn());
vi.mock('@/shared/lib/auth/authFetch',()=>({authFetch:request}));
vi.mock('@/shared/config/apiClient',()=>({API_URL:'http://127.0.0.1:4102',CMS_API_URL:'http://127.0.0.1:4103'}));
import { fetchLensDashboard,newsRecommendations,cardLetter,normalizeDashboard,DashboardApiError,type ServerCard,type Recommendations } from './dashboardApi';
const card:ServerCard={content_key:'publication:42',kind:'publication',id:'42',slug:'one',title:'뉴스',summary:'요약',published_at:'2026-10-13T16:00:00Z',category_keys:['industry'],keywords:['반도체'],formats:['letter'],href:'/lens/one',viewed:false,saved:false,reasons:[{type:'category',origin:'observed',method:'exact',text:'열람한 산업 분야'}]};
const data=(items:ServerCard[]):Recommendations=>({items,count:items.length,algorithm_version:'exact-v1',fallback:false,coverage:{window_days:90,legacy_unmatched:0}});
describe('서버 추천 어댑터',()=>{
 beforeEach(()=>request.mockReset());
 it('서버 순위를 보존하고 KST 날짜·등록 키워드·정식 주소를 표시한다',()=>{
  const cards=[{...card,slug:'first',title:'첫 순위'}, {...card,slug:'second',title:'둘째 순위'}];
  const mapped=newsRecommendations(data(cards));
  expect(mapped.map(item=>item.id)).toEqual(['first','second']);
  expect(mapped[0].date).toBe('2026-10-14');expect(mapped[0].keywords).toEqual(['반도체']);expect(mapped[0].href).toBe('/lens/one');
  expect(mapped[0].reasons[0].text).toBe('열람한 산업 분야');
  expect(cardLetter(card)).not.toHaveProperty('readMinutes');
 });
 it('대시보드에는 읽을 시간 제한 없음만 보내고, 저장 문장 관련 글 API는 없다',async()=>{
  request.mockResolvedValue(new Response(JSON.stringify(data([]))));
  await fetchLensDashboard(new AbortController().signal,'home');
  expect(request.mock.calls[0][0]).toBe('http://127.0.0.1:4102/api/v2/me/dashboard?tab=home&minutes=0');
  // 저장 문장 관련 글 추천은 2026-10-19에 제거됐다(단어 하나만 겹쳐도 무관한 글이 추천됐다).
  expect(Object.keys(await import('./dashboardApi'))).not.toContain('fetchSentenceRecommendations');
 });
 it('실패와 정상 빈 추천을 구분한다',async()=>{
  request.mockResolvedValue(new Response(JSON.stringify({error:{message:'실패'}}),{status:503}));await expect(fetchLensDashboard(new AbortController().signal)).rejects.toBeInstanceOf(DashboardApiError);
 });
});

it('서버의 원래 주소와 실제 작성자 사전을 카드에 보존한다',()=>{
 const authored={...card,editors:['mincheol']};
 expect(newsRecommendations(data([authored]))[0].href).toBe('/lens/one');
 expect(cardLetter(authored).editors).toEqual(['mincheol']);
});

it.each(['2026-10-15T23:02:00Z','2026-10-15T23:02:00+00:00','2026-10-16T08:02:00+09:00'])('추천 레터 발행 시각 %s를 레터 목록과 같은 한국 시각으로 바꾼다',published_at=>{
 expect(cardLetter({...card,published_at}).publishedAt).toBe('2026-10-16T08:02');
});

it('명시한 탭만 집계하도록 전달하고 시간 제한 없음(minutes=0)을 붙인다',async()=>{
 // 읽을 시간 기능은 제거됐다. minutes=0은 배포 사이 예전 계정 API가 저장된 5·10분으로 레터 추천을 자르지 않게 하는 호환 값이다.
 request.mockReset();request.mockResolvedValue(new Response('{}'));
 await fetchLensDashboard(new AbortController().signal,'archive');
 expect(request.mock.calls[0][0]).toBe('http://127.0.0.1:4102/api/v2/me/dashboard?tab=archive&minutes=0');
 await fetchLensDashboard(new AbortController().signal);
 expect(request.mock.calls[1][0]).toBe('http://127.0.0.1:4102/api/v2/me/dashboard?minutes=0');
});

it('게이트웨이 오류의 원문을 노출하지 않고 인증 실패의 상태는 유지한다',async()=>{
 request.mockReset();request.mockResolvedValue(new Response(JSON.stringify({error:{message:'internal gateway detail'}}),{status:503}));
 await expect(fetchLensDashboard(new AbortController().signal,'archive')).rejects.toMatchObject({status:503,message:'대시보드를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'});
 expect(request).toHaveBeenCalledTimes(2);
 request.mockReset();request.mockResolvedValue(new Response('{}',{status:401}));
 await expect(fetchLensDashboard(new AbortController().signal)).rejects.toMatchObject({status:401,message:'로그인이 만료됐어요. 다시 로그인해 주세요.'});
 expect(request).toHaveBeenCalledTimes(1);
});

describe('대시보드 응답 정리',()=>{
 const ready=<T,>(value:T)=>({status:'ready',data:value,error:null});
 const full={schema_version:1,scope:'account',news:ready(data([card])),letters:ready(data([])),profile:ready({window_days:90,categories:[],coverage:{legacy_unmatched:0}}),
  recent_sentences:ready({items:[],total:0}),saved_letters:ready({total:3}),
  format_preference:{status:'unavailable',data:null,error:null},notifications:{status:'unavailable',data:null,error:null}};
 it('정상 응답은 화면이 읽는 영역을 그대로 넘긴다',()=>{
  const result=normalizeDashboard(full);
  expect(result.news.data?.items[0].slug).toBe('one');
  expect(result.saved_letters).toEqual(ready({total:3}));
  expect(result).not.toHaveProperty('notifications');
 });
 it('빠지거나 모양이 틀린 영역만 오류로 바꾸고 나머지는 유지한다',()=>{
  const {profile:_profile,...withoutProfile}=full;void _profile;
  const result=normalizeDashboard({...withoutProfile,recent_sentences:ready({items:'broken'}),saved_letters:{status:'weird'}});
  expect(result.profile).toEqual({status:'error',data:null,error:{message:'이 영역을 불러오지 못했어요.'}});
  expect(result.recent_sentences.status).toBe('error');
  expect(result.saved_letters.status).toBe('error');
  expect(result.news.status).toBe('ready');expect(result.letters.status).toBe('ready');
 });
 it('서버가 알린 미제공·오류 상태는 그대로 두고, 응답 전체가 깨져도 멈추지 않는다',()=>{
  const result=normalizeDashboard({...full,letters:{status:'unavailable',data:null,error:null},news:{status:'error',data:null,error:{message:'이 영역을 불러오지 못했어요.',code:'DEPENDENCY_UNAVAILABLE'}}});
  expect(result.letters).toEqual({status:'unavailable',data:null,error:null});
  expect(result.news).toEqual({status:'error',data:null,error:{message:'이 영역을 불러오지 못했어요.'}});
  for(const raw of [null,'<html>',[]]){
   const broken=normalizeDashboard(raw);
   expect([broken.news,broken.letters,broken.profile,broken.recent_sentences,broken.saved_letters].every(area=>area.status==='error'&&area.data===null)).toBe(true);
  }
 });
 it('대시보드를 받으면 정리된 모양으로 돌려준다',async()=>{
  request.mockReset();request.mockResolvedValue(new Response(JSON.stringify({...full,profile:undefined})));
  const result=await fetchLensDashboard(new AbortController().signal,'home');
  expect(result.profile.status).toBe('error');expect(result.news.status).toBe('ready');
 });
});
