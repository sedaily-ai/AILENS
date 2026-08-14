"""
결정 카드(/decide) — 실시간 LLM 백엔드 (Bedrock Claude).

프런트(정적 사이트)의 features/decision-card/lib/llm.ts 가 이 Function URL 로 POST 한다.
브라우저에서 Bedrock 을 직접 부를 수 없으므로(AWS 키 노출) 이 Lambda 가 대리 호출한다.

요청 body (JSON):
  {
    "lang": "ko" | "en",
    "decisionText": "...",              # 사용자가 적은 결정 사항
    "chosenOption": "yes"|"no"|"maybe"|"later",
    "personaId": "wise"|"bold"|"calm"|"kind",
    "saju": { "ilganOh": "목"|"화"|"토"|"금"|"수" }   # 일간 오행. 없으면 목 기본
  }

응답 body (JSON): { "text": "..." }
  - 1~2문장, 페르소나 톤으로 카드에 새길 짧은 조언

환경변수:
  BEDROCK_MODEL_ID  기본 'anthropic.claude-haiku-4-5' (테스트)
                    운영: 'anthropic.claude-sonnet-4-6' 또는 'anthropic.claude-opus-4-8'
  MAX_TOKENS        기본 150 (카드 문구는 짧게)
  ALLOW_ORIGIN      CORS 허용 오리진, 기본 'https://saju.sedaily.ai'
"""
import base64
import json
import os

import boto3

bedrock = boto3.client("bedrock-runtime", region_name=os.environ.get("AWS_REGION", "us-east-1"))

MODEL_ID = os.environ.get("BEDROCK_MODEL_ID", "anthropic.claude-haiku-4-5")
MAX_TOKENS = int(os.environ.get("MAX_TOKENS", "150"))
ALLOW_ORIGIN = os.environ.get("ALLOW_ORIGIN", "https://saju.sedaily.ai")

PERSONA_KO = {
    "wise": "현명한 조언자. 깊이 있고 균형 잡힌 시각, 명리 통찰을 담담히 짚어준다.",
    "bold": "용감한 응원자. 긍정적이고 힘 있는 어조로 행동을 북돋는다.",
    "calm": "차분한 관찰자. 서두르지 않고, 사유할 여지를 남기며 조용히 짚어준다.",
    "kind": "따뜻한 공감자. 감정을 먼저 알아봐주고 다정하게 다독인다.",
}
PERSONA_EN = {
    "wise": "A wise advisor — deep, balanced, quietly grounded in the chart's logic.",
    "bold": "A bold cheerleader — energetic, positive, pushes toward action.",
    "calm": "A calm observer — unhurried, leaves room for reflection.",
    "kind": "A warm empathizer — names the feeling first, gently reassures.",
}

OPTION_KO = {
    "yes": "사용자는 '그래, 하자'는 쪽으로 마음이 기울어 있다.",
    "no": "사용자는 '아니야, 말자'는 쪽으로 마음이 기울어 있다.",
    "maybe": "사용자는 아직 확신이 없어 망설이고 있다.",
    "later": "사용자는 지금 당장 결정하기보다 미루고 싶어 한다.",
}
OPTION_EN = {
    "yes": "The user leans toward 'yes, let's do it'.",
    "no": "The user leans toward 'no, let's not'.",
    "maybe": "The user is unsure and hesitating.",
    "later": "The user wants to postpone deciding right now.",
}

