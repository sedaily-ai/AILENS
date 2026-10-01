"""AWS Bedrock(Claude) 호출 — `pipelines/` 공용.

2026-08-22: video 파이프라인(`generate_script.py`)의 각본 생성을 GPT에서
Bedrock Claude로 이관하며 신설. `openai_client.call_text()`와 동일한
시그니처를 맞춰서 호출부는 import만 바꾸면 되도록 했다("GPT는 이미지
생성 전용으로만 쓴다"는 결정 — webtoon의 image_generation 툴 호출은
그대로 openai_client에 남는다).

전용 application inference profile `mbti-video-sonnet-46`
(arn:aws:bedrock:us-east-1:887078546492:application-inference-profile/r9n8dvqc1t0r,
Sonnet 4.6, Service=lens·Workload=video-script 태그)을 새로 만들어 썼다 —
기존 `mbti-sonnet-46`은 Workload=chatbot으로 이미 태깅돼 있어서, 그걸
그대로 재사용하면 비용 추적이 챗봇 사용량과 섞인다.

2026-08-23 — 리소스명에서 "mbti"를 걷어내는 작업 중 이 프로파일도
`lens-video-sonnet-46`(위 ARN)으로 재생성했다. 옛 `mbti-video-sonnet-46`
(yeypch70w7ej)은 삭제 완료.

같은 날 — letters/podcast/webtoon(스크립트)도 GPT에서 이 모듈로 이관해
텍스트 생성을 전부 Bedrock으로 통일했다(GPT는 webtoon 이미지 생성
전용으로만 남음). 각 파이프라인은 자기 전용 inference profile을
`model=` 인자로 넘겨서 쓴다(mustknow_auto/classify.py와 같은 패턴) —
`openai_client.call_text()`는 더 쓰는 곳이 없어져 삭제했다.
"""
import os

import boto3
from botocore.config import Config

REGION = os.environ.get("AWS_REGION", "us-east-1")
# 2026-09-27, 사용자 요청 — "클로드 4.6sonnet 빼시고요. 클로드 5.0 opus로
# 모든 프로덕션... 업데이트": 전용 프로파일 lens-video-opus-5(신규 생성,
# us.anthropic.claude-opus-5 copyFrom, Service=lens·Workload=video)로
# 교체 — admin/backend/routes/prompts.py::_CATEGORY_BEDROCK["video"]와
# 반드시 같은 ARN을 유지할 것. 이 상수는 video/generate_script.py만 쓴다
# (다른 파이프라인은 각자 model= 인자를 명시적으로 넘긴다 — 위 모듈
# docstring 참고).
MODEL_ID = "arn:aws:bedrock:us-east-1:887078546492:application-inference-profile/p28gzlq5kj6s"  # lens-video-opus-5

