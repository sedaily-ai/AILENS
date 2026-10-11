"""모아쓰기 레터 자동 발행의 순수 로직(외부 호출 없음) — 이슈 묶음 검증, 초안 보정, 사실 대조. 테스트 대상은 전부 여기 있다.

모델·서버 호출은 run.py 가 하고, 그 결과를 이 함수들이 걸러낸다. 자동 발행의 안전은 "모델이 알아서 잘 쓴다"가 아니라
"이 검증을 통과한 것만 나간다"에 의존하므로, 여기서는 의심스러우면 거절하는 쪽으로 작성한다.
"""
from __future__ import annotations

import re
from typing import Any, Dict, Iterable, List, Optional, Set

MIN_CLUSTER = 3
MAX_CLUSTER = 6
# 갈등 소지가 큰 소재는 자동 선정에서 제외한다(정치·젠더·세대·지역). 사람이 직접 쓰는 경로는 막지 않는다.
SENSITIVE_WORDS = ("대통령", "여당", "야당", "국민의힘", "민주당", "탄핵", "선거", "총선", "대선", "지방선거", "페미", "젠더", "남녀", "세대 갈등", "호남", "영남", "혐오", "차별 논란",
                   "감찰", "검찰", "중수청", "공수처", "특검", "기소", "구속영장", "국정감사", "국감", "국정조사", "청문회", "여야", "정권", "탄핵")
# 본문(인용 포함)에 실리면 안 되는 투자·행동 권유 표현. 서버의 금지어(BODY_DIRECTIVE_TERMS)는 "매수하" 같은 활용형만 막아 귀속된 인용("분할 매수로 대응해야 한다")이 빠져나가므로,
# 자동 발행 경로에서는 더 넓게 막는다. 걸리면 그 인용을 빼고 사실만 쓰도록 다시 쓴다.
# 단 "순매도·순매수·매도세·매수세·매도 물량" 같은 시장 동향 보도어는 사실 서술이라 허용한다(허용어를 먼저 지운 뒤 검사한다).
ALLOWED_MARKET_TERMS = ("순매도", "순매수", "매도세", "매수세", "매도 물량", "매수 물량", "매도 압력", "매수 주체", "매도 주체", "공매도", "매도 우위", "매수 우위", "매수 전환", "매도 전환")
ADVICE_PATTERNS = ("매수", "매도", "대응해야", "대응하는", "사야", "팔아야", "담아야", "비중 확대", "비중 축소", "비중을 늘", "비중을 줄", "진입해야", "분할", "추천", "유망", "저점", "바닥", "지금이 기회", "투자 기회", "매수 기회")
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


def draft_body_text(draft: Dict[str, Any]) -> str:
    parts: List[str] = [str(draft.get("title") or ""), str(draft.get("deck") or ""), *[str(s) for s in draft.get("summary") or []], str(draft.get("editor_note") or "")]
    for sec in draft.get("sections") or []:
        parts += [str(sec.get("heading") or ""), str(sec.get("key_line") or "")]
        for para in sec.get("paragraphs") or []:
            parts.append("".join(p if isinstance(p, str) else str(p.get("text", "")) for p in para))
    return "\n".join(parts)


# 템플릿 v2 분량 규칙: 본문 기준 2,500~3,500자(모바일 5~7분). 본문 = 섹션 문단 글자 수(제목·요약·한마디 제외).
BODY_MIN_CHARS = 2000
BODY_MAX_CHARS = 3500


def body_chars(draft: Dict[str, Any]) -> int:
    n = 0
    for sec in draft.get("sections") or []:
        for para in sec.get("paragraphs") or []:
            n += len("".join(p if isinstance(p, str) else str(p.get("text", "")) for p in para))
    return n


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


ATTRIBUTION_MARKS = ("따르면", "밝혔", "말했", "지적", "설명", "주장", "분석", "평가", "전했", "강조", "내놨", "관계자", "전문가", "연구원", "교수", "측은")


def other_attribution_problem(draft: Dict[str, Any]) -> str:
    """'다른 시각' 섹션의 모든 문단에 말한 주체(기사·전문가·기관)를 알리는 표현이 있어야 한다(템플릿 v2)."""
    bare = []
    for sec in draft.get("sections") or []:
        if sec.get("axis") != "other":
            continue
        for para in sec.get("paragraphs") or []:
            txt = "".join(p if isinstance(p, str) else str(p.get("text", "")) for p in para)
            if txt.strip() and not any(m in txt for m in ATTRIBUTION_MARKS):
                bare.append(txt[:40])
    if bare:
        return "다른 시각 섹션에 말한 주체(기사·전문가·기관)가 밝혀지지 않은 문단이 있습니다. 직접 비판하지 말고 누가 말했는지 귀속해 쓰세요: " + " / ".join(bare)
    return ""


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
