"""프론트(SSR EC2) webhook 호출 — ⚠️ 2026-08-09부로 사실상 no-op.

admin이 글을 발행/수정/삭제하면 POST https://ailens.sedaily.ai/api/revalidate
를 부른다. **이 호출은 지금 아무 캐시도 안 지운다** — 프론트 콘텐츠 fetch가
전부 cache:'no-store'로 바뀌면서(service/frontend/src/shared/lib/cmsPostsApi.ts
등) 애초에 무효화할 캐시 자체가 없어졌다. 대상 라우트
(service/frontend/src/app/api/revalidate/route.ts)는 인증만 확인하고 200을
반환하는 순수 no-op 핸들러다 — admin 쪽 코드를 안 건드리기 위해 호출은
남겨뒀을 뿐, 실질적 효과는 없다. 경위: revalidateTag(tag, 'max')의 'max'가
"즉시·완전 무효화"가 아니라 Next 내장 cache-life 프로파일(revalidate 30일)
이라는 걸 뒤늦게 확인 — 자세한 사고 경위는
docs/worklog/2026-08/2026-08-09-cache-ttl-tighten-sse-removal.md
"후속 5" 참조.

이 함수를 다시 쓸모 있게 만들려는 게 아니라면(예: 캐시를 재도입하며
revalidateTag를 다시 쓰게 되는 경우) 굳이 건드릴 필요는 없다 — 그때 이
docstring도 같이 갱신할 것.

fail-open: 실패해도 admin 응답 자체는 절대 막지 않는다(글쓰기가 더 중요하다
— audit.py 와 같은 원칙). 지금은 no-op이라 실패해도 잃을 게 없다.
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
