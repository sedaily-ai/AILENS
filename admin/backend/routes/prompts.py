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
import logging
import urllib.error
import urllib.request

from repo import prompts_repo
from shared import audit, response, secrets_client

logger = logging.getLogger(__name__)

# LLMOps 테스트 실행(2026-08-19) — 프롬프트 드로어에서 "테스트 실행"을 누르면
# (저장 여부와 무관하게) 지금 편집 중인 content + 붙여넣은 기사 원문을 그대로
# GPT에 넘겨 실제 산출물을 보여준다. 이 프로젝트의 OpenAI 키는 마스터DB
# 뉴스웹툰 파이프라인(README 참조)과 같은 시크릿을 재사용 — 신규 키 발급 없이
# 이미 있는 것으로 연결. 텍스트 산출물(레터/웹툰 스크립트/영상 각본/팟캐스트
# 대본)만 다룬다 — 이미지·음성·영상 렌더링은 별도 파이프라인(추후).
# API Gateway HTTP API 통합 타임아웃은 30초 고정(늘릴 수 없음) — Lambda
# 자체 Timeout 도 30초로 맞춰져 있다. OpenAI 호출은 그 안에서 여유를 두고
# 끊어야 Lambda가 강제 종료되기 전에 우리 쪽 에러 메시지를 돌려줄 수 있다.
_OPENAI_SECRET_ID = "sedaily-mbti/openai-api-key"
_OPENAI_MODEL = "gpt-4o"
_OPENAI_TIMEOUT_SECONDS = 25
_OPENAI_MAX_TOKENS = 3000

# Postgres엔 DynamoDB 400KB 아이템 한계가 없지만, 첨부 남용 방지용 sane
# 상한으로 그대로 유지한다. 한글은 UTF-8에서 3바이트라 글자 수로 재면
# 3배를 놓친다 — 반드시 인코딩 후 길이로 잰다.
_MAX_PAYLOAD_BYTES = 340 * 1024


def handle_list(body: dict, path_params: dict, query_params: dict) -> dict:
    prompts = prompts_repo.list_prompts()
    prompts.sort(key=lambda p: p["id"])
    return response.ok({"prompts": prompts})


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

    payload_bytes = len(new_content.encode("utf-8"))
    if sections is not None:
        payload_bytes += len(json.dumps(sections, ensure_ascii=False).encode("utf-8"))
    if payload_bytes > _MAX_PAYLOAD_BYTES:
        return response.err(
            f"prompt too large: {payload_bytes} bytes "
            f"(max {_MAX_PAYLOAD_BYTES}) — 첨부를 줄여 주세요",
            400,
        )

    result = prompts_repo.update_prompt(category, name, new_content, sections)
    new_version = result["new_version"]
    prev_version = result["prev_version"]
    created = result["created"]

    audit.log("prompt-update", {
        "prompt": f"{category}/{name}",
        "new_version": new_version,
        "prev_version": prev_version,
        "created": created,
        "has_sections": sections is not None,
        "bytes": payload_bytes,
    })
    return response.ok({
        "ok": True,
        "new_version": new_version,
        "created": created,
    })


_MAX_TEST_ARTICLE_BYTES = 60 * 1024  # 기사 원문 상한 — 과금 폭주 방지


def _call_openai(prompt_content: str, article: str) -> str:
    """content(프롬프트 산문) + article(기사 원문) → GPT 산출물 1회 호출.

    facts.json 중간 산출물 없이 기사 원문을 곧바로 프롬프트 뒤에 붙인다 —
    "프롬프트대로 하고 소스를 올려두면 출력이 되도록" 이라는 요청에 맞춘
    가장 단순한 형태(0단계 사실 추출을 별도로 안 거친다). 프롬프트 자체가
    "02_EXTRACT.md의 facts.json을 입력으로 받는다"고 적혀 있어도 모델이
    기사 원문에서 곧바로 사실을 읽어 따라갈 수 있다 — 실제 파이프라인에
    붙일 땐 별도 추출 단계를 앞에 둘 수 있지만, 이 테스트 실행은 프롬프트
    품질을 빠르게 확인하는 용도라 1회 호출로 충분하다.
    """
    api_key = secrets_client.get_secret_json_field(_OPENAI_SECRET_ID, "OPENAI_API_KEY")

    user_content = f"{prompt_content}\n\n[입력 기사]\n{article}"
    body = json.dumps({
        "model": _OPENAI_MODEL,
        "messages": [{"role": "user", "content": user_content}],
        "temperature": 0.7,
        "max_tokens": _OPENAI_MAX_TOKENS,
    }).encode("utf-8")

    req = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=_OPENAI_TIMEOUT_SECONDS) as resp:
            parsed = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")
        logger.warning(f"OpenAI test call failed: {e.code} {detail}")
        raise RuntimeError(f"OpenAI API 오류 ({e.code}): {detail[:300]}")
    return parsed["choices"][0]["message"]["content"]


def handle_test(body: dict, path_params: dict, query_params: dict) -> dict:
    """프롬프트 드로어의 "테스트 실행" — 저장 여부와 무관하게 지금 편집 중인
    content를 기사 원문과 함께 GPT에 넘겨 실제 산출물을 반환한다."""
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

    try:
        output = _call_openai(content, article)
    except Exception as e:
        return response.err(f"테스트 실행 실패: {e}", 502)

    audit.log("prompt-test", {
        "prompt": f"{category}/{name}",
        "article_bytes": len(article.encode("utf-8")),
        "output_bytes": len(output.encode("utf-8")),
    })
    return response.ok({"output": output})
