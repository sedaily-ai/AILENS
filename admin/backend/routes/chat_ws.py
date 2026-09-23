"""프롬프트 실험 채팅(PromptChatLab.tsx) — WebSocket 실시간 스트리밍.

2026-09-14 신설(사용자 요청: "실제 챗봇이랑 이야기 하듯이... 웹소켓을
연결해서 실시간 스트리밍 방식으로"). 별도 API Gateway WebSocket API
(p4yjifd5v1, 스테이지 dev — HTTP API인 chzwwtjtgk와는 다른 API)가 이 모듈로
라우팅한다(handler.py의 eventType 분기 참고). 같은 Lambda 함수
(sedaily-mbti-admin-api-dev)를 그대로 재사용 — 새 함수를 안 만들면 IAM·
패키징을 또 새로 만들 필요가 없다.

**설계**: WebSocket 라우트(AWS_PROXY 통합)의 응답 시간은 HTTP API와 똑같이
약 29초로 제한된다 — Bedrock 스토리보드 생성(수십 초)·GPU 부팅(1~3분)은
그 안에 못 끝낸다. 그래서 메시지 수신 핸들러는 "받았다"만 빠르게 응답하고,
실제 작업은 routes/prompts.py·routes/webtoon/의 기존 self-invoke
비동기(Event invocation) 패턴을 그대로 재사용해 떼어낸다 — 다른 점은
그 비동기 작업이 끝났을 때 DynamoDB에 써서 클라이언트가 폴링하게 하는
대신, 여기서는 `post_to_connection`으로 그 커넥션에 직접 결과를 밀어넣는다
(연결 상태를 저장하는 테이블이 없다 — 매 메시지 이벤트에 connectionId가
그대로 실려 오고, 그 값을 self-invoke payload에 얹어 다음 invocation까지
그대로 들고 가면 되므로 조회할 이유가 없다).

**인증**: 브라우저 네이티브 WebSocket API는 커스텀 헤더를 못 붙인다 — HTTP
API처럼 Authorization 헤더를 못 쓰고, $connect 요청의 쿼리스트링(?token=)
으로 JWT를 받는다. 이게 HTTP API 인증과 다른 유일한 지점 — 라우트
핸들러(chat_ws.py 자기 자신)의 나머지 로직은 이미 인증된 연결에서만
호출된다는 전제라 별도 검증이 없다(WebSocket API 특성상 $connect를
통과해야만 이후 메시지 프레임이 온다)."""
from __future__ import annotations

import json
import logging
import os
import uuid
from typing import Callable

import boto3

import auth
from repo import prompt_lab_repo, prompts_repo
from routes.webtoon import generate as webtoon_generate
from routes.webtoon import gpu as webtoon_gpu
from routes.webtoon import jobs as webtoon_jobs
from routes.webtoon import script as webtoon_script
from shared import time_utils
from routes.prompts import _CATEGORY_BEDROCK, _get_bedrock_client, resolve_text_model, text_model_supports_temperature
from json_extract import extract_json_object  # pipelines/common/ — deploy 시 zip 루트에 복사됨(routes/prompts.py와 동일 패턴)
import podcast_voice  # pipelines/common/ — 배포 시 zip 루트에 복사됨(webtoon_image.py와 동일 패턴)

logger = logging.getLogger(__name__)

Push = Callable[[dict], bool]

# 2026-09-16 — 기사 원문을 받자마자 짧게 반응하는 문구(_stream_reaction)를
# 없앴다(사용자 요청: "짧은 반응 문구는 필요없고... 기사를 보내면 프롬프트에
# 있는 내용 기반으로 답변이 출력되는거고"). 일반 대화(_run_chat_flow)는
# 여전히 이 모델로 스트리밍한다.
_REACTION_MODEL = _CATEGORY_BEDROCK["webtoon"]["model"]  # lens-webtoon-script-sonnet-46 재사용

