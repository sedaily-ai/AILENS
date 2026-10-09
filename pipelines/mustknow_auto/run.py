"""필수뉴스 자동 발행 — EventBridge(하루 6회, 08/12/15/18/21/23시 KST)가 깨우는
Fargate 태스크의 진입점.

흐름: discovery.fetch_articles(오늘)의 누적 후보에서 seen 테이블
(`sedaily-lens-mustknow-seen-dev`)에 있는 기사를 제외해 델타만 남기고, 사전필터(중복
게재 탐지, 최소 길이, 다이제스트 기사 제외)를 거친 뒤 (1) 지면특별코너 4탭(전체·증권·
산업·시그널, 탭당 최대 4건), (2) 일반 필수뉴스(연예·스포츠·피플·오피니언 소거 후
select_general_articles()가 최대 20건 선정) 순서로 발행한다. 채점·선정한 기사는
발행 여부와 무관하게 seen에 기록해 재채점을 막되, 발행이 "failed"인 기사와 파싱 실패
배치의 기사는 seen에 남기지 않아 다음 회차에 재시도한다.

frontpage_auto(지면 1면, 1일 1회)와는 독립이며, 발행 직전
`publish_utils.already_published()`로 이미 발행된 기사를 확인해 중복을 막는다.
`_publish()`는 4포맷 생성·업로드·발행 본체인 `publish_utils.publish_article()`에 위임하는
얇은 래퍼이다(frontpage_auto/run.py도 같은 함수를 쓴다).

영상 생성이 실패하면 해당 기사는 영상 없이 발행하고 `needs_video: true`로 표시한다.
"""
import difflib
import json
import os
import re
from decimal import Decimal
import sys
import traceback
from datetime import datetime, timedelta, timezone
from pathlib import Path

KST = timezone(timedelta(hours=9))

_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(_ROOT / "common"))
sys.path.insert(0, str(_ROOT / "video"))
sys.path.insert(0, str(Path(__file__).parent))

import boto3

import ddb_prompt
import classify
# frontpage_auto/run.py와 공유하는 발행 헬퍼(4포맷 생성·업로드·발행 본체 포함).
import publish_utils
import lens_cms_client
from config import AWS_REGION

discovery = publish_utils.load_module("mustknow_auto_discovery", _ROOT / "discovery" / "pipeline.py")
_letters_mod = publish_utils.load_module("mustknow_auto_letters", _ROOT / "letters" / "pipeline.py")
_podcast_mod = publish_utils.load_module("mustknow_auto_podcast", _ROOT / "podcast" / "pipeline.py")
_webtoon_mod = publish_utils.load_module("mustknow_auto_webtoon", _ROOT / "webtoon" / "pipeline.py")

REGION = AWS_REGION
# 글 발행은 publish_utils.publish_article()이 lens-cms-api(Postgres)로 처리한다.
# seen 테이블은 후보를 이미 봤는지만 추적하는 내부 캐시이며 DynamoDB를 쓴다.
SEEN_TABLE = "sedaily-lens-mustknow-seen-dev"

_BRACKET_RE = re.compile(r"\[[^\]]*\]")


# 지면특별코너 4탭. "전체"(지면 1면)는 점수 없이 discovery가 편집 데이터로 정렬한 순서를
# 따르고, 증권/산업/시그널은 `_rank_tab_candidates` 기준으로 탭당 4건을 채운다.
# 같은 회차 안에서만 순위를 정하며 이미 발행된 글을 나중에 더 좋은 기사로 대체하지 않는다.
#
# _TAB_THRESHOLD는 발행 게이트가 아니라 정렬 우선순위 참고값이다. 채점 프롬프트의 8점대
# 앵커가 "전국민급 파급력" 수준이라 개별 기업·증시 뉴스는 구조적으로 8.0 평균에 못 미쳐
# (실측: 증권·산업·시그널 후보 재채점 시 최고점 7.0), 절대 임계값을 두면 탭이 비게 된다.
# 그래서 임계값 미달이어도 그날의 최선 후보로 정원을 채운다.
_TAB_NAMES = ("증권", "산업", "시그널")
_TAB_THRESHOLD = 6.5


