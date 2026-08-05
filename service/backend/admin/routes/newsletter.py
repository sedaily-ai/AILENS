"""뉴스레터 대시보드 데이터 — DDB 구독자 집계 + SES CloudWatch metrics.

GET /admin/newsletter/stats?days=7

응답 schema:
{
  "subscribers": {
    "total": int, "active": int,
    "by_group": {"NT": int, "NF": int, "ST": int, "SF": int},
    "recent": [{email(masked), mbti_group, status, created_at}]  // 최근 10건
  },
  "metrics": {
    "days": int,
    "send": int, "delivery": int, "open": int, "click": int,
    "bounce": int, "complaint": int,
    "open_rate": float, "click_rate": float
  }
}
"""
import datetime as dt
import logging
import os
from collections import Counter

import boto3

from shared import response

logger = logging.getLogger(__name__)

REGION = os.environ.get("AWS_REGION", "us-east-1")
SUBSCRIBERS_TABLE = os.environ.get(
    "NEWSLETTER_SUBSCRIBERS_TABLE", "sedaily-mbti-newsletter-subscribers-dev"
)
SES_NAMESPACE = "AWS/SES"
MESSAGE_TAG_VALUE = "newsletter"

_ddb = boto3.resource("dynamodb", region_name=REGION)
_cw = boto3.client("cloudwatch", region_name=REGION)


def _ses_sum(metric: str, days: int) -> int:
    end = dt.datetime.now(dt.timezone.utc)
    start = end - dt.timedelta(days=days)
    try:
        resp = _cw.get_metric_statistics(
            Namespace=SES_NAMESPACE,
            MetricName=metric,
            Dimensions=[{"Name": "MessageTag", "Value": MESSAGE_TAG_VALUE}],
            StartTime=start,
            EndTime=end,
            Period=86400,
            Statistics=["Sum"],
        )
    except Exception as e:  # noqa: BLE001
        logger.warning(f"CW metric {metric} fetch fail: {e}")
        return 0
    return int(sum(p.get("Sum", 0) for p in resp.get("Datapoints", [])))


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
    table = _ddb.Table(SUBSCRIBERS_TABLE)
    items: list[dict] = []
    last_key: dict | None = None
    while True:
        kwargs: dict = {
            "ProjectionExpression": "email, mbti_group, #s, created_at",
            "ExpressionAttributeNames": {"#s": "status"},
        }
        if last_key:
            kwargs["ExclusiveStartKey"] = last_key
        try:
            resp = table.scan(**kwargs)
        except Exception as e:  # noqa: BLE001
            logger.exception(f"ddb scan fail: {e}")
            return response.err("subscribers scan failed", 500)
        items.extend(resp.get("Items", []))
        last_key = resp.get("LastEvaluatedKey")
        if not last_key:
            break

    active = [i for i in items if i.get("status") == "active"]
    by_group_active = Counter(i.get("mbti_group", "?") for i in active)
    recent = sorted(items, key=lambda i: i.get("created_at") or "", reverse=True)[:10]
    recent_payload = [
        {
            "email": _mask_email(r.get("email", "")),
            "mbti_group": r.get("mbti_group"),
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
                "by_group": {g: by_group_active.get(g, 0) for g in ["NT", "NF", "ST", "SF"]},
                "recent": recent_payload,
            },
            "metrics": metrics,
        }
    )
