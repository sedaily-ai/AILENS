"""Centralized prompt loader — PostgreSQL-backed(lens-cms-api) with 5-min TTL
cache + filesystem fallback.

Pattern (Admin-3, mirrors common.feature_flag.get_threshold):
    1. cache hit (< 5 min) → return cached content
    2. GET lens-cms-api /api/v2/prompts/{category}/{name} → content
    3. HTTP error / 404:
         a) stale cache available → return it (graceful degradation)
         b) else filesystem fallback → prompts/<category>/<name>.md
       Then warn-log so the regression is visible without 5xx.

2026-09-09(v1.27): DynamoDB(sedaily-mbti-admin-prompts-dev, pk='PROMPT#
<category>/<name>', sk='LATEST'|'v#<int>')에서 전환. 공개 무인증 엔드포인트
라 IAM 걱정이 없어졌다(예전엔 `dynamodb:GetItem` 권한을 Lambda 역할마다
챙겨야 했음).

Caller API:
    load_prompt(category, name)        — canonical
    load_chatbot_prompt(group)         — wrapper for prompts/chatbot/<group>.md
                                          (only 'default' exists post MBTI-persona removal)
"""
import json
import logging
import os
import time
import urllib.request
from config.constants import LENS_CMS_API_DEFAULT_URL

logger = logging.getLogger(__name__)

_API_URL = os.environ.get("LENS_CMS_API_URL", LENS_CMS_API_DEFAULT_URL)
_TTL_SECONDS = 300  # 5분 — admin UI 변경 → production 반영 SLA
_TIMEOUT_SECONDS = 8

PROMPTS_DIR = os.path.join(os.path.dirname(__file__), "..", "prompts")

# 모듈 레벨 cache: {(category, name): (content: str, fetched_at: float)}
_cache: dict = {}


def _read_filesystem(category: str, name: str) -> str:
    """Filesystem fallback — prompts/<category>/<name>.md."""
    path = os.path.join(PROMPTS_DIR, category, f"{name}.md")
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def _fetch_from_backend(category: str, name: str) -> str:
    """lens-cms-api lookup: GET /api/v2/prompts/{category}/{name} → content. Raises on miss/error."""
    req = urllib.request.Request(f"{_API_URL}/api/v2/prompts/{category}/{name}", method="GET")
    with urllib.request.urlopen(req, timeout=_TIMEOUT_SECONDS) as res:
        return json.loads(res.read())["content"]


def load_prompt(category: str, name: str) -> str:
    """Load a prompt by (category, name). PostgreSQL-backed with 5-min TTL + filesystem fallback."""
    now = time.time()
    key = (category, name)
    cached = _cache.get(key)
    if cached and (now - cached[1]) < _TTL_SECONDS:
        return cached[0]

    try:
        content = _fetch_from_backend(category, name)
    except Exception as e:
        # tier 1 fallback: stale cache (backend hiccup, last-known good prompt is fine)
        if cached:
            logger.warning(
                f"prompt_loader backend error for {category}/{name}: "
                f"{type(e).__name__}: {e}, using stale cache"
            )
            return cached[0]
        # tier 2 fallback: filesystem (cold container with backend still down)
        logger.warning(
            f"prompt_loader backend error for {category}/{name}: "
            f"{type(e).__name__}: {e}, falling back to filesystem"
        )
        content = _read_filesystem(category, name)

    _cache[key] = (content, now)
    return content


def load_chatbot_prompt(group: str) -> str:
    """Chatbot persona prompt: prompts/chatbot/{nt,nf,st,sf}.md."""
    return load_prompt("chatbot", group.lower())


