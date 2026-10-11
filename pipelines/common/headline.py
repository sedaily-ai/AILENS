"""레터 제목 후보 검증·선택. 모델이 낸 후보 4개 중 규칙을 통과하는 것만 남기고, 기사 핵심 정보가 담긴 것을 고른다.
(프롬프트: docs/prompt/letters/title-prompt-v2-2026-10-11.md)"""
import re
from typing import Any, Dict, List, Optional

MIN_LEN, MAX_LEN = 25, 55
# 주제를 그대로 가리키는 뻔한 아이콘
BANNED_ICONS = set("⚠✅📊📈📉🔄🎯✨❌💰⚖🏛🔒🔐🔍📜")
BANNED_WORDS = ("충격", "난리", "역대급", "어쩌죠", "큰일", "해야 할까", "사야 할까", "팔아야", "[단독]", "…", "겨냥", "폭로")
_EMOJI_END = re.compile(r"\s*([\U0001F300-\U0001FAFF☀-➿]️?)\s*$")
_NUM = re.compile(r"\d[\d,]*(?:\.\d+)?")


def _norm_num(s: str) -> str:
    return s.replace(",", "")


def split_emoji(title: str):
    m = _EMOJI_END.search(title)
    return (title[: m.start()].rstrip(), m.group(1)) if m else (title.strip(), "")


def problems(title: str, body_text: str, article_title: str = "") -> List[str]:
    out: List[str] = []
    text, emoji = split_emoji(title)
    if not MIN_LEN <= len(text) <= MAX_LEN:
        out.append(f"글자 수 {len(text)}자(25~55자)")
    if text.endswith((".", "!", "。")) or "!" in text:
        out.append("마침표·느낌표")
    if any(w in title for w in BANNED_WORDS):
        out.append("금지 표현")
    if emoji and emoji[0] in BANNED_ICONS:
        out.append("뻔한 아이콘")
    # 끝 이모지는 권장이지만 없다고 거부하지 않는다(효과가 작고 모델이 자주 빠뜨림). pick() 점수에서만 가산한다.
    if re.search(r"[\U0001F300-\U0001FAFF\u2600-\u27BF]", text):
        out.append("이모지는 끝에 하나만")
    if _NUM.match(text):
        out.append("숫자로 시작")
    body_nums = {_norm_num(n) for n in _NUM.findall(body_text or "")} | {_norm_num(n) for n in _NUM.findall(article_title or "")}
    bad = [n for n in (_norm_num(x) for x in _NUM.findall(text)) if n not in body_nums]
    if bad:
        out.append("본문에 없는 숫자: " + ", ".join(bad))
    if "?" in text and "요?" not in text and "?" != text[-1:]:
        out.append("물음표 위치")
    return out


def _tokens(s: str) -> set:
    return {t for t in re.findall(r"[가-힣A-Za-z0-9]{2,}", s or "")}


def score(title: str, article_title: str) -> int:
    """기사 제목의 핵심 단어가 살아 있고(추상화 방지), 숫자가 있고, 끝 이모지가 있고, 너무 길지 않을수록 높다."""
    text, emoji = split_emoji(title)
    overlap = len(_tokens(text) & _tokens(article_title))
    long_pen = max(0, len(text) - 40) // 3
    return overlap * 2 + (2 if _NUM.search(text) else 0) + (2 if emoji else 0) - long_pen


def pick(candidates: List[Dict[str, Any]], body_text: str, article_title: str, used_types: Optional[Dict[str, int]] = None, verifier=None) -> Optional[Dict[str, Any]]:
    """규칙을 통과한 후보를 점수순으로 보고, verifier(title) 가 있으면 사실 확인을 통과하는 첫 후보를 돌려준다.
    같은 날 이미 많이 쓴 유형은 감점(used_types: 유형 → 횟수)."""
    used_types = used_types or {}
    ok = []
    for c in candidates:
        t = str(c.get("title") or "")
        if not problems(t, body_text, article_title):
            ok.append((score(t, article_title) - 2 * used_types.get(c.get("type", ""), 0), c))
    for _, c in sorted(ok, key=lambda x: -x[0]):
        if verifier is None or verifier(c["title"]):
            return c
    return None
