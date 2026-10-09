"""AI LENS 분류 체계(대분류 9개·하위 분류) — 발행(publish_utils)과 재분류 시험 실행(scripts/reclassify_dryrun.py)이 같이 쓴다.

2026-10-09 분류 개편: 시그널·부동산·경제·금융·산업·정치·사회·국제·문화. 결정·근거는 docs/product/분류체계/README.md.
이 표는 service/frontend/src/shared/constants/econCategories.ts·econSubcategories.ts, service/lens-cms-api/admin_posts_repo.py(_NEW_CATEGORIES)와 같은 값이다(프론트·서버와 의도적 복제).
분류는 LLM 한 번으로 대분류와 하위 분류를 함께 정한다. 호출이 실패하면 원문 태그로 대분류만 추정하고 하위 분류는 비운다 — 이 필드가 없어도 발행은 막히면 안 된다.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

TAXONOMY: dict[str, list[str]] = {
    "시그널": ["국내증시", "해외증시", "IB&Deal", "펀드·채권", "정책", "증권일반"],
    "부동산": ["정책", "부동산일반", "건설업계"],
    "경제": ["경제분석", "세금·재정", "통상", "기후에너지", "경제일반"],
    "금융": ["은행", "보험", "카드", "가상자산", "금융일반"],
    "산업": ["대기업", "중기·IT", "유통·생활", "바이오", "기업인", "투자·재무", "기업일반"],
    "정치": ["청와대", "국회", "총리실", "통일·외교·안보", "정치일반"],
    "사회": ["사회일반", "사건사고", "법조", "교육", "노동·고용", "행정", "지방자치"],
    "국제": ["미국·중남미", "일본·중국", "아시아·호주", "유럽", "중동·아프리카"],
    "문화": ["전시·공연", "영화·미디어", "출판", "여행·레저", "문화일반", "아트씽"],
}
NEW_NAMES = set(TAXONOMY)
# 글에 저장돼 있던 옛 이름 → 새 이름
OLD_TO_NEW = {"증시": "시그널", "금융·정책": "금융"}

# 분류 전용 Bedrock application inference profile(비용 태그가 붙는 경로). 베어 모델 ID를 쓰지 않는다.
CLASSIFY_MODEL = "arn:aws:bedrock:us-east-1:887078546492:application-inference-profile/nrr81xvevv5k"

# 원문 피드의 최상위 태그 → 새 대분류(LLM 호출이 실패했을 때의 대분류 추정용). '경제'는 거의 모든 기사에 붙어 구분력이 없어 넣지 않는다.
_TAG_FALLBACK = {
    "증권": "시그널",
    "부동산": "부동산",
    "산업": "산업",
    "금융": "금융",
    "국제": "국제",
    "문화·라이프": "문화",
    "정치": "정치",
    "사회": "사회",
}

GUIDE = """대분류(정확히 아래 단어 중 하나)와 그 하위 분류 후보:
{tax}

대분류 기준:
- 시그널: 주식·증시·코스피·종목·펀드·채권·IPO·공시·M&A·딜 등 자본시장 기사
- 부동산: 집값·전세·분양·공급대책·건설
- 경제: 성장률·물가·재정·세금·예산·관세·무역·에너지 정책 등 거시경제와 정부 경제정책
- 금융: 은행·보험·카드·가상자산·금융당국·금리·대출
- 산업: 개별 기업·산업 동향(반도체·자동차·배터리·유통·바이오 등), 기업 경영
- 정치: 대통령실·국회·여야·총리·선거·외교·안보·북한
- 사회: 사건사고·재판·검찰·교육·노동·고용·복지·인구·지방자치·보건·환경
- 국제: 해외 정치·경제·기업 이슈(미국·중국·일본·유럽·중동 등)
- 문화: 전시·공연·영화·출판·여행·라이프스타일

규칙:
- 기사 하나당 대분류 하나와 그 대분류의 하위 분류 후보 중 하나를 고른다. 후보에 맞는 게 없으면 '○○일반'(있으면) 또는 null.
- 판단이 어려우면 category를 null로 둔다(억지로 고르지 않는다).
"""


def build_system(json_array: bool = True) -> str:
    tax = "\n".join(f"- {k}: {', '.join(v)}" for k, v in TAXONOMY.items())
    tail = (
        '- 출력은 JSON 배열만. 설명·코드블록 금지. 형식: [{"id":"…","category":"…","sub":"…"}, …]\n'
        if json_array
        else '- 출력은 JSON 객체 하나만. 설명·코드블록 금지. 형식: {"category":"…","sub":"…"}\n'
    )
    return GUIDE.format(tax=tax) + tail


def clean(category: str | None, sub: str | None) -> tuple[str | None, str | None]:
    """모델 출력을 검증한다 — 새 9개에 없는 대분류는 버리고, 그 대분류의 후보에 없는 하위 분류는 비운다."""
    if category not in NEW_NAMES:
        return None, None
    return category, (sub if sub in TAXONOMY[category] else None)


def rule_category(article: dict) -> str | None:
    """원문 태그로 대분류만 추정한다(LLM 실패 시 폴백). 하위 분류는 정하지 않는다."""
    cats = article.get("categories") or [article.get("top_category", "")]
    for c in cats:
        top = (c or "").split(",")[0]
        if top in _TAG_FALLBACK:
            return _TAG_FALLBACK[top]
    return None


def classify_article(article: dict, headline: str, context: str) -> tuple[str | None, str | None]:
    """발행할 글의 (대분류, 하위 분류). LLM 한 번 호출, 실패하면 (원문 태그 추정 대분류, None)."""
    try:
        sys.path.insert(0, str(Path(__file__).parent))
        from bedrock_client import call_text  # noqa: lazy — 실패해도 발행이 안 막히게

        user = json.dumps({"제목": headline, "요약": context}, ensure_ascii=False)
        raw = call_text(build_system(json_array=False), user, model=CLASSIFY_MODEL, max_tokens=120).strip()
        m = re.search(r"\{.*\}", raw, re.S)
        obj = json.loads(m.group(0)) if m else {}
        category, sub = clean(obj.get("category"), obj.get("sub"))
        if category:
            return category, sub
    except Exception as e:  # noqa: BLE001
        print(f"[classify_article] 분류 실패, 원문 태그로 폴백: {e}")
    return rule_category(article), None
