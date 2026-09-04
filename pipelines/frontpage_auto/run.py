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
import uuid
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
# 2026-09-04 — mustknow_auto/run.py와 공유하는 발행 헬퍼(리팩토링 감사로
# 추출, publish_utils.py 참조) — _load_module/_display_category/_slugify/
# _parse_letters/_parse_letter_summary_bullets/_already_published/
# _generate_video/_get_revalidate_secret/_notify_revalidate가 이 모듈로
# 이전됐다(둘 다 바이트 단위로 동일하던 것을 그대로 옮김).
import publish_utils
from config import AWS_REGION, CMS_POSTS_TABLE, CMS_MEDIA_BUCKET
from s3_utils import upload_media
from text_utils import strip_code_fence
from facts_extract import extract_facts  # 2026-09 — 0단계 공용 팩트시트

discovery = publish_utils.load_module("frontpage_auto_discovery", _ROOT / "discovery" / "pipeline.py")
_letters_mod = publish_utils.load_module("frontpage_auto_letters", _ROOT / "letters" / "pipeline.py")
_podcast_mod = publish_utils.load_module("frontpage_auto_podcast", _ROOT / "podcast" / "pipeline.py")
_webtoon_mod = publish_utils.load_module("frontpage_auto_webtoon", _ROOT / "webtoon" / "pipeline.py")

REGION = AWS_REGION
TABLE = CMS_POSTS_TABLE
BUCKET = CMS_MEDIA_BUCKET


# display_category/slugify/_upload(공용부만)/parse_letters/
# parse_letter_summary_bullets/already_published/generate_video →
# publish_utils.*로 이전(2026-09-04, mustknow_auto/run.py와 바이트 단위
# 동일 함수 공용화 — publish_utils.py 참조). _upload는 그대로 남김 —
# BUCKET을 캡처하는 로컬 래퍼라 이전 전에도 이미 얇았다.
def _upload(s3, local_path: Path, key: str) -> str:
    return upload_media(s3, local_path, key, BUCKET)


