"""
뉴스레터 구독 신청 핸들러.

POST /api/newsletter/subscribe
body = {
  "email": "...",
  "consent": true,
  "format": "레터",              // 선택 — 온보딩(/start)에서 고른 포맷
  "interests": ["증권", "산업"],  // 선택 — 온보딩에서 고른 관심분야(정규화된 값,
                                  //         ["전체"] 포함 가능. features/onboarding/
                                  //         lib/resultCopy.ts의 normalizeInterests 참조)
  "letter": {            // 선택 — 있으면 즉시 그 레터를 메일로 발송
    "editor_name": "AI LENS",
    "editor_role": "오늘의 한 통",
    "accent": "#3182F6",
    "headline": "...",
    "subtitle": "...",
    "body": ["...", "..."],
    "key_points": ["..."],
    "closing_line": "..."
  }
}

흐름:
- 새 구독 → DDB put + 환영 + 첫 레터 즉시 발송
- 이미 구독자 → DDB update + 발송 안 함 (스팸 방지)
- 발송자: newsletter@mbti.sedaily.ai (SES verified domain)

2026-08: MBTI 페르소나 개념 폐기로 구독 시 그룹 선택을 받지 않는다 — 모든
구독자가 동일한 '오늘의 한 통'을 받는다. `letter` 페이로드는 여전히 프론트가
보여주고 있던 화면의 레터 내용을 그대로 실어 보낼 수 있다(그룹 무관).
기존 저장분에 남아있는 mbti_group 값은 그대로 두되(마이그레이션 없음),
이 핸들러는 더 이상 그 필드를 읽거나 쓰지 않는다.

2026-09: 신규 온보딩(/start, features/onboarding/) Phase 2 — 구독 시 고른
포맷/관심분야를 선택적으로 같이 저장한다. mbti_group과 달리 발행 로직에
아직 반영되지 않는다(모든 구독자가 여전히 같은 한 통을 받음) — 지금은
"누가 어떤 취향을 골랐는지" 기록만 하고, 그 값으로 실제 발송 콘텐츠를
가르는 건 별도 작업. DynamoDB가 스키마리스라 마이그레이션 없이 필드만
얹는다 — 두 필드 다 없어도(기존 구독자, 옛 프론트) 그대로 동작한다.
"""
import json
import logging
import os
import secrets
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import boto3
from botocore.exceptions import ClientError

from config.constants import CORS_HEADERS

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

_TABLE_NAME = os.environ.get('SUBSCRIBERS_TABLE', 'sedaily-mbti-newsletter-subscribers-dev')
_dynamodb = boto3.resource('dynamodb')
_ses = boto3.client('sesv2', region_name='us-east-1')
_EMAIL_RE = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')
_FROM = 'AI LENS <newsletter@mbti.sedaily.ai>'
# Configuration Set 미적용 시 Open/Click 추적 픽셀·링크 래핑 부재 → CloudWatch 메트릭 0.
# (sesv2 함정: 이름 안 넣으면 silent 로 set 밖 발송)
_CONFIG_SET = (os.environ.get('NEWSLETTER_CONFIG_SET') or 'ailens-newsletter').strip()
# VOC — 한 줄 의견 받는 곳. 추후 Google Form / Typeform URL 받으면 이 한 줄 교체.
# 환경변수 NEWSLETTER_VOC_LINK 가 우선, 없으면 mailto 폴백 (newsletter 받은편지함으로).
_VOC_LINK = (
    os.environ.get('NEWSLETTER_VOC_LINK')
    or 'mailto:newsletter@mbti.sedaily.ai?subject=AI%20LENS%20%ED%95%9C%20%EC%A4%84%20%EC%9D%98%EA%B2%AC'
)


def _resp(status: int, body: Dict[str, Any]) -> Dict[str, Any]:
    return {
        'statusCode': status,
        'headers': CORS_HEADERS,
        'body': json.dumps(body, ensure_ascii=False),
    }


def _esc(s: Optional[str]) -> str:
    if not s:
        return ''
    return (
        s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
    )


