"""모아쓰기 레터 자동 발행 — EventBridge 가 하루 한 번 깨우는 Fargate 태스크의 진입점. 설계: docs/product/모아쓰기레터/자동발행_설계.md

흐름: 기사 수집 → 이슈 묶기(모델) → 묶음 검증(core) → 보관 기사 저장 → 초안 생성(모델) → 서버 저장·검증(최대 2회 수정 재생성)
      → 사실 대조(core: 수치, 묶음 밖 링크) → 에디터 지정(core) → 검수 요청 → 발행(서버가 구독자 발송까지 연결).
어느 단계든 막히면 발행하지 않고 사유를 남긴다. ISSUELETTER_AUTO=1 일 때만 발행하고, 아니면 초안 저장 후 멈춘다(드라이런).
"""
from __future__ import annotations

import json
import os
import sys
import traceback
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

KST = timezone(timedelta(hours=9))
_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(_ROOT / "common"))
sys.path.insert(0, str(Path(__file__).parent))

import core  # noqa: E402

ATTEMPTS_PER_CLUSTER = 2  # 묶음당 시도 횟수(비용 상한: 2묶음 × 2회)
MAX_CLUSTERS_TRIED = 2
LETTERS_PROFILE = os.environ.get("ISSUELETTER_MODEL", "arn:aws:bedrock:us-east-1:887078546492:application-inference-profile/nrr81xvevv5k")  # lens-letters-sonnet-46 (비용 절감: 소넷 사용, 2026-10-11)
MAX_PER_DAY = int(os.environ.get("ISSUELETTER_MAX_PER_DAY", "1"))
LOOKBACK_DAYS = int(os.environ.get("ISSUELETTER_LOOKBACK_DAYS", "3"))
WINDOW = (6, 18)  # 이 시각(KST) 사이에만 발행한다
API = os.environ.get("LENS_CMS_API_URL", "http://13.223.179.151")
PROMPT_TEMPLATE = Path(__file__).with_name("draft_prompt.txt")


def log(step: str, **kw: Any) -> None:
    print(json.dumps({"step": step, "at": datetime.now(KST).isoformat(timespec="seconds"), **kw}, ensure_ascii=False), flush=True)


# ── 외부 호출(테스트에서 바꿔 끼운다) ──────────────────────────────────────────────

def _token() -> str:
    import boto3
    return boto3.client("ssm", region_name="us-east-1").get_parameter(Name="/sedaily-mbti/admin/lens-cms-api-token", WithDecryption=True)["Parameter"]["Value"]


def api(method: str, path: str, body: Optional[dict] = None, public: bool = False) -> tuple[int, dict]:
    import requests
    headers = {"Content-Type": "application/json"}
    if not public:
        headers["X-Internal-Token"] = _token()
    r = requests.request(method, f"{API}{path}", json=body, headers=headers, timeout=(5, 60))
    try:
        return r.status_code, r.json()
    except ValueError:
        return r.status_code, {"detail": r.text[:300]}


def call_model(system: str, user: str, max_tokens: int = 8000) -> str:
    import bedrock_client
    return bedrock_client.call_text(system, user, model=LETTERS_PROFILE, max_tokens=max_tokens)


def fetch_recent_articles() -> List[Dict[str, Any]]:
    import discovery_loader
    return discovery_loader.fetch_recent(LOOKBACK_DAYS)


# ── 단계 ────────────────────────────────────────────────────────────────────────

def pick_clusters(articles: List[Dict[str, Any]], used_keys: List[str]) -> List[Dict[str, Any]]:
    by_key = {a["key"]: a for a in articles if a.get("key")}
    listing = "\n".join(f"{a['key']} | {a['title']}" for a in articles if a.get("key"))[:60000]
    system = (Path(__file__).with_name("cluster_prompt.md")).read_text(encoding="utf-8")
    raw_text = call_model(system, "기사 목록:\n" + listing, max_tokens=4000)
    from json_extract import extract_fenced_json_text, loads_lenient
    body = extract_fenced_json_text(raw_text, opener="[") or raw_text[raw_text.find("["): raw_text.rfind("]") + 1]
    try:
        raw = loads_lenient(body)
    except Exception:  # noqa: BLE001
        log("cluster_parse_failed", head=raw_text[:200])
        return []
    clusters = core.clean_clusters(raw, by_key, used_keys)
    clusters.sort(key=core.source_advice_score)  # 권유 표현이 적은 기사 묶음부터(같으면 기존 크기순 유지)
    log("clusters", raw=len(raw) if isinstance(raw, list) else 0, kept=len(clusters), topics=[c["topic"] for c in clusters])
    return clusters


