"""모아쓰기 레터 자동 발행의 순수 로직(외부 호출 없음) — 이슈 묶음 검증, 초안 보정, 사실 대조. 테스트 대상은 전부 여기 있다.

모델·서버 호출은 run.py 가 하고, 그 결과를 이 함수들이 걸러낸다. 자동 발행의 안전은 "모델이 알아서 잘 쓴다"가 아니라
"이 검증을 통과한 것만 나간다"에 의존하므로, 여기서는 의심스러우면 거절하는 쪽으로 작성한다.
"""
from __future__ import annotations

import json
import re
from typing import Any, Dict, Iterable, List, Optional, Set, Tuple

MIN_CLUSTER = 3
MAX_CLUSTER = 6
# 갈등 소지가 큰 소재는 자동 선정에서 제외한다(정치·젠더·세대·지역). 사람이 직접 쓰는 경로는 막지 않는다.
SENSITIVE_WORDS = ("대통령", "여당", "야당", "국민의힘", "민주당", "탄핵", "선거", "총선", "대선", "지방선거", "페미", "젠더", "남녀", "세대 갈등", "호남", "영남", "혐오", "차별 논란", "명태균", "김건희", "윤석열", "尹", "北", "북한",
                   "감찰", "검찰", "중수청", "공수처", "특검", "기소", "구속영장", "국정감사", "국감", "국정조사", "청문회", "여야", "정권", "탄핵")
# 본문(인용 포함)에 실리면 안 되는 투자·행동 권유 표현. 서버의 금지어(BODY_DIRECTIVE_TERMS)는 "매수하" 같은 활용형만 막아 귀속된 인용("분할 매수로 대응해야 한다")이 빠져나가므로,
# 자동 발행 경로에서는 더 넓게 막는다. 걸리면 그 인용을 빼고 사실만 쓰도록 다시 쓴다.
# 단 "순매도·순매수·매도세·매수세·매도 물량" 같은 시장 동향 보도어는 사실 서술이라 허용한다(허용어를 먼저 지운 뒤 검사한다).
ALLOWED_MARKET_TERMS = ("순매도", "순매수", "매도세", "매수세", "매도 물량", "매수 물량", "매도 압력", "매수 주체", "매도 주체", "공매도", "매도 우위", "매수 우위", "매수 전환", "매도 전환")
ADVICE_PATTERNS = ("매수", "매도", "대응해야", "사야", "팔아야", "담아야", "비중 확대", "비중 축소", "비중을 늘", "비중을 줄", "진입해야", "분할", "추천", "유망", "저점", "바닥", "지금이 기회", "투자 기회", "매수 기회")
URL_RE = re.compile(r"https?://[^\s\"')\]]+")
NUM_RE = re.compile(r"\d[\d,]*(?:\.\d+)?")


def is_sensitive(title: str) -> bool:
    return any(w in title for w in SENSITIVE_WORDS)


def clean_clusters(raw: Any, articles_by_key: Dict[str, Dict[str, Any]], used_keys: Iterable[str] = ()) -> List[Dict[str, Any]]:
    """모델이 돌려준 이슈 묶음([{topic, keys:[기사 key]}])을 믿지 않고 걸러낸다.
    - 없는 기사 key 는 버린다(모델이 지어낸 번호)
    - 이미 레터로 쓴 기사(used_keys)가 하나라도 겹치면 묶음 전체를 버린다(같은 사안 반복 방지)
    - 갈등 소지 소재는 버린다
    - 서로 다른 기사 3~6건이 남는 묶음만 남기고, 크기순으로 정렬한다"""
    used = set(used_keys)
    out: List[Dict[str, Any]] = []
    if not isinstance(raw, list):
        return out
    for c in raw:
        if not isinstance(c, dict) or not isinstance(c.get("keys"), list):
            continue
        keys: List[str] = []
        for k in c["keys"]:
            k = str(k).strip()
            if k in articles_by_key and k not in keys:
                keys.append(k)
        if len(keys) < MIN_CLUSTER or any(k in used for k in keys):
            continue
        arts = [articles_by_key[k] for k in keys][:MAX_CLUSTER]
        topic = str(c.get("topic") or "").strip()[:40]
        if not topic or any(is_sensitive(a.get("title", "")) for a in arts) or is_sensitive(topic):
            continue
        out.append({"topic": topic, "keys": [a["key"] for a in arts], "articles": arts})
    out.sort(key=lambda x: -len(x["keys"]))
    return out


def sedaily_url(key: str) -> str:
    return f"https://www.sedaily.com/article/{key}"


