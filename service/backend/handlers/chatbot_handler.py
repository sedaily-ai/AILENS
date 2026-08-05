"""
MBTI Chatbot Handler Lambda Function
Provides AI-powered chat responses styled for each MBTI group (NT, NF, ST, SF).
Uses Claude API via AWS Bedrock.
"""
import logging
import boto3
import json
import os
from typing import Optional, Dict, Any, List
from datetime import datetime

from config.constants import (
    MBTI_GROUPS,
    MBTI_GROUP_INFO,
    CORS_HEADERS,
    BEDROCK_MODEL_ID_CHATBOT,  # Sonnet 4.6 inference profile (mbti-sonnet-46), 4 페르소나 톤
    DYNAMODB_TABLE_ARTICLES_DEV,
    NEWS_BRIEFING_ID,
    NEWS_BRIEFING_MAX_AGE_HOURS,
)
from common.feature_flag import is_enabled
from services.prompt_loader import load_chatbot_prompt

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# Bedrock client (reused across invocations for Lambda warm starts)
bedrock_client = None

def get_bedrock_client():
    """Get or create Bedrock client"""
    global bedrock_client
    if bedrock_client is None:
        bedrock_client = boto3.client('bedrock-runtime', region_name='us-east-1')
    return bedrock_client



def get_cached_briefing(mbti_group: str) -> Optional[str]:
    """Fetch the cached news briefing for the given MBTI group.
    Returns the briefing text if fresh, or None to fall back to article query."""
    try:
        dynamodb = boto3.resource('dynamodb', region_name='us-east-1')
        table = dynamodb.Table(DYNAMODB_TABLE_ARTICLES_DEV)

        response = table.get_item(Key={'news_id': NEWS_BRIEFING_ID})
        item = response.get('Item')

        if not item:
            return None

        # Check staleness
        generated_at = item.get('generated_at', '')
        if generated_at:
            from datetime import timedelta, timezone
            gen_time = datetime.fromisoformat(generated_at)
            kst = timezone(timedelta(hours=9))
            now = datetime.now(kst)
            # Make gen_time offset-aware if needed
            if gen_time.tzinfo is None:
                gen_time = gen_time.replace(tzinfo=kst)
            age_hours = (now - gen_time).total_seconds() / 3600
            if age_hours > NEWS_BRIEFING_MAX_AGE_HOURS:
                logger.warning(f"Briefing is stale ({age_hours:.1f}h old), falling back to article query")
                return None

        briefing_key = f'briefing_{mbti_group}'
        briefing = item.get(briefing_key)
        if briefing:
            logger.info(f"Using cached briefing for {mbti_group} (generated: {generated_at})")
        return briefing

    except Exception as e:
        logger.warning(f"Failed to fetch cached briefing: {e}")
        return None


def _fetch_article_body(s3_body_uri: str, max_chars: int = 500) -> str:
    """Fetch article body from S3 and return truncated content_ko."""
    try:
        if not s3_body_uri or not s3_body_uri.startswith('s3://'):
            return ''
        parts = s3_body_uri.replace('s3://', '').split('/', 1)
        bucket, key = parts[0], parts[1]
        s3 = boto3.client('s3', region_name='ap-northeast-2')
        resp = s3.get_object(Bucket=bucket, Key=key)
        body = json.loads(resp['Body'].read().decode('utf-8'))
        content = body.get('content_ko', '')
        return content[:max_chars] if content else ''
    except Exception as e:
        logger.warning(f"Failed to fetch article body from S3: {e}")
        return ''


