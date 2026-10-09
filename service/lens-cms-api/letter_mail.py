"""레터 이메일 — 문안 만들기(순수 함수)와 발송. 설계: docs/architecture/lens-erd-src/19-독자관심-구독-설계.md (Phase 2).

- 발송은 환경변수 LETTER_MAIL_ENABLED=1 과 LETTER_MAIL_FROM 이 모두 있을 때만 SES 로 나간다. 아니면 로그만 남기는 드라이런이다(로컬·테스트 기본값).
- 문안은 중립 원칙을 따른다: 레터 제목·한 줄 요약·"왜 담겼는지(겹친 주제·분야 이름)"만 담고, 권유·감정 표현을 넣지 않는다.
- 모든 메일에 수신거부 링크와 발신자 표기를 넣는다(광고성 정보 전송 기준).
"""
from __future__ import annotations

import html
import logging
import os
from typing import Any, Dict, List, Optional, Tuple

log = logging.getLogger("letter_mail")

SITE_BASE = os.environ.get("LETTER_SITE_BASE", "https://ailens.sedaily.ai").rstrip("/")
SENDER_NAME = "AI LENS 레터"
FOOTER_LINES = ["서울경제신문 AI LENS", "서울특별시 종로구 율곡로 6 트윈트리타워 B동 14~16층"]


def confirm_url(token: str) -> str:
    return f"{SITE_BASE}/letter/subscribe/confirm?token={token}"


def unsubscribe_url(token: str) -> str:
    return f"{SITE_BASE}/letter/unsubscribe?token={token}"


def _shell(title: str, body_html: str, unsub: Optional[str]) -> str:
    foot = "<br>".join(html.escape(x) for x in FOOTER_LINES)
    unsub_html = f'<p style="margin:12px 0 0"><a href="{html.escape(unsub)}" style="color:#6b7280">수신거부</a></p>' if unsub else ""
    return (f'<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>{html.escape(title)}</title></head>'
            '<body style="margin:0;background:#f6f7f9;font-family:-apple-system,\'Apple SD Gothic Neo\',\'Malgun Gothic\',sans-serif;color:#111827">'
            '<div style="max-width:560px;margin:0 auto;padding:28px 20px">'
            f'<div style="font-size:13px;font-weight:700;color:#5b8def;letter-spacing:.04em">{SENDER_NAME}</div>'
            f'{body_html}'
            f'<div style="margin-top:28px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:12px;line-height:1.6;color:#6b7280">{foot}{unsub_html}</div>'
            '</div></body></html>')


def render_confirm(token: str) -> Tuple[str, str, str]:
    url = confirm_url(token)
    subject = "[AI LENS 레터] 메일 받기 확인"
    body = ('<h1 style="font-size:20px;line-height:1.4;margin:10px 0 12px">메일 받기를 확인해 주세요</h1>'
            '<p style="font-size:15px;line-height:1.7;margin:0 0 18px">AI LENS 레터 메일 받기를 신청하셨어요. 아래 버튼을 누르면 신청이 완료돼요. 직접 신청하지 않으셨다면 이 메일을 무시해 주세요. 확인하지 않으면 메일은 발송되지 않아요.</p>'
            f'<a href="{html.escape(url)}" style="display:inline-block;padding:12px 20px;border-radius:10px;background:#111827;color:#fff;text-decoration:none;font-weight:700;font-size:15px">신청 확인하기</a>')
    text = f"AI LENS 레터 메일 받기를 신청하셨어요. 아래 주소를 열면 신청이 완료돼요. 직접 신청하지 않으셨다면 이 메일을 무시해 주세요.\n\n{url}\n\n" + "\n".join(FOOTER_LINES)
    return subject, _shell(subject, body, None), text


