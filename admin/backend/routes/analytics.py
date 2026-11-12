"""GET /admin/analytics/summary — CMS 홈 "독자 반응" 카드 (2026-11-12).

목표 3축(사이트 체류 ↑, 좋은 기사를 얻어감, 재방문 ↑)에 맞춘 숫자를 GA4 BigQuery 내보내기에서 계산한다.
SQL과 공통 규칙(실사이트만·직원 제외·60일 한계)은 repo/ga4_repo.py 참고.

기간(전부 "최신 내보내기 날짜" 기준, 오늘이 아니라 — 전날분이 다음 날 들어오기 때문):
- 이번 주 vs 지난주: 최근 7일 / 그 전 7일
- 7일 내 재방문: 첫 방문 뒤 7일이 다 지난 묶음끼리 비교(최신-13~-7일 / 최신-20~-14일)
- 기사 순위·유입 경로·웹툰: 최근 30일

BigQuery 데이터는 하루 한 번 바뀌므로 결과를 1시간 동안 Lambda 메모리에 캐시한다
(warm 인스턴스 기준, 쿼리 5개 ≈ 무료 한도 안). 비교·판정·문구용 값만 여기서 만들고
▲▼ 표시는 화면(admin/frontend 대시보드)이 cur/prev로 계산한다.
"""

from __future__ import annotations

import datetime as dt
import logging
import time
from concurrent.futures import ThreadPoolExecutor

from repo import ga4_repo
from shared import bigquery_client, response

logger = logging.getLogger(__name__)

CACHE_TTL_S = 3600
ARTICLE_WINDOW_DAYS = 30
ARTICLE_MIN_READS = 10
LIST_SIZE = 5
SOURCE_LIST_SIZE = 6
# 이 수보다 적은 분모로 낸 비율은 화면에 "표본 적음"을 붙인다.
LOW_SAMPLE = 30
# GA4 내부 트래픽 규칙(회사 와이파이 IP) 등록일 — 이 날 이전 기록에는 직원 방문이 섞여 있다.
INTERNAL_FILTER_SINCE = "2026-11-12"
_TITLE_SUFFIX = " | AI LENS"

_cache: tuple[dict, float] | None = None


def _rate(num: float | None, den: float | None) -> float | None:
    if not den or num is None:
        return None
    return round(100.0 * num / den, 1)


def _by_period(rows: list[dict]) -> dict[str, dict]:
    return {r["period"]: r for r in rows if r.get("period")}


def _engagement(row: dict | None) -> dict | None:
    if not row:
        return None
    return {
        "sessions": row.get("sessions") or 0,
        "users": row.get("users") or 0,
        "median_engaged_sec": round(row["median_engaged_sec"], 1) if row.get("median_engaged_sec") is not None else None,
        "pages_per_session": round(row["pages_per_session"], 2) if row.get("pages_per_session") is not None else None,
        "article_reads": row.get("article_reads") or 0,
        "read_to_end_rate": _rate(row.get("read_to_end"), row.get("article_reads")),
        "article_sessions": row.get("article_sessions") or 0,
        "multi_article_rate": _rate(row.get("multi_article_sessions"), row.get("article_sessions")),
        "returning_users": row.get("returning_users") or 0,
        "returning_rate": _rate(row.get("returning_users"), row.get("users")),
    }


def _retention(row: dict | None) -> dict | None:
    if not row:
        return None
    return {
        "new_users": row.get("new_users") or 0,
        "returned_7d": row.get("returned_7d") or 0,
        "rate": _rate(row.get("returned_7d"), row.get("new_users")),
    }


def _article(row: dict) -> dict:
    title = (row.get("title") or "").strip()
    if title.endswith(_TITLE_SUFFIX):
        title = title[: -len(_TITLE_SUFFIX)].strip()
    return {
        "path": row["path"],
        "title": title or row["path"],
        "reads": row.get("reads") or 0,
        "read_to_end_rate": _rate(row.get("read_to_end"), row.get("reads")),
        "median_engaged_sec": round(row["median_engaged_sec"], 1) if row.get("median_engaged_sec") is not None else None,
    }