def process_article(article: dict, out_dir: Path, s3, table, today_kst: str) -> str:
    """반환값: "published" | "published_no_video" | "skipped_duplicate" | "failed" """
    source_url = article["url"]
    if not source_url:
        return "failed"
    if publish_utils.already_published(table, article["key"]):
        print(f"[frontpage-auto] 이미 발행됨, 스킵 — {article['title']}")
        return "skipped_duplicate"

    name = article["key"] or publish_utils.slugify("", article["title"])
    article_path = out_dir / f"{name}_article.txt"
    # 0단계 — 공용 팩트시트(기준일/핵심 숫자/용어/논지)를 원문 뒤에 이어붙여
    # 4포맷(레터/웹툰/팟캐스트/영상) 전부가 같은 파일을 읽는다. 각 포맷
    # pipeline.py는 안 건드려도 된다 — 프롬프트가 이미 "입력은 0단계에서
    # 만든 facts.json"이라고 전제하고 있었는데 실제로 이 단계가 없었다
    # (기자 피드백 "포맷마다 설명 범위와 필수 정보가 달라질 가능성"의 원인).
    # 실패해도 빈 문자열이라 원문만 쓰던 예전 동작으로 자연히 폴백.
    facts = extract_facts(article["content"])
    article_text = article["content"] + (f"\n\n---\n[공용 팩트시트]\n{facts}" if facts else "")
    article_path.write_text(article_text, encoding="utf-8")

    letters_path = _letters_mod.run_article(name, str(article_path), out_dir)
    letters_raw = letters_path.read_text(encoding="utf-8")
    paragraphs = publish_utils.parse_letters(letters_raw)
    letter_summary_bullets = publish_utils.parse_letter_summary_bullets(letters_raw)

    podcast_mp3 = _podcast_mod.run_article(name, str(article_path), out_dir)

    # 2026-09-04 — mustknow_auto/run.py의 2026-08-24 수정을 이식(리팩토링
    # 감사로 발견: 이 파일만 웹툰 실패 격리가 없었다). 웹툰은 영상과 달리
    # 폴백이 없어서, 이미지 생성이 실패하면(OpenAI 크레딧 소진 등) 이미
    # 성공한 레터·팟캐스트까지 통째로 버려지고 기사가 failed로 집계되는
    # 문제가 mustknow_auto에서 실제로 있었다 — 여기도 같은 코드 경로라
    # 잠재적으로 같은 장애를 겪을 수 있었다. 영상과 같은 방식으로 "웹툰
    # 없이 발행"까지는 살린다.
    webtoon_script: dict = {}
    webtoon_bullets, webtoon_images = [], []
    try:
        _webtoon_mod.run_article(name, str(article_path), out_dir)
        webtoon_script = json.loads((out_dir / name / "1_script.json").read_text(encoding="utf-8"))
        for cut in webtoon_script["cuts"]:
            caption = cut.get("narration") or (
                " ".join(f'{d["speaker"]}: {d["line"]}' for d in cut.get("dialogue", [])) if cut.get("dialogue") else ""
            ) or cut.get("caption", "")
            webtoon_bullets.append(caption)
            n = cut["cut"]
            cut_path = out_dir / name / f"컷{n}.png"
            key = f"media/frontpage-auto/{name}-webtoon-cut{n:03d}.png"
            webtoon_images.append({"url": _upload(s3, cut_path, key), "caption": caption})
    except Exception:
        # 부분 성공(예: 3컷까지만 업로드)도 버린다 — 중간에 끊긴 웹툰을
        # 내보내느니 웹툰 탭을 pending으로 두는 편이 낫다.
        webtoon_script, webtoon_bullets, webtoon_images = {}, [], []
        print(f"[frontpage-auto] {name} 웹툰 실패 — 웹툰 없이 발행\n{traceback.format_exc()}")

    podcast_url = _upload(s3, podcast_mp3, f"media/podcast/frontpage-auto/{name}-podcast.mp3")

    # 팟캐스트/영상 스크립트를 청각장애인 접근성용 텍스트로 같이 저장한다
    # (2026-08-23 — mustknow_auto/run.py와 같은 이유, 사용자 요청).
    podcast_script_path = out_dir / name / "대본.md"
    podcast_transcript = (
        strip_code_fence(podcast_script_path.read_text(encoding="utf-8"))
        if podcast_script_path.exists() else None
    ) or None

    video = publish_utils.generate_video(
        name, article_path, out_dir,
        photo_url=article.get("photo_url"), photo_caption=article.get("photo_caption"),
        log_prefix="frontpage-auto",
    )
    video_url = thumb_url = None
    video_transcript = None
    status = "published"
    if video:
        video_url = _upload(s3, video["mp4_path"], f"media/video/frontpage-auto/{name}-video.mp4")
        if video["thumb_path"]:
            thumb_url = _upload(s3, video["thumb_path"], f"media/video/frontpage-auto/{name}-thumb.jpg")
        video_script_path = out_dir / name / "script.json"
        if video_script_path.exists():
            video_script_data = json.loads(video_script_path.read_text(encoding="utf-8"))
            video_transcript = "\n\n".join(
                cut["narration"] for cut in video_script_data.get("cuts", []) if cut.get("narration")
            ) or None
    else:
        status = "published_no_video"

    lenses = [
        {"label": "레터", "question": article["title"], "bullets": letter_summary_bullets, "paragraphs": paragraphs,
         "images": [], "video_url": None, "media_url": None},
        {"label": "웹툰", "question": webtoon_script.get("core_question") or article["title"], "bullets": webtoon_bullets,
         "paragraphs": [], "images": webtoon_images, "video_url": None, "media_url": None,
         "pending": not webtoon_images},
        {"label": "팟캐스트", "question": article["title"], "bullets": [], "paragraphs": [],
         "images": [], "video_url": None, "media_url": podcast_url, "transcript": podcast_transcript},
        {"label": "영상", "question": article["title"], "bullets": [], "paragraphs": [],
         "images": [], "video_url": video_url, "media_url": None, "thumbnail_url": thumb_url,
         "pending": video_url is None, "transcript": video_transcript},
    ]

    publish_date_iso = f"{today_kst[:4]}-{today_kst[4:6]}-{today_kst[6:8]}"
    slug = publish_utils.slugify(publish_date_iso, article["title"])
    now = datetime.now(timezone.utc).isoformat()
    item = {
        "id": str(uuid.uuid4()),
        "slug": slug,
        "status": "published",
        "channels": ["lens"],
        # UTC 타임스탬프(now)가 아니라 지면 날짜(today_kst, discovery가 조회한
        # 바로 그 날짜)를 쓴다 — 위 KST 상수 도입 배경과 같은 이유.
        "publish_date": publish_date_iso,
        "editor_id": "AI LENS",
        "headline": article["title"],
        "subtitle": article["sub_title"],
        "closing_line": None,
        "body_inline": {
            "body": [], "key_points": [], "keywords": [], "images": [],
            "lenses": lenses,
            "photo_image_url": article["photo_url"],
            "category": publish_utils.display_category(article),
            "paper_section": "전체",
            "display_order": article["_display_order"],
            "needs_video": video is None,
        },
        "cover_image_url": webtoon_images[0]["url"] if webtoon_images else None,
        "source_url": source_url.split("?")[0],
        "media_embed_url": None,
        "display_order": None,
        "created_by": "frontpage-auto",
        "created_at": now,
        "updated_at": now,
        "published_at": now,
    }
    table.put_item(Item=item)

    # 2026-08-23 — mustknow_auto/run.py와 같은 이유·같은 패턴(사용자 지적:
    # 홈 "이슈를 웹툰으로" 카드가 렌즈 4유형 페이지로 가지 말고 웹툰 전용
    # 페이지로 가면 좋겠다 + "만화방"(/webtoon 목록)에 렌즈발 웹툰이
    # 안 올라온다). lens 글은 그대로 두고 웹툰 채널에도 독립 글을 하나 더
    # 쓴다 — 슬러그 충돌 방지로 "-webtoon" 접미사.
    if webtoon_images:
        webtoon_item = {
            "id": str(uuid.uuid4()),
            "slug": f"{slug}-webtoon",
            "status": "published",
            "channels": ["webtoon"],
            "publish_date": publish_date_iso,
            "editor_id": "AI LENS",
            "headline": webtoon_script.get("core_question") or article["title"],
            "subtitle": article["sub_title"],
            "closing_line": None,
            "body_inline": {"body": [], "key_points": [], "keywords": [], "images": webtoon_images},
            "cover_image_url": webtoon_images[0]["url"],
            "source_url": source_url.split("?")[0],
            "media_embed_url": None,
            "display_order": None,
            "created_by": "frontpage-auto",
            "created_at": now,
            "updated_at": now,
            "published_at": now,
        }
        table.put_item(Item=webtoon_item)

    # 2026-08-23, 같은 요청의 연장(mustknow_auto/run.py와 동일) — 영상은
    # video 채널, 팟캐스트는 home_player 채널(/listen이 보는 채널)에도
    # 독립 글을 하나 더 쓴다.
    if video_url:
        video_item = {
            "id": str(uuid.uuid4()),
            "slug": f"{slug}-video",
            "status": "published",
            "channels": ["video"],
            "publish_date": publish_date_iso,
            "editor_id": "AI LENS",
            "headline": lenses[3]["question"] or article["title"],
            "subtitle": article["sub_title"],
            "closing_line": None,
            "body_inline": {"body": [], "key_points": [], "keywords": [], "images": [], "video_url": video_url},
            "cover_image_url": thumb_url or article["photo_url"],
            "source_url": source_url.split("?")[0],
            "media_embed_url": None,
            "display_order": None,
            "created_by": "frontpage-auto",
            "created_at": now,
            "updated_at": now,
            "published_at": now,
        }
        table.put_item(Item=video_item)

    if podcast_url:
        podcast_item = {
            "id": str(uuid.uuid4()),
            "slug": f"{slug}-podcast",
            "status": "published",
            "channels": ["home_player"],
            "publish_date": publish_date_iso,
            "editor_id": "AI LENS",
            "headline": lenses[2]["question"] or article["title"],
            "subtitle": article["sub_title"],
            "closing_line": None,
            "body_inline": {"body": [], "key_points": [], "keywords": [], "images": [], "category": publish_utils.display_category(article), "transcript": podcast_transcript},
            "cover_image_url": article["photo_url"],
            "source_url": source_url.split("?")[0],
            "media_embed_url": podcast_url,
            "display_order": 0,
            "created_by": "frontpage-auto",
            "created_at": now,
            "updated_at": now,
            "published_at": now,
        }
        table.put_item(Item=podcast_item)

    print(f"[frontpage-auto] 발행 완료 — {slug} ({status})")
    return status


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
