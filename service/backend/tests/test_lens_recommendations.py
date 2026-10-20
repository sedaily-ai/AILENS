"""추천 규칙과 집계 계약. DB/외부 서비스 호출 없이 고정 입력으로 검사."""
from services.user.recommendations import profile,rank,recommend
from services.user.dashboard_summary import get_dashboard
from models.dashboard import DashboardError
from repositories.dashboard_repository import DashboardRepository
import pytest


def inputs():return {'preferences':{'interests':[{'type':'category','key':'industry'}]},'categories':[{'key':'industry','n':2}],
 'keywords':[{'key':'반도체','n':2}],'selected_topics':[],
 'coverage':{'unmatched':1,'news_count':2,'letter_count':0},'sentence_total':1,'recent_sentences':[],'followed_editors':{'items':[]},'format_preference':{'status':'insufficient_data','distribution':[],'preferred_format':None}}


def card(key='publication:1',keywords=(),date='2026-10-14T00:00:00Z',viewed=False):
 return {'content_key':key,'kind':key.split(':')[0],'id':'1','slug':'article','title':'본문 등록 키워드만 있음','summary':'요약','published_at':date,'category_keys':[],'keywords':list(keywords),'formats':['letter'],'viewed':viewed,'saved':False,'href':'/lens/article'}


def test_news_uses_observed_categories_only_and_ignores_other_signals():
 data=inputs();data['preferences']['interests']=[{'type':'category','key':'culture'}]
 data['selected_topics']=[{'slug':'rates','name':'금리'}];p=profile(data)
 observed={**card('publication:1'),'category_keys':['industry']}
 manual={**card('publication:2',keywords=['반도체','배터리','금리']),'category_keys':['culture']}
 result=rank([manual,observed],data,p)
 assert [c['content_key'] for c in result['items']]==['publication:1']
 assert result['items'][0]['reasons'][0]['origin']=='observed'
 assert {r['type'] for r in result['items'][0]['reasons']}=={'category'}
 assert data['preferences']['interests']==[{'type':'category','key':'culture'}]


def test_saved_sentence_words_never_drive_recommendations():
 # 저장 문장 관련 글은 제거됐다(단어 하나만 겹쳐도 무관한 글이 추천됐다). 예전 CMS가 sentence_words를 보내도 단어로 고르지 않는다.
 data={**inputs(),'sentence_words':[{'word':'10월','n':1}]};p=profile(data)
 assert 'sentence_terms' not in p
 only_word={**card(keywords=['10월']),'title':'10월 소식'}
 assert rank([only_word],data,p)['items']==[]
 for params in ({'kind':'news','reason':'sentence'},{'kind':'letter','reason':'sentence'}):
  with pytest.raises(DashboardError):recommend('a',params,inputs=data)


def test_latest_fallback_and_letter_limit_without_reading_time():
 data=inputs();p=profile(data)
 fallback=rank([],data,p,allow_fallback=True,latest=[card()])
 assert fallback['fallback'] and fallback['items'][0]['reasons'][0]['type']=='latest'
 letters=[card('issue_letter:1',date='2026-10-14T04:00:00Z'),card('issue_letter:2',date='2026-10-14T03:00:00Z'),
          card('issue_letter:3',date='2026-10-14T02:00:00Z'),card('issue_letter:4',date='2026-10-14T01:00:00Z')]
 result=rank([],data,p,limit=3,allow_fallback=True,latest=letters)
 # 읽을 시간 예산 없이 최신순으로 limit만큼 고른다.
 assert [c['content_key'] for c in result['items']]==['issue_letter:1','issue_letter:2','issue_letter:3']
 assert result['count']==3
 assert not {'minutes_budget','total_minutes'}&set(result)