def _tab_of(article: dict) -> str | None:
    """이 기사가 지면특별코너 3탭(증권/산업/시그널) 중 어디 후보인지 반환한다. 시그널을 먼저 본다.

    top_category(XML의 첫 카테고리 태그)만 보면 마켓시그널 코너 기사의 약 40%를 놓치므로
    discovery의 `is_market_signal`(전체 카테고리 태그 + 제목 표시)을 쓴다. 시그널로
    지정된 기사는 증권/산업 탭 후보에서 제외된다."""
    if article.get("is_market_signal"):
        return "시그널"
    if article["top_category"] == "증권":
        return "증권"
    if article["top_category"] == "산업":
        return "산업"
    return None


def _rank_tab_candidates(cat_pool: list[dict], scores: dict) -> list[dict]:
    """지면특별코너 후보를 정렬한다. 편집국이 정한 지면 배치를 AI 채점보다 우선한다.

    paperNumber는 날마다 제각각이라 "N면=증권" 같은 고정 매핑이 불가능하다. 면 번호 자체가
    아니라 페이지 내 순서만 신호로 쓴다.
    1차: paperNumber 오름차순, 같은 면이면 TOP 우선(점수 유무와 무관). 같은 면에 TOP이
    둘이면 정렬 키가 같아 둘 다 앞쪽에 온다.
    2차: 지면 정보가 없는 후보를 AI 점수 높은 순으로 붙인다(1차만으로 정원을 못 채우는
    날의 폴백)."""
    paper_pool = sorted(
        (a for a in cat_pool if a.get("paper_number")),
        key=lambda a: (int(a["paper_number"]), a.get("paper_paragraph") != "TOP"),
    )
    fallback_pool = sorted(
        (a for a in cat_pool if not a.get("paper_number") and scores.get(a["key"])),
        key=lambda a: scores[a["key"]].get("total") or 0,
        reverse=True,
    )
    return paper_pool + fallback_pool
# 일반 선정은 점수 임계값이 아니라 select_general_articles()(classify.py)가 후보 전체를
# 보고 직접 고른다(점수가 7.0~7.4에 쏠려 사실상 이진 신호였다). 연예·스포츠·피플·오피니언은
# 개인 신상·명예훼손 리스크와 서비스 컨셉 불일치로 후보에서 소거한다.
#
# "selection" 프롬프트는 ddb_prompt.load_prompt()를 쓰지 않고 이 폴더의 파일을 직접 읽는다.
# Docker 빌드 컨텍스트가 pipelines/라 service/backend/prompts/ 폴백 경로가 컨테이너에 없고,
# admin CMS에도 등록돼 있지 않다. service/backend/prompts/selection/published.md는 문서
# 사본이므로 두 파일을 함께 갱신한다.
_SELECTION_PROMPT_PATH = Path(__file__).parent / "selection_prompt.md"

_GENERAL_EXCLUDE_CATEGORIES = {"연예", "스포츠", "피플", "오피니언"}
_GENERAL_DAILY_CAP = 20
_TAB_CAP = 4
_MIN_CONTENT_LEN = 300
_DUP_TITLE_RATIO = 0.72


class _PgSeenTable:
    """DynamoDB Table 의 get_item/put_item 만 흉내 내는 어댑터 — candidate_seen(Postgres, lens-cms-api 경유).
    SEEN_BACKEND=pg 일 때만 쓴다(기본 ddb). run.py 의 호출부는 그대로 두고 저장소만 갈아 끼우기 위한 것이다(v1.36)."""

    PIPELINE = "mustknow"

    def __init__(self):
        self._known: set[str] = set()

    def prefetch(self, keys):
        """후보 여러 건을 한 번에 확인해 이후 get_item 이 서버를 다시 부르지 않게 한다(옛 코드는 후보마다 get_item)."""
        self._known |= lens_cms_client.seen_exists(self.PIPELINE, list(keys))
        self._prefetched = set(keys) | getattr(self, "_prefetched", set())

    def get_item(self, Key):
        key = Key["article_key"]
        if key in self._known:
            return {"Item": {"article_key": key}}
        if key in getattr(self, "_prefetched", set()):
            return {}
        return {"Item": {"article_key": key}} if lens_cms_client.seen_exists(self.PIPELINE, [key]) else {}

    def put_item(self, Item):
        meta = {k: v for k, v in Item.items() if k not in ("article_key", "seen_at")}
        lens_cms_client.seen_mark(self.PIPELINE, Item["article_key"], **meta)
        self._known.add(Item["article_key"])


