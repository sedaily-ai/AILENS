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
from routes.prompts import _CATEGORY_BEDROCK, _get_bedrock_client
from json_extract import extract_json_object  # pipelines/common/ — deploy 시 zip 루트에 복사됨(routes/prompts.py와 동일 패턴)

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


_LAB_CATEGORY = "webtoon"
_LAB_NAME = "published"


def _resolve_saved_draft() -> str | None:
    """우측 패널에 저장된 지침(prompt_lab_docs)을 서버에서 직접 읽어온다 —
    nova와 같은 방식(2026-09-16, 사용자 확인: "노바랑 동일한 방식으로
    하면 됩니다", nova/backend/websocket/prompt_builder.py::
    load_engine_full_prompt 패턴). 클라이언트는 프롬프트 원문을 전혀 안
    보낸다 — WebSocket 프레임 크기(32KB) 문제가 구조적으로 없어진다.
    저장된 게 비어 있으면 None — 호출부가 각자의 기본값으로 폴백한다
    (article/step2는 발행된 프로덕션 프롬프트, chat은 고정 페르소나)."""
    try:
        draft = prompt_lab_repo.assemble_draft(_LAB_CATEGORY, _LAB_NAME)
    except Exception as e:  # noqa: BLE001 — 지침 조회 실패해도 기본값 폴백으로 계속 진행
        logger.warning(f"저장된 지침 조회 실패: {e}")
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
    saved_draft = _resolve_saved_draft()

    if kind == "chat":
        _run_chat_flow(push, data.get("message") or "", data.get("history") or [], saved_draft)
    elif kind == "article":
        _run_article_flow(push, data.get("article") or "", saved_draft)
    elif kind == "cut_image":
        _run_cut_image_flow(push, data.get("cut") or {}, data.get("model") or "pipeline")
    elif kind == "gpu_start":
        webtoon_gpu.run_gpu_start(uuid.uuid4().hex[:16], push=push)
    elif kind == "gpu_stop":
        _run_gpu_stop_flow(push)
    else:
        push({"type": "error", "message": f"알 수 없는 요청입니다: {kind}"})


