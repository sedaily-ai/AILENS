"""
사주 챗봇 — 실시간 LLM 백엔드 (Bedrock Claude).

프런트(정적 사이트)의 lib/llm.ts 가 이 Function URL 로 POST 한다.
브라우저에서 Bedrock 을 직접 부를 수 없으므로(AWS 키 노출) 이 Lambda 가 대리 호출한다.

요청 body (JSON):
  {
    "task": "classify" | "hit" | "overlay" | "knot",
    "lang": "ko" | "en",
    "saju": { ilganOh, level, score, lacking[], excess[],
              currentDaeunOh, currentDaeunAge, nextDaeunOh, nextDaeunAge },
    "concern": "career" | "money" | "relationship" | "overwhelmed",   # optional
    "narrowAnswers": [..],   # optional
    "prior": [..],           # 누적 고민 (연결용), optional
    "eraFacts": [{ "text", "source" }],   # optional
    "userText": "..."        # classify 시 자유 입력
  }

응답 body (JSON): { "text": "..." }
  - classify 면 text 는 career/money/relationship/overwhelmed/none 중 하나

환경변수:
  BEDROCK_MODEL_ID  기본 'anthropic.claude-haiku-4-5' (테스트)
                    운영: 'anthropic.claude-sonnet-4-6' 또는 'anthropic.claude-opus-4-8'
  MAX_TOKENS        기본 400
  ALLOW_ORIGIN      CORS 허용 오리진, 기본 'https://saju.sedaily.ai'
"""
import base64
import json
import os
import time

import boto3

bedrock = boto3.client("bedrock-runtime", region_name=os.environ.get("AWS_REGION", "us-east-1"))

MODEL_ID = os.environ.get("BEDROCK_MODEL_ID", "anthropic.claude-haiku-4-5")
MAX_TOKENS = int(os.environ.get("MAX_TOKENS", "400"))
ALLOW_ORIGIN = os.environ.get("ALLOW_ORIGIN", "https://saju.sedaily.ai")

# ── 글로벌 일일 킬스위치 (비용 폭주 방지) ──
# USAGE_TABLE 미설정 시 비활성(무제한). 설정 시 KST 하루 총 호출이 DAILY_LIMIT 를 넘으면
# Bedrock 을 호출하지 않고 빈 응답을 돌려 프런트가 템플릿으로 폴백하게 한다.
USAGE_TABLE = os.environ.get("USAGE_TABLE", "")
DAILY_LIMIT = int(os.environ.get("DAILY_LIMIT", "500"))
_ddb = boto3.client("dynamodb", region_name=os.environ.get("AWS_REGION", "us-east-1")) if USAGE_TABLE else None

def _within_daily_limit() -> bool:
    """오늘(KST) 글로벌 호출 수를 원자적으로 +1 하고 상한 이내인지 반환. 장애 시 fail-open."""
    if not _ddb:
        return True
    kst_day = time.strftime("%Y-%m-%d", time.gmtime(time.time() + 9 * 3600))
    try:
        resp = _ddb.update_item(
            TableName=USAGE_TABLE,
            Key={"id": {"S": f"global#{kst_day}"}},
            UpdateExpression="ADD #c :one SET #t = if_not_exists(#t, :ttl)",
            ExpressionAttributeNames={"#c": "count", "#t": "ttl"},
            ExpressionAttributeValues={
                ":one": {"N": "1"},
                ":ttl": {"N": str(int(time.time()) + 172800)},  # 2일 후 자동 삭제
            },
            ReturnValues="UPDATED_NEW",
        )
        return int(resp["Attributes"]["count"]["N"]) <= DAILY_LIMIT
    except Exception:  # noqa: BLE001 — 카운터 장애로 서비스를 막지 않음(예약 동시성이 별도 천장)
        return True

