"""Cost-1b — CloudWatch metric helper tests.

Verifies parse + emit primitives only. Real CloudWatch put_metric_data
is not exercised; the helper's lazy boto3 client is mocked.
"""
from unittest.mock import MagicMock, patch

from v2.clients.cloudwatch_metrics import (
    emit_bedrock_token_usage,
    parse_bedrock_response_tokens,
)


def test_v2_3_8_parse_extracts_token_headers():
    response = {
        "ResponseMetadata": {
            "HTTPHeaders": {
                "x-amzn-bedrock-input-token-count": "100",
                "x-amzn-bedrock-output-token-count": "50",
            }
        }
    }
    assert parse_bedrock_response_tokens(response) == (100, 50)


def test_v2_3_8_parse_missing_headers_returns_zeros():
    assert parse_bedrock_response_tokens({}) == (0, 0)
    assert parse_bedrock_response_tokens({"ResponseMetadata": {}}) == (0, 0)


def test_v2_3_8_parse_invalid_value_returns_zeros():
    response = {
        "ResponseMetadata": {
            "HTTPHeaders": {"x-amzn-bedrock-input-token-count": "not-a-number"}
        }
    }
    assert parse_bedrock_response_tokens(response) == (0, 0)


def test_v2_3_8_emit_calls_put_metric_data():
    with patch("v2.clients.cloudwatch_metrics._get_cw_client") as mock_get:
        cw = MagicMock()
        mock_get.return_value = cw
        emit_bedrock_token_usage("test-model", 100, 50)

        assert cw.put_metric_data.called
        kwargs = cw.put_metric_data.call_args.kwargs
        assert kwargs["Namespace"] == "sedaily-mbti/v2"
        assert len(kwargs["MetricData"]) == 2
        names = [d["MetricName"] for d in kwargs["MetricData"]]
        assert all(n == "BedrockTokens" for n in names)


def test_v2_3_8_emit_swallows_exception():
    """CloudWatch 호출 실패 시 application 흐름 차단 안 함."""
    with patch("v2.clients.cloudwatch_metrics._get_cw_client") as mock_get:
        cw = MagicMock()
        cw.put_metric_data.side_effect = Exception("CloudWatch error")
        mock_get.return_value = cw

        emit_bedrock_token_usage("test-model", 100, 50)
