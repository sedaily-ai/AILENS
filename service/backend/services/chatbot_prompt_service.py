"""챗봇 시스템 프롬프트/컨텍스트 텍스트 구성 + Bedrock tool 정의.

2026-08-05: `handlers/chatbot_handler.py`(869줄)에서 분리. 이미 조회된 데이터를
프롬프트 텍스트로 조립하는 책임만 모았다 — 데이터 조회는
`services/chatbot_context_service.py`, Bedrock 호출은 `services/chatbot_engine.py`.
"""
from typing import List, Dict, Any

from config.constants import MBTI_GROUPS
from services.prompt_loader import load_chatbot_prompt


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
