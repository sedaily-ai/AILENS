"""CloudWatch GetMetricStatistics wrapper."""

import datetime as dt
import os
from typing import Iterable

import boto3

REGION = os.environ.get("AWS_REGION", "us-east-1")
_client = boto3.client("cloudwatch", region_name=REGION)


def get_token_sum(
    *,
    namespace: str,
    metric_name: str,
    dimensions: Iterable[dict],
    days: int = 7,
    period_seconds: int = 86400,
) -> float:
    """주어진 dimension 조합의 days 일 Sum 합."""
    end = dt.datetime.now(dt.timezone.utc)
    start = end - dt.timedelta(days=days)
    resp = _client.get_metric_statistics(
        Namespace=namespace,
        MetricName=metric_name,
        Dimensions=list(dimensions),
        StartTime=start,
        EndTime=end,
        Period=period_seconds,
        Statistics=["Sum"],
    )
    return sum(point["Sum"] for point in resp.get("Datapoints", []))
