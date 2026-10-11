"""레터 원문(마크다운) 파서 — 제목·본문 문단·핵심 요약·용어를 뽑는다. 순수 함수만 둔다(네트워크·파일 접근 없음).

2026-10-12 publishing.py 에서 분리(리팩토링 6단계). 기존 호출(publishing.parse_letters 등)은 publishing 이 re-export 한다.
"""
from __future__ import annotations

import re

def parse_letters(raw_md: str) -> list[str]:
    """레터 산출물(마크다운)에서 본문 문단만 뽑는다.

    출력 순서는 [제목] → [리드] → [핵심 요약] → "## 소제목" 본문 → [용어]다.
    [제목]·[핵심 요약]은 skip 구간이며 "##"(또는 "◾") 소제목을 만나면 skip을 풀고
    본문 수집을 재개한다. [핵심 요약]을 영구 종료 신호로 보면 그 뒤 본문이 통째로
    유실된다. [용어] 블록은 본문이 아니므로 만나면 종료한다."""
    from text_utils import extract_fact_ids  # noqa: lazy — 호출부가 sys.path 세팅 완료 후 부름

    # FACT_IDS 트레일러를 먼저 뗀다. 이 함수엔 본문 종료 조건이 없어
    # 그대로 두면 커버리지 줄이 발행 본문 문단이 된다.
    raw_md, _ = extract_fact_ids(raw_md)
    body = re.sub(r"^```\w*\n|```$", "", raw_md.strip(), flags=re.MULTILINE).strip()
    lines = [l.strip() for l in body.split("\n") if l.strip()]
    paragraphs, buf, skipping = [], [], False

    def flush():
        if buf:
            t = " ".join(buf)
            if t:
                paragraphs.append(t)
        buf.clear()

    for line in lines:
        if line.startswith("[제목]"):
            skipping = True
            continue
        if line.startswith("[리드"):  # "[리드]"·"[리드 3~5문장]" 둘 다 매칭(아래 참고)
            skipping = False
            flush()
            rest = re.sub(r"^\[리드[^\]]*\]\s*", "", line)  # 운영 프롬프트(2026-10-08 압축판)는 "[리드] 본문"을 같은 줄에 쓴다
            if rest:
                buf.append(rest)
            continue
        if line.startswith("◾") or line.startswith("##"):
            # 소제목 줄은 별도 문단으로 살려 둔다. 프론트(LensFormatPanel)가
            # "◾"로 시작하는 문단을 소제목으로 구분해 보여준다("##"도 같은 역할).
            skipping = False
            flush()
            paragraphs.append(line)
            continue
        if line.startswith("자료:") or line == "—" or re.match(r"^[-–—]{1,3}\s*자료\s*[:：]", line):  # 압축판은 "-- 자료: …"로 쓴다
            skipping = False
            flush()
            continue
        # [핵심 요약]("30초 핵심" 전용 불릿)은 parse_letter_summary_bullets()가 따로 뽑으므로
        # 불릿 줄은 여기서 skip한다. 다음 "##"/"◾" 소제목에서 skip이 풀린다.
        if line.startswith("[핵심 요약]"):
            skipping = True
            flush()
            continue
        if line.startswith("[용어]"):
            flush()
            break
        if skipping:
            continue
        buf.append(line)
    flush()
    return paragraphs


_MAX_TITLE_CHARS = 60  # 프롬프트 지침은 15~30자 — 여유를 둔 안전 상한


def parse_letter_title(raw_md: str) -> str | None:
    """레터 산출물의 [제목] 블록에서 독자 시선 진입형 제목을 뽑는다
    (프롬프트 지침: "법은 강화됐습니다"가 아니라 "무효인 계약인데도 갚고 있다" 식, 15~30자).

    종료 조건은 parse_letters()와 같은 마커 집합([리드"로 시작, ◾, 자료:/—, [핵심 요약])이다.
    "[리드 3~5문장]" 같은 변형 헤더도 잡도록 "[리드"로 느슨하게 매칭한다.
    예상 밖 형식으로 새면 본문 전체가 제목이 되므로 길이 상한(_MAX_TITLE_CHARS)이 최후 방어선이다."""
    from text_utils import extract_fact_ids  # noqa: lazy — 호출부가 sys.path 세팅 완료 후 부름

    raw_md, _ = extract_fact_ids(raw_md)
    body = re.sub(r"^```\w*\n|```$", "", raw_md.strip(), flags=re.MULTILINE).strip()
    lines = [l.strip() for l in body.split("\n") if l.strip()]
    buf: list[str] = []
    in_block = False
    for line in lines:
        if line.startswith("[제목]"):
            in_block = True
            rest = line[len("[제목]"):].strip()  # 운영 프롬프트(2026-10-11 GEO 개정)는 "[제목] 제목 한 줄"처럼 같은 줄에 쓴다
            if rest:
                buf.append(rest)
            continue
        if line.startswith("[리드"):  # "[리드]"·"[리드 3~5문장]" 둘 다 매칭
            break
        if line.startswith("◾"):
            break
        if line.startswith("자료:") or line == "—":
            break
        if line.startswith("[핵심 요약]"):
            break
        if in_block:
            buf.append(line)
    title = " ".join(buf).strip()
    if len(title) > _MAX_TITLE_CHARS:
        title = title[:_MAX_TITLE_CHARS].rstrip()
    return title or None


_EMOJI_RE = re.compile(r"[\U0001F300-\U0001FAFF☀-➿⬀-⯿⌀-⏿]️?")


