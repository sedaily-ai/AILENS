"""prompt CRUD + version history.

2026-09-09(v1.27): 저장을 DynamoDB(pk='PROMPT#<category>/<name>', sk='v#<int>'
| 'LATEST')에서 PostgreSQL(lens-cms-api, `repo/prompts_repo.py` 경유)로
전환. LATEST 포인터 개념이 없어졌다 — `prompt_versions.is_active` 유일
부분 인덱스가 그 역할을 대신하고, 버전 번호가 진짜 INTEGER라 예전
`_load_version_history`가 워크어라운드하던 사전식 정렬 버그(v#10이
v#2보다 앞에 오던 것)도 서버 쪽 `ORDER BY version DESC`로 자연히 해소.

## content 는 손대지 않는다 (중요)

``content`` 는 ``service/backend/services/prompt_loader.load_prompt()`` 가 읽어
**그대로** Bedrock 에 넘기는 문자열이다 — 챗봇은 Anthropic ``system`` 블록,
질문 생성은 user 메시지 앞부분. 템플릿 치환도, 파싱도 없다. 따라서 content 에는
항상 모델이 읽을 산문만 들어가야 한다. JSON 을 넣으면 그 JSON 이 모델에게 간다.

## sections — 편집기용 구조 (2026-08-14)

관리자 화면은 프롬프트를 설명/구조/지침 3섹션 + 섹션별 첨부로 편집한다. 그
구조를 content 에 섞으면 위 원칙이 깨지므로, **같은 버전 행의 별도 속성**
``sections``(Postgres JSONB, DynamoDB 시절엔 ``sections_json`` 문자열)에
둔다. 읽기 경로(prompt_loader)는 content 만 보기 때문에 추론에는 아무
영향이 없다.

  content  ← 3섹션을 이어붙인 산문 (모델이 읽는 것, 프런트가 조립)
  sections ← {description|structure|guidelines: {text, format, attachments…}}
             (편집기가 되읽어 폼을 복원하는 것)

sections 는 optional 이다 — 없으면(옛 버전, /prompts/edit 의 평문 저장) 편집기가
content 전체를 한 섹션으로 취급해 폴백한다.
"""

import json
import os
import uuid

import boto3
from botocore.config import Config as BotoConfig

from repo import admin_jobs_repo, prompts_repo
from shared import audit, ddb_client, response, time_utils

# LLMOps 테스트 실행(2026-08-19, 2026-09-11 Bedrock로 이관) — 프롬프트
# 드로어에서 "테스트 실행"을 누르면(저장 여부와 무관하게) 지금 편집 중인
# content + 붙여넣은 기사 원문을 그대로 모델에 넘겨 실제 산출물을 보여준다.
#
# 2026-09-11 — GPT-4o에서 각 채널의 실제 프로덕션 모델(Bedrock Claude)로
# 이관했다. 그전엔 "빠른 프롬프트 반복"이 목적이라 4채널 전부 GPT-4o
# 하나로 퉁쳤는데(admin Lambda에 bedrock:InvokeModel 권한이 없어서), 그러면
# 테스트 결과가 실제 발행 결과와 미묘하게 달라진다는 게 문제였다(레터는
# Opus 5, 나머지는 Sonnet 4.6 — 모델도 다르고 지침을 system/user 어디에
# 넣는지도 채널마다 다르다, 아래 _CATEGORY_BEDROCK 참조). 이제 admin
# Lambda에도 이 4개 inference profile에 대한 bedrock:InvokeModel을
# 추가했다(IAM) — 이 Lambda가 파이프라인 Fargate 태스크와 같은 VPC에 있어서
# 그 VPC 안에서만 겪는 문제(다른 프로젝트가 만든 bedrock-runtime VPC
# 엔드포인트가 Private DNS로 표준 호스트명을 가로채는 문제, bedrock_client.py
# 참조)도 그대로 적용된다 — BEDROCK_ENDPOINT_URL 환경변수로 전용
# 엔드포인트를 명시했다. 그 엔드포인트의 보안그룹이 이 Lambda의 보안그룹
# 인바운드를 허용해야 실제로 붙는데, 그 보안그룹 규칙 추가는 이 세션의
# 자동 승인 범위 밖이라(네트워크 경계 변경) 사용자가 직접 승인해야 한다.
#
# API Gateway HTTP API 통합 타임아웃은 30초 고정(늘릴 수 없음) — Lambda
# 자체 Timeout 도 30초로 맞춰져 있다. Bedrock 호출은 그 안에서 여유를 두고
# 끊어야 Lambda가 강제 종료되기 전에 우리 쪽 에러 메시지를 돌려줄 수 있다.

