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

import datetime as dt
import json
import os
import re
import uuid

import boto3
from botocore.config import Config as BotoConfig

from repo import prompts_repo
from shared import audit, ddb_client, response
from json_extract import extract_json_object  # pipelines/common/ — deploy-admin-api.sh가 복사(webtoon_image.py와 같은 패턴)

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
# pipelines/webtoon/pipeline.py 확인). video의 user_template에 "렌더용
# JSON"이 이미 들어있는 건 프로덕션 그대로다 — 별도 JSON 지침을 안 붙인다.
_CATEGORY_BEDROCK = {
    "letters": {
        "model": "arn:aws:bedrock:us-east-1:887078546492:application-inference-profile/iqye2pzreccq",  # lens-letters-opus-5
        "mode": "system",
        "user_template": "다음 기사 원문으로 레터를 만들어주세요.\n\n{article}",
        "max_tokens": 12000,  # pipelines/letters/pipeline.py와 동일 — 비동기라 그대로 맞출 수 있다.
    },
    "podcast": {
        "model": "arn:aws:bedrock:us-east-1:887078546492:application-inference-profile/kmkagk616y1c",  # lens-podcast-sonnet-46
        "mode": "system",
        "user_template": "다음 기사 원문으로 팟캐스트 대본을 만들어주세요.\n\n{article}",
        "max_tokens": 3000,  # pipelines/podcast/pipeline.py — max_tokens 생략(bedrock_client.py 기본값 3000)과 동일.
    },
    "video": {
        "model": "arn:aws:bedrock:us-east-1:887078546492:application-inference-profile/r9n8dvqc1t0r",  # lens-video-sonnet-46
        "mode": "system",
        "user_template": "다음 기사 원문으로 영상 각본 + 렌더용 JSON을 만들어주세요.\n\n{article}",
        "max_tokens": 4000,  # pipelines/video/generate_script.py와 동일.
    },
    "webtoon": {
        "model": "arn:aws:bedrock:us-east-1:887078546492:application-inference-profile/yirjajon82n7",  # lens-webtoon-script-sonnet-46
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
        "max_tokens": 8000,
    },
}
_WEBTOON_SYSTEM_PROMPT = "당신은 뉴스 웹툰 제작자입니다. 지시받은 JSON 스키마를 정확히 지켜 응답합니다."
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
_BEDROCK_READ_TIMEOUT_SECONDS = 90  # Lambda 자체 Timeout을 300초로 늘려둠(자기호출 invocation 전용, API Gateway 동기 경로는 여전히 즉시 응답)

_bedrock_client = None