def extract_title_from_lead(paragraphs: list[str]) -> str | None:
    """parse_letter_title()이 실패했을 때의 2차 방어선 — 첫 문단에서 제목을 직접 뽑는다.

    모델이 [제목] 블록을 별도 줄로 쓰지 않고 리드 문장에 섞어 쓰는 경우가 있다.
    프롬프트 규칙상 제목은 이모지 1개로 끝나므로 첫 문단에서 첫 이모지까지 잘라 제목을 복원한다.
    이모지가 제목 맨 앞에 붙는 드문 경우를 막기 위해, 이모지를 제외한 글자가 2자 미만이면
    실패로 보고 None을 돌려준다(호출부가 원문 제목으로 폴백한다)."""
    if not paragraphs:
        return None
    p0 = paragraphs[0]
    m = _EMOJI_RE.search(p0)
    if not m:
        return None
    title = p0[: m.end()].strip()
    if len(_EMOJI_RE.sub("", title).strip()) < 2:
        return None
    if len(title) > _MAX_TITLE_CHARS:
        title = title[:_MAX_TITLE_CHARS].rstrip()
    return title or None


def parse_letter_summary_bullets(raw_md: str) -> list[str]:
    """레터 산출물의 [핵심 요약] 블록에서 "- "로 시작하는 불릿만 뽑는다.
    "30초 핵심" 카드가 이 불릿을 쓴다(lensSamples.ts의 coreSummaryBullets).
    블록이 없는 옛 산출물이면 빈 리스트를 돌려주고 "30초 핵심"은 다른 포맷으로 폴백한다.

    모델이 긴 불릿을 두 줄로 줄바꿈해 출력하는 경우가 있어, "-"로 시작하지 않는 줄은
    직전 불릿이 문장 종결로 끝나지 않았을 때에 한해 이어붙인다.
    "[용어]"와 "##"(본문 소제목)는 종료 마커다. 빠지면 본문 전체가 마지막 불릿에 붙는다."""
    from text_utils import extract_fact_ids  # noqa: lazy

    raw_md, _ = extract_fact_ids(raw_md)
    body = re.sub(r"^```\w*\n|```$", "", raw_md.strip(), flags=re.MULTILINE).strip()
    lines = [l.strip() for l in body.split("\n") if l.strip()]

    bullets, in_block = [], False
    for line in lines:
        if line.startswith("[핵심 요약]"):
            in_block = True
            continue
        if not in_block:
            continue
        # 종료 마커: [용어] 블록과 본문("## 소제목"). 없으면 뒤 줄들이 마지막 불릿에 이어붙는다.
        if line.startswith("[용어]") or line.startswith("##"):
            break
        if line.startswith("-"):
            bullets.append(line.lstrip("-").strip())
        elif bullets and not _ends_sentence(bullets[-1]):
            bullets[-1] = f"{bullets[-1]} {line}".strip()
        # else: 직전 불릿이 문장 종결로 끝났는데 "-" 없는 줄이 오면 줄바꿈 이어쓰기가 아니라
        # 불릿 블록과 "## 본문" 사이의 도입부 문단이다. 무시한다.
    if not bullets:  # 압축판 프롬프트: [핵심 요약] 아래에 "-" 없이 문장들이 한 문단으로 온다 → 문장 단위로 쪼갠다
        sents: list[str] = []
        in_block = False
        for line in lines:
            if line.startswith("[핵심 요약]"):
                in_block = True
                continue
            if not in_block:
                continue
            if line.startswith("[용어]") or line.startswith("##") or line.startswith("◾"):
                break
            if line.startswith("아래로 스크롤") or line.endswith("📖"):
                continue
            sents += [x.strip() for x in re.split(r"(?<=[다요]\.)\s+", line) if x.strip()]
        bullets = sents[:5]
    # "자료: 서울경제신문(...)" 출처 줄은 요약 불릿이 아니다. "자료를 공개한 의원은…" 같은
    # 정상 불릿을 지우지 않도록 콜론이 붙은 출처 줄만 제외한다.
    return [b for b in bullets if not re.match(r"^자료\s*[:：]", b)]


def _ends_sentence(text: str) -> bool:
    """불릿이 완결 문장으로 끝났는지. 따옴표·괄호 닫힘을 건너뛰고 마지막
    글자가 . ! ? 면 완결로 본다 — 모델이 긴 불릿을 두 줄로 나눌 때는
    문장 중간에서 끊기므로(이어붙이기 대상) 구분된다."""
    return text.rstrip(" \"'”’)」』]").endswith((".", "!", "?", "。"))


def parse_letter_terms(raw_md: str) -> list[dict]:
    """레터 산출물의 [용어] 블록에서 "용어 | 설명" 쌍을 뽑는다.

    lens.keywords로 전달되며 프론트(shared/ui/TermHighlight.tsx)가 본문에서 이 용어를
    찾아 하이라이트한다. 블록이 없는 옛 산출물이면 빈 리스트."""
    from text_utils import extract_fact_ids  # noqa: lazy

    raw_md, _ = extract_fact_ids(raw_md)
    body = re.sub(r"^```\w*\n|```$", "", raw_md.strip(), flags=re.MULTILINE).strip()
    lines = [l.strip() for l in body.split("\n") if l.strip()]

    terms: list[dict] = []
    in_block = False
    for line in lines:
        if line.startswith("[용어]"):
            in_block = True
            line = line[len("[용어]"):].strip()  # "[용어] 용어 | 설명"처럼 같은 줄에 올 수 있다
            if not line:
                continue
        if not in_block:
            continue
        if "|" not in line:
            continue
        term, _, explain = line.partition("|")
        term, explain = term.strip(), explain.strip()
        if term and explain:
            terms.append({"term": term, "explain": explain})
    return terms
