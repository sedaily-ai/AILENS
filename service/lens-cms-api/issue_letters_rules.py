"""이슈 레터(모아쓰기 레터) 규칙 — 입력 정규화·검증·발행 조건·투표 식별자 해시. DB 를 쓰지 않는 순수 함수만 둔다.

2026-10-12 issue_letters_repo.py 에서 분리(리팩토링 6단계). 규칙 배경은 docs/product/모아쓰기레터/README.md.
"""
from __future__ import annotations

import hashlib
import os
import re
from typing import Any, Dict, List, Optional, Tuple

from letter_errors import LetterError

AXES = ("news", "substance", "other")
STATUSES = ("draft", "in_review", "published", "archived")
POLL_KINDS = ("emotion",)  # 감정 반응형만 허용. DB 에는 옛 값 binary 가 남아 있지만 새 레터는 쓸 수 없다(2026-10-09 편집 원칙)
# 투표 중립 원칙: 질문·선택지에 평가(합리적·옳다), 권유·결정(해야·맞을까요), 투자 행동(사야·매수) 표현을 쓰지 않는다.
# 문구 휴리스틱이라 완벽하지 않다 — 자동 방어선일 뿐이고 최종 판단은 편집장 검수다.
POLL_BIASED_TERMS = ("맞을까", "맞나요", "맞다고", "옳", "틀렸", "해야", "할까요", "좋을까", "좋은 선택", "나쁜 선택", "합리적", "비합리",
                     "바람직", "현명", "어리석", "찬성", "반대", "지지", "사야", "팔아야", "매수", "매도", "추천", "권해", "보내야", "기다려야",
                     "지켜봐야", "당연", "분명")
# 본문·요약·에디터 한마디: 투자·행동 지시 표현만 막는다(인용문 속 당사자 발언까지 막지 않도록 좁게 잡는다).
BODY_DIRECTIVE_TERMS = ("사세요", "파세요", "하세요", "사야 ", "팔아야", "매수하", "매도하", "추천합니다", "추천해요", "권합니다", "권해요")
REQUIRED_POLL_NEUTRAL_KEY = "unsure"  # 모든 투표에 "잘 모르겠어요"류 중립 선택지를 둔다
# 에디터 한마디: 의견이 아니라 본문 사실의 연결 정리(docs/product/모아쓰기레터/에디터한마디_작성기준.md). 평가어·감탄·단정·판단 요구를 막고 200자로 제한한다.
EDITOR_NOTE_BANNED_TERMS = ("아이러니", "재밌", "재미있", "놀랍", "흥미", "탁월", "대단", "안타깝", "다행", "충격", "역시", "결국",
                            "지켜봐야", "주목하", "해야", "분명", "당연", "!")
EDITOR_NOTE_MAX_CHARS = 200
EDITOR_NOTE_MAX_SENTENCES = 2
# 제목·요약·섹션 제목·핵심 한 줄: 템플릿 v2 금지 표현(평가·감탄). 문장 끝맺음 위주라 인용문과 거의 겹치지 않는 것만 둔다.
HEADLINE_BANNED_TERMS = ("아이러니", "재밌는", "재미있는", "놀랍게도", "놀라운", "흥미롭게도", "흥미로운", "탁월", "안타깝게도", "다행히", "충격", "!")
# 본문 문단: 인용문 속 당사자 발언을 막지 않도록 가장 분명한 평가 부사만 막는다.
BODY_EVAL_TERMS = ("아이러니", "놀랍게도", "흥미롭게도", "안타깝게도", "다행히")
POLL_MIN_OPTIONS = 3
POLL_MAX_OPTIONS = 4
SUMMARY_MIN_LINES = 2
SUMMARY_MAX_LINES = 3
# 사이트 분류의 정본은 프론트 shared/constants/econCategories.ts 다. DB categories 테이블은 옛 7분류라 쓰지 않는다(v1.38).
SITE_CATEGORIES = {
    "markets": "시그널", "property": "부동산", "economy": "경제", "finance": "금융", "industry": "산업",
    "politics": "정치", "national": "사회", "international": "국제", "culture": "문화",
}
MIN_SECTIONS = 3
MAX_TOPICS = 8
PRIMARY_TOPICS = 2  # 앞의 두 개를 주 주제로 본다
MIN_DISTINCT_INLINE_ARTICLES = 3
_SLUG_RE = re.compile(r"^[0-9]{4}-[0-9]{2}-[0-9]{2}-[^\s/?#]{1,200}$")
_OPTION_KEY_RE = re.compile(r"^[a-z][a-z0-9_]{0,31}$")
_MAX_TEXT = 20000
_MAX_PARAGRAPHS = 30
_MAX_SOURCES = 20


