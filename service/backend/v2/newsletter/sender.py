"""SES 발송 — dry-run 안전장치 + List-Unsubscribe 헤더(법적).

NEWSLETTER_DRY_RUN != "0" 이면 SES 미호출(로그만). 기본 dry-run.
실발송: SES 프로덕션 액세스 + 발신 도메인 DKIM 검증 후 DRY_RUN=0.
"""
from __future__ import annotations

import logging
import os
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any, Dict

logger = logging.getLogger(__name__)

FROM_ADDR = os.environ.get("NEWSLETTER_FROM", "AI LENS <letter@mbti.sedaily.ai>")
CONFIG_SET = os.environ.get("NEWSLETTER_CONFIG_SET", "ailens-newsletter")
SES_REGION = os.environ.get("SES_REGION", "us-east-1")


def _is_dry() -> bool:
    return os.environ.get("NEWSLETTER_DRY_RUN", "1") != "0"


def _build_raw(to_addr: str, subject: str, html_body: str, unsubscribe_url: str) -> bytes:
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = FROM_ADDR
    msg["To"] = to_addr
    # 1클릭 수신거부 (CAN-SPAM/RFC 8058)
    msg["List-Unsubscribe"] = f"<{unsubscribe_url}>"
    msg["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click"
    msg.attach(MIMEText("HTML 이메일입니다. 본문이 보이지 않으면 웹에서 확인하세요.", "plain", "utf-8"))
    msg.attach(MIMEText(html_body, "html", "utf-8"))
    return msg.as_bytes()


def send(to_addr: str, subject: str, html_body: str, unsubscribe_url: str) -> Dict[str, Any]:
    """단건 발송. dry-run이면 SES 미호출. 반환: {status, message_id?}."""
    if _is_dry():
        logger.info('{"event":"newsletter_dry_send","to":"%s","subject":"%s","bytes":%d}',
                    to_addr, subject[:60], len(html_body))
        return {"status": "dry_run", "to": to_addr}
    try:
        import boto3  # noqa: lazy

        ses = boto3.client("sesv2", region_name=SES_REGION)
        kwargs = {
            "FromEmailAddress": FROM_ADDR,
            "Destination": {"ToAddresses": [to_addr]},
            "Content": {"Raw": {"Data": _build_raw(to_addr, subject, html_body, unsubscribe_url)}},
        }
        if CONFIG_SET:  # config set 미생성 시 생략 (없는 set 지정하면 SES 실패)
            kwargs["ConfigurationSetName"] = CONFIG_SET
        resp = ses.send_email(**kwargs)
        mid = resp.get("MessageId")
        logger.info('{"event":"newsletter_sent","to":"%s","message_id":"%s"}', to_addr, mid)
        return {"status": "sent", "to": to_addr, "message_id": mid}
    except Exception as e:
        detail = str(e)
        code = ""
        resp = getattr(e, "response", None)
        if isinstance(resp, dict):
            code = (resp.get("Error") or {}).get("Code", "")
        logger.error(
            '{"event":"newsletter_send_error","to":"%s","err":"%s","code":"%s","detail":"%s"}',
            to_addr, type(e).__name__, code, detail[:300].replace('"', "'"),
        )
        return {"status": "error", "to": to_addr, "error": type(e).__name__, "code": code}
