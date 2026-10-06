"""지면 1면 자동 발행 — EventBridge(매일 07:00 KST)가 깨우는 Fargate 태스크의 진입점.

흐름: discovery.fetch_front_page(오늘) -> 후보마다 letters/podcast/webtoon/video
4포맷 생성 -> S3 업로드 + lens-cms-api 발행(paper_section="전체") -> revalidate 웹훅.
기사 단위로 실패를 격리해 한 기사가 실패해도 나머지는 계속 처리한다.

영상 생성이 실패하면(validate_script()가 stat/chart 컷의 수치 누락을 에러로 막는다.
없는 통계를 지어내지 않기 위함) 해당 기사는 레터/웹툰/팟캐스트 3포맷만 발행하고
`needs_video: true`로 표시한다. 영상은 사후에 채운다.

멱등성: source_url로 기존 lens 글을 조회해 이미 발행된 기사는 스킵한다.
"""
import json
import sys
import traceback
from datetime import datetime, timedelta, timezone
from pathlib import Path

# Fargate 컨테이너의 시스템 시간대는 UTC이다. 07:00 KST(=전날 22:00 UTC)에
# 실행되므로 datetime.now()를 쓰면 "오늘"이 전날로 계산된다. 한국은 서머타임이 없어
# 고정 UTC+9 오프셋으로 충분하다.
KST = timezone(timedelta(hours=9))

_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(_ROOT / "common"))
sys.path.insert(0, str(_ROOT / "video"))

import boto3
# mustknow_auto/run.py와 공유하는 발행 헬퍼(4포맷 생성+업로드+발행 본체 포함).
import publish_utils
from config import AWS_REGION

discovery = publish_utils.load_module("frontpage_auto_discovery", _ROOT / "discovery" / "pipeline.py")
_letters_mod = publish_utils.load_module("frontpage_auto_letters", _ROOT / "letters" / "pipeline.py")
_podcast_mod = publish_utils.load_module("frontpage_auto_podcast", _ROOT / "podcast" / "pipeline.py")
_webtoon_mod = publish_utils.load_module("frontpage_auto_webtoon", _ROOT / "webtoon" / "pipeline.py")

REGION = AWS_REGION


def process_article(article: dict, out_dir: Path, s3, today_kst: str) -> str:
    """반환값: "published" | "published_no_video" | "skipped_duplicate" | "failed"

    4포맷 생성·업로드·발행은 publish_utils.publish_article()이 맡고,
    여기서는 source_url 유효성, 중복 확인, 이름 폴백만 처리한다."""
    source_url = article["url"]
    if not source_url:
        return "failed"
    if publish_utils.already_published(source_url):
        print(f"[frontpage-auto] 이미 발행됨, 스킵 — {article['title']}")
        return "skipped_duplicate"

    name = article["key"] or publish_utils.slugify("", article["title"])
    return publish_utils.publish_article(
        article, out_dir, s3, today_kst,
        name=name, source_url=source_url,
        paper_section="전체", display_order=article["_display_order"],
        log_prefix="frontpage-auto",
        letters_mod=_letters_mod, podcast_mod=_podcast_mod, webtoon_mod=_webtoon_mod,
    )


def main():
    session = boto3.Session(region_name=REGION)
    s3 = session.client("s3")
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
            status = process_article(article, out_dir, s3, today)
        except Exception:
            print(f"[frontpage-auto] {article['title']} 처리 중 예외 — 이 기사만 스킵하고 계속\n{traceback.format_exc()}")
            status = "failed"
        results[status] = results.get(status, 0) + 1
        # 기사 하나가 끝날 때마다 즉시 무효화한다. 후보 전체가 끝난 뒤 한 번만 부르면,
        # 뒤따르는 기사의 영상 생성(수 분)이 끝날 때까지 프런트 SSR 캐시(300s)가
        # 갱신되지 않아 이미 발행된 글이 "이슈를 찾을 수 없어요"로 보인다.
        if status in ("published", "published_no_video") and revalidate_secret:
            publish_utils.notify_revalidate(revalidate_secret, log_prefix="frontpage-auto")

    print(f"[frontpage-auto] 완료 — {json.dumps(results, ensure_ascii=False)}")

    # 후보가 있는데 성공·중복 스킵이 0건이면 실패 코드로 종료해 ECS 태스크 실패와
    # CloudWatch 알람으로 이어지게 한다.
    if candidates and results["published"] == 0 and results["published_no_video"] == 0 and results["skipped_duplicate"] == 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
