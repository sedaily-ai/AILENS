"""챗봇 Bedrock 호출 엔진 — 동기/스트리밍 응답 생성 + tool-use 루프.

2026-08-05: `handlers/chatbot_handler.py`(869줄)에서 분리. `generate_chat_response_stream`은
이 파일로 옮기기 전부터 이미 다른 Lambda(`handlers/websocket/message.py`)가
handler 파일에서 직접 import해 쓰고 있었다 — 사실상 서비스였는데 경계가 없었을 뿐.

⚠️ `generate_chat_response`(동기)와 `generate_chat_response_stream`(스트리밍)은
tool-use 루프 로직을 각자 따로 구현하고 있다(시스템 프롬프트 구성, 메시지 구성,
tool 결과 처리 전부 중복). 동작이 미묘하게 갈릴 수 있는 로직 변경이라 이번
분리에서는 통합하지 않고 그대로 옮겼다 — 통합은 별도 작업.
"""
import logging
import boto3
import json
from typing import Optional, Dict, Any, List

from config.constants import BEDROCK_MODEL_ID_CHATBOT  # Sonnet 4.6 inference profile (mbti-sonnet-46), 4 페르소나 톤
from services.chatbot_context_service import search_related_articles
from services.chatbot_prompt_service import _build_full_system_prompt, _get_tools

logger = logging.getLogger(__name__)

# Bedrock client (reused across invocations for Lambda warm starts)
bedrock_client = None

def get_bedrock_client():
    """Get or create Bedrock client"""
    global bedrock_client
    if bedrock_client is None:
        bedrock_client = boto3.client('bedrock-runtime', region_name='us-east-1')
    return bedrock_client


def _execute_tool(tool_name: str, tool_input: dict) -> str:
    """Execute a single tool and return result as JSON string."""
    from services.stock_service import lookup_stock, get_market_index

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


def _split_system_turns(conversation_history: list) -> tuple:
    """``conversation_history`` 에서 ``role: "system"`` 항목을 분리한다.

    Messages API 는 messages 배열에 system 롤을 허용하지 않는다 —
    최상위 ``system`` 파라미터를 쓰라며 ``ValidationException`` 을 던진다.
    그런데 프런트의 사주 챗(``SajuChat.tsx``)은 사주 컨텍스트를
    ``conversation_history`` 맨 앞에 ``role: "system"`` 으로 실어 보낸다.
    그대로 통과시키면 500 이 되고, 그냥 버리면 페르소나가 사주 데이터를
    모른 채 답해 기능이 무의미해진다. 그래서 **분리해서 system 프롬프트에
    합친다.**

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
    """Build messages array for Claude API.

    system 롤은 ``_split_system_turns`` 가 걷어내므로 여기 들어오지 않는다.
    """
    _, dialog = _split_system_turns(conversation_history)
    messages = list(dialog[-6:])
    messages.append({"role": "user", "content": user_message})
    return messages


async def generate_chat_response(
    user_message: str,
    mbti_group: str,
    conversation_history: List[Dict[str, str]],
    recent_articles: List[Dict[str, Any]] = None,
    cached_briefing: Optional[str] = None
) -> str:
    """
    Generate chat response using Claude API via Bedrock.

    Args:
        user_message: User's input message
        mbti_group: MBTI group (NT, NF, ST, SF)
        conversation_history: Previous messages in the conversation
        recent_articles: Recent news articles for context (fallback)
        cached_briefing: Pre-generated MBTI-styled briefing text (preferred)

    Returns:
        AI-generated response text
    """
    client = get_bedrock_client()
    system_prompt = _build_full_system_prompt(mbti_group, recent_articles, cached_briefing)
    # 호출자가 conversation_history 에 실어 보낸 system 롤을 합친다
    # (사주 챗의 사주 컨텍스트 — _split_system_turns 주석 참조).
    _extra_system, _ = _split_system_turns(conversation_history)
    if _extra_system:
        system_prompt = system_prompt + "\n\n" + "\n\n".join(_extra_system)
    tools = _get_tools()
    messages = _build_messages(conversation_history, user_message)

    try:
        # Call Claude via Bedrock with tool use support
        request_body = json.dumps({
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 2048,
            "system": [
                {
                    "type": "text",
                    "text": system_prompt,
                    "cache_control": {"type": "ephemeral"}
                }
            ],
            "tools": tools,
            "messages": messages
        })

        response = client.invoke_model(
            modelId=BEDROCK_MODEL_ID_CHATBOT,
            contentType="application/json",
            accept="application/json",
            body=request_body
        )

        response_body = json.loads(response['body'].read())

        # Check if Claude wants to use a tool
        if response_body.get("stop_reason") == "tool_use":
            return await _handle_tool_use(client, system_prompt, tools, messages, response_body)

        # Normal text response — find first text block
        for block in response_body.get("content", []):
            if block.get("type") == "text" and block.get("text"):
                return block["text"]

        return "죄송해요, 응답을 생성하지 못했어요. 다시 시도해주세요."

    except Exception as e:
        logger.error(f"Bedrock API error: {e}")
        raise


async def _handle_tool_use(client, system_prompt: str, tools: list, messages: list, response_body: dict) -> str:
    """Handle Claude's tool use request: execute tool(s) and get final response."""
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

        tool_results = []
        for tool_block in tool_use_blocks:
            logger.info(f"Tool call: {tool_block['name']}({tool_block.get('input', {})})")
            result = _execute_tool(tool_block["name"], tool_block.get("input", {}))
            tool_results.append({
                "type": "tool_result",
                "tool_use_id": tool_block["id"],
                "content": result,
            })

        messages.append({"role": "user", "content": tool_results})

        request_body = json.dumps({
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 2048,
            "system": [{"type": "text", "text": system_prompt, "cache_control": {"type": "ephemeral"}}],
            "tools": tools,
            "messages": messages,
        })

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


