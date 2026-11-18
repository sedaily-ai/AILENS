"""유튜브 설명글 — 마케팅팀 SEO·GEO 템플릿(김세현, 2026-11-17 작업 결과 "7. 자동화용 프롬프트") 자동 적용 (2026-11-18).

템플릿 프롬프트를 문구 그대로 쓰고, 사람이 채우던 Input 5칸(형식·제목·날짜·대본·기사 목록)을 코드가 채운다.
템플릿에 없는 두 가지는 코드가 덧붙인다: 롱폼 챕터(Key points 아래), 투자 그룹의 투자 고지(About AI PRISM 위).

안전장치 — 결과에 (1) 대본·기사에 없는 숫자 (2) 입력에 없는 URL (3) 필수 문단 누락이 있으면 None을 돌려주고,
호출한 쪽(prism_batch)이 기존 설명글(youtube_upload.v2_description)로 대신 올린다.
"""
from __future__ import annotations

import re
from typing import Callable

TEMPLATE_PROMPT = """You write YouTube descriptions for Seoul Economic Daily's English channel
(AI PRISM series). Write one description from the input below, following
this structure exactly.

Structure:
1. Opening summary: 1-2 sentences. Put the 1-2 main keywords in the first
   sentence. For long-form, end with the date, e.g. "(Nov 17, 2026 episode)".
   It must make sense on its own.
2. "Key points": 3 bullets for long-form, 2 for Shorts. One short sentence
   each, with concrete facts.
3. "Source articles (Seoul Economic Daily, DATE)": one line per article,
   formatted "Article title: URL". If a URL is missing, write the title only.
4. "About AI PRISM": use the fixed text below.
5. "More Korean business news: https://en.sedaily.com"
6. Exactly 5 hashtags: specific topics, companies or countries. No #Shorts,
   no brand tags, no generic tags.

Rules:
- Use only facts in the input. Never add numbers, names or claims.
- Keep numbers and proper nouns exactly as given.
- Plain, clear English. No clickbait, no emojis.
- No brackets around URLs.
- Output only the description, nothing else.

Fixed text for "About AI PRISM":
AI PRISM is Seoul Economic Daily's WAN-IFRA award-winning newsroom AI series,
delivering Korean economic news adapted for global audiences. Episodes are
produced with AI assistance."""

# 자동화에서 덧붙이는 입력 안내 — 기사 원문 제목이 한국어라, 영어 출처 목록과 짝지어 영어 제목을 쓰게 한다.
_AUTOMATION_NOTE = """
Automation note: "Source articles (title + URL)" lists the original Korean headlines with their URLs.
"English source titles" are the English titles of the same articles. In the description, write each
article with its English title and the URL of the matching Korean article. If you cannot match one
with confidence, write the English title only (no URL)."""

INVEST_NOTE = "This video is for information only and is not investment advice."
_ABOUT = "About AI PRISM"
_NUM = re.compile(r"\d[\d,]*(?:\.\d+)?")
_URL = re.compile(r"https?://\S+")


def articles_from_input(article_text: str) -> list[tuple[str, str]]:
    """입력 기사 파일(제목:/URL: 줄) → [(제목, URL)]."""
    out: list[tuple[str, str]] = []
    title = ""
    for line in article_text.splitlines():
        if line.startswith("제목:"):
            title = line[3:].strip()
        elif line.startswith("URL:") and title:
            out.append((title, line[4:].strip()))
            title = ""
    return out


def english_sources(script_text: str) -> list[str]:
    block = script_text[script_text.find("Block D"):] if "Block D" in script_text else script_text
    m = re.search(r"Sources:\s*\n(.*?)(?:\n\s*\n|About AI PRISM)", block, re.S)
    return [ln.strip("- ").strip() for ln in (m.group(1).splitlines() if m else []) if ln.strip()]


def _numbers(text: str) -> set[str]:
    return {n.replace(",", "") for n in _NUM.findall(text)}


def _check(desc: str, script_text: str, article_text: str, urls: set[str]) -> list[str]:
    problems = []
    known = _numbers(script_text) | _numbers(article_text)
    body = _URL.sub("", desc)
    for n in _numbers(body):
        if n not in known and not re.fullmatch(r"20\d\d|[1-9]|1[0-2]|[12]\d|3[01]", n):  # 연도·날짜 숫자는 허용
            problems.append(f"입력에 없는 숫자 {n}")
    for u in _URL.findall(desc):
        u = u.rstrip(").,")
        if u not in urls and u != "https://en.sedaily.com":
            problems.append(f"입력에 없는 URL {u}")
    for must in ("Key points", "Source articles", _ABOUT, "https://en.sedaily.com"):
        if must not in desc:
            problems.append(f"'{must}' 문단 없음")
    if len(re.findall(r"(?<!\w)#\w+", desc)) < 3:
        problems.append("해시태그 부족")
    return problems


