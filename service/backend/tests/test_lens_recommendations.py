"""추천 규칙과 집계 계약. DB/외부 서비스 호출 없이 고정 입력으로 검사."""
from services.user.recommendations import profile,rank,recommend
from services.user.dashboard_summary import get_dashboard
from models.dashboard import DashboardError
from repositories.dashboard_repository import DashboardRepository
import pytest


def inputs():return {'preferences':{'interests':[{'type':'category','key':'industry'}],'minutes':5},'categories':[{'key':'industry','n':2}],
 'keywords':[{'key':'반도체','n':2}],'sentence_words':[{'word':'배터리가','n':1}],'selected_topics':[],
 'coverage':{'unmatched':1,'news_count':2,'letter_count':0},'sentence_total':1,'recent_sentences':[],'followed_editors':{'items':[]},'format_preference':{'status':'insufficient_data','distribution':[],'preferred_format':None}}


def card(key='publication:1',minutes=None,keywords=(),date='2026-10-14T00:00:00Z',viewed=False):
 return {'content_key':key,'kind':'publication','id':'1','slug':'article','title':'본문 등록 키워드만 있음','summary':'요약','published_at':date,'category_keys':[],'keywords':list(keywords),'read_minutes':minutes,'formats':['letter'],'viewed':viewed,'saved':False,'href':'/lens/article','completed':False}


def test_registered_keyword_sentence_and_selected_reasons_remain_distinct():
 data=inputs();p=profile(data)
 assert p['sentence_terms']==['배터리'] and p['categories'][0]['distinct_contents']==2
 result=rank([card(keywords=['반도체','배터리'])],data,p)
 reasons=result['items'][0]['reasons']
 assert {r['type'] for r in reasons}=={'keyword','sentence'}
 assert {r['origin'] for r in reasons}=={'observed','saved_sentence'}
 assert all(r['method']=='exact' for r in reasons)
 assert all('배터리가' not in r['text'] for r in reasons)
 data['selected_topics']=[{'slug':'rates','name':'금리'}]
 result=rank([card(keywords=['금리'])],data,p)
 assert result['items'][0]['reasons'][0]['origin']=='selected'


def test_reason_filters_do_not_fallback_and_letter_budget_is_sum():
 data=inputs();p=profile(data)
 assert rank([card()],data,p,reason='sentence',latest=[card()])['items']==[]
 fallback=rank([],data,p,allow_fallback=True,latest=[card()])
 assert fallback['fallback'] and fallback['items'][0]['reasons'][0]['type']=='latest'
 result=rank([card('issue_letter:1',3,['반도체']),card('issue_letter:2',3,['반도체']),card('issue_letter:3',None,['반도체'])],data,p,limit=3,minutes=5)
 assert result['total_minutes']==3 and result['count']==1
 assert all(c['read_minutes'] is not None for c in result['items'])
 assert rank([card('issue_letter:1',3,['반도체'],viewed=True),card('issue_letter:2',3,['반도체'])],data,p)['items'][0]['content_key']=='issue_letter:2'


def test_dashboard_unsupported_areas_not_fake_zero_and_failure_not_empty(monkeypatch):
 def request(self,method,path,owner,body=None,query=None):
  assert owner=='fixture-a'
  if path=='/recommendation-inputs':return inputs()
  if path=='/recommendation-candidates':return {'items':[card(keywords=['관계없음'])],'latest':[],'candidate_limit':200}
  if path=='/letter-bookmarks':raise RuntimeError('fake failure')
  if path=='/notifications/preferences':return {'revision':0}
  if path=='/rewards':return {'status':'ready','data':{'stamp_days':0},'error':None}
  raise AssertionError(path)
 monkeypatch.setattr(DashboardRepository,'request',request)
 result=get_dashboard('fixture-a',{})
 assert result['saved_letters']['status']=='error' and result['saved_letters']['data'] is None
 assert result['weekly_rewards']['status']=='ready' and result['notifications']['data']=={'revision':0}
 assert result['profile']['data']['coverage']['legacy_unmatched']==1
 assert result['news']['status']=='ready'


@pytest.mark.parametrize('params',[{'kind':'bad'},{'kind':'news','minutes':'5'},{'kind':'news','reason':'bad'},{'kind':'letter','reason':'sentence'},{'kind':'letter','limit':'4'}])
def test_invalid_recommendation_query_rejected_before_storage(params):
 with pytest.raises(DashboardError):recommend('a',params)