# ── Streaming support ───────────────────────────────────────────

def generate_chat_response_stream(
    user_message: str,
    mbti_group: str,
    conversation_history: list,
    recent_articles: list = None,
    cached_briefing: str = None
):
    """Synchronous generator yielding text chunks from Bedrock streaming API.
    Handles tool use transparently — tools are resolved without streaming,
    then the final text response is streamed to the caller."""
    client = get_bedrock_client()
    system_prompt = _build_full_system_prompt(mbti_group, recent_articles, cached_briefing)
    # 호출자가 conversation_history 에 실어 보낸 system 롤을 합친다
    # (사주 챗의 사주 컨텍스트 — _split_system_turns 주석 참조).
    _extra_system, _ = _split_system_turns(conversation_history)
    if _extra_system:
        system_prompt = system_prompt + "\n\n" + "\n\n".join(_extra_system)
    tools = _get_tools()
    messages = _build_messages(conversation_history, user_message)

    for iteration in range(3):
        request_body = json.dumps({
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 2048,
            "system": [{"type": "text", "text": system_prompt, "cache_control": {"type": "ephemeral"}}],
            "tools": tools,
            "messages": messages
        })

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

        # No tool use — text was already yielded
        if not tool_blocks:
            return

        # Handle tool use, then loop to stream the follow-up
        logger.info(f"Stream: handling {len(tool_blocks)} tool calls (iteration {iteration})")
        messages.append({"role": "assistant", "content": content_blocks})

        tool_results = []
        for tb in tool_blocks:
            result = _execute_tool(tb['name'], tb['input'])
            logger.info(f"Tool {tb['name']} → {result[:100]}")
            tool_results.append({
                "type": "tool_result",
                "tool_use_id": tb['id'],
                "content": result
            })
        messages.append({"role": "user", "content": tool_results})

    yield "죄송해요, 응답을 생성하지 못했어요."