def normalize_url(url: str) -> str:
    """링크 비교용: 쿼리·프래그먼트·끝 슬래시를 뗀다(?ref=sedailyEng 같은 꼬리표 무시)."""
    return re.split(r"[?#]", (url or "").strip(), maxsplit=1)[0].rstrip("/")


def biased_terms(text: str, terms: Tuple[str, ...]) -> List[str]:
    return [t for t in terms if t and t in (text or "")]


def poll_problems(poll: Optional[Dict[str, Any]]) -> List[str]:
    """투표 질문·선택지의 중립성 규칙. 저장 때와 발행 때 같은 규칙을 쓴다."""
    if not poll:
        return []
    problems: List[str] = []
    texts = [("질문", poll.get("question") or "")]
    for o in poll.get("options") or []:
        texts.append((f"선택지 '{o.get('label')}'", f"{o.get('label') or ''} {o.get('hint') or ''}"))
    for where, text in texts:
        hit = biased_terms(text, POLL_BIASED_TERMS)
        if hit:
            problems.append(f"투표 {where}에 평가·권유·결정을 암시하는 표현이 있습니다({', '.join(hit)}) — 감정이나 인지만 묻는 중립 문구로 바꾸세요")
    if poll.get("kind") != "emotion":
        problems.append("투표는 감정 반응형(emotion)만 허용됩니다")
    if not any(o.get("key") == REQUIRED_POLL_NEUTRAL_KEY for o in poll.get("options") or []):
        problems.append(f"투표에 중립 선택지(key '{REQUIRED_POLL_NEUTRAL_KEY}', 예: 잘 모르겠어요)가 필요합니다")
    return problems


def voter_hash(raw_id: str, salt: Optional[str] = None) -> str:
    salt = os.environ.get("VOTE_HASH_SALT", "") if salt is None else salt
    if not salt:
        raise LetterError("투표 해시 솔트가 설정되지 않았습니다", 500)
    raw = str(raw_id or "").strip()
    if not raw or len(raw) > 128:
        raise LetterError("투표자 식별자가 올바르지 않습니다")
    return hashlib.sha256(f"{salt}:{raw}".encode("utf-8")).hexdigest()


def _text(value: Any, name: str, required: bool = False, limit: int = _MAX_TEXT) -> Optional[str]:
    if value is None or (isinstance(value, str) and not value.strip()):
        if required:
            raise LetterError(f"{name}은 필수입니다")
        return None
    if not isinstance(value, str) or len(value) > limit:
        raise LetterError(f"{name}은 {limit}자 이하 문자열이어야 합니다")
    return value.strip()


# 시각 블록: 문단 자리에 [{"block": 종류, ...}] 한 조각짜리 배열로 들어간다(기존 문단 순회 코드가 깨지지 않도록 문단과 같은 모양을 쓴다).
BLOCK_KINDS = ("timeline", "stats", "bars", "versus", "fold", "callout")


def _short(value: Any, where: str, limit: int, required: bool = True) -> str:
    if not isinstance(value, str) or not value.strip():
        if required:
            raise LetterError(f"{where}: 문자열이 비어 있습니다")
        return ""
    if len(value) > limit:
        raise LetterError(f"{where}: {limit}자 이하여야 합니다")
    return value.strip()


def _items(block: Dict[str, Any], where: str, lo: int, hi: int) -> List[Dict[str, Any]]:
    items = block.get("items")
    if not isinstance(items, list) or not lo <= len(items) <= hi or any(not isinstance(i, dict) for i in items):
        raise LetterError(f"{where}.items 는 {lo}~{hi}개의 객체 배열이어야 합니다")
    return items