# 기사도 컷 요청도 아닌 일반 대화 — 2026-09-15 사용자 요청: "자연스럽게
# 대화가 가능하도록... 일반 챗봇처럼... 베드락 모두 호출되도록". 예전엔
# 프런트(PromptChatLab.tsx)가 40자 미만·컷 패턴도 아닌 텍스트를 고정
# 안내 문구로만 되돌려서 이 경로에선 Bedrock을 아예 안 불렀다.
# 2026-09-22 — 레터·팟캐스트·영상 탭(PromptTextLab.tsx) 추가로 이 페르소나가
# 카테고리마다 달라져야 한다. 웹툰만 이미지 패널 안내가 실제로 맞는
# 설명이라 그대로 두고, 나머지 3개는 "이 화면"에 텍스트만 있다는 공용
# 문구를 쓴다 — 어차피 저장된 지침(saved_draft)이 있으면 이 상수 자체가
# 안 쓰인다(_run_chat_flow docstring 참고), 지침을 아직 안 써둔 초기
# 상태에서만 보이는 폴백이라 카테고리 이름 하나 틀렸다고 실사용에 영향은
# 적지만 그래도 맞춰둔다.
_CHAT_SYSTEM = (
    "당신은 AI LENS 웹툰 프롬프트 실험 챗봇입니다. 사용자와 자연스러운"
    " 한국어 대화체로 이야기하세요. 이 화면은 왼쪽(텍스트)과 오른쪽(이미지)이"
    " 나뉘어 있습니다 — 사용자가 기사 원문을 붙여넣으면 여기(왼쪽)서 스크립트와"
    " 장면 연출을 한 번에 만들어줍니다. 컷 이미지 생성은"
    " 이 채팅이 아니라 오른쪽 이미지 패널(칸마다 프롬프트+생성 버튼)에서"
    " 합니다 — 여기 채팅에 '3번 컷'이나 '전체 컷'처럼 쳐도 이미지가 생성되지"
    " 않으니, 그런 요청이 오면 오른쪽 패널을 쓰라고 안내하세요. 그 외"
    " 인사·질문·잡담에는 짧고 자연스럽게 답하세요. 장황하게 설명하지 말고"
    " 대화하듯 짧게 답하세요."
)

_CATEGORY_LABEL = {"letters": "레터", "webtoon": "웹툰", "podcast": "팟캐스트", "video": "영상"}

_CHAT_SYSTEM_GENERIC = (
    "당신은 AI LENS {label} 프롬프트 실험 챗봇입니다. 사용자와 자연스러운"
    " 한국어 대화체로 이야기하세요. 사용자가 기사 원문을 붙여넣으면 지금"
    " 저장된 지침을 기준으로 {label} 산출물을 만들어 보여줍니다. 그 외"
    " 인사·질문·잡담에는 짧고 자연스럽게 답하세요. 장황하게 설명하지 말고"
    " 대화하듯 짧게 답하세요."
)


def handle_connect(event: dict) -> dict:
    qs = event.get("queryStringParameters") or {}
    token = qs.get("token")
    try:
        auth.verify_jwt(f"Bearer {token}" if token else None)
    except auth.AuthError as e:
        logger.info(f"ws connect rejected: {e}")
        return {"statusCode": 401, "body": "unauthorized"}
    return {"statusCode": 200}


def handle_disconnect(event: dict) -> dict:
    # 연결 상태를 저장하지 않으므로(위 docstring 참고) 정리할 것도 없다 —
    # API Gateway가 커넥션 자체는 알아서 정리한다.
    return {"statusCode": 200}


def handle_message(event: dict) -> dict:
    request_context = event.get("requestContext") or {}
    connection_id = request_context.get("connectionId")
    domain_name = request_context.get("domainName")
    stage = request_context.get("stage")
    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return {"statusCode": 400}

    kind = body.get("kind")
    # 프런트(PromptChatLab.tsx)가 4분마다 보내는 유휴 방지용 ping(2026-09-15
    # — API Gateway WebSocket 10분 유휴 타임아웃은 하드 리밋이라 늘릴 수
    # 없다. 실제로 패널을 오래 열어두고 있다가 메시지를 보내면 정확히 그
    # 순간 연결이 이미 끊겨 있었다). self-invoke 비동기 경로를 안 타고
    # 이 연결에서 바로 pong을 돌려준다 — Bedrock/DB 없이 그냥 살아있다는
    # 확인만 하면 되는 요청이라 굳이 별도 Lambda invocation을 하나 더
    # 만들 이유가 없다.
    if kind == "ping":
        if connection_id and domain_name and stage:
            _make_push(domain_name, stage, connection_id)({"type": "pong"})
        return {"statusCode": 200}

    payload = {
        "kind": kind,
        "connection_id": connection_id,
        "domain_name": domain_name,
        "stage": stage,
        "data": body.get("data") or {},
    }
    _self_invoke_async(payload)
    return {"statusCode": 200}


def _self_invoke_async(payload: dict) -> None:
    """routes/prompts.py::_self_invoke_async와 같은 패턴 — 마커 키만
    "_async_ws_job"으로 달리해서 handler.py가 세 모듈의 비동기 작업을
    구분한다."""
    lambda_client = boto3.client("lambda")
    function_name = os.environ.get("AWS_LAMBDA_FUNCTION_NAME", "sedaily-mbti-admin-api-dev")
    lambda_client.invoke(
        FunctionName=function_name,
        InvocationType="Event",
        Payload=json.dumps({"_async_ws_job": payload}).encode("utf-8"),
    )


def _management_client(domain_name: str, stage: str):
    endpoint = f"https://{domain_name}/{stage}"
    return boto3.client("apigatewaymanagementapi", endpoint_url=endpoint, region_name="us-east-1")


