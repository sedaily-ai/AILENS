"""지면 1면 완전 자동 발행 — EventBridge(매일 아침)가 깨우는 Fargate
태스크의 진입점.

흐름: discovery.fetch_front_page(오늘) → 후보마다 letters/podcast/
webtoon/video 4포맷 생성 → S3 업로드 + DDB write(paper_section="전체")
→ revalidate 웹훅. 기사 단위로 실패를 격리한다(한 기사가 실패해도 나머지는
계속) — AI LINK(ai_link/globe/dev)의 "기사 단위 격리는 의도된 기능"
원칙을 그대로 따름(2026-08-21 리서치 후 결정).

**영상만 예외 처리한다**: `video/generate_script.py`의 `validate_script()`는
`stat`/`chart` 컷에 실제 수치가 빠지면 일부러 에러를 낸다(팩트를
지어내지 않기 위해, §23 참조) — 이 경로를 억지로 자동화하면 없는
통계를 만들어낼 위험이 있어서, 영상 생성이 실패하면 그 기사는 **레터/
웹툰/팟캐스트 3포맷만 우선 발행**하고 `needs_video: true`로 표시한다.
사람이 나중에 영상만 채워 넣으면 된다(admin에서 lens 글 수정 — 아직
그 화면 자체는 없어서 당장은 DDB 직접 update로 처리).

**중복 방지(idempotent)**: 매일 실행되므로 재실행돼도 같은 기사를
다시 발행하지 않아야 한다 — `source_url`로 기존 lens 글을 조회해서
이미 있으면 스킵.
"""
import json
import sys
import traceback
from datetime import datetime, timedelta, timezone
from pathlib import Path

# 2026-08-22 실사용 첫 자동 실행에서 발견된 버그 — Fargate 컨테이너는 시스템
# 시간대가 UTC라, `datetime.now()`가 "오늘"을 UTC 기준으로 계산했다.
# EventBridge는 07:00 KST(=22:00 UTC 전날)에 트리거되므로, 이 시각의 UTC
# 날짜는 아직 전날 — "오늘 지면 1면"을 어제 걸로 잘못 조회해 이미 발행된
# 5건만 다시 확인하고 아무것도 안 했다(로그상 정상 종료라 겉보기엔
# 성공처럼 보여서 더 위험했다). 대한민국은 서머타임이 없어 고정
# UTC+9 오프셋이면 충분 — zoneinfo(IANA tzdata) 의존성 없이 안전하게 처리.
KST = timezone(timedelta(hours=9))

_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(_ROOT / "common"))
sys.path.insert(0, str(_ROOT / "video"))

import boto3
# 2026-09-04·2026-09-05 — mustknow_auto/run.py와 공유하는 발행 헬퍼
# (리팩토링 감사로 추출, publish_utils.py 참조) — _load_module/
# _display_category/_slugify/_parse_letters/_parse_letter_summary_bullets/
# _already_published/_generate_video/_get_revalidate_secret/
# _notify_revalidate에 더해, 두 파일의 process_article()/_publish() 본체
# (4포맷 생성+업로드+DDB write, 바이트 단위로 동일했음)까지
# publish_utils.publish_article()로 이전됐다.
import publish_utils
from config import AWS_REGION, CMS_POSTS_TABLE

discovery = publish_utils.load_module("frontpage_auto_discovery", _ROOT / "discovery" / "pipeline.py")
_letters_mod = publish_utils.load_module("frontpage_auto_letters", _ROOT / "letters" / "pipeline.py")
_podcast_mod = publish_utils.load_module("frontpage_auto_podcast", _ROOT / "podcast" / "pipeline.py")
_webtoon_mod = publish_utils.load_module("frontpage_auto_webtoon", _ROOT / "webtoon" / "pipeline.py")

REGION = AWS_REGION
TABLE = CMS_POSTS_TABLE