def _normalize_block(block: Dict[str, Any], where: str) -> Dict[str, Any]:
    kind = block.get("block")
    if kind not in BLOCK_KINDS:
        raise LetterError(f"{where}: block 은 {'/'.join(BLOCK_KINDS)} 중 하나여야 합니다")
    out: Dict[str, Any] = {"block": kind}
    if kind == "timeline":
        out["items"] = [{"label": _short(i.get("label"), f"{where}.items[{n}].label", 30), "text": _short(i.get("text"), f"{where}.items[{n}].text", 300)}
                        for n, i in enumerate(_items(block, where, 2, 8))]
    elif kind == "stats":
        out["items"] = [{"label": _short(i.get("label"), f"{where}.items[{n}].label", 40), "value": _short(i.get("value"), f"{where}.items[{n}].value", 20),
                         "sub": _short(i.get("sub"), f"{where}.items[{n}].sub", 80, required=False)} for n, i in enumerate(_items(block, where, 1, 4))]
    elif kind == "bars":
        bars = []
        for n, i in enumerate(_items(block, where, 2, 6)):
            v = i.get("value")
            if isinstance(v, bool) or not isinstance(v, (int, float)) or v < 0:
                raise LetterError(f"{where}.items[{n}].value 는 0 이상의 숫자여야 합니다")
            bars.append({"label": _short(i.get("label"), f"{where}.items[{n}].label", 20), "value": v})
        out["items"] = bars
        out["title"] = _short(block.get("title"), f"{where}.title", 60, required=False)
        out["unit"] = _short(block.get("unit"), f"{where}.unit", 10, required=False)
    elif kind == "versus":
        for side in ("left", "right"):
            sd = block.get(side)
            if not isinstance(sd, dict):
                raise LetterError(f"{where}.{side} 가 필요합니다")
            out[side] = {"label": _short(sd.get("label"), f"{where}.{side}.label", 30), "text": _short(sd.get("text"), f"{where}.{side}.text", 300)}
    elif kind == "fold":
        out["title"] = _short(block.get("title"), f"{where}.title", 80)
        out["text"] = _short(block.get("text"), f"{where}.text", 1200)
    else:  # callout
        out["text"] = _short(block.get("text"), f"{where}.text", 400)
    return out


def block_text(block: Dict[str, Any]) -> str:
    """블록 안의 모든 글자(발행 규칙·글자 수 검사용)."""
    parts: List[str] = [str(block.get(k) or "") for k in ("title", "text")]
    for side in ("left", "right"):
        if isinstance(block.get(side), dict):
            parts += [str(block[side].get("label") or ""), str(block[side].get("text") or "")]
    for i in block.get("items") or []:
        parts += [str(i.get(k) or "") for k in ("label", "text", "value", "sub")]
    return " ".join(p for p in parts if p)


def _normalize_paragraph(para: Any, where: str) -> List[Any]:
    """문단 = 조각 배열. 조각은 문자열 또는 {text, href?, article_no?}."""
    if not isinstance(para, list) or not para:
        raise LetterError(f"{where}: 문단은 비어 있지 않은 배열이어야 합니다")
    out: List[Any] = []
    if len(para) == 1 and isinstance(para[0], dict) and "block" in para[0]:
        return [_normalize_block(para[0], where)]
    for seg in para:
        if isinstance(seg, str):
            out.append(seg)
        elif isinstance(seg, dict) and isinstance(seg.get("text"), str) and seg["text"]:
            item: Dict[str, Any] = {"text": seg["text"]}
            if seg.get("href"):
                href = str(seg["href"])
                if not re.match(r"^https?://", href):
                    raise LetterError(f"{where}: 링크는 http(s) 주소여야 합니다")
                item["href"] = href
            if seg.get("article_no"):
                item["article_no"] = str(seg["article_no"])[:32]
            out.append(item)
        else:
            raise LetterError(f"{where}: 문단 조각 형식이 올바르지 않습니다")
    return out