def _rank_articles(rows: list[dict]) -> dict:
    items = [_article(r) for r in rows]

    def num(v: float | None) -> float:
        return v if v is not None else -1.0

    top = sorted(items, key=lambda a: (num(a["read_to_end_rate"]), num(a["median_engaged_sec"])), reverse=True)[:LIST_SIZE]
    top_paths = {a["path"] for a in top}
    rest = [a for a in items if a["path"] not in top_paths]
    bottom = sorted(rest, key=lambda a: (num(a["median_engaged_sec"]), num(a["read_to_end_rate"])))[:LIST_SIZE]
    return {"top": top, "bottom": bottom, "count": len(items), "min_reads": ARTICLE_MIN_READS}


# 도메인 "조각" 단위로 비교한다 — 부분 문자열로 비교하면 chatgpt.com 이 "t.co"에 걸린다(2026-11-12 실측).
_SOCIAL_DOMAINS = ("kakao", "facebook", "instagram", "t.co", "twitter", "x.com", "threads", "band", "linkedin")


def _is_social(source: str) -> bool:
    host = source.split("/")[0]
    labels = host.split(".")
    for d in _SOCIAL_DOMAINS:
        if "." in d:
            if host == d or host.endswith("." + d):
                return True
        elif d in labels:
            return True
    return False


def channel_label(source: str, medium: str) -> str:
    """GA4 첫 방문 source/medium을 팀이 읽을 수 있는 이름으로."""
    s, m = (source or "").lower(), (medium or "").lower()
    if s == "(direct)" or m == "(none)":
        return "직접 접속"
    if m == "organic":
        return f"검색 · {source}"
    # GA4가 ChatGPT·Gemini 등에서 온 방문을 medium=ai-assistant 로 분류해 준다.
    if m == "ai-assistant":
        return f"AI 검색 · {source}"
    if "sedaily" in s:
        return f"서울경제 · {source}"
    if _is_social(s):
        return f"SNS·메신저 · {source}"
    if m == "referral":
        return f"다른 사이트 · {source}"
    return f"{source} / {medium}"


def _sources(rows: list[dict]) -> list[dict]:
    out = []
    for r in rows[:SOURCE_LIST_SIZE]:
        out.append({
            "label": channel_label(r.get("source", ""), r.get("medium", "")),
            "source": r.get("source"),
            "medium": r.get("medium"),
            "users": r.get("users") or 0,
            "multi_day_rate": _rate(r.get("multi_day_users"), r.get("users")),
        })
    return out


def _webtoon(rows: list[dict]) -> list[dict]:
    return [
        {
            "variant": r.get("variant"),
            "starts": r.get("starts") or 0,
            "completes": r.get("completes") or 0,
            "rate": _rate(r.get("completes"), r.get("starts")),
        }
        for r in rows
        if r.get("variant") in ("v1", "v2")
    ]


def _breakdowns(rows: list[dict]) -> dict[str, list[dict]]:
    out: dict[str, list[dict]] = {"section": [], "source": [], "age": [], "device": []}
    for r in rows:
        dim = r.get("dim")
        if dim not in out or r.get("k") is None:
            continue
        out[dim].append({
            "k": r["k"],
            "reads": r.get("reads") or 0,
            "read_to_end_rate": _rate(r.get("read_to_end"), r.get("reads")),
            "median_engaged_sec": round(r["median_engaged_sec"], 1) if r.get("median_engaged_sec") is not None else None,
        })
    for items in out.values():
        items.sort(key=lambda x: x["reads"], reverse=True)
    return out


def _landing(rows: list[dict]) -> list[dict]:
    items = [
        {
            "k": r["k"],
            "sessions": r.get("sessions") or 0,
            "one_page_rate": _rate(r.get("one_page"), r.get("sessions")),
            "pages_per_session": round(r["pages_per_session"], 1) if r.get("pages_per_session") is not None else None,
        }
        for r in rows
        if r.get("k")
    ]
    return sorted(items, key=lambda x: x["sessions"], reverse=True)


