"""챗봇 Bedrock 호출 엔진 — 동기/스트리밍 응답 생성 + tool-use 루프.

동기(`generate_chat_response`)와 스트리밍(`generate_chat_response_stream`) 응답을 생성한다.
두 경로는 Bedrock 요청 body 조립(`_build_bedrock_request`)과 tool_use 블록 실행
(`_execute_tool_batch`)을 공유하며, 스트리밍의 증분 yield 흐름만 별도로 유지한다.
`generate_chat_response_stream`은 WebSocket 핸들러(`handlers/chat/websocket/message.py`)도 직접 import한다.
"""
import logging
import boto3
import json
from typing import Optional, Dict, Any, List

from config.constants import BEDROCK_MODEL_ID_CHATBOT  # Sonnet 4.6 inference profile (mbti-sonnet-46)
from services.chat.context import search_related_articles
from services.chat.prompt import _build_full_system_prompt, _get_tools

logger = logging.getLogger(__name__)

# Lambda warm start 간 재사용하는 Bedrock 클라이언트
bedrock_client = None

def get_bedrock_client():
    global bedrock_client
    if bedrock_client is None:
        bedrock_client = boto3.client('bedrock-runtime', region_name='us-east-1')
    return bedrock_client


def _execute_tool(tool_name: str, tool_input: dict) -> str:
    """tool 하나를 실행하고 결과를 JSON 문자열로 반환한다."""
    from services.market.stock import lookup_stock, get_market_index

    if tool_name == "get_stock_price":
        query = tool_input.get("query", "")
        stock_data = lookup_stock(query)
        if stock_data:
            return json.dumps({
                "종목명": stock_data["name"],
                "종목코드": stock_data["code"],
                "시장": stock_data["market"],
                "현재가": stock_data["current_price"],
                "전일종가": stock_data["prev_close"],
                "전일대비등락": stock_data["change"],
                "등락률": f"{stock_data['change_percent']}%",
                "방향": stock_data["direction"],
                "장상태": stock_data["market_status"],
                "고가": stock_data.get("high", ""),
                "저가": stock_data.get("low", ""),
                "거래량": stock_data.get("volume", ""),
            }, ensure_ascii=False)
        return json.dumps({
            "error": f"'{query}' 상장 종목을 찾을 수 없습니다.",
            "hint": "비상장 기업이거나 정식 명칭이 다를 수 있습니다. search_news 도구로 관련 뉴스를 찾아 답변해 주세요."
        }, ensure_ascii=False)

    elif tool_name == "get_market_index":
        query = tool_input.get("query", "")
        index_data = get_market_index(query)
        if index_data:
            return json.dumps({
                "지수명": index_data["name"],
                "현재지수": index_data["current_price"],
                "전일대비등락": index_data["change"],
                "등락률": f"{index_data['change_percent']}%",
                "방향": index_data["direction"],
                "장상태": index_data["market_status"],
            }, ensure_ascii=False)
        return json.dumps({"error": f"'{query}' 지수를 찾을 수 없습니다."}, ensure_ascii=False)

    elif tool_name == "search_news":
        query = tool_input.get("query", "")
        articles = search_related_articles(query, limit=5)
        if not articles:
            return json.dumps({
                "found": 0,
                "message": f"'{query}'에 대한 최근 기사가 DB에 없습니다. 알려진 일반 정보로 답변해 주세요."
            }, ensure_ascii=False)
        return json.dumps({
            "found": len(articles),
            "articles": [
                {
                    "title": a.get("title_ko", ""),
                    "category": a.get("category", ""),
                    "published_at": a.get("published_at", ""),
                }
                for a in articles
            ]
        }, ensure_ascii=False)

    return json.dumps({"error": f"Unknown tool: {tool_name}"}, ensure_ascii=False)


def _build_bedrock_request(system_prompt: str, tools: list, messages: list) -> str:
    """동기·스트리밍 경로가 공통으로 쓰는 Bedrock 요청 body를 조립한다."""
    return json.dumps({
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 2048,
        "system": [
            {
                "type": "text",
                "text": system_prompt,
                "cache_control": {"type": "ephemeral"},
            }
        ],
        "tools": tools,
        "messages": messages,
    })