def _open_seen_table(session):
    """본 후보 이력 저장소. 기본은 DynamoDB, SEEN_BACKEND=pg 이면 Postgres(candidate_seen)."""
    if os.environ.get("SEEN_BACKEND", "ddb").lower() == "pg":
        return _PgSeenTable()
    return session.resource("dynamodb").Table(SEEN_TABLE)


def _is_seen(seen_table, article_key: str) -> bool:
    if not article_key:
        return True  # key 없는 기사는 애초에 발행 불가 대상 — 취급 안 함
    resp = seen_table.get_item(Key={"article_key": article_key})
    return "Item" in resp


def _mark_seen(seen_table, article_key: str, **meta):
    # boto3 DynamoDB 리소스는 float를 받지 않아(Decimal만) 변환하지 않으면 TypeError가 난다.
    meta = {k: (Decimal(str(v)) if isinstance(v, float) else v) for k, v in meta.items()}
    item = {"article_key": article_key, "seen_at": datetime.now(timezone.utc).isoformat()}
    item.update(meta)
    seen_table.put_item(Item=item)


def _today_published_counts(today_kst: str) -> dict[str, int]:
    """오늘 이미 발행된 글을 탭별(paper_section)/일반으로 센다.

    "탭당 4건·일반 20건"을 회차가 아닌 하루 누적 상한으로 적용하기 위한 시작값이다.
    lens-cms-api의 GET /admin/posts?date=...&status=published를 재사용하며
    admin_publish_date는 publish_date_iso와 같은 YYYY-MM-DD 포맷이다."""
    date_iso = f"{today_kst[:4]}-{today_kst[4:6]}-{today_kst[6:8]}"
    posts = lens_cms_client.list_published_today(date_iso)
    counts = {"전체": 0, "증권": 0, "산업": 0, "시그널": 0, "일반": 0}
    for post in posts:
        section = (post.get("body_inline") or {}).get("paper_section")
        key = section if section in counts else "일반"
        counts[key] += 1
    return counts


def _normalize_title(title: str) -> str:
    t = _BRACKET_RE.sub("", title or "")
    return re.sub(r"\s+", " ", t).strip()


def _dedupe_near_identical(articles: list[dict]) -> list[dict]:
    """같은 사안을 문구만 바꿔 반복 게재한 기사를 제거하고 본문이 긴 것만 남긴다."""
    kept: list[dict] = []
    for a in sorted(articles, key=lambda x: -x["content_len"]):
        norm = _normalize_title(a["title"])
        if any(
            difflib.SequenceMatcher(None, norm, _normalize_title(k["title"])).ratio() >= _DUP_TITLE_RATIO
            for k in kept
        ):
            continue
        kept.append(a)
    return kept


def _publish(
    article: dict,
    out_dir: Path,
    s3,
    today_kst: str,
    *,
    paper_section: str | None,
    display_order: int | None,
    results: dict | None = None,
    manage_gpu: bool = True,
) -> str:
    """반환값: "published" | "published_no_video" | "failed"

    발행 여부 판단(중복 확인·선정)은 호출부 책임이며 여기서는 하지 않는다.
    manage_gpu는 publish_utils.publish_article()에 그대로 전달된다."""
    return publish_utils.publish_article(
        article, out_dir, s3, today_kst,
        name=article["key"], source_url=article["url"],
        paper_section=paper_section, display_order=display_order,
        log_prefix="mustknow-auto",
        letters_mod=_letters_mod, podcast_mod=_podcast_mod, webtoon_mod=_webtoon_mod,
        results=results,
        manage_gpu=manage_gpu,
    )