def _make_push(domain_name: str, stage: str, connection_id: str) -> Push:
    client = _management_client(domain_name, stage)

    def push(data: dict) -> bool:
        try:
            client.post_to_connection(
                ConnectionId=connection_id,
                Data=json.dumps(data, ensure_ascii=False).encode("utf-8"),
            )
            return True
        except client.exceptions.GoneException:
            logger.info(f"ws connection gone: {connection_id}")
            return False
        except Exception as e:  # noqa: BLE001 — 푸시 실패가 나머지 작업을 막으면 안 됨
            logger.warning(f"post_to_connection failed: {e}")
            return False

    return push


_LAB_NAME = "published"


def _resolve_saved_draft(category: str) -> str | None:
    """우측 패널에 저장된 지침(prompt_lab_docs)을 서버에서 직접 읽어온다 —
    nova와 같은 방식(2026-09-16, 사용자 확인: "노바랑 동일한 방식으로
    하면 됩니다", nova/backend/websocket/prompt_builder.py::
    load_engine_full_prompt 패턴). 클라이언트는 프롬프트 원문을 전혀 안
    보낸다 — WebSocket 프레임 크기(32KB) 문제가 구조적으로 없어진다.
    저장된 게 비어 있으면 None — 호출부가 각자의 기본값으로 폴백한다
    (article/step2는 발행된 프로덕션 프롬프트, chat은 고정 페르소나).

    category(2026-09-22 추가) — 예전엔 웹툰으로 고정돼 있었다(모듈
    상수 _LAB_CATEGORY). 레터·팟캐스트·영상 탭(PromptTextLab.tsx)이
    생기면서 프런트가 보낸 category를 그대로 받아 그 카테고리의 저장된
    지침을 읽는다 — 카테고리마다 prompt_lab_docs가 따로 있다."""
    try:
        draft = prompt_lab_repo.assemble_draft(category, _LAB_NAME)
    except Exception as e:  # noqa: BLE001 — 지침 조회 실패해도 기본값 폴백으로 계속 진행
        logger.warning(f"저장된 지침 조회 실패(category={category!r}): {e}")
        return None
    return draft if draft.strip() else None


def run_async_job(payload: dict) -> None:
    """handler.py가 self-invoke된 별도 invocation에서 직접 호출."""
    kind = payload.get("kind")
    connection_id = payload.get("connection_id")
    domain_name = payload.get("domain_name")
    stage = payload.get("stage")
    if not (connection_id and domain_name and stage):
        logger.warning(f"ws job 누락된 연결 정보: {payload}")
        return
    data = payload.get("data") or {}
    push = _make_push(domain_name, stage, connection_id)
    # 2026-09-22 — category(레터/웹툰/팟캐스트/영상)는 프런트가 매 메시지에
    # 실어 보낸다(PromptChatLab.tsx는 안 보내던 시절 그대로 "webtoon"
    # 생략 가능 — 기본값으로 기존 동작 유지). saved_draft도 이제 그
    # category의 지침이어야 해서 category를 먼저 정해야 한다.
    category = data.get("category") or "webtoon"
    saved_draft = _resolve_saved_draft(category)

    if kind == "chat":
        _run_chat_flow(push, data.get("message") or "", data.get("history") or [], saved_draft, data.get("model"), category)
    elif kind == "article":
        _run_article_flow(push, data.get("article") or "", saved_draft, data.get("model"), data.get("version"), category)
    elif kind == "cut_image":
        _run_cut_image_flow(push, data.get("cut") or {}, data.get("model") or "pipeline")
    elif kind == "gpu_start":
        webtoon_gpu.run_gpu_start(uuid.uuid4().hex[:16], push=push)
    elif kind == "gpu_stop":
        _run_gpu_stop_flow(push)
    elif kind == "synthesize_audio":
        _run_synthesize_audio_flow(push, data.get("text") or "", data.get("slot_id") or "")
    elif kind == "render_video":
        _run_render_video_flow(push, data.get("text") or "", data.get("slot_id") or "")
    else:
        push({"type": "error", "message": f"알 수 없는 요청입니다: {kind}"})


def _stream_completion(push: Push, system: str, messages: list[dict], max_tokens: int = 400, model: str | None = None) -> None:
    """converse_stream으로 텍스트를 토큰 단위로 밀어넣는다 — 기사 반응 문구·
    자유 대화 공용(2026-09-15, 자유 대화 추가하며 일반화). 완료되면
    text_done을 보낸다.

    model(2026-09-20 추가) — 없으면 기존처럼 _REACTION_MODEL(Sonnet 4.6)
    을 쓴다 — 좌측 채팅창 모델 드롭다운에서 고른 값을 _run_chat_flow가
    resolve_text_model()로 바꿔 넘긴다."""
    client = _get_bedrock_client()
    logger.info(f"stream_completion system(앞 200자)={system[:200]!r} messages={len(messages)}개")
    try:
        resp = client.converse_stream(
            modelId=model or _REACTION_MODEL,
            system=[{"text": system}],
            messages=messages,
            inferenceConfig={"maxTokens": max_tokens},
        )
        for chunk in resp["stream"]:
            delta = (chunk.get("contentBlockDelta") or {}).get("delta") or {}
            text = delta.get("text")
            if text:
                if not push({"type": "text_chunk", "text": text}):
                    return  # 연결이 끊겼으면 남은 청크를 계속 보낼 이유가 없다
    except Exception as e:  # noqa: BLE001 — 스트리밍 실패해도 호출부 흐름은 계속돼야 함
        logger.warning(f"stream completion failed: {e}")
    push({"type": "text_done"})