def test_sentence_default_limit_is_three_and_missing_owner_remains_404(monkeypatch):
 import urllib.error
 def request(self,method,path,owner,body=None,query=None):
  if path.startswith('/sentence-inputs/'):
   raise urllib.error.HTTPError('http://127.0.0.1',404,'missing',{},None)
  raise AssertionError(path)
 monkeypatch.setattr(DashboardRepository,'request',request)
 with pytest.raises(urllib.error.HTTPError) as error:
  recommend('other',{'kind':'news','reason':'sentence'},sentence_id='2')
 assert error.value.code==404


def test_format_breaks_relevance_ties_only_and_uses_available_link():
 data=inputs();p=profile(data)
 data['format_preference']={'status':'ready','distribution':[{'format':'webtoon','score':9,'share':.75},{'format':'letter','score':3,'share':.25}]}
 read=card('publication:1',keywords=['반도체'],date='2026-10-14T09:00:00Z')
 toon={**card('publication:2',keywords=['반도체'],date='2026-10-13T09:00:00Z'),'formats':['webtoon']}
 assert rank([read,toon],data,p)['items'][0]['content_key']=='publication:2'
 assert rank([read,toon],data,p)['items'][0]['href']=='/lens/article?format=webtoon'
 stronger={**read,'keywords':['반도체','배터리']}
 assert rank([stronger,toon],data,p)['items'][0]['content_key']=='publication:1'
 data['format_preference']['status']='insufficient_data'
 assert '?format' not in rank([toon],data,p)['items'][0]['href']


def test_followed_editor_requires_actual_author_and_preserves_direct_interest():
 data=inputs();data['followed_editors']={'items':[{'id':'mincheol','name':'민철','active':True}]}
 p=profile(data)
 assigned={**card('issue_letter:1'),'kind':'issue_letter','editors':['mincheol']}
 unrelated={**card('issue_letter:2'),'kind':'issue_letter','editors':[]}
 result=rank([unrelated,assigned],data,p)
 assert len(result['items'])==1 and result['items'][0]['reasons'][0]['type']=='editor'
 assert data['preferences']['interests']==[{'type':'category','key':'industry'}]


@pytest.mark.parametrize(('tab','expected_paths'),[
 (None,['/recommendation-inputs','/recommendation-candidates','/recommendation-candidates','/letter-bookmarks','/rewards','/notifications/preferences']),
 ('home',['/recommendation-inputs','/recommendation-candidates','/recommendation-candidates','/letter-bookmarks','/rewards']),
 ('archive',['/recommendation-inputs','/recommendation-candidates','/recommendation-candidates','/letter-bookmarks','/rewards','/notifications/preferences']),
 ('records',['/recommendation-inputs','/letter-bookmarks']),
 ('settings',['/recommendation-inputs','/recommendation-candidates','/rewards']),
])
def test_dashboard_only_reads_areas_used_by_tab_and_keeps_legacy_default(monkeypatch,tab,expected_paths):
 calls=[]
 def request(self,method,path,owner,body=None,query=None):
  assert owner=='fixture-a'
  calls.append(path)
  if path=='/recommendation-inputs':return inputs()
  if path=='/recommendation-candidates':return {'items':[card(keywords=['반도체'])],'latest':[],'candidate_limit':200}
  if path=='/letter-bookmarks':return {'items':[],'total':7}
  if path=='/notifications/preferences':return {'revision':7}
  if path=='/rewards':return {'status':'ready','data':{'stamp_days':1},'error':None}
  raise AssertionError(path)
 monkeypatch.setattr(DashboardRepository,'request',request)
 result=get_dashboard('fixture-a',{} if tab is None else {'tab':tab})
 assert calls==expected_paths
 assert result['profile']['status']=='ready'
 assert result['profile']['data']['sentence_total']==1
 if tab=='records':
  assert result['saved_letters']['data']['total']==7
  assert all(result[area]['status']=='unavailable' and result[area]['data'] is None for area in ('news','letters','weekly_rewards','notifications'))
 if tab=='settings':
  assert result['news']['status']=='ready' and result['weekly_rewards']['status']=='ready'
  assert all(result[area]['status']=='unavailable' and result[area]['data'] is None for area in ('letters','saved_letters','notifications'))


def test_invalid_dashboard_tab_is_rejected_before_storage(monkeypatch):
 def request(*args,**kwargs):raise AssertionError('storage must not be called')
 monkeypatch.setattr(DashboardRepository,'request',request)
 with pytest.raises(DashboardError):get_dashboard('fixture-a',{'tab':'unknown'})
