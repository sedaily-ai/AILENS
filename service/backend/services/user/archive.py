"""Archive("내 서랍") 비즈니스 로직 — 문장 저장·목록·인기 집계·삭제.

저장소는 PersonalRepository를 통해 접근한다. `/api/archive/popular`는 전체 사용자의
저장 문장을 텍스트 빈도로 집계한 공개 목록이며 사용자 식별 정보를 포함하지 않는다.
"""
import json
import logging
from typing import Dict, Any

from config.constants import CORS_HEADERS
from models.personal import ArchivedSentence
from repositories.personal_repository import get_personal_repository

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


# ── 라우트 핸들러 ─────────────────────────────────────────────────────────

async def handle_save(body: Dict[str, Any]) -> Dict:
    """POST /api/archive — 문장을 저장한다.

    Body:
      {
        "user_id": "abc123",
        "text": "삼성전자가 분기 영업이익 6조를 달성했다.",
        "article_id": "2K78XY958Z",
        "article_title": "삼성전자 1분기 실적 발표",
        "article_published_at": "2026-04-07T09:23:00+09:00"
      }

    저장된 문장과 vector_status 를 반환한다.
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
    # 비정상적으로 긴 입력을 차단한다.
    if len(text) > 5000:
        return error(400, '문장이 너무 깁니다. 5000자 이하로 줄여주세요.')

    sentence = ArchivedSentence(
        id='',  # __post_init__ 에서 자동 생성
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
        # 프론트 타입(archiveApi.ts)이 필수로 기대하는 필드이며 항상 'disabled' 이다.
        'vector_status': 'disabled',
    }, status_code=201)


async def handle_list(params: Dict[str, str]) -> Dict:
    """GET /api/archive?user_id={id}&date_from={}&date_to={}&limit={} — 저장 문장을 최신순으로 반환한다."""
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
    """GET /api/archive/popular?limit={n} — "다른 사람들이 담은 문장" 공개 집계.

    전체 사용자의 아카이브를 텍스트 빈도로 집계하며 비로그인도 조회할 수 있다.
    사용자 식별 정보는 포함하지 않는다.
    """
    limit = int(params.get('limit', '20'))
    repo = get_personal_repository()
    highlights = await repo.list_popular_archived_sentences(limit=limit)
    return success({'highlights': highlights, 'count': len(highlights)})


async def handle_delete(
    archive_id: str,
    user_id: str,
) -> Dict:
    """DELETE /api/archive/{archive_id}?user_id={id} — 저장 문장을 삭제한다."""
    if not archive_id:
        return error(400, 'archive_id is required')
    if not user_id:
        return error(400, 'user_id is required')

    repo = get_personal_repository()
    # archive_id 는 user_archives.id(PK)이며, 소유자 확인은 저장소의 WHERE user_id=... 가 수행한다.
    deleted = await repo.delete_archived_sentence(
        user_id=user_id,
        article_id=archive_id,
        timestamp='',
    )

    if not deleted:
        return error(404, '저장된 문장을 찾을 수 없습니다.')

    return success({'deleted': True, 'archive_id': archive_id})


# ── 응답 헬퍼 ────────────────────────────────────────────────────────────

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