def get_recent_articles(limit: int = 5) -> List[Dict[str, Any]]:
    """Fetch recent articles with body content for context"""
    try:
        dynamodb = boto3.resource('dynamodb', region_name='us-east-1')
        table = dynamodb.Table(DYNAMODB_TABLE_ARTICLES_DEV)

        # Query recent articles from multiple categories
        from boto3.dynamodb.conditions import Key
        all_items = []
        for cat in ['경제', '정치', '사회', 'IT_과학']:
            try:
                response = table.query(
                    IndexName='category-published_at-index',
                    KeyConditionExpression=Key('category').eq(cat),
                    ScanIndexForward=False,
                    Limit=3
                )
                all_items.extend(response.get('Items', []))
            except Exception:
                continue

        # Sort by published_at descending, take top N
        all_items.sort(key=lambda x: x.get('published_at', ''), reverse=True)
        all_items = all_items[:limit]

        articles = []
        for item in all_items:
            content = _fetch_article_body(item.get('s3_body_uri', ''))
            articles.append({
                'news_id': item.get('news_id'),
                'title': item.get('title_ko', ''),
                'category': item.get('category', ''),
                'published_at': item.get('published_at', ''),
                'content': content,
            })

        return articles
    except Exception as e:
        logger.warning(f"Failed to fetch recent articles: {e}")
        return []


def build_context_prompt(articles: List[Dict[str, Any]], mbti_group: str) -> str:
    """Build context about recent news for the chatbot"""
    if not articles:
        return ""

    context = "\n\n[최근 뉴스 컨텍스트 - 필요시 참조]\n"
    for i, article in enumerate(articles[:5], 1):
        content_preview = article.get('content', '')
        if content_preview:
            context += f"{i}. [{article['category']}] {article['title']} ({article['published_at'][:10]})\n   {content_preview[:200]}\n\n"
        else:
            context += f"{i}. [{article['category']}] {article['title']} ({article['category']}, {article['published_at'][:10]})\n"

    return context


KOREAN_STOPWORDS = {
    '은', '는', '이', '가', '을', '를', '에', '의', '로', '으로',
    '와', '과', '도', '만', '부터', '까지', '에서', '한', '된', '하는',
    '있는', '없는', '대한', '위한', '통한', '그', '저', '것', '해줘',
    '수', '등', '및', '또', '더', '좀', '뭐', '어떤', '오늘', '최근',
    '알려줘', '설명해줘', '분석해줘', '추천해줘', '어때', '뭐야',
}


def search_related_articles(user_message: str, limit: int = 3) -> List[Dict[str, Any]]:
    """Search DynamoDB for articles related to the user's message keywords."""
    try:
        keywords = [w for w in user_message.split() if len(w) >= 2 and w not in KOREAN_STOPWORDS][:5]
        if not keywords:
            return []

        dynamodb = boto3.resource('dynamodb', region_name='us-east-1')
        table = dynamodb.Table(DYNAMODB_TABLE_ARTICLES_DEV)
        from boto3.dynamodb.conditions import Key, Attr
        from datetime import timedelta, timezone

        kst = timezone(timedelta(hours=9))
        now = datetime.now(kst)
        week_ago = (now - timedelta(days=7)).isoformat()

        all_matches = []
        for cat in ['경제', '정치', '사회', 'IT_과학', '문화']:
            try:
                filter_expr = None
                for kw in keywords:
                    cond = Attr('title_ko').contains(kw)
                    filter_expr = cond if filter_expr is None else (filter_expr | cond)

                response = table.query(
                    IndexName='category-published_at-index',
                    KeyConditionExpression=Key('category').eq(cat) & Key('published_at').gte(week_ago),
                    FilterExpression=filter_expr,
                    ScanIndexForward=False,
                    Limit=20,
                )
                all_matches.extend(response.get('Items', []))
            except Exception:
                continue

        all_matches.sort(key=lambda x: x.get('published_at', ''), reverse=True)

        # Fallback: 키워드 매칭 없고, 매우 광범위한 뉴스 요청일 때만 최신 기사 반환
        # '오늘'·'시장'·'경제' 등은 너무 포괄적이라 구체 질문(예: '삼성전자 오늘 주가')까지
        # 광범위로 분류되어 엉뚱한 기사가 추천되던 문제가 있었음. 엄격한 화이트리스트 사용.
        BROAD_KEYWORDS = {'뉴스', '기사', '소식', '이슈', '헤드라인', '브리핑'}
        has_broad = any(bk in user_message for bk in BROAD_KEYWORDS)
        # 추가 안전장치: 키워드가 3개 이하일 때만 fallback 허용 (구체 질문 제외)
        is_short_query = len(keywords) <= 3
        if not all_matches and has_broad and is_short_query:
            for cat in ['경제', '정치', '사회']:
                try:
                    response = table.query(
                        IndexName='category-published_at-index',
                        KeyConditionExpression=Key('category').eq(cat) & Key('published_at').gte(week_ago),
                        ScanIndexForward=False,
                        Limit=2,
                    )
                    all_matches.extend(response.get('Items', []))
                except Exception:
                    continue
            all_matches.sort(key=lambda x: x.get('published_at', ''), reverse=True)

        results = []
        for item in all_matches[:limit]:
            image_url = None
            images = item.get('images', [])
            if images and isinstance(images, list) and len(images) > 0:
                img = images[0]
                image_url = img.get('url', '') if isinstance(img, dict) else str(img)

            results.append({
                'news_id': item.get('news_id', ''),
                'title_ko': item.get('title_ko', ''),
                'category': item.get('category', ''),
                'published_at': item.get('published_at', ''),
                'original_link': item.get('original_link', item.get('url', '')),
                'image_url': image_url,
            })

        return results
    except Exception as e:
        logger.warning(f"Failed to search related articles: {e}")
        return []