def draft_urls(draft: Dict[str, Any]) -> Set[str]:
    """초안 본문 인라인 링크와 출처 목록의 모든 주소."""
    urls: Set[str] = set()
    for sec in draft.get("sections") or []:
        for para in sec.get("paragraphs") or []:
            for part in para:
                if isinstance(part, dict) and part.get("href"):
                    urls.add(str(part["href"]))
    for s in draft.get("sources") or []:
        if isinstance(s, dict) and s.get("url"):
            urls.add(str(s["url"]))
    return urls


def article_key_of(url: str) -> Optional[str]:
    m = re.search(r"sedaily\.com/(?:article|NewsView)/(\w+)", url)
    return m.group(1) if m else None


def restrict_to_cluster(draft: Dict[str, Any], allowed_keys: Iterable[str]) -> List[str]:
    """초안이 묶음 밖의 기사를 링크했는지 확인한다. 위반 주소 목록을 돌려준다(비어 있으면 통과)."""
    allowed = set(allowed_keys)
    bad = []
    for u in draft_urls(draft):
        k = article_key_of(u)
        if k is None or k not in allowed:
            bad.append(u)
    return sorted(bad)


def block_text(block: Dict[str, Any]) -> str:
    parts: List[str] = [str(block.get(k) or "") for k in ("title", "text")]
    for side in ("left", "right"):
        if isinstance(block.get(side), dict):
            parts += [str(block[side].get("label") or ""), str(block[side].get("text") or "")]
    for i in block.get("items") or []:
        if isinstance(i, dict):
            parts += [str(i.get(k) or "") for k in ("label", "text", "value", "sub")]
        else:
            parts.append(str(i))
    return " ".join(p for p in parts if p)


def para_text(para: Any) -> str:
    """문단(조각 배열) 또는 시각 블록의 글자. 블록 안의 숫자·문장도 같은 검증(수치 대조·권유 표현)을 받도록 합친다."""
    return "".join(p if isinstance(p, str) else (block_text(p) if "block" in p else str(p.get("text", ""))) for p in (para or []) if isinstance(p, (str, dict)))


def draft_body_text(draft: Dict[str, Any]) -> str:
    parts: List[str] = [str(draft.get("title") or ""), str(draft.get("deck") or ""), *[str(s) for s in draft.get("summary") or []], str(draft.get("editor_note") or "")]
    for sec in draft.get("sections") or []:
        parts += [str(sec.get("heading") or ""), str(sec.get("key_line") or "")]
        for para in sec.get("paragraphs") or []:
            parts.append(para_text(para))
    return "\n".join(parts)


# 템플릿 v2 분량 규칙: 본문 기준 2,500~3,500자(모바일 5~7분). 본문 = 섹션 문단 글자 수(제목·요약·한마디 제외).
BODY_MIN_CHARS = 2000
BODY_MAX_CHARS = 3500


def body_chars(draft: Dict[str, Any]) -> int:
    n = 0
    for sec in draft.get("sections") or []:
        for para in sec.get("paragraphs") or []:
            n += len(para_text(para))
    return n


def trim_to_max(draft: Dict[str, Any]) -> int:
    """본문이 상한(BODY_MAX_CHARS)을 넘으면 코드가 줄인다(재생성 금지). 링크가 없는 문단 중 가장 긴 것부터, 섹션마다 문단이 1개 이상 남는 범위에서 뺀다. 뺀 문단 수를 돌려준다."""
    removed = 0
    while body_chars(draft) > BODY_MAX_CHARS:
        cands = []
        for si, sec in enumerate(draft.get("sections") or []):
            paras = sec.get("paragraphs") or []
            plain = [pi for pi, para in enumerate(paras) if not any(isinstance(x, dict) and ("href" in x or "block" in x) for x in para)]
            if len(paras) - 1 >= 1:
                cands += [(len(para_text(paras[pi])), si, pi) for pi in plain]
        if not cands:
            break
        _, si, pi = max(cands)
        del draft["sections"][si]["paragraphs"][pi]
        removed += 1
    return removed


def length_problem(draft: Dict[str, Any]) -> str:
    n = body_chars(draft)
    target = (BODY_MIN_CHARS + BODY_MAX_CHARS) // 2
    if n < BODY_MIN_CHARS:
        return (f"본문이 {n}자로 짧습니다. 목표는 {target}자 안팎입니다(약 {target - n}자 더). 기사에 있는 사실만으로, 섹션마다 문단 3개 이상으로 "
                "기사 속 수치·인용·경과를 빠짐없이 풀어 쓰세요(지어내기 금지, 같은 말 반복 금지)")
    if n > BODY_MAX_CHARS:
        return f"본문이 {n}자로 깁니다. 목표는 {target}자 안팎입니다(약 {n - target}자 덜). 덜 중요한 문단부터 줄이세요"
    return ""


