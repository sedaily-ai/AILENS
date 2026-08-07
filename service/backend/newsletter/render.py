"""레터 → HTML 이메일 렌더.

레터 dict 형태는 today_letters API 응답과 동일:
  {id, headline, subtitle, body[], key_points[], closing_line, ...}
톤: 활자·종이 (세리프 헤드라인, 절제, 이모지 없음). 수신거부 푸터 필수.

MBTI 페르소나 개념 폐기(2026-08)로 그룹별 에디터 이름/역할/액센트 컬러
분기는 없앴다 — 모든 구독자에게 동일한 기본 아이덴티티로 렌더링한다.
"""
from __future__ import annotations

import html
from typing import Any, Dict, List

_DEFAULT_NAME = "AI LENS"
_DEFAULT_ROLE = "오늘의 한 통"
_DEFAULT_ACCENT = "#3182F6"
_BASE = "https://ailens.sedaily.ai"


def _esc(s: Any) -> str:
    return html.escape(str(s or ""))


def _utm(medium: str, campaign: str) -> str:
    """뉴스레터 → 사이트 유입 추적용 UTM 쿼리스트링.
    GA4 '획득' 리포트에서 source=newsletter 로 잡혀 SES 발송 효과 측정."""
    return f"utm_source=newsletter&utm_medium={medium}&utm_campaign={campaign}"


def _letter_url(letter_id: str, date_str: str, medium: str = "letter_link") -> str:
    """레터 상세 링크 — `/letters/view?id=` 고정.

    `/letters/{id}` 정적 페이지는 배포 시점 최근 14일만 prerender 되므로
    (frontend letterHref.ts 와 같은 이유), 뉴스레터가 가리키는 링크는 날짜와
    무관하게 항상 동작하는 view 라우트를 쓴다. id 는 letter row 의 실제 id를
    그대로 쓴다 — letterHref.ts 는 어떤 id 형식이든 그대로 통과시킨다.
    """
    lid = letter_id or date_str
    return f"{_BASE}/letters/view?id={lid}&{_utm(medium, date_str)}"


def _home_url(date_str: str, medium: str = "header") -> str:
    return f"{_BASE}/?{_utm(medium, date_str)}"


def subject(letter: Dict[str, Any], date_str: str) -> str:
    return f"[AI LENS] {date_str} · 오늘의 한 통 — {letter.get('headline','오늘의 레터')}"


def _render_body(paras: List[str], accent: str) -> str:
    """레터 body 라인 배열 → 구조화된 HTML.

    editor-pick 이 만드는 body 라인은 세 가지 패턴:
      "■ 1. 섹션 제목"          → 섹션 헤더
      "Q. 질문? A. 답변"        → Q&A 블록
      그 외                     → 일반 문단
    """
    out: List[str] = []
    for raw in paras:
        line = str(raw or "").strip()
        if not line:
            continue
        if line.startswith("■"):
            head = line.lstrip("■").strip()
            out.append(
                f'<p style="margin:28px 0 12px;padding-left:10px;'
                f'border-left:3px solid {accent};font-size:16px;line-height:1.5;'
                f'color:#1a1a1a;font-weight:700">{_esc(head)}</p>'
            )
        elif line.startswith("Q.") and " A. " in line:
            q, a = line.split(" A. ", 1)
            q = q[2:].strip()
            out.append(
                '<div style="margin:0 0 10px;padding:12px 14px;background:#fafafa;'
                'border-radius:10px">'
                f'<p style="margin:0 0 4px;font-size:13.5px;line-height:1.6;'
                f'font-weight:700;color:{accent}">Q. {_esc(q)}</p>'
                f'<p style="margin:0;font-size:14px;line-height:1.75;color:#333">{_esc(a)}</p>'
                "</div>"
            )
        else:
            out.append(
                f'<p style="margin:0 0 14px;font-size:15px;line-height:1.85;'
                f'color:#333">{_esc(line)}</p>'
            )
    return "".join(out)


