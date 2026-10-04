"""AWS Bedrock(Claude) 텍스트 호출 — `pipelines/` 공용.

letters/podcast/webtoon(스크립트)/video(각본)/mustknow_auto가 쓴다. 각 파이프라인은
자기 전용 application inference profile을 `model=` 인자로 넘긴다(비용 태깅 규칙상
베어 모델 ID를 쓰지 않는다). 코드블록 벗기기 등 후처리는 호출부 책임이다.
"""
import os

import boto3
from botocore.config import Config

REGION = os.environ.get("AWS_REGION", "us-east-1")
# video/generate_script.py 전용 기본 모델(lens-video-opus-5 프로파일).
# admin/backend/routes/prompts.py::_CATEGORY_BEDROCK["video"]와 반드시 같은 ARN을 유지한다.
# 다른 파이프라인은 각자 model= 인자를 명시한다.
MODEL_ID = "arn:aws:bedrock:us-east-1:887078546492:application-inference-profile/p28gzlq5kj6s"  # lens-video-opus-5

# read timeout 300초: 큰 배치(mustknow_auto 분류)는 생성 시간이 길어 boto3 기본값(60초)을 넘는다.
# 정상 완료를 막지 않고 진짜 hang만 거르는 값이다.
#
# BEDROCK_ENDPOINT_URL: Fargate가 쓰는 VPC에는 다른 프로젝트(nx-tt)의 bedrock-runtime
# 인터페이스 엔드포인트가 Private DNS 활성 상태로 있어, 표준 호스트명이 그 엔드포인트로
# 해석되고 보안그룹에 막혀 Connect timeout이 난다. 같은 VPC에서 Private DNS는 하나만
# 켤 수 있으므로 AI LENS 전용 엔드포인트(vpce-0a3db42bd30a484d1)를 Private DNS 없이
# 만들고 그 DNS 이름을 클라이언트에 명시한다. ECS 태스크 정의에서만 설정하며,
# 로컬에서는 미설정이라 공개 엔드포인트를 쓴다.
_ENDPOINT_URL = os.environ.get("BEDROCK_ENDPOINT_URL")

_CONFIG = Config(read_timeout=300, connect_timeout=30, retries={"max_attempts": 3})

_client = None


def _get_client():
    global _client
    if _client is None:
        kwargs = {"region_name": REGION, "config": _CONFIG}
        if _ENDPOINT_URL:
            kwargs["endpoint_url"] = _ENDPOINT_URL
        _client = boto3.client("bedrock-runtime", **kwargs)
    return _client


def call_text(
    system_prompt: str,
    user_message: str,
    model: str = MODEL_ID,
    max_tokens: int = 3000,
    temperature: float | None = None,
) -> str:
    """system_prompt + user_message로 Bedrock Claude를 호출해 텍스트 응답을
    그대로 돌려준다. 코드블록 벗기기는 호출부 책임(포맷마다 후처리가 달라서 여기서 하지 않음).

    temperature는 모델별 지원 여부가 갈려(Sonnet 5는 ValidationException) 기본값
    None이며 명시했을 때만 inferenceConfig에 포함한다. 응답 content에는 reasoning 블록이
    text 블록보다 앞에 올 수 있어 `text` 키를 가진 첫 블록을 찾는다.

    thinking은 항상 끈다. 확장 사고가 max_tokens 예산을 모두 쓰면 답변이 0글자가 되는데,
    podcast(3000)·video(4000) 같은 작은 max_tokens에서 위험이 크다
    (admin/backend/routes/prompts.py::_THINKING_CONFIG 참고). 이 함수의 호출 모델
    (sonnet-46/opus-5/sonnet-5)은 모두 이 필드를 받으며 단순 생성 작업이라 끄는 쪽이 낫다."""
    client = _get_client()
    inference_config = {"maxTokens": max_tokens}
    if temperature is not None:
        inference_config["temperature"] = temperature
    resp = client.converse(
        modelId=model,
        system=[{"text": system_prompt}],
        messages=[{"role": "user", "content": [{"text": user_message}]}],
        inferenceConfig=inference_config,
        additionalModelRequestFields={"thinking": {"type": "disabled"}},
    )
    for block in resp["output"]["message"]["content"]:
        if "text" in block:
            return block["text"]
    raise ValueError(f"Bedrock 응답에 text 블록이 없습니다: {resp['output']['message']['content']}")
