"""CloudWatch custom metric emit helper.

Bedrock token usage 를 Lambda 별로 추적하기 위한 thin wrapper.
SCP 가 Cost Explorer 를 차단한 환경에서 application-level cost
proxy 로 사용. metric namespace 는 'sedaily-mbti/v2'.

Dimensions:
  - Lambda    — Lambda 함수명 (AWS_LAMBDA_FUNCTION_NAME env)
  - Model     — Bedrock model id (예: anthropic.claude-opus-4-6,
                amazon.titan-embed-text-v2)
  - TokenType — 'input' / 'output'

Metric name: BedrockTokens (count, sum aggregation).

비용 환산은 emit 시점에 안 함. CloudWatch dashboard 또는 별도
Lambda 에서 metric * pricing 으로 추정. 이렇게 분리하는 이유:
  - pricing 변경 시 emit 코드 수정 없이 dashboard 만 갱신
  - input/output token 비율이 model 마다 다른 가격이라 환산 분리가 깔끔
"""
from __future__ import annotations

import logging
import os

import boto3


logger = logging.getLogger(__name__)

_CW_NAMESPACE = "sedaily-mbti/v2"
_LAMBDA_FN = os.environ.get("AWS_LAMBDA_FUNCTION_NAME", "local")


_cw_client = None


def _get_cw_client():
    global _cw_client
    if _cw_client is None:
        _cw_client = boto3.client("cloudwatch")
    return _cw_client


def emit_bedrock_token_usage(
    model_id: str,
    input_tokens: int,
    output_tokens: int,
) -> None:
    """input/output token count 를 CloudWatch metric 으로 emit.

    실패 시 silent — application logic 을 막지 않음. 비용 추적은
    nice-to-have, 호출 실패는 본 작업을 깨뜨리면 안 됨.
    """
    try:
        cw = _get_cw_client()
        cw.put_metric_data(
            Namespace=_CW_NAMESPACE,
            MetricData=[
                {
                    "MetricName": "BedrockTokens",
                    "Dimensions": [
                        {"Name": "Lambda", "Value": _LAMBDA_FN},
                        {"Name": "Model", "Value": model_id},
                        {"Name": "TokenType", "Value": "input"},
                    ],
                    "Value": input_tokens,
                    "Unit": "Count",
                },
                {
                    "MetricName": "BedrockTokens",
                    "Dimensions": [
                        {"Name": "Lambda", "Value": _LAMBDA_FN},
                        {"Name": "Model", "Value": model_id},
                        {"Name": "TokenType", "Value": "output"},
                    ],
                    "Value": output_tokens,
                    "Unit": "Count",
                },
            ],
        )
    except Exception as exc:
        logger.warning(f"emit_bedrock_token_usage failed (non-fatal): {exc}")


def emit_count(
    metric_name: str,
    value: int,
    dimensions: dict | None = None,
    unit: str = "Count",
) -> None:
    """범용 count metric emit. Phase 4-A 의 CollectorPaperPass 등에 사용.

    실패 silent — application logic 막지 않음.
    Lambda 차원은 자동 추가되지 않음 (caller 가 명시 dimension 으로 넘김).
    """
    try:
        dim_list = [{"Name": k, "Value": str(v)} for k, v in (dimensions or {}).items()]
        _get_cw_client().put_metric_data(
            Namespace=_CW_NAMESPACE,
            MetricData=[{
                "MetricName": metric_name,
                "Dimensions": dim_list,
                "Value": value,
                "Unit": unit,
            }],
        )
    except Exception as exc:
        logger.warning(f"emit_count({metric_name!r}) failed (non-fatal): {exc}")


def parse_bedrock_response_tokens(response: dict) -> tuple:
    """Bedrock invoke_model 응답에서 token count 추출.

    응답 헤더 'x-amzn-bedrock-input-token-count' 와
    'x-amzn-bedrock-output-token-count' 사용. 헤더 없으면 (0, 0) 반환.

    embedding 모델 (Titan V2) 은 output token = 0 (vector 만 반환).
    """
    headers = response.get("ResponseMetadata", {}).get("HTTPHeaders", {})
    try:
        in_tok = int(headers.get("x-amzn-bedrock-input-token-count", "0"))
        out_tok = int(headers.get("x-amzn-bedrock-output-token-count", "0"))
        return in_tok, out_tok
    except (ValueError, TypeError):
        return 0, 0