def _execute_tool_batch(tool_blocks: list) -> list:
    """``{id, name, input}`` 형태의 tool_use 블록들을 실행해 Bedrock에 돌려줄
    ``tool_result`` 콘텐츠 리스트를 만든다."""
    tool_results = []
    for block in tool_blocks:
        logger.info(f"Tool call: {block['name']}({block.get('input', {})})")
        result = _execute_tool(block["name"], block.get("input", {}))
        tool_results.append({
            "type": "tool_result",
            "tool_use_id": block["id"],
            "content": result,
        })
    return tool_results


def _split_system_turns(conversation_history: list) -> tuple:
    """``conversation_history`` 에서 ``role: "system"`` 항목을 분리한다.

    Messages API 는 messages 배열의 system 롤을 허용하지 않아 ``ValidationException`` 을
    던진다. 프런트의 사주 챗(``SajuChat.tsx``)은 사주 컨텍스트를
    ``conversation_history`` 맨 앞에 ``role: "system"`` 으로 전달하므로,
    분리한 뒤 최상위 system 프롬프트에 합쳐야 한다.

    Returns:
        ``(system_texts, dialog_turns)`` — 앞은 system 롤 본문 리스트,
        뒤는 user/assistant 턴만 남긴 리스트.
    """
    system_texts, dialog = [], []
    for msg in conversation_history or []:
        role = (msg.get("role") or "user").strip().lower()
        content = msg.get("content") or ""
        if role == "system":
            if content:
                system_texts.append(content)
        elif role in ("user", "assistant"):
            dialog.append({"role": role, "content": content})
        # 그 외 알 수 없는 롤은 버린다 — Messages API 가 거부한다.
    return system_texts, dialog


def _build_messages(conversation_history: list, user_message: str) -> list:
    """Claude API 용 messages 배열을 만든다(최근 6턴 + 현재 사용자 메시지).

    system 롤은 ``_split_system_turns`` 가 걷어내므로 여기 들어오지 않는다.
    """
    _, dialog = _split_system_turns(conversation_history)
    messages = list(dialog[-6:])
    messages.append({"role": "user", "content": user_message})
    return messages


async def generate_chat_response(
    user_message: str,
    mbti_group: str = None,
    conversation_history: List[Dict[str, str]] = None,
    recent_articles: List[Dict[str, Any]] = None,
    cached_briefing: Optional[str] = None
) -> str:
    """Bedrock Claude로 챗봇 응답 텍스트를 생성한다.

    Args:
        user_message: 사용자 입력.
        mbti_group: 하위 호환용 인자로 사용하지 않는다(`main.py`가 여전히 전달).
        conversation_history: 이전 대화.
        recent_articles: 컨텍스트용 최근 기사(캐시 브리핑이 없을 때의 대체).
        cached_briefing: 사전 생성한 브리핑 텍스트(우선 사용).
    """
    client = get_bedrock_client()
    system_prompt = _build_full_system_prompt(recent_articles, cached_briefing)
    # conversation_history 의 system 롤을 system 프롬프트에 합친다(_split_system_turns 참조).
    _extra_system, _ = _split_system_turns(conversation_history)
    if _extra_system:
        system_prompt = system_prompt + "\n\n" + "\n\n".join(_extra_system)
    tools = _get_tools()
    messages = _build_messages(conversation_history, user_message)

    try:
        request_body = _build_bedrock_request(system_prompt, tools, messages)

        response = client.invoke_model(
            modelId=BEDROCK_MODEL_ID_CHATBOT,
            contentType="application/json",
            accept="application/json",
            body=request_body
        )

        response_body = json.loads(response['body'].read())

        if response_body.get("stop_reason") == "tool_use":
            return await _handle_tool_use(client, system_prompt, tools, messages, response_body)

        # 첫 text 블록을 응답으로 사용
        for block in response_body.get("content", []):
            if block.get("type") == "text" and block.get("text"):
                return block["text"]

        return "죄송해요, 응답을 생성하지 못했어요. 다시 시도해주세요."

    except Exception as e:
        logger.error(f"Bedrock API error: {e}")
        raise