def _stream_json_completion(
    push: Push, event_type: str, system: str, user_message: str, model: str, max_tokens: int, use_temperature: bool = True
) -> str:
    """스크립트+장면 연출 JSON 생성을 converse_stream으로 돌려 실시간 원문
    청크를 `{event_type}_chunk`로 중계하고, 다 받으면
    `{event_type}_chunk_done`을 보낸 뒤 누적된 전체 텍스트를 반환한다
    (호출부가 JSON으로 파싱).

    2026-09-16, 사용자 요청: "출력하는것도 단계별로 쪼개서 출력을 해줘야
    해요" — 그 전까진 논스트리밍 _call_bedrock이라 8000토큰짜리 응답이 다
    만들어질 때까지 화면엔 점 세 개만 뜨고 아무 진행 표시가 없었다(반응
    문구만 진짜 스트리밍이던 것과 대비). 반쪽짜리 JSON 자체는 구조화해서
    보여줄 게 못 되므로(잘린 필드·안 닫힌 괄호), 프런트는 이 청크들을
    완성된 카드가 아니라 "생성 중" 원문 미리보기로만 렌더링하고, chunk_done
    다음에 오는 최종 storyboard 메시지가 도착하면 그걸로 교체한다 — 반쪽
    JSON을 파싱하려 들지 않는다.

    use_temperature(2026-09-20 추가) — Opus 5·Sonnet 5는 converse의
    temperature 파라미터 자체를 ValidationException으로 거부한다
    (`text_model_supports_temperature` 참고, 실측 확인). 좌측 채팅창
    모델 드롭다운으로 이 모델들을 고를 수 있게 되면서 무조건 0.7을
    넣던 게 그 모델들에서 깨진다 — 호출부(_run_article_flow)가
    prompts.text_model_supports_temperature(model_id)로 판단해 넘긴다."""
    client = _get_bedrock_client()
    parts: list[str] = []
    try:
        inference_config: dict = {"maxTokens": max_tokens}
        if use_temperature:
            inference_config["temperature"] = 0.7
        resp = client.converse_stream(
            modelId=model,
            system=[{"text": system}],
            messages=[{"role": "user", "content": [{"text": user_message}]}],
            inferenceConfig=inference_config,
        )
        for chunk in resp["stream"]:
            delta = (chunk.get("contentBlockDelta") or {}).get("delta") or {}
            text = delta.get("text")
            if text:
                parts.append(text)
                if not push({"type": f"{event_type}_chunk", "text": text}):
                    break  # 연결이 끊겼으면 남은 청크를 계속 보낼 이유가 없다
    finally:
        push({"type": f"{event_type}_chunk_done"})
    return "".join(parts)


def _run_chat_flow(
    push: Push,
    message: str,
    history: list[dict],
    saved_draft: str | None = None,
    model_id: str | None = None,
    category: str = "webtoon",
) -> None:
    """기사도 컷 요청도 아닌 일반 대화 — 최근 대화 몇 턴을 같이 넘겨서
    자연스럽게 이어지게 한다(2026-09-15 사용자 요청). history는
    프런트(PromptChatLab.tsx/PromptTextLab.tsx)가 보낸 [{role, text}] —
    role은 "user"/"assistant"만 신뢰한다.

    saved_draft(우측 패널에 저장된 설명+지침+파일 조립본, run_async_job이
    _resolve_saved_draft(category)로 미리 읽어와 넘겨준다)가 있으면
    그걸 그대로 시스템 프롬프트로 쓴다 — 고정 페르소나 대신 저장해 둔
    프롬프트 내용을 기준으로 답하게 하기 위함(2026-09-15 사용자 요청:
    "프롬프트에 입력했을 때.. 기반으로 답변이 출력되도록"). 없으면(저장된
    게 아직 없을 때) category에 맞는 폴백 페르소나로 — 웹툰은 기존
    _CHAT_SYSTEM(오른쪽 이미지 패널 안내 포함, 실제로 그 패널이 있음),
    나머지 3개(2026-09-22 추가)는 _CHAT_SYSTEM_GENERIC.

    model_id(2026-09-20 추가) — 좌측 채팅창 모델 드롭다운 선택값
    (prompts.TEXT_MODELS 키)."""
    if not message.strip():
        return
    if saved_draft and saved_draft.strip():
        system = saved_draft
    elif category == "webtoon":
        system = _CHAT_SYSTEM
    else:
        system = _CHAT_SYSTEM_GENERIC.format(label=_CATEGORY_LABEL.get(category, category))
    messages: list[dict] = []
    for turn in history[-10:]:
        role = "user" if turn.get("role") == "user" else "assistant"
        text = (turn.get("text") or "").strip()
        if text:
            messages.append({"role": role, "content": [{"text": text[:4000]}]})
    messages.append({"role": "user", "content": [{"text": message[:4000]}]})
    # max_tokens=400은 너무 작았다(2026-09-15, 사용자가 실제로 겪은 버그 —
    # "샘플 출력해줘"처럼 모델이 긴 예시(가상 기사 전문 등)를 쓰려고 하면
    # 문장 중간에서 뚝 끊겼다. 타임아웃이 아니라 순수 토큰 상한 문제였음).
    # saved_draft가 실제 웹툰 프롬프트일 때도 모델이 예시로 스토리보드
    # 초안을 풀어 쓸 수 있어 여유 있게 잡는다.
    _stream_completion(push, system, messages, max_tokens=2000, model=resolve_text_model(model_id))


