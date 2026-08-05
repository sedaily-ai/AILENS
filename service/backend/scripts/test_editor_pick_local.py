#!/usr/bin/env python3
"""Editor Pick 로컬 테스트 — DB·Lambda 건너뛰고 결과부터 본다.

흐름:
    1. S3 daily-xml/{YYYYMMDD}.xml 가져옴
    2. action='I' + 본문 200자+ + 단신 제외 필터
    3. 앞에서 N건 candidate 으로 shape (transformed_versions 는 비워둠)
    4. Bedrock Haiku 4.5 invoke → 4 letter JSON

사용:
    python3 backend/v2/scripts/test_editor_pick_local.py            # 오늘 KST
    python3 backend/v2/scripts/test_editor_pick_local.py 20260514   # 특정 날짜
    N_CANDIDATES=12 python3 backend/v2/scripts/test_editor_pick_local.py
"""
from pathlib import Path
import sys

# backend 루트를 sys.path 에 추가 (다른 import 보다 먼저 해야 함)
THIS = Path(__file__).resolve()
BACKEND = THIS.parents[2]  # backend/
sys.path.insert(0, str(BACKEND))

import asyncio
import json
import os
from datetime import datetime, timezone, timedelta

from clients.s3_xml_client import S3XMLClient  # noqa: E402
from core25.editor_pick_service import (  # noqa: E402
    invoke_letter_orchestrator,
    shape_candidate_for_orchestrator,
)


_KST = timezone(timedelta(hours=9))


def _today_kst_yyyymmdd() -> str:
    return datetime.now(_KST).strftime("%Y%m%d")


# 경제·산업 트랙 화이트리스트.
# AI LENS 4 에디터는 모두 "경제 안의 4 시각"으로 운영 — 연예/사건/정치/스포츠 제외.
# 후보 풀에 들어올 main_category (XML 첫 콤마 앞 부분 기준).
ECONOMY_TRACK_CATEGORIES = frozenset({
    "경제",       # 경제동향, 물가, 수출입, 고용 등
    "금융",       # 금융정책, 은행, 보험, 카드
    "증권",       # 국내·해외 증시, 종목, 재테크
    "부동산",     # 정책, 건설, 분양
    "산업",       # 기업, 중기·벤처, 유통, IT일반, 반도체, 통신, 가전, 과학
    "IT·과학",   # 최근 포맷 (산업과 별도로 분리됨)
})


def _filter_real_articles(articles):
    """경제 트랙 화이트리스트 + 단신·홍보 노이즈 제거."""
    blacklist_prefix = ("[부고]", "[인사]", "[속보]", "[포토]")
    cleaned = []
    for a in articles:
        if a.action != "I":  # 새 기사만 (Update / Delete 제외)
            continue
        body = a.content_clean or ""
        if len(body) < 200:
            continue
        if any(a.title.startswith(p) for p in blacklist_prefix):
            continue
        # 경제·산업 카테고리만 통과 — 연예/정치/사회/스포츠/선거/피플 제외
        if (a.main_category or "") not in ECONOMY_TRACK_CATEGORIES:
            continue
        cleaned.append(a)
    return cleaned


def _to_candidate(article) -> dict:
    """S3Article → editor_pick candidate dict (shape_candidate_for_orchestrator 입력 포맷)."""
    return {
        "article_id": article.nsid,
        "title": article.title,
        "subtitle": article.sub_title or "",
        "category": article.main_category or "",
        "themes": [],
        "press": article.press or "서울경제",
        "byline": article.author_name or "",
        # shape_candidate_for_orchestrator 가 400자로 다시 자르지만 여유 있게 넘김
        "snippet": (article.content_clean or "")[:1500],
        # 비어있음 — orchestrator 가 snippet 만 보고 letter 톤으로 작성
        "transformed_versions": {},
    }


async def amain():
    target_date = sys.argv[1] if len(sys.argv) > 1 else _today_kst_yyyymmdd()
    letter_date = f"{target_date[:4]}-{target_date[4:6]}-{target_date[6:8]}"
    n_candidates = int(os.getenv("N_CANDIDATES", "8"))

    print(f"[1] S3 XML 가져오기 — daily-xml/{target_date}.xml", file=sys.stderr)
    client = S3XMLClient()
    articles = await client.get_articles_by_date(target_date)
    print(f"    parsed {len(articles)} articles", file=sys.stderr)

    print(f"[2] 노이즈 필터링 (Insert + 본문 200자+ + 단신 제외)", file=sys.stderr)
    cleaned = _filter_real_articles(articles)
    print(f"    {len(cleaned)} articles passed filter", file=sys.stderr)

    selected = cleaned[:n_candidates]
    print(f"[3] candidate {len(selected)} 건 shape", file=sys.stderr)
    raw_candidates = [_to_candidate(a) for a in selected]
    shaped = [shape_candidate_for_orchestrator(c) for c in raw_candidates]

    # 후보 미리보기 (어떤 기사가 orchestrator 에게 들어가는지)
    for i, c in enumerate(raw_candidates):
        title = c["title"][:60]
        cat = (c["category"] or "")[:10]
        print(f"    [{i+1:>2}] {cat:10s} | {title}", file=sys.stderr)

    # Narrative Planner (feature flag 기반)
    from core25.narrative_planner import plan_narratives, is_enabled as planner_enabled
    narrative_frames = None
    if planner_enabled():
        print(f"[3.5] Narrative Planner ON — invoking...", file=sys.stderr)
        narrative_frames = plan_narratives(shaped, letter_date)
        if narrative_frames:
            print(f"      frames: {len(narrative_frames.get('frames', []))} "
                  f"elapsed={narrative_frames.get('_elapsed_s')}s", file=sys.stderr)
        else:
            print(f"      planner returned None (failed or empty)", file=sys.stderr)
    else:
        print(f"[3.5] Narrative Planner OFF (NARRATIVE_PLANNER_ENABLED != 'true')", file=sys.stderr)

    print(f"[4] Bedrock Sonnet invoke (letter_date={letter_date})", file=sys.stderr)
    result = invoke_letter_orchestrator(shaped, letter_date, narrative_hints=narrative_frames)

    usage = result.get("_usage", {})
    elapsed = result.get("_elapsed_s")
    print(
        f"[5] 결과 ↓ letters={len(result.get('letters', []))} "
        f"mode={result.get('mode')} elapsed={elapsed}s "
        f"in={usage.get('input_tokens')} out={usage.get('output_tokens')} "
        f"cache_read={usage.get('cache_read_input_tokens', 0)}",
        file=sys.stderr,
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    asyncio.run(amain())