def numbers_in(text: str) -> Set[str]:
    """본문에 나온 수치(쉼표 제거). 연도·날짜 조각도 포함하되 한 자리 수는 제외한다."""
    out = set()
    for m in NUM_RE.findall(text):
        n = m.replace(",", "")
        if len(n.replace(".", "")) >= 2:
            out.add(n)
    return out


def article_date_text(article: Dict[str, Any]) -> str:
    """기사 웹 게재일을 "게재일 2026년 10월 16일"로. XML date 는 20261016 또는 2026-10-16 꼴이다. 알 수 없으면 빈 문자열."""
    digits = re.sub(r"\D", "", str(article.get("date") or ""))[:8]
    if len(digits) != 8:
        return ""
    return f"게재일 {int(digits[:4])}년 {int(digits[4:6])}월 {int(digits[6:])}일"


def unsupported_numbers(draft: Dict[str, Any], source_texts: Iterable[str]) -> List[str]:
    """초안에는 있는데 묶음 기사 본문 어디에도 없는 수치. 지어낸 숫자를 잡는 1차 대조(문자열 기반, 모델 판단 없음)."""
    source_nums: Set[str] = set()
    for t in source_texts:
        source_nums |= numbers_in(t)
    draft_nums = numbers_in(draft_body_text(draft))
    # 호수·slug 같은 값은 본문이 아니므로 draft_body_text 에 포함되지 않는다
    return sorted(draft_nums - source_nums)


def pick_editors(draft_topics: Iterable[str], editors: List[Dict[str, Any]], limit: int = 2) -> List[str]:
    """레터 주제와 에디터 담당 분야(topic_names)가 겹치는 에디터 slug 를 겹침이 많은 순으로 최대 limit 명. 겹침이 없으면 빈 목록(→ 보류)."""
    names = set(draft_topics)
    scored = sorted(((len(names & set(e.get("topic_names") or [])), e["slug"]) for e in editors), key=lambda x: (-x[0], x[1]))
    return [slug for n, slug in scored if n > 0][:limit]


def editor_covered(cluster: Dict[str, Any], editors: List[Dict[str, Any]]) -> bool:
    """이슈 묶음의 기사 제목·본문에 어느 에디터의 담당 분야(주제 이름 또는 별칭)라도 나오는지.
    하나도 안 나오면 초안을 써도 작성 에디터를 정할 수 없어 보류되므로(2026-10-12 08시 실행: 국산 비만약), 소재 단계에서 거른다."""
    titles = " ".join(str(a.get("title") or "") for a in cluster.get("articles", []))
    body = " ".join(str(a.get("content") or "") for a in cluster.get("articles", []))
    for e in editors:
        for name in e.get("topic_names") or []:
            forms = (name, *TOPIC_ALIASES.get(name, ()))
            # 제목에 나오거나 본문에 기사당 평균 2번 이상 나와야 한다(곁가지 언급으로는 중심 주제로 보지 않는다)
            if any(f in titles or body.count(f) >= 2 * len(cluster.get("articles", [])) for f in forms):
                return True
    return False


def advice_hits(draft: Dict[str, Any], source_texts: Iterable[str] = ()) -> List[str]:
    """초안 본문에 있는 투자·행동 권유 표현. 단, 그 표현이 기사 본문에도 없는 순수 생성이면 더 큰 문제라 같이 반환한다(둘 다 거부 대상)."""
    text = draft_body_text(draft)
    for allowed in ALLOWED_MARKET_TERMS:
        text = text.replace(allowed, "")
    return sorted({w for w in ADVICE_PATTERNS if w in text})


# 주제 태그는 본문에 실제로 나온 것만 둔다(템플릿 v2). 이름이 그대로 없어도 아래 대체 표기가 있으면 나온 것으로 본다.
TOPIC_ALIASES = {"인공지능": ("AI", "생성형"), "가상자산": ("비트코인", "암호화폐", "코인"), "기업 실적": ("실적", "영업이익"), "시그널(증시)": ("증시",),
                 "도시·동네": ("동네", "골목"), "음식·맛집": ("식당", "맛집"), "여행·관광": ("관광", "여행"), "무역·통상": ("무역", "통상", "수출"),
                 "안전·재난": ("사고", "재난", "안전"), "환경·기후": ("환경", "기후"), "경제성장률": ("성장률",)}


