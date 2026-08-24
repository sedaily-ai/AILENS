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
결정 안 됐다(2026-08-22 설계 노트의 "이슈 B") — 그래서 frontpage_auto는
건드리지 않고, 대신 이 파이프라인이 발행 직전 `_already_published_elsewhere()`
로 frontpage_auto가 이미 발행한 기사인지 한 번 더 확인해 중복 발행을
막는다. `_publish()`·`_generate_video()`·`_upload()` 등은 frontpage_auto/
run.py에서 그대로 복사해왔다(import 아님 — frontpage_auto는 스크립트라
import 시 부작용이 있고, 프로덕션 코드를 이번 작업으로 건드리는 리스크도
피하기 위함). 두 파이프라인의 공용화는 "이슈 B" 결정 이후 별도 작업.

**영상 예외 처리**·**팩트 원칙**은 frontpage_auto와 동일(§23) — video
각본 생성이 실패하면 그 기사는 3/4 포맷만 발행하고 `needs_video: true`로
표시한다.
"""
import difflib
import json
import mimetypes
import re
from decimal import Decimal
import subprocess
import sys
import traceback
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

KST = timezone(timedelta(hours=9))

import importlib.util

_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(_ROOT / "common"))
sys.path.insert(0, str(_ROOT / "video"))
sys.path.insert(0, str(Path(__file__).parent))

import boto3
import requests

import ddb_prompt
import classify
from config import AWS_REGION, CMS_POSTS_TABLE, CMS_MEDIA_BUCKET
from s3_utils import upload_media
from text_utils import extract_fact_ids, strip_code_fence


def _load_module(name: str, file_path: Path):
    """frontpage_auto/run.py와 동일한 이유로 동일하게 필요 — letters/podcast/
    webtoon이 전부 `pipeline.py`라는 같은 파일명을 쓴다."""
    folder = str(file_path.parent)
    if folder not in sys.path:
        sys.path.insert(0, folder)
    spec = importlib.util.spec_from_file_location(name, file_path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


discovery = _load_module("mustknow_auto_discovery", _ROOT / "discovery" / "pipeline.py")
_letters_mod = _load_module("mustknow_auto_letters", _ROOT / "letters" / "pipeline.py")
_podcast_mod = _load_module("mustknow_auto_podcast", _ROOT / "podcast" / "pipeline.py")
_webtoon_mod = _load_module("mustknow_auto_webtoon", _ROOT / "webtoon" / "pipeline.py")

REGION = AWS_REGION
TABLE = CMS_POSTS_TABLE
BUCKET = CMS_MEDIA_BUCKET
SEEN_TABLE = "sedaily-lens-mustknow-seen-dev"
VIDEO_DIR = _ROOT / "video"

_NON_SLUG = re.compile(r"[^0-9A-Za-z가-힣]+")
_BRACKET_RE = re.compile(r"\[[^\]]*\]")

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

    2026-08-23 — 기존엔 `_CATEGORY_MAP.get(article["top_category"])`만
    썼는데, top_category는 XML에서 그 기사의 **첫 번째** category 태그만
    본다(discovery/pipeline.py). 기사 하나가 category 태그를 여러 개
    달고 있는 경우가 흔해서(예: 삼성전자 주주환원 기사가 "경제,사회,
    금융,증권,산업,국제" 6개를 동시에 달았는데 top_category는 그중
    맨 앞의 "경제"만 봄), 실제로는 증권/산업 기사인데도 카테고리 없이
    발행되는 버그가 있었다(사용자가 /archive에서 "4가지 시선"이라는
    가짜 카테고리로 뜨는 걸 발견). 그 기사의 전체 category 태그
    (`article["categories"]`)를 순서대로 훑어 사이트 6개 카테고리 중
    하나와 일치하는 첫 값을 쓴다 — top_category 자체는 지면특별코너
    4탭 선정(증권/산업/시그널 매칭)에 이미 검증된 채 쓰이고 있어 그대로
    둔다. 정치·사회·오피니언처럼 애초에 경제 카테고리 태그가 전혀
    없는 기사는 이 함수도 None을 돌려준다 — 사이트에 대응 카테고리
    페이지가 없는 게 맞기 때문에 억지로 하나 붙이지 않는다."""
    for c in article.get("categories") or [article.get("top_category", "")]:
        if c in _CATEGORY_MAP:
            return _CATEGORY_MAP[c]
    return None


