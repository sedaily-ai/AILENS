"""AWS Bedrock(Claude) 텍스트 호출 — `pipelines/` 공용.

letters/podcast/webtoon(스크립트)/video(각본)/mustknow_auto가 쓴다. 각 파이프라인은
자기 전용 application inference profile을 `model=` 인자로 넘긴다(비용 태깅 규칙상
베어 모델 ID를 쓰지 않는다). 코드블록 벗기기 등 후처리는 호출부 책임이다.
"""
import os

import boto3
from botocore.config import Config

REGION = os.environ.get("AWS_REGION", "us-east-1")
from bedrock_models import profile_arn  # noqa: E402
# video/generate_script.py 전용 기본 모델(lens-video-sonnet-5 프로파일, 이전 lens-video-opus-5).
# admin/backend/routes/prompts.py::_CATEGORY_BEDROCK["video"]와 반드시 같은 ARN을 유지한다.
# 다른 파이프라인은 각자 model= 인자를 명시한다.
MODEL_ID = profile_arn("video_sonnet5")  # lens-video-sonnet-5 (2026-10-11 Opus 5 → Sonnet 5, 3건 시험: max_tokens 8000·cuts 블록 선택 적용 시 통과)

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


# 캐시 유지 1시간(2026-10-16). 기본 5분으로는 기사 간격(영상 렌더 포함 약 7분)이 길어 거의 적중하지
# 않았다(10-15 12시 회차 26호출 중 읽기 1회). 1시간은 저장 단가가 더 높지만 회차 안의 기사들이 지침을
# 이어 읽어 회차당 기사 2건 이상이면 이득이다. Sonnet 5·4.6 지원(AWS Bedrock 문서). 5분만 지원하는
# 모델로 바꾸면 ValidationException이 나므로 그때는 "ttl"을 뺀다.
_CACHE_POINT = {"cachePoint": {"type": "default", "ttl": "1h"}}


def _log_usage(model: str, usage: dict) -> None:
    """캐시 효과 확인용 사용량 한 줄. cacheRead가 계속 0이면 캐시가 안 맞는 것이다
    (프롬프트가 최소 길이(Sonnet 4.6·5는 1024토큰) 미만이거나, 호출 간격이 1시간을 넘었거나,
    고정 부분에 매번 바뀌는 값이 섞인 경우)."""
    print(
        f"    [bedrock usage] model=...{model[-12:]} in={usage.get('inputTokens', 0)}"
        f" out={usage.get('outputTokens', 0)} cacheRead={usage.get('cacheReadInputTokens', 0)}"
        f" cacheWrite={usage.get('cacheWriteInputTokens', 0)}"
    )


def call_text(
    system_prompt: str,
    user_message: str,
    model: str = MODEL_ID,
    max_tokens: int = 3000,
    temperature: float | None = None,
    cached_user_prefix: str | None = None,
) -> str:
    """system_prompt + user_message로 Bedrock Claude를 호출해 텍스트 응답을
    그대로 돌려준다. 코드블록 벗기기는 호출부 책임(포맷마다 후처리가 달라서 여기서 하지 않음).

    temperature는 모델별 지원 여부가 갈려(Sonnet 5는 ValidationException) 기본값
    None이며 명시했을 때만 inferenceConfig에 포함한다. 응답 content에는 reasoning 블록이
    text 블록보다 앞에 올 수 있어 `text` 키를 가진 첫 블록을 찾는다.

    thinking은 항상 끈다. 확장 사고가 max_tokens 예산을 모두 쓰면 답변이 0글자가 되는데,
    podcast(3000)·video(4000) 같은 작은 max_tokens에서 위험이 크다
    (admin/backend/routes/prompts.py::_THINKING_CONFIG 참고). 이 함수의 호출 모델
    (sonnet-46/opus-5/sonnet-5)은 모두 이 필드를 받으며 단순 생성 작업이라 끄는 쪽이 낫다.

    프롬프트 캐싱(2026-10-15): system 뒤에 cachePoint를 붙인다. 같은 지침으로 1시간 안에 다시
    부르면(기사 여러 건, 배치 분류, 재시도) 지침 부분을 0.1배 단가로 읽는다(_CACHE_POINT 참고). 최소 길이보다 짧은
    프롬프트는 오류 없이 캐시만 안 된다. 긴 지침을 user 칸에 넣는 호출부(웹툰)는
    cached_user_prefix로 그 고정 부분을 넘기면 [고정 부분][cachePoint][user_message] 순서로 보낸다.
    캐시는 앞에서부터 바이트가 같아야 맞으므로 고정 부분에 기사·시각 같은 가변값을 넣지 않는다.
    admin(routes/prompts.py::_call_bedrock)은 2026-09-24부터 같은 방식을 쓴다."""
    client = _get_client()
    inference_config = {"maxTokens": max_tokens}
    if temperature is not None:
        inference_config["temperature"] = temperature
    user_content: list[dict] = []
    if cached_user_prefix:
        user_content += [{"text": cached_user_prefix}, _CACHE_POINT]
    user_content.append({"text": user_message})
    resp = client.converse(
        modelId=model,
        system=[{"text": system_prompt}, _CACHE_POINT],
        messages=[{"role": "user", "content": user_content}],
        inferenceConfig=inference_config,
        additionalModelRequestFields={"thinking": {"type": "disabled"}},
    )
    _log_usage(model, resp.get("usage") or {})
    for block in resp["output"]["message"]["content"]:
        if "text" in block:
            return block["text"]
    raise ValueError(f"Bedrock 응답에 text 블록이 없습니다: {resp['output']['message']['content']}")