def _resolve_prompt_content(
    push: Push, saved_draft: str | None, category: str = "webtoon", version: int | None = None
) -> str | None:
    """saved_draft가 있으면(우측 패널에 저장된 지침 — run_async_job이
    _resolve_saved_draft(category)로 미리 읽어와 넘겨준다) 그걸 그대로 쓰고,
    없으면 발행된(published) 프로덕션 프롬프트로 폴백한다. 실패 시 None이고
    이미 push로 에러를 통지한 상태다.

    category(2026-09-22 추가) — 예전엔 "webtoon"으로 고정돼 있었다.
    레터·팟캐스트·영상 탭이 생기면서 그 카테고리의 프롬프트를 읽어야 한다.

    version(2026-09-21 추가, 사용자 요청 — "버전을 드롭다운 해서... 그걸로
    적용해서 출력... AB 테스트 느낌")이 주어지면 saved_draft/발행본 우선순위를
    전부 건너뛰고 그 과거 버전의 content로 강제 override한다 — 지금 우측
    패널에 편집 중인 초안이나 발행본 상태를 전혀 건드리지 않고 과거 버전
    하나만 일회성으로 시험 발화하는 용도라, draft가 있어도 version이 오면
    version이 이긴다."""
    if version is not None:
        v = prompts_repo.get_prompt_version(category, "published", version)
        if not v:
            push({"type": "error", "message": f"프롬프트 v{version}을 찾을 수 없습니다."})
            return None
        return v["content"]
    if saved_draft and saved_draft.strip():
        return saved_draft
    prompt = prompts_repo.get_prompt(category, "published")
    if not prompt:
        label = _CATEGORY_LABEL.get(category, category)
        push({"type": "error", "message": f"저장된 {label} 프롬프트가 없습니다 — 먼저 프롬프트를 저장해 주세요."})
        return None
    return prompt["active_content"]


def _run_article_text_flow(
    push: Push, article: str, category: str, saved_draft: str | None, model_id: str | None, version: int | None
) -> None:
    """레터·팟캐스트·영상(system 모드) — 웹툰과 달리 JSON 스토리보드가
    아니라 순수 텍스트 산출물이라, 일반 대화(_run_chat_flow)와 똑같이
    text_chunk/text_done으로만 스트리밍한다 — 프런트(PromptTextLab.tsx)가
    새 메시지 타입을 몰라도 된다. 실제 프로덕션 모델·프롬프트 조립
    (system=지침, user=기사 템플릿)은 routes/prompts.py::_CATEGORY_BEDROCK
    ("system" 모드 — PromptDrawer의 "테스트 실행"이 이미 쓰는 것과 동일
    소스)를 그대로 따른다 — 여기는 그 단발 호출을 스트리밍으로 바꿔
    재사용할 뿐, 모델·프롬프트 조립 로직을 새로 만들지 않는다.
    (2026-09-22 신설)"""
    cfg = _CATEGORY_BEDROCK.get(category)
    if not cfg or cfg["mode"] != "system":
        push({"type": "error", "message": f"지원하지 않는 채널입니다: {category}"})
        return
    content = _resolve_prompt_content(push, saved_draft, category, version)
    if content is None:
        return
    user_message = cfg["user_template"].format(article=article)
    model = resolve_text_model(model_id) if model_id else cfg["model"]
    _stream_completion(
        push, content, [{"role": "user", "content": [{"text": user_message[:12000]}]}],
        max_tokens=cfg["max_tokens"], model=model,
    )