# 지면특별코너 4탭 — 전체(지면1면)는 점수 없이 TOP 배치 우선(discovery가
# 이미 편집 데이터로 정렬해서 줌). 증권/산업/시그널은 8.0 넘는 순서대로
# 먼저 온 것부터 채운다(재순위 없음 — 라이브 콘텐츠를 나중에 더 좋은
# 기사로 대체하지 않는다는 v1 결정, 2026-08-22 설계 노트 "이슈 A" 해소).
_TAB_CATEGORY = {"증권": "증권", "산업": "산업", "시그널": "Signal"}
_TAB_THRESHOLD = 8.0
_GENERAL_THRESHOLD = 7.0
_TAB_CAP = 4
_MIN_CONTENT_LEN = 300
_DUP_TITLE_RATIO = 0.72


def _slugify(publish_date: str, headline: str) -> str:
    tail = _NON_SLUG.sub("-", (headline or "").strip()).strip("-")
    base = f"{publish_date}-{tail}" if tail else publish_date
    return base[:80].rstrip("-")


def _upload(s3, local_path: Path, key: str) -> str:
    # common/s3_utils.py로 공용화(frontpage_auto/run.py와 바이트 단위로
    # 동일했음, 2026-08-23).
    return upload_media(s3, local_path, key, BUCKET)


def _parse_letters(raw_md: str) -> list[str]:
    """frontpage_auto/run.py의 동명 함수와 동일 — 레터 산출물(마크다운)에서
    본문 문단만 뽑는다."""
    # 2026-08-24 — FACT_IDS 트레일러를 먼저 떼어낸다. 이 함수엔 본문 종료
    # 조건이 없어서(자료: 뒤로도 계속 buf 에 쌓는다) 안 떼면 커버리지 줄이
    # 그대로 발행 본문 문단이 된다.
    raw_md, _ = extract_fact_ids(raw_md)
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


def _already_published_elsewhere(table, article_key: str) -> bool:
    """frontpage_auto/run.py의 _already_published()와 동일한 쿼리 — 그
    파이프라인이 이미 발행한 기사(지면1면)와 겹치지 않는지 확인하는
    유일한 수단이다(신규 seen 테이블엔 frontpage_auto의 발행 기록이
    안 남으므로). source_url 완전일치가 아니라 contains로 본다 —
    쿼리스트링·수동발행 케이스 때문에 완전일치는 놓친다(frontpage_auto
    에서 실제로 겪은 문제, 그대로 승계)."""
    if not article_key:
        return False
    resp = table.scan(
        FilterExpression="contains(source_url, :k)",
        ExpressionAttributeValues={":k": f"article/{article_key}"},
        ProjectionExpression="id",
    )
    return len(resp.get("Items", [])) > 0


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


def _generate_video(name: str, article_path: Path, out_dir: Path) -> dict | None:
    """frontpage_auto/run.py의 동명 함수와 동일 — 성공하면
    {"mp4_path": Path, "thumb_path": Path|None} 반환, 팩트 누락으로 실패하면
    None(그 기사는 영상 없이 3/4 포맷만 발행)."""
    from generate_script import generate_script  # pipelines/video/generate_script.py

    try:
        script_path = generate_script(name, str(article_path), output_root=out_dir)
    except ValueError as e:
        print(f"[mustknow-auto] {name} 영상 각본 생성 실패(사람 확인 필요) — {e}")
        return None
    except Exception:
        print(f"[mustknow-auto] {name} 영상 각본 생성 중 예상 못한 오류:\n{traceback.format_exc()}")
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
        print(f"[mustknow-auto] {name} 영상 렌더 실행 자체 실패(npm/ffmpeg 없음?) — {e}")
        return None
    if result.returncode != 0:
        print(f"[mustknow-auto] {name} 영상 렌더 실패:\n{result.stdout[-2000:]}\n{result.stderr[-2000:]}")
        return None

    thumb_path = out_dir / name / "thumb.jpg"
    subprocess.run(
        ["ffmpeg", "-y", "-ss", "2", "-i", str(mp4_path), "-frames:v", "1", str(thumb_path)],
        capture_output=True,
    )
    return {"mp4_path": mp4_path, "thumb_path": thumb_path if thumb_path.exists() else None}