def build_context_from_briefing(briefing_text: str) -> str:
    """Build context from pre-generated daily briefing."""
    return f"\n\n[오늘의 뉴스 브리핑 - 대화 시 참조]\n{briefing_text}\n"


# ── Shared helpers ──────────────────────────────────────────────

GENERAL_INSTRUCTIONS = """

[대화 톤 — 전화 통화처럼]
1. 친구와 전화로 한 호흡씩 주고받듯 답하세요. 절대 기사·리포트처럼 쓰지 마세요.
2. **한 답변 = 1~2 문장, 50~120자.** 절대 그 이상 X. 사용자가 명시적으로 "자세히 설명해줘"
   라고 했을 때만 길게.
3. 마크다운 사용 금지: 헤더(#, ##), 리스트(-, •, 1.), 볼드(**…**), 표, 구분선(---), 코드블록.
4. 이모지 금지: 📰 💭 🤔 😊 등 절대 X. 평문만.
5. 줄바꿈 사용 금지. 한 단락 한 호흡으로.
6. 답 끝에 매번 질문 다는 패턴 X. 자연스럽게 이어지면 한 줄 질문 OK, 아니면 그냥 끝내기.
7. 길게 쓰고 싶어도 참고 — 한 통화 turn 은 짧게, 사용자가 더 물으면 그때 이어 풀어주세요.

[도입 멘트·확인 멘트 절대 금지 — 매우 중요]
- "잠깐만요, 확인해볼게요" "찾아볼게요" "한번 보겠습니다" "알아볼게요" "정리해드릴게요"
  같은 사전 안내 멘트 절대 출력 X. 그대로 본론 시작.
- 도구 호출 전후로도 안내 멘트 X. 도구 결과 받자마자 사용자에게 핵심만 바로 답하세요.
- "음, 그렇군요" "아 네" 같은 추임새도 첫 turn 에는 안 씀 — 바로 사실로.

[정보 정확성]
1. 도구 선택:
   - get_stock_price: "주가/시세/가격/얼마" 같은 시세 키워드 있을 때
   - get_market_index: "코스피/코스닥/지수" 키워드 있을 때
   - search_news: 기업·인물·이슈·정책 언급 또는 뉴스 배경 요청
   - 도구 없이 답변: 일상 대화, 개념 설명, 역사 사실
2. 모르는 건 "잘 모르겠어요" — 추측하지 않기.
3. 투자 조언/추천 X.
4. 수치 만들어내지 않기.

답변은 한국어로 자연스럽게. 첫 단어부터 본론.
"""