def test_dashboard_unsupported_areas_not_fake_zero_and_failure_not_empty(monkeypatch):
 def request(self,method,path,owner,body=None,query=None):
  assert owner=='fixture-a'
  if path=='/recommendation-inputs':return inputs()
  if path=='/recommendation-candidates':return {'items':[card(keywords=['관계없음'])],'latest':[],'candidate_limit':200}
  if path=='/letter-bookmarks':raise RuntimeError('fake failure')
  raise AssertionError(path)
 monkeypatch.setattr(DashboardRepository,'request',request)
 result=get_dashboard('fixture-a',{})
 assert result['saved_letters']['status']=='error' and result['saved_letters']['data'] is None
 assert result['weekly_rewards']['status']=='unavailable'
 assert result['weekly_activity']['status']=='unavailable' and result['notifications']=={'status':'unavailable','data':None,'error':None}
 assert result['profile']['data']['coverage']['legacy_unmatched']==1
 assert result['news']['status']=='ready'


@pytest.mark.parametrize('params',[{'kind':'bad'},{'kind':'news','reason':'bad'},{'kind':'news','reason':'keyword'},{'kind':'news','reason':'sentence'},{'kind':'letter','reason':'sentence'},{'kind':'letter','limit':'4'}])
def test_invalid_recommendation_query_rejected_before_storage(params):
 with pytest.raises(DashboardError):recommend('a',params)


@pytest.mark.parametrize('params',[{'kind':'news','minutes':'5'},{'kind':'letter','minutes':'7'},{'kind':'letter','minutes':'bad'}])
def test_legacy_minutes_query_is_ignored(monkeypatch,params):
 def request(self,method,path,owner,body=None,query=None):
  if path=='/recommendation-candidates':return {'items':[],'latest':[card('publication:1' if params['kind']=='news' else 'issue_letter:1')],'candidate_limit':200}
  raise AssertionError(path)
 monkeypatch.setattr(DashboardRepository,'request',request)
 result=recommend('a',params,inputs=inputs())
 assert result['count']==1
 assert not {'minutes_budget','total_minutes'}&set(result)


def test_dashboard_ignores_legacy_minutes_query(monkeypatch):
 def request(self,method,path,owner,body=None,query=None):
  if path=='/recommendation-inputs':return inputs()
  if path=='/recommendation-candidates':return {'items':[],'latest':[card('issue_letter:1')],'candidate_limit':200}
  if path=='/letter-bookmarks':return {'items':[],'total':0}
  raise AssertionError(path)
 monkeypatch.setattr(DashboardRepository,'request',request)
 result=get_dashboard('fixture-a',{'tab':'home','minutes':'7'})
 assert result['letters']['status']=='ready' and result['letters']['data']['count']==1
 assert 'minutes' not in result['preferences']['data']
 assert not {'minutes_budget','total_minutes'}&set(result['letters']['data'])



def test_latest_order_and_original_links_are_independent_of_format():
 data=inputs();p=profile(data)
 data['format_preference']={'status':'ready','distribution':[{'format':'webtoon','score':9,'share':.75},{'format':'letter','score':3,'share':.25}]}
 read={**card('publication:1',date='2026-10-14T09:00:00Z'),'category_keys':['industry']}
 toon={**card('publication:2',date='2026-10-13T09:00:00Z'),'formats':['webtoon'],'category_keys':['industry']}
 result=rank([toon,read,read],data,p)
 assert [c['content_key'] for c in result['items']]==['publication:1','publication:2']
 assert all(c['href']=='/lens/article' and 'preferred_format' not in c and 'interest_score' not in c for c in result['items'])


@pytest.mark.parametrize('with_follow',[False,True])
def test_letter_request_uses_only_actual_editors_and_latest_when_no_follows(monkeypatch,with_follow):
 data=inputs()
 if with_follow:data['followed_editors']={'items':[{'id':'mincheol','name':'민철','active':True}]}
 assigned={**card('issue_letter:1'),'editors':['mincheol']}
 latest=card('issue_letter:2')
 def request(self,method,path,owner,body=None,query=None):
  assert path=='/recommendation-candidates' and body=={'kind':'issue_letter','categories':[],'editors':['mincheol'] if with_follow else []}
  return {'items':[assigned,latest],'latest':[latest],'candidate_limit':200}
 monkeypatch.setattr(DashboardRepository,'request',request)
 result=recommend('a',{'kind':'letter'},inputs=data)
 assert result['items'][0]['content_key']==('issue_letter:1' if with_follow else 'issue_letter:2')
 assert result['items'][0]['reasons'][0]['type']==('editor' if with_follow else 'latest')
 assert 'minutes_budget' not in result