def _publish(
    article: dict,
    out_dir: Path,
    s3,
    table,
    today_kst: str,
    *,
    paper_section: str | None,
    display_order: int | None,
) -> str:
    """반환값: "published" | "published_no_video" | "failed"
    frontpage_auto/run.py의 process_article() 중 4포맷 생성+업로드+DDB
    write 부분만 그대로 가져왔다 — 발행 여부 판단(중복확인·임계값)은
    호출부(main)의 책임이라 여기선 안 한다."""
    name = article["key"]
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
        key = f"media/mustknow-auto/{name}-webtoon-cut{n:03d}.png"
        webtoon_images.append({"url": _upload(s3, cut_path, key), "caption": caption})

    podcast_url = _upload(s3, podcast_mp3, f"media/podcast/mustknow-auto/{name}-podcast.mp3")

    # 팟캐스트/영상 스크립트를 청각장애인 접근성용 텍스트로 같이 저장한다
    # (2026-08-23, 사용자 요청 — "청각장애인 분들을 위해서 본문도 넣어두면
    # 좋을듯", 타임스탬프 동기화 없이 그냥 전체 텍스트만). 팟캐스트는
    # podcast/pipeline.py가 저장해둔 대본.md를 그대로 읽는다(TTS 입력과
    # 달리 코드펜스가 안 벗겨진 원본이라 여기서 한 번 더 벗긴다). 영상은
    # generate_script.py가 저장한 script.json의 컷별 narration을 이어붙인다.
    podcast_script_path = out_dir / name / "대본.md"
    podcast_transcript = (
        strip_code_fence(podcast_script_path.read_text(encoding="utf-8"))
        if podcast_script_path.exists() else None
    ) or None

    video = _generate_video(name, article_path, out_dir)
    video_url = thumb_url = None
    video_transcript = None
    status = "published"
    if video:
        video_url = _upload(s3, video["mp4_path"], f"media/video/mustknow-auto/{name}-video.mp4")
        if video["thumb_path"]:
            thumb_url = _upload(s3, video["thumb_path"], f"media/video/mustknow-auto/{name}-thumb.jpg")
        video_script_path = out_dir / name / "script.json"
        if video_script_path.exists():
            video_script_data = json.loads(video_script_path.read_text(encoding="utf-8"))
            video_transcript = "\n\n".join(
                cut["narration"] for cut in video_script_data.get("cuts", []) if cut.get("narration")
            ) or None
    else:
        status = "published_no_video"

    lenses = [
        {"label": "레터", "question": article["title"], "bullets": [], "paragraphs": paragraphs,
         "images": [], "video_url": None, "media_url": None},
        {"label": "웹툰", "question": webtoon_script.get("core_question") or article["title"], "bullets": webtoon_bullets,
         "paragraphs": [], "images": webtoon_images, "video_url": None, "media_url": None},
        {"label": "팟캐스트", "question": article["title"], "bullets": [], "paragraphs": [],
         "images": [], "video_url": None, "media_url": podcast_url, "transcript": podcast_transcript},
        {"label": "영상", "question": article["title"], "bullets": [], "paragraphs": [],
         "images": [], "video_url": video_url, "media_url": None, "thumbnail_url": thumb_url,
         "pending": video_url is None, "transcript": video_transcript},
    ]

    publish_date_iso = f"{today_kst[:4]}-{today_kst[4:6]}-{today_kst[6:8]}"
    slug = _slugify(publish_date_iso, article["title"])
    now = datetime.now(timezone.utc).isoformat()
    item = {
        "id": str(uuid.uuid4()),
        "slug": slug,
        "status": "published",
        "channels": ["lens"],
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
            "paper_section": paper_section,
            "display_order": display_order,
            "needs_video": video is None,
        },
        "cover_image_url": webtoon_images[0]["url"] if webtoon_images else None,
        "source_url": (article["url"] or "").split("?")[0],
        "media_embed_url": None,
        "display_order": None,
        "created_by": "mustknow-auto",
        "created_at": now,
        "updated_at": now,
        "published_at": now,
    }
    table.put_item(Item=item)

    # 2026-08-23, 사용자 지적 — 홈 "이슈를 웹툰으로" 카드를 누르면 렌즈(4유형)
    # 페이지로 가는데, 웹툰만 보는 전용 페이지(/webtoon/[slug], 다크 테마
    # 세로스크롤 뷰어)로 가면 좋겠다고 함. 그리고 "만화방"(/webtoon 목록)에도
    # 렌즈로 발행된 웹툰이 안 올라온다고 지적 — 지금까지는 웹툰 컷이 lens
    # 글의 body_inline.lenses[1] 안에만 있어서 channel=webtoon 목록 쿼리에
    # 안 잡혔다. lens 글은 그대로 두고(4유형 페이지는 계속 필요), 웹툰
    # 채널에도 독립된 글을 하나 더 써서 두 화면 모두에서 보이게 한다 —
    # 슬러그는 충돌 방지로 "-webtoon" 접미사(slug는 GSI로 유일해야 함,
    # cms_posts_ddb_client.py get_published_post_by_slug 참조).
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
            "source_url": (article["url"] or "").split("?")[0],
            "media_embed_url": None,
            "display_order": None,
            "created_by": "mustknow-auto",
            "created_at": now,
            "updated_at": now,
            "published_at": now,
        }
        table.put_item(Item=webtoon_item)

    # 2026-08-23, 같은 요청의 연장 — 사용자: "영상 부분에 대한 탭도 그렇게
    # 해야 하고, 오디오 부분도 마찬가지, 오디오는 팟캐스트 부분 가져오라는
    # 것" — 웹툰과 같은 이유로 영상은 video 채널, 팟캐스트는 home_player
    # 채널(/listen이 보는 채널)에도 독립 글을 하나 더 쓴다.
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
            "source_url": (article["url"] or "").split("?")[0],
            "media_embed_url": None,
            "display_order": None,
            "created_by": "mustknow-auto",
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
            "body_inline": {"body": [], "key_points": [], "keywords": [], "images": [], "category": _display_category(article), "transcript": podcast_transcript},
            "cover_image_url": article["photo_url"],
            "source_url": (article["url"] or "").split("?")[0],
            "media_embed_url": podcast_url,
            "display_order": 0,
            "created_by": "mustknow-auto",
            "created_at": now,
            "updated_at": now,
            "published_at": now,
        }
        table.put_item(Item=podcast_item)

    print(f"[mustknow-auto] 발행 완료 — {slug} (section={paper_section}, {status})")
    return status


