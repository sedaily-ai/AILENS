"""필수뉴스 자동 발행(Step1+Step2 통합) — EventBridge(하루 6회, 08/12/15/18/
21/23시 KST)가 깨우는 Fargate 태스크의 진입점.

흐름: discovery.fetch_articles(오늘)로 그 시점까지 누적된 하루치 후보를
받는다 → seen 테이블(`sedaily-lens-mustknow-seen-dev`, key GetItem)로 이미
처리한 기사를 제외한 델타만 남긴다 → 규칙 기반 사전필터(중복게재 탐지,
최소 길이) → ① 지면특별코너 4탭(전체·증권·산업·시그널, 탭당 최대 4건) →
② 그 외 일반 필수뉴스(종합점수 ≥7.0, 캡 없음) 순서로 처리한다. 매 회차
"이번에 채점한 기사는 선정 여부와 무관하게" seen에 기록해 같은 기사가
다음 회차에 다시 채점되지 않게 한다(단, Bedrock 응답 파싱 자체가 실패한
기사는 seen에 안 남겨 다음 회차에 재시도되게 둔다 — classify.py 참조).

**frontpage_auto와의 관계**: 지면1면은 이미 `pipelines/frontpage_auto`가
1일 1회(07:00 KST) 처리 중이다. 이번 파이프라인을 그걸 대체할지는 아직
결정 안 됐다(2026-08-22 설계 노트의 "이슈 B") — 그래서 frontpage_auto의
동작(스케줄·selection 로직)은 안 건드리고, 대신 이 파이프라인이 발행 직전
`publish_utils.already_published()`로 frontpage_auto가 이미 발행한 기사인지
한 번 더 확인해 중복 발행을 막는다. `_publish()`는 4포맷 생성+업로드+DDB
write 본체를 `publish_utils.publish_article()`에 위임하는 얇은 래퍼다 —
frontpage_auto/run.py의 `process_article()`도 같은 함수에 위임한다
(2026-09-05, 두 래퍼가 그 본체를 바이트 단위로 복사해 갖고 있던 걸 공용화
— "이슈 B" 결정과 무관하게 이 부분은 두 파이프라인이 영원히 같은 스키마로
발행해야 하므로 안전하게 공용화할 수 있었다).

**영상 예외 처리**·**팩트 원칙**은 frontpage_auto와 동일(§23) — video
각본 생성이 실패하면 그 기사는 3/4 포맷만 발행하고 `needs_video: true`로
표시한다.
"""
import difflib
import json
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
# 2026-09-04·2026-09-05 — frontpage_auto/run.py와 공유하는 발행 헬퍼
# (리팩토링 감사로 추출, publish_utils.py 참조) — publish_article()이
# 4포맷 생성+업로드+DDB write 본체까지 담당한다.
import publish_utils
from config import AWS_REGION, CMS_POSTS_TABLE

discovery = publish_utils.load_module("mustknow_auto_discovery", _ROOT / "discovery" / "pipeline.py")
_letters_mod = publish_utils.load_module("mustknow_auto_letters", _ROOT / "letters" / "pipeline.py")
_podcast_mod = publish_utils.load_module("mustknow_auto_podcast", _ROOT / "podcast" / "pipeline.py")
_webtoon_mod = publish_utils.load_module("mustknow_auto_webtoon", _ROOT / "webtoon" / "pipeline.py")

REGION = AWS_REGION
TABLE = CMS_POSTS_TABLE
SEEN_TABLE = "sedaily-lens-mustknow-seen-dev"

_BRACKET_RE = re.compile(r"\[[^\]]*\]")


# display_category()·_CATEGORY_MAP → publish_utils.display_category()/
# publish_utils.CATEGORY_MAP로 이전(2026-09-04, frontpage_auto/run.py와
# 바이트 단위 동일 함수 공용화 — publish_utils.py 참조).

