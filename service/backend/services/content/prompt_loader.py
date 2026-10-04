"""프롬프트 로더 — lens-cms-api(PostgreSQL) 기반, TTL 5분 캐시 + 파일시스템 대체.

조회 순서(common.feature_flag.get_threshold 와 동일 패턴):
    1. 캐시 적중(5분 미만) -> 캐시 반환
    2. GET lens-cms-api /api/v2/prompts/{category}/{name}
    3. HTTP 오류/404 -> 만료된 캐시가 있으면 반환, 없으면 prompts/<category>/<name>.md 로 대체.
       대체 시 경고 로그를 남겨 5xx 없이도 이상을 확인할 수 있게 한다.

공개 API:
    load_prompt(category, name)  — 기본 로더
    load_chatbot_prompt(group)   — prompts/chatbot/<group>.md 래퍼('default'만 존재)
"""
import json
import logging
import os
import time
import urllib.request
from config.constants import LENS_CMS_API_DEFAULT_URL

logger = logging.getLogger(__name__)

_API_URL = os.environ.get("LENS_CMS_API_URL", LENS_CMS_API_DEFAULT_URL)
_TTL_SECONDS = 300  # admin UI 변경이 운영에 반영되기까지의 허용 지연
_TIMEOUT_SECONDS = 8

PROMPTS_DIR = os.path.join(os.path.dirname(__file__), "..", "prompts")

# 모듈 캐시: {(category, name): (content, fetched_at)}
_cache: dict = {}


def _read_filesystem(category: str, name: str) -> str:
    """파일시스템 대체 경로(prompts/<category>/<name>.md)에서 읽는다."""
    path = os.path.join(PROMPTS_DIR, category, f"{name}.md")
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def _fetch_from_backend(category: str, name: str) -> str:
    """lens-cms-api에서 프롬프트를 조회한다. 미존재·오류 시 예외를 던진다."""
    req = urllib.request.Request(f"{_API_URL}/api/v2/prompts/{category}/{name}", method="GET")
    with urllib.request.urlopen(req, timeout=_TIMEOUT_SECONDS) as res:
        return json.loads(res.read())["content"]


def load_prompt(category: str, name: str) -> str:
    """(category, name)으로 프롬프트를 로드한다(캐시 TTL 5분, 실패 시 파일시스템 대체)."""
    now = time.time()
    key = (category, name)
    cached = _cache.get(key)
    if cached and (now - cached[1]) < _TTL_SECONDS:
        return cached[0]

    try:
        content = _fetch_from_backend(category, name)
    except Exception as e:
        # 1순위 대체: 만료된 캐시(일시 장애 시 마지막 정상 프롬프트 사용)
        if cached:
            logger.warning(
                f"prompt_loader backend error for {category}/{name}: "
                f"{type(e).__name__}: {e}, using stale cache"
            )
            return cached[0]
        # 2순위 대체: 파일시스템(콜드 컨테이너에서 백엔드도 장애인 경우)
        logger.warning(
            f"prompt_loader backend error for {category}/{name}: "
            f"{type(e).__name__}: {e}, falling back to filesystem"
        )
        content = _read_filesystem(category, name)

    _cache[key] = (content, now)
    return content


def load_chatbot_prompt(group: str) -> str:
    """챗봇 프롬프트(prompts/chatbot/<group>.md)를 로드한다."""
    return load_prompt("chatbot", group.lower())