# 서비스 정체성 = 8/9 원칙. 위로 멘트 금지, 담백한 팩트, 사주(개인의 시간) 위에 시대(세상의 시간)를 얹는다.
BASE_KO = (
    "당신은 서울경제의 사주 챗봇입니다. 점을 치는 게 아니라, 개인의 사주(개인의 시간) 위에 "
    "지금 시대의 흐름(세상의 시간)을 얹어 담백하게 읽어줍니다.\n"
    "원칙: (1) 위로·공감 멘트 금지, 팩트만 담백하게. (2) 사주는 경향이지 단정이 아님. "
    "(3) 매듭짓기는 '재해석 한 줄 + 행동 하나'로 닫는다. (4) 2~4문장, 군더더기 없이. "
    "(5) 제공된 시대 팩트(eraFacts)는 최근 흐름·보도 맥락이다. 없는 통계를 새로 지어내지 말고, 주어진 내용 범위에서만 정성적으로 얹어라. "
    "(6) ★명리 용어(오행·십성·신강약·격국·용신·대운 등)는 절대 그대로 던지지 말고, 반드시 일상어로 풀어 설명할 것★. "
    "예: '화(火)가 강하다'→'추진력과 표현 욕구가 큰 대신, 한번 타오르면 쉽게 지치는 편'. "
    "'수(水) 과다'→'생각·감정이 많아 신중하지만 결정이 느려지기 쉬움'. 사용자가 명리를 몰라도 바로 이해되게.\n"
    "(7) ★사용자가 직접 적은 말(userText·history·narrowAnswers)이 있으면 그 구체적 내용에 반드시 닿게 답할 것 — "
    "정해진 일반론·고정 문구로 빠지지 말고, 사용자가 처한 실제 상황(예: '헤어졌다')과 모순되는 말은 절대 하지 말 것★."
)
BASE_EN = (
    "You are Sedaily's saju chatbot. Not fortune-telling: you lay the currents of the present era "
    "(the world's time) on top of the person's saju (their time), plainly.\n"
    "Principles: (1) No comforting/empathy filler — just plain facts. (2) Saju is tendency, not verdict. "
    "(3) Close with one reframe + one action. (4) 2-4 sentences, no padding. "
    "(5) Era facts are recent context/news — do not invent statistics; weave them in qualitatively, only within what's given. "
    "(6) NEVER drop bare saju jargon (elements, ten-gods, strength, structure, useful element, luck cycle) — "
    "always translate it into plain everyday meaning. e.g. 'strong Fire' -> 'lots of drive and need to express, but burns out fast'. "
    "Make it understandable to someone who knows nothing about saju.\n"
    "(7) If the user wrote their own words (userText/history/narrowAnswers), you MUST address that specific content — "
    "never fall back to generic boilerplate, and never say anything that contradicts their actual situation (e.g. 'broke up')."
)

