"""OpenAI 클라이언트 — `pipelines/` 공용. 이미지 생성(webtoon) 전용.

API 키는 AWS Secrets Manager `sedaily-mbti/openai-api-key`에서 가져온다
(마스터DB 뉴스웹툰 파이프라인과 같은 시크릿 재사용 — 신규 키 발급 없음).

get_client()는 2026-08-21 추가 — pipelines/webtoon만 이 공용 모듈이 생기기
전(2026-08-10) 방식 그대로 로컬 `.env`(OPENAI_API_KEY 평문)를 썼다. 직접
OpenAI() 인스턴스를 만들던 걸, 여기서 만든 인스턴스를 그대로 받아 쓰도록
통일했다 — letters/podcast/video와 동일하게 로컬 .env 없이 Secrets
Manager만으로 동작한다.

2026-08-23 — letters/podcast/webtoon의 텍스트 생성(대본·스크립트)을 전부
Bedrock Claude로 이관하면서(video와 통일) 이 모듈의 `call_text()`는 더 이상
쓰는 곳이 없어져 삭제했다. 이제 이 모듈은 webtoon의 실제 컷 이미지
생성(Responses API `image_generation` 툴 — Bedrock엔 대응 기능 없음)
전용이다.
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