# 지면특별코너 4탭 — 전체(지면1면)는 점수 없이 TOP 배치 우선(discovery가
# 이미 편집 데이터로 정렬해서 줌). 증권/산업/시그널은 점수 높은 순으로
# 탭당 4건을 채운다(같은 회차 안에서만 점수순 — 이미 발행된 회차를 나중에
# 더 좋은 기사로 대체하진 않는다는 v1 결정, 2026-08-22 설계 노트
# "이슈 A" 유지).
#
# 2026-08-25 — _TAB_THRESHOLD 8.0→6.5로 하향 + "발행 여부 게이트"에서
# "정렬 우선순위 참고값"으로 역할 변경(아래 선정 로직 참조, 실제 게이트는
# 이제 없음). 파이프라인 가동(2026-08-22) 이후 3일간 발행된 249건 전부를
# 스캔해보니 paper_section이 붙은 건 0건(증권/산업/시그널/전체 전부) —
# 사용자가 지면 탭에서 8/21자 기사만 계속 보이던 신고(2026-08-25)의 원인.
# mustknow 채점 프롬프트(v#1, DDB `mustknow/published`)의 5개 지표
# (파급력/시의성/사실데이터밀도/정책제도변화/이례성) 평균이 종합점수인데,
# 8~10점대 앵커가 "전국민급 파급력"·"역대 최초/최대"급 서술이라 개별
# 기업·증시 뉴스는 구조적으로 8.0 평균에 못 미친다 — 실측: 오늘자(8/25)
# 증권 44건·산업 68건·시그널 7건 후보 중 카테고리별 최대 12건(총 37건)을
# 실제 score_articles()로 재채점한 결과 최고점이 7.0(산업 1건)뿐, 8.0
# 이상 0건. 사용자 명시 지침 — "8.0 없으면 그 아래 점수로라도 근사치로라도
# 4개씩 올리도록 해야합니다" — 에 따라 절대 임계값 미달이어도 그날 최선의
# 근사치로 정원을 채우도록 아래 3) 선정 로직 자체를 바꿨다. _GENERAL_
# THRESHOLD(7.0)는 정치·국제·금융정책 등 전 카테고리를 대상으로 하는
# 별도 풀이라 비교 대상이 아니다.
_TAB_CATEGORY = {"증권": "증권", "산업": "산업", "시그널": "Signal"}
_TAB_THRESHOLD = 6.5
_GENERAL_THRESHOLD = 7.0
_TAB_CAP = 4
_MIN_CONTENT_LEN = 300
_DUP_TITLE_RATIO = 0.72


# _parse_letters/_parse_letter_summary_bullets/_already_published_elsewhere →
# publish_utils.parse_letters()/parse_letter_summary_bullets()/
# already_published()로 이전(2026-09-04, frontpage_auto/run.py와 바이트
# 단위 동일 함수 공용화 — publish_utils.py 참조. parse_letter_summary_bullets
# 자체가 오늘 발견한 실제 발행 버그의 원인이었던 함수라, 다음부터는
# 한 번만 고치면 되게 만드는 게 이 공용화의 핵심 동기였다).


def _is_seen(seen_table, article_key: str) -> bool:
    if not article_key:
        return True  # key 없는 기사는 애초에 발행 불가 대상 — 취급 안 함
    resp = seen_table.get_item(Key={"article_key": article_key})
    return "Item" in resp


def _mark_seen(seen_table, article_key: str, **meta):
    # boto3 DynamoDB 리소스는 네이티브 float를 안 받는다(Decimal만) — 실제
    # 실행에서 score=7.2 같은 float를 그대로 넣었다가 TypeError로 파이프라인
    # 전체가 죽었다(그 시점까지의 발행 결과가 하나도 안 남고 그냥 예외 전파).
    meta = {k: (Decimal(str(v)) if isinstance(v, float) else v) for k, v in meta.items()}
    item = {"article_key": article_key, "seen_at": datetime.now(timezone.utc).isoformat()}
    item.update(meta)
    seen_table.put_item(Item=item)


def _normalize_title(title: str) -> str:
    t = _BRACKET_RE.sub("", title or "")
    return re.sub(r"\s+", " ", t).strip()