def _get_bedrock_client():
    global _bedrock_client
    if _bedrock_client is None:
        kwargs = {
            "region_name": "us-east-1",
            "config": BotoConfig(read_timeout=_BEDROCK_READ_TIMEOUT_SECONDS, connect_timeout=5, retries={"max_attempts": 1}),
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
    않고 직접 구현했다(admin/backend는 pipelines/를 import하지 않는다)."""
    client = _get_bedrock_client()
    inference_config = {"maxTokens": max_tokens}
    if temperature is not None:
        inference_config["temperature"] = temperature
    try:
        resp = client.converse(
            modelId=model,
            system=[{"text": system_prompt}],
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
_STORYBOARD_JOB_PK = "PROMPTSTORYBOARDTEST"


def _job_table():
    return ddb_client.config_table()


def _put_job(pk: str, job_id: str, item: dict) -> None:
    _job_table().put_item(Item={"pk": pk, "sk": f"job/{job_id}", **item})


def _update_job(pk: str, job_id: str, updates: dict) -> None:
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
    resp = _job_table().get_item(Key={"pk": pk, "sk": f"job/{job_id}"})
    return resp.get("Item")


def _now_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


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
    elif kind == "storyboard":
        _run_storyboard_job(job_id, payload["content"], payload["article"])


def _run_test_job(job_id: str, category: str, content: str, article: str) -> None:
    try:
        output = _call_bedrock_for_category(category, content, article)
        _update_job(_TEST_JOB_PK, job_id, {"status": "done", "output": output, "updated_at": _now_iso()})
        audit.log("prompt-test-done", {"job_id": job_id, "prompt": category, "output_bytes": len(output.encode("utf-8"))})
    except Exception as e:  # noqa: BLE001 — 비동기 invocation 최상위, 여기서 안 잡으면 job이 영원히 pending으로 남는다
        _update_job(_TEST_JOB_PK, job_id, {"status": "error", "error": str(e)[:500], "updated_at": _now_iso()})


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
    now = _now_iso()
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


# 웹툰 스토리보드 테스트(2026-09-11) — "프롬프트·이미지 실험을 한 화면에서
# 기사 → 8컷 스토리보드 → 컷별 이미지까지 이어서 해보고 싶다"는 사용자
# 요청. handle_test는 1단계(스크립트)만 보여주는데, 실제 파이프라인
# (pipelines/webtoon/pipeline.py::run_article)은 1단계 결과를 다시 프롬프트에
# 실어 2단계(장면 연출)를 별도로 한 번 더 호출한다 — 그 두 호출을 그대로
# 재현해서 컷마다 대사+장면+카메라를 합쳐 반환한다. 이것도 handle_test와
# 같은 이유로 비동기(작업+폴링)다 — 순차 호출 2번이라 부담은 더 크다.
# ─────────────────────────────────────────────────────────────
# 단계별 지침 분리 (2026-09-16) — 지금까지 1·2단계 호출 둘 다 발행된 웹툰
# 프롬프트 전체(105K자, 22개 챕터: "## N. 제목" 형식)를 통째로 시스템
# 프롬프트에 넣고 있었다. 실측(이 리팩토링 착수 전 로컬 테스트 중 발견):
# - 1단계는 사실분석·대사·컷 텍스트만 필요한데 3단계 이미지 스타일(14장,
#   5797자)·발행 규칙(18장)까지 매번 같이 들어갔다.
# - 2단계는 반대로 화자 페르소나·대사 규칙까지 다 필요 없는데 그대로 들어갔다.
# 그래서 챕터 번호 기준으로 필요한 것만 잘라 조립한다 — 새 프롬프트 파일을
# 따로 안 만들고(admin에 다단 파일 편집 UI를 새로 만들 필요 없음), 발행된
# 프롬프트 문서 자체에서 그때그때 챕터를 추출한다. 문서가 수정돼도(챕터
# 번호 체계를 유지하는 한) 자동으로 최신 내용을 반영한다.
#
# ⚠️ 이 작업 중 실제 발행 프롬프트 원본 자체에 결함을 발견했다(고쳐야 할
# 것 — 이번 라운드에서 DDB 원본은 안 건드림, 아래 _extract_chapters가
# 방어적으로 우회): 0~21장이 문서 안에 통째로 두 번 들어있고(뒤쪽 사본이
# 최신 — "챕터당 마지막 등장만 쓴다"로 자동 회피), 맨 끝에 admin 파일
# 편집 UI의 라벨("### 파일 · 새 파일")과 테스트로 보이는 "aaaa" 텍스트가
# 그대로 발행 내용에 섞여 있다("### 파일" 이후를 잘라낸다). 원본 정리는
# 별도로 다룰 것.
_CHAPTER_HEADER_RE = re.compile(r"^##\s*(\d+)\.\s*.+$", re.MULTILINE)
_KNOWN_GARBAGE_MARKERS = ("### 파일 · 새 파일",)  # admin 편집 UI 라벨이 섞여 들어간 흔적


def _extract_chapters(content: str, chapter_numbers: list[int]) -> str:
    """"## N. 제목" 헤더로 구분된 챕터 중 번호가 일치하는 것만 뽑아 순서대로
    이어붙인다. 같은 번호가 여러 번 나오면(발행 프롬프트 실측 결함 참고)
    가장 마지막(=가장 최근에 수정된) 사본만 쓴다. 챕터 헤더 패턴 자체가
    없는 문서(예: 실험용 prompt_override 초안)면 안전하게 원문 그대로
    반환한다 — 이 구조를 전제로 만들어진 문서가 아닐 수 있어서다."""
    matches = list(_CHAPTER_HEADER_RE.finditer(content))
    if not matches:
        return content

    starts = [m.start() for m in matches]
    last_start_by_num: dict[int, int] = {}
    for m in matches:
        last_start_by_num[int(m.group(1))] = m.start()

    parts = []
    for num in chapter_numbers:
        start = last_start_by_num.get(num)
        if start is None:
            continue
        end = next((s for s in starts if s > start), len(content))
        chunk = content[start:end]
        for marker in _KNOWN_GARBAGE_MARKERS:
            idx = chunk.find(marker)
            if idx != -1:
                chunk = chunk[:idx].rstrip()
        parts.append(chunk.strip())
    return "\n\n".join(parts)


# 모든 단계 공통(캐릭터·문체 일관성에 필요) — 0.역할과 최종 산출물,
# 2.절대 규칙, 6.고정 화자 페르소나, 7.기사별 스타일링.
_COMMON_CHAPTERS = [0, 2, 6, 7]
# 1단계 전용 — 사실분석·중복판정·컷 정보설계·대사규칙·텍스트 규칙·
# 8컷 전체 중복검사·1단계 출력 스키마(22장, 발행 프롬프트에 실제로 있음).
_STAGE1_CHAPTERS = _COMMON_CHAPTERS + [1, 3, 4, 5, 8, 9, 10, 11, 15, 22]
# 2단계 전용 — 장면 설계·이미지 텍스트 화이트리스트·공통 이미지 스타일.
# (발행 프롬프트에 2단계용 정식 출력 스키마 챕터가 아직 없다 — 그래서
# 1단계 22장과 같은 엄격도로 아래 _STAGE2_OUTPUT_FORMAT을 코드 쪽에서
# 보강한다. 나중에 프롬프트 쪽에 정식 챕터가 생기면 이 상수는 지운다.)
_STAGE2_CHAPTERS = _COMMON_CHAPTERS + [12, 13, 14]

_STAGE2_OUTPUT_FORMAT = (
    "\n\n---\n### 2단계 출력 형식 (코드 보강 — 발행 프롬프트에 아직 정식"
    " 챕터가 없어 여기서 고정한다)\n"
    "다른 설명 없이 JSON 객체 하나만 응답한다:\n"
    '{"scenes": [{"cut_id": "cut_01", "camera_distance": "", '
    '"camera_height": "", "composition": "", "background": ""}]}\n'
    "- cut_id는 1단계 결과와 정확히 같은 값(cut_01~cut_08)을 그대로 쓴다.\n"
    "- 8개 컷 전부 채운다. 누락·추가 금지.\n"
    "- camera_distance/camera_height/composition/background 네 필드 모두"
    " 채운다 — 비워두지 않는다."
)

# 항상 human-in-the-loop — 2026-09-16, 사용자 요청: "항상 휴먼 인 더 루프로
# 작업하도록"(별도 상태 관리 UI 없이 프롬프트 지침만으로 강제). 이 단계
# 응답을 낸 뒤 모델이 스스로 다음 단계로 이어가지 않도록 매 호출 끝에
# 못박는다 — 실제 다음 단계 진행은 여전히 화면의 "2단계로 진행" 버튼이나
# "N번 컷"/"전체 컷" 같은 명시적 요청으로만 트리거된다(routes/chat_ws.py·
# PromptChatLab.tsx 참고, 이 리팩토링에서 그 트리거 자체는 안 건드림).
_HITL_REMINDER = (
    "\n\n---\n[중요] 이 단계 결과만 내고 멈춘다. 다음 단계를 이어서 만들거나"
    " 미리 보여주지 않는다. 사용자가 명시적으로 다음 단계를 요청하기 전까지는"
    " 기다린다."
)

_STEP1_INSTRUCTION = (
    "\n\n---\n[지금 할 일]\n위 지침을 참고해서 지금은 1단계(스크립트) 결과만"
    " 출력한다. \"1단계 출력\" 섹션에 정의된 JSON 스키마 그대로, JSON 객체"
    " 하나만 응답한다(설명 문구 없이).\n\n[입력 기사]\n"
)
_STEP2_INSTRUCTION = (
    "\n\n---\n[지금 할 일]\n위 지침을 참고해서 지금은 2단계(장면 연출) 결과만"
    " 출력한다. \"2단계 출력\" 섹션에 정의된 JSON 스키마 그대로, JSON 객체"
    " 하나만 응답한다(설명 문구 없이).\n\n[기사]\n"
)


def _build_step1_call(content: str, article: str) -> tuple[str, str, str, int]:
    """1단계 호출에 필요한 (system, user_message, model, max_tokens)만
    조립하고 Bedrock은 안 부른다 — 2026-09-16, 사용자 요청: "출력도 단계별로
    쪼개서 보여줘야 한다"에 맞춰 routes/chat_ws.py가 이 조립 결과로 직접
    converse_stream을 불러 실시간으로 청크를 밀어보낼 수 있게 분리했다
    (_generate_step1_script은 이 함수 + 논스트리밍 _call_bedrock을 그대로
    쓰는 얇은 래퍼로 남겨 handle_test/handle_storyboard_test 같은 기존
    HTTP job/폴링 호출부는 안 건드린다)."""
    webtoon_cfg = _CATEGORY_BEDROCK["webtoon"]
    stage_content = _extract_chapters(content, _STAGE1_CHAPTERS)
    user_message = stage_content + _STEP1_INSTRUCTION + article + _WEBTOON_JSON_INSTRUCTION + _HITL_REMINDER
    return _WEBTOON_SYSTEM_PROMPT, user_message, webtoon_cfg["model"], webtoon_cfg["max_tokens"]


def _build_step2_call(content: str, article: str, script: dict) -> tuple[str, str, str, int]:
    """2단계용 — _build_step1_call과 같은 이유·같은 모양."""
    webtoon_cfg = _CATEGORY_BEDROCK["webtoon"]
    stage_content = _extract_chapters(content, _STAGE2_CHAPTERS)
    user_message = (
        stage_content
        + _STEP2_INSTRUCTION
        + article
        + "\n\n[1단계 스크립트 결과]\n"
        + json.dumps(script, ensure_ascii=False)
        + _STAGE2_OUTPUT_FORMAT
        + _HITL_REMINDER
    )
    return _WEBTOON_SYSTEM_PROMPT, user_message, webtoon_cfg["model"], webtoon_cfg["max_tokens"]


def _generate_step1_script(content: str, article: str) -> dict:
    """1단계(스크립트)만 호출(논스트리밍) — handle_test/handle_storyboard_test
    같은 HTTP job/폴링 호출부 전용. routes/chat_ws.py의 웹소켓 채팅은
    2026-09-16부터 _build_step1_call + 자체 스트리밍 호출을 쓴다(실시간
    청크 중계, 아래 _generate_storyboard·chat_ws.py::_stream_json_completion
    참고)."""
    system, user_message, model, max_tokens = _build_step1_call(content, article)
    try:
        script_raw = _call_bedrock(model, system, user_message, max_tokens=max_tokens, temperature=0.7)
        return extract_json_object(script_raw)
    except Exception as e:
        raise RuntimeError(f"1단계(스크립트) 생성 실패: {e}") from e


def _generate_step2_scenes(content: str, article: str, script: dict) -> dict:
    """2단계(장면 연출)만 호출(논스트리밍) — 위 _generate_step1_script와
    같은 이유로 HTTP job/폴링 호출부 전용으로 남긴다."""
    system, user_message, model, max_tokens = _build_step2_call(content, article, script)
    try:
        scene_raw = _call_bedrock(model, system, user_message, max_tokens=max_tokens, temperature=0.7)
        return extract_json_object(scene_raw)
    except Exception as e:
        raise RuntimeError(f"2단계(장면 연출) 생성 실패: {e}") from e


def _generate_storyboard(content: str, article: str) -> tuple[dict, dict]:
    """1단계+2단계를 곧바로 이어 부른다(확인 없이) — 원시 script/scenes
    dict 반환(합치기는 _merge_storyboard_cuts()가 따로 함). _run_storyboard_job
    (HTTP job/폴링, 기존 WebtoonStoryboardLab.tsx가 쓰던 경로)이 이 함수를
    쓴다 — 웹소켓 채팅(routes/chat_ws.py)은 확인 단계를 넣으려고
    _generate_step1_script/_generate_step2_scenes를 직접 따로 부른다."""
    script = _generate_step1_script(content, article)
    scenes = _generate_step2_scenes(content, article, script)
    return script, scenes


def _cut_number(d: dict) -> int | None:
    """v11 스키마는 컷 번호를 정수 "cut" 대신 문자열 "cut_id"("cut_01")로
    준다 — 둘 다 받는다(2026-09-15, 아래 _merge_storyboard_cuts 주석 참고)."""
    n = d.get("cut")
    if isinstance(n, int):
        return n
    cut_id = d.get("cut_id") or d.get("id")
    if isinstance(cut_id, str):
        digits = "".join(ch for ch in cut_id if ch.isdigit())
        if digits:
            return int(digits)
    return None


def _first_nonempty(*values: object) -> str:
    for v in values:
        if isinstance(v, str) and v.strip():
            return v
    return ""


def _dialogue_from_bubbles(c: dict) -> list[dict]:
    """v11 스키마는 "dialogue" 배열 대신 bubble_1/bubble_2(각각
    {"speaker":"female"|"male","text":...})로 준다 — 구도 없이 만들어진
    옛 dialogue 스키마와 나란히 지원."""
    if c.get("dialogue"):
        return c["dialogue"]
    lines = []
    for key in ("bubble_1", "bubble_2"):
        b = c.get(key)
        if isinstance(b, dict) and b.get("text"):
            speaker = "A" if b.get("speaker") == "female" else "B" if b.get("speaker") == "male" else key
            lines.append({"speaker": speaker, "line": b["text"]})
    return lines


def _merge_storyboard_cuts(script: dict, scenes: dict) -> list[dict]:
    """1단계(script)+2단계(scenes) 결과를 컷별로 합친다.

    2026-09-15 — 저장된 웹툰 프롬프트가 v11에서 컷 번호(cut→cut_id)·대사
    (dialogue→bubble_1/bubble_2)·2단계 최상위 키(scenes→cuts)·장면 묘사
    (camera/scene→camera_distance+camera_height/composition+background)를
    전부 새 스키마로 바꿨다(사용자 확인: 진행 중인 개편, 되돌릴 생각
    없음). compose_text.py·컷 이미지 생성은 여전히 옛 필드 이름(camera/
    scene/dialogue/title/narration/caption)을 기대하므로, 있으면 그대로
    쓰고 없으면 새 필드에서 최대한 끌어와 채운다 — 스키마가 아직도 바뀌는
    중이라 한쪽에 단단히 맞추기보다 방어적으로 짠다."""
    scene_list = scenes.get("scenes") or scenes.get("cuts") or []
    scene_by_cut = {n: s for s in scene_list if (n := _cut_number(s)) is not None}

    cuts = []
    for c in script.get("cuts") or []:
        n = _cut_number(c)
        s = scene_by_cut.get(n) or {}
        camera = _first_nonempty(s.get("camera"), " ".join(filter(None, [s.get("camera_distance"), s.get("camera_height")])))
        scene = _first_nonempty(s.get("scene"), " ".join(filter(None, [s.get("composition"), s.get("background")])))
        cuts.append({
            "cut": n,
            "narration": _first_nonempty(c.get("narration"), c.get("new_conclusion")),
            "caption": _first_nonempty(c.get("caption"), c.get("keyword")),
            "closing_caption": c.get("closing_caption") or "",
            "title": _first_nonempty(c.get("title"), c.get("headline")),
            "title_keyword": c.get("title_keyword") or "",
            "dialogue": _dialogue_from_bubbles(c),
            "camera": camera,
            "scene": scene,
        })
    return cuts


def _run_storyboard_job(job_id: str, content: str, article: str) -> None:
    try:
        script, scenes = _generate_storyboard(content, article)
    except Exception as e:
        _update_job(_STORYBOARD_JOB_PK, job_id, {
            "status": "error", "error": str(e)[:500], "updated_at": _now_iso(),
        })
        return

    cuts = _merge_storyboard_cuts(script, scenes)
    _update_job(_STORYBOARD_JOB_PK, job_id, {
        "status": "done",
        "core_question": script.get("core_question"),
        "characters": script.get("characters"),
        "cuts": cuts,
        "updated_at": _now_iso(),
    })
    audit.log("prompt-storyboard-test-done", {"job_id": job_id, "cuts": len(cuts)})


def handle_storyboard_test(body: dict, path_params: dict, query_params: dict) -> dict:
    """웹툰 프롬프트 드로어의 "스토리보드 테스트" — 저장 여부 무관, 지금
    편집 중인 content로 1단계(스크립트)+2단계(장면 연출)를 프로덕션과 같은
    순서로 체인 호출해 컷별로 합쳐 반환한다. 1·2단계 지침이 웹툰 8컷
    스키마 전용이라 category가 webtoon이 아니면 애초에 의미가 없다."""
    category = (path_params or {}).get("category", "")
    name = (path_params or {}).get("name", "")
    if not category or not name:
        return response.err("category and name required", 400)
    if category != "webtoon":
        return response.err("스토리보드 테스트는 webtoon 채널 전용입니다", 400)

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

    job_id = uuid.uuid4().hex[:16]
    now = _now_iso()
    _put_job(_STORYBOARD_JOB_PK, job_id, {"status": "pending", "created_at": now, "updated_at": now})
    _self_invoke_async({"kind": "storyboard", "job_id": job_id, "content": content, "article": article})

    audit.log("prompt-storyboard-test-start", {
        "prompt": f"{category}/{name}",
        "job_id": job_id,
        "article_bytes": len(article.encode("utf-8")),
    })
    return response.ok({"job_id": job_id, "status": "pending"})


def handle_storyboard_test_status(body: dict, path_params: dict, query_params: dict) -> dict:
    job_id = (path_params or {}).get("job_id", "")
    if not job_id:
        return response.err("job_id required", 400)
    item = _get_job(_STORYBOARD_JOB_PK, job_id)
    if not item:
        return response.err("job not found", 404)
    return response.ok({
        "job_id": job_id,
        "status": item.get("status"),
        "core_question": item.get("core_question"),
        "characters": item.get("characters"),
        "cuts": item.get("cuts"),
        "error": item.get("error"),
    })