def _normalize_sections(raw_sections: Any) -> List[Dict[str, Any]]:
    sections = []
    for i, sec in enumerate(raw_sections or []):
        if not isinstance(sec, dict) or sec.get("axis") not in AXES:
            raise LetterError(f"sections[{i}].axis 는 {'/'.join(AXES)} 중 하나여야 합니다")
        paragraphs = sec.get("paragraphs") or []
        if not isinstance(paragraphs, list) or len(paragraphs) > _MAX_PARAGRAPHS:
            raise LetterError(f"sections[{i}].paragraphs 가 올바르지 않습니다")
        sections.append({
            "axis": sec["axis"],
            "axis_label": _text(sec.get("axis_label"), f"sections[{i}].axis_label", limit=100),
            "heading": _text(sec.get("heading"), f"sections[{i}].heading", required=True, limit=200),
            "key_line": _text(sec.get("key_line"), f"sections[{i}].key_line", required=True, limit=300),
            "paragraphs": [_normalize_paragraph(p, f"sections[{i}].paragraphs[{j}]") for j, p in enumerate(paragraphs)],
        })
    return sections


def validate_letter_payload(data: Dict[str, Any]) -> Dict[str, Any]:
    """저장용 입력을 검증·정규화한다(초안 단계 — 발행 규칙은 publish_problems 가 따로 본다)."""
    slug = _text(data.get("slug"), "slug", required=True, limit=255)
    if not _SLUG_RE.match(slug):
        raise LetterError("slug 는 YYYY-MM-DD-주제 형식이어야 합니다")
    title = _text(data.get("title"), "title", required=True, limit=300)
    read_minutes = int(data.get("read_minutes") or 3)
    if not 1 <= read_minutes <= 60:
        raise LetterError("read_minutes 는 1~60 이어야 합니다")
    summary = data.get("summary") or []
    if not isinstance(summary, list) or any(not isinstance(s, str) or not s.strip() for s in summary) or len(summary) > 6:
        raise LetterError("summary 는 비어 있지 않은 문장 배열(최대 6)이어야 합니다")

    editors = data.get("editors")
    if editors is not None:
        if not isinstance(editors, list) or any(not isinstance(e, str) or not e.strip() or len(e) > 32 for e in editors):
            raise LetterError("editors 는 에디터 slug 문자열 배열이어야 합니다")
        editors = list(dict.fromkeys(e.strip().lower() for e in editors))
        if len(editors) > 8:
            raise LetterError("editors 는 최대 8명입니다")
    topics = data.get("topics")
    if topics is not None:
        if not isinstance(topics, list) or any(not isinstance(t, str) or not t.strip() or len(t) > 64 for t in topics):
            raise LetterError("topics 는 주제 사전의 이름·별칭 문자열 배열이어야 합니다")
        topics = list(dict.fromkeys(t.strip() for t in topics))
        if len(topics) > MAX_TOPICS:
            raise LetterError(f"topics 는 최대 {MAX_TOPICS}개입니다")

    categories = data.get("categories") or []
    if not isinstance(categories, list) or not categories or len(categories) > 6:
        raise LetterError("categories 는 1~6개의 분류 slug 배열이어야 합니다(첫 번째가 주 분류)")
    unknown = [c for c in categories if c not in SITE_CATEGORIES]
    if unknown or len(set(categories)) != len(categories):
        raise LetterError(f"알 수 없거나 중복된 분류: {', '.join(map(str, unknown)) or '중복'} (허용: {', '.join(SITE_CATEGORIES)})")

    sections = _normalize_sections(data.get("sections"))
    sources = []
    seen_positions = set()
    for i, src in enumerate(data.get("sources") or []):
        if not isinstance(src, dict):
            raise LetterError(f"sources[{i}] 형식이 올바르지 않습니다")
        axes = src.get("axes") or []
        if not isinstance(axes, list) or any(a not in AXES for a in axes):
            raise LetterError(f"sources[{i}].axes 는 {'/'.join(AXES)} 의 배열이어야 합니다")
        # 출처는 서울경제 원문 기사만 인정한다(2026-10-09 결정). 기사 주소(url)로 지정하고, 주소는 저장 때 "후보로 담은 빅카인즈 보관 기사"와 대조한다.
        if src.get("external_url") or src.get("external_title") or src.get("article_no"):
            raise LetterError(f"sources[{i}]: 출처는 url(서울경제 기사 주소) 하나만 지정하세요. 외부 매체·기사 번호 지정은 쓸 수 없습니다")
        url = str(src.get("url") or "").strip()
        if not re.match(r"^https?://", url):
            raise LetterError(f"sources[{i}].url 은 서울경제 기사 주소(http/https)여야 합니다")
        key = normalize_url(url)
        if key in seen_positions:
            raise LetterError(f"sources[{i}]: 같은 기사가 두 번 들어 있습니다")
        seen_positions.add(key)
        sources.append({"axes": axes, "url": url})
    if len(sources) > _MAX_SOURCES:
        raise LetterError(f"sources 는 최대 {_MAX_SOURCES}개입니다")

    poll = data.get("poll")
    if poll:
        if poll.get("kind") not in POLL_KINDS:
            raise LetterError("poll.kind 는 binary/emotion 중 하나여야 합니다")
        options = poll.get("options") or []
        if not 2 <= len(options) <= 5:
            raise LetterError("poll.options 는 2~5개여야 합니다")
        keys = [o.get("key") for o in options]
        if any(not isinstance(k, str) or not _OPTION_KEY_RE.match(k) for k in keys) or len(set(keys)) != len(keys):
            raise LetterError("poll.options[].key 는 영문 소문자 식별자이며 서로 달라야 합니다")
        poll = {
            "kind": poll["kind"],
            "question": _text(poll.get("question"), "poll.question", required=True, limit=200),
            "options": [{"key": o["key"], "label": _text(o.get("label"), "poll.options[].label", required=True, limit=100),
                         "hint": _text(o.get("hint"), "poll.options[].hint", limit=200)} for o in options],
        }

    bad_poll = poll_problems(poll)
    if bad_poll:
        raise LetterError(" / ".join(bad_poll))
    return {
        "slug": slug, "title": title, "deck": _text(data.get("deck"), "deck", limit=500) or "",
        "summary": [s.strip() for s in summary], "editor_note": _text(data.get("editor_note"), "editor_note", limit=1000),
        "read_minutes": read_minutes, "categories": [str(c) for c in categories], "topics": topics, "editors": editors,
        "sections": sections, "sources": sources, "poll": poll,
    }


