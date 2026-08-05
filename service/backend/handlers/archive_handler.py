"""
Archive Handler — "내 서랍" (My Drawer) API
=============================================
Manages user-archived sentences with vector similarity search.

Storage:
  - Personal DB (DynamoDB): sentence metadata + CRUD
  - pgvector (PostgreSQL): sentence embeddings for similarity search
  - Bedrock Titan Embeddings: embedding generation

Routes:
  POST   /api/archive          — Save a sentence
  GET    /api/archive          — List archived sentences
  DELETE /api/archive/{id}     — Delete a sentence
  POST   /api/archive/similar  — Find similar sentences

Replaces the frontend's Mock data (React state, 8 sample sentences).
"""
import base64
import json
import logging
from typing import Dict, Any, Optional

from config import settings
from config.constants import CORS_HEADERS
from models.personal import ArchivedSentence
from repositories.personal_repository import get_personal_repository
from clients.embedding_client import EmbeddingClient, EmbeddingError
from core.decorators import lambda_handler as handler_decorator
from core.auth import get_authenticated_user_id, try_get_authenticated_user_id
from core.exceptions import AuthenticationError

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


# ── pgvector (lazy, non-fatal) ───────────────────────────────────────────────

def _get_pgvector():
    """Create pgvector client if configured. Returns None otherwise."""
    if not settings.pg_password:
        return None
    from clients.pgvector_client import PgVectorClient
    return PgVectorClient(
        host=settings.pg_host,
        port=settings.pg_port,
        database=settings.pg_database,
        user=settings.pg_user,
        password=settings.pg_password,
    )


# ── Route handlers ───────────────────────────────────────────────────────────

async def _handle_save(body: Dict[str, Any]) -> Dict:
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
        return _error(400, 'user_id is required')
    if not text:
        return _error(400, 'text is required')
    if not article_id:
        return _error(400, 'article_id is required')
    # Bound user input. Titan V2 will reject inputs > ~8192 tokens but the
    # client-paid embedding cost still incurs; cap before embedding. 5000
    # chars is roughly an order of magnitude beyond any sensible archive
    # entry while staying well under Titan's hard limit.
    if len(text) > 5000:
        return _error(400, '문장이 너무 깁니다. 5000자 이하로 줄여주세요.')

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
        return _error(500, '문장 저장에 실패했습니다.')

    # 2. Generate embedding + save to pgvector (non-fatal)
    vector_status = 'skipped'
    pg = _get_pgvector()

    if pg:
        try:
            embed_client = EmbeddingClient()
            embedding = embed_client.embed_text(text)

            pg.insert_archive_vector(
                user_id=user_id,
                sentence_text=text,
                article_id=article_id,
                embedding=embedding,
            )
            vector_status = 'indexed'

        except EmbeddingError as e:
            logger.warning(f"Embedding failed for archive (non-fatal): {e}")
            vector_status = 'embedding_failed'

        except Exception as e:
            logger.warning(f"pgvector insert failed for archive (non-fatal): {e}")
            vector_status = 'pgvector_failed'

        finally:
            try:
                pg.close()
            except Exception:
                pass

    logger.info(
        f"Archive saved: user={user_id} article={article_id} "
        f"vector={vector_status}"
    )

    return _success({
        'sentence': sentence.to_api(),
        'vector_status': vector_status,
    }, status_code=201)


async def _handle_list(params: Dict[str, str]) -> Dict:
    """
    GET /api/archive?user_id={id}&date_from={}&date_to={}&limit={}

    Returns list of archived sentences, newest first.
    """
    user_id = params.get('user_id', '').strip()
    if not user_id:
        return _error(400, 'user_id is required')

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

    return _success({
        'sentences': [s.to_api() for s in sentences],
        'count': len(sentences),
        'user_id': user_id,
    })


async def _handle_delete(
    archive_id: str,
    user_id: str,
) -> Dict:
    """
    DELETE /api/archive/{archive_id}?user_id={id}

    Deletes from Personal DB. Also attempts to remove from pgvector
    (best-effort — sentence text is matched).
    """
    if not archive_id:
        return _error(400, 'archive_id is required')
    if not user_id:
        return _error(400, 'user_id is required')

    # Format: "{user_id}-{article_id}-{timestamp}" — but article_id/timestamp may
    # contain hyphens, so we can't reliably split it apart. Look up by exact id
    # match instead (see the scan below); this just checks the shape is plausible.
    if len(archive_id.split('-', 2)) < 3:
        return _error(400, 'Invalid archive_id format')

    repo = get_personal_repository()

    # List user's archives for this article to find the exact match
    sentences = await repo.list_archived_sentences(user_id=user_id, limit=200)
    target = None
    for s in sentences:
        if s.id == archive_id:
            target = s
            break

    if not target:
        return _error(404, '저장된 문장을 찾을 수 없습니다.')

    deleted = await repo.delete_archived_sentence(
        user_id=user_id,
        article_id=target.article_id,
        timestamp=target.created_at,
    )

    if not deleted:
        return _error(500, '문장 삭제에 실패했습니다.')

    # pgvector 쪽 archive_vectors row는 정리되지 않는다 — 그 row의 UUID를
    # DynamoDB에 저장해두지 않아 특정할 방법이 없다(이전에는 여기서 매 삭제마다
    # Bedrock 임베딩 호출 + 유사도 검색을 해서 "지워야 함" 로그만 남기고 실제로는
    # 아무것도 안 지우는 코드가 있었다 — 실비용만 태우는 순수 낭비라 2026-08-05 제거).
    # 실제로 지우려면 insert 시점에 row UUID를 같이 저장하는 스키마 변경이 필요.

    return _success({'deleted': True, 'archive_id': archive_id})


