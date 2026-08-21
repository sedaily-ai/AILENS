"""OpenAI Chat Completions 호출 — `pipelines/` 공용.

API 키는 AWS Secrets Manager `sedaily-mbti/openai-api-key`에서 가져온다
(마스터DB 뉴스웹툰 파이프라인과 같은 시크릿 재사용 — 신규 키 발급 없음).
이 세션 동안 스크래치패드에서 매번 손으로 다시 썼던 "시크릿 fetch + GPT
호출" 보일러플레이트를 여기 하나로 뽑았다(2026-08-20).

get_client()는 2026-08-21 추가 — pipelines/webtoon만 이 공용 모듈이 생기기
전(2026-08-10) 방식 그대로 로컬 `.env`(OPENAI_API_KEY 평문)를 썼다. 이미지
생성(Responses API) 등 call_text()로 못 덮는 raw client 호출이 필요해서
직접 OpenAI() 인스턴스를 만들던 걸, 여기서 만든 인스턴스를 그대로 받아
쓰도록 통일했다 — letters/podcast/video와 동일하게 로컬 .env 없이 Secrets
Manager만으로 동작한다.
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
    """raw OpenAI 클라이언트가 필요한 호출부용(예: image_generation 툴을
    쓰는 Responses API) — call_text()로 못 덮는 경우에만 이걸 직접 쓴다."""
    return OpenAI(api_key=_get_api_key())


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