def build_prompt(cluster: Dict[str, Any], editors: List[Dict[str, Any]], topics_text: str) -> str:
    tpl = PROMPT_TEMPLATE.read_text(encoding="utf-8")
    cand = "\n".join(f"- {a['title']} | {core.sedaily_url(a['key'])}" for a in cluster["articles"])
    bodies = "\n\n".join(f"[기사 {a['key']}] {a['title']}\n{(a.get('content') or '')[:3500]}" for a in cluster["articles"])
    eds = "\n".join(f"- {e['slug']}: {e['name']}, {e['role']}, 담당 분야: {'·'.join(e.get('topic_names') or [])}" for e in editors)
    return tpl.replace("{{TOPIC}}", cluster["topic"]).replace("{{CANDIDATES}}", cand).replace("{{BODIES}}", bodies).replace("{{EDITORS}}", eds).replace("{{SLUG_DATE}}", datetime.now(KST).strftime("%Y-%m-%d"))


def make_draft(prompt: str, feedback: str = "") -> Optional[Dict[str, Any]]:
    from json_extract import extract_json_object
    text = call_model(prompt + (f"\n\n[직전 시도가 거부된 사유 — 이것만 고쳐서 JSON 전체를 다시 출력]\n{feedback}" if feedback else ""), "위 지시대로 저장용 JSON 하나만 출력하세요.")
    try:
        obj = extract_json_object(text)
    except Exception:  # noqa: BLE001
        return None
    return obj if isinstance(obj, dict) else None


FACT_CHECK_SYSTEM = (
    "당신은 서울경제신문의 사실 확인 담당입니다. 아래 [기사]만을 근거로 [초안]의 문장을 대조하세요. "
    "고유명사(사람·기관·기업), 직함, 인용문, 날짜, 인과 주장이 [기사]에 근거가 있는지만 봅니다(문체·의견은 보지 않습니다). "
    "근거가 없거나 [기사]와 다른 것만 찾으세요. 출력은 JSON 배열 하나만: [\"문제가 있는 초안 문장 그대로 + 이유\"]. 문제가 없으면 []."
)


def fact_check(draft: Dict[str, Any], cluster: Dict[str, Any]) -> List[str]:
    """별도 모델 호출로 초안의 고유명사·인용·인과를 기사 본문과 대조한다. 호출·해석이 실패하면 안전하게 '문제 있음'으로 본다(발행 보류)."""
    from json_extract import extract_fenced_json_text, loads_lenient
    articles = "\n\n".join(f"[기사 {a['key']}] {a['title']}\n{(a.get('content') or '')[:6000]}" for a in cluster["articles"])
    try:
        text = call_model(FACT_CHECK_SYSTEM, f"[기사]\n{articles}\n\n[초안]\n{core.draft_body_text(draft)}", max_tokens=3000)
        body = extract_fenced_json_text(text, opener="[") or text[text.find("["): text.rfind("]") + 1]
        out = loads_lenient(body)
    except Exception:  # noqa: BLE001
        return ["사실 대조 응답을 해석하지 못함(보류)"]
    return [str(x) for x in out] if isinstance(out, list) else ["사실 대조 응답 형식 오류(보류)"]