async def _handle_similar(body: Dict[str, Any]) -> Dict:
    """
    POST /api/archive/similar — Find similar archived sentences.

    Body:
      {
        "user_id": "abc123",   (optional — scope to user's own archive)
        "text": "반도체 수출이 호조를 보이고 있다",
        "limit": 10
      }

    Embeds the query text and performs pgvector cosine similarity search.
    """
    text = body.get('text', '').strip()
    if not text:
        return _error(400, 'text is required')

    user_id = body.get('user_id')
    limit = int(body.get('limit', 10))

    pg = _get_pgvector()
    if not pg:
        return _error(503, '유사 문장 검색 서비스가 설정되지 않았습니다.')

    try:
        embed_client = EmbeddingClient()
        embedding = embed_client.embed_text(text)

        results = pg.search_similar_sentences(
            embedding=embedding,
            user_id=user_id,
            limit=limit,
        )

        return _success({
            'similar_sentences': results,
            'count': len(results),
            'query_text': text[:100],
        })

    except EmbeddingError as e:
        logger.error(f"Embedding failed for similarity search: {e}")
        return _error(500, '임베딩 생성에 실패했습니다.')

    except Exception as e:
        logger.error(f"Similarity search failed: {e}", exc_info=True)
        return _error(500, '유사 문장 검색에 실패했습니다.')

    finally:
        try:
            pg.close()
        except Exception:
            pass


# ── Response helpers ─────────────────────────────────────────────────────────

def _success(data: Dict[str, Any], status_code: int = 200) -> Dict:
    return {
        'statusCode': status_code,
        'headers': CORS_HEADERS,
        'body': json.dumps(data, ensure_ascii=False, default=str),
    }


def _error(status_code: int, message: str) -> Dict:
    return {
        'statusCode': status_code,
        'headers': CORS_HEADERS,
        'body': json.dumps({
            'error': {'code': 'ARCHIVE_ERROR', 'message': message}
        }, ensure_ascii=False),
    }


# ── Request parsing ──────────────────────────────────────────────────────────

def _parse_event(event: dict):
    """Extract method, path, params, and body from Lambda event."""
    rc = event.get('requestContext', {})

    if 'http' in rc:
        method = rc['http'].get('method', 'GET')
        path = rc['http'].get('path', '')
    else:
        method = event.get('httpMethod', 'GET')
        path = event.get('path', '')

    params = event.get('queryStringParameters', {}) or {}
    path_params = event.get('pathParameters', {}) or {}

    raw_body = event.get('body', '{}')
    if raw_body and event.get('isBase64Encoded', False):
        raw_body = base64.b64decode(raw_body).decode('utf-8')

    if isinstance(raw_body, str) and raw_body:
        body = json.loads(raw_body)
    elif isinstance(raw_body, dict):
        body = raw_body
    else:
        body = {}

    return method, path, params, path_params, body


# ── Lambda entry point ───────────────────────────────────────────────────────

@handler_decorator
async def lambda_handler(event: dict, context) -> dict:
    """
    Archive API Lambda handler.

    Routes:
      POST   /api/archive          — Save a sentence
      GET    /api/archive          — List archived sentences
      DELETE /api/archive/{id}     — Delete a sentence
      POST   /api/archive/similar  — Find similar sentences
    """
    method, path, params, path_params, body = _parse_event(event)

    if method == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS_HEADERS, 'body': ''}

    logger.info(f"Archive request: {method} {path}")

    # All write operations need an authenticated user. Reads (similarity
    # search, list) accept either an authenticated user (scoped to their
    # own archive) or anonymous (returns nothing for now). Replace any
    # client-supplied user_id with the JWT `sub` for write paths.
    if method in ('POST', 'DELETE'):
        try:
            verified_user_id = get_authenticated_user_id(event)
        except AuthenticationError as e:
            return _error(401, str(e))
        body['user_id'] = verified_user_id
        # Also override query-param user_id since DELETE may use it.
        params['user_id'] = verified_user_id
    else:
        # GET — try to attach a verified user_id but don't require it. The
        # repository layer scopes to user_id when present.
        anon_user_id = try_get_authenticated_user_id(event)
        if anon_user_id:
            params['user_id'] = anon_user_id

    # POST /api/archive/similar
    if '/similar' in path and method == 'POST':
        return await _handle_similar(body)

    # POST /api/archive — Save
    if method == 'POST':
        return await _handle_save(body)

    # GET /api/archive — List
    if method == 'GET':
        return await _handle_list(params)

    # DELETE /api/archive/{id}
    if method == 'DELETE':
        archive_id = path_params.get('archive_id', '')
        if not archive_id:
            # Try extracting from path: /api/archive/{id}
            parts = path.rstrip('/').split('/')
            archive_id = parts[-1] if parts else ''
        user_id = params.get('user_id', '') or body.get('user_id', '')
        return await _handle_delete(archive_id, user_id)

    return _error(405, 'Method not allowed')