def main():
    session = boto3.Session(region_name=REGION)
    s3 = session.client("s3")
    seen_table = _open_seen_table(session)
    revalidate_secret = publish_utils.get_revalidate_secret(session, log_prefix="mustknow-auto")

    today = datetime.now(KST).strftime("%Y%m%d")
    # 일요일은 지면(인쇄판)이 나오지 않는다. 4탭은 "오늘의 지면"을 옮기는 기능이므로
    # 일요일에는 4탭을 전부 건너뛰고 일반 카테고리만 처리한다.
    is_sunday = datetime.now(KST).weekday() == 6
    all_articles = discovery.fetch_articles(today)
    front_page = [] if is_sunday else discovery.fetch_front_page(today)
    sunday_note = " (일요일 — 지면특별코너 4탭 전부 스킵, 일반만 처리)" if is_sunday else ""
    print(f"[mustknow-auto] 오늘({today}) 전체 후보 {len(all_articles)}건, 지면1면 후보 {len(front_page)}건{sunday_note}")

    if hasattr(seen_table, "prefetch"):
        seen_table.prefetch([a["key"] for a in all_articles + front_page if a["key"]])
    fresh = [a for a in all_articles if a["key"] and not _is_seen(seen_table, a["key"])]
    fresh = _dedupe_near_identical(fresh)
    fresh = [a for a in fresh if a["content_len"] >= _MIN_CONTENT_LEN]
    # "AI 프리즘"은 관련 기사 여러 건을 요약한 자체 AI 다이제스트 칼럼(subTitle이
    # "■AI 프리즘 [카테고리]"로 시작)이다. AI 산출물을 다시 4포맷으로 변환하는 것이 맞지
    # 않고 "하나의 이슈"라는 컨셉과도 달라 후보에서 뺀다.
    fresh = [a for a in fresh if "AI 프리즘" not in a["sub_title"]]
    # "기업 공시 [9월 11일]" 같은 공시 요약 기사도 같은 이유로 뺀다. 무관한 상장사 공시를
    # 날짜 하나로 묶은 다이제스트이며, 원문에 없는 연도를 레터가 지어낸 사고가 있었다.
    # 제목이 "기업 공시 ["로 시작하는 마켓시그널>증권일반 정기 코너로 식별한다.
    fresh = [a for a in fresh if not (a["title"] or "").startswith("기업 공시 [")]
    print(f"[mustknow-auto] seen 제외 + 사전필터 후 {len(fresh)}건 남음")

    out_dir = Path("/tmp/mustknow_auto_out")
    out_dir.mkdir(parents=True, exist_ok=True)

    results = {"published": 0, "published_no_video": 0, "degraded_no_webtoon": 0, "failed": 0, "skipped_duplicate": 0}
    selected_keys: set[str] = set()
    # 0이 아니라 "오늘 이미 발행된 건수"로 시작해 tab_counts[tab] >= _TAB_CAP 체크가
    # 하루 누적 상한으로 동작하게 한다.
    tab_counts = _today_published_counts(today)
    print(f"[mustknow-auto] 오늘 이미 발행된 건수 — {tab_counts}")

    def _try_publish(article, paper_section, display_order):
        """반환값을 호출부가 확인해야 한다. "failed"이면 seen을 마킹하면 안 된다(재시도 대상)."""
        if publish_utils.already_published(article["url"]):
            print(f"[mustknow-auto] frontpage_auto 등에 이미 발행됨, 스킵 — {article['title']}")
            results["skipped_duplicate"] += 1
            return "skipped_duplicate"
        try:
            status = _publish(article, out_dir, s3, today, paper_section=paper_section, display_order=display_order, results=results)
        except Exception:
            print(f"[mustknow-auto] {article['title']} 처리 중 예외 — 이 기사만 스킵\n{traceback.format_exc()}")
            status = "failed"
        results[status] = results.get(status, 0) + 1
        # 기사 하나가 끝날 때마다 즉시 무효화한다. 끝에서 한 번만 부르면 뒤따르는 기사의 영상
        # 생성(수 분) 동안 프런트 SSR 캐시(300s)가 갱신되지 않아 이미 발행된 글이
        # "이슈를 찾을 수 없어요"로 보인다.
        if status in ("published", "published_no_video") and revalidate_secret:
            publish_utils.notify_revalidate(revalidate_secret, log_prefix="mustknow-auto")
        return status

    # 1) 전체(지면1면) — 점수 불필요, discovery가 정렬한 TOP 배치 순서를 따른다.
    #
    # seen 마킹은 발행 시도가 끝난 뒤에만, 그리고 status가 "failed"가 아닐 때만 한다.
    # 시도 전에 마킹하면 프로세스가 중간에 죽은 기사가, 실패를 마킹하면 코드 버그로 실패한
    # 기사가 이후 회차에서 영구히 재시도되지 않는다.
    if not is_sunday:
        for a in front_page:
            if a["key"] and _is_seen(seen_table, a["key"]):
                continue
            if tab_counts["전체"] >= _TAB_CAP:
                break
            selected_keys.add(a["key"])
            status = _try_publish(a, "전체", tab_counts["전체"])
            if status != "failed":
                _mark_seen(seen_table, a["key"], tab="전체")
            tab_counts["전체"] += 1

    # 2) Sonnet 5 배치 채점 — 증권/산업/시그널 탭 후보만 채점한다. 일반은 점수를 쓰지 않고
    # (select_general_articles 참고) 점수는 탭 폴백 정렬에만 필요하다.
    scorable = [a for a in fresh if a["key"] not in selected_keys]
    tab_pool_all = [a for a in scorable if _tab_of(a) is not None]
    guide = ddb_prompt.load_prompt("mustknow")
    scores = classify.score_articles(guide, tab_pool_all) if tab_pool_all else {}
    print(f"[mustknow-auto] 탭 후보 채점 완료 {len(scores)}/{len(tab_pool_all)}건")

    # 3) 증권/산업/시그널 — _rank_tab_candidates 순서로 탭당 4건을 채운다(일요일 스킵).
    #    절대 임계값 미달이어도 그날의 최선 후보로 정원을 채운다(_TAB_THRESHOLD 주석 참고).
    if not is_sunday:
        for tab in _TAB_NAMES:
            cat_pool = [a for a in scorable if _tab_of(a) == tab]
            ordered = _rank_tab_candidates(cat_pool, scores)
            for a in ordered:
                if tab_counts[tab] >= _TAB_CAP:
                    break
                row = scores.get(a["key"])
                selected_keys.add(a["key"])
                status = _try_publish(a, tab, tab_counts[tab])
                if status != "failed":
                    meta = {"rank_method": "paper" if a.get("paper_number") else "score"}
                    if row:
                        meta.update(score=row.get("total"), reasoning=row.get("reasoning", "")[:200])
                    _mark_seen(seen_table, a["key"], **meta)
                tab_counts[tab] += 1

    # 4) 일반 — 앞선 4탭에서 이미 뽑힌 기사만 제외한다(탭 정원을 못 채운 증권/산업/시그널
    #    기사는 일반 후보 풀에 남는다). 연예·스포츠·피플·오피니언은 소거하고,
    #    select_general_articles()가 후보 전체를 보고 남은 자리만큼 직접 선정한다.
    general_pool = [
        a for a in scorable
        if a["key"] not in selected_keys and a["top_category"] not in _GENERAL_EXCLUDE_CATEGORIES
    ]
    general_remaining = _GENERAL_DAILY_CAP - tab_counts["일반"]
    if general_remaining <= 0:
        print(
            f"[mustknow-auto] 일반 하루 누적 캡 도달({tab_counts['일반']}/{_GENERAL_DAILY_CAP}) "
            f"— 이번 회차 스킵(Bedrock 호출 안 함)"
        )
    elif general_pool:
        selection_guide = _SELECTION_PROMPT_PATH.read_text(encoding="utf-8")
        result = classify.select_general_articles(
            selection_guide, general_pool, context_articles=all_articles, max_count=general_remaining
        )
        if result is None:
            print("[mustknow-auto] 일반 선정 실패(파싱 불가) — 이번 회차 스킵, 다음 회차 재시도")
        else:
            print(
                f"[mustknow-auto] 일반 선정 — today_context: {result.get('today_context', '')[:200]}"
            )
            print(
                f"[mustknow-auto] 일반 후보 {result.get('candidates_total')}건 중 "
                f"{result.get('excluded_count')}건 제외 — {result.get('excluded_reasons', [])}"
            )
            by_key = {a["key"]: a for a in general_pool}
            # 선정 실험실(admin `/selection-lab`) 기록. 발행을 막지 않는 부가 기록이라
            # log_selection_run()이 fail-open이며, LLM 원본 선정 결과를 먼저 스냅샷한다.
            date_iso = f"{today[:4]}-{today[4:6]}-{today[6:8]}"
            selection_log = [
                {
                    "key": row.get("key"),
                    "title": (by_key.get(row.get("key")) or {}).get("title", ""),
                    "category": (by_key.get(row.get("key")) or {}).get("top_category", ""),
                    "reason": row.get("reason", ""),
                }
                for row in result.get("selected", [])
                if by_key.get(row.get("key"))
            ]
            lens_cms_client.log_selection_run(
                run_date=date_iso,
                today_context=result.get("today_context"),
                candidates_total=result.get("candidates_total", 0),
                excluded_count=result.get("excluded_count", 0),
                excluded_reasons=result.get("excluded_reasons", []),
                selected=selection_log,
            )
            for row in result.get("selected", []):
                a = by_key.get(row.get("key"))
                if a is None:
                    continue
                selected_keys.add(a["key"])
                status = _try_publish(a, None, None)
                if status != "failed":
                    _mark_seen(seen_table, a["key"], reason=row.get("reason", "")[:200])
                tab_counts["일반"] += 1
            # 선정되지 않은 나머지 후보도 seen 처리한다. 단 자리가 없어 하드컷된 기사
            # (overflow_keys, classify.py 참고)는 seen에 남기지 않아, 다음 회차·다음날 다시
            # 평가받게 한다(LLM이 거절한 기사와 구분).
            overflow_keys = set(result.get("overflow_keys") or [])
            for a in general_pool:
                if a["key"] in selected_keys or a["key"] in overflow_keys:
                    continue
                _mark_seen(seen_table, a["key"], excluded_from_general=True)

    print(f"[mustknow-auto] 완료 — {json.dumps(results, ensure_ascii=False)} / 탭별 {json.dumps(tab_counts, ensure_ascii=False)}")

    # 후보가 있는데 발행·중복스킵이 0건이면(예: discovery/API 장애) 실패 코드로 종료해
    # CloudWatch 알람이 걸리게 한다.
    if fresh and results["published"] == 0 and results["published_no_video"] == 0 and results["skipped_duplicate"] == 0:
        sys.exit(1)


