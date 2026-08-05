"""Narrative Planner — 4 기사 풍경 도출을 위한 pre-generation step.

v3 프롬프트의 핵심 차별점인 "4기사 → 1풍경 직조"를 runtime에 이식하기 위한
planning 단계. Haiku 1회 호출로 각 persona별 narrative frame을 도출한다.

기존 editor_pick_service.py의 run_editor_pick() 안에서 선택적으로 호출됨:
  candidates → plan_narratives() → invoke_letter_orchestrator(narrative_hints=...)

feature flag: NARRATIVE_PLANNER_ENABLED (env var, default="false")
비활성 시 기존 흐름 그대로 유지 (backward compatible).

비용: Haiku 1회 (~3K input + ~1K output) = ~$0.004/일 = $0.12/월.
Latency: +10~15s (Sonnet 120s 대비 미미).
"""
from __future__ import annotations

import json
import logging
import os
import time
from typing import Any, Dict, List, Optional

import boto3
from botocore.config import Config


logger = logging.getLogger(__name__)

_DEFAULT_PLANNER_MODEL_ID = "us.anthropic.claude-haiku-4-5-20251001-v1:0"


def _get_planner_model_id() -> str:
    return os.getenv("NARRATIVE_PLANNER_MODEL_ID", _DEFAULT_PLANNER_MODEL_ID)

_BEDROCK_CONFIG = Config(
    region_name="us-east-1",
    retries={"max_attempts": 2, "mode": "adaptive"},
    read_timeout=60,
    connect_timeout=10,
)

_PLANNER_SYSTEM = """너는 AI LENS 뉴스레터의 편집 기획자다.
4명의 에디터(NT 민철 / NF 하은 / ST 준서 / SF 소율)가 오늘 기사 풀에서 각각 하나의 "풍경"을 직조해야 한다.

풍경이란: 여러 기사를 관통하는 단일 주제 흐름. 개별 기사 요약이 아니라, 기사들이 합쳐졌을 때 보이는 하나의 장면.

네 역할:
1. 후보 기사 풀을 읽는다.
2. 각 에디터가 어떤 4기사를 묶으면 하나의 풍경이 되는지 판단한다.
3. 각 에디터별로 narrative_frame을 출력한다.

각 에디터의 렌즈:
- NT 민철: 구조·메커니즘·시나리오. "어떻게 작동하는가"
- NF 하은: 의미·가치·사회적 맥락. "사회에 어떤 의미인가"
- ST 준서: 숫자·일정·체크리스트. "내 돈에 무슨 일이 생기나"
- SF 소율: 사람·생활·일상 장면. "한 사람의 하루가 어떻게 바뀌나"

진입 패턴 4종 (각 에디터가 1개 선택):
- 대조: 같은 영역에서 두 가지가 동시에 일어남
- 가림: 큰 뉴스 옆에 묻힌 더 중요한 것
- 균열: 한 사건이 던지는 표면 너머의 질문
- 어제연결: 어제 사건과 오늘 사건이 같은 이야기

출력: JSON만. 다른 텍스트 금지.
{
  "frames": [
    {
      "editor_id": "NT-min",
      "landscape": "풍경 1줄 (30자 이내)",
      "entry_pattern": "대조|가림|균열|어제연결",
      "article_ids": ["id1", "id2", "id3", "id4"],
      "reasoning": "왜 이 4기사가 하나의 풍경이 되는지 1줄"
    },
    ... (4명분)
  ]
}

규칙:
- 각 에디터는 반드시 4기사를 선택.
- 같은 에디터 내 article_id 중복 금지.
- 4명이 서로 다른 풍경이어야 함 (landscape 겹침 금지).
- article_id는 반드시 입력 후보 풀에 존재하는 것만 사용.
- 후보 풀에 4기사 클러스터가 안 나오는 에디터는 가장 가까운 3기사 + 1기사로 구성."""


def is_enabled() -> bool:
    return os.getenv("NARRATIVE_PLANNER_ENABLED", "false").lower() == "true"


def plan_narratives(
    candidates: List[Dict[str, Any]],
    letter_date: str,
    *,
    bedrock_client: Optional[Any] = None,
) -> Optional[Dict[str, Any]]:
    """Haiku 1회 호출로 4 persona별 narrative frame 도출.

    Returns:
        {
          "frames": [...],
          "_usage": {"input_tokens": int, "output_tokens": int},
          "_elapsed_s": float,
        }
        또는 실패/비활성 시 None.
    """
    if not is_enabled():
        return None

    if not candidates:
        return None

    if bedrock_client is None:
        endpoint_url = os.getenv("BEDROCK_RUNTIME_ENDPOINT_URL")
        if endpoint_url:
            bedrock_client = boto3.client(
                "bedrock-runtime", config=_BEDROCK_CONFIG, endpoint_url=endpoint_url
            )
        else:
            bedrock_client = boto3.client("bedrock-runtime", config=_BEDROCK_CONFIG)

    candidate_summary = []
    for c in candidates:
        candidate_summary.append({
            "article_id": c["article_id"],
            "title": c.get("title", ""),
            "category": c.get("category", ""),
            "snippet": (c.get("snippet") or "")[:200],
        })

    user_payload = json.dumps(
        {"letter_date": letter_date, "candidates": candidate_summary},
        ensure_ascii=False,
    )

    body = {
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 2000,
        "system": [
            {"type": "text", "text": _PLANNER_SYSTEM, "cache_control": {"type": "ephemeral"}},
        ],
        "messages": [{"role": "user", "content": [{"type": "text", "text": user_payload}]}],
    }

    t0 = time.monotonic()
    try:
        response = bedrock_client.invoke_model(
            modelId=_get_planner_model_id(),
            body=json.dumps(body),
            contentType="application/json",
            accept="application/json",
        )
        elapsed_s = round(time.monotonic() - t0, 2)
        raw = response["body"].read()
        payload = json.loads(raw)
        text = "".join(b.get("text", "") for b in payload.get("content", []))
        usage = payload.get("usage", {})

        cleaned = text.strip()
        if cleaned.startswith("```"):
            lines = cleaned.splitlines()
            cleaned = "\n".join(lines[1:])
            if cleaned.rstrip().endswith("```"):
                cleaned = cleaned.rstrip()[:-3].rstrip()

        parsed = json.loads(cleaned)
        parsed["_usage"] = usage
        parsed["_elapsed_s"] = elapsed_s

        logger.info(json.dumps({
            "event": "narrative_planner_complete",
            "letter_date": letter_date,
            "candidates_count": len(candidates),
            "frames_count": len(parsed.get("frames", [])),
            "elapsed_s": elapsed_s,
            "input_tokens": usage.get("input_tokens", 0),
            "output_tokens": usage.get("output_tokens", 0),
        }))

        return parsed

    except Exception as exc:
        elapsed_s = round(time.monotonic() - t0, 2)
        logger.warning(json.dumps({
            "event": "narrative_planner_failed",
            "letter_date": letter_date,
            "error": str(exc)[:200],
            "elapsed_s": elapsed_s,
        }))
        return None