def _dedupe_near_identical(articles: list[dict]) -> list[dict]:
    """같은 사안을 다른 각도로 반복 게재한 기사 제거 — 정보량 많은(본문
    긴) 것만 남긴다. 8/21 실측 사례 근거: 박세리·쏘버디 골프채 신제품
    홍보가 문구만 바꿔 4번 게재된 것을 발견."""
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


# _generate_video → publish_utils.generate_video(log_prefix="mustknow-auto")로
# 이전(2026-09-04, publish_utils.py 참조).


def _publish(
    article: dict,
    out_dir: Path,
    s3,
    table,
    today_kst: str,
    *,
    paper_section: str | None,
    display_order: int | None,
    results: dict | None = None,
) -> str:
    """반환값: "published" | "published_no_video" | "failed"
    발행 여부 판단(중복확인·임계값)은 호출부(main)의 책임이라 여기선
    안 한다.

    2026-09-05 — 4포맷 생성+업로드+DDB write 본체는 frontpage_auto/run.py의
    `process_article()`와 바이트 단위로 동일했던 걸
    `publish_utils.publish_article()`로 공용화했다(P3 리팩토링 감사 —
    2026-09-04 P1에서 코드블록 추출 등 작은 헬퍼 9개는 공용화했지만 정작
    이 부분은 안 건드렸었다, 오늘 세션을 시작하게 만든 버그가 살고 있던
    곳과 같은 위험 클래스라 재발견 후 마저 통합)."""
    return publish_utils.publish_article(
        article, out_dir, s3, table, today_kst,
        name=article["key"], source_url=article["url"],
        paper_section=paper_section, display_order=display_order,
        log_prefix="mustknow-auto",
        letters_mod=_letters_mod, podcast_mod=_podcast_mod, webtoon_mod=_webtoon_mod,
        results=results,
    )


# _get_revalidate_secret/_notify_revalidate → publish_utils.get_revalidate_secret()/
# notify_revalidate(log_prefix="mustknow-auto")로 이전(2026-09-04).


