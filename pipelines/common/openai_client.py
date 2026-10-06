"""OpenAI 클라이언트 — `pipelines/` 공용, webtoon 이미지 생성 전용.

API 키는 AWS Secrets Manager `sedaily-mbti/openai-api-key`에서 가져온다.
컷 이미지는 Responses API `image_generation` 툴로 생성한다(Bedrock에 대응 기능 없음).
텍스트 생성은 전부 Bedrock Claude(`bedrock_client.py`)를 쓴다.
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


def get_client() -> OpenAI:
    """raw OpenAI 클라이언트 — webtoon의 이미지 생성(image_generation 툴) 전용."""
    return OpenAI(api_key=_get_api_key())