# 채널 → 실제 프로덕션이 쓰는 inference profile·호출 방식. "system"은
# 지침(content)을 Bedrock system 메시지로 그대로 쓰고 기사만 짧은 사용자
# 메시지로 감싼다(letters/podcast/video 프로덕션과 동일 — pipelines/letters,
# podcast, video 확인). "webtoon_json"은 지침을 사용자 메시지 안에 넣고
# 고정 system 문구 + JSON 코드블록 지침을 붙인다(webtoon 프로덕션과 동일 —
# pipelines/webtoon/pipeline.py 확인).
#
# 2026-09-26 — user_template이 예전엔 "다음 기사 원문으로 OOO를 만들어주세요"
# 처럼 그 채널이 뭘 만드는지 코드에서 직접 지시했다(letters="레터",
# podcast="팟캐스트 대본", video="영상 각본 + 렌더용 JSON"). 사용자 지적:
# "그런 프롬프트 템플릿은 있으면 안됩니다... 사용자가 프롬프트 입력칸에
# 넣은 대로 제어가 되기를 바란다" — 웹툰 탭에 영상 관련 지침을 넣으면
# 영상 산출물이 나와야 하는데, 코드가 "레터를 만들어라"/"영상 각본을
# 만들어라"처럼 채널별로 결과물 종류를 미리 못박고 있으면 그게 안 된다.
# 이제 기사 원문만 표시하고("[입력 기사]"), 무엇을 만들지는 전적으로
# 저장된 지침(system 메시지)에 맡긴다 — pipelines/letters/pipeline.py,
# pipelines/podcast/pipeline.py, pipelines/video/generate_script.py의
# 실제 발행 코드도 사용자 확인 후 동일하게 고쳤다(이 admin 테스트 도구가
# 실제 프로덕션과 다르게 동작하면 테스트 도구로서 의미가 없어서 — 테스트
# 도구만 고치고 프로덕션을 안 고치면 괴리가 생긴다는 걸 먼저 확인받았다).
_CATEGORY_BEDROCK = {
    "letters": {
        "model": "arn:aws:bedrock:us-east-1:887078546492:application-inference-profile/iqye2pzreccq",  # lens-letters-opus-5
        "model_label": "Claude Opus 5",  # 2026-09-24 — 프론트 배지 표시용, 아래 handle_current_model 참고. model 바꿀 때 이 줄도 같이 바꿀 것.
        "mode": "system",
        "user_template": "[입력 기사]\n{article}",
        "max_tokens": 12000,  # pipelines/letters/pipeline.py와 동일 — 비동기라 그대로 맞출 수 있다.
    },
    "podcast": {
        # 2026-09-27, 사용자 요청 — "클로드 4.6sonnet 빼시고요. 클로드 5.0
        # opus로 모든 프로덕션... 업데이트 해주시죠": 전용 프로파일
        # lens-podcast-opus-5(신규 생성, us.anthropic.claude-opus-5 copyFrom)
        # 로 교체. pipelines/podcast/pipeline.py의 _SCRIPT_MODEL도 동일하게
        # 바꿨다 — 이 admin 테스트 도구와 실제 발행이 어긋나면 안 된다는
        # 이 세션 기존 원칙 그대로(_run_article_text_flow 독스트링 참고).
        "model": "arn:aws:bedrock:us-east-1:887078546492:application-inference-profile/6bjkzt0icf74",  # lens-podcast-opus-5
        "model_label": "Claude Opus 5",
        "mode": "system",
        "user_template": "[입력 기사]\n{article}",
        "max_tokens": 3000,  # pipelines/podcast/pipeline.py — max_tokens 생략(bedrock_client.py 기본값 3000)과 동일.
    },
    "video": {
        # 2026-09-27 — 위 podcast와 동일 결정·동일 이유. 전용 프로파일
        # lens-video-opus-5(신규 생성)로 교체. pipelines/common/bedrock_client.py
        # 의 기본 MODEL_ID(video 전용 — 이 파일 자체 독스트링 참고)도 같이 바꿨다.
        "model": "arn:aws:bedrock:us-east-1:887078546492:application-inference-profile/p28gzlq5kj6s",  # lens-video-opus-5
        "model_label": "Claude Opus 5",
        "mode": "system",
        "user_template": "[입력 기사]\n{article}",
        "max_tokens": 4000,  # pipelines/video/generate_script.py와 동일.
    },
    "webtoon": {
        # 2026-09-27 — 위 podcast/video와 동일 결정. lens-webtoon-script-opus-5
        # 는 2026-09-20에 TEXT_MODELS 드롭다운용으로 이미 만들어져 있던 걸
        # 그대로 프로덕션 기본값으로 승격했다(새로 안 만듦). pipelines/webtoon/
        # pipeline.py의 SCRIPT_MODEL도 동일하게 바꿨다.
        "model": "arn:aws:bedrock:us-east-1:887078546492:application-inference-profile/j5kfly25ohjo",  # lens-webtoon-script-opus-5
        "model_label": "Claude Opus 5",
        "mode": "webtoon_json",
        # 2026-09-15 — 저장된 웹툰 프롬프트가 v11(2026-09-14 05:40 UTC)에서
        # 컷당 필드가 훨씬 많은 스키마(scene_type·camera_distance·
        # composition·bubble_1/2 등)로 바뀌면서, 옛 4000으로는 8컷을 다
        # 채우기 전에 2단계 응답이 중간에 잘려 JSON 파싱이 실패했다(실측:
        # cut_07 도중 문장 끊김, 사용자 신고 "2단계 생성 실패"). 8000으로
        # 올려 재현 테스트하니 8컷 전부 안 잘리고 완성됨을 직접 확인했다.
        # pipelines/webtoon/pipeline.py::call_json은 아직 4000 그대로다 —
        # 이 스키마 변경이 실제 발행 파이프라인까지 반영된 게 맞다면 거기도
        # 같이 올려야 한다(admin 실험 도구 범위 밖이라 여기서 안 건드림).
        #
        # 2026-09-27 — Opus 5 전환 후 8000도 부족해졌다(실측: 발행
        # 파이프라인 로컬 재현에서 컷당 영/한 image_prompt를 둘 다 길게
        # 쓰는 지금 지침으로는 8컷 완성 전에 응답이 멀티바이트 문자
        # 중간에서 잘림 — pipelines/webtoon/pipeline.py의 같은 날짜 주석
        # 참고). 여기 admin 실험 도구도 같은 모델·같은 프롬프트를 쓰므로
        # 동일하게 잘릴 것 — 어긋나지 않게 같이 올린다.
        "max_tokens": 16000,
    },
}

