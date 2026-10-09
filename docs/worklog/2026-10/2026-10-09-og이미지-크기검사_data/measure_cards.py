import re,csv,json,urllib.request
from concurrent.futures import ThreadPoolExecutor
exec(open('measure_og.py',encoding='utf-8').read().split("cache = {}")[0].split("sm = open")[0])  # UA, imports
src=open('measure_og.py',encoding='utf-8').read()
ns={}
exec(src[src.index('def head_html'):src.index('cache = {}')],{'urllib':urllib,'re':re,'struct':__import__('struct'),'UA':UA},ns)
dims=ns['dims']
rows=[r for r in csv.DictReader(open('og_sizes.csv',encoding='utf-8')) if r['status']=='ok' and r['w'].isdigit() and int(r['w'])<1200]
sm=open('sm.xml',encoding='utf-8').read()
smimg={}
for blk in re.findall(r'<url>(.*?)</url>',sm,re.S):
    u=re.search(r'<loc>([^<]*)',blk).group(1)
    smimg[u]=re.findall(r'<image:loc>([^<]*)',blk)
cache={}
def work(r):
    u=r['url']; og=r['og_image']
    try:
        h=urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=30).read().decode('utf-8','ignore')
    except Exception as e: return [u,'fetch-err','','','']
    cands=[]
    for b in re.findall(r'<script type="application/ld\+json"[^>]*>(.*?)</script>',h,re.S):
        try: j=json.loads(b)
        except: continue
        for it in (j if isinstance(j,list) else j.get('@graph',[j])):
            if it.get('@type')=='NewsArticle':
                im=it.get('image') or []
                for x in (im if isinstance(im,list) else [im]):
                    cands.append(x.get('url') if isinstance(x,dict) else x)
    cands+=smimg.get(u,[])
    cands=[c for c in dict.fromkeys(cands) if c and c!=og]
    if not cands: return [u,'no-alt','','','']
    best=None
    for c in cands[:3]:
        try:
            w,hh=cache[c] if c in cache else cache.setdefault(c,dims(c))
        except Exception: continue
        if w and (best is None or w>best[1]): best=(c,w,hh)
    if not best: return [u,'alt-unreadable','','',cands[0]]
    return [u,'alt-ok',best[1],best[2],best[0]]
with ThreadPoolExecutor(10) as ex: out=list(ex.map(work,rows))
csv.writer(open('card_alt.csv','w',newline='',encoding='utf-8')).writerows([['url','status','w','h','alt']]+out)
print('done',len(out))