def _run_cluster(cluster: Dict[str, Any], result: Dict[str, Any], live: bool) -> Dict[str, Any]:
    c3, arch = api("POST", "/admin/issue-letters/archives", {"articles": [{"news_id": a["key"], "title": a["title"], "original_link": core.sedaily_url(a["key"]), "published_at": (a.get("date") or "")[:10], "content": (a.get("content") or "")[:300]} for a in cluster["articles"]]})
    if c3 != 200:
        return {**result, "stopped": f"보관 기사 저장 실패({c3})", "detail": arch.get("detail")}
    c4, ed = api("GET", "/api/v2/issue-letters/editors", public=True)
    editors = ed.get("editors", []) if c4 == 200 else []
    prompt = build_prompt(cluster, editors, "")
    sources_text = [a.get("content") or "" for a in cluster["articles"]] + [a["title"] for a in cluster["articles"]]
    feedback = ""
    for attempt in range(1, ATTEMPTS_PER_CLUSTER + 1):
        draft = make_draft(prompt, feedback)
        if not draft:
            feedback = "JSON 형식이 올바르지 않습니다. 코드블록 없이 JSON 객체 하나만 출력하세요."
            log("draft_unparsed", attempt=attempt)
            continue
        core.strip_key_line_prefix(draft)
        outside = core.restrict_to_cluster(draft, cluster["keys"])
        if outside:
            feedback = "묶음 밖 주소를 링크했습니다: " + ", ".join(outside)
            log("draft_outside_links", attempt=attempt, urls=outside)
            continue
        too_long_short = core.length_problem(draft)
        if too_long_short:
            feedback = too_long_short
            log("draft_length", attempt=attempt, chars=core.body_chars(draft))
            continue
        unsupported = core.unsupported_numbers(draft, sources_text)
        if unsupported:
            feedback = "기사 본문에 없는 수치가 있습니다(지어내지 말고 기사에 있는 수치만 쓰세요): " + ", ".join(unsupported)
            log("draft_unsupported_numbers", attempt=attempt, numbers=unsupported)
            continue
        advice = core.advice_hits(draft)
        if advice:
            feedback = "투자·행동 권유로 읽힐 수 있는 표현이 있습니다. 해당 문장과 인용을 빼고 사실만 쓰세요: " + ", ".join(advice)
            log("draft_advice_terms", attempt=attempt, terms=advice)
            continue
        fact_problems = fact_check(draft, cluster)
        if fact_problems:
            feedback = "기사 본문에서 확인되지 않는 내용이 있습니다. 해당 문장을 빼거나 기사에 있는 표현으로 고치세요: " + " / ".join(fact_problems)[:1500]
            log("draft_fact_check_failed", attempt=attempt, problems=fact_problems[:5])
            continue
        slugs = core.pick_editors(draft.get("topics") or [], editors)
        if not slugs:
            return {**result, "stopped": "작성 에디터를 정할 수 없음(주제와 담당 분야가 겹치지 않음)", "draft_title": draft.get("title")}
        draft["editors"] = slugs
        c5, saved = api("POST", "/admin/issue-letters", {"data": draft, "actor": {"employee_no": "auto-writer", "role": "editor"}})
        if c5 not in (200, 201):
            feedback = f"서버 저장 규칙 위반: {saved.get('detail')}"
            log("draft_rejected_by_server", attempt=attempt, detail=str(saved.get("detail"))[:300])
            continue
        letter = saved.get("letter", saved)
        log("draft_saved", id=letter["id"], slug=letter.get("slug"), editors=slugs, attempt=attempt)
        if not live:
            return {**result, "stopped": "드라이런 — 초안만 저장", "letter_id": letter["id"], "slug": letter.get("slug")}
        c6, _ = api("POST", f"/admin/issue-letters/{letter['id']}/submit", {})
        c7, pub = api("POST", f"/admin/issue-letters/{letter['id']}/publish", {"actor": {"employee_no": "auto-publisher", "role": "admin"}})
        if c7 != 200:
            log("publish_rejected", detail=str(pub.get("detail"))[:300])
            return {**result, "stopped": f"발행 거부({c7})", "detail": pub.get("detail"), "letter_id": letter["id"]}
        return {**result, "published": 1, "letter_id": letter["id"], "slug": letter.get("slug"), "send": pub.get("send")}
    return {**result, "retry_next": True, "last_feedback": feedback}


def run(dry_run: Optional[bool] = None) -> Dict[str, Any]:
    now = datetime.now(KST)
    live = os.environ.get("ISSUELETTER_AUTO") == "1" if dry_run is None else not dry_run
    result: Dict[str, Any] = {"live": live, "published": 0}
    if live and not (WINDOW[0] <= now.hour < WINDOW[1]):
        return {**result, "stopped": f"발행 시각 창({WINDOW[0]}~{WINDOW[1]}시) 밖"}
    code, existing = api("GET", "/admin/issue-letters?limit=200")
    letters = existing.get("letters", []) if code == 200 else []
    today = now.strftime("%Y-%m-%d")
    if sum(1 for l in letters if str(l.get("published_at") or "").startswith(today) and l.get("status") == "published") >= MAX_PER_DAY:
        return {**result, "stopped": "오늘 발행 상한 도달"}
    used: List[str] = []
    for l in letters:
        c2, d = api("GET", f"/admin/issue-letters/{l['id']}")
        for s in (d.get("letter", d).get("sources") or []):
            k = core.article_key_of(str(s.get("url") or ""))
            if k:
                used.append(k)
    articles = fetch_recent_articles()
    log("articles", n=len(articles))
    clusters = pick_clusters(articles, used)
    if not clusters:
        return {**result, "stopped": "이슈 묶음 없음"}
    last: Dict[str, Any] = {}
    for cluster in clusters[:MAX_CLUSTERS_TRIED]:
        out = _run_cluster(cluster, result, live)
        if not out.get("retry_next"):
            return out
        last = out
        log("cluster_exhausted", topic=cluster["topic"], feedback=str(out.get("last_feedback"))[:200])
    return {**result, "stopped": f"초안 생성이 {MAX_CLUSTERS_TRIED}개 묶음에서 모두 검증을 통과하지 못함", "last_feedback": last.get("last_feedback")}


if __name__ == "__main__":
    try:
        out = run()
        log("done", **out)
        sys.exit(0 if "published" in out else 1)
    except Exception:  # noqa: BLE001
        traceback.print_exc()
        sys.exit(2)
