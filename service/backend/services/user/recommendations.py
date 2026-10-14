"""초기 exact 추천. 근거의 출처를 보존하며 의미 유사도/품질 확률로 표현하지 않는다."""
import datetime as dt
import re
import unicodedata
from models.dashboard import DashboardError
from repositories.dashboard_repository import DashboardRepository

NAMES={'markets':'시그널','property':'부동산','economy':'경제','finance':'금융','industry':'산업','politics':'정치','national':'사회','international':'국제','culture':'문화'}
STOP=set('그리고 그러나 하지만 또는 있다 없다 된다 하는 대한 위해 통해 것이 것을 것은 에서 이런 같은 우리 이번 오늘 관련 있는 없는 한다 입니다 했어요 있어요 경제 뉴스 기사 했다 합니다 입니다'.split())
VERSION='exact-format-v2'

def normalize(text): return unicodedata.normalize('NFKC',text).lower().strip()

def profile(data):
    categories=[{'key':r['key'],'label':NAMES[r['key']],'distinct_contents':r['n']} for r in data['categories'] if r['key'] in NAMES][:5]
    keywords=[{'key':normalize(r['key']),'label':r['key'],'distinct_contents':r['n']} for r in data['keywords'] if normalize(r['key']) not in STOP][:8]
    terms=[]
    for row in data['sentence_words']:
        token=re.sub(r'(?:에서는|으로는|에서|으로|에는|은|는|이|가|을|를|의|와|과)$','',normalize(row['word']))
        if 2<=len(token)<=30 and token not in STOP and token not in terms: terms.append(token)
    return {'window_days':90,'categories':categories,'keywords':keywords,'sentence_terms':terms[:8],
            'coverage':{'legacy_unmatched':data['coverage']['unmatched'],'window_days':90},
            'format_preference':data.get('format_preference'),
            'viewed_news_count':data['coverage']['news_count'],'viewed_letter_count':data['coverage']['letter_count'],'sentence_total':data['sentence_total']}


def conditions(data,p,reason):
    categories=set()
    terms=[]
    if reason in ('all','category'):
        categories.update(r['key'] for r in p['categories'])
        categories.update(r['key'] for r in data['preferences']['interests'] if r['type']=='category')
    if reason in ('all','keyword'):
        terms += [r['key'] for r in p['keywords']]+[normalize(r['name']) for r in data['selected_topics']]
    if reason in ('all','sentence'): terms += p['sentence_terms']
    return sorted(categories),list(dict.fromkeys(term for term in terms if 2<=len(term)<=64))


FORMAT_NAMES={'letter':'읽기','webtoon':'웹툰','podcast':'듣기','video':'영상'}

def with_format(card,preference):
    result={**card,'preferred_format':None,'format_affinity':0}
    if not preference or preference['status']!='ready':return result
    available=[r for r in preference['distribution'] if r['format'] in card['formats'] and r['score']>0]
    if not available:return result
    best=max(r['score'] for r in available);leaders=[r for r in available if r['score']==best]
    result['format_affinity']=max(r['share'] for r in available)
    if len(leaders)==1:
        result['preferred_format']=leaders[0]['format']
        if card['kind']=='publication':result['href']=card.get('canonical_href',card['href'])+'?format='+leaders[0]['format']
    return result