BASE_KO = (
    "당신은 서울경제 사주 서비스의 '오늘의 결정 카드' 작성자입니다. "
    "사용자가 오늘 고민 중인 결정을 적으면, 그의 사주 일간 오행과 페르소나 목소리로 "
    "짧고 인상적인 카드 문구를 하나 써줍니다. "
    "원칙: (1) 반드시 1~2문장, 부적/타로카드처럼 소장하고 싶은 함축적 문장. "
    "(2) 명리 용어를 그대로 쓰지 말고 일상어로 녹여낼 것. "
    "(3) 사용자가 적은 결정 내용을 구체적으로 반영할 것 — 일반론으로 흐르지 말 것. "
    "(4) 정답을 단정하지 말고, 여운이 남는 한마디로 닫을 것. "
    "(5) 위로 멘트나 상투적 표현 금지."
)
BASE_EN = (
    "You write the 'Today's Decision Card' for Sedaily's saju service. "
    "Given a decision the user is weighing today, write ONE short, memorable card line "
    "in the given persona's voice, grounded in their day-master element. "
    "Rules: (1) 1-2 sentences only, worth keeping like a talisman or tarot card. "
    "(2) Never drop bare saju jargon — translate into plain language. "
    "(3) Concretely reflect what the user actually wrote — no generic filler. "
    "(4) Don't declare a verdict; close with a resonant, open note. "
    "(5) No comfort-filler or cliches."
)

ELEMENT_HINT_KO = {
    "목": "목(木) 기운 — 성장·확장·유연함",
    "화": "화(火) 기운 — 열정·표현·즉흥성",
    "토": "토(土) 기운 — 안정·현실감·신중함",
    "금": "금(金) 기운 — 원칙·정리·결단력",
    "수": "수(水) 기운 — 사유·직관·유연한 흐름",
}
ELEMENT_HINT_EN = {
    "목": "Wood — growth, expansion, flexibility",
    "화": "Fire — passion, expression, impulse",
    "토": "Earth — stability, groundedness, caution",
    "금": "Metal — principle, order, decisiveness",
    "수": "Water — reflection, intuition, adaptive flow",
}


def _system(lang: str) -> str:
    return BASE_EN if lang == "en" else BASE_KO


def _user(payload: dict, lang: str) -> str:
    persona_map = PERSONA_EN if lang == "en" else PERSONA_KO
    option_map = OPTION_EN if lang == "en" else OPTION_KO
    element_map = ELEMENT_HINT_EN if lang == "en" else ELEMENT_HINT_KO

    persona_id = payload.get("personaId", "wise")
    option = payload.get("chosenOption", "maybe")
    ilgan_oh = (payload.get("saju") or {}).get("ilganOh", "목")

    context = {
        "persona": persona_map.get(persona_id, persona_map["wise"]),
        "userMood": option_map.get(option, option_map["maybe"]),
        "element": element_map.get(ilgan_oh, element_map["목"]),
        "decision": payload.get("decisionText", ""),
    }
    return json.dumps(context, ensure_ascii=False)


def _call_bedrock(system_prompt: str, user_message: str) -> str:
    body = json.dumps({
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": MAX_TOKENS,
        "system": [{"type": "text", "text": system_prompt}],
        "messages": [{"role": "user", "content": user_message}],
    })
    resp = bedrock.invoke_model(
        modelId=MODEL_ID,
        contentType="application/json",
        accept="application/json",
        body=body,
    )
    parsed = json.loads(resp["body"].read())
    return parsed.get("content", [{}])[0].get("text", "").strip()


def _parse_body(event: dict) -> dict:
    raw = event.get("body") or "{}"
    if event.get("isBase64Encoded"):
        raw = base64.b64decode(raw).decode("utf-8")
    return json.loads(raw)


def _response(status: int, obj: dict) -> dict:
    return {
        "statusCode": status,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": ALLOW_ORIGIN,
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        },
        "body": json.dumps(obj, ensure_ascii=False),
    }


def handler(event, _context):
    method = (event.get("requestContext", {}).get("http", {}) or {}).get("method", "POST")
    if method == "OPTIONS":
        return _response(200, {})
    try:
        payload = _parse_body(event)
        lang = "en" if payload.get("lang") == "en" else "ko"
        if not payload.get("decisionText"):
            return _response(400, {"error": "decisionText required"})
        text = _call_bedrock(_system(lang), _user(payload, lang))
        return _response(200, {"text": text})
    except Exception as exc:  # noqa: BLE001 — 백엔드 오류 시 프런트는 mock 으로 폴백
        return _response(500, {"error": str(exc)})