def render_html(letter: Dict[str, Any], subscriber: Dict[str, Any], date_str: str) -> str:
    name, role, accent = _DEFAULT_NAME, _DEFAULT_ROLE, _DEFAULT_ACCENT
    letter_id = letter.get("id", "")
    body_paras = letter.get("body") or []
    kps = letter.get("key_points") or []
    # 수신거부 링크 — UTM 같이 박아 어떤 발송분에서 이탈했는지 추적
    unsub = (
        f"{_BASE}/unsubscribe?token={_esc(subscriber.get('unsubscribe_token',''))}"
        f"&{_utm('unsubscribe', date_str)}"
    )
    web_view_url = _letter_url(letter_id, date_str, medium="web_view")
    home_url = _home_url(date_str, medium="header_logo")
    cta_url = _letter_url(letter_id, date_str, medium="cta_more")

    paras = _render_body(body_paras, accent)
    kp_html = ""
    if kps:
        lis = "".join(f'<li style="margin:0 0 6px">{_esc(k)}</li>' for k in kps)
        kp_html = (
            '<div style="margin:24px 0;padding:16px 18px;background:#faf8f3;'
            f'border-radius:10px"><p style="margin:0 0 8px;font-size:12px;'
            f'letter-spacing:.08em;color:{accent};font-weight:700">KEY POINTS</p>'
            f'<ul style="margin:0;padding-left:18px;font-size:13.5px;'
            f'line-height:1.7;color:#444">{lis}</ul></div>'
        )
    closing = letter.get("closing_line")
    closing_html = (
        f'<p style="margin:24px 0 0;font-size:15px;line-height:1.8;color:#1a1a1a;'
        f'font-style:italic">{_esc(closing)}</p>' if closing else ""
    )

    return f"""<!doctype html><html lang="ko"><body style="margin:0;background:#f4f2ec">
<div style="max-width:600px;margin:0 auto;background:#fff;padding:40px 32px 28px;
font-family:-apple-system,'Apple SD Gothic Neo','Noto Serif KR',serif">
  <p style="margin:0 0 12px;font-size:11px;color:#aaa;text-align:right">
    <a href="{web_view_url}" style="color:#888;text-decoration:underline">웹에서 보기 →</a>
  </p>
  <p style="margin:0 0 6px;font-size:11px;letter-spacing:.2em;color:#9ca3af;
  font-weight:700"><a href="{home_url}" style="color:#9ca3af;text-decoration:none">AI LENS</a> · {_esc(date_str)}</p>
  <p style="margin:0 0 20px;font-size:12px;color:{accent};font-weight:600">{_esc(name)} · {_esc(role)}</p>
  <h1 style="margin:0 0 10px;font-size:25px;line-height:1.35;letter-spacing:-.02em;
  color:#1a1a1a;font-weight:700">{_esc(letter.get('headline',''))}</h1>
  <p style="margin:0 0 28px;font-size:14px;line-height:1.7;color:#6b7280">{_esc(letter.get('subtitle',''))}</p>
  <hr style="border:none;border-top:1px solid #ececec;margin:0 0 24px">
  {paras}
  {kp_html}
  {closing_html}
  <div style="margin:32px 0 0;text-align:center">
    <a href="{cta_url}" style="display:inline-block;padding:12px 24px;
    background:{accent};color:#fff;text-decoration:none;border-radius:999px;
    font-size:13px;font-weight:700">AI LENS에서 다시 보기 →</a>
  </div>
  <div style="margin:36px 0 0;padding-top:20px;border-top:1px solid #ececec;
  font-size:11px;line-height:1.7;color:#aaa">
    <p style="margin:0 0 6px">AI LENS — 매일 아침, 오늘의 한 통. 서울경제</p>
    <p style="margin:0">더 받지 않으시려면 <a href="{unsub}" style="color:#888">수신거부</a>.</p>
  </div>
</div></body></html>"""