def _hourly(rows: list[dict]) -> list[int]:
    hours = [0] * 24
    for r in rows:
        h = r.get("hour")
        if isinstance(h, int) and 0 <= h < 24:
            hours[h] = r.get("sessions") or 0
    return hours


def _features(rows: list[dict]) -> dict:
    total = next((r.get("sessions") or 0 for r in rows if r.get("k") == "_all"), 0)
    items = [
        {"k": r["k"], "sessions": r.get("sessions") or 0, "rate": _rate(r.get("sessions"), total)}
        for r in rows
        if r.get("k") and r["k"] != "_all"
    ]
    return {"total_sessions": total, "items": sorted(items, key=lambda x: x["sessions"], reverse=True)}


def _span(a: dt.date, b: dt.date) -> dict:
    return {"from": a.isoformat(), "to": b.isoformat()}


def build_summary() -> dict | None:
    latest = ga4_repo.latest_export_date()
    if latest is None:
        return None

    day = dt.timedelta(days=1)
    cur = (latest - 6 * day, latest)
    prev = (latest - 13 * day, latest - 7 * day)
    ret_cur = (latest - 13 * day, latest - 7 * day)
    ret_prev = (latest - 20 * day, latest - 14 * day)
    month = (latest - (ARTICLE_WINDOW_DAYS - 1) * day, latest)

    with ThreadPoolExecutor(max_workers=9) as pool:
        f_eng = pool.submit(ga4_repo.engagement_by_period, cur, prev)
        f_ret = pool.submit(ga4_repo.week_retention, ret_cur, ret_prev)
        f_art = pool.submit(ga4_repo.article_stats, month[0], month[1], ARTICLE_MIN_READS)
        f_src = pool.submit(ga4_repo.source_stats, month[0], month[1])
        f_wt = pool.submit(ga4_repo.webtoon_completion, month[0], month[1])
        f_brk = pool.submit(ga4_repo.article_breakdowns, month[0], month[1])
        f_land = pool.submit(ga4_repo.landing_stats, month[0], month[1])
        f_hour = pool.submit(ga4_repo.hourly_sessions, month[0], month[1])
        f_feat = pool.submit(ga4_repo.feature_usage, month[0], month[1])
        eng = _by_period(f_eng.result())
        ret = _by_period(f_ret.result())
        articles = f_art.result()
        sources = f_src.result()
        webtoon = f_wt.result()
        breakdowns = f_brk.result()
        landing = f_land.result()
        hourly = f_hour.result()
        features = f_feat.result()

    return {
        "as_of": latest.isoformat(),
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "internal_filter_since": INTERNAL_FILTER_SINCE,
        "low_sample": LOW_SAMPLE,
        "windows": {
            "cur": _span(*cur),
            "prev": _span(*prev),
            "retention_cur": _span(*ret_cur),
            "retention_prev": _span(*ret_prev),
            "month": _span(*month),
        },
        "engagement": {"cur": _engagement(eng.get("cur")), "prev": _engagement(eng.get("prev"))},
        "retention": {"cur": _retention(ret.get("cur")), "prev": _retention(ret.get("prev"))},
        "articles": _rank_articles(articles),
        "sources": _sources(sources),
        "webtoon": _webtoon(webtoon),
        # 세부 분석(최근 30일) — 어디서 막히는지 쪼개 보기
        "breakdowns": _breakdowns(breakdowns),
        "landing": _landing(landing),
        "hourly": _hourly(hourly),
        "features": _features(features),
    }


def handle_summary(body: dict, path_params: dict, query_params: dict) -> dict:
    global _cache
    now = time.time()
    if _cache and _cache[1] > now:
        return response.ok(_cache[0])

    try:
        summary = build_summary()
    except bigquery_client.BigQueryError as e:
        logger.warning("analytics summary failed: %s", e)
        return response.err(f"BigQuery 조회 실패: {e}", 502)

    if summary is None:
        return response.err("GA4 내보내기 테이블이 없습니다", 503)

    _cache = (summary, now + CACHE_TTL_S)
    return response.ok(summary)