# 2026-09-20, 사용자 요청 — "좌측 채팅창에도 텍스트 모델 선택 가능하게
# 해주시죠": 웹툰 스크립트·장면 연출(build_script_call) + 일반 대화
# (_run_chat_flow) 둘 다 지금까지 _CATEGORY_BEDROCK["webtoon"]["model"]
# (Sonnet 4.6) 하나로 고정돼 있었다. 이미지 모델(webtoonImageModels.ts)과
# 같은 패턴으로 admin이 요청마다 고를 수 있게 별도 레지스트리로 뺀다.
# "Opus 5.1"·"GPT 최신 모델"도 요청받았지만 정확한 모델명을 확인 못 해
# 이번엔 뺐다 — 확인되면 여기 한 줄만 추가하면 된다. 각 항목은 비용
# 태깅 규칙(docs/architecture/비용태깅_규칙.md)에 따라 이 용도 전용
# application inference profile을 새로 만들어 넣었다(2026-09-20,
# lens-webtoon-script-opus-5/lens-webtoon-script-sonnet-5).
# 2026-09-27, 사용자 요청 — "클로드 4.6sonnet 빼시고요... 드롭다운에서도
# 삭제": sonnet-46 키를 통째로 뺐다. DEFAULT_TEXT_MODEL도 "opus-5"로
# 바꿨다 — 이제 _CATEGORY_BEDROCK 4개 카테고리 전부 Opus 5 기본값이라
# "모델 미지정 = Sonnet 4.6"이라는 옛 가정이 깨졌다(아래 get_thinking_config
# 참고, 그 가정에 기대던 동작을 같이 고쳤다).
TEXT_MODELS: dict[str, str] = {
    "opus-5": "arn:aws:bedrock:us-east-1:887078546492:application-inference-profile/j5kfly25ohjo",  # lens-webtoon-script-opus-5
    "sonnet-5": "arn:aws:bedrock:us-east-1:887078546492:application-inference-profile/dy1fhtb04pon",  # lens-webtoon-script-sonnet-5
    # 2026-09-24, 사용자 요청 — "opus 5.5나 5.1이나, sonnet도... 최신모델들은
    # 항상 가져오면 좋겠어요" + "gpt는 없나? 아스트라나 sol이나": Bedrock
    # list-foundation-models로 실제 계정에 있는 모델을 직접 확인(Opus 5.1은
    # 존재하지 않음 — 착오)하고, 없던 3개는 새 application inference profile을
    # 만들어 추가했다(비용태깅_규칙.md 3단계 그대로: 프로파일 생성 →
    # AdminPromptTestBedrockInvoke IAM에 3종 ARN 추가 → 여기 등록. IAM은
    # 이 세션 자동승인 범위 밖이라 사용자가 직접 put-role-policy 실행).
    "opus-5-5": "arn:aws:bedrock:us-east-1:887078546492:application-inference-profile/izf9wzkcahnq",  # lens-textlab-opus-5-5
    "gpt-6-astra": "arn:aws:bedrock:us-east-1:887078546492:application-inference-profile/uwlacvtlgavh",  # lens-textlab-gpt6-astra
    "gpt-6-sol": "arn:aws:bedrock:us-east-1:887078546492:application-inference-profile/j2pv1qbv1mlb",  # lens-textlab-gpt6-sol
}
DEFAULT_TEXT_MODEL = "opus-5"

# 2026-09-20, 실측 — sonnet-5는 이 웹툰 스크립트 생성(4만5천자 프롬프트+8컷
# 구조화 JSON)에서 내부 reasoning이 max_tokens(8000) 예산을 전부 써버려
# 240초를 기다려도 실제 답변 텍스트가 0글자였다(재현 확인). 백엔드
# 레지스트리·IAM·비용태깅 프로파일은 그대로 두지만(나중에 문제가 풀리면
# 바로 켤 수 있게), PromptChatLab.tsx의 좌측 드롭다운에서는 뺐다 — 고르면
# 그냥 실패하는 옵션을 보여줄 이유가 없다. opus-5도 같은 이유로 느리지만
# (2026-09-11 기록에도 이미 있던 known issue) 완주는 하는 걸 확인해서 남김.
# 2026-09-24 — 레터/팟캐스트/영상 탭(PromptTextLab)은 이 거대 웹툰 JSON
# 프롬프트를 안 쓰니 sonnet-5도 정상 작동할 가능성이 높아, 이번엔
# textModels.ts 드롭다운에 다시 올렸다(실사용 중 같은 증상 재현되면 다시 뺄 것).


def resolve_text_model(model_id: str | None) -> str:
    """admin이 고른 model_id(TEXT_MODELS의 키) → 실제 호출용 ARN. 모르는
    값이거나 비어 있으면 기존 기본값(Sonnet 4.6)으로 조용히 떨어진다 —
    프런트가 옛 버전이라 model을 안 보내는 경우도 안전해야 한다."""
    return TEXT_MODELS.get(model_id or "", TEXT_MODELS[DEFAULT_TEXT_MODEL])


# 2026-09-20 — Opus 5·Sonnet 5(Claude 5 계열)는 converse의 temperature
# 파라미터 자체를 거부한다("`temperature` is deprecated for this model",
# 직접 호출로 재현 확인) — pipelines/common/bedrock_client.py::call_text()
# 가 2026-08-22 mustknow_auto에서 Sonnet 5로 처음 겪고 이미 고친 문제와
# 동일(그 함수 docstring 참고). 거기선 매개변수 있을 때만 넣는 방식으로
# 풀었는데, 여기(chat_ws.py의 스트리밍 경로)는 기존 호출부가
# temperature=0.7을 무조건 넣고 있어서 같은 방식으로 model_id 기준
# on/off를 판단하는 헬퍼가 필요했다.
_MODELS_WITHOUT_TEMPERATURE = {"opus-5", "sonnet-5", "opus-5-5", "gpt-6-astra", "gpt-6-sol"}
# 2026-09-24 — opus-5-5는 opus-5/sonnet-5와 같은 이유로 거부. GPT-6 Astra/
# Sol은 메시지가 다르지만("This model doesn't support the temperature
# field") 마찬가지로 거부 — 셋 다 직접 호출로 재현 확인.


def text_model_supports_temperature(model_id: str | None) -> bool:
    return (model_id or DEFAULT_TEXT_MODEL) not in _MODELS_WITHOUT_TEMPERATURE


