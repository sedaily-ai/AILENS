import { describe,it,expect,vi,beforeEach } from 'vitest';
const request=vi.hoisted(()=>vi.fn());
vi.mock('@/shared/lib/auth/authFetch',()=>({authFetch:request}));
vi.mock('@/shared/config/apiClient',()=>({API_URL:'http://127.0.0.1:4102'}));
import { fetchRecommendations,fetchLensDashboard,fetchSentenceRecommendations,newsRecommendations,cardLetter,DashboardApiError,type ServerCard,type Recommendations } from './dashboardApi';
const card:ServerCard={content_key:'publication:42',kind:'publication',id:'42',slug:'one',title:'뉴스',summary:'요약',published_at:'2026-10-13T16:00:00Z',category_keys:['industry'],keywords:['반도체'],formats:['letter'],read_minutes:null,href:'/lens/one',viewed:false,saved:false,reasons:[{type:'keyword',origin:'observed',method:'exact',text:'등록 키워드 반도체'}]};
const data=(items:ServerCard[]):Recommendations=>({items,count:items.length,algorithm_version:'exact-v1',fallback:false,total_minutes:0,coverage:{window_days:90,legacy_unmatched:0}});
describe('서버 추천 어댑터',()=>{
 beforeEach(()=>request.mockReset());
 it('서버 순위를 보존하고 KST 날짜·등록 키워드·정식 주소를 표시한다',()=>{
  const cards=[{...card,slug:'first',title:'첫 순위'}, {...card,slug:'second',title:'둘째 순위'}];
  const mapped=newsRecommendations(data(cards));
  expect(mapped.map(item=>item.id)).toEqual(['first','second']);
  expect(mapped[0].date).toBe('2026-10-14');expect(mapped[0].keywords).toEqual(['반도체']);expect(mapped[0].href).toBe('/lens/one');
  expect(mapped[0].reasons[0].text).toBe('등록 키워드 반도체');
  expect(cardLetter(card).readMinutes).toBe(0);
 });
 it('근거 필터와 문장 ID를 서버로 보내며 문장 원문/owner를 URL에 넣지 않는다',async()=>{
  request.mockResolvedValue(new Response(JSON.stringify(data([]))));
  await fetchRecommendations('sentence',new AbortController().signal);expect(request.mock.calls[0][0]).toContain('reason=sentence');
  await fetchSentenceRecommendations('42',new AbortController().signal);expect(request.mock.calls[1][0]).toBe('http://127.0.0.1:4102/api/v2/me/sentences/42/recommendations?limit=3');
 });
 it('실패와 정상 빈 추천을 구분한다',async()=>{
  request.mockResolvedValue(new Response(JSON.stringify(data([]))));expect(await fetchRecommendations('keyword',new AbortController().signal)).toMatchObject({items:[]});
  request.mockResolvedValue(new Response(JSON.stringify({error:{message:'실패'}}),{status:503}));await expect(fetchLensDashboard(5,new AbortController().signal)).rejects.toBeInstanceOf(DashboardApiError);
 });
});

it('선호 형식의 정식 주소와 실제 작성자 사전을 카드에 보존한다',()=>{
 const preferred={...card,preferred_format:'webtoon' as const,href:'/lens/one?format=webtoon',editors:['mincheol']};
 expect(newsRecommendations(data([preferred]))[0]).toMatchObject({href:'/lens/one?format=webtoon',preferredFormat:'webtoon'});
 expect(cardLetter(preferred).editors).toEqual(['mincheol']);
});

it('명시한 탭만 집계하도록 전달하고 기존 호출 URL은 보존한다',async()=>{
 request.mockReset();request.mockResolvedValue(new Response('{}'));
 await fetchLensDashboard(5,new AbortController().signal,'records');
 expect(request.mock.calls[0][0]).toBe('http://127.0.0.1:4102/api/v2/me/dashboard?minutes=5&tab=records');
 await fetchLensDashboard(5,new AbortController().signal);
 expect(request.mock.calls[1][0]).toBe('http://127.0.0.1:4102/api/v2/me/dashboard?minutes=5');
});
