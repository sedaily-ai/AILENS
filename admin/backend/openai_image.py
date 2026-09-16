"""OpenAI 이미지 생성(DALL-E) — 프롬프트 챗랩 컷 이미지 모델 비교 실험
전용(2026-09-15, 사용자 요청: "openai api도 연결을 해서.. 이미지 생성
가능하도록 해야합니다").

Bedrock이 아닌 완전히 별개 벤더라 shared/secrets_client.py로 이미 준비돼
있던 시크릿(sedaily-mbti/openai-api-key, IAM Sid
AdminPromptTestOpenAIKeyRead)을 그대로 쓴다 — 예전에 다른 기능을 대비해
미리 만들어져 있었지만 실제로 호출하는 코드는 지금까지 없었다.

openai 파이썬 SDK를 새로 추가하지 않는다(admin/backend는 boto3 위주 최소
의존성 정책) — REST 엔드포인트 하나만 부르면 되므로 이 저장소 다른
internal HTTP 클라이언트(prompts_repo.py 등)와 같은 방식으로
urllib.request를 직접 쓴다."""
from __future__ import annotations

import base64
import json
import urllib.error
import urllib.request

from shared.secrets_client import get_secret_json_field

_API_URL = "https://api.openai.com/v1/images/generations"
_SECRET_ID = "sedaily-mbti/openai-api-key"
_TIMEOUT_SECONDS = 90  # 이미지 생성은 텍스트보다 오래 걸림


def generate_image_bytes(prompt: str, *, model: str = "gpt-image-1", size: str = "1024x1536") -> bytes:
    """OpenAI 이미지 API 1회 호출 — b64_json으로 바로 받아 별도 다운로드
    URL 왕복 없이 bytes로 반환한다(Bedrock 계열 generate_*_bytes 함수들과
    같은 반환 계약이라 webtoon_lab.py에서 그대로 갈아끼울 수 있다).

    ⚠️ model 기본값이 "dall-e-3"가 아니라 "gpt-image-1"인 이유(2026-09-15
    실측) — 이 시크릿의 API 키/프로젝트는 dall-e-3에 접근 권한이 없다
    ("The model 'dall-e-3' does not exist" 오류로 확인). gpt-image-1은
    `response_format` 파라미터 자체를 안 받는다("Unknown parameter" 오류로
    확인) — 항상 b64_json으로만 응답한다. size="1024x1536"(세로형) —
    gpt-image-1이 지원하는 크기 중 4:5에 가장 가까운 옵션."""
    api_key = get_secret_json_field(_SECRET_ID, "OPENAI_API_KEY")
    body = json.dumps({
        "model": model,
        "prompt": prompt[:4000],
        "n": 1,
        "size": size,
    }).encode("utf-8")
    req = urllib.request.Request(
        _API_URL,
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=_TIMEOUT_SECONDS) as res:
            payload = json.loads(res.read())
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")
        raise RuntimeError(f"OpenAI 이미지 생성 실패({e.code}): {detail[:300]}") from e
    b64 = payload["data"][0]["b64_json"]
    return base64.b64decode(b64)
