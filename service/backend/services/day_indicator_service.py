"""
Day Indicator Service
"그 무렵 물가·금리는 어땠나" 를 **보도된 기사로만** 보여준다.

배경: 타임머신에 "그때 커피값·최저임금은 얼마였고, 그때 이 주식을 샀으면
어땠을까" 를 붙이고 싶다는 요구가 있었다. 그런데 임의 날짜의 물가·주가를
채우려면 별도 시계열 데이터가 필요하고, 없는 상태에서 값을 적어 넣으면
**출처 없는 숫자를 경제지 지면에 싣는** 셈이 된다. 틀린 CPI 를 보여주는 건
안 보여주는 것보다 나쁘다.

그래서 이 모듈은 숫자를 만들지 않는다. 대신 빅카인즈에서 **그 무렵 실제로
보도된 기사**를 지표별로 한 건씩 골라, 제목과 원문 링크를 그대로 준다.
제목에 이미 숫자가 들어 있다 — "7월 소비자물가 2.8% 상승",
"한·미 통화스와프 600억달러 체결", "코스피 지수 1500선 붕괴".

`/timemachine` 에 있는 `economicSnapshots` / `investmentScenarios` 는 프론트에
하드코딩된 별개 데이터다. 여기서는 그걸 복제하지 않는다.
"""
import logging
import re
from typing import Dict, Iterable, List, Optional, Sequence

from config.constants import TIMELINE_INDICATORS

logger = logging.getLogger(__name__)

# 제목에 숫자가 있으면 "지표"로서 훨씬 유용하다 (2.8%, 600억달러, 1500선).
_HAS_NUMBER = re.compile(r'\d')


def build_indicator_query(indicators: Sequence[dict] = TIMELINE_INDICATORS) -> str:
    """
    지표 전체를 **한 번의 검색**으로 덮는 빅카인즈 질의어를 만든다.

    지표마다 따로 호출하면 6회가 되므로 OR 로 묶는다.
    구문 검색(`""`)을 써서 부분 일치로 번지는 걸 막는다 (지침서 §2.2).

    >>> build_indicator_query([{'terms': ['기준금리', '금통위']}])
    '"기준금리" OR "금통위"'
    """
    terms: List[str] = []
    for indicator in indicators:
        for term in indicator.get('terms', []):
            quoted = f'"{term}"'
            if quoted not in terms:
                terms.append(quoted)
    return ' OR '.join(terms)


def _match_indicator(title: str, indicators: Sequence[dict]) -> Optional[dict]:
    """제목이 어느 지표에 걸리는지. 앞선 지표가 우선(constants 의 나열 순서)."""
    for indicator in indicators:
        if any(term in title for term in indicator.get('terms', [])):
            return indicator
    return None


def pick_indicator_headlines(
    articles: Iterable,
    indicators: Sequence[dict] = TIMELINE_INDICATORS,
) -> List[dict]:
    """
    검색 결과에서 지표별 대표 기사 한 건씩 고른다.

    고르는 기준 (순서대로):
      1. 제목에 **숫자가 있는** 기사 — 지표 카드의 핵심이 숫자다
      2. 그중 **가장 최근** 기사 — 대상일에 가까운 보도

    Args:
        articles: `BigKindsArticle` 목록.
        indicators: `TIMELINE_INDICATORS` 형태.

    Returns:
        `[{'key','label','title','provider','published_at','original_link'}, ...]`
        **찾은 지표만** 담는다. 못 찾은 지표는 빼고 보낸다 (추정치로 메우지 않는다).
        순서는 `indicators` 나열 순서를 따른다.
    """
    # 지표별 후보 모으기
    buckets: Dict[str, list] = {i['key']: [] for i in indicators}
    for article in articles:
        title = getattr(article, 'title', '') or ''
        if not title:
            continue
        indicator = _match_indicator(title, indicators)
        if indicator:
            buckets[indicator['key']].append(article)

    result: List[dict] = []
    for indicator in indicators:
        candidates = buckets[indicator['key']]
        if not candidates:
            continue
        # 숫자 있는 제목 우선, 그 안에서 최신순
        candidates.sort(
            key=lambda a: (
                bool(_HAS_NUMBER.search(a.title or '')),
                a.published_at or '',
            ),
            reverse=True,
        )
        best = candidates[0]
        result.append({
            'key': indicator['key'],
            'label': indicator['label'],
            'title': best.title,
            'provider': best.provider,
            'published_at': best.published_at,
            'original_link': best.original_link,
            # 숫자 없는 제목이면 화면에서 덜 강조할 수 있게 알려준다.
            'has_number': bool(_HAS_NUMBER.search(best.title or '')),
        })

    logger.info(
        '그 무렵 지표: %s (후보 %s)',
        [r['label'] for r in result],
        {k: len(v) for k, v in buckets.items() if v},
    )
    return result