def _run_article_flow(
    push: Push,
    article: str,
    saved_draft: str | None = None,
    model_id: str | None = None,
    version: int | None = None,
    category: str = "webtoon",
) -> None:
    """기사 → 스크립트+장면 연출을 한 번의 Bedrock 호출로(웹툰 전용 경로).

    2026-09-18 — "1단계/2단계" 구분 자체를 없앴다(사용자 요청: "스테이지
    구분 자체가 왜 있어야하는거죠?? 그런거 필요없을텐데요"). 예전엔 여기서
    두 번(_build_step1_call→_build_step2_call) 나눠 불러 그 사이에 "1단계
    결과" 메시지·"2단계로 진행" 안내 문구가 끼어 있었다 — 이제 단일 호출
    (webtoon_script.build_script_call, routes/webtoon/script.py 참고)로
    스크립트·카메라·장면을 한 번에 받는다.

    model_id(2026-09-20 추가) — 좌측 채팅창 모델 드롭다운에서 고른 값
    (prompts.TEXT_MODELS 키). build_script_call로 그대로 흘려보낸다.

    version(2026-09-21 추가) — 프롬프트 버전 드롭다운에서 고른 과거 버전
    번호. 있으면 _resolve_prompt_content가 draft/발행본 대신 그 버전
    content로 강제 override한다(지침 참고 위 함수 docstring).

    category(2026-09-22 추가) — "webtoon"이 아니면(레터/팟캐스트/영상)
    JSON 스토리보드가 아니라 순수 텍스트 산출물이라 _run_article_text_flow로
    완전히 갈라진다 — 아래 웹툰 전용 로직(JSON 파싱·storyboard 이벤트)은
    그대로 두고 안 건드린다."""
    if not article.strip():
        push({"type": "error", "message": "기사 원문이 비어 있습니다."})
        return
    if category != "webtoon":
        _run_article_text_flow(push, article, category, saved_draft, model_id, version)
        return
    try:
        content = _resolve_prompt_content(push, saved_draft, category, version)
        if content is None:
            return
        system, user_message, model, max_tokens = webtoon_script.build_script_call(content, article, model_id)
        raw = _stream_json_completion(
            push, "script", system, user_message, model, max_tokens,
            use_temperature=text_model_supports_temperature(model_id),
        )
        try:
            script = extract_json_object(raw)
        except ValueError:
            # 2026-09-20 — 이 except 전체를 감싸는 바깥쪽 try/except(아래)는
            # 사용자에게 push만 하고 서버 로그는 전혀 안 남기고 있었다 —
            # "Bedrock 응답에서 JSON을 찾지 못했습니다" 신고를 실제 CloudWatch
            # 로그로 확인하려다 흔적이 아예 없어서 발견. 원문(최대 2000자)을
            # 로그에 남겨야 다음에 똑같은 신고가 오면 "무슨 모델이 어떻게
            # 잘못 응답했는지" 바로 볼 수 있다 — 지금은 raw만 남기고 그대로
            # 다시 던져 바깥 except가 사용자에게 안내하게 둔다.
            logger.error(f"script JSON 파싱 실패(model_id={model_id!r}) 원문(최대 2000자): {raw[:2000]!r}")
            raise
        cuts = webtoon_script.normalize_cuts(script)
        push({
            "type": "storyboard",
            "core_question": script.get("core_question"),
            "characters": script.get("characters"),
            "cuts": cuts,
            "tested_version": version,  # 특정 과거 버전으로 시험 발화한 결과면 프론트가 배지로 표시
        })
        # 컷 이미지 생성은 채팅에서 완전히 빠지고 우측 패널
        # (WebtoonCutGenerator, 독립된 WebSocket 연결)로 옮겨갔다(2026-09-16
        # 사용자 요청: "좌측 부분에서는 텍스트만 출력되는 걸로... 우측에서는
        # 이미지를 출력하는걸로"). 여기서는 그쪽으로 안내만 한다.
        # 2026-09-20 — 예전엔 여기서 "장면 지문이 자동으로 채워져 있습니다"라고
        # 안내했는데, WebtoonCutGenerator.tsx는 2026-09-16부터 이미 자동 채움을
        # 없앴다(그 파일 모듈 docstring 3번 참고 — "자동으로 채워지지 않으면
        # 좋겠는데요... 사용자가 직접 복붙하면 좋겠어요, 헷갈려서"). 실제 동작과
        # 안 맞는 안내문이 남아있던 걸 발견해 문구를 고친다.
        push({
            "type": "options_prompt",
            "message": "스크립트·장면 연출이 완성됐습니다. 오른쪽 이미지 패널 슬롯에 장면 지문을 직접 붙여넣어 컷을 생성해 보세요.",
        })
    except Exception as e:  # noqa: BLE001 — 채팅 흐름 최상위, 여기서 안 잡으면 클라이언트가 영원히 대기
        # 2026-09-20 — logger.exception 없이 push만 하고 있었다(_run_cut_image_flow
        # 는 이미 로깅하는데 여기만 빠져 있었음) — 사용자에게 에러 문구는
        # 보이는데 서버 쪽엔 흔적이 전혀 안 남아 사후 조사가 불가능했다.
        logger.exception(f"article flow 실패(model_id={model_id!r})")
        push({"type": "error", "message": str(e)[:500]})


