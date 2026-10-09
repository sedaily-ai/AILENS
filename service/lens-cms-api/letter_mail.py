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
            '<div style="max-width:640px;margin:0 auto;padding:28px 20px">'
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


AXIS = {"news": ("소식", "#1f56c0", "#eaf1fd"), "substance": ("실체", "#0b6b60", "#e5f5f2"), "other": ("다른 시각", "#8f4f0a", "#fdf1e2")}
SERIF = "'Noto Serif KR','Nanum Myeongjo','Apple SD Gothic Neo','Malgun Gothic',serif"


def _badge(axis: str) -> str:
    name, tone, soft = AXIS.get(axis, (axis, "#374151", "#f1f3f6"))
    return f'<span style="display:inline-block;padding:3px 10px;border-radius:999px;background:{soft};color:{tone};font-size:12.5px;font-weight:700">{html.escape(name)}</span>'


def _segments_html(parts: List[Any]) -> str:
    out = []
    for p in parts:
        if isinstance(p, str):
            out.append(html.escape(p))
        elif isinstance(p, dict) and p.get("href"):
            out.append(f'<a href="{html.escape(p["href"])}" style="color:#2f5fcf;text-decoration:underline;font-weight:600">{html.escape(p.get("text", ""))}</a>')
        elif isinstance(p, dict):
            out.append(html.escape(p.get("text", "")))
    return "".join(out)


def _segments_text(parts: List[Any]) -> str:
    return "".join(p if isinstance(p, str) else (f"{p.get('text', '')}({p['href']})" if p.get("href") else p.get("text", "")) for p in parts)