def manual_backfill(source_ymd: str, target_ymd: str, tab: str, keys: list[str]):
    """자정을 넘겨 discovery의 "오늘" 후보 풀에서 빠진 전날(source_ymd) 기사를, 다음날
    (target_ymd) 아침 지면으로 나가는 신문 발행 관행에 맞춰 지정한 순서 그대로 발행하는
    일회성 수동 경로이다. 재채점·재정렬 없이 main()의 seen 필터·선정 로직을 거치지 않는다."""
    session = boto3.Session(region_name=REGION)
    s3 = session.client("s3")
    seen_table = _open_seen_table(session)
    revalidate_secret = publish_utils.get_revalidate_secret(session, log_prefix="mustknow-auto")
    out_dir = Path("/tmp/mustknow_auto_out")
    out_dir.mkdir(parents=True, exist_ok=True)

    all_articles = discovery.fetch_articles(source_ymd)
    by_key = {a["key"]: a for a in all_articles}
    published = 0
    for i, key in enumerate(keys):
        article = by_key.get(key)
        if not article:
            print(f"[mustknow-auto][manual] {key} — {source_ymd} 후보에서 못 찾음, 스킵")
            continue
        try:
            status = _publish(article, out_dir, s3, target_ymd, paper_section=tab, display_order=i)
        except Exception:
            print(f"[mustknow-auto][manual] {key} 처리 중 예외\n{traceback.format_exc()}")
            continue
        if status != "failed":
            _mark_seen(seen_table, key, tab=tab, manual=True)
            published += 1
            # _try_publish()와 같은 이유로 기사 단위로 즉시 무효화한다.
            if revalidate_secret:
                publish_utils.notify_revalidate(revalidate_secret, log_prefix="mustknow-auto")

    print(f"[mustknow-auto][manual] 완료 — {published}/{len(keys)}건 {tab} 탭에 발행")


if __name__ == "__main__":
    if "--manual-signal-backfill" in sys.argv:
        # 뒤에 오는 인자를 발행 대상 key 목록으로 쓴다(순서=display_order). 없으면 기본 4건 전체.
        # 정체 재현 시 1건씩 격리해 재시도하기 위한 용도이다.
        idx = sys.argv.index("--manual-signal-backfill")
        keys = sys.argv[idx + 1:] or ["20082684", "20083221", "20083196", "20083080"]
        manual_backfill(source_ymd="20260825", target_ymd="20260826", tab="시그널", keys=keys)
    else:
        main()