# 2026-09-24 — 사용자 리포트("영상 탭에서 Opus 5를 사용했는데... 각본이
# 출력되다가 중단되었네요")를 조사하다 직접 호출로 확인: sonnet-5는
# 내부 reasoning(확장 사고)이 max_tokens 예산을 전부 써버리면 실제 답변이
# 0글자가 되는 게 실제 원인이었다(240초/300초 타임아웃과는 별개 — 응답
# 자체가 비어서 났다). "리즈닝과 같이 시간이 더 걸리도록 영향을 주는
# 것은 비활성화를 하는 것이 좋겠다"는 사용자 판단대로, Converse API의
# additionalModelRequestFields로 reasoning을 직접 꺼봤다(실측):
#   - sonnet-46/opus-5/sonnet-5: {"thinking": {"type": "disabled"}} 그대로
#     허용됨. sonnet-5는 이걸로 완전히 해결(재현 테스트: 0자·174초 →
#     5,923자·27.8초, reasoning 블록 자체가 응답에서 사라짐).
#   - opus-5-5: "disabled"는 거부된다 — Bedrock 에러 메시지가 그대로
#     알려줌("thinking.type.disabled" is not supported for this model.
#     Use "thinking.type.adaptive" and "output_config.effort"). 유효한
#     effort 값은 low/medium/high/xhigh/max(minimal·none은 미지원, 이것도
#     에러 메시지로 직접 확인) — "adaptive"+"low"로 reasoning을 줄일 순
#     있지만 완전히 끄는 건 이 모델 자체가 구조적으로 지원 안 한다. 즉
#     opus-5-5는 이 완화를 적용해도 0글자 위험이 0%가 되진 않는다.
#   - gpt-6-astra/gpt-6-sol: thinking 파라미터 자체가 없다(Claude 전용
#     필드) — 보내면 "Unknown parameter: 'thinking'"으로 요청 자체가
#     거부된다(직접 호출로 확인) — 이 두 모델은 매핑에서 아예 뺀다.
#   - category 기본 모델(model_id 없이 호출되는 경우, 예: 프론트가 모델을
#     안 고른 채 보냄)은 그때는 전부 Sonnet 4.6 프로파일이라 안 건드렸다.
#     2026-09-27 — 레터/팟캐스트/영상/웹툰 전 카테고리가 Opus 5로 바뀌면서
#     이 가정이 깨졌다: 이제 model_id 없이 호출되는 경우도 실제로는 항상
#     Opus 5를 부르므로, 아래 get_thinking_config가 model_id 없을 때도
#     "opus-5" 설정으로 폴백하도록 바꿨다(안 그러면 카테고리 기본 호출
#     경로에서 이 세션이 이미 겪은 "각본이 출력되다가 중단" 버그가
#     그대로 재현된다).
_THINKING_CONFIG: dict[str, dict] = {
    "opus-5": {"thinking": {"type": "disabled"}},
    "sonnet-5": {"thinking": {"type": "disabled"}},
    "opus-5-5": {"thinking": {"type": "adaptive"}, "output_config": {"effort": "low"}},
}


def get_thinking_config(model_id: str | None) -> dict | None:
    """model_id(TEXT_MODELS의 키, resolve_text_model 이전의 원래 값) →
    Converse API의 additionalModelRequestFields. model_id가 없으면(카테고리
    기본 모델 호출) "opus-5" 설정으로 폴백한다 — 2026-09-27부터 모든
    카테고리 기본값이 Opus 5라(위 주석 참고) 기본 호출 경로도 예외가 아니다."""
    return _THINKING_CONFIG.get(model_id or "opus-5")


# 2026-09-24 — 프롬프트 캐싱(system 배열에 {"cachePoint": {"type":
# "default"}} 추가) 조사 중 실측 확인: gpt-6-astra/gpt-6-sol은 이걸 보내면
# Bedrock이 서버 단에서 AccessDeniedException("You invoked an unsupported
# model or your request did not allow prompt caching")으로 거부한다 —
# temperature/thinking처럼 파라미터 자체를 모르는 게 아니라, 이 두 모델이
# Converse 프롬프트 캐싱 자체를 지원 안 하는 것(직접 호출로 재현 확인,
# boto3 1.43.101 기준). Claude 계열(sonnet-46/opus-5/sonnet-5/opus-5-5)과
# category 기본 모델(model_id 없음 — 전부 Claude 프로파일)은 정상 캐싱됨을
# 확인했다.
_MODELS_WITHOUT_PROMPT_CACHE = {"gpt-6-astra", "gpt-6-sol"}


def model_supports_prompt_cache(model_id: str | None) -> bool:
    return (model_id or DEFAULT_TEXT_MODEL) not in _MODELS_WITHOUT_PROMPT_CACHE


# 2026-09-26 — "당신은 뉴스 웹툰 제작자입니다"라는 페르소나·주제 고정
# 문구를 뺐다(사용자 지적: "코드단에 입력된 템플릿이 있는것을 원치
# 않으며" — 웹툰 탭에 다른 주제의 지침을 넣어도 그 지침대로 나와야
# 하는데, 이 문구가 항상 "뉴스 웹툰"이라는 주제를 강제하고 있었다).
# JSON 스키마를 지키라는 부분만 남긴다 — 이건 주제 강제가 아니라
# 응답 형식 규칙(스키마 자체는 사용자가 저장한 지침 22장에서 온다,
# script.py::build_script_call 참고)이라 app이 응답을 파싱하는 데
# 실제로 필요하다.
_WEBTOON_SYSTEM_PROMPT = "지시받은 JSON 스키마를 정확히 지켜 응답합니다."
_WEBTOON_JSON_INSTRUCTION = (
    "\n\n[응답 형식]\n다른 설명 없이 ```json 코드블록 하나 안에 JSON 객체만 담아 응답한다."
)

