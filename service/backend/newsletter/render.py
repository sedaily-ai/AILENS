"""레터 → HTML 이메일 렌더.

레터 dict 형태는 today_letters API 응답과 동일:
  {id, headline, subtitle, body[], key_points[], closing_line, ...}
톤: 온보딩과 같은 흰 배경·명조 제목·파란 버튼·담백한 해요체. 수신거부 푸터 필수.

모든 구독자에게 동일한 기본 아이덴티티로 렌더링한다(그룹별 분기 없음).
"""
from __future__ import annotations

import html
import re
from urllib.parse import quote
from typing import Any, Dict, List

from common.constants import SITE_URL

_DEFAULT_NAME = "AI LENS"
# service/frontend/src/app/globals.css의 온보딩 토큰과 맞춘 메일용 값.
# 메일은 외부 스타일시트와 CSS 변수에 의존하지 않고 인라인으로 전달한다.
_DEFAULT_ACCENT = "#2f5fcf"
_BASE = SITE_URL


def _esc(s: Any) -> str:
    return html.escape(str(s or ""))


def _utm(medium: str, campaign: str) -> str:
    """뉴스레터 → 사이트 유입 추적용 UTM 쿼리스트링.
    GA4 '획득' 리포트에서 source=newsletter 로 잡혀 SES 발송 효과 측정."""
    return f"utm_source=newsletter&utm_medium={medium}&utm_campaign={campaign}"


def _letter_url(letter_id: str, date_str: str, medium: str = "letter_link", article_path: Any = None) -> str:
    """프런트 정본 기사 경로만 허용한다. 외부 URL·쿼리·제어문자는 메일에 넣지 않는다."""
    if isinstance(article_path, str) and re.fullmatch(
        r"/[a-z-]+/\d{4}/\d{2}/\d{2}/[A-Za-z0-9_%~.!'()*-]+", article_path
    ):
        return f"{_BASE}{article_path}?{_utm(medium, date_str)}"
    if letter_id:
        return f"{_BASE}/letters/view?id={quote(str(letter_id), safe='')}&{_utm(medium, date_str)}"
    # 실제 레터 ID가 없을 때 날짜를 ID로 만들어 404 링크를 보내지 않는다.
    return _home_url(date_str, medium)


def _home_url(date_str: str, medium: str = "header") -> str:
    return f"{_BASE}/?{_utm(medium, date_str)}"


def subject(letter: Dict[str, Any], date_str: str) -> str:
    return f"[AI LENS] {date_str} · 최근 발행 기사 — {letter.get('headline','오늘의 레터')}"


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
                '<div style="margin:0 0 10px;padding:12px 14px;background:#f8f8f6;'
                'border-radius:10px">'
                f'<p style="margin:0 0 4px;font-size:16px;line-height:1.6;'
                f'font-weight:700;color:{accent}">Q. {_esc(q)}</p>'
                f'<p style="margin:0;font-size:16px;line-height:1.8;color:#374151">{_esc(a)}</p>'
                "</div>"
            )
        else:
            out.append(
                f'<p style="margin:0 0 14px;font-size:16px;line-height:1.8;'
                f'color:#374151">{_esc(line)}</p>'
            )
    return "".join(out)