# 2026-08-22 — mustknow_auto가 60건 배치(추론 오버헤드 있는 Sonnet 5)를
# 넣었더니 boto3 기본 read timeout(60초)을 넘겨 Read timeout으로 전부
# 실패했다. 배치가 클수록 생성 시간이 길어지는 게 정상 동작이라 타임아웃을
# 넉넉히 늘린다(진짜 hang만 걸러내려는 목적, 정상 완료를 막으면 안 됨).
#
# 2026-08-23 — 실제 Fargate에서 첫 검증 실행했더니 이번엔 Read가 아니라
# Connect timeout(10초)으로 전부 실패했다. 30초로 늘려도 똑같이 실패해서
# 콜드스타트 지연이 아니라는 걸 확인 — 진단해보니 원인은 완전히 다른
# 문제였다: 이 VPC에 다른 프로젝트(nx-tt)가 만든 bedrock-runtime VPC
# 인터페이스 엔드포인트가 Private DNS 활성화 상태로 떠있어서,
# bedrock-runtime.us-east-1.amazonaws.com을 조회하면 무조건 그 엔드포인트의
# 사설 IP로 응답이 갔다(공용 인터넷·S3는 정상이었던 이유 — 그것들은
# 이 엔드포인트를 안 거침). 근데 그 엔드포인트 보안그룹(nx-tt 소유)이
# 우리 태스크 보안그룹의 접근을 안 허용해서 거기서 막혀 타임아웃이 났다.
# 남 리소스를 건드리는 대신, AI LENS 전용 엔드포인트를 새로 만들었다
# (`sedaily-mbti-lens-bedrock-runtime-vpce`, vpce-0a3db42bd30a484d1) —
# 같은 VPC에서 같은 서비스에 Private DNS를 "켠" 엔드포인트는 하나만
# 가능해서(이미 nx-tt 게 켜져 있음) 이건 Private DNS 없이 만들고, 대신
# 이 엔드포인트의 전용 DNS 이름을 boto3 클라이언트에 명시적으로 지정해서
# 표준 호스트명(=nx-tt 엔드포인트로 가로채짐) 대신 우리 엔드포인트로
# 바로 가게 한다. 로컬 개발 환경(이 VPC 밖)에서는 이 환경변수가 없으니
# 평소처럼 공개 엔드포인트로 나간다 — ECS 태스크 정의에만 설정.
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
    그대로 돌려준다. openai_client.call_text()와 시그니처 동일 — 코드블록
    벗기기는 호출부 책임(포맷마다 후처리가 달라서 여기서 하지 않음).

    2026-08-22 — mustknow_auto에서 Sonnet 5로 처음 호출했을 때 두 가지
    문제가 났다: (1) ValidationException("`temperature` is deprecated for
    this model") — 기존 video 파이프라인(Sonnet 4.6)은 temperature=0.7
    고정이었는데 모델별로 지원 여부가 갈려서, 기본값을 None으로 바꾸고
    명시적으로 넘겼을 때만 inferenceConfig에 포함시킨다. (2) 긴 프롬프트
    (분류 배치)에서 content 블록이 `[reasoning 블록, text 블록]` 순서로
    와서 `content[0]["text"]`가 KeyError — Sonnet 5가 추론 블록을 먼저
    반환하는 것으로 보임(boto3가 그 블록 타입을 `SDK_UNKNOWN_MEMBER`로
    표시). 인덱스 0을 가정하지 않고 `text` 키를 가진 첫 블록을 찾는다.

    2026-09-27 — letters/podcast/video/webtoon 스크립트 생성이 전부 Opus 5로
    바뀌면서(사용자 요청), admin CMS 쪽에서 이미 겪은 것과 같은 위험을
    그대로 물려받는다 — 확장 사고(reasoning)가 max_tokens 예산을 전부
    써버리면 실제 답변이 0글자가 되는 실패 모드(admin/backend/routes/
    prompts.py::_THINKING_CONFIG 독스트링 참고, "영상 탭에서 Opus 5...
    각본이 출력되다가 중단" 실측 사례 — 여기 podcast(3000)·video(4000)
    max_tokens는 letters(12000)보다 훨씬 작아 그 위험이 더 크다). admin
    쪽이 쓴 것과 동일한 완화(additionalModelRequestFields로 thinking을
    끔)를 이 함수를 부르는 모든 곳에 무조건 적용한다 — sonnet-46/opus-5/
    sonnet-5 셋 다 이 필드를 그대로 받아준다는 걸 admin 쪽에서 이미 실측
    확인했고(이 함수의 현재 호출부는 전부 이 세 모델 중 하나), 셋 다
    reasoning 자체가 불필요한 단순 생성 작업이라 끄는 게 손해도 없다."""
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


def call_vision(
    system_prompt: str,
    user_message: str,
    image_bytes: bytes,
    model: str = MODEL_ID,
    max_tokens: int = 1000,
    image_format: str = "png",
) -> str:
    """이미지 1장 + 텍스트로 Bedrock Claude(비전)를 호출한다(2026-09-02,
    웹툰 이미지 QA 신설 — call_text()에 이미지 콘텐츠 블록만 추가한 자매
    함수). converse API의 멀티모달 content는 이미지 블록이 텍스트 블록보다
    앞에 와야 한다(Anthropic 권장 순서 — 실측으로도 이 순서가 안정적)."""
    client = _get_client()
    resp = client.converse(
        modelId=model,
        system=[{"text": system_prompt}],
        messages=[{
            "role": "user",
            "content": [
                {"image": {"format": image_format, "source": {"bytes": image_bytes}}},
                {"text": user_message},
            ],
        }],
        inferenceConfig={"maxTokens": max_tokens},
    )
    for block in resp["output"]["message"]["content"]:
        if "text" in block:
            return block["text"]
    raise ValueError(f"Bedrock 응답에 text 블록이 없습니다: {resp['output']['message']['content']}")