def _tokens(title: str) -> set[str]:
    """제목 대조용 — 숫자와 2자 이상 영문 단어(AI, ETF, Nvidia 등)."""
    return _numbers(title) | {w.lower() for w in re.findall(r"[A-Za-z]{2,}", title)}


_STOP = {"the", "and", "as", "of", "in", "to", "for", "on", "at", "by", "with", "won", "korea", "korean", "seoul"}


def verify_source_links(desc: str, arts: list[tuple[str, str]]) -> tuple[str, list[str]]:
    """'영어 제목: URL' 줄마다 그 URL의 한국어 원제목과 공통 숫자·영문 단어가 있는지 본다. 없으면 URL을 지우고 제목만 남긴다.
    (2026-11-18 시험에서 AI가 다른 기사 URL을 붙임 — '입력에 있는 URL인가'만으로는 못 거른다)"""
    by_url = {u: t for t, u in arts}
    dropped: list[str] = []
    out = []
    for line in desc.split("\n"):
        m = re.match(r"^(\s*-?\s*)(.+?):\s+(https?://\S+)\s*$", line)
        if m and m.group(3) in by_url:
            en, ko = m.group(2), by_url[m.group(3)]
            if not ((_tokens(en) - _STOP) & (_tokens(ko) - _STOP)):
                dropped.append(f"{en} ↛ {ko}")
                line = f"{m.group(1)}{en}"
        out.append(line)
    return "\n".join(out), dropped


def _insert_after_key_points(desc: str, text: str) -> str:
    parts = desc.split("\n\n")
    for i, p in enumerate(parts):
        if p.lstrip().startswith("Key points"):
            parts.insert(i + 1, text)
            return "\n\n".join(parts)
    return desc + "\n\n" + text


def _shorts_fix(desc: str) -> str:
    """템플릿 규칙을 코드로 강제 — 쇼츠는 Key points 2개, 날짜 꼬리("(… episode)")는 롱폼만."""
    desc = re.sub(r"\s*\([A-Z][a-z]{2} \d{1,2}, 20\d\d episode\)", "", desc, count=1)
    out, in_kp, n = [], False, 0
    for line in desc.split("\n"):
        if line.lstrip().startswith("Key points"):
            in_kp, n = True, 0
        elif in_kp and line.lstrip().startswith("-"):
            n += 1
            if n > 2:
                continue
        elif in_kp and not line.strip():
            in_kp = False
        out.append(line)
    return "\n".join(out)


def build(call: Callable[[str, str], str], *, shorts: bool, title: str, date_label: str, script_text: str,
          article_text: str, chapters: str = "", investment: bool = False) -> tuple[str | None, list[str]]:
    """(설명글, 문제 목록). 문제가 있으면 설명글은 None. call(system, user) → 모델 응답 텍스트."""
    arts = articles_from_input(article_text)
    urls = {u for _, u in arts}
    user = TEMPLATE_PROMPT + "\n" + _AUTOMATION_NOTE + "\n\nInput:\n" + "\n".join([
        f"- Format: {'Shorts' if shorts else 'Long-form'}",
        f"- Video title: {title}",
        f"- Date: {date_label}",
        "- Script or summary:\n" + script_text.split("Block D")[0].strip(),
        "- Source articles (title + URL):\n" + "\n".join(f"  - {t}: {u}" for t, u in arts),
        "- English source titles:\n" + "\n".join(f"  - {t}" for t in english_sources(script_text)),
    ])
    desc = call("Follow the instructions exactly. Output only the description.", user).strip()
    desc = desc.strip("`").strip()
    problems = _check(desc, script_text, article_text, urls)
    if problems:
        return None, problems
    desc, dropped = verify_source_links(desc, arts)
    if dropped:
        print(f"[seo_description] 짝이 확실하지 않아 URL 뺌: {dropped}")
    if shorts:
        desc = _shorts_fix(desc)
    if chapters and not shorts:
        desc = _insert_after_key_points(desc, chapters)
    if investment:
        desc = desc.replace(_ABOUT, INVEST_NOTE + "\n\n" + _ABOUT, 1)
    desc = desc.replace("<", "").replace(">", "")
    return desc[:4900], []
