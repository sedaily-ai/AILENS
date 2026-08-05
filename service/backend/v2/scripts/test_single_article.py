#!/usr/bin/env python3
"""단일 기사 기반 Before/After 비교 테스트.

특정 기사를 핵심으로, 참고 기사 2~3개를 함께 넣어서
SF 한 명의 letter만 생성. Narrative Planner on/off 비교 용도.

사용:
    cd service/backend

    # Baseline (400자, planner OFF)
    AWS_PROFILE=ai_nova NARRATIVE_PLANNER_ENABLED=false \
      python3 v2/scripts/test_single_article.py > baseline_single.json 2>base_log.txt

    # Improved (2000자, planner ON)
    AWS_PROFILE=ai_nova NARRATIVE_PLANNER_ENABLED=true SNIPPET_CHARS=2000 \
      python3 v2/scripts/test_single_article.py > improved_single.json 2>imp_log.txt
"""
from pathlib import Path
import sys

THIS = Path(__file__).resolve()
BACKEND = THIS.parents[2]
sys.path.insert(0, str(BACKEND))

import asyncio
import json
import os

from clients.s3_xml_client import S3XMLClient
from v2.core25.editor_pick_service import (
    invoke_letter_orchestrator,
    shape_candidate_for_orchestrator,
)
from v2.core25.narrative_planner import plan_narratives, is_enabled as planner_enabled


# SK하이닉스 기사 제목 키워드 (핵심 기사)
TARGET_KEYWORD = "하이닉스"
# 참고 기사 보조 키워드 (같은 날 관련 기사)
SUPPORT_KEYWORDS = ["삼성전자", "크래프톤", "파업"]

TARGET_DATE = "20260514"
MAX_SUPPORT = 3  # 핵심 1 + 보조 3 = 총 4기사


def _filter_economy(articles):
    CATEGORIES = {"경제", "금융", "증권", "부동산", "산업", "IT·과학"}
    blacklist = ("[부고]", "[인사]", "[속보]", "[포토]")
    out = []
    for a in articles:
        if a.action != "I":
            continue
        if len(a.content_clean or "") < 200:
            continue
        if any(a.title.startswith(p) for p in blacklist):
            continue
        if (a.main_category or "") not in CATEGORIES:
            continue
        out.append(a)
    return out


def _to_candidate(article) -> dict:
    return {
        "article_id": article.nsid,
        "title": article.title,
        "subtitle": article.sub_title or "",
        "category": article.main_category or "",
        "themes": [],
        "press": article.press or "서울경제",
        "byline": article.author_name or "",
        "snippet": (article.content_clean or "")[:3000],
        "transformed_versions": {},
    }


async def main():
    letter_date = f"{TARGET_DATE[:4]}-{TARGET_DATE[4:6]}-{TARGET_DATE[6:8]}"

    print(f"[1] S3 XML 가져오기 — daily-xml/{TARGET_DATE}.xml", file=sys.stderr)
    client = S3XMLClient()
    articles = await client.get_articles_by_date(TARGET_DATE)
    print(f"    parsed {len(articles)} articles", file=sys.stderr)

    cleaned = _filter_economy(articles)
    print(f"[2] 경제 기사 {len(cleaned)} 건", file=sys.stderr)

    # 핵심 기사 찾기
    target = None
    for a in cleaned:
        if TARGET_KEYWORD in a.title:
            target = a
            break

    if not target:
        print(f"ERROR: '{TARGET_KEYWORD}' 포함 기사 없음", file=sys.stderr)
        sys.exit(1)

    print(f"[3] 핵심 기사: {target.title}", file=sys.stderr)

    # 보조 기사 찾기
    supports = []
    for a in cleaned:
        if a.nsid == target.nsid:
            continue
        if any(kw in a.title for kw in SUPPORT_KEYWORDS):
            supports.append(a)
            if len(supports) >= MAX_SUPPORT:
                break

    selected = [target] + supports
    print(f"[4] 총 {len(selected)} 기사 선정:", file=sys.stderr)
    for i, a in enumerate(selected):
        print(f"    [{i+1}] {a.title[:60]}", file=sys.stderr)

    raw_candidates = [_to_candidate(a) for a in selected]
    shaped = [shape_candidate_for_orchestrator(c) for c in raw_candidates]

    # Narrative Planner
    narrative_frames = None
    if planner_enabled():
        print(f"[5] Narrative Planner ON", file=sys.stderr)
        narrative_frames = plan_narratives(shaped, letter_date)
        if narrative_frames:
            frames = narrative_frames.get("frames", [])
            print(f"    frames: {len(frames)}", file=sys.stderr)
            for fr in frames:
                print(f"      [{fr.get('editor_id')}] {fr.get('landscape')}", file=sys.stderr)
        else:
            print(f"    planner returned None", file=sys.stderr)
    else:
        print(f"[5] Narrative Planner OFF", file=sys.stderr)

    # Generation
    print(f"[6] Bedrock invoke (letter_date={letter_date})", file=sys.stderr)
    result = invoke_letter_orchestrator(
        shaped, letter_date, narrative_hints=narrative_frames
    )

    usage = result.get("_usage", {})
    print(
        f"[7] 완료 — letters={len(result.get('letters', []))} "
        f"in={usage.get('input_tokens')} out={usage.get('output_tokens')} "
        f"elapsed={result.get('_elapsed_s')}s",
        file=sys.stderr,
    )

    # SF letter만 추출
    sf_letter = None
    for ltr in result.get("letters", []):
        if ltr.get("mbti_group") == "SF":
            sf_letter = ltr
            break

    output = {
        "letter_date": letter_date,
        "target_article": target.title,
        "candidates_count": len(selected),
        "planner_enabled": planner_enabled(),
        "snippet_chars": int(os.getenv("SNIPPET_CHARS", "400")),
        "sf_letter": sf_letter,
        "_usage": usage,
        "_elapsed_s": result.get("_elapsed_s"),
    }

    print(json.dumps(output, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