def test_followed_editor_requires_actual_author_and_preserves_direct_interest():
 data=inputs();data['followed_editors']={'items':[{'id':'mincheol','name':'민철','active':True}]}
 p=profile(data)
 assigned={**card('issue_letter:1'),'kind':'issue_letter','editors':['mincheol']}
 unrelated={**card('issue_letter:2'),'kind':'issue_letter','editors':[]}
 result=rank([unrelated,assigned],data,p)
 assert len(result['items'])==1 and result['items'][0]['reasons'][0]['type']=='editor'
 assert data['preferences']['interests']==[{'type':'category','key':'industry'}]


@pytest.mark.parametrize(('tab','expected_paths'),[
 (None,['/recommendation-inputs','/recommendation-candidates','/recommendation-candidates','/letter-bookmarks']),
 ('home',['/recommendation-inputs','/recommendation-candidates','/recommendation-candidates','/letter-bookmarks']),
 ('archive',['/recommendation-inputs','/letter-bookmarks']),
 ('records',['/recommendation-inputs','/letter-bookmarks']),
 ('settings',['/recommendation-inputs']),
])
def test_dashboard_only_reads_areas_used_by_tab_and_keeps_legacy_default(monkeypatch,tab,expected_paths):
 calls=[]
 def request(self,method,path,owner,body=None,query=None):
  assert owner=='fixture-a'
  calls.append(path)
  if path=='/recommendation-inputs':return inputs()
  if path=='/recommendation-candidates':return {'items':[card(keywords=['반도체'])],'latest':[],'candidate_limit':200}
  if path=='/letter-bookmarks':return {'items':[],'total':7}
  raise AssertionError(path)
 monkeypatch.setattr(DashboardRepository,'request',request)
 result=get_dashboard('fixture-a',{} if tab is None else {'tab':tab})
 assert calls==expected_paths
 assert result['profile']['status']=='ready'
 assert result['profile']['data']['sentence_total']==1
 # 예전 화면 호환용 키. 어떤 탭에서도 계산·조회 없이 unavailable이다(/activity·/notifications/preferences 호출 없음).
 assert all(result[area]=={'status':'unavailable','data':None,'error':None} for area in ('format_preference','weekly_activity','weekly_rewards','notifications'))
 if tab=='records':
  assert result['saved_letters']['data']['total']==7
  assert all(result[area]['status']=='unavailable' and result[area]['data'] is None for area in ('news','letters','weekly_rewards','notifications'))
 if tab=='settings':
  assert result['news']['status']=='unavailable'
  assert all(result[area]['status']=='unavailable' and result[area]['data'] is None for area in ('letters','saved_letters','notifications'))


@pytest.mark.parametrize('format_preference',['missing',None,{'status':'ready','distribution':[],'preferred_format':None}])
def test_dashboard_does_not_read_format_preference_from_inputs(monkeypatch,format_preference):
 # 새 CMS는 None, 예전 CMS는 계산값을 준다. 어느 쪽이든 읽지 않고 unavailable로 둔다.
 data=inputs()
 if format_preference=='missing':data.pop('format_preference')
 else:data['format_preference']=format_preference
 def request(self,method,path,owner,body=None,query=None):
  if path=='/recommendation-inputs':return data
  if path=='/recommendation-candidates':return {'items':[],'latest':[card()],'candidate_limit':200}
  if path=='/letter-bookmarks':return {'items':[],'total':0}
  raise AssertionError(path)
 monkeypatch.setattr(DashboardRepository,'request',request)
 result=get_dashboard('fixture-a',{})
 assert result['format_preference']=={'status':'unavailable','data':None,'error':None}
 assert result['news']['status']=='ready' and result['letters']['status']=='ready'


def test_invalid_dashboard_tab_is_rejected_before_storage(monkeypatch):
 def request(*args,**kwargs):raise AssertionError('storage must not be called')
 monkeypatch.setattr(DashboardRepository,'request',request)
 with pytest.raises(DashboardError):get_dashboard('fixture-a',{'tab':'unknown'})
