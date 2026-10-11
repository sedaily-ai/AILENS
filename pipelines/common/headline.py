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


from bedrock_models import profile_arn  # noqa: E402
# ── 생성(모델 호출) ───────────────────────────────────────────────────────────
MODEL = profile_arn("letters_sonnet46")
# 정치 소재는 후킹 제목을 쓰지 않고 기사 제목을 유지한다(중립 원칙). 분류 이름 또는 기사 최상위 분류로 판단한다.
KEEP_ARTICLE_TITLE_CATEGORIES = ("정치",)
_VERIFY = ("당신은 서울경제신문 팩트체커다. [기사 정보]와 [레터 본문]만 근거로 [제목]이 사실과 다르거나 근거 없는 주장을 담았는지 본다. "
           "숫자·주체·관계(누가 무엇을 했는지)가 본문과 어긋나거나 본문에 없는 일반론을 덧붙였으면 not ok. 표현이 압축됐을 뿐 사실이 맞으면 ok. "
           "JSON 하나만: {\"ok\": true|false, \"reason\": \"한 줄\"}")


def _load_prompt() -> str:
    """제목 프롬프트. 이미지에는 pipelines/ 만 들어가므로 같은 폴더의 사본을 읽는다(docs/prompt/letters/title-prompt-v2-*.md 와 같은 내용, 테스트가 일치를 확인)."""
    from pathlib import Path
    return (Path(__file__).parent / "headline_prompt.md").read_text(encoding="utf-8").split("## 지침", 1)[1]


def generate(article_title: str, subtitle: str, body_text: str, category: str = "", used_types: Optional[Dict[str, int]] = None) -> Optional[Dict[str, Any]]:
    """레터 제목 한 줄을 만든다. 정치 소재거나 통과한 후보가 없으면 None(→ 호출부가 기사 제목을 쓴다).
    후보 4개 생성(1회) → 코드 검증 → 사실 확인(후보당 짧은 호출, 최대 점수순으로 첫 통과까지)."""
    if category in KEEP_ARTICLE_TITLE_CATEGORIES:
        return None
    from bedrock_client import call_text
    from json_extract import extract_json_object
    body = (body_text or "")[:2800]
    try:
        out = call_text(_load_prompt(), f"[기사]\n제목: {article_title}\n부제: {subtitle or ''}\n\n[레터 본문]\n{body}", model=MODEL, max_tokens=900)
        cands = extract_json_object(out).get("candidates", [])
    except Exception as e:  # noqa: BLE001
        print(f"[headline] 후보 생성 실패: {e}")
        return None

    def verifier(title: str) -> bool:
        try:
            r = extract_json_object(call_text(_VERIFY, f"[기사 정보]\n{article_title}\n{subtitle or ''}\n\n[레터 본문]\n{body}\n\n[제목]\n{title}", model=MODEL, max_tokens=300))
            return bool(r.get("ok"))
        except Exception:  # noqa: BLE001
            return False
    picked = pick(cands, f"{body} {article_title} {subtitle or ''}", article_title, used_types, verifier)
    if not picked:
        why = [f"{c.get('title')} → {'; '.join(problems(str(c.get('title') or ''), f'{body} {article_title} {subtitle or chr(0)}', article_title)) or '사실 확인 탈락'}" for c in cands]
        print("[headline] 통과 후보 없음 — " + " | ".join(why))
    return picked