# 2026-09-11 — 처음엔 API Gateway·Lambda 30초 벽 안에서 동기 응답하려고
# max_tokens을 4000으로 눌러 썼는데, 실측해보니(직접 시간 재봄) 웹툰은
# max_tokens=2000으로 줄여도 24.9초, 레터(Opus 5)는 1500으로 줄여도 25초에
# 겨우 480자 — 그 어떤 상한으로도 30초 안에 안정적으로 못 들어간다는 게
# 실측으로 확인됐다(Opus 5 자체가 느리고, 프롬프트 자체가 길어서 고정
# 오버헤드가 큼). 그래서 이 기능 전체를 비동기(작업 생성 + 폴링)로 바꿨다
# — 아래 job 관련 함수 참조. 덕분에 max_tokens을 눈치 볼 필요가 없어져서
# 위 _CATEGORY_BEDROCK에 프로덕션과 완전히 같은 값을 그대로 넣었다.
_BEDROCK_READ_TIMEOUT_SECONDS = 300  # 2026-09-24, 240→300초로 늘림(5분) —
# 위 2026-09-11 기록대로 원래도 느렸는데, Claude 5 계열(Opus 5·Sonnet 5)이
# 좌측 채팅창 모델 드롭다운으로 실제 선택 가능해지면서 이 복잡한 스크립트
# 생성 작업(4만5천자 프롬프트+8컷 구조화 JSON)에서 내부 reasoning이 불규칙한
# 간격을 두고 ReadTimeoutError로 죽는 걸 실측 확인했다(90→240초로 한 번
# 늘렸는데도 영상 탭에서 Opus 5로 각본 생성 중 재발 — 사용자 리포트:
# "각본이 출력되다가 중단되었다", "어떤 답변을 출력하더라도 중단되는 일이
# 발생되지 않았으면"). Lambda 자체 타임아웃은 900초(2026-09-24 기준
# `aws lambda get-function-configuration`으로 직접 확인 — 위 2026-09-20
# 주석이 "300초라 여유가 있어"라고 적어둔 건 그 시점 값이고 이미 올라가
# 있었다)라 여유가 훨씬 크다. read_timeout은 botocore가 소켓에서 "얼마나
# 오래 새 바이트가 안 오면 끊을지"를 재는 값이라, 스트리밍 전체 길이가
# 아니라 모델이 한 번에 오래 침묵하는 구간(reasoning)에 걸리는 것 — 그래도
# 안 되면(Sonnet 5는 240초 안에서도 답변 0글자로 토큰 예산을 reasoning에
# 다 써버림, TEXT_MODELS 주석 참고) 타임아웃보다 더 근본적인 문제라 모델
# 자체를 빼야 한다.

_bedrock_client = None


def _get_bedrock_client():
    global _bedrock_client
    if _bedrock_client is None:
        kwargs = {
            "region_name": "us-east-1",
            # retries(2026-09-24, 사용자 질문 — "개선할 부분은 더 없는건가요?")
            # — 원래 max_attempts=1(재시도 완전 없음, 이유를 설명하는 주석
            # 없음)이라 Bedrock 쓰로틀링·순간 커넥션 오류 같은 일시적 실패도
            # 바로 사용자에게 에러로 떨어졌다. 2로 올리고 "standard" 모드
            # (지수 백오프+지터)를 켠다 — botocore 재시도는 최초 요청/응답
            # 헤더 수신 단계에서만 판단되고, converse_stream처럼 우리 쪽
            # `for chunk in resp["stream"]`으로 직접 순회하는 도중에 발생하는
            # ReadTimeoutError는 그 시점엔 이미 응답 객체가 호출부로 넘어온
            # 뒤라 botocore가 재시도하지 않는다(별도 재시작 요청을 안 보냄) —
            # 즉 스트리밍 도중 재시도가 걸려 사용자에게 텍스트가 중복
            # 노출되는 경우는 없다. max_attempts는 낮게(2) 유지 —
            # read_timeout(300초) × 2 + connect_timeout 여유를 더해도 약
            # 610초로, Lambda 자체 타임아웃 900초 안에 충분히 들어온다(3으로
            # 올리면 최악의 경우 915초로 초과 위험).
            "config": BotoConfig(
                read_timeout=_BEDROCK_READ_TIMEOUT_SECONDS, connect_timeout=5,
                retries={"max_attempts": 2, "mode": "standard"},
            ),
        }
        endpoint = os.environ.get("BEDROCK_ENDPOINT_URL")
        if endpoint:
            kwargs["endpoint_url"] = endpoint
        _bedrock_client = boto3.client("bedrock-runtime", **kwargs)
    return _bedrock_client

# Postgres엔 DynamoDB 400KB 아이템 한계가 없지만, 첨부 남용 방지용 sane
# 상한으로 그대로 유지한다. 한글은 UTF-8에서 3바이트라 글자 수로 재면
# 3배를 놓친다 — 반드시 인코딩 후 길이로 잰다.
_MAX_PAYLOAD_BYTES = 340 * 1024


def handle_list(body: dict, path_params: dict, query_params: dict) -> dict:
    prompts = prompts_repo.list_prompts()
    prompts.sort(key=lambda p: p["id"])
    return response.ok({"prompts": prompts})


def handle_current_model(body: dict, path_params: dict, query_params: dict) -> dict:
    """지금 이 카테고리가 실제 발행에 쓰는 모델 이름 — 프론트 채팅랩 헤더의
    "실시간 연결됨" 옆 배지가 이걸 그대로 찍는다(2026-09-24, 사용자 요청:
    "프로덕션 기본값(레터) 이거는... 헷갈릴 것 같은데... 배지 형태로...
    작업자가 다른 모델로 발행하면 바뀌고... 지금은 하드코딩된거라 바뀌면
    또 바꿔야 하잖아요" — _CATEGORY_BEDROCK["model_label"]이 정본이라
    거기 값만 바꾸면 프론트 재배포 없이 다음 새로고침부터 바로 반영된다)."""
    category = (path_params or {}).get("category", "")
    cfg = _CATEGORY_BEDROCK.get(category)
    if not cfg:
        return response.err(f"unknown category: {category}", 400)
    return response.ok({"category": category, "label": cfg["model_label"]})


