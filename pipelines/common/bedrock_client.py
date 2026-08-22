"""AWS Bedrock(Claude) 호출 — `pipelines/` 공용.

2026-08-22: video 파이프라인(`generate_script.py`)의 각본 생성을 GPT에서
Bedrock Claude로 이관하며 신설. `openai_client.call_text()`와 동일한
시그니처를 맞춰서 호출부는 import만 바꾸면 되도록 했다("GPT는 이미지
생성 전용으로만 쓴다"는 결정 — webtoon의 image_generation 툴 호출은
그대로 openai_client에 남는다).

전용 application inference profile `mbti-video-sonnet-46`
(arn:aws:bedrock:us-east-1:887078546492:application-inference-profile/yeypch70w7ej,
Sonnet 4.6, Service=mbti·Workload=video-script 태그)을 새로 만들어 썼다 —
기존 `mbti-sonnet-46`은 Workload=chatbot으로 이미 태깅돼 있어서, 그걸
그대로 재사용하면 비용 추적이 챗봇 사용량과 섞인다.
"""
import os

import boto3

REGION = os.environ.get("AWS_REGION", "us-east-1")
MODEL_ID = "arn:aws:bedrock:us-east-1:887078546492:application-inference-profile/yeypch70w7ej"  # mbti-video-sonnet-46

_client = None


def _get_client():
    global _client
    if _client is None:
        _client = boto3.client("bedrock-runtime", region_name=REGION)
    return _client


def call_text(
    system_prompt: str,
    user_message: str,
    model: str = MODEL_ID,
    max_tokens: int = 3000,
    temperature: float = 0.7,
) -> str:
    """system_prompt + user_message로 Bedrock Claude를 호출해 텍스트 응답을
    그대로 돌려준다. openai_client.call_text()와 시그니처 동일 — 코드블록
    벗기기는 호출부 책임(포맷마다 후처리가 달라서 여기서 하지 않음)."""
    client = _get_client()
    resp = client.converse(
        modelId=model,
        system=[{"text": system_prompt}],
        messages=[{"role": "user", "content": [{"text": user_message}]}],
        inferenceConfig={"maxTokens": max_tokens, "temperature": temperature},
    )
    return resp["output"]["message"]["content"][0]["text"]