def rank(cards,data,p,reason='all',limit=4,minutes=0,allow_fallback=False,latest=()):
    selected={r['key'] for r in data['preferences']['interests'] if r['type']=='category'}
    observed={r['key']:r for r in p['categories']}
    ranked=[]
    for card in cards:
        reasons=[]
        text=normalize(' '.join([card['title'],card['summary'],*card['keywords']]))
        for key in card['category_keys']:
            if key in observed:
                n=observed[key]['distinct_contents']
                reasons.append({'type':'category','origin':'observed','key':key,'text':f"{'자주 열람한' if n>=2 else '열람한'} ‘{NAMES[key]}’ 분야",'method':'exact','evidence_count':n});break
            if key in selected:
                reasons.append({'type':'category','origin':'selected','key':key,'text':f"직접 선택한 ‘{NAMES[key]}’ 분야",'method':'exact','evidence_count':None});break
        for kw in p['keywords']:
            if kw['key'] in text:
                reasons.append({'type':'keyword','origin':'observed','key':kw['key'],'text':f"열람한 글의 키워드 ‘{kw['label']}’ 포함",'method':'exact','evidence_count':kw['distinct_contents']});break
        if not any(r['type']=='keyword' for r in reasons):
            for topic in data['selected_topics']:
                if normalize(topic['name']) in text:
                    reasons.append({'type':'keyword','origin':'selected','key':topic['slug'],'text':f"직접 선택한 주제 ‘{topic['name']}’ 포함",'method':'exact','evidence_count':None});break
        for term in p['sentence_terms']:
            if term in text:
                reasons.append({'type':'sentence','origin':'saved_sentence','key':term,'text':f"저장 문장의 단어 ‘{term}’ 포함",'method':'exact','evidence_count':None});break
        follows={e['id']:e for e in data.get('followed_editors',{}).get('items',[]) if e['active']}
        if reason=='all':
            editor=next((follows[e] for e in card.get('editors',[]) if e in follows),None)
            if editor:reasons.append({'type':'editor','origin':'followed_editor','key':editor['id'],'text':f"팔로우한 {editor['name']} 에디터의 레터",'method':'editorial','evidence_count':None})
        if not reasons or reason!='all' and not any(r['type']==reason for r in reasons):continue
        score=sum({'category':2,'keyword':3,'sentence':4,'editor':2}[r['type']] for r in reasons)
        annotated=with_format(card,data.get('format_preference'))
        ranked.append((not card['viewed'],score,annotated['format_affinity'],card['published_at'],card['content_key'],{**annotated,'interest_score':score,'reasons':reasons}))
    ranked.sort(key=lambda row:row[:5],reverse=True)
    pool=[r[5] for r in ranked]
    fallback=False
    if not pool and allow_fallback:
        fallback=True
        pool=[{**with_format(c,data.get('format_preference')),'reasons':[{'type':'latest','origin':'fallback','key':None,'text':'최근 발행된 공개 콘텐츠예요.','method':'exact','evidence_count':None}]} for c in latest]
    picked=[];used=set();total=0
    for card in pool:
        if card['content_key'] in used: continue
        duration=card['read_minutes']
        if minutes and (duration is None or duration<=0 or total+duration>minutes): continue
        picked.append(card);used.add(card['content_key']);total+=duration or 0
        if len(picked)>=limit:break
    return {'items':picked,'count':len(picked),'algorithm_version':VERSION,'generated_at':dt.datetime.now(dt.timezone.utc).isoformat(),
            'fallback':fallback,'coverage':p['coverage'],'minutes_budget':minutes,'total_minutes':total}


def recommend(owner,params,inputs=None,sentence_id=None):
    kind=params.get('kind')
    reason=params.get('reason','all')
    if kind not in ('news','letter') or reason not in ('all','category','keyword','sentence') or kind=='letter' and reason!='all' or kind=='news' and 'minutes' in params:
        raise DashboardError(400,'INVALID_ARGUMENT','추천 조건을 확인해 주세요.')
    try:
        limit=int(params.get('limit',3 if kind=='letter' or sentence_id is not None else 4))
    except (ValueError,TypeError) as exc: raise DashboardError(400,'INVALID_ARGUMENT','추천 개수를 확인해 주세요.') from exc
    if not 1<=limit<=(3 if kind=='letter' or sentence_id is not None else 20): raise DashboardError(400,'INVALID_ARGUMENT','추천 개수를 확인해 주세요.')
    repo=DashboardRepository()
    data=inputs or repo.request('GET','/recommendation-inputs' if sentence_id is None else f'/sentence-inputs/{sentence_id}',owner)
    p=profile(data)
    try: minutes=int(params.get('minutes',data['preferences']['minutes'])) if kind=='letter' else 0
    except (ValueError,TypeError) as exc: raise DashboardError(400,'INVALID_ARGUMENT','읽을 시간을 확인해 주세요.') from exc
    if minutes not in (0,5,10): raise DashboardError(400,'INVALID_ARGUMENT','읽을 시간은 0/5/10분이에요.')
    if sentence_id is not None: reason='sentence';limit=min(limit,3)
    cats,terms=conditions(data,p,reason)
    candidates=repo.request('POST','/recommendation-candidates',owner,body={'kind':'publication' if kind=='news' else 'issue_letter','categories':cats,'terms':terms,'editors':[e['id'] for e in data.get('followed_editors',{}).get('items',[]) if e['active']] if kind=='letter' and reason=='all' else []})
    result=rank(candidates['items'],data,p,reason,limit,minutes,kind=='news' and reason=='all' and sentence_id is None,candidates['latest'])
    result['coverage']['candidate_limit']=candidates['candidate_limit']
    if sentence_id is not None:result.update(sentence_id=sentence_id,method='exact')
    return result
