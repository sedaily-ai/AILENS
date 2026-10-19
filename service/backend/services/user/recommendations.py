"""뉴스는 열람 분야, 레터는 팔로우 저자로 찾는다.

저장 문장 관련 글(문장 단어 일치)은 2026-10-19 기능 다이어트로 제거했다. 단어 하나(예: '10월')만 겹쳐도 무관한 글이 추천됐다.
"""
import datetime as dt
from models.dashboard import DashboardError
from repositories.dashboard_repository import DashboardRepository

NAMES={'markets':'시그널','property':'부동산','economy':'경제','finance':'금융','industry':'산업','politics':'정치','national':'사회','international':'국제','culture':'문화'}
VERSION='recent-category-editor-v3'


def profile(data):
    categories=[{'key':r['key'],'label':NAMES[r['key']],'distinct_contents':r['n']} for r in data['categories'] if r['key'] in NAMES][:5]
    return {'window_days':90,'categories':categories,
            'coverage':{'legacy_unmatched':data['coverage']['unmatched'],'window_days':90},
            'viewed_news_count':data['coverage']['news_count'],'viewed_letter_count':data['coverage']['letter_count'],'sentence_total':data['sentence_total']}


def active_editors(data):
    return {e['id']:e for e in data.get('followed_editors',{}).get('items',[]) if e['active']}


def rank(cards,data,p,reason='all',limit=4,allow_fallback=False,latest=()):
    observed={r['key']:r for r in p['categories']}
    follows=active_editors(data)
    pool=[]
    for card in cards:
        evidence=None
        if card['kind']=='issue_letter':
            editor=next((follows[e] for e in card.get('editors',[]) if e in follows),None)
            if editor:evidence={'type':'editor','origin':'followed_editor','key':editor['id'],'text':f"팔로우한 {editor['name']} 에디터의 레터",'method':'editorial','evidence_count':None}
        else:
            category=next((observed[key] for key in card['category_keys'] if key in observed),None)
            if category:
                evidence={'type':'category','origin':'observed','key':category['key'],'text':f"열람한 ‘{category['label']}’ 분야의 새 글",'method':'exact','evidence_count':category['distinct_contents']}
        if evidence:pool.append({**card,'reasons':[evidence]})
    fallback=not pool and allow_fallback
    if fallback:
        pool=[{**card,'reasons':[{'type':'latest','origin':'fallback','key':None,'text':'최근 발행된 공개 콘텐츠예요.','method':'exact','evidence_count':None}]} for card in latest]
    pool.sort(key=lambda card:(card['published_at'],card['content_key']),reverse=True)
    picked=[];used=set()
    for card in pool:
        if card['content_key'] in used:continue
        picked.append(card);used.add(card['content_key'])
        if len(picked)>=limit:break
    return {'items':picked,'count':len(picked),'algorithm_version':VERSION,'generated_at':dt.datetime.now(dt.timezone.utc).isoformat(),
            'fallback':fallback,'coverage':dict(p['coverage'])}


def recommend(owner,params,inputs=None):
    kind=params.get('kind')
    reason=params.get('reason','all')
    allowed=('all','category') if kind=='news' else ('all',)
    # 옛 화면이 보내는 minutes(읽을 시간)는 기능 제거 후에도 거부하지 않고 무시한다.
    if kind not in ('news','letter') or reason not in allowed:
        raise DashboardError(400,'INVALID_ARGUMENT','추천 조건을 확인해 주세요.')
    try:limit=int(params.get('limit',3 if kind=='letter' else 4))
    except (ValueError,TypeError) as exc:raise DashboardError(400,'INVALID_ARGUMENT','추천 개수를 확인해 주세요.') from exc
    if not 1<=limit<=(3 if kind=='letter' else 20):raise DashboardError(400,'INVALID_ARGUMENT','추천 개수를 확인해 주세요.')
    repo=DashboardRepository()
    data=inputs or repo.request('GET','/recommendation-inputs',owner)
    p=profile(data)
    editors=active_editors(data) if kind=='letter' else {}
    candidates=repo.request('POST','/recommendation-candidates',owner,body={
        'kind':'publication' if kind=='news' else 'issue_letter',
        'categories':[r['key'] for r in p['categories']] if kind=='news' else [],'editors':list(editors)})
    result=rank(candidates['items'],data,p,reason,limit,kind=='news' and reason=='all' or kind=='letter' and not editors,candidates['latest'])
    result['coverage']['candidate_limit']=candidates['candidate_limit']
    return result
