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
import mimetypes
import re
import subprocess
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

import importlib.util

_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(_ROOT / "common"))
sys.path.insert(0, str(_ROOT / "video"))

import boto3
import requests


def _load_module(name: str, file_path: Path):
    """letters/podcast/webtoon 세 파이프라인이 전부 `pipeline.py`라는
    같은 파일명을 써서(각 폴더 안에서만 실행되는 걸 전제로 짜여 있음)
    `sys.path` 삽입 방식으로는 `sys.modules` 캐시가 충돌한다 — 파일
    경로로 직접 로드해 서로 다른 이름의 모듈로 구분한다. 자기 폴더 안의
    형제 모듈(webtoon/pipeline.py의 `import prompts`/`from stitch import
    stitch`)을 쓰는 경우도 있어서, 로드 전에 그 폴더 자체를 sys.path에
    넣어준다."""
    folder = str(file_path.parent)
    if folder not in sys.path:
        sys.path.insert(0, folder)
    spec = importlib.util.spec_from_file_location(name, file_path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


discovery = _load_module("frontpage_auto_discovery", _ROOT / "discovery" / "pipeline.py")
_letters_mod = _load_module("frontpage_auto_letters", _ROOT / "letters" / "pipeline.py")
_podcast_mod = _load_module("frontpage_auto_podcast", _ROOT / "podcast" / "pipeline.py")
_webtoon_mod = _load_module("frontpage_auto_webtoon", _ROOT / "webtoon" / "pipeline.py")

REGION = "us-east-1"
TABLE = "sedaily-mbti-cms-posts-dev"
BUCKET = "sedaily-mbti-cms-media-dev"
VIDEO_DIR = _ROOT / "video"

_NON_SLUG = re.compile(r"[^0-9A-Za-z가-힣]+")

_CATEGORY_MAP = {
    "증권": "증시",
    "부동산": "부동산",
    "산업": "산업",
    "금융": "금융·정책",
    "국제": "국제",
    "문화·라이프": "문화",
}


def _display_category(article: dict) -> str | None:
    """발행 시 body_inline.category에 넣을 사이트 카테고리 라벨.

    mustknow_auto/run.py의 같은 이름 함수와 동일한 이유(2026-08-23) —
    top_category는 XML의 첫 번째 category 태그만 보는데, 기사 하나가
    태그를 여러 개 다는 경우가 흔해 실제로는 증권/산업 기사인데도
    맨 앞 태그가 "경제"/"정치"라서 카테고리 없이 발행되는 버그가 있었다.
    전체 category 태그를 순서대로 훑어 사이트 6개 카테고리와 일치하는
    첫 값을 쓴다."""
    for c in article.get("categories") or [article.get("top_category", "")]:
        if c in _CATEGORY_MAP:
            return _CATEGORY_MAP[c]
    return None


def _slugify(publish_date: str, headline: str) -> str:
    tail = _NON_SLUG.sub("-", (headline or "").strip()).strip("-")
    base = f"{publish_date}-{tail}" if tail else publish_date
    return base[:80].rstrip("-")


def _upload(s3, local_path: Path, key: str) -> str:
    ctype = mimetypes.guess_type(str(local_path))[0] or "application/octet-stream"
    s3.upload_file(str(local_path), BUCKET, key, ExtraArgs={"ContentType": ctype})
    return f"https://{BUCKET}.s3.us-east-1.amazonaws.com/{key}"


def _parse_letters(raw_md: str) -> list[str]:
    """레터 파이프라인 산출물(마크다운)에서 본문 문단만 뽑는다 —
    create_kosdaq_post.py 등에서 반복됐던 파싱을 이쪽으로 승격."""
    body = re.sub(r"^```\w*\n|```$", "", raw_md.strip(), flags=re.MULTILINE).strip()
    lines = [l.strip() for l in body.split("\n") if l.strip()]
    paragraphs, buf, skipping = [], [], False

    def flush():
        if buf:
            t = " ".join(buf)
            if t:
                paragraphs.append(t)
        buf.clear()

    for line in lines:
        if line.startswith("[제목]"):
            skipping = True
            continue
        if line.startswith("[리드]"):
            skipping = False
            flush()
            continue
        if line.startswith("◾"):
            skipping = False
            flush()
            continue
        if line.startswith("자료:") or line == "—":
            skipping = False
            flush()
            continue
        if skipping:
            continue
        buf.append(line)
    flush()
    return paragraphs


def _already_published(table, article_key: str) -> bool:
    """source_url 완전일치가 아니라 `contains`로 본다 — 기존에 수동
    발행된 글들의 source_url엔 `?ref=sedailyEng` 같은 쿼리스트링이
    붙어있거나 아예 없는 경우(원문 텍스트만 붙여넣어 발행한 글)가 섞여
    있어서, 완전일치 비교로는 오늘(2026-08-21) 앞서 발행된 5건 중
    다수를 놓쳐 중복 발행할 뻔했다(실제 DB 조회로 확인 후 수정)."""
    if not article_key:
        return False
    resp = table.scan(
        FilterExpression="contains(source_url, :k)",
        ExpressionAttributeValues={":k": f"article/{article_key}"},
        ProjectionExpression="id",
    )
    return len(resp.get("Items", [])) > 0


def _generate_video(name: str, article_path: Path, out_dir: Path) -> dict | None:
    """성공하면 {"video_url": Path, "thumbnail_url": Path} 반환, 팩트 누락으로
    실패하면 None(그 기사는 영상 없이 3/4 포맷만 발행)."""
    from generate_script import generate_script  # pipelines/video/generate_script.py

    try:
        script_path = generate_script(name, str(article_path), output_root=out_dir)
    except ValueError as e:
        # validate_script()가 의도적으로 던지는 에러 — 팩트(수치) 누락,
        # 사람이 원문에서 채워야 함(§23).
        print(f"[frontpage-auto] {name} 영상 각본 생성 실패(사람 확인 필요) — {e}")
        return None
    except Exception:
        # 그 외(GPT API 오류, JSON 파싱 실패 등)도 영상만 포기하고 3/4
        # 포맷은 그대로 발행한다 — 한 포맷의 실패가 기사 전체를 막으면
        # 안 된다(AI LINK의 "기사 단위 격리" 원칙을 포맷 단위로도 적용).
        print(f"[frontpage-auto] {name} 영상 각본 생성 중 예상 못한 오류:\n{traceback.format_exc()}")
        return None

    mp4_path = out_dir / name / "video.mp4"
    try:
        result = subprocess.run(
            [
                "npm", "run", "render", "--",
                "--input", str(script_path.resolve()),
                "--format", "horizontal",
                "--output", str(mp4_path.resolve()),
            ],
            cwd=str(VIDEO_DIR),
            capture_output=True,
            text=True,
        )
    except OSError as e:
        print(f"[frontpage-auto] {name} 영상 렌더 실행 자체 실패(npm/ffmpeg 없음?) — {e}")
        return None
    if result.returncode != 0:
        print(f"[frontpage-auto] {name} 영상 렌더 실패:\n{result.stdout[-2000:]}\n{result.stderr[-2000:]}")
        return None

    thumb_path = out_dir / name / "thumb.jpg"
    subprocess.run(
        ["ffmpeg", "-y", "-ss", "2", "-i", str(mp4_path), "-frames:v", "1", str(thumb_path)],
        capture_output=True,
    )
    return {"mp4_path": mp4_path, "thumb_path": thumb_path if thumb_path.exists() else None}


def process_article(article: dict, out_dir: Path, s3, table, today_kst: str) -> str:
    """반환값: "published" | "published_no_video" | "skipped_duplicate" | "failed" """
    source_url = article["url"]
    if not source_url:
        return "failed"
    if _already_published(table, article["key"]):
        print(f"[frontpage-auto] 이미 발행됨, 스킵 — {article['title']}")
        return "skipped_duplicate"

    name = article["key"] or _slugify("", article["title"])
    article_path = out_dir / f"{name}_article.txt"
    article_path.write_text(article["content"], encoding="utf-8")

    letters_path = _letters_mod.run_article(name, str(article_path), out_dir)
    paragraphs = _parse_letters(letters_path.read_text(encoding="utf-8"))

    podcast_mp3 = _podcast_mod.run_article(name, str(article_path), out_dir)

    _webtoon_mod.run_article(name, str(article_path), out_dir)

    webtoon_script = json.loads((out_dir / name / "1_script.json").read_text(encoding="utf-8"))
    webtoon_bullets, webtoon_images = [], []
    for cut in webtoon_script["cuts"]:
        caption = cut.get("narration") or (
            " ".join(f'{d["speaker"]}: {d["line"]}' for d in cut.get("dialogue", [])) if cut.get("dialogue") else ""
        ) or cut.get("caption", "")
        webtoon_bullets.append(caption)
        n = cut["cut"]
        cut_path = out_dir / name / f"컷{n}.png"
        key = f"media/frontpage-auto/{name}-webtoon-cut{n:03d}.png"
        webtoon_images.append({"url": _upload(s3, cut_path, key), "caption": caption})

    podcast_url = _upload(s3, podcast_mp3, f"media/podcast/frontpage-auto/{name}-podcast.mp3")

    video = _generate_video(name, article_path, out_dir)
    video_url = thumb_url = None
    status = "published"
    if video:
        video_url = _upload(s3, video["mp4_path"], f"media/video/frontpage-auto/{name}-video.mp4")
        if video["thumb_path"]:
            thumb_url = _upload(s3, video["thumb_path"], f"media/video/frontpage-auto/{name}-thumb.jpg")
    else:
        status = "published_no_video"

    lenses = [
        {"label": "레터", "question": article["title"], "bullets": [], "paragraphs": paragraphs,
         "images": [], "video_url": None, "media_url": None},
        {"label": "웹툰", "question": webtoon_script.get("core_question") or article["title"], "bullets": webtoon_bullets,
         "paragraphs": [], "images": webtoon_images, "video_url": None, "media_url": None},
        {"label": "팟캐스트", "question": article["title"], "bullets": [], "paragraphs": [],
         "images": [], "video_url": None, "media_url": podcast_url},
        {"label": "영상", "question": article["title"], "bullets": [], "paragraphs": [],
         "images": [], "video_url": video_url, "media_url": None, "thumbnail_url": thumb_url,
         "pending": video_url is None},
    ]

    publish_date_iso = f"{today_kst[:4]}-{today_kst[4:6]}-{today_kst[6:8]}"
    slug = _slugify(publish_date_iso, article["title"])
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
            "category": _display_category(article),
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
    print(f"[frontpage-auto] 발행 완료 — {slug} ({status})")
    return status


def main():
    session = boto3.Session(region_name=REGION)
    s3 = session.client("s3")
    table = session.resource("dynamodb").Table(TABLE)

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

    print(f"[frontpage-auto] 완료 — {json.dumps(results, ensure_ascii=False)}")

    if results["published"] or results["published_no_video"]:
        try:
            secret = session.client("ssm").get_parameter(
                Name="/sedaily-mbti/ssr-revalidate-secret", WithDecryption=True
            )["Parameter"]["Value"]
            requests.post(
                "https://ailens.sedaily.ai/api/revalidate",
                headers={"Content-Type": "application/json", "X-Revalidate-Secret": secret},
                json={},
                timeout=30,
            )
        except Exception:
            print(f"[frontpage-auto] revalidate 웹훅 실패(콘텐츠는 이미 발행됨):\n{traceback.format_exc()}")

    # 전량 실패(0건 성공 + 후보 있었음)면 명시적으로 실패 코드 반환 —
    # ECS 태스크 실패로 잡혀서 CloudWatch 알람이 걸리도록.
    if candidates and results["published"] == 0 and results["published_no_video"] == 0 and results["skipped_duplicate"] == 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