def main():
    session = boto3.Session(region_name=REGION)
    s3 = session.client("s3")
    table = session.resource("dynamodb").Table(TABLE)
    seen_table = session.resource("dynamodb").Table(SEEN_TABLE)
    revalidate_secret = publish_utils.get_revalidate_secret(session, log_prefix="mustknow-auto")

    today = datetime.now(KST).strftime("%Y%m%d")
    # 일요일은 지면(인쇄판) 자체가 안 나온다(사용자 확인, 2026-08-23 —
    # "오늘은 일요일이라 지면 안 나오거든... 일요일은 일반기사만 돌려야함").
    # 지면특별코너 4탭(전체/증권/산업/시그널)은 전부 "오늘의 지면"을 그대로
    # 옮긴다는 게 전제인 기능이라, 지면이 없는 날 억지로 채우면 실제로는
    # 없는 지면을 있는 것처럼 보여주게 된다 — 그래서 일요일엔 이 4탭을
    # 전부 건너뛰고 일반 카테고리(임계값 7.0, 캡 없음)만 처리한다.
    is_sunday = datetime.now(KST).weekday() == 6
    all_articles = discovery.fetch_articles(today)
    front_page = [] if is_sunday else discovery.fetch_front_page(today)
    sunday_note = " (일요일 — 지면특별코너 4탭 전부 스킵, 일반만 처리)" if is_sunday else ""
    print(f"[mustknow-auto] 오늘({today}) 전체 후보 {len(all_articles)}건, 지면1면 후보 {len(front_page)}건{sunday_note}")

    fresh = [a for a in all_articles if a["key"] and not _is_seen(seen_table, a["key"])]
    fresh = _dedupe_near_identical(fresh)
    fresh = [a for a in fresh if a["content_len"] >= _MIN_CONTENT_LEN]
    # "AI 프리즘"은 서울경제 자체 AI 큐레이션 다이제스트 칼럼(관련 기사 여러 건을
    # 한데 모아 요약)이지 단일 이슈를 다루는 기사가 아니다 — subTitle이
    # "■AI 프리즘 [카테고리]"로 시작한다(2026-08-23, 사용자 지적: "프리즘
    # 기사는 변환에 사용 안 하는 기사입니다", 실제로 이미 발행된 사례에서
    # 카테고리 미분류 버그와 겹쳐 발견됨). 이미 AI가 만든 콘텐츠를 다시 AI로
    # 4포맷 변환하는 게 맞지 않고, 다이제스트라 "하나의 이슈"라는 lens
    # 컨셉과도 안 맞아서 후보에서 아예 뺀다.
    fresh = [a for a in fresh if "AI 프리즘" not in a["sub_title"]]
    print(f"[mustknow-auto] seen 제외 + 사전필터 후 {len(fresh)}건 남음")

    out_dir = Path("/tmp/mustknow_auto_out")
    out_dir.mkdir(parents=True, exist_ok=True)

    results = {"published": 0, "published_no_video": 0, "degraded_no_webtoon": 0, "failed": 0, "skipped_duplicate": 0}
    selected_keys: set[str] = set()
    tab_counts = {"전체": 0, "증권": 0, "산업": 0, "시그널": 0, "일반": 0}

    def _try_publish(article, paper_section, display_order):
        """반환값을 호출부가 반드시 확인해야 한다 — "failed"면 seen을
        마킹하면 안 된다(아래 버그 설명 참조)."""
        if publish_utils.already_published(table, article["key"]):
            print(f"[mustknow-auto] frontpage_auto 등에 이미 발행됨, 스킵 — {article['title']}")
            results["skipped_duplicate"] += 1
            return "skipped_duplicate"
        try:
            status = _publish(article, out_dir, s3, table, today, paper_section=paper_section, display_order=display_order, results=results)
        except Exception:
            print(f"[mustknow-auto] {article['title']} 처리 중 예외 — 이 기사만 스킵\n{traceback.format_exc()}")
            status = "failed"
        results[status] = results.get(status, 0) + 1
        # 2026-09-03 — 이전엔 웹훅을 main() 끝에서 전체 후보 처리가 끝난
        # 뒤 딱 한 번만 불렀다. 뒤에 남은 후보의 영상 생성(수 분 소요)이
        # 안 끝나면 이미 DDB엔 써진 앞선 기사도 그동안 프런트 SSR 캐시
        # (revalidate: 300s)가 안 갱신돼 "이슈를 찾을 수 없어요"로 뜨는 걸
        # 사용자가 실제로 클릭해보고 신고해서 발견했다(frontpage_auto와
        # 같은 문제 — run.py의 같은 날짜 수정 참조). 기사 하나가 끝날
        # 때마다 바로 무효화해서 이 창을 없앤다.
        if status in ("published", "published_no_video") and revalidate_secret:
            publish_utils.notify_revalidate(revalidate_secret, log_prefix="mustknow-auto")
        return status

    # 1) 전체(지면1면) — 점수 불필요, TOP 배치 우선(discovery가 이미 정렬해서 줌)
    #
    # 2026-08-23 버그5 수정: seen 마킹을 _try_publish() *이후*로 옮겼다.
    # 원래는 발행 시도 전에 마킹했는데, 그 상태에서 프로세스가 죽으면
    # (정상 예외가 아니라 kill 등) 그 기사가 seen엔 있지만 실제로는
    # 발행이 안 된 상태로 영원히 남아 다음 실행에서도 재시도가 안 됐다
    # (실제로 2026-08-22 로컬 검증에서 발생 — 점수 통과한 기사 2건이
    # 이 상태에 빠져 DDB를 직접 조회해 수동 복구했다). 이제는 발행 시도가
    # 실제로 끝난(성공/처리된 실패/중복스킵) 뒤에만 seen을 기록해서,
    # 시도 자체가 안 끝나고 죽은 기사는 자동으로 다음 실행에서 재시도된다.
    #
    # 2026-08-23 버그5-b: 위 수정에도 "처리된 실패"(예외를 잡아서 우아하게
    # failed로 끝난 경우 — 웹툰 JSON 파싱 실패 등)는 여전히 무조건 seen을
    # 찍고 있었다. 이러면 그날 실제로 코드 버그 때문에 실패한 기사가
    # 그 버그를 고친 뒤에도 영원히 재시도 안 된다(실제로 발생 — 20082215/
    # 20082229가 웹툰 JSON 버그로 실패했는데 seen에 박혀서, 그 버그를
    # 고친 뒤 재실행해도 두 기사는 다시 안 걸렸다). status가 "failed"면
    # seen을 안 찍어서 다음 회차에 다시 시도되게 한다.
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

    # 2) Sonnet 5 배치 채점 — fresh 전체(전체 탭 후보 제외한 나머지)
    scorable = [a for a in fresh if a["key"] not in selected_keys]
    guide = ddb_prompt.load_prompt("mustknow")
    scores = classify.score_articles(guide, scorable) if scorable else {}
    print(f"[mustknow-auto] 채점 완료 {len(scores)}/{len(scorable)}건")

    # 일반 임계값(7.0)이 전체 경로 중 가장 낮은 바닥 — "단, 증권/산업/시그널은
    # 예외"(2026-08-25). 이 세 카테고리는 바로 아래 3)에서 임계값 미달이어도
    # 그날 최고점 순으로 탭 정원(4건)을 채우는 근사치 폴백을 타므로, 여기서
    # 미리 seen 확정하면 그 폴백 후보 자체가 사라진다 — 탭 카테고리는
    # 건너뛰고, 그 외 카테고리만 기존대로 조기 확정한다.
    for a in scorable:
        if a["top_category"] in _TAB_CATEGORY.values():
            continue
        row = scores.get(a["key"])
        if row is not None and (row.get("total") or 0) < _GENERAL_THRESHOLD:
            _mark_seen(seen_table, a["key"], score=row.get("total"), reasoning=row.get("reasoning", "")[:200])

    # 3) 증권/산업/시그널 — 점수 있는 후보를 높은 점수 순으로 정렬해 탭당
    #    4건을 채운다(일요일엔 스킵 — 위 is_sunday 주석 참조).
    #
    # 2026-08-25 — 절대 임계값(_TAB_THRESHOLD) 미달이어도 그날 최선의
    # 근사치로 정원을 채우도록 바꿨다. "8.0 이상만" 고수했더니 파이프라인
    # 가동 3일간(249건 발행) 이 세 탭에 단 한 건도 배정되지 않은 게
    # 확인됐고(사용자 신고로 발견), 사용자 명시 지침 — "발행이 안되면
    # 안됩니다. 8.0 없으면 그 아래 점수로라도 근사치로라도 4개씩 올리도록
    # 해야합니다." — 에 따라 임계값을 "발행 여부"가 아니라 "정렬 우선순위"
    # 로만 쓴다. _TAB_THRESHOLD는 그 우선순위를 설명하는 참고값으로 남긴다
    # (오늘 실측 기준 6.5 이상이 나오면 그게 먼저 채워지고, 없으면 그보다
    # 낮은 점수라도 채워진다).
    if not is_sunday:
        for tab, cat in _TAB_CATEGORY.items():
            pool = [a for a in scorable if a["top_category"] == cat and scores.get(a["key"])]
            pool.sort(key=lambda a: scores[a["key"]].get("total") or 0, reverse=True)
            for a in pool:
                if tab_counts[tab] >= _TAB_CAP:
                    break
                row = scores[a["key"]]
                selected_keys.add(a["key"])
                status = _try_publish(a, tab, tab_counts[tab])
                if status != "failed":
                    _mark_seen(seen_table, a["key"], score=row.get("total"), reasoning=row.get("reasoning", "")[:200])
                tab_counts[tab] += 1

    # 4) 일반 — 위 4탭에 이미 뽑힌 기사만 제외, 나머지는 카테고리 무관하게
    #    7.0 넘으면 전부(캡 없음) — 증권/산업/시그널 중 탭 정원을 못 채운
    #    기사도 여기서 일반 카테고리로는 발행될 수 있다(정보 손실 방지).
    for a in scorable:
        if a["key"] in selected_keys:
            continue
        row = scores.get(a["key"])
        if not row or (row.get("total") or 0) < _GENERAL_THRESHOLD:
            continue
        selected_keys.add(a["key"])
        status = _try_publish(a, None, None)
        if status != "failed":
            _mark_seen(seen_table, a["key"], score=row.get("total"), reasoning=row.get("reasoning", "")[:200])
        tab_counts["일반"] += 1

    print(f"[mustknow-auto] 완료 — {json.dumps(results, ensure_ascii=False)} / 탭별 {json.dumps(tab_counts, ensure_ascii=False)}")

    # 2026-09-04 — frontpage_auto/run.py에는 있던 전량 실패 알람이 여기엔
    # 없었다(리팩토링 감사로 발견). 후보가 있었는데 발행 0건이면(예: discovery/
    # API 장애) 지금은 exit 0으로 끝나 CloudWatch가 "정상 종료"로 본다 —
    # 같은 방식으로 명시적 실패 코드를 반환해 알람이 걸리게 한다.
    if fresh and results["published"] == 0 and results["published_no_video"] == 0 and results["skipped_duplicate"] == 0:
        sys.exit(1)