def main():
    session = boto3.Session(region_name=REGION)
    s3 = session.client("s3")
    table = session.resource("dynamodb").Table(TABLE)
    seen_table = session.resource("dynamodb").Table(SEEN_TABLE)

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

    results = {"published": 0, "published_no_video": 0, "failed": 0, "skipped_duplicate": 0}
    selected_keys: set[str] = set()
    tab_counts = {"전체": 0, "증권": 0, "산업": 0, "시그널": 0, "일반": 0}

    def _try_publish(article, paper_section, display_order):
        """반환값을 호출부가 반드시 확인해야 한다 — "failed"면 seen을
        마킹하면 안 된다(아래 버그 설명 참조)."""
        if _already_published_elsewhere(table, article["key"]):
            print(f"[mustknow-auto] frontpage_auto 등에 이미 발행됨, 스킵 — {article['title']}")
            results["skipped_duplicate"] += 1
            return "skipped_duplicate"
        try:
            status = _publish(article, out_dir, s3, table, today, paper_section=paper_section, display_order=display_order)
        except Exception:
            print(f"[mustknow-auto] {article['title']} 처리 중 예외 — 이 기사만 스킵\n{traceback.format_exc()}")
            status = "failed"
        results[status] = results.get(status, 0) + 1
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

    # 일반 임계값(7.0)이 전체 경로 중 가장 낮은 바다 — 이걸 못 넘으면
    # 증권/산업/시그널(8.0)도 당연히 못 넘으므로 그 어떤 경로로도 발행될
    # 일이 없다. 이런 기사만 지금 바로 확정으로 seen 기록한다(재시도해도
    # 결과가 똑같이 나올 게 뻔하니 낭비 방지). ≥7.0인 기사는 아직 발행
    # 시도 전이라 여기서 마킹하지 않는다 — 아래 3)/4)에서 실제 시도 후에
    # 마킹된다. 파싱 실패로 scores에 아예 없는 기사도 마찬가지로 여기서
    # 마킹 안 함(다음 회차 재시도 대상).
    for a in scorable:
        row = scores.get(a["key"])
        if row is not None and (row.get("total") or 0) < _GENERAL_THRESHOLD:
            _mark_seen(seen_table, a["key"], score=row.get("total"), reasoning=row.get("reasoning", "")[:200])

    # 3) 증권/산업/시그널 — 8.0 넘는 순서대로 먼저 온 것부터, 탭당 4건
    #    (일요일엔 스킵 — 위 is_sunday 주석 참조)
    if not is_sunday:
        for tab, cat in _TAB_CATEGORY.items():
            pool = [a for a in scorable if a["top_category"] == cat]
            for a in pool:
                if tab_counts[tab] >= _TAB_CAP:
                    break
                row = scores.get(a["key"])
                if not row or (row.get("total") or 0) < _TAB_THRESHOLD:
                    continue
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
            print(f"[mustknow-auto] revalidate 웹훅 실패(콘텐츠는 이미 발행됨):\n{traceback.format_exc()}")


if __name__ == "__main__":
    main()
