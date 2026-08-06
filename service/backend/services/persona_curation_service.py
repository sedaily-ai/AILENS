"""
Persona Curation Service
"그날, 네 에디터가 각자 어떤 기사를 골랐을까" 를 **AI 호출 없이** 만든다.

AI LENS 의 North Star 는 "같은 사건 앞에서, 네 사람이 어떻게 다르게 보는지"
(`docs/product/letter-framework-v2.md`) 인데, `/timeline` 은 지금까지 날짜로만
필터한 평평한 헤드라인 목록이라 페르소나가 전혀 반영되지 않았다.

빅카인즈가 기사마다 통합분류체계 2레벨(`"경제>증권_증시"`)을 주고, 4 에디터는
`docs/design-handoff/characters/spec_characters.txt` 에 시그니처 분야가 선언돼
있다. 이 둘을 맞추면 LLM 없이 — 따라서 **추가 비용 0으로** — 에디터별 큐레이션이
나온다. 매핑 표는 `config/constants.PERSONA_SIGNATURE_CATEGORIES`.

한 기사는 **한 에디터에게만** 배정된다(단일 담당자). 겹치기를 허용하면 같은
기사가 여러 탭에 나와 "각자 다르게 골랐다"는 대비가 흐려진다.
"""
import logging
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

from config.constants import (
    MBTI_GROUPS,
    PERSONA_CATEGORY_L1_FALLBACK,
    PERSONA_SIGNATURE_CATEGORIES,
)

logger = logging.getLogger(__name__)

# 2레벨 분류 문자열 → 페르소나 코드. import 시 1회 역인덱스로 만든다.
_CATEGORY_TO_PERSONA: Dict[str, str] = {
    category: persona
    for persona, categories in PERSONA_SIGNATURE_CATEGORIES.items()
    for category in categories
}


def _level2(raw: str) -> str:
    """
    분류 문자열을 2레벨로 정규화한다.

    빅카인즈는 3레벨까지 준다(`"스포츠>야구>메이저리그"`). 매핑 표는 2레벨
    기준이라 앞 두 단계만 남긴다.

    >>> _level2('스포츠>야구>메이저리그')
    '스포츠>야구'
    """
    parts = [p.strip() for p in str(raw).split('>') if p.strip()]
    return '>'.join(parts[:2])


def assign_persona_detail(
    categories_raw: Sequence[str],
) -> Tuple[Optional[str], Optional[str]]:
    """
    기사의 빅카인즈 분류 목록 → (담당 에디터 그룹 코드, 배정 근거가 된 분류).

    빅카인즈는 기사에 분류를 여러 개 붙이고 **첫 번째가 주 분류**다. 앞에서부터
    훑어 처음 매칭되는 분류의 담당자를 쓴다 — 결정적(deterministic)이고 임의
    가중치가 없다.

    두 번째 반환값(근거 분류)은 화면에서 "준서 · 증권_증시" 처럼 **왜 이 에디터가
    골랐는지**를 보여주는 데 쓴다. 표준 1레벨 라벨('경제')만으로는 배정 이유가
    드러나지 않는다.

    2레벨로 못 잡으면 1레벨 폴백을 본다. 분류가 아예 없으면 (None, None)
    (실제로 분류 없는 기사가 존재한다 — 호출자가 '미분류'로 처리).

    >>> assign_persona_detail(['경제>증권_증시', '경제>부동산'])
    ('ST', '경제>증권_증시')
    >>> assign_persona_detail(['경제'])
    ('ST', '경제')
    >>> assign_persona_detail([])
    (None, None)
    """
    if not categories_raw:
        return None, None

    # 1차 — 2레벨 정확 매칭
    for raw in categories_raw:
        if not raw:
            continue
        level2 = _level2(raw)
        persona = _CATEGORY_TO_PERSONA.get(level2)
        if persona:
            return persona, level2

    # 2차 — 1레벨 폴백
    for raw in categories_raw:
        if not raw:
            continue
        level1 = str(raw).split('>')[0].strip()
        persona = PERSONA_CATEGORY_L1_FALLBACK.get(level1)
        if persona:
            return persona, level1

    return None, None


def assign_persona(categories_raw: Sequence[str]) -> Optional[str]:
    """
    담당 에디터 그룹 코드만 필요할 때 쓰는 얇은 래퍼.

    >>> assign_persona(['경제>증권_증시', '경제>부동산'])
    'ST'
    >>> assign_persona(['사회>노동_복지'])
    'NF'
    >>> assign_persona([]) is None
    True
    """
    return assign_persona_detail(categories_raw)[0]


@dataclass
class PersonaPick:
    """한 에디터가 고른 기사 한 건 + 그 에디터에게 배정된 근거 분류."""
    article: Any
    matched_category: Optional[str]


def curate_by_persona(
    articles: Iterable,
    per_persona: Optional[int] = None,
) -> Dict[str, dict]:
    """
    기사 목록을 4 에디터 버킷으로 가른다.

    Args:
        articles: `.categories_raw` 를 가진 객체(BigKindsArticle) 또는
            `categories_raw` 키를 가진 dict 의 목록.
        per_persona: 버킷당 최대 기사 수. None 이면 제한 없음.
            `total` 은 자르기 **전** 건수라 "민철이 고른 32건 중 6건" 을 표현할 수 있다.

    Returns:
        `{'NT': {'picks': [PersonaPick, ...], 'total': 32}, 'NF': ..., 'ST': ...,
          'SF': ..., 'unassigned': {...}}`
        4 그룹은 기사가 0건이어도 키가 항상 존재한다(프론트 탭이 사라지지 않게).
        분류가 없어 배정 못한 기사는 `unassigned` 로 모은다.
    """
    buckets: Dict[str, List[PersonaPick]] = {group: [] for group in MBTI_GROUPS}
    unassigned: List[PersonaPick] = []

    for article in articles:
        categories_raw = (
            article.get('categories_raw')
            if isinstance(article, dict)
            else getattr(article, 'categories_raw', None)
        )
        persona, matched = assign_persona_detail(categories_raw or [])
        pick = PersonaPick(article=article, matched_category=matched)
        if persona:
            buckets[persona].append(pick)
        else:
            unassigned.append(pick)

    def _bucket(items: List[PersonaPick]) -> dict:
        return {
            'total': len(items),
            'picks': items[:per_persona] if per_persona else items,
        }

    result: Dict[str, dict] = {group: _bucket(buckets[group]) for group in MBTI_GROUPS}
    result['unassigned'] = _bucket(unassigned)

    logger.info(
        'persona curation: %s',
        {g: result[g]['total'] for g in list(MBTI_GROUPS) + ['unassigned']},
    )
    return result
