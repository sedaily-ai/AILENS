"""Bedrock 토큰 → $ 추정 (7일 Sum).

namespace=`sedaily-mbti/v2`, metric=`BedrockTokens`, dimensions={Lambda, Model, TokenType}.
이번 라운드는 transform-dev 만 hardcode (정찰 결과). collector/selector 에서 token 발생 시 LAMBDAS 추가.

⚠️ application-level estimate. Provisioned Throughput / cross-region premium 등 제외 — lower bound.
"""

import logging

from shared import cw_client, response

logger = logging.getLogger(__name__)

NAMESPACE = "sedaily-mbti/v2"
METRIC = "BedrockTokens"

LAMBDAS: list[str] = [
    "sedaily-mbti-v2-transform-dev",
]

# Bedrock pricing — $/1M tokens (us-east-1, on-demand 기준)
MODELS: dict[str, dict] = {
    "us.anthropic.claude-opus-4-6-v1": {
        "alias": "opus-4-6",
        "input_per_1m": 15.0,
        "output_per_1m": 75.0,
        "has_output": True,
    },
    "amazon.titan-embed-text-v2:0": {
        "alias": "titan-v2",
        "input_per_1m": 0.02,
        "output_per_1m": 0.0,
        "has_output": False,
    },
}


def _alias(lambda_name: str) -> str:
    return lambda_name.replace("sedaily-mbti-v2-", "").replace("sedaily-mbti-", "")


def handle_summary(body: dict, path_params: dict, query_params: dict) -> dict:
    by_lambda: dict = {}
    total_usd = 0.0

    for lambda_name in LAMBDAS:
        lambda_alias = _alias(lambda_name)
        by_lambda[lambda_alias] = {}

        for model_id, info in MODELS.items():
            input_tokens = cw_client.get_token_sum(
                namespace=NAMESPACE,
                metric_name=METRIC,
                dimensions=[
                    {"Name": "Lambda", "Value": lambda_name},
                    {"Name": "Model", "Value": model_id},
                    {"Name": "TokenType", "Value": "input"},
                ],
                days=7,
            )
            output_tokens = 0.0
            if info["has_output"]:
                output_tokens = cw_client.get_token_sum(
                    namespace=NAMESPACE,
                    metric_name=METRIC,
                    dimensions=[
                        {"Name": "Lambda", "Value": lambda_name},
                        {"Name": "Model", "Value": model_id},
                        {"Name": "TokenType", "Value": "output"},
                    ],
                    days=7,
                )

            cost = (
                input_tokens * info["input_per_1m"] / 1_000_000
                + output_tokens * info["output_per_1m"] / 1_000_000
            )
            entry: dict = {
                "input_tokens": int(input_tokens),
                "cost_usd": round(cost, 4),
            }
            if info["has_output"]:
                entry["output_tokens"] = int(output_tokens)
            by_lambda[lambda_alias][info["alias"]] = entry
            total_usd += cost

    return response.ok({
        "by_lambda": by_lambda,
        "total_7d_usd": round(total_usd, 4),
        "note": "application-level estimate (excludes Provisioned Throughput, cross-region premium, data transfer)",
    })
