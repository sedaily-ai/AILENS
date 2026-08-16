"""프론트(SSR EC2) webhook 호출 — 2026-08-16부로 다시 실제 캐시 무효화를 한다.

admin이 글을 발행/수정/삭제하면 POST https://ailens.sedaily.ai/api/revalidate
를 부른다. 2026-08-09~2026-08-16 사이엔 이 호출이 사실상 no-op이었다 — 프론트
콘텐츠 fetch가 전부 cache:'no-store'였기 때문(당시엔 무효화할 캐시 자체가
없었다). 원인은 revalidateTag(tag, 'max')의 'max'가 "즉시·완전 무효화"가 아니라
Next 내장 cache-life 프로파일(revalidate 30일) 이름이라는 걸 뒤늦게 확인한
사고였다 — 자세한 경위는
docs/worklog/2026-08/2026-08-09-cache-ttl-tighten-sse-removal.md "후속 5" 참조.

2026-08-16 "홈 속도가 느리다" 피드백으로 프론트가 캐시를 다시 켰다
(service/frontend/src/shared/lib/cmsPostsApi.ts — cache:'force-cache' + tags).
이번엔 대상 라우트(service/frontend/src/app/api/revalidate/route.ts)가 버그였던
두 번째 인자 없이 revalidateTag(tag)만 호출하도록 고쳤다 — 그 태그의 캐시를
즉시 stale 처리할 뿐 프로파일을 건드리지 않는다. 즉 이 함수가 다시 "발행 즉시
반영"의 실질적인 트리거다 — no-op 취급하지 말 것.

fail-open: 실패해도 admin 응답 자체는 절대 막지 않는다(글쓰기가 더 중요하다
— audit.py 와 같은 원칙). 캐시가 다시 살아있으므로 이 호출이 실패하면 최악의
경우 다음 발행/수정까지 옛 캐시가 5분(프론트 CACHE_TTL_FALLBACK_SECONDS 안전망)
남을 수 있다 — 예전처럼 "실패해도 잃을 게 없다"는 아니지만, 그래도 admin
응답을 막는 것보다는 낫다는 원칙은 그대로.
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