def prune_topics(draft: Dict[str, Any]) -> Dict[str, Any]:
    """본문에 나오지 않은 주제 태그를 뺀다. 앞의 두 개(주 주제)가 본문에 없으면 문제로 돌려준다."""
    text = draft_body_text(draft)
    keep, dropped = [], []
    for t in draft.get("topics") or []:
        forms = (t, *TOPIC_ALIASES.get(t, ()))
        (keep if any(f in text for f in forms) else dropped).append(t)
    draft["topics"] = keep
    return {"dropped": dropped}


ATTRIBUTION_MARKS = ("따르면", "밝혔", "말했", "지적", "설명", "주장", "분석", "평가", "전했", "강조", "내놨", "관계자", "전문가", "연구원", "교수", "측은", "위원장", "장관", "대표", "센터장", "회장", "원장", "대변인", "총재", "의원", "“", "”", "한국은행", "금융위", "금감원", "부는", "은행연합회")


def other_attribution_problem(draft: Dict[str, Any]) -> str:
    """'다른 시각' 섹션의 모든 문단에 말한 주체(기사·전문가·기관)를 알리는 표현이 있어야 한다(템플릿 v2)."""
    bare = []
    for sec in draft.get("sections") or []:
        if sec.get("axis") != "other":
            continue
        for para in sec.get("paragraphs") or []:
            if para and isinstance(para[0], dict) and "block" in para[0]:
                continue  # 시각 블록은 문단이 아니라 장식이라 귀속 검사에서 뺀다(블록 안 인용은 본문에서 이미 귀속)
            txt = para_text(para)
            if txt.strip() and not any(m in txt for m in ATTRIBUTION_MARKS):
                bare.append(txt[:40])
    if bare:
        return "다른 시각 섹션에 말한 주체(기사·전문가·기관)가 밝혀지지 않은 문단이 있습니다. 직접 비판하지 말고 누가 말했는지 귀속해 쓰세요: " + " / ".join(bare)
    return ""


# ── 키워드 기반 소재 선정(모델 호출 없음) ──────────────────────────────────────────
GENERIC_WORDS = set("""단독 시그널 확대 최대 최고 추진 출시 시장 내년 올해 지난 이번 서울 한국 정부 기업 투자 글로벌 논란 공급 1위 신규 증가 감소 개최 발표 전망 개선 강화 지원 추가 가능 계획 이후 대한 관련 통해
위해 따라 중심 이상 이하 전체 일부 주요 새로 다시 처음 오늘 어제 내일 오전 오후 사업 서비스 제품 시대 가격 규모 기준 현황 상승 하락 증시 지수 마감 속보 포토 인사 부고 오늘의 헬시타임 구축 역대 공격 지금 사설 검토 인수 급증 키운다 인프라 에이전트 낙폭 턱밑 칼럼 기고 인터뷰 종합 영상 이슈 종목""".split())
_JOSA = re.compile(r"(은|는|이|가|을|를|의|에|와|과|도|로|으로|에서|부터|까지|에게|보다)$")


def _tokens(title: str) -> Set[str]:
    out: Set[str] = set()
    for w in re.findall(r"[가-힣A-Za-z0-9·]{2,}", title or ""):
        w = _JOSA.sub("", w)
        if len(w) >= 2 and not w[0].isdigit() and w not in GENERIC_WORDS and not is_sensitive(w):  # 숫자로 시작하는 말(1조, 100조)은 사안이 아니라 수량이라 뺀다
            out.add(w)
    return out


def _title_tokens(title: str) -> Set[str]:
    return _tokens(re.sub(r"\[[^\]]*\]|\([^)]*\)|【[^】]*】", "", title or ""))  # [단독]·[사설] 같은 말머리·괄호 제거


SPECIFIC_DF_MAX = 60  # 이 값 이하로 나오는 단어를 '특정 개체·사안'으로 본다


RECENT_LETTERS = 3  # 최근 발행 레터 몇 편의 주제와 겹치는지 본다
RECENT_TOPIC_PENALTY = 5  # 겹친 주제 하나당 감점(최대 2개까지 센다)


