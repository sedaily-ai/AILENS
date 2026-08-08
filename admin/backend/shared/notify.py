"""프론트(SSR EC2) 캐시 무효화 webhook — CRUD 즉시 반영(2026-08-08).

admin이 글을 발행/수정/삭제하면 POST https://ailens.sedaily.ai/api/revalidate
를 불러 Next.js의 revalidateTag() + SSE 브로드캐스트를 트리거한다
(service/frontend/src/app/api/revalidate/route.ts 참조).

fail-open: 이 webhook이 실패해도 admin 응답 자체는 절대 막지 않는다(글쓰기가
더 중요하다 — audit.py 와 같은 원칙). 놓쳐도 프론트 쪽 fetch가 60초 TTL로
스스로 회복한다(next: { revalidate: 60 }).
"""

from __future__ import annotations

import logging
import time
import urllib.error
import urllib.request

from common.secrets import get_secret

logger = logging.getLogger(__name__)

_REVALIDATE_URL = "https://ailens.sedaily.ai/api/revalidate"
_SECRET_PARAM = "/sedaily-mbti/ssr-revalidate-secret"
_TIMEOUT_SECONDS = 2
_RETRY_DELAY_SECONDS = 1


def _post_once() -> bool:
    secret = get_secret(_SECRET_PARAM)
    req = urllib.request.Request(
        _REVALIDATE_URL,
        data=b"{}",
        headers={"Content-Type": "application/json", "X-Revalidate-Secret": secret},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=_TIMEOUT_SECONDS) as res:
        return 200 <= res.status < 300


def notify_content_changed() -> None:
    """프론트 캐시 무효화 요청 — 실패해도 raise 하지 않는다(1회 짧은 재시도만)."""
    try:
        if _post_once():
            return
        logger.warning("revalidate webhook: non-2xx response, retrying once")
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        logger.warning(f"revalidate webhook failed: {type(e).__name__}: {e}, retrying once")
    except Exception as e:
        logger.warning(f"revalidate webhook failed (secret fetch?): {type(e).__name__}: {e}")
        return

    time.sleep(_RETRY_DELAY_SECONDS)
    try:
        _post_once()
    except Exception as e:
        logger.warning(f"revalidate webhook retry failed: {type(e).__name__}: {e}")