def handle_get(body: dict, path_params: dict, query_params: dict) -> dict:
    category = (path_params or {}).get("category", "")
    name = (path_params or {}).get("name", "")
    if not category or not name:
        return response.err("category and name required", 400)

    prompt = prompts_repo.get_prompt(category, name)
    if not prompt:
        return response.err(f"prompt not found: {category}/{name}", 404)

    payload = {
        "id": prompt["id"],
        "active_content": prompt["active_content"],
        "active_version": prompt["active_version"],
        "history": prompt["history"],
    }
    # sections 는 있을 때만 실어 보낸다 — 옛 버전엔 없고, 그때 편집기는
    # active_content 를 한 섹션으로 열어야 한다. 기존 응답 필드는 그대로 둔다
    # (characterization 테스트가 고정하고 있다).
    if prompt.get("sections") is not None:
        payload["sections"] = prompt["sections"]

    return response.ok(payload)


def handle_get_history(body: dict, path_params: dict, query_params: dict) -> dict:
    """버전 드롭다운 채우기용 — content 없이 버전·시각만(handle_get_version
    docstring 참고, 2026-09-21)."""
    category = (path_params or {}).get("category", "")
    name = (path_params or {}).get("name", "")
    if not category or not name:
        return response.err("category and name required", 400)
    return response.ok({"history": prompts_repo.get_prompt_history(category, name)})


def handle_get_version(body: dict, path_params: dict, query_params: dict) -> dict:
    """과거 버전 content 하나 조회 — 버전 드롭다운으로 골라 지금 초안/발행본을
    건드리지 않고 테스트 실행하는 용도(2026-09-21, 사용자 요청)."""
    category = (path_params or {}).get("category", "")
    name = (path_params or {}).get("name", "")
    version_raw = (path_params or {}).get("version", "")
    if not category or not name or not version_raw:
        return response.err("category, name and version required", 400)
    try:
        version = int(version_raw)
    except (TypeError, ValueError):
        return response.err("version must be an integer", 400)

    v = prompts_repo.get_prompt_version(category, name, version)
    if not v:
        return response.err(f"prompt version not found: {category}/{name} v{version}", 404)
    return response.ok(v)


def handle_update(body: dict, path_params: dict, query_params: dict) -> dict:
    category = (path_params or {}).get("category", "")
    name = (path_params or {}).get("name", "")
    if not category or not name:
        return response.err("category and name required", 400)

    new_content = body.get("content", "")
    if not new_content:
        return response.err("content required", 400)

    # sections 는 optional — 평문만 저장하는 /prompts/edit 경로는 안 보낸다.
    sections = body.get("sections")
    if sections is not None and not isinstance(sections, dict):
        return response.err("sections must be an object", 400)

    # 2026-09-26 — activate 추가(기본 True, 기존 /prompts/edit·프로덕션
    # "발행" 흐름은 그대로 즉시 활성화). 테스트 카드의 "버전 저장"만
    # False를 보내 프로덕션 활성값을 안 건드리고 버전만 남긴다.
    activate = body.get("activate", True)
    if not isinstance(activate, bool):
        return response.err("activate must be a boolean", 400)

    payload_bytes = len(new_content.encode("utf-8"))
    if sections is not None:
        payload_bytes += len(json.dumps(sections, ensure_ascii=False).encode("utf-8"))
    if payload_bytes > _MAX_PAYLOAD_BYTES:
        return response.err(
            f"prompt too large: {payload_bytes} bytes "
            f"(max {_MAX_PAYLOAD_BYTES}) — 첨부를 줄여 주세요",
            400,
        )

    result = prompts_repo.update_prompt(category, name, new_content, sections, activate)
    new_version = result["new_version"]
    prev_version = result["prev_version"]
    created = result["created"]

    audit.log("prompt-update", {
        "prompt": f"{category}/{name}",
        "new_version": new_version,
        "prev_version": prev_version,
        "created": created,
        "has_sections": sections is not None,
        "activate": activate,
        "bytes": payload_bytes,
    })
    return response.ok({
        "ok": True,
        "new_version": new_version,
        "created": created,
    })


def handle_activate_version(body: dict, path_params: dict, query_params: dict) -> dict:
    """이미 존재하는 버전을 프로덕션 활성값으로 승격한다(새 버전을 만들지
    않음) — 2026-09-26 신설, update_prompt(activate=False)로 저장해둔
    테스트 버전을 "프로덕션에 적용" 버튼이 부른다."""
    category = (path_params or {}).get("category", "")
    name = (path_params or {}).get("name", "")
    if not category or not name:
        return response.err("category and name required", 400)

    version = body.get("version")
    if not isinstance(version, int):
        return response.err("version (int) required", 400)

    result = prompts_repo.activate_version(category, name, version)
    if result is None:
        return response.err("prompt version not found", 404)

    audit.log("prompt-activate", {"prompt": f"{category}/{name}", "version": version})
    return response.ok(result)


def handle_delete_version(body: dict, path_params: dict, query_params: dict) -> dict:
    """버전 하나를 완전히 삭제한다 — 2026-09-26 신설, 사용자 요청: "버전을
    삭제하는 방법도 있어야 할 것 같고." 지금 프로덕션에서 쓰이는(활성)
    버전은 삭제를 거부한다."""
    category = (path_params or {}).get("category", "")
    name = (path_params or {}).get("name", "")
    version_raw = (path_params or {}).get("version", "")
    if not category or not name or not version_raw:
        return response.err("category, name and version required", 400)
    try:
        version = int(version_raw)
    except (TypeError, ValueError):
        return response.err("version must be an integer", 400)

    result = prompts_repo.delete_version(category, name, version)
    if not result.get("deleted"):
        if result.get("reason") == "active":
            return response.err(
                "지금 프로덕션에서 쓰이는 버전은 삭제할 수 없습니다 — 다른 버전을 먼저 적용한 뒤 삭제해 주세요.",
                400,
            )
        return response.err("prompt version not found", 404)

    audit.log("prompt-delete-version", {"prompt": f"{category}/{name}", "version": version})
    return response.ok(result)