def publish_problems(letter: Dict[str, Any]) -> List[str]:
    """발행 전 검증. letter 는 get_admin() 모양(sources 에 해석된 url 포함). 빈 목록이면 발행 가능."""
    problems: List[str] = []
    sections = letter.get("sections") or []
    if len(sections) < MIN_SECTIONS:
        problems.append(f"섹션이 {MIN_SECTIONS}개 이상이어야 합니다(현재 {len(sections)}개)")
    for i, sec in enumerate(sections):
        if not (sec.get("key_line") or "").strip():
            problems.append(f"섹션 {i + 1}에 '핵심' 문장이 없습니다")
        if not sec.get("paragraphs"):
            problems.append(f"섹션 {i + 1}에 본문 문단이 없습니다")
    axes_present = {sec.get("axis") for sec in sections}
    missing_axes = [a for a in AXES if a not in axes_present]
    if missing_axes:
        problems.append(f"3축(소식·실체·다른 시각)이 모두 있어야 합니다(빠진 축: {', '.join(missing_axes)})")
    summary_lines = letter.get("summary") or []
    if not summary_lines:
        problems.append("1분 요약이 없습니다")
    elif not SUMMARY_MIN_LINES <= len(summary_lines) <= SUMMARY_MAX_LINES:
        problems.append(f"1분 요약은 {SUMMARY_MIN_LINES}~{SUMMARY_MAX_LINES}줄이어야 합니다(현재 {len(summary_lines)}줄)")
    if not (letter.get("editor_note") or "").strip():
        problems.append("에디터 한마디가 없습니다")

    sources = letter.get("sources") or []
    source_urls = {normalize_url(s["url"]) for s in sources if s.get("url")}
    own_urls = {normalize_url(s["url"]) for s in sources if (s.get("article_no") or s.get("archive_id")) and s.get("url")}
    for s in sources:
        title = s.get("title") or ""
        if title.startswith("(예시)"):
            problems.append(f"자리표시 출처가 남아 있습니다: {title}")
        if (s.get("article_no") or s.get("archive_id")) and not s.get("url"):
            problems.append(f"출처 기사의 주소를 찾을 수 없습니다: {title}")
        if not (s.get("article_no") or s.get("archive_id")):
            problems.append(f"서울경제 원문 기사가 아닌 출처는 쓸 수 없습니다: {title}")

    inline: List[str] = []
    for sec in sections:
        for para in sec.get("paragraphs") or []:
            for seg in para:
                if isinstance(seg, dict) and seg.get("href"):
                    inline.append(normalize_url(seg["href"]))
    for url in sorted(set(inline) - source_urls):
        problems.append(f"본문 링크가 '쓰인 기사' 목록에 없습니다: {url}")
    distinct_own = len(set(inline) & own_urls)
    if distinct_own < MIN_DISTINCT_INLINE_ARTICLES:
        problems.append(f"본문에 서로 다른 자사 기사 링크가 {MIN_DISTINCT_INLINE_ARTICLES}개 이상 필요합니다(현재 {distinct_own}개)")

    topic_count = len(letter.get("topics") or [])
    if topic_count == 0:
        problems.append("주제 태그가 1개 이상 필요합니다(주제 사전에서 고르세요)")
    elif topic_count > MAX_TOPICS:
        problems.append(f"주제 태그는 최대 {MAX_TOPICS}개입니다(현재 {topic_count}개)")
    problems.extend(poll_problems(letter.get("poll")))
    poll_options = (letter.get("poll") or {}).get("options") or []
    if letter.get("poll") and not POLL_MIN_OPTIONS <= len(poll_options) <= POLL_MAX_OPTIONS:
        problems.append(f"투표 선택지는 {POLL_MIN_OPTIONS}~{POLL_MAX_OPTIONS}개여야 합니다(현재 {len(poll_options)}개)")
    note = (letter.get("editor_note") or "").strip()
    if len(note) > EDITOR_NOTE_MAX_CHARS:
        problems.append(f"에디터 한마디가 {EDITOR_NOTE_MAX_CHARS}자를 넘습니다(현재 {len(note)}자)")
    if len(re.findall(r"[.?!]", note)) > EDITOR_NOTE_MAX_SENTENCES:
        problems.append(f"에디터 한마디는 {EDITOR_NOTE_MAX_SENTENCES}문장 이내여야 합니다")
    hit = biased_terms(note, EDITOR_NOTE_BANNED_TERMS)
    if hit:
        problems.append(f"에디터 한마디에 평가·감탄·단정·판단 요구 표현이 있습니다({', '.join(hit)}) — 본문 사실의 연결을 정리하는 문장으로 바꾸세요")
    body_texts = [("에디터 한마디", letter.get("editor_note") or "")] + [("1분 요약", t) for t in letter.get("summary") or []]
    for i, sec in enumerate(sections):
        body_texts.append((f"섹션 {i + 1} 핵심", sec.get("key_line") or ""))
        for para in sec.get("paragraphs") or []:
            body_texts.append((f"섹션 {i + 1} 본문", "".join(seg if isinstance(seg, str) else (block_text(seg) if "block" in seg else seg.get("text", "")) for seg in para)))
    headline_texts = [("제목", letter.get("title") or ""), ("부제", letter.get("deck") or "")] + [("1분 요약", t) for t in letter.get("summary") or []]
    for i, sec in enumerate(sections):
        headline_texts += [(f"섹션 {i + 1} 제목", sec.get("heading") or ""), (f"섹션 {i + 1} 핵심", sec.get("key_line") or "")]
    for where, text in headline_texts:
        hit = biased_terms(text, HEADLINE_BANNED_TERMS)
        if hit:
            problems.append(f"{where}에 평가·감탄 표현이 있습니다({', '.join(hit)}) — 사실만 쓰세요")
    for where, text in body_texts:
        hit = biased_terms(text, BODY_EVAL_TERMS)
        if hit:
            problems.append(f"{where}에 평가 표현이 있습니다({', '.join(hit)})")
        hit = biased_terms(text, BODY_DIRECTIVE_TERMS)
        if hit:
            problems.append(f"{where}에 권유·지시 표현이 있습니다({', '.join(hit)})")
    return problems