def manual_backfill(source_ymd: str, target_ymd: str, tab: str, keys: list[str]):
    """2026-08-26 — 사용자 요청으로 신규. 자정을 넘겨 discovery의 "오늘" 후보
    풀에서 빠져버린 전날(source_ymd) 기사를, 그날 지면이 다음날(target_ymd)
    아침 지면으로 나가는 실제 신문 발행 관행에 맞춰 수동으로 지정한 순서
    그대로 발행한다(재채점·재정렬 없음 — 사용자가 이미 스코어 보고 순서를
    골랐음). main()의 정규 6x/day 스케줄 로직과는 완전히 분리된 일회성
    경로 — main()의 seen 필터·임계값 선정을 안 거친다."""
    session = boto3.Session(region_name=REGION)
    s3 = session.client("s3")
    table = session.resource("dynamodb").Table(TABLE)
    seen_table = session.resource("dynamodb").Table(SEEN_TABLE)
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
            status = _publish(article, out_dir, s3, table, target_ymd, paper_section=tab, display_order=i)
        except Exception:
            print(f"[mustknow-auto][manual] {key} 처리 중 예외\n{traceback.format_exc()}")
            continue
        if status != "failed":
            _mark_seen(seen_table, key, tab=tab, manual=True)
            published += 1
            # main()/_try_publish()와 같은 이유(2026-09-03) — 기사 하나가
            # 끝날 때마다 바로 무효화해서 나머지 기사 처리를 기다리는 동안
            # 캐시가 안 갱신되는 창을 없앤다.
            if revalidate_secret:
                publish_utils.notify_revalidate(revalidate_secret, log_prefix="mustknow-auto")

    print(f"[mustknow-auto][manual] 완료 — {published}/{len(keys)}건 {tab} 탭에 발행")


if __name__ == "__main__":
    if "--manual-signal-backfill" in sys.argv:
        # 뒤에 오는 인자를 그대로 발행 대상 key 목록으로 쓴다(순서=display_order).
        # 없으면 기본 4건 전체. hang 재현 시 1건씩 격리 재시도하려고 넣었다
        # (2026-08-26 — 4건 한 번에 돌리다 40분+ 정체돼 격리 필요해짐).
        idx = sys.argv.index("--manual-signal-backfill")
        keys = sys.argv[idx + 1:] or ["20082684", "20083221", "20083196", "20083080"]
        manual_backfill(source_ymd="20260825", target_ymd="20260826", tab="시그널", keys=keys)
    else:
        main()
