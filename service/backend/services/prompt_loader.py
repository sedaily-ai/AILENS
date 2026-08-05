"""Centralized prompt loader — DDB-backed with 5-min TTL cache + filesystem fallback.

Pattern (Admin-3, mirrors common.feature_flag.get_threshold):
    1. cache hit (< 5 min) → return cached content
    2. DDB read sedaily-mbti-admin-prompts-dev:
         get LATEST → active_version → get v#N → content
    3. DDB error / row miss:
         a) stale cache available → return it (graceful degradation)
         b) else filesystem fallback → prompts/<category>/<name>.md
       Then warn-log so the regression is visible without 5xx.

DDB schema (Admin-1 import):
    pk = 'PROMPT#<category>/<name>'
    sk = 'LATEST'  → {active_version: <int>, updated_at}
    sk = 'v#<int>' → {content: <str>, created_at, actor}

Caller API (unchanged from filesystem-only era so 6 call sites need no edits):
    load_prompt(category, name)        — canonical, used directly by 5 of 6 sites
    load_transform_prompt(group)       — wrapper for prompts/transform/{nt,nf,st,sf}
    load_chatbot_prompt(group)         — wrapper for prompts/chatbot/{nt,nf,st,sf}
    load_prompt_by_path(relative_path) — splits 'category/name' for DDB; used by tooling

IAM: any Lambda invoking load_prompt needs `dynamodb:GetItem` on
sedaily-mbti-admin-prompts-dev. v1 shared role inherits AmazonDynamoDBFullAccess.
v2 shared role gained `AdminPromptsRead` inline policy in Admin-3 (Sid
AdminPromptsDDBRead, scoped to that single table).
"""
import logging
import os
import time
from typing import Optional

import boto3

logger = logging.getLogger(__name__)

_TABLE_NAME = os.environ.get("ADMIN_PROMPTS_TABLE", "sedaily-mbti-admin-prompts-dev")
_REGION = os.environ.get("AWS_REGION", "us-east-1")
_TTL_SECONDS = 300  # 5분 — admin UI 변경 → production 반영 SLA

PROMPTS_DIR = os.path.join(os.path.dirname(__file__), "..", "prompts")

# 모듈 레벨 cache: {(category, name): (content: str, fetched_at: float)}
_cache: dict = {}
_table = None


def _get_table():
    global _table
    if _table is None:
        _table = boto3.resource("dynamodb", region_name=_REGION).Table(_TABLE_NAME)
    return _table


def _read_filesystem(category: str, name: str) -> str:
    """Filesystem fallback — prompts/<category>/<name>.md."""
    path = os.path.join(PROMPTS_DIR, category, f"{name}.md")
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def _fetch_from_ddb(category: str, name: str) -> str:
    """DDB lookup: LATEST → active_version → v#N → content. Raises on miss/error."""
    table = _get_table()
    pk = f"PROMPT#{category}/{name}"
    latest = table.get_item(Key={"pk": pk, "sk": "LATEST"}).get("Item")
    if latest is None:
        raise KeyError(f"{pk} LATEST not found")
    active_version = int(latest["active_version"])
    version_item = table.get_item(Key={"pk": pk, "sk": f"v#{active_version}"}).get("Item")
    if version_item is None:
        raise KeyError(f"{pk} v#{active_version} not found")
    return version_item["content"]


def load_prompt(category: str, name: str) -> str:
    """Load a prompt by (category, name). DDB-backed with 5-min TTL + filesystem fallback."""
    now = time.time()
    key = (category, name)
    cached = _cache.get(key)
    if cached and (now - cached[1]) < _TTL_SECONDS:
        return cached[0]

    try:
        content = _fetch_from_ddb(category, name)
    except Exception as e:
        # tier 1 fallback: stale cache (DDB hiccup, last-known good prompt is fine)
        if cached:
            logger.warning(
                f"prompt_loader DDB error for {category}/{name}: "
                f"{type(e).__name__}: {e}, using stale cache"
            )
            return cached[0]
        # tier 2 fallback: filesystem (cold container with DDB still down)
        logger.warning(
            f"prompt_loader DDB error for {category}/{name}: "
            f"{type(e).__name__}: {e}, falling back to filesystem"
        )
        content = _read_filesystem(category, name)

    _cache[key] = (content, now)
    return content


def load_transform_prompt(group: str) -> str:
    """MBTI transform prompt: prompts/transform/{nt,nf,st,sf}.md."""
    return load_prompt("transform", group.lower())


def load_chatbot_prompt(group: str) -> str:
    """Chatbot persona prompt: prompts/chatbot/{nt,nf,st,sf}.md."""
    return load_prompt("chatbot", group.lower())


def load_prompt_by_path(relative_path: str) -> str:
    """Load by 'category/name' subpath. Splits on first '/' for DDB lookup.

    Single-segment paths (no '/') route directly to filesystem since they don't
    map to the DDB schema. None of the current 6 call sites use that form.
    """
    parts = relative_path.split("/", 1)
    if len(parts) == 2:
        return load_prompt(parts[0], parts[1])
    path = os.path.join(PROMPTS_DIR, f"{relative_path}.md")
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def invalidate(category: Optional[str] = None, name: Optional[str] = None) -> None:
    """Manual cache invalidate (tests / immediate-effect overrides)."""
    if category is None:
        _cache.clear()
        return
    if name is None:
        for k in [k for k in _cache if k[0] == category]:
            _cache.pop(k, None)
        return
    _cache.pop((category, name), None)