NO_CONTEXT_INSTRUCTIONS = """

[뉴스 컨텍스트 없음]
오늘의 뉴스 브리핑 데이터에 접근할 수 없는 상황입니다.
- 시장 데이터 (get_market_index / get_stock_price) 가 필요하면 도구 바로 호출하고
  결과 받자마자 본론 한 호흡으로 답하세요. 사용자에게 양해 멘트 X.
- 뉴스 자체에 대한 질문이고 도구도 못 쓰는 경우에만 한 문장으로 "지금은 뉴스 데이터가
  없어서 자세히 못 짚어드려요" 정도. 그 이상 안 늘림.
- 절대 뉴스 내용을 지어내지 마세요.
"""


def _build_full_system_prompt(mbti_group: str, recent_articles=None, cached_briefing=None) -> str:
    """Build complete system prompt with context and instructions."""
    # Admin-3: prompt source = sedaily-mbti-admin-prompts-dev (DDB) with 5-min TTL
    # cache, falling back to prompts/chatbot/<group>.md on DDB miss/error. Unknown
    # MBTI groups inherit the SF persona — same fallback the legacy hardcoded
    # MBTI_SYSTEM_PROMPTS dict used.
    group = mbti_group if mbti_group in MBTI_GROUPS else 'SF'
    prompt = load_chatbot_prompt(group)

    if cached_briefing:
        prompt += build_context_from_briefing(cached_briefing)
    elif recent_articles:
        prompt += build_context_prompt(recent_articles, mbti_group)
    else:
        prompt += NO_CONTEXT_INSTRUCTIONS

    prompt += GENERAL_INSTRUCTIONS
    return prompt


def _get_tools() -> list:
    """Return tool definitions for Claude."""
    return [
        {
            "name": "get_stock_price",
            "description": "한국 주식의 실시간 시세를 조회합니다. 장중에는 현재가, 장 마감 후에는 종가를 반환합니다. 종목명(예: 삼성전자) 또는 종목코드(예: 005930)로 검색할 수 있습니다.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "종목명 또는 종목코드 (예: '삼성전자', '005930', 'SK하이닉스')"
                    }
                },
                "required": ["query"]
            }
        },
        {
            "name": "get_market_index",
            "description": "코스피(KOSPI) 또는 코스닥(KOSDAQ) 시장 지수를 조회합니다. 시장 분석 시 반드시 이 도구로 실제 지수를 확인하세요.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "시장 지수명 (예: '코스피', '코스닥', 'KOSPI', 'KOSDAQ')"
                    }
                },
                "required": ["query"]
            }
        },
        {
            "name": "search_news",
            "description": "기업·인물·이슈 등 키워드로 서울경제 DB에서 최신 기사를 검색합니다. 주가가 없는 비상장 기업(예: 삼성바이오에피스, OpenAI 등)이나 일반 이슈·사건 관련 질문에 활용하세요. get_stock_price가 실패했을 때 자동으로 폴백으로 이 도구를 호출해 관련 소식을 찾아 답변하세요.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "검색 키워드 (예: '삼성바이오에피스', '엔비디아 AI 칩', '미국 금리')"
                    }
                },
                "required": ["query"]
            }
        }
    ]


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