def _stream_completion(push: Push, system: str, messages: list[dict], max_tokens: int = 400) -> None:
    """converse_stream으로 텍스트를 토큰 단위로 밀어넣는다 — 기사 반응 문구·
    자유 대화 공용(2026-09-15, 자유 대화 추가하며 일반화). 완료되면
    text_done을 보낸다."""
    client = _get_bedrock_client()
    logger.info(f"stream_completion system(앞 200자)={system[:200]!r} messages={len(messages)}개")
    try:
        resp = client.converse_stream(
            modelId=_REACTION_MODEL,
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


def _stream_json_completion(push: Push, event_type: str, system: str, user_message: str, model: str, max_tokens: int) -> str:
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
    JSON을 파싱하려 들지 않는다."""
    client = _get_bedrock_client()
    parts: list[str] = []
    try:
        resp = client.converse_stream(
            modelId=model,
            system=[{"text": system}],
            messages=[{"role": "user", "content": [{"text": user_message}]}],
            inferenceConfig={"maxTokens": max_tokens, "temperature": 0.7},
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


def _run_chat_flow(push: Push, message: str, history: list[dict], saved_draft: str | None = None) -> None:
    """기사도 컷 요청도 아닌 일반 대화 — 최근 대화 몇 턴을 같이 넘겨서
    자연스럽게 이어지게 한다(2026-09-15 사용자 요청). history는
    프런트(PromptChatLab.tsx)가 보낸 [{role, text}] — role은 "user"/
    "assistant"만 신뢰한다.

    saved_draft(우측 패널에 저장된 설명+지침+파일 조립본, run_async_job이
    _resolve_saved_draft()로 미리 읽어와 넘겨준다)가 있으면 그걸 그대로
    시스템 프롬프트로 쓴다 — 고정된 _CHAT_SYSTEM 대신 저장해 둔 프롬프트
    내용을 기준으로 답하게 하기 위함(2026-09-15 사용자 요청: "프롬프트에
    입력했을 때.. 기반으로 답변이 출력되도록"). 없으면(저장된 게 아직
    없을 때) _CHAT_SYSTEM으로 폴백."""
    if not message.strip():
        return
    system = saved_draft if saved_draft and saved_draft.strip() else _CHAT_SYSTEM
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
    _stream_completion(push, system, messages, max_tokens=2000)


def _resolve_prompt_content(push: Push, saved_draft: str | None) -> str | None:
    """saved_draft가 있으면(우측 패널에 저장된 지침 — run_async_job이
    _resolve_saved_draft()로 미리 읽어와 넘겨준다) 그걸 그대로 쓰고, 없으면
    발행된(published) 프로덕션 프롬프트로 폴백한다. 실패 시 None이고 이미
    push로 에러를 통지한 상태다."""
    if saved_draft and saved_draft.strip():
        return saved_draft
    prompt = prompts_repo.get_prompt("webtoon", "published")
    if not prompt:
        push({"type": "error", "message": "저장된 웹툰 프롬프트가 없습니다 — 먼저 프롬프트를 저장해 주세요."})
        return None
    return prompt["active_content"]


def _run_article_flow(push: Push, article: str, saved_draft: str | None = None) -> None:
    """기사 → 스크립트+장면 연출을 한 번의 Bedrock 호출로.

    2026-09-18 — "1단계/2단계" 구분 자체를 없앴다(사용자 요청: "스테이지
    구분 자체가 왜 있어야하는거죠?? 그런거 필요없을텐데요"). 예전엔 여기서
    두 번(_build_step1_call→_build_step2_call) 나눠 불러 그 사이에 "1단계
    결과" 메시지·"2단계로 진행" 안내 문구가 끼어 있었다 — 이제 단일 호출
    (webtoon_script.build_script_call, routes/webtoon/script.py 참고)로
    스크립트·카메라·장면을 한 번에 받는다."""
    if not article.strip():
        push({"type": "error", "message": "기사 원문이 비어 있습니다."})
        return
    try:
        content = _resolve_prompt_content(push, saved_draft)
        if content is None:
            return
        system, user_message, model, max_tokens = webtoon_script.build_script_call(content, article)
        raw = _stream_json_completion(push, "script", system, user_message, model, max_tokens)
        script = extract_json_object(raw)
        cuts = webtoon_script.normalize_cuts(script)
        push({
            "type": "storyboard",
            "core_question": script.get("core_question"),
            "characters": script.get("characters"),
            "cuts": cuts,
        })
        # 컷 이미지 생성은 채팅에서 완전히 빠지고 우측 패널
        # (WebtoonCutGenerator, 독립된 WebSocket 연결)로 옮겨갔다(2026-09-16
        # 사용자 요청: "좌측 부분에서는 텍스트만 출력되는 걸로... 우측에서는
        # 이미지를 출력하는걸로"). 여기서는 그쪽으로 안내만 한다.
        push({
            "type": "options_prompt",
            "message": "스크립트·장면 연출이 완성됐습니다. 오른쪽 이미지 패널에서 컷을 생성해 보세요 — 장면 지문이 자동으로 채워져 있습니다.",
        })
    except Exception as e:  # noqa: BLE001 — 채팅 흐름 최상위, 여기서 안 잡으면 클라이언트가 영원히 대기
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


def _run_gpu_stop_flow(push: Push) -> None:
    try:
        import gpu_ipadapter  # pipelines/common/ — sibling, lazy(이 경로를 안 타면 boto3 초기화 비용 회피)

        gpu_ipadapter.stop_gpu()
        push({"type": "gpu_stopping"})
    except Exception as e:  # noqa: BLE001
        push({"type": "gpu_error", "error": str(e)[:500]})