def render_html(letter: Dict[str, Any], subscriber: Dict[str, Any], date_str: str) -> str:
    """600px 단일 열 이메일. 주요 레이아웃은 presentation table과 인라인 스타일을 쓴다."""
    accent = _DEFAULT_ACCENT
    letter_id = letter.get("id", "")
    body_paras = letter.get("body") or []
    kps = letter.get("key_points") or []
    unsub = (
        f"{_BASE}/unsubscribe?token={quote(str(subscriber.get('unsubscribe_token') or ''), safe='')}"
        f"&{_utm('unsubscribe', date_str)}"
    )
    web_view_url = _letter_url(letter_id, date_str, medium="web_view", article_path=letter.get("article_path"))
    home_url = _home_url(date_str, medium="header_logo")
    cta_url = _letter_url(letter_id, date_str, medium="cta_more", article_path=letter.get("article_path"))
    headline = str(letter.get("headline") or "최근 발행 기사")
    subtitle = str(letter.get("subtitle") or "").strip()
    # 온보딩이 보내는 요약 라벨은 안내 문장으로 한 번만 표시한다.
    is_summary = subtitle == "최근 발행 기사 요약"
    subtitle_html = (
        f'<p style="margin:14px 0 0;font-size:16px;line-height:1.7;color:#6b7280">{_esc(subtitle)}</p>'
        if subtitle and not is_summary else ""
    )
    preheader = next((str(p).strip() for p in body_paras if str(p).strip()), headline)[:140]
    paras = _render_body(body_paras, accent)
    kp_html = ""
    if kps:
        lis = "".join(f'<li style="margin:0 0 8px">{_esc(k)}</li>' for k in kps)
        kp_html = (
            '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" '
            'style="margin:24px 0 0;border-collapse:separate"><tr>'
            '<td bgcolor="#f8f8f6" style="padding:20px;border-radius:12px;background:#f8f8f6">'
            '<h2 style="margin:0 0 12px;font-size:16px;line-height:1.5;color:#111827">핵심 포인트</h2>'
            f'<ul style="margin:0;padding-left:20px;font-size:16px;line-height:1.8;color:#374151">{lis}</ul>'
            '</td></tr></table>'
        )
    closing = letter.get("closing_line")
    closing_html = (
        f'<p style="margin:24px 0 0;font-size:16px;line-height:1.8;color:#374151">{_esc(closing)}</p>'
        if closing else ""
    )
    summary_note = (
        '<p style="margin:0 0 16px;font-size:14px;line-height:1.7;color:#6b7280">'
        '기사 요약을 담았어요. 전체 이야기는 AI LENS에서 이어서 읽어 보세요.</p>'
        if is_summary else ""
    )

    return f"""<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>{_esc(headline)} | AI LENS</title>
  <style>
    a:focus-visible {{ outline:3px solid {accent}; outline-offset:3px; }}
    @media screen and (max-width: 480px) {{
      .mail-gutter {{ padding-left:20px !important; padding-right:20px !important; }}
      .mail-title {{ font-size:26px !important; }}
      .mail-outer {{ padding:0 !important; }}
    }}
  </style>
</head>
<body style="margin:0;padding:0;background:#ffffff;color:#111827;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;font-family:-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Malgun Gothic',Arial,sans-serif">
  <div aria-hidden="true" style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">{_esc(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="border-collapse:collapse;background:#ffffff">
    <tr><td align="center" class="mail-outer" style="padding:24px 12px">
      <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;table-layout:fixed;border-collapse:collapse;margin:0 auto;text-align:left;word-wrap:break-word;overflow-wrap:break-word">
        <tr><td class="mail-gutter" style="padding:28px 32px 24px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse"><tr>
            <td style="vertical-align:middle">
              <a href="{_esc(home_url)}" style="font-size:24px;line-height:32px;font-weight:800;letter-spacing:-1px;color:#111827;text-decoration:none">{_DEFAULT_NAME}</a>
            </td>
            <td align="right" style="vertical-align:middle">
              <a href="{_esc(web_view_url)}" style="display:inline-block;padding:10px 0;font-size:13px;line-height:24px;color:#6b7280;text-decoration:underline">웹에서 보기</a>
            </td>
          </tr></table>
          <p style="margin:12px 0 0;font-size:16px;line-height:1.7;color:#374151"><span style="border-bottom:3px solid #ffb020;padding-bottom:2px">당신의 일상에 맞춘 뉴스</span>를 준비했어요.</p>
        </td></tr>
        <tr><td class="mail-gutter" style="padding:0 32px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse"><tr><td style="border-top:1px solid #e5e7eb;font-size:1px;line-height:1px">&nbsp;</td></tr></table>
        </td></tr>
        <tr><td class="mail-gutter" style="padding:32px 32px 24px">
          <p style="margin:0 0 12px;font-size:13px;line-height:1.6;color:#6b7280">{_esc(date_str)} 발행</p>
          <h1 class="mail-title" style="margin:0;font-family:'Noto Serif KR','AppleMyungjo','Batang',Georgia,serif;font-size:30px;line-height:1.5;font-weight:700;letter-spacing:-0.7px;word-break:keep-all;overflow-wrap:break-word;color:#111827">{_esc(headline)}</h1>
          {subtitle_html}
        </td></tr>
        <tr><td class="mail-gutter" style="padding:0 32px;font-size:16px;line-height:1.8;color:#374151;word-break:keep-all;overflow-wrap:break-word">
          {paras}
          {kp_html}
          {closing_html}
        </td></tr>
        <tr><td class="mail-gutter" style="padding:24px 32px 36px">
          {summary_note}
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate"><tr>
            <td align="center" bgcolor="{accent}" style="border-radius:28px;background:{accent};mso-padding-alt:14px 24px">
              <a href="{_esc(cta_url)}" style="display:block;padding:14px 24px;border:1px solid {accent};border-radius:28px;font-size:16px;line-height:24px;font-weight:700;text-align:center;text-decoration:none;color:#ffffff;mso-padding-alt:0">전체 기사 읽기</a>
            </td>
          </tr></table>
        </td></tr>
        <tr><td class="mail-gutter" bgcolor="#f8f8f6" style="padding:24px 32px;background:#f8f8f6;border-radius:16px">
          <p style="margin:0 0 8px;font-size:14px;line-height:1.7;font-weight:700;color:#374151">서울경제신문이 만드는 AI LENS</p>
          <p style="margin:0;font-size:13px;line-height:1.8;color:#6b7280">뉴스레터 수신에 동의한 주소로 보내드렸어요.<br>더 이상 받고 싶지 않으면 아래 링크에서 해지할 수 있어요.</p>
          <a href="{_esc(unsub)}" style="display:inline-block;padding:12px 0;font-size:13px;line-height:20px;color:#374151;text-decoration:underline">수신거부</a>
        </td></tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td></tr>
  </table>
</body>
</html>"""