def handle_rename_version(body: dict, path_params: dict, query_params: dict) -> dict:
    """버전 번호·내용은 그대로 두고 이름표(sections.label)만 바꾼다 —
    2026-09-26 신설, 사용자 지적: "버전이름도 수정가능하게 해야합니다".
    "버전 저장"은 항상 새 버전을 만드는 동작이라 기존 버전의 이름만
    고치는 덴 안 맞아서 별도로 뚫었다."""
    category = (path_params or {}).get("category", "")
    name = (path_params or {}).get("name", "")
    version_raw = (path_params or {}).get("version", "")
    if not category or not name or not version_raw:
        return response.err("category, name and version required", 400)
    try:
        version = int(version_raw)
    except (TypeError, ValueError):
        return response.err("version must be an integer", 400)

    label = body.get("label")
    if not isinstance(label, str):
        return response.err("label (string) required", 400)

    result = prompts_repo.rename_version(category, name, version, label)
    if result is None:
        return response.err("prompt version not found", 404)

    audit.log("prompt-rename-version", {"prompt": f"{category}/{name}", "version": version})
    return response.ok(result)


def handle_get_activation_history(body: dict, path_params: dict, query_params: dict) -> dict:
    """"프로덕션에 적용" 이력 조회 — 2026-09-26 신설, 사용자 요청: "프로덕션에
    적용한 이력들도 남아야 해요, 몇시 몇분... 날짜에 했는지"."""
    category = (path_params or {}).get("category", "")
    name = (path_params or {}).get("name", "")
    if not category or not name:
        return response.err("category and name required", 400)

    history = prompts_repo.get_activation_history(category, name)
    return response.ok({"history": history})


_MAX_TEST_ARTICLE_BYTES = 60 * 1024  # 기사 원문 상한 — 과금 폭주 방지


def _call_bedrock(
    model: str,
    system_prompt: str,
    user_message: str,
    *,
    max_tokens: int,
    temperature: float | None = None,
) -> str:
    """Bedrock converse 저수준 호출부 — _run_test_job/_run_storyboard_job
    공용. bedrock_client.py(pipelines/common, call_text)와 같은 시그니처
    원칙을 따르되, 여기는 파이프라인 전용 모듈을 admin Lambda에 끌어오지
    않고 직접 구현했다(admin/backend는 pipelines/를 import하지 않는다).

    cachePoint(2026-09-24 추가) — 호출부(_call_bedrock_for_category)가 항상
    _CATEGORY_BEDROCK의 카테고리 기본 모델(전부 Claude 프로파일, GPT-6 없음)
    로만 부른다 — model_supports_prompt_cache 판단 없이 무조건 붙여도
    안전하다(gpt-6 계열이 캐싱을 거부하는 문제는 chat_ws.py의 모델
    드롭다운 경로에서만 해당)."""
    client = _get_bedrock_client()
    inference_config = {"maxTokens": max_tokens}
    if temperature is not None:
        inference_config["temperature"] = temperature
    try:
        resp = client.converse(
            modelId=model,
            system=[{"text": system_prompt}, {"cachePoint": {"type": "default"}}],
            messages=[{"role": "user", "content": [{"text": user_message}]}],
            inferenceConfig=inference_config,
        )
    except Exception as e:
        raise RuntimeError(f"Bedrock 호출 실패: {e}")
    for block in resp["output"]["message"]["content"]:
        if "text" in block:
            return block["text"]
    raise RuntimeError(f"Bedrock 응답에 text 블록이 없습니다: {resp['output']['message']['content']}")


def _call_bedrock_for_category(category: str, content: str, article: str) -> str:
    """content(프롬프트 산문) + article(기사 원문) → 그 채널의 실제
    프로덕션 모델·호출 방식으로 1회 호출. facts.json 같은 중간 산출물 없이
    기사 원문을 곧바로 넘긴다 — 프롬프트 품질을 빠르게 확인하는 용도라
    이 정도면 충분하다(정식 발행은 실제 파이프라인이 한다)."""
    cfg = _CATEGORY_BEDROCK.get(category)
    if not cfg:
        raise ValueError(f"지원하지 않는 채널입니다: {category}")

    if cfg["mode"] == "webtoon_json":
        return _call_bedrock(
            cfg["model"],
            _WEBTOON_SYSTEM_PROMPT,
            content + "\n\n[입력 기사]\n" + article + _WEBTOON_JSON_INSTRUCTION,
            max_tokens=cfg["max_tokens"],
            temperature=0.7,
        )
    # "system" 모드 — letters/podcast/video: 지침을 system 메시지로 그대로.
    return _call_bedrock(
        cfg["model"],
        content,
        cfg["user_template"].format(article=article),
        max_tokens=cfg["max_tokens"],
    )


# ---------- 비동기 작업 저장소 (webtoon_lab.py와 같은 패턴 — config 테이블에
# pk 네임스페이스 하나씩 더 늘리는 방식, 새 테이블 안 만듦) ----------

_TEST_JOB_PK = "PROMPTTEST"


def _job_table():
    return ddb_client.config_table()


def _use_pg() -> bool:
    """JOBS_BACKEND=pg 이면 Postgres(admin_jobs, v1.36)를 쓴다. 기본은 DynamoDB — 이관 검증이 끝나면 pg 로 바꾼다."""
    return os.environ.get("JOBS_BACKEND", "ddb").lower() == "pg"


def _put_job(pk: str, job_id: str, item: dict) -> None:
    if _use_pg():
        admin_jobs_repo.put_job("prompt_test", job_id, item)
        return
    _job_table().put_item(Item={"pk": pk, "sk": f"job/{job_id}", **item})