def _build_html(editor_name: str, editor_role: str, accent: str, headline: str,
                subtitle: str, body: List[str], key_points: List[str],
                closing_line: str, unsubscribe_token: str) -> str:
    paragraphs = ''.join(
        f'<p style="font-size:15px;line-height:1.85;color:#1f2937;margin:0 0 16px">{_esc(p)}</p>'
        for p in body
    )
    kp_html = ''
    if key_points:
        kp_items = ''.join(
            f'<li style="font-size:14px;color:#374151;line-height:1.7;margin-bottom:6px">{_esc(k)}</li>'
            for k in key_points
        )
        kp_html = (
            f'<div style="background:#f9fafb;border-radius:12px;padding:20px 24px;margin:24px 0">'
            f'<p style="font-size:11px;font-weight:600;color:#9ca3af;letter-spacing:1.2px;margin:0 0 12px;text-transform:uppercase">핵심 정리</p>'
            f'<ul style="margin:0;padding-left:20px">{kp_items}</ul>'
            f'</div>'
        )
    closing_html = ''
    if closing_line:
        closing_html = (
            f'<p style="font-size:16px;font-weight:500;color:{_esc(accent)};line-height:1.6;'
            f'margin:0 0 32px;padding-top:16px;border-top:1px solid #f3f4f6">→ {_esc(closing_line)}</p>'
        )
    unsub_url = f'https://ailens.sedaily.ai/?unsub={unsubscribe_token}'
    return f'''<!DOCTYPE html>
<html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Apple SD Gothic Neo','Noto Sans KR',sans-serif">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#f5f5f4;padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="640" style="max-width:640px;background:#ffffff;border-radius:20px;padding:40px 32px">
        <tr><td>
          <p style="font-size:11px;font-weight:700;color:{_esc(accent)};letter-spacing:0.18em;margin:0 0 8px">AI LENS · {_esc(editor_name)}</p>
          <p style="font-size:12px;color:#9ca3af;margin:0 0 16px">{_esc(editor_role)}</p>
          <h1 style="font-family:'Noto Serif KR',serif;font-size:26px;font-weight:700;color:#111827;letter-spacing:-0.02em;line-height:1.35;margin:0 0 12px">{_esc(headline)}</h1>
          <p style="font-size:15px;color:#6b7280;margin:0 0 28px;line-height:1.6">{_esc(subtitle)}</p>
          {paragraphs}
          {kp_html}
          {closing_html}
          <div style="margin-top:36px;padding:20px 24px;background:#fafafa;border-radius:14px">
            <p style="font-size:12.5px;color:#6b7280;line-height:1.7;margin:0">매일 아침, {_esc(editor_name)}의 한 통이 도착해요.<br>웹에서 전체 보기 → <a href="https://ailens.sedaily.ai" style="color:{_esc(accent)};text-decoration:none">mbti.sedaily.ai</a></p>
          </div>
          <div style="margin-top:24px;padding:20px 22px;border:1px solid #f1f1f0;border-radius:14px">
            <p style="font-size:13px;font-weight:700;color:#111827;margin:0 0 6px">이번 한 통은 어떠셨어요?</p>
            <p style="font-size:12.5px;color:#6b7280;line-height:1.7;margin:0 0 12px">한 줄 의견이 다음 한 통을 더 단단하게 만듭니다. 항상 감사합니다.</p>
            <a href="{_VOC_LINK}" style="display:inline-block;padding:9px 18px;background:#111827;color:#fff;font-size:12.5px;font-weight:700;border-radius:8px;text-decoration:none">한 줄 의견 보내기 →</a>
          </div>
        </td></tr>
      </table>
      <p style="font-size:11px;color:#9ca3af;margin:20px 0 0;line-height:1.6">AI LENS<br>이 메일은 mbti.sedaily.ai 에서 직접 구독을 신청해서 받으셨어요.<br><a href="{unsub_url}" style="color:#9ca3af">수신거부</a></p>
    </td></tr>
  </table>
</body></html>'''


def _send_letter_email(to_email: str, letter: Dict[str, Any],
                       unsubscribe_token: str) -> bool:
    """letter 객체 받아 SES 로 발송. 성공 시 True."""
    editor_name = letter.get('editor_name') or 'AI LENS'
    headline = letter.get('headline') or 'AI LENS 뉴스레터'
    html = _build_html(
        editor_name=editor_name,
        editor_role=letter.get('editor_role') or '',
        accent=letter.get('accent') or '#111827',
        headline=headline,
        subtitle=letter.get('subtitle') or '',
        body=letter.get('body') or [],
        key_points=letter.get('key_points') or [],
        closing_line=letter.get('closing_line') or '',
        unsubscribe_token=unsubscribe_token,
    )
    subject = f'[AI LENS] {headline}'
    try:
        kwargs = {
            'FromEmailAddress': _FROM,
            'Destination': {'ToAddresses': [to_email]},
            'Content': {
                'Simple': {
                    'Subject': {'Data': subject, 'Charset': 'UTF-8'},
                    'Body': {'Html': {'Data': html, 'Charset': 'UTF-8'}},
                }
            },
            # MessageTag dimension 'newsletter' — CloudWatch event destination 매칭용.
            # ailens-newsletter Config Set 의 DimensionConfigurations.DefaultDimensionValue 와 일치해야
            # 그 차원으로 메트릭이 집계되어 대시보드에서 노출됨.
            'EmailTags': [{'Name': 'MessageTag', 'Value': 'newsletter'}],
        }
        if _CONFIG_SET:
            kwargs['ConfigurationSetName'] = _CONFIG_SET
        _ses.send_email(**kwargs)
        logger.info(f"SES sent: to={to_email} subject={subject[:60]} config_set={_CONFIG_SET or '(none)'}")
        return True
    except ClientError as e:
        logger.exception(f"SES send fail: {e}")
        return False
    except Exception as e:
        logger.exception(f"SES send unexpected error: {e}")
        return False