def render_digest(letters: List[Dict[str, Any]], kind: str, unsubscribe_token: str) -> Tuple[str, str, str]:
    """letters: [{slug, issue_no, title, deck, reason_text}] — 이미 점수순. 제목은 첫 레터 제목과 나머지 개수만 쓴다."""
    unsub = unsubscribe_url(unsubscribe_token)
    label = "이번 주" if kind == "weekly" else "새로"
    extra = f" 외 {len(letters) - 1}편" if len(letters) > 1 else ""
    subject = f"[AI LENS 레터] {letters[0]['title']}{extra}"
    cards, lines = [], []
    for l in letters:
        url = f"{SITE_BASE}/letter/{l['slug']}"
        cards.append('<div style="margin:0 0 14px;padding:18px;border:1px solid #e5e7eb;border-radius:12px;background:#fff">'
                     f'<div style="font-size:12px;color:#6b7280;margin-bottom:6px">제 {int(l["issue_no"])}호</div>'
                     f'<a href="{html.escape(url)}" style="font-size:17px;font-weight:700;line-height:1.45;color:#111827;text-decoration:none">{html.escape(l["title"])}</a>'
                     f'<p style="font-size:14px;line-height:1.65;color:#374151;margin:8px 0 6px">{html.escape(l.get("deck") or "")}</p>'
                     f'<div style="font-size:12.5px;color:#2563eb">{html.escape(l.get("reason_text") or "")}</div></div>')
        lines.append(f"- 제 {int(l['issue_no'])}호 {l['title']}\n  {l.get('deck') or ''}\n  {l.get('reason_text') or ''}\n  {url}")
    body = (f'<h1 style="font-size:20px;line-height:1.4;margin:10px 0 16px">{label} 발행된 레터 {len(letters)}편</h1>'
            '<p style="font-size:13.5px;line-height:1.6;color:#6b7280;margin:0 0 18px">선택하신 관심 분야·주제와 겹치는 레터예요.</p>' + "".join(cards))
    text = f"{label} 발행된 레터 {len(letters)}편 (선택하신 관심 분야·주제와 겹치는 레터예요)\n\n" + "\n".join(lines) + f"\n\n수신거부: {unsub}\n" + "\n".join(FOOTER_LINES)
    return subject, _shell(subject, body, unsub), text


def mail_enabled() -> bool:
    return os.environ.get("LETTER_MAIL_ENABLED") == "1" and bool(os.environ.get("LETTER_MAIL_FROM"))


def mail_available() -> bool:
    """신청을 받아도 되는 상태인가. 발송 설정이 꺼져 있으면(드라이런 허용 LETTER_MAIL_DRYRUN=1 인 로컬·테스트 제외) 확인 메일이 나갈 수 없으므로 신청을 받지 않는다."""
    return mail_enabled() or os.environ.get("LETTER_MAIL_DRYRUN") == "1"


def send_mail(to: str, subject: str, html_body: str, text_body: str, unsubscribe: Optional[str] = None) -> Optional[str]:
    """SES 로 보내고 message id 를 돌려준다. 발송 설정이 꺼져 있으면 보내지 않고 None(드라이런)."""
    if not mail_enabled():
        log.info("letter_mail dry-run: to=%s subject=%s", to, subject)
        return None
    import boto3  # 늦게 불러온다 — 드라이런·테스트에서는 필요 없다

    headers = []
    if unsubscribe:
        headers = [{"Name": "List-Unsubscribe", "Value": f"<{unsubscribe}>"}, {"Name": "List-Unsubscribe-Post", "Value": "List-Unsubscribe=One-Click"}]
    client = boto3.client("sesv2", region_name=os.environ.get("LETTER_MAIL_REGION", "us-east-1"))
    kwargs: Dict[str, Any] = {}
    if os.environ.get("LETTER_MAIL_CONFIG_SET"):
        kwargs["ConfigurationSetName"] = os.environ["LETTER_MAIL_CONFIG_SET"]
    res = client.send_email(
        FromEmailAddress=f"{SENDER_NAME} <{os.environ['LETTER_MAIL_FROM']}>",
        Destination={"ToAddresses": [to]},
        Content={"Simple": {"Subject": {"Data": subject, "Charset": "UTF-8"},
                            "Body": {"Html": {"Data": html_body, "Charset": "UTF-8"}, "Text": {"Data": text_body, "Charset": "UTF-8"}},
                            "Headers": headers}},
        **kwargs)
    return res.get("MessageId")
