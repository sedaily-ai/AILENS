"""뉴스레터 대시보드 데이터 — DDB 구독자 집계 + SES CloudWatch metrics.

GET /admin/newsletter/stats?days=7

응답 schema:
{
  "subscribers": {
    "total": int, "active": int,
    "recent": [{email(masked), status, created_at}]  // 최근 10건
  },
  "metrics": {
    "days": int,
    "send": int, "delivery": int, "open": int, "click": int,
    "bounce": int, "complaint": int,
    "open_rate": float, "click_rate": float
  }
}

2026-08: MBTI 페르소나 개념 폐기로 그룹별(by_group) 집계는 제거했다 — 이제
구독자는 그룹을 갖지 않는다. 기존 저장분에 남아있는 mbti_group 값은 그대로
두되(마이그레이션 없음), 이 대시보드는 더 이상 그 필드를 읽지 않는다.
"""
import logging

from repo import subscribers_repo
from shared import cw_client, response

logger = logging.getLogger(__name__)

SES_NAMESPACE = "AWS/SES"
MESSAGE_TAG_VALUE = "newsletter"


def _ses_sum(metric: str, days: int) -> int:
    try:
        total = cw_client.get_token_sum(
            namespace=SES_NAMESPACE,
            metric_name=metric,
            dimensions=[{"Name": "MessageTag", "Value": MESSAGE_TAG_VALUE}],
            days=days,
        )
    except Exception as e:  # noqa: BLE001
        # 지표 하나(예: Complaint)가 CW 조회 실패해도 나머지 지표는 그대로 응답해야
        # 한다 — 여기서 삼키지 않으면 handler.py 의 top-level catch-all 이 전체
        # 요청을 500으로 만든다.
        logger.warning(f"CW metric {metric} fetch fail: {e}")
        return 0
    return int(total)


def _mask_email(email: str) -> str:
    if not email or "@" not in email:
        return email or ""
    local, domain = email.split("@", 1)
    if len(local) <= 2:
        masked = local[0] + "*"
    else:
        masked = local[0] + "*" * (len(local) - 2) + local[-1]
    return f"{masked}@{domain}"


def handle_stats(body, path_params, query_params):
    qp = query_params or {}
    try:
        days = int(qp.get("days") or 7)
    except (TypeError, ValueError):
        days = 7
    days = max(1, min(days, 90))

    # 1. 구독자 — full scan (수가 적으니 OK, 1000+ 되면 GSI 또는 CW custom metric 으로 전환)
    try:
        items = subscribers_repo.list_all()
    except Exception as e:  # noqa: BLE001
        logger.exception(f"ddb scan fail: {e}")
        return response.err("subscribers scan failed", 500)

    active = [i for i in items if i.get("status") == "active"]
    recent = sorted(items, key=lambda i: i.get("created_at") or "", reverse=True)[:10]
    recent_payload = [
        {
            "email": _mask_email(r.get("email", "")),
            "status": r.get("status"),
            "created_at": r.get("created_at"),
        }
        for r in recent
    ]

    # 2. SES CloudWatch metrics
    metrics: dict = {
        "send": _ses_sum("Send", days),
        "delivery": _ses_sum("Delivery", days),
        "open": _ses_sum("Open", days),
        "click": _ses_sum("Click", days),
        "bounce": _ses_sum("Bounce", days),
        "complaint": _ses_sum("Complaint", days),
    }
    metrics["open_rate"] = round(
        (metrics["open"] / metrics["send"] * 100) if metrics["send"] else 0.0, 2
    )
    metrics["click_rate"] = round(
        (metrics["click"] / metrics["send"] * 100) if metrics["send"] else 0.0, 2
    )
    metrics["delivery_rate"] = round(
        (metrics["delivery"] / metrics["send"] * 100) if metrics["send"] else 0.0, 2
    )
    metrics["days"] = days

    return response.ok(
        {
            "subscribers": {
                "total": len(items),
                "active": len(active),
                "recent": recent_payload,
            },
            "metrics": metrics,
        }
    )
