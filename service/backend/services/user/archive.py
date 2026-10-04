"""Archive("내 서랍") 비즈니스 로직 — handlers/archive_handler.py에서 추출
(2026-08-24, 코드 리팩토링 감사 Track B, God 파일 분해).

Storage: Personal DB (DynamoDB) via PersonalRepository.

2026-08-06: pgvector 유사 문장 검색("similar") 제거 — v1 RDS
(sedaily-mbti-pgvector-dev)가 계정에 더 이상 존재하지 않는다(삭제 시점 불명,
재확인 결과 없음). PG_PASSWORD 도 안 잡혀있어 이 기능은 이미 조용히 비활성
상태였고(vector_status 항상 'skipped'), 실호출도 30일 0건이었다 — 재구축
필요해지면 그때 다시 설계.

2026-08-06: GET /api/archive/popular 추가 — 커뮤니티 탭(능동적 글쓰기 필요)을
없애면서, 이미 하던 행동(문장 저장)만으로 채워지는 "다른 사람들이 담은 문장"
공개 집계로 대체(Kindle Popular Highlights 패턴). 유저 식별 정보는 응답에
포함하지 않는다.
"""
import json
import logging
from typing import Dict, Any

from config.constants import CORS_HEADERS
from models.personal import ArchivedSentence
from repositories.personal_repository import get_personal_repository

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


# ── Route handlers ───────────────────────────────────────────────────────────

async def handle_save(body: Dict[str, Any]) -> Dict:
    """
    POST /api/archive — Save a sentence.

    Body:
      {
        "user_id": "abc123",
        "text": "삼성전자가 분기 영업이익 6조를 달성했다.",
        "article_id": "2K78XY958Z",
        "article_title": "삼성전자 1분기 실적 발표",
        "article_published_at": "2026-04-07T09:23:00+09:00"
      }

    Returns the saved sentence + vector status.
    """
    user_id = body.get('user_id', '').strip()
    text = body.get('text', '').strip()
    article_id = body.get('article_id', '').strip()

    if not user_id:
        return error(400, 'user_id is required')
    if not text:
        return error(400, 'text is required')
    if not article_id:
        return error(400, 'article_id is required')
    # Bound user input. Titan V2 will reject inputs > ~8192 tokens but the
    # client-paid embedding cost still incurs; cap before embedding. 5000
    # chars is roughly an order of magnitude beyond any sensible archive
    # entry while staying well under Titan's hard limit.
    if len(text) > 5000:
        return error(400, '문장이 너무 깁니다. 5000자 이하로 줄여주세요.')

    # 1. Save to Personal DB
    sentence = ArchivedSentence(
        id='',  # auto-generated in __post_init__
        user_id=user_id,
        text=text,
        article_id=article_id,
        article_title=body.get('article_title', ''),
        article_published_at=body.get('article_published_at', ''),
    )

    repo = get_personal_repository()
    saved = await repo.save_archived_sentence(sentence)

    if not saved:
        return error(500, '문장 저장에 실패했습니다.')

    logger.info(f"Archive saved: user={user_id} article={article_id}")

    return success({
        'sentence': sentence.to_api(),
        # 프론트 타입(archiveApi.ts)이 이 필드를 필수로 기대한다 — pgvector
        # 유사문장 검색 제거(2026-08-06) 이후 항상 'disabled' 고정값.
        'vector_status': 'disabled',
    }, status_code=201)


async def handle_list(params: Dict[str, str]) -> Dict:
    """
    GET /api/archive?user_id={id}&date_from={}&date_to={}&limit={}

    Returns list of archived sentences, newest first.
    """
    user_id = params.get('user_id', '').strip()
    if not user_id:
        return error(400, 'user_id is required')

    date_from = params.get('date_from')
    date_to = params.get('date_to')
    limit = int(params.get('limit', '50'))

    repo = get_personal_repository()
    sentences = await repo.list_archived_sentences(
        user_id=user_id,
        date_from=date_from,
        date_to=date_to,
        limit=limit,
    )

    return success({
        'sentences': [s.to_api() for s in sentences],
        'count': len(sentences),
        'user_id': user_id,
    })


async def handle_popular(params: Dict[str, str]) -> Dict:
    """
    GET /api/archive/popular?limit={n}

    "다른 사람들이 담은 문장" — 전체 유저의 아카이브를 텍스트 빈도로 집계한
    공개(비로그인 포함) 목록. 글쓰기 없이 저장 행위만으로 채워지는 소셜
    피드(Kindle Popular Highlights 패턴, 2026-08-06 커뮤니티 탭 대체).
    유저 식별 정보는 포함하지 않는다.
    """
    limit = int(params.get('limit', '20'))
    repo = get_personal_repository()
    highlights = await repo.list_popular_archived_sentences(limit=limit)
    return success({'highlights': highlights, 'count': len(highlights)})


async def handle_delete(
    archive_id: str,
    user_id: str,
) -> Dict:
    """
    DELETE /api/archive/{archive_id}?user_id={id}

    Deletes from Personal DB. Also attempts to remove from pgvector
    (best-effort — sentence text is matched).
    """
    if not archive_id:
        return error(400, 'archive_id is required')
    if not user_id:
        return error(400, 'user_id is required')

    repo = get_personal_repository()
    # v1.24 — archive_id가 관계형 PK(user_archives.id)라 직접 삭제 가능해짐.
    # DynamoDB 시절엔 sk가 "{article_id}#{timestamp}" 합성값이라 opaque한
    # archive_id만으로 못 지우고, 목록을 다 긁어 id로 매칭한 뒤 그 항목의
    # article_id/timestamp를 재조합해야 했다(이제 불필요, 소유자 확인은
    # WHERE user_id=... 로 저장소가 대신함).
    deleted = await repo.delete_archived_sentence(
        user_id=user_id,
        article_id=archive_id,
        timestamp='',
    )

    if not deleted:
        return error(404, '저장된 문장을 찾을 수 없습니다.')

    # pgvector 쪽 archive_vectors row는 정리되지 않는다 — 그 row의 UUID를
    # DynamoDB에 저장해두지 않아 특정할 방법이 없다(이전에는 여기서 매 삭제마다
    # Bedrock 임베딩 호출 + 유사도 검색을 해서 "지워야 함" 로그만 남기고 실제로는
    # 아무것도 안 지우는 코드가 있었다 — 실비용만 태우는 순수 낭비라 2026-08-05 제거).
    # 실제로 지우려면 insert 시점에 row UUID를 같이 저장하는 스키마 변경이 필요.

    return success({'deleted': True, 'archive_id': archive_id})


# ── Response helpers ─────────────────────────────────────────────────────────

def success(data: Dict[str, Any], status_code: int = 200) -> Dict:
    return {
        'statusCode': status_code,
        'headers': CORS_HEADERS,
        'body': json.dumps(data, ensure_ascii=False, default=str),
    }


def error(status_code: int, message: str) -> Dict:
    return {
        'statusCode': status_code,
        'headers': CORS_HEADERS,
        'body': json.dumps({
            'error': {'code': 'ARCHIVE_ERROR', 'message': message}
        }, ensure_ascii=False),
    }