def _run_cut_image_flow(push: Push, cut: dict, model: str = "pipeline") -> None:
    if not cut.get("cut"):
        push({"type": "error", "message": "컷 정보가 없습니다."})
        return
    job_id = uuid.uuid4().hex[:16]
    now = time_utils.now_iso()
    try:
        webtoon_jobs.put_job(job_id, {"status": "pending", "cut": cut.get("cut"), "created_at": now, "updated_at": now})
    except Exception as e:  # noqa: BLE001 — 여기서 안 잡으면 push도 없이 클라이언트가 무한 대기
        logger.exception(f"webtoon-lab job 생성 실패: {job_id}")
        push({"type": "cut_image_error", "cut": cut.get("cut"), "error": str(e)[:500]})
        return
    webtoon_generate.run_composed_generation(job_id, cut, push=push, model=model)


_MAX_SYNTHESIZE_TEXT_BYTES = 20000  # webtoon/jobs.py::MAX_TEXT_BYTES와 같은 자릿수 — 과금 폭주 방지


def _run_synthesize_audio_flow(push: Push, text: str, slot_id: str) -> None:
    """팟캐스트 탭 전용 음성 생성 — 2026-09-22 신설, 같은 날 재설계.
    처음엔 채팅 메시지마다 버튼을 달았는데(사용자 요청 1차: "대본만
    텍스트로 출력이 되는건가요? 음성도 출력이 되면 좋겠는데"), 사용자가
    다시 요청: "왼쪽은 텍스트만, 우측은 음성을 생성하는거죠 — 웹툰처럼
    컷별로 있는것처럼 음성도 여러개를 리스트 형태로" — 웹툰의
    WebtoonCutGenerator(컷별 슬롯 + "cut_image" WS kind가 cut 번호를
    echo해 상관관계를 잡는 패턴)와 똑같이, 여기도 slot_id를 그대로
    돌려줘서 PodcastAudioGenerator.tsx가 동시에 여러 슬롯을 돌려도 어느
    응답이 어느 슬롯 것인지 구분한다.

    실제 발행 파이프라인과 똑같은 함수(podcast_voice.synthesize — 지금
    CMS에 발행된 성우/엔진/속도/음량을 fresh 조회)를 그대로 불러 mp3를
    만들고, 웹툰 컷 이미지 랩과 같은 방식(webtoon_jobs.s3()/bucket(),
    공개 S3 URL, 발행 미디어와 구분되는 별도 lab 접두사)으로 S3에
    올려 URL을 돌려준다. admin Lambda 역할의 polly:SynthesizeSpeech
    권한은 2026-09-22 사용자 승인 후 추가 완료(AdminPodcastVoicePolly)."""
    if not text.strip():
        push({"type": "audio_error", "slot_id": slot_id, "message": "합성할 텍스트가 없습니다."})
        return
    if len(text.encode("utf-8")) > _MAX_SYNTHESIZE_TEXT_BYTES:
        push({
            "type": "audio_error", "slot_id": slot_id,
            "message": f"텍스트가 너무 깁니다 (최대 {_MAX_SYNTHESIZE_TEXT_BYTES // 1000}KB)",
        })
        return
    try:
        audio = podcast_voice.synthesize(text)
    except Exception as e:  # noqa: BLE001 — Polly 실패를 사용자에게 명확히 알려야 함(무한 대기 방지)
        logger.exception("팟캐스트 음성 합성 실패")
        push({"type": "audio_error", "slot_id": slot_id, "message": f"음성 합성 실패: {e}"})
        return
    job_id = uuid.uuid4().hex[:16]
    key = f"media/podcast-lab/{job_id}.mp3"
    try:
        webtoon_jobs.s3().put_object(Bucket=webtoon_jobs.bucket(), Key=key, Body=audio, ContentType="audio/mpeg")
    except Exception as e:  # noqa: BLE001 — 업로드 실패도 사용자에게 알림
        logger.exception("팟캐스트 음성 미리듣기 S3 업로드 실패")
        push({"type": "audio_error", "slot_id": slot_id, "message": f"업로드 실패: {e}"})
        return
    url = f"https://{webtoon_jobs.bucket()}.s3.us-east-1.amazonaws.com/{key}"
    push({"type": "audio_ready", "slot_id": slot_id, "audio_url": url})