def _update_job(pk: str, job_id: str, updates: dict) -> None:
    if _use_pg():
        admin_jobs_repo.update_job("prompt_test", job_id, updates)
        return
    expr_names = {f"#{k}": k for k in updates}
    expr_values = {f":{k}": v for k, v in updates.items()}
    update_expr = "SET " + ", ".join(f"#{k} = :{k}" for k in updates)
    _job_table().update_item(
        Key={"pk": pk, "sk": f"job/{job_id}"},
        UpdateExpression=update_expr,
        ExpressionAttributeNames=expr_names,
        ExpressionAttributeValues=expr_values,
    )


def _get_job(pk: str, job_id: str) -> dict | None:
    if _use_pg():
        return admin_jobs_repo.get_job("prompt_test", job_id)
    resp = _job_table().get_item(Key={"pk": pk, "sk": f"job/{job_id}"})
    return resp.get("Item")


def _self_invoke_async(payload: dict) -> None:
    """자기 자신을 InvocationType="Event"로 다시 호출해 느린 작업(Bedrock)을
    완전히 별개의 invocation에서 처리한다 — handler.py의 "_async_prompt_job"
    분기가 그 invocation을 받아 여기 run_async_job()으로 보낸다.
    webtoon_lab.py의 threading 방식(그 파일 docstring이 직접 경고하는
    위험 — Lambda가 응답을 보내자마자 실행 환경을 얼릴 수 있어 스레드가
    안 끝날 수 있음)은 수 초짜리 작업엔 버텨도 여기처럼 25~40초 이상
    걸리는 작업엔 못 버틴다. self-invoke는 새 invocation이라 그 문제가
    없고, Lambda 자체 Timeout을 300초로 늘려둬서 충분한 여유가 있다."""
    lambda_client = boto3.client("lambda")
    function_name = os.environ.get("AWS_LAMBDA_FUNCTION_NAME", "sedaily-mbti-admin-api-dev")
    lambda_client.invoke(
        FunctionName=function_name,
        InvocationType="Event",
        Payload=json.dumps({"_async_prompt_job": payload}).encode("utf-8"),
    )


def run_async_job(payload: dict) -> None:
    """handler.py가 self-invoke된 별도 invocation에서 직접 호출 — HTTP
    라우팅을 안 거친다(응답도 API Gateway로 안 나간다, 결과는 job
    레코드에 써서 폴링 쪽이 읽게 한다)."""
    kind = payload.get("kind")
    job_id = payload.get("job_id")
    if kind == "test":
        _run_test_job(job_id, payload["category"], payload["content"], payload["article"])


def _run_test_job(job_id: str, category: str, content: str, article: str) -> None:
    try:
        output = _call_bedrock_for_category(category, content, article)
        _update_job(_TEST_JOB_PK, job_id, {"status": "done", "output": output, "updated_at": time_utils.now_iso()})
        audit.log("prompt-test-done", {"job_id": job_id, "prompt": category, "output_bytes": len(output.encode("utf-8"))})
    except Exception as e:  # noqa: BLE001 — 비동기 invocation 최상위, 여기서 안 잡으면 job이 영원히 pending으로 남는다
        _update_job(_TEST_JOB_PK, job_id, {"status": "error", "error": str(e)[:500], "updated_at": time_utils.now_iso()})


def handle_test(body: dict, path_params: dict, query_params: dict) -> dict:
    """프롬프트 드로어의 "테스트 실행" — 저장 여부와 무관하게 지금 편집 중인
    content를 기사 원문과 함께 그 채널의 실제 프로덕션 모델에 넘겨 산출물을
    반환한다. Bedrock 호출이 API Gateway 30초 벽을 넘길 수 있어(실측 확인—
    레터 Opus 5는 max_tokens을 1500으로 줄여도 25초에 480자밖에 못 뽑았다)
    작업만 만들고 바로 돌아간다 — 실제 결과는 handle_test_status로 폴링."""
    category = (path_params or {}).get("category", "")
    name = (path_params or {}).get("name", "")
    if not category or not name:
        return response.err("category and name required", 400)

    content = (body.get("content") or "").strip()
    article = (body.get("article") or "").strip()
    if not content:
        return response.err("content required", 400)
    if not article:
        return response.err("article required", 400)
    if len(article.encode("utf-8")) > _MAX_TEST_ARTICLE_BYTES:
        return response.err(
            f"기사 원문이 너무 깁니다 (최대 {_MAX_TEST_ARTICLE_BYTES // 1024}KB)", 400
        )
    if category not in _CATEGORY_BEDROCK:
        return response.err(f"이 채널은 테스트 실행을 지원하지 않습니다: {category}", 400)

    job_id = uuid.uuid4().hex[:16]
    now = time_utils.now_iso()
    _put_job(_TEST_JOB_PK, job_id, {"status": "pending", "prompt": f"{category}/{name}", "created_at": now, "updated_at": now})
    _self_invoke_async({"kind": "test", "job_id": job_id, "category": category, "content": content, "article": article})

    audit.log("prompt-test-start", {
        "prompt": f"{category}/{name}",
        "job_id": job_id,
        "article_bytes": len(article.encode("utf-8")),
    })
    return response.ok({"job_id": job_id, "status": "pending"})


def handle_test_status(body: dict, path_params: dict, query_params: dict) -> dict:
    job_id = (path_params or {}).get("job_id", "")
    if not job_id:
        return response.err("job_id required", 400)
    item = _get_job(_TEST_JOB_PK, job_id)
    if not item:
        return response.err("job not found", 404)
    return response.ok({
        "job_id": job_id,
        "status": item.get("status"),
        "output": item.get("output"),
        "error": item.get("error"),
    })


# 웹툰 스크립트+장면 연출 생성(챕터 추출·단일 Bedrock 호출 조립·컷
# 정규화)은 2026-09-20에 routes/webtoon/script.py로 옮겼다(사용자 요청:
# "웹툰 관련한거는... 기능별로 코드파일들이 있기를 원하는데요") — 이
# 파일엔 여러 카테고리가 공유하는 _CATEGORY_BEDROCK/_WEBTOON_SYSTEM_PROMPT/
# _WEBTOON_JSON_INSTRUCTION만 남는다(routes/webtoon/script.py가 import).