TASK_KO = {
    "classify": "사용자의 자유 입력을 다음 중 하나로 분류해 그 영어 단어 하나만 출력: career, money, relationship, overwhelmed, none.",
    "predict": "입력 직후의 일반 성향 '맞히기'. 명식(일간 오행·신강약·결여 오행)을 근거로 '당신은 아마 이렇지 않아요?' 식 2~3줄. 마지막 줄은 결여/약점을 부드러운 질문형으로. 매번 표현을 달리하고, 위로·단정 금지.",
    "hit": "명식과 좁혀진 상황을 근거로 '그동안 이러지 않았어요?' 식의 구체적 추정(맞히기) 한 단락. 질문형으로 끝낼 것.",
    "overlay": "지금이 사주상 어떤 시기인지(대운 오행) 한 줄 + 제공된 시대 팩트로 자연스럽게 넘어가는 한 줄.",
    "knot": "재해석 한 줄 + 구체 행동 하나로 매듭짓기. prior(앞 고민)가 있으면 같은 뿌리로 연결.",
    "freeform": (
        "사용자가 자유롭게 던진 구체적 질문(userText)에 '그 질문 자체'로 답한다. "
        "★history(직전 대화)가 주어지면 반드시 그 맥락을 이어서 답할 것 — 앞서 네가 한 말("
        "예: '현지의 현실을 봐두세요')을 사용자가 되물으면, 모른다 하지 말고 그 말을 구체적으로 풀어줄 것★. "
        "기본은 명식(사주=개인의 시간)으로 사용자 상황을 읽어주는 것이다. "
        "★'시장·업계·요즘 흐름' 같은 세상 이야기를 하려면, 반드시 제공된 eraFacts 기사 중 하나의 제목을 직접 인용하며 그 사실에 근거해서만 말하라"
        "(예: \"서울경제 보도처럼 '…기사 제목…'\"). 인용할 기사가 없거나 질문과 안 맞으면, 시장·업계·트렌드 이야기를 한 문장도 하지 말 것 — "
        "네 일반 지식으로 '시장이 ~다'라고 단정하는 것은 금지다★. "
        "★질문과 무관한 일반 성향론·번아웃·운세로 빠지지 말 것★. 위로·단정 금지. 통계·수치 날조 금지. "
        "마지막에 '재해석: 한 줄' + '행동: 하나'로 닫는다. 2~5문장."
    ),
}
TASK_EN = {
    "classify": "Classify the user's free text into one of: career, money, relationship, overwhelmed, none. Output only that one English word.",
    "predict": "An initial general 'cold read' right after intake. Grounded in the chart (day-master element, strength, missing element), 2-3 lines of 'you're probably like this, aren't you?'. End on the weakness as a gentle question. Vary the wording each time; no comfort, no verdicts.",
    "hit": "One paragraph of a specific 'haven't you been...?' guess grounded in the chart and narrowed situation. End as a question.",
    "overlay": "One line on what season the chart is in (luck-cycle element) + one line bridging into the era facts.",
    "knot": "Close with one reframe + one concrete action. If prior concerns exist, tie them to the same root.",
    "freeform": (
        "Answer the user's specific free-text question (userText) AS ITSELF. "
        "If history (prior turns) is given, ALWAYS continue from that context — if the user asks back about "
        "something you just said (e.g. 'see the local reality first'), do NOT say you don't understand; unpack it concretely. "
        "Default to reading the user's situation through the chart (their saju). "
        "To say ANYTHING about 'the market / the industry / current trends', you MUST quote one of the provided eraFacts headlines and ground it in that fact "
        "(e.g. \"as Sedaily reports, '…headline…'\"). If no article fits the question, do NOT say a single sentence about markets/industry/trends — "
        "asserting 'the market is …' from your own knowledge is forbidden. "
        "Do NOT drift into generic personality/burnout/fortune readings unrelated to the question. No comfort, no verdicts. No fabricated stats. "
        "Close with 'Reframe:' one line + 'Action:' one. 2-5 sentences."
    ),
}


def _system(task: str, lang: str) -> str:
    base = BASE_EN if lang == "en" else BASE_KO
    tasks = TASK_EN if lang == "en" else TASK_KO
    return base + "\n\n[TASK] " + tasks.get(task, tasks["hit"])


def _user(payload: dict) -> str:
    # 명식·상황을 그대로 직렬화해 전달 (모델이 근거로 사용)
    keep = {k: payload.get(k) for k in ("saju", "concern", "narrowAnswers", "prior", "eraFacts", "userText", "history")}
    return json.dumps(keep, ensure_ascii=False)


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
        task = payload.get("task", "hit")
        lang = "en" if payload.get("lang") == "en" else "ko"
        if task not in ("classify", "predict", "hit", "overlay", "knot", "freeform"):
            return _response(400, {"error": "invalid task"})
        # 글로벌 일일 상한 초과 시 Bedrock 미호출 → 프런트는 템플릿으로 폴백
        if not _within_daily_limit():
            return _response(200, {"text": "", "limited": True})
        text = _call_bedrock(_system(task, lang), _user(payload))
        return _response(200, {"text": text})
    except Exception as exc:  # noqa: BLE001 — 백엔드 오류 시 프런트는 템플릿으로 폴백
        return _response(500, {"error": str(exc)})