# 영상 랩(2026-09-23 신설, 사용자 요청: "동영상도 가능?" → "네.. 진행을
# 해야합니다") — Remotion 렌더는 Node+헤드리스 크롬+ffmpeg가 필요해
# Polly 합성과 달리 admin Lambda(Python 전용, 512MB 임시 저장공간) 안에서
# 절대 못 돈다(조사 결과, 설정으로 되는 게 아니라 구조적 한계). 대신
# frontpage_auto와 같은 이미지(이미 Node+Remotion+ffmpeg 포함)를 쓰되
# entryPoint만 다른 별도 ECS 태스크 정의(sedaily-lens-video-lab)를
# RunTask로 그때그때 띄운다 — 프로덕션 frontpage_auto/mustknow_auto
# family·리비전은 전혀 안 건드린다.
_VIDEO_LAB_CLUSTER = "sedaily-lens-frontpage-auto"
_VIDEO_LAB_TASK_DEFINITION = "sedaily-lens-video-lab"
_VIDEO_LAB_CONTAINER = "video-lab"
_VIDEO_LAB_SUBNETS = ["subnet-0b5a146ca8ed1ddfe"]
_VIDEO_LAB_SECURITY_GROUPS = ["sg-05cb5f7bc29891cf8"]
_MAX_RENDER_TEXT_BYTES = 20000  # _MAX_SYNTHESIZE_TEXT_BYTES와 같은 이유 — 과금 폭주 방지

_ecs_client = None


def _ecs() -> "boto3.client":
    global _ecs_client
    if _ecs_client is None:
        _ecs_client = boto3.client("ecs", region_name="us-east-1")
    return _ecs_client


def _run_render_video_flow(push: Push, text: str, slot_id: str) -> None:
    """영상 탭 우측 "영상 생성" 패널(VideoRenderGenerator.tsx, 팟캐스트의
    PodcastAudioGenerator.tsx와 같은 슬롯-리스트 구조) 전용. 여기서는 ECS
    RunTask만 걸고 바로 응답한다 — Remotion 렌더는 수십 초~수 분 걸려
    Polly 합성(_run_synthesize_audio_flow)처럼 같은 Lambda invocation
    안에서 기다렸다 결과를 push할 수 없다. 실제 결과는 프런트가
    `GET /admin/video-lab/{job_id}`(routes/video_lab.py)를 주기적으로
    폴링해서 받는다 — 이 함수는 "렌더가 시작됐다"만 알려준다.

    text는 이미 CMS 영상 탭 채팅이 만든 각본 텍스트 그대로(JSON이
    아니어도 됨 — 렌더 태스크(render_from_script.py)가 extract_json_object
    +fix_script+validate_script로 직접 추출·보정·검증한다)."""
    if not text.strip():
        push({"type": "render_error", "slot_id": slot_id, "message": "렌더할 각본이 없습니다."})
        return
    if len(text.encode("utf-8")) > _MAX_RENDER_TEXT_BYTES:
        push({
            "type": "render_error", "slot_id": slot_id,
            "message": f"각본이 너무 깁니다 (최대 {_MAX_RENDER_TEXT_BYTES // 1000}KB)",
        })
        return
    job_id = uuid.uuid4().hex[:16]
    input_key = f"media/video-lab/input/{job_id}.txt"
    try:
        webtoon_jobs.s3().put_object(
            Bucket=webtoon_jobs.bucket(), Key=input_key, Body=text.encode("utf-8"), ContentType="text/plain"
        )
    except Exception as e:  # noqa: BLE001 — 업로드 실패를 사용자에게 알려야 함
        logger.exception("영상 랩 각본 S3 업로드 실패")
        push({"type": "render_error", "slot_id": slot_id, "message": f"업로드 실패: {e}"})
        return
    try:
        _ecs().run_task(
            cluster=_VIDEO_LAB_CLUSTER,
            taskDefinition=_VIDEO_LAB_TASK_DEFINITION,
            launchType="FARGATE",
            networkConfiguration={
                "awsvpcConfiguration": {
                    "subnets": _VIDEO_LAB_SUBNETS,
                    "securityGroups": _VIDEO_LAB_SECURITY_GROUPS,
                    "assignPublicIp": "ENABLED",
                }
            },
            overrides={
                "containerOverrides": [
                    {"name": _VIDEO_LAB_CONTAINER, "command": ["--job-id", job_id, "--script-s3-key", input_key]}
                ]
            },
        )
    except Exception as e:  # noqa: BLE001 — RunTask 실패(권한 등)를 사용자에게 명확히 알려야 함(무한 대기 방지)
        logger.exception("영상 랩 ECS RunTask 실패")
        push({"type": "render_error", "slot_id": slot_id, "message": f"렌더 작업 시작 실패: {e}"})
        return
    push({"type": "render_started", "slot_id": slot_id, "job_id": job_id})


def _run_gpu_stop_flow(push: Push) -> None:
    try:
        import gpu_ipadapter  # pipelines/common/ — sibling, lazy(이 경로를 안 타면 boto3 초기화 비용 회피)

        gpu_ipadapter.stop_gpu()
        push({"type": "gpu_stopping"})
    except Exception as e:  # noqa: BLE001
        push({"type": "gpu_error", "error": str(e)[:500]})
