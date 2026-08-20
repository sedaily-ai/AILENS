"""OpenAI Chat Completions 호출 — `pipelines/` 공용.

API 키는 AWS Secrets Manager `sedaily-mbti/openai-api-key`에서 가져온다
(마스터DB 뉴스웹툰 파이프라인과 같은 시크릿 재사용 — 신규 키 발급 없음).
이 세션 동안 스크래치패드에서 매번 손으로 다시 썼던 "시크릿 fetch + GPT
호출" 보일러플레이트를 여기 하나로 뽑았다(2026-08-20).
"""
import json
import os

import boto3
from openai import OpenAI

_SECRET_ID = "sedaily-mbti/openai-api-key"
_REGION = os.environ.get("AWS_REGION", "us-east-1")
_AWS_PROFILE = os.environ.get("AWS_PROFILE")  # 로컬 실행용

_api_key: str | None = None


def _get_api_key() -> str:
    global _api_key
    if _api_key is None:
        session = (
            boto3.Session(profile_name=_AWS_PROFILE)
            if _AWS_PROFILE
            else boto3.Session()
        )
        sm = session.client("secretsmanager", region_name=_REGION)
        secret = json.loads(sm.get_secret_value(SecretId=_SECRET_ID)["SecretString"])
        _api_key = secret["OPENAI_API_KEY"]
    return _api_key


def call_text(
    system_prompt: str,
    user_message: str,
    model: str = "gpt-4o",
    max_tokens: int = 3000,
    temperature: float = 0.7,
) -> str:
    """system_prompt(=admin 프롬프트 content) + user_message(=기사 원문 묶음)로
    GPT를 호출해 텍스트 응답을 그대로 돌려준다. 코드블록(```) 벗기기는
    호출부 책임 — 포맷마다 후처리가 달라서(레터는 문단 분리, 팟캐스트는
    TTS 입력 정제) 여기서 하지 않는다."""
    client = OpenAI(api_key=_get_api_key())
    resp = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ],
        max_tokens=max_tokens,
        temperature=temperature,
    )
    return resp.choices[0].message.content