async def _handle_tool_use(client, system_prompt: str, tools: list, messages: list, response_body: dict) -> str:
    """tool 호출 요청을 실행하고 최종 응답 텍스트를 만든다(최대 5회 반복)."""
    max_iterations = 5
    pre_tool_text = []
    current_response = response_body

    for _ in range(max_iterations):
        tool_use_blocks = []
        for block in current_response.get("content", []):
            if block.get("type") == "tool_use":
                tool_use_blocks.append(block)
            elif block.get("type") == "text" and block.get("text"):
                pre_tool_text.append(block["text"])

        if not tool_use_blocks:
            break

        messages.append({"role": "assistant", "content": current_response["content"]})

        tool_results = _execute_tool_batch(tool_use_blocks)
        messages.append({"role": "user", "content": tool_results})

        request_body = _build_bedrock_request(system_prompt, tools, messages)

        response = client.invoke_model(
            modelId=BEDROCK_MODEL_ID_CHATBOT,
            contentType="application/json",
            accept="application/json",
            body=request_body,
        )
        current_response = json.loads(response['body'].read())

        if current_response.get("stop_reason") != "tool_use":
            for block in current_response.get("content", []):
                if block.get("type") == "text" and block.get("text"):
                    pre_tool_text.append(block["text"])
            break

    return "\n\n".join(pre_tool_text) if pre_tool_text else "죄송해요, 응답을 생성하지 못했어요."


# ── 스트리밍 ───────────────────────────────────────────

def generate_chat_response_stream(
    user_message: str,
    mbti_group: str = None,
    conversation_history: list = None,
    recent_articles: list = None,
    cached_briefing: str = None
):
    """Bedrock 스트리밍 API의 텍스트 청크를 yield하는 동기 제너레이터.

    tool 호출은 스트리밍 없이 처리하고 이후 응답만 스트리밍한다(최대 3회 반복).
    ``mbti_group`` 은 하위 호환용 인자로 사용하지 않는다."""
    client = get_bedrock_client()
    system_prompt = _build_full_system_prompt(recent_articles, cached_briefing)
    # conversation_history 의 system 롤을 system 프롬프트에 합친다(_split_system_turns 참조).
    _extra_system, _ = _split_system_turns(conversation_history)
    if _extra_system:
        system_prompt = system_prompt + "\n\n" + "\n\n".join(_extra_system)
    tools = _get_tools()
    messages = _build_messages(conversation_history, user_message)

    for iteration in range(3):
        request_body = _build_bedrock_request(system_prompt, tools, messages)

        response = client.invoke_model_with_response_stream(
            modelId=BEDROCK_MODEL_ID_CHATBOT,
            contentType="application/json",
            accept="application/json",
            body=request_body
        )

        stream = response.get('body')
        content_blocks = []
        tool_blocks = []
        current_tool = None
        current_tool_input = ""

        for event in stream:
            chunk_bytes = event.get('chunk', {}).get('bytes', b'')
            if not chunk_bytes:
                continue
            chunk = json.loads(chunk_bytes)
            event_type = chunk.get('type')

            if event_type == 'content_block_start':
                block = chunk.get('content_block', {})
                if block.get('type') == 'tool_use':
                    current_tool = {"id": block['id'], "name": block['name']}
                    current_tool_input = ""
                elif block.get('type') == 'text':
                    content_blocks.append({"type": "text", "text": ""})

            elif event_type == 'content_block_delta':
                delta = chunk.get('delta', {})
                if delta.get('type') == 'text_delta':
                    text = delta.get('text', '')
                    if text:
                        if content_blocks and content_blocks[-1].get('type') == 'text':
                            content_blocks[-1]['text'] += text
                        yield text
                elif delta.get('type') == 'input_json_delta':
                    current_tool_input += delta.get('partial_json', '')

            elif event_type == 'content_block_stop':
                if current_tool:
                    tool_block = {
                        "type": "tool_use",
                        "id": current_tool['id'],
                        "name": current_tool['name'],
                        "input": json.loads(current_tool_input) if current_tool_input else {}
                    }
                    content_blocks.append(tool_block)
                    tool_blocks.append(tool_block)
                    current_tool = None
                    current_tool_input = ""

        # tool 호출이 없으면 텍스트는 이미 yield 됨
        if not tool_blocks:
            return

        # tool 실행 후 다음 루프에서 후속 응답을 스트리밍
        logger.info(f"Stream: handling {len(tool_blocks)} tool calls (iteration {iteration})")
        messages.append({"role": "assistant", "content": content_blocks})

        tool_results = _execute_tool_batch(tool_blocks)
        messages.append({"role": "user", "content": tool_results})

    yield "죄송해요, 응답을 생성하지 못했어요."
