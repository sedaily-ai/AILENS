"""
Issue Digest Service
"그날 한국 언론이 가장 많이 다룬 이슈" 를 조립한다 (B안).

빅카인즈 `/issue_ranking`(지침서 §4)은 하루의 이슈를 **보도량 내림차순**으로
주고, 각 이슈에 그 이슈를 다룬 기사 id 묶음(`news_cluster`)을 붙여준다.
기사 제목·언론사는 id 로 상세 조회(§3)해서 채운다.

이 모듈은 **네트워크를 타지 않는 순수 조립부**다 — 두 번의 빅카인즈 호출은
`handlers/timeline_handler.py` 가 하고, 그 결과를 여기서 화면용 모양으로 만든다.

A안(페르소나 큐레이션)과의 차이:
  A안 — 같은 하루를 **네 에디터의 관심사**로 가른다 (서울경제 지면 기준)
  B안 — 같은 하루를 **이슈 단위**로 묶고 **언론사별 보도 분포**를 보여준다
        (전체 언론사 기준. 이슈는 여러 매체가 같이 다뤘다는 사실 자체가 정의다)
"""
import logging
from typing import Dict, Iterable, List, Optional, Sequence

from config.constants import BIGKINDS_PROVIDER_SEDAILY

logger = logging.getLogger(__name__)

# 이슈 카드에 노출할 키워드 수 — topic_keyword 는 50개까지 오는데 다 쓰면 노이즈다.
DEFAULT_KEYWORD_LIMIT = 6
# 이슈별로 보여줄 언론사 수 (보도량 상위)
DEFAULT_PROVIDER_LIMIT = 5


def _article_to_dict(a) -> dict:
    """BigKindsArticle → 이슈 카드용 축약 형태."""
    return {
        'news_id': a.news_id,
        'title': a.title,
        'published_at': a.published_at,
        'provider': a.provider,
        'category': a.category,
        'original_link': a.original_link,
    }


def count_providers(
    articles: Iterable,
    limit: Optional[int] = DEFAULT_PROVIDER_LIMIT,
) -> Dict[str, object]:
    """
    이슈를 다룬 언론사 분포.

    Returns:
        `{'total': 21, 'top': [{'name': '한국경제', 'count': 3}, ...]}`
        `total` 은 자르기 전 **언론사 수**(기사 수가 아니다).
    """
    counts: Dict[str, int] = {}
    for a in articles:
        name = (a.provider if not isinstance(a, dict) else a.get('provider')) or ''
        if name:
            counts[name] = counts.get(name, 0) + 1

    # 보도량 많은 순, 동수면 이름순으로 안정 정렬
    ordered = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))
    if limit:
        ordered = ordered[:limit]
    return {
        'total': len(counts),
        'top': [{'name': name, 'count': n} for name, n in ordered],
    }


def build_issue_digest(
    topics: Sequence,
    articles_by_id: Dict[str, object],
    per_issue: int = 4,
    keyword_limit: int = DEFAULT_KEYWORD_LIMIT,
    provider_limit: int = DEFAULT_PROVIDER_LIMIT,
) -> List[dict]:
    """
    이슈 목록 + 조회된 기사 상세 → 화면용 이슈 카드 목록.

    Args:
        topics: `BigKindsTopic` 목록. **입력 순서를 그대로 유지**한다
            (빅카인즈가 이미 보도량 내림차순으로 주므로 재정렬하지 않는다 —
            `BigKindsTopic` 독스트링의 topic_rank 주의사항 참조).
        articles_by_id: news_id → BigKindsArticle. 상세 조회에서 빠진 id 는
            그냥 건너뛴다 (실측: 691건 요청 → 655건 수신. 일부는 조회 불가).
        per_issue: 이슈 카드에 실을 기사 수.

    Returns:
        이슈 카드 목록. 상세를 하나도 못 채운 이슈는 제외한다(빈 카드 방지).
    """
    digest: List[dict] = []

    for topic in topics:
        resolved = [
            articles_by_id[nid] for nid in topic.news_ids if nid in articles_by_id
        ]
        if not resolved:
            continue

        # 최신순 — 이슈 안에서도 그날 늦게 나온 기사가 대체로 종합 기사다.
        resolved.sort(key=lambda a: getattr(a, 'published_at', '') or '', reverse=True)

        # 서울경제가 이 이슈를 다뤘는지 — 전체 언론사 이슈 뷰를 지면 정체성과 잇는다.
        sedaily = next(
            (a for a in resolved if a.provider == BIGKINDS_PROVIDER_SEDAILY), None
        )

        digest.append({
            'topic': topic.topic,
            # 보도량 = 이 이슈를 다룬 기사 수 (클러스터 크기).
            # topic_rank 는 지침서와 실제가 어긋나 쓰지 않는다.
            'article_count': topic.article_count,
            'resolved_count': len(resolved),
            'keywords': topic.keywords[:keyword_limit],
            'providers': count_providers(resolved, limit=provider_limit),
            'articles': [_article_to_dict(a) for a in resolved[:per_issue]],
            'sedaily': _article_to_dict(sedaily) if sedaily else None,
        })

    logger.info(
        'issue digest: 이슈 %s개 (보도량 %s)',
        len(digest), [d['article_count'] for d in digest[:5]],
    )
    return digest