def lambda_handler(event: dict, context) -> dict:
    method = event.get('httpMethod') or event.get('requestContext', {}).get('http', {}).get('method', 'POST')
    if method == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS_HEADERS, 'body': ''}

    try:
        body = json.loads(event.get('body') or '{}')
    except json.JSONDecodeError:
        return _resp(400, {'error': 'invalid JSON body'})

    email = (body.get('email') or '').strip().lower()
    consent = bool(body.get('consent'))

    if not email or not _EMAIL_RE.match(email):
        return _resp(400, {'error': '올바른 이메일 형식이 아닙니다.'})
    if not consent:
        return _resp(400, {'error': '뉴스레터 수신 동의가 필요합니다.'})

    # 온보딩(Phase 2) — 둘 다 선택. 잘못된 타입이 오면 그냥 무시(400으로
    # 막지 않는다 — 구독 자체가 이 값들보다 중요하다).
    raw_format = body.get('format')
    onboarding_format = raw_format.strip() if isinstance(raw_format, str) and raw_format.strip() else None

    raw_interests = body.get('interests')
    onboarding_interests = (
        [i.strip() for i in raw_interests if isinstance(i, str) and i.strip()]
        if isinstance(raw_interests, list)
        else None
    ) or None

    now = datetime.now(timezone.utc).isoformat()
    table = _dynamodb.Table(_TABLE_NAME)

    try:
        existing = table.get_item(Key={'email': email}).get('Item')
    except ClientError as e:
        logger.exception(f"ddb get_item fail: {e}")
        return _resp(500, {'error': 'subscriber lookup failed'})

    resubscribed = bool(existing)
    if resubscribed:
        # 기존 구독자 → status active 복원. format/interests는 이번 요청에
        # 값이 있을 때만 덮어쓴다 — 옛 프론트로 재구독하면(값 없음) 이전에
        # 저장된 온보딩 선택을 지우지 않는다.
        token = existing.get('unsubscribe_token') or secrets.token_urlsafe(24)
        update_parts = ['#s = :a', 'updated_at = :u', 'unsubscribe_token = :t']
        expr_values: Dict[str, Any] = {':a': 'active', ':u': now, ':t': token}
        if onboarding_format:
            update_parts.append('onboarding_format = :f')
            expr_values[':f'] = onboarding_format
        if onboarding_interests:
            update_parts.append('onboarding_interests = :i')
            expr_values[':i'] = onboarding_interests
        try:
            table.update_item(
                Key={'email': email},
                UpdateExpression='SET ' + ', '.join(update_parts),
                ExpressionAttributeNames={'#s': 'status'},
                ExpressionAttributeValues=expr_values,
            )
        except ClientError as e:
            logger.exception(f"ddb update_item fail: {e}")
            return _resp(500, {'error': 'subscriber update failed'})
    else:
        # 신규 구독
        token = secrets.token_urlsafe(24)
        item: Dict[str, Any] = {
            'email': email,
            'status': 'active',
            'unsubscribe_token': token,
            'consent_at': now,
            'created_at': now,
            'updated_at': now,
        }
        if onboarding_format:
            item['onboarding_format'] = onboarding_format
        if onboarding_interests:
            item['onboarding_interests'] = onboarding_interests
        try:
            table.put_item(Item=item)
        except ClientError as e:
            logger.exception(f"ddb put_item fail: {e}")
            return _resp(500, {'error': 'subscriber create failed'})

    # 즉시 그 페이지 레터 발송 — 신규/재구독 무관하게 letter 객체 있으면 발송
    # (사용자 의도: "구독하기 누르면 그 페이지 레터가 바로 메일로")
    letter = body.get('letter') or {}
    sent = False
    if letter and letter.get('headline'):
        sent = _send_letter_email(email, letter, token)

    logger.info(f"newsletter subscribe: {email} resub={resubscribed} sent={sent}")
    return _resp(200, {
        'ok': True,
        'resubscribed': resubscribed,
        'email': email,
        'sent': sent,
    })