def lambda_handler(event: dict, context) -> dict:
    """
    Lambda handler for chatbot API.

    Expected request body:
    {
        "message": "사용자 메시지",
        "mbti_group": "NT" | "NF" | "ST" | "SF",
        "conversation_history": [
            {"role": "user", "content": "이전 메시지"},
            {"role": "assistant", "content": "이전 응답"}
        ]
    }

    Response:
    {
        "response": "AI 응답 텍스트",
        "mbti_group": "NT",
        "persona": {
            "name": "민철",
            "role": "전략 분석 에디터",
            "emoji": "📊"
        }
    }
    """
    try:
        # Support both HTTP API v2 and REST API v1 event formats
        request_context = event.get('requestContext', {})

        # HTTP API v2 format
        if 'http' in request_context:
            http_method = request_context['http'].get('method', 'GET')
        else:
            # REST API v1 format
            http_method = event.get('httpMethod', 'GET')

        # Handle CORS preflight — must precede feature-flag gate so disabled state
        # still returns a successful preflight (browser refuses non-2xx preflight).
        if http_method == 'OPTIONS':
            return {
                'statusCode': 200,
                'headers': CORS_HEADERS,
                'body': ''
            }

        if not is_enabled("chatbot"):
            return {
                "statusCode": 503,
                "headers": {**CORS_HEADERS, "Content-Type": "application/json"},
                "body": json.dumps({"error": "chatbot disabled by admin"}),
            }

        # Parse request body (handle base64 encoding for HTTP API v2)
        import base64
        body = event.get('body', '{}')
        is_base64 = event.get('isBase64Encoded', False)

        if body and is_base64:
            body = base64.b64decode(body).decode('utf-8')

        if isinstance(body, str) and body:
            body = json.loads(body)
        elif not body:
            body = {}

        user_message = body.get('message', '').strip()
        mbti_group = body.get('mbti_group', 'SF').upper()
        conversation_history = body.get('conversation_history', [])

        # Validate inputs
        if not user_message:
            return {
                'statusCode': 400,
                'headers': CORS_HEADERS,
                'body': json.dumps({
                    'error': {
                        'code': 'INVALID_REQUEST',
                        'message': '메시지를 입력해주세요.'
                    }
                })
            }
        # Bound the message length before sending to Bedrock. The chatbot
        # Haiku call has no per-user rate limit; without a cap a single
        # caller can submit very long inputs and run up unbounded cost.
        if len(user_message) > 4000:
            return {
                'statusCode': 400,
                'headers': CORS_HEADERS,
                'body': json.dumps({
                    'error': {
                        'code': 'MESSAGE_TOO_LONG',
                        'message': '메시지가 너무 깁니다. 4000자 이하로 줄여주세요.'
                    }
                }, ensure_ascii=False)
            }

        if mbti_group not in MBTI_GROUPS:
            mbti_group = 'SF'  # Default fallback

        logger.info(f"Chat request: group={mbti_group}, message_length={len(user_message)}")

        # Try cached briefing first, fall back to article query
        cached_briefing = get_cached_briefing(mbti_group)
        recent_articles = None if cached_briefing else get_recent_articles(5)

        # Generate response (sync wrapper for async function)
        import asyncio
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

        try:
            response_text = loop.run_until_complete(
                generate_chat_response(
                    user_message=user_message,
                    mbti_group=mbti_group,
                    conversation_history=conversation_history,
                    recent_articles=recent_articles,
                    cached_briefing=cached_briefing
                )
            )
        finally:
            loop.close()

        # Build persona info
        persona_map = {
            # 정본 = 민철/하은/준서/소율 (v3). 프론트 PERSONA_META
            # (shared/lib/todayLettersApi.ts) 및 프롬프트와 1:1 유지할 것.
            'NT': {'name': '민철', 'role': '전략 분석 에디터', 'emoji': '📊'},
            'NF': {'name': '하은', 'role': '오피니언 에디터', 'emoji': '💡'},
            'ST': {'name': '준서', 'role': '팩트 큐레이터', 'emoji': '📋'},
            'SF': {'name': '소율', 'role': '트렌드 캐스터', 'emoji': '💬'},
        }

        # Search related articles based on user message
        related_articles = search_related_articles(user_message, limit=3)

        return {
            'statusCode': 200,
            'headers': CORS_HEADERS,
            'body': json.dumps({
                'response': response_text,
                'mbti_group': mbti_group,
                'persona': persona_map.get(mbti_group, persona_map['SF']),
                'recommended_articles': related_articles,
                'timestamp': datetime.now().isoformat()
            }, ensure_ascii=False)
        }

    except json.JSONDecodeError as e:
        logger.error(f"JSON decode error: {e}")
        return {
            'statusCode': 400,
            'headers': CORS_HEADERS,
            'body': json.dumps({
                'error': {
                    'code': 'INVALID_JSON',
                    'message': '잘못된 요청 형식입니다.'
                }
            })
        }

    except Exception as e:
        logger.error(f"Chatbot error: {e}", exc_info=True)
        return {
            'statusCode': 500,
            'headers': CORS_HEADERS,
            'body': json.dumps({
                'error': {
                    'code': 'INTERNAL_ERROR',
                    'message': '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'
                }
            })
        }
