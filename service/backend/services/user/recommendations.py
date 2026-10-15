"""뉴스는 열람 분야, 레터는 팔로우 저자, 문장 관련 글은 해당 문장의 단어로 찾는다."""
import datetime as dt
import re
import unicodedata
from models.dashboard import DashboardError
from repositories.dashboard_repository import DashboardRepository

NAMES={'markets':'시그널','property':'부동산','economy':'경제','finance':'금융','industry':'산업','politics':'정치','national':'사회','international':'국제','culture':'문화'}
STOP=set('그리고 그러나 하지만 또는 있다 없다 된다 하는 대한 위해 통해 것이 것을 것은 에서 이런 같은 우리 이번 오늘 관련 있는 없는 한다 입니다 했어요 있어요 경제 뉴스 기사 했다 합니다'.split())
VERSION='recent-category-editor-v3'


def normalize(text): return unicodedata.normalize('NFKC',text).lower().strip()


def profile(data):
    categories=[{'key':r['key'],'label':NAMES[r['key']],'distinct_contents':r['n']} for r in data['categories'] if r['key'] in NAMES][:5]
    terms=[]
    # CMS는 특정 문장의 관련 글 요청에만 sentence_words를 반환한다.
    for row in data.get('sentence_words',[]):
        token=re.sub(r'(?:에서는|으로는|에서|으로|에는|은|는|이|가|을|를|의|와|과)$','',normalize(row['word']))
        if 2<=len(token)<=30 and token not in STOP and token not in terms: terms.append(token)
    return {'window_days':90,'categories':categories,'sentence_terms':terms[:8],
            'coverage':{'legacy_unmatched':data['coverage']['unmatched'],'window_days':90},
            'viewed_news_count':data['coverage']['news_count'],'viewed_letter_count':data['coverage']['letter_count'],'sentence_total':data['sentence_total']}


def active_editors(data):
    return {e['id']:e for e in data.get('followed_editors',{}).get('items',[]) if e['active']}


def rank(cards,data,p,reason='all',limit=4,minutes=0,allow_fallback=False,latest=()):
    observed={r['key']:r for r in p['categories']}
    follows=active_editors(data)
    pool=[]
    for card in cards:
        evidence=None
        if reason=='sentence':
            text=normalize(' '.join([card['title'],card['summary'],*card['keywords']]))
            term=next((term for term in p['sentence_terms'] if term in text),None)
            if term:evidence={'type':'sentence','origin':'saved_sentence','key':term,'text':f"저장 문장의 단어 ‘{term}’ 포함",'method':'exact','evidence_count':None}
        elif card['kind']=='issue_letter':
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
    picked=[];used=set();total=0
    for card in pool:
        if card['content_key'] in used:continue
        duration=card['read_minutes']
        if minutes and (duration is None or duration<=0 or total+duration>minutes):continue
        picked.append(card);used.add(card['content_key']);total+=duration or 0
        if len(picked)>=limit:break
    return {'items':picked,'count':len(picked),'algorithm_version':VERSION,'generated_at':dt.datetime.now(dt.timezone.utc).isoformat(),
            'fallback':fallback,'coverage':dict(p['coverage']),'minutes_budget':minutes,'total_minutes':total}


def recommend(owner,params,inputs=None,sentence_id=None):
    kind=params.get('kind')
    reason=params.get('reason','all')
    allowed=('all','sentence') if sentence_id is not None else ('all','category') if kind=='news' else ('all',)
    if kind not in ('news','letter') or reason not in allowed or kind=='news' and 'minutes' in params:
        raise DashboardError(400,'INVALID_ARGUMENT','추천 조건을 확인해 주세요.')
    try:limit=int(params.get('limit',3 if kind=='letter' or sentence_id is not None else 4))
    except (ValueError,TypeError) as exc:raise DashboardError(400,'INVALID_ARGUMENT','추천 개수를 확인해 주세요.') from exc
    if not 1<=limit<=(3 if kind=='letter' or sentence_id is not None else 20):raise DashboardError(400,'INVALID_ARGUMENT','추천 개수를 확인해 주세요.')
    repo=DashboardRepository()
    data=inputs or repo.request('GET','/recommendation-inputs' if sentence_id is None else f'/sentence-inputs/{sentence_id}',owner)
    p=profile(data)
    try:minutes=int(params.get('minutes',data['preferences']['minutes'])) if kind=='letter' else 0
    except (ValueError,TypeError) as exc:raise DashboardError(400,'INVALID_ARGUMENT','읽을 시간을 확인해 주세요.') from exc
    if minutes not in (0,5,10):raise DashboardError(400,'INVALID_ARGUMENT','읽을 시간은 0/5/10분이에요.')
    sentence=sentence_id is not None
    editors=active_editors(data) if kind=='letter' else {}
    candidates=repo.request('POST','/recommendation-candidates',owner,body={
        'kind':'publication' if kind=='news' else 'issue_letter',
        'categories':[r['key'] for r in p['categories']] if kind=='news' and not sentence else [],
        'terms':p['sentence_terms'] if sentence else [],'editors':list(editors)})
    result=rank(candidates['items'],data,p,'sentence' if sentence else reason,limit,minutes,
                not sentence and (kind=='news' and reason=='all' or kind=='letter' and not editors),candidates['latest'])
    result['coverage']['candidate_limit']=candidates['candidate_limit']
    if sentence:result.update(sentence_id=sentence_id,method='exact')
    return result