def render_letter(letter: Dict[str, Any], reason_text: str, unsubscribe_token: str) -> Tuple[str, str, str]:
    """레터 한 편을 사이트 상세 화면과 같은 순서·구성으로 메일에 담는다: 머리(분류·호수·제목·한 줄·주제·세 관점) → 쓰인 기사 → 1분 요약 → 세 섹션(핵심·본문·인라인 링크)
    → 에디터 한마디 → 투표(사이트로 연결). 메일에서는 투표를 받을 수 없어 사이트의 같은 레터로 안내한다."""
    unsub = unsubscribe_url(unsubscribe_token)
    url = f"{SITE_BASE}/letter/{letter['slug']}"
    subject = f"[AI LENS 레터] {letter['title']}"
    cats = " · ".join(letter.get("category_names") or [])
    topics = [t["name"] for t in letter.get("topics") or []]
    sections = letter.get("sections") or []
    axes_seen = []
    for s in sections:
        if s["axis"] not in axes_seen:
            axes_seen.append(s["axis"])
    day = (letter.get("published_at") or "")[:10].replace("-", ".")

    topic_html = "".join(f'<span style="display:inline-block;margin:0 6px 6px 0;padding:3px 10px;border-radius:999px;background:#f1f5f9;color:#334155;font-size:12.5px;font-weight:600">{html.escape(n)}</span>' for n in topics)
    axlist_html = "".join(f'<div style="margin:8px 0 0;font-size:15px;color:#374151">{_badge(s["axis"])} <span style="margin-left:6px">{html.escape(s.get("axis_label") or "")}</span></div>' for s in sections)

    src_rows = []
    for i, src in enumerate(letter.get("sources") or [], 1):
        title = html.escape(src.get("title") or "")
        link = f'<a href="{html.escape(src["url"])}" style="color:#1f2937;text-decoration:none;font-weight:600">{title}</a>' if src.get("url") else title
        ax = " ".join(_badge(a) for a in src.get("axes") or [])
        src_rows.append('<tr><td style="padding:10px 0;border-top:1px solid #edf0f5;vertical-align:top;width:30px"><span style="display:inline-block;width:22px;height:22px;line-height:22px;border-radius:11px;background:#e8edf7;color:#4b5d8a;font-size:12px;font-weight:700;text-align:center">'
                        f'{i}</span></td><td style="padding:10px 0;border-top:1px solid #edf0f5;font-size:14.5px;line-height:1.45">{link}<div style="margin-top:2px;font-size:12px;color:#6b7280">{html.escape(src.get("outlet") or "")}</div>'
                        f'<div style="margin-top:6px">{ax}</div></td></tr>')
    sources_html = ('<div style="margin:24px 0 0;padding:18px 20px 8px;border-radius:16px;background:#f8fafc;border:1px solid #edf0f5">'
                    f'<div style="font-size:14.5px;font-weight:700;color:#111827;margin-bottom:4px">이 레터에 쓰인 기사 <span style="font-size:12.5px;font-weight:600;color:#6b7280">{len(src_rows)}건</span></div>'
                    f'<table role="presentation" style="width:100%;border-collapse:collapse">{"".join(src_rows)}</table></div>') if src_rows else ""

    summary = [x for x in letter.get("summary") or [] if x]
    summary_html = ('<div style="margin:24px 0 0;padding:20px;border-radius:16px;background:#f4f8ff;border:1px solid #dbe6fb">'
                    '<div style="font-size:14.5px;font-weight:700;color:#1d3f8f">1분 요약</div>'
                    '<ol style="margin:12px 0 0;padding-left:22px;font-size:15px;line-height:1.7;color:#1f2937">'
                    + "".join(f'<li style="margin:0 0 8px">{html.escape(x)}</li>' for x in summary) + '</ol></div>') if summary else ""

    sec_html = []
    for s in sections:
        _, tone, _ = AXIS.get(s["axis"], ("", "#5b8def", ""))
        paras = "".join(f'<p style="margin:16px 0 0;font-size:16px;line-height:1.95;color:#1f2937">{_segments_html(p)}</p>' for p in s.get("paragraphs") or [])
        sec_html.append(f'<div style="margin-top:36px">{_badge(s["axis"])}'
                        f'<h2 style="margin:12px 0 0;font-family:{SERIF};font-size:21px;font-weight:700;line-height:1.4;color:#111827">{html.escape(s["heading"])}</h2>'
                        f'<p style="margin:10px 0 0;padding:10px 14px;border-left:3px solid {tone};background:#fafbfc;font-size:15px;font-weight:600;line-height:1.6;color:#1f2937">핵심: {html.escape(s["key_line"])}</p>'
                        f'{paras}</div>')

    note_html = ('<div style="margin-top:40px;padding:22px;border-radius:16px;background:#fff;border:1px solid #eceef2">'
                 '<div style="margin:0 0 8px;font-size:14px;font-weight:700;color:#6b7280">에디터 한마디</div>'
                 f'<div style="font-size:16px;line-height:1.85;color:#1f2937">{html.escape(letter["editor_note"])}</div></div>') if letter.get("editor_note") else ""

    poll = letter.get("poll")
    poll_html = ""
    if poll:
        opts = "".join(f'<a href="{html.escape(url)}#vote" style="display:block;margin:8px 0 0;padding:12px 16px;border:1px solid #dfe3ea;border-radius:12px;background:#fff;color:#111827;text-decoration:none;font-size:15px;font-weight:700">{html.escape(o["label"])}</a>' for o in poll["options"])
        poll_html = ('<div style="margin-top:24px;padding:22px;border-radius:16px;background:#f8fafc;border:1px solid #edf0f5">'
                     f'<div style="font-size:16px;font-weight:700;line-height:1.5;color:#111827">{html.escape(poll["question"])}</div>{opts}'
                     '<div style="margin-top:12px;font-size:12.5px;color:#6b7280">선택하면 사이트에서 투표가 반영돼요.</div></div>')

    reason_html = f'<div style="margin:0 0 14px;font-size:13px;color:#2563eb">{html.escape(reason_text)}</div>' if reason_text else ""
    body = (f'{reason_html}<div style="font-size:13.5px;font-weight:600;color:#6b7280">{html.escape(cats)} <span style="color:#9ca3af;font-weight:500">제 {int(letter["issue_no"])}호</span></div>'
            f'<h1 style="margin:12px 0 0;font-family:{SERIF};font-size:27px;font-weight:700;line-height:1.35;letter-spacing:-0.02em;color:#111827">{html.escape(letter["title"])}</h1>'
            f'<p style="margin:14px 0 0;font-size:16.5px;line-height:1.7;color:#4b5563">{html.escape(letter.get("deck") or "")}</p>'
            f'<div style="margin:12px 0 0">{topic_html}</div>{axlist_html}'
            f'<div style="margin-top:16px;font-size:13px;color:#6b7280">{day} · 약 {int(letter.get("read_minutes") or 0)}분 · AI LENS 편집팀</div>'
            f'{sources_html}{summary_html}{"".join(sec_html)}{note_html}{poll_html}'
            f'<div style="margin-top:28px"><a href="{html.escape(url)}" style="display:inline-block;padding:12px 20px;border-radius:10px;background:#111827;color:#fff;text-decoration:none;font-weight:700;font-size:15px">사이트에서 보기</a></div>'
            '<p style="margin:24px 0 0;font-size:12.5px;line-height:1.7;color:#6b7280">본 레터는 서울경제신문 AI LENS 기사를 바탕으로 작성됐어요. 투자 판단의 근거로 쓰기 전에 원문 기사를 확인하세요.</p>')

    lines = [f"{cats} 제 {int(letter['issue_no'])}호", letter["title"], letter.get("deck") or "", ""]
    if reason_text:
        lines.insert(0, reason_text)
    lines.append("[이 레터에 쓰인 기사]")
    lines += [f"{i}. {x.get('title')} {x.get('url') or ''}" for i, x in enumerate(letter.get("sources") or [], 1)]
    lines += ["", "[1분 요약]"] + [f"{i}. {x}" for i, x in enumerate(summary, 1)]
    for s in sections:
        lines += ["", f"[{AXIS.get(s['axis'], (s['axis'],))[0]}] {s['heading']}", f"핵심: {s['key_line']}"] + [_segments_text(p) for p in s.get("paragraphs") or []]
    if letter.get("editor_note"):
        lines += ["", "[에디터 한마디]", letter["editor_note"]]
    if poll:
        lines += ["", poll["question"], " / ".join(o["label"] for o in poll["options"]) + f"  (투표: {url})"]
    lines += ["", f"사이트에서 보기: {url}", f"수신거부: {unsub}"] + FOOTER_LINES
    return subject, _shell(subject, body, unsub), "\n".join(lines)


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