def recent_topic_hits(cluster: Dict[str, Any], recent_topics: Iterable[str]) -> List[str]:
    """묶음 기사 제목에 최근 레터 주제(이름 또는 별칭)가 나오면 그 주제 이름을 돌려준다.
    2026-10-13~17 자동 발행 4편이 모두 산업, 그중 3편이 인공지능이라(레터탭 피드백 2026-10-20) 같은 주제가 연달아 뽑히지 않게 쓴다."""
    titles = " ".join(str(a.get("title") or "") for a in cluster.get("articles", []))
    return [name for name in dict.fromkeys(recent_topics) if any(f in titles for f in (name, *TOPIC_ALIASES.get(name, ())))]


def recent_letter_topics(letters: List[Dict[str, Any]], n: int = RECENT_LETTERS) -> List[str]:
    """발행된 레터 상세 목록에서 최근 n편의 주제 이름. topics 는 이름 문자열 또는 {name} 꼴 둘 다 받는다."""
    pub = sorted((l for l in letters if l.get("status") == "published"), key=lambda l: str(l.get("published_at") or ""), reverse=True)[:n]
    out: List[str] = []
    for l in pub:
        for t in l.get("topics") or []:
            name = t.get("name") if isinstance(t, dict) else t
            if name:
                out.append(str(name))
    return list(dict.fromkeys(out))