def process_article(article: dict, out_dir: Path, s3, table, today_kst: str) -> str:
    """반환값: "published" | "published_no_video" | "skipped_duplicate" | "failed"

    2026-09-05 — 4포맷 생성+업로드+DDB write 본체는 mustknow_auto/run.py의
    `_publish()`와 바이트 단위로 동일했던 걸 `publish_utils.publish_article()`
    로 공용화했다(P3 리팩토링 감사 — 2026-09-04 P1에서 코드블록 추출 등
    작은 헬퍼 9개는 공용화했지만 정작 이 부분은 안 건드렸었다). 여기 남는
    건 이 파일 고유의 판단(source_url 유효성, 중복확인, 이름 폴백)뿐."""
    source_url = article["url"]
    if not source_url:
        return "failed"
    if publish_utils.already_published(table, article["key"]):
        print(f"[frontpage-auto] 이미 발행됨, 스킵 — {article['title']}")
        return "skipped_duplicate"

    name = article["key"] or publish_utils.slugify("", article["title"])
    return publish_utils.publish_article(
        article, out_dir, s3, table, today_kst,
        name=name, source_url=source_url,
        paper_section="전체", display_order=article["_display_order"],
        log_prefix="frontpage-auto",
        letters_mod=_letters_mod, podcast_mod=_podcast_mod, webtoon_mod=_webtoon_mod,
    )


# _get_revalidate_secret/_notify_revalidate → publish_utils.get_revalidate_secret()/
# notify_revalidate(log_prefix="frontpage-auto")로 이전(2026-09-04).


def main():
    session = boto3.Session(region_name=REGION)
    s3 = session.client("s3")
    table = session.resource("dynamodb").Table(TABLE)
    revalidate_secret = publish_utils.get_revalidate_secret(session, log_prefix="frontpage-auto")

    today = datetime.now(KST).strftime("%Y%m%d")
    candidates = discovery.fetch_front_page(today)
    print(f"[frontpage-auto] 오늘({today}) 1면 후보 {len(candidates)}건")

    out_dir = Path("/tmp/frontpage_auto_out")
    out_dir.mkdir(parents=True, exist_ok=True)

    results = {"published": 0, "published_no_video": 0, "skipped_duplicate": 0, "failed": 0}
    for i, article in enumerate(candidates):
        article["_display_order"] = i
        try:
            status = process_article(article, out_dir, s3, table, today)
        except Exception:
            print(f"[frontpage-auto] {article['title']} 처리 중 예외 — 이 기사만 스킵하고 계속\n{traceback.format_exc()}")
            status = "failed"
        results[status] = results.get(status, 0) + 1
        # 2026-09-03 — 예전엔 이 웹훅을 후보 전체 루프가 끝난 뒤 한 번만
        # 불렀다. 뒤에 남은 후보의 영상 생성(수 분 소요)이 안 끝나면 이미
        # DDB엔 써진 앞선 기사도 그동안 프런트 SSR 캐시(revalidate: 300s)가
        # 안 갱신돼 "이슈를 찾을 수 없어요"로 뜨는 걸 사용자가 실제로
        # 클릭해보고 신고해서 발견(홈 "오늘의 이슈, 4가지 시선" 형식 타일
        # 클릭이 "안 넘어간다"고 느껴짐 — 실제로는 링크는 타는데 목적지
        # 페이지가 아직 캐시된 옛 목록이라 그 글을 못 찾은 것). 기사 하나가
        # 끝날 때마다 바로 무효화하면 이 창을 없앨 수 있다.
        if status in ("published", "published_no_video") and revalidate_secret:
            publish_utils.notify_revalidate(revalidate_secret, log_prefix="frontpage-auto")

    print(f"[frontpage-auto] 완료 — {json.dumps(results, ensure_ascii=False)}")

    # 전량 실패(0건 성공 + 후보 있었음)면 명시적으로 실패 코드 반환 —
    # ECS 태스크 실패로 잡혀서 CloudWatch 알람이 걸리도록.
    if candidates and results["published"] == 0 and results["published_no_video"] == 0 and results["skipped_duplicate"] == 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