def keyword_clusters(articles: List[Dict[str, Any]], used_keys: Iterable[str] = (), min_articles: int = 3, min_chars: int = 5000,
                     max_candidates: int = 8, recent_topics: Iterable[str] = ()) -> List[Dict[str, Any]]:
    """최근 기사 제목에서 '같이 나오는 단어 쌍'(예: 삼성전자+영업익, AI+보안)으로 소재 후보를 만든다.
    쌍으로 보면 일반어가 걸러지고 구체적인 사안이 남는다. 기사가 여러 날에 걸쳐 많이 쓰인 소재일수록 재료가 많다.
    점수 = 기사 수(최대 12) + 2×게재 일수 + 지면 1면 포함 3 − 권유 표현 많은 본문 감점 − 최근 레터 주제와 겹치면 주제당 5(최대 10).
    기사가 겹치는 후보는 점수 높은 쪽만 둔다."""
    import itertools
    used = set(used_keys)
    recent = list(recent_topics)
    # 응집도: 쌍의 두 단어가 모두 흔한 말(전체 기사의 상당수에 나옴)이면 서로 다른 사안이 한 묶음이 된다(예: 매출+실적).
    # 적어도 한 단어는 특정 개체·사안(전체 기사 중 일부에만 나오는 말)이어야 한다.
    df: Dict[str, int] = {}
    for a in articles:
        for w in _title_tokens(a.get("title", "")):
            df[w] = df.get(w, 0) + 1
    by_pair: Dict[Tuple[str, str], List[Dict[str, Any]]] = {}
    for a in articles:
        if not a.get("key") or is_sensitive(a.get("title", "")) or a["key"] in used:
            continue
        for pair in itertools.combinations(sorted(_title_tokens(a.get("title", ""))), 2):
            by_pair.setdefault(pair, []).append(a)
    cands: List[Dict[str, Any]] = []
    for pair, arts in by_pair.items():
        if len(arts) < min_articles:
            continue
        if min(df.get(pair[0], 0), df.get(pair[1], 0)) > SPECIFIC_DF_MAX:
            continue
        days = {str(a.get("date") or "")[:10] for a in arts}
        if len(days) < 2:
            continue
        ranked = sorted(arts, key=lambda a: (str(a.get("paper_number") or "") == "1", int(a.get("content_len") or 0)), reverse=True)[:MAX_CLUSTER]
        if sum(int(a.get("content_len") or 0) for a in ranked) < min_chars:
            continue
        body = " ".join(str(a.get("content") or "") for a in ranked)
        if sum(body.count(w) for w in SENSITIVE_WORDS) >= 4:  # 본문에 정치·갈등 인물·기관 발언이 많은 소재는 제외(제목에 없어도 거른다)
            continue
        kw = "+".join(pair)
        cl = {"topic": f"{kw}: {ranked[0].get('title', '')}"[:40], "keyword": kw, "keys": [a["key"] for a in ranked], "articles": ranked}
        page1 = any(str(a.get("paper_number") or "") == "1" for a in ranked)
        adv = source_advice_score(cl)
        repeat = recent_topic_hits(cl, recent)
        cl["score"] = (min(len(arts), 12) + 2 * len(days) + (3 if page1 else 0) - (8 if adv >= 5 else 0)
                       - RECENT_TOPIC_PENALTY * min(len(repeat), 2))
        cl["n_articles"], cl["n_days"], cl["advice"], cl["recent_repeat"] = len(arts), len(days), adv, repeat
        cands.append(cl)
    cands.sort(key=lambda c: -c["score"])
    out: List[Dict[str, Any]] = []
    for c in cands:
        if any(len(set(c["keys"]) & set(o["keys"])) >= max(2, len(c["keys"]) // 2) for o in out):
            continue
        out.append(c)
        if len(out) >= max_candidates:
            break
    return out


def repair_json_quotes(text: str) -> str:
    """모델이 문자열 안에 곧은 큰따옴표를 그대로 쓴 JSON 을 고친다. 문자열 안에서 만난 따옴표 뒤가
    `, 다음 따옴표/중괄호/대괄호`·`}`·`]`·`:` 가 아니면 문자열의 끝이 아니라 본문 따옴표로 보고 이스케이프한다."""
    out: List[str] = []
    in_str = False
    i, n = 0, len(text)
    while i < n:
        ch = text[i]
        if not in_str:
            out.append(ch)
            if ch == '"':
                in_str = True
            i += 1
            continue
        if ch == "\\" and i + 1 < n:  # 이미 이스케이프된 문자
            out.append(ch + text[i + 1])
            i += 2
            continue
        if ch == '"':
            j = i + 1
            while j < n and text[j] in " \t\r":
                j += 1
            nxt = text[j] if j < n else ""
            terminator = nxt in ("}", "]", ":", "") or nxt == "\n"
            if nxt == ",":
                k = j + 1
                while k < n and text[k] in " \t\r\n":
                    k += 1
                terminator = k >= n or text[k] in '"{[]}'
            if terminator:
                out.append(ch)
                in_str = False
            else:
                out.append('\\"')
            i += 1
            continue
        out.append(ch)
        i += 1
    return "".join(out)


_ID_NOTE = re.compile(r"\s*[\(（]\s*기사\s*\d{6,}[^)）]*[\)）]")
_BARE_ID = re.compile(r"(?<![\d/])\d{8}(?![\d])")


def _clean_text(t: str) -> str:
    # 앞뒤 공백은 지우지 않는다: 링크 조각 옆 문자열의 공백이 사라지면 "했다고8일"처럼 붙는다
    if not isinstance(t, str):
        return t
    cleaned = _BARE_ID.sub("", _ID_NOTE.sub("", t))
    return re.sub(r" {2,}", " ", cleaned) if cleaned != t else t


def sanitize_draft(draft: Dict[str, Any]) -> Dict[str, Any]:
    """모델이 자주 남기는 기계적 흠을 재시도 없이 코드로 고친다: 본문·블록의 기사 번호 표기(\"(기사 20099278 근거)\" 등)를 지운다. 링크 주소(href)와 sources 는 건드리지 않는다."""
    def fix(o: Any) -> Any:
        if isinstance(o, str):
            return _clean_text(o)
        if isinstance(o, list):
            return [fix(x) for x in o]
        if isinstance(o, dict):
            return {k: (v if k in ("href", "url", "block", "axis", "key") else fix(v)) for k, v in o.items()}
        return o
    for k in ("title", "deck", "editor_note"):
        if k in draft:
            draft[k] = fix(draft[k])
    draft["summary"] = fix(draft.get("summary") or [])
    for sec in draft.get("sections") or []:
        for k in ("heading", "key_line"):
            sec[k] = fix(sec.get(k))
        # 블록은 paragraphs 안에 객체 그대로 넣게 했다(배열 겹침 실수 방지). 서버 형식(한 조각짜리 배열)으로 감싼다.
        sec["paragraphs"] = [[p] if isinstance(p, dict) and "block" in p else p for p in fix(sec.get("paragraphs") or [])]
    return draft


def _has_advice(text: str) -> bool:
    for allowed in ALLOWED_MARKET_TERMS:
        text = text.replace(allowed, "")
    return any(w in text for w in ADVICE_PATTERNS)


def drop_sentences(draft: Dict[str, Any], bad) -> int:
    """bad(text) 가 참인 문장을 코드가 직접 뺀다(재생성은 토큰 낭비). 문단 안의 문자열 조각은 문장 단위로, 시각 블록은 통째로 뺀다. 뺀 개수를 돌려준다."""
    dropped = 0
    summary = [x for x in draft.get("summary") or [] if not bad(str(x))]
    if len(summary) >= 2 and len(summary) < len(draft.get("summary") or []):  # 1분 요약은 2줄 이상 남을 때만 줄인다(아니면 발행 규칙이 거른다)
        dropped += len(draft["summary"]) - len(summary)
        draft["summary"] = summary
    for sec in draft.get("sections") or []:
        paras = []
        for para in sec.get("paragraphs") or []:
            if isinstance(para, list) and para and isinstance(para[0], dict) and "block" in para[0]:
                if bad(block_text(para[0])):
                    dropped += 1
                    continue
                paras.append(para)
                continue
            new = []
            for seg in para:
                if isinstance(seg, str):
                    sents = re.split(r"(?<=[요다]\.)\s+", seg)
                    kept = [x for x in sents if not bad(x)]
                    dropped += len(sents) - len(kept)
                    if kept:
                        new.append(" ".join(kept) + (" " if seg.endswith(" ") else ""))
                else:
                    new.append(seg)
            if new and para_text(new).strip():
                paras.append(new)
        sec["paragraphs"] = paras
    return dropped


def _norm(t: str) -> str:
    """대조용 정규화: 공백·따옴표·마침표 계열을 지운다(모델이 지적 문장을 옮겨 적을 때 달라지는 부분)."""
    return re.sub(r"[\s'\"‘’“”.,·…()\[\]]+", "", str(t))


def drop_flagged(draft: Dict[str, Any], problems: List[str]) -> List[str]:
    """사실 대조가 지적한 문장(문제 문장 + 이유 형식)을 본문·블록에서 코드가 직접 뺀다. 지적을 본문에서 찾지 못한 항목은 돌려준다(→ 이 초안은 접는다)."""
    unmatched: List[str] = []
    for prob in problems:
        head = re.split(r"\s+[—–]\s+| — |\s/\s", str(prob), maxsplit=1)[0]
        key = _norm(head)
        if len(key) < 8:
            unmatched.append(prob)
            continue
        probes = {key[:14], key[-14:]} if len(key) >= 28 else {key}
        n = drop_sentences(draft, lambda text, k=key, ps=probes: (lambda t: any(p in t for p in ps) or (len(t) >= 10 and t in k))(_norm(text)))
        if n == 0:
            unmatched.append(prob)
    return unmatched


def drop_advice(draft: Dict[str, Any]) -> int:
    return drop_sentences(draft, _has_advice)


def drop_unsupported(draft: Dict[str, Any], source_texts: Iterable[str]) -> int:
    """기사 본문에 없는 수치(모델이 단위를 바꿔 계산한 값 등)가 든 문장·블록을 뺀다."""
    source_nums: Set[str] = set()
    for t in source_texts:
        source_nums |= numbers_in(t)
    return drop_sentences(draft, lambda text: bool(numbers_in(text) - source_nums))


# 서버 저장 검증(issue_letters_repo._normalize_block)과 같은 한도. 넘치면 저장이 거부되어 재생성이 필요하므로 코드가 먼저 맞춘다.
_BLOCK_LIMITS = {
    "timeline": {"max_items": 8, "label": 30, "text": 300},
    "stats": {"max_items": 4, "label": 40, "value": 20, "sub": 80},
    "bars": {"max_items": 6, "label": 20, "title": 60, "unit": 10},
    "versus": {"label": 30, "text": 300},
    "fold": {"title": 80, "text": 1200},
    "callout": {"text": 400},
}


def _fit(value: Any, limit: int, soft: bool) -> Optional[str]:
    """soft(제목·라벨류)는 한도에서 잘라 …을 붙이고, 문장(text)류는 자르면 뜻이 바뀌므로 None(블록 폐기)."""
    v = str(value or "").strip()
    if len(v) <= limit:
        return v
    return v[: limit - 1].rstrip() + "…" if soft else None


def fit_blocks(draft: Dict[str, Any]) -> int:
    """시각 블록을 서버 한도에 맞춘다. 맞출 수 없는 블록(긴 문장)은 뺀다. 고치거나 뺀 블록 수를 돌려준다."""
    changed = 0
    for sec in draft.get("sections") or []:
        out = []
        for para in sec.get("paragraphs") or []:
            blk = para[0] if isinstance(para, list) and para and isinstance(para[0], dict) and "block" in para[0] else None
            if not blk:
                out.append(para)
                continue
            lim = _BLOCK_LIMITS.get(blk.get("block"))
            if not lim:
                out.append(para)
                continue
            ok = True
            before = json.dumps(blk, ensure_ascii=False)
            if "max_items" in lim and isinstance(blk.get("items"), list):
                blk["items"] = blk["items"][: lim["max_items"]]
            for holder in ([blk] + [i for i in blk.get("items") or [] if isinstance(i, dict)] + [blk.get(sd) for sd in ("left", "right") if isinstance(blk.get(sd), dict)]):
                for k, limit in lim.items():
                    if k == "max_items" or k not in holder or not isinstance(holder.get(k), str):
                        continue
                    fitted = _fit(holder[k], limit, soft=k not in ("text",))
                    if fitted is None:
                        ok = False
                    else:
                        holder[k] = fitted
            if not ok:
                changed += 1
                continue
            if json.dumps(blk, ensure_ascii=False) != before:
                changed += 1
            out.append(para)
        sec["paragraphs"] = out
    return changed


# ── 제목·부제·요약·핵심 한 줄 보정(문장을 지울 수 없는 자리) ──────────────────────────
def header_fields(draft: Dict[str, Any]) -> Dict[str, str]:
    """코드가 지울 수 없는 필수 자리의 글: id → 글. id 는 title / deck / editor_note / summary:i / heading:i / key_line:i."""
    out: Dict[str, str] = {"title": str(draft.get("title") or ""), "deck": str(draft.get("deck") or ""), "editor_note": str(draft.get("editor_note") or "")}
    for i, x in enumerate(draft.get("summary") or []):
        out[f"summary:{i}"] = str(x)
    for i, sec in enumerate(draft.get("sections") or []):
        out[f"heading:{i}"] = str(sec.get("heading") or "")
        out[f"key_line:{i}"] = str(sec.get("key_line") or "")
    return out


def set_header_field(draft: Dict[str, Any], fid: str, text: str) -> None:
    kind, _, idx = fid.partition(":")
    if kind in ("title", "deck", "editor_note"):
        draft[kind] = text
    elif kind == "summary":
        draft["summary"][int(idx)] = text
    elif kind == "heading":
        draft["sections"][int(idx)]["heading"] = text
    elif kind == "key_line":
        draft["sections"][int(idx)]["key_line"] = text


def bad_header_fields(draft: Dict[str, Any], source_texts: Iterable[str]) -> Dict[str, str]:
    """기사에 없는 수치나 권유 표현이 든 필수 자리: id → 이유."""
    source_nums: Set[str] = set()
    for t in source_texts:
        source_nums |= numbers_in(t)
    bad: Dict[str, str] = {}
    for fid, text in header_fields(draft).items():
        extra = sorted(numbers_in(text) - source_nums)
        if extra:
            bad[fid] = "기사에 없는 수치: " + ", ".join(extra)
        elif _has_advice(text):
            bad[fid] = "투자·행동 권유로 읽히는 표현"
    return bad


def match_header_fields(draft: Dict[str, Any], problems: List[str]) -> Dict[str, str]:
    """사실 대조 지적 문장이 들어 있는 필수 자리를 찾는다: id → 지적 내용. 못 찾은 지적은 결과에 없다."""
    found: Dict[str, str] = {}
    fields = {fid: _norm(t) for fid, t in header_fields(draft).items()}
    for prob in problems:
        head = re.split(r"\s+[—–]\s+| — |\s/\s", str(prob), maxsplit=1)[0]
        key = _norm(head)
        if len(key) < 8:
            continue
        probes = {key[:14], key[-14:]} if len(key) >= 28 else {key}
        for fid, t in fields.items():
            if t and (any(p in t for p in probes) or (len(t) >= 10 and t in key)):
                found[fid] = str(prob)[:400]
    return found


def source_advice_score(cluster: Dict[str, Any]) -> int:
    """묶음 기사 본문에 투자·행동 권유 표현이 얼마나 있는지. 많으면(증권사 전망 인용 위주) 초안이 반복해 걸리므로 뒤로 미룬다."""
    text = " ".join(str(a.get("content") or "") for a in cluster.get("articles") or [])
    for allowed in ALLOWED_MARKET_TERMS:
        text = text.replace(allowed, "")
    return sum(text.count(w) for w in ADVICE_PATTERNS)


def strip_key_line_prefix(draft: Dict[str, Any]) -> Dict[str, Any]:
    """저장 필드 key_line 에는 "핵심:" 접두어를 넣지 않는다(화면이 붙인다). 모델이 붙여 오면 떼어 중복("핵심: 핵심:")을 막는다."""
    for sec in draft.get("sections") or []:
        kl = str(sec.get("key_line") or "")
        sec["key_line"] = re.sub(r"^\s*(\*\*)?핵심\s*[:：]\s*(\*\*)?\s*", "", kl)
    return draft
