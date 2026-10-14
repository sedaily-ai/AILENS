"""영상 다시 만들기 — 발행된 lens 글 하나의 영상만 사람이 프롬프트로 다시 만들어 교체한다.

메인 자동 발행(pipelines/)은 영상 프롬프트 `video/published`를 그대로 쓰고, 이 기능은 별도 프롬프트
`video-remake/published`를 쓴다 — 여기서 프롬프트를 아무리 고쳐도 자동 발행에는 영향이 없다.

흐름(모두 chat_ws.py의 WebSocket 비동기 작업으로 돈다):
1. remake_load   — 글 → 원문(lens-cms-api 기사 조회)·원문 사진·지금 영상·수작업 프롬프트를 돌려준다.
2. remake_script — 수작업 프롬프트 + 원문으로 각본을 스트리밍 생성한다(영상 탭과 같은 모델).
3. 렌더          — 기존 render_video 경로를 그대로 쓴다(원문 사진만 더 넘김, chat_ws._run_render_video_flow).
4. remake_apply  — 렌더 결과(mp4·썸네일)와 나레이션 대본으로 그 글의 영상 슬라이스만 갱신한다.
   lens-cms-api의 채널 단위 저장(?channel=video)이라 레터·웹툰·팟캐스트와 나머지 필드는 그대로다.
"""
from __future__ import annotations

import json
import logging
import re
import urllib.error
import urllib.request
from typing import Callable

from json_extract import extract_json_object  # pipelines/common/ — 배포 시 zip 루트에 복사됨
from repo import posts_repo, prompts_repo
from routes import video_lab
from routes.webtoon import jobs as webtoon_jobs
from shared import audit, lens_cms_client, notify

logger = logging.getLogger(__name__)

Push = Callable[[dict], bool]

REMAKE_CATEGORY = "video-remake"
REMAKE_NAME = "published"
_ARTICLE_NO_RE = re.compile(r"/article/(\d+)")
_MAX_ARTICLE_CHARS = 12000  # chat_ws._run_article_text_flow와 같은 상한

# 수작업 프롬프트가 아직 저장되지 않았을 때 메인 영상 프롬프트 뒤에 붙여 쓰는 디자인 지정 안내.
# 렌더 프로그램이 읽는 항목(pipelines/video/src/lib/schema.ts의 design·style)과 반드시 같이 고친다.
DESIGN_GUIDE = """

---

## 수작업 다시 만들기 — 디자인 지정 (선택)

렌더용 JSON에 아래 항목을 더 쓰면 디자인을 바꿀 수 있다. 쓰지 않은 항목은 기본값으로 그린다.
목록에 없는 값은 무시된다. 작은 글에도 기사에 없는 사실·숫자는 쓰지 않는다.

### 영상 전체 — 최상위 "design"
- "theme": "default"(지금 디자인) | "paper"(종이 질감, 가로형 1920×1080)
- "paper": 첫 장면 종이 — "cream" | "newsprint" | "kraft" | "black" | "spot"(강조색 종이)
- "spot": 강조색 — "red" | "orange" | "teal" | "blue" | "yellow"
- "endCard": 끝 카드(3초) 표시 여부 — true | false

### 컷마다 — "style" (layout·paper·transition·emStyle·작은 글은 종이 질감에서만 화면에 반영)
- "layout": 이 컷을 그릴 화면
  - "newsFront" 신문 1면 / "stampNumber" 도장 숫자 / "stampDoc" 도장 찍힌 문서 / "headline" 오려 붙인 헤드라인
  - "board" 메모 보드(diagram 전용) / "timeline" 줄에 걸린 카드(diagram 전용)
  - "bars" 찢은 종이 막대(chart·rank 전용) / "beforeAfter" 전후 비교(compare 전용) / "photo" 기사 사진(photo 전용)
- "paper": 이 컷의 종이(위와 같은 값), "transition": 들어오는 전환 — "cover" | "tear" | "flip" | "stampCut" | "zoom"
- "emStyle": 강조어 표시 — "stamp"(도장) | "marker"(형광펜)
- "kicker": 큰 숫자 위 한 줄 / 문서 제목 / 신문 1면 헤드라인
- "sub": 헤드라인 아래 작은 글, "note": 테이프 위 손글씨, "tag": 손글씨 감탄 메모(10자 이내), "stamp": 문서에 찍을 도장 글자
- "holdSeconds": 나레이션이 끝난 뒤 화면을 더 보여 줄 시간(0~5초, 기본·종이 테마 모두 반영)

### diagram 노드 — "sub"
카드 아래 설명 한 줄. 종이 질감에서만 보인다.

### 길이
컷 길이는 나레이션 음성 길이 + holdSeconds로 정해진다. duration 값은 참고용이다.
"""


def _article_no(source_url: str) -> str | None:
    m = _ARTICLE_NO_RE.search(source_url or "")
    return m.group(1) if m else None


def _fetch_article(article_no: str) -> dict | None:
    """lens-cms-api 공개 기사 조회(GET /api/v2/articles/{no}). 없으면 None."""
    url = f"{lens_cms_client.API_URL}/api/v2/articles/{article_no}"
    try:
        with urllib.request.urlopen(urllib.request.Request(url, method="GET"), timeout=lens_cms_client.TIMEOUT_SECONDS) as res:
            return (json.loads(res.read()) or {}).get("article")
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise


def _video_lens(post: dict) -> dict:
    for item in (post.get("body_inline") or {}).get("lenses") or []:
        if item.get("label") == "영상":
            return item
    return {}


def remake_prompt() -> tuple[str, bool]:
    """(프롬프트, 저장된 수작업 프롬프트인지). 없으면 메인 영상 프롬프트 + 디자인 안내로 시작한다."""
    saved = prompts_repo.get_prompt(REMAKE_CATEGORY, REMAKE_NAME)
    if saved and (saved.get("active_content") or "").strip():
        return saved["active_content"], True
    base = prompts_repo.get_prompt("video", "published") or {}
    return (base.get("active_content") or "") + DESIGN_GUIDE, False


def article_for_post(post: dict) -> dict:
    """글의 원문 기사 본문·원문 사진. 못 찾으면 article이 빈 문자열이고 note에 이유가 있다."""
    body_inline = post.get("body_inline") or {}
    article_text = ""
    photo_url = body_inline.get("photo_image_url") or None
    photo_credit = None
    no = _article_no(post.get("source_url") or "")
    article_note = None
    if no:
        try:
            article = _fetch_article(no)
        except Exception as e:  # noqa: BLE001 — 원문 조회 실패해도 화면에서 직접 붙여넣을 수 있게 계속 진행
            logger.exception(f"원문 조회 실패(article_no={no})")
            article, article_note = None, f"원문 조회 실패: {e}"
        if article:
            parts = [article.get("title_ko") or "", article.get("sub_title_ko") or "", article.get("content_ko") or ""]
            article_text = "\n\n".join(p for p in parts if p.strip())
            images = article.get("images") or []
            if images:
                photo_url = photo_url or images[0].get("url")
                photo_credit = images[0].get("caption") or None
        elif not article_note:
            article_note = f"원문(기사 {no})을 찾지 못했습니다 — 직접 붙여넣어 주세요."
    else:
        article_note = "원문 주소에서 기사 번호를 찾지 못했습니다 — 직접 붙여넣어 주세요."
    return {"article": article_text[:_MAX_ARTICLE_CHARS], "note": article_note, "photo_url": photo_url, "photo_credit": photo_credit}


def run_load(push: Push, post_id: str) -> None:
    post = posts_repo.get(post_id) if post_id else None
    if not post:
        push({"type": "remake_error", "message": "글을 찾을 수 없습니다."})
        return
    video = _video_lens(post)
    src = article_for_post(post)
    prompt, saved = remake_prompt()
    push({
        "type": "remake_loaded",
        "post_id": post_id,
        "headline": post.get("headline") or "",
        "source_url": post.get("source_url") or "",
        "article": src["article"],
        "article_note": src["note"],
        "photo_url": src["photo_url"],
        "photo_credit": src["photo_credit"],
        "current_video_url": video.get("video_url"),
        "current_thumbnail_url": video.get("thumbnail_url"),
        "current_transcript": video.get("transcript"),
        "prompt": prompt,
        "prompt_saved": saved,
    })


def _transcript(script_text: str) -> str:
    """렌더에 넘긴 각본에서 나레이션만 이어 붙인다(자동 발행 publishing.py의 transcript와 같은 모양)."""
    try:
        script = extract_json_object(script_text)
    except ValueError:
        return ""
    cuts = script.get("cuts") if isinstance(script, dict) else None
    return " ".join((c.get("narration") or "").strip() for c in (cuts or []) if isinstance(c, dict)).strip()


def run_apply(push: Push, post_id: str, job_id: str, script_text: str) -> None:
    if not post_id or not job_id:
        push({"type": "remake_error", "message": "글 또는 렌더 작업 정보가 없습니다."})
        return
    base = f"https://{webtoon_jobs.bucket()}.s3.us-east-1.amazonaws.com/media/video-lab/{job_id}"
    video_url = f"{base}.mp4"
    if not video_lab._head_ok(video_url):
        push({"type": "remake_error", "message": "렌더된 영상을 찾지 못했습니다 — 렌더가 끝났는지 확인해 주세요."})
        return
    thumbnail_url = f"{base}.jpg" if video_lab._head_ok(f"{base}.jpg") else None
    transcript = _transcript(script_text)
    try:
        post = posts_repo.update(
            post_id,
            {"body_inline": {"video_url": video_url, "thumbnail_url": thumbnail_url, "transcript": transcript}},
            "video",
        )
    except ValueError as e:
        push({"type": "remake_error", "message": f"저장 실패: {e}"})
        return
    if not post:
        push({"type": "remake_error", "message": "글을 찾을 수 없습니다."})
        return
    audit.log("video-remake-apply", {"id": post_id, "job_id": job_id})
    notify.notify_content_changed()
    push({"type": "remake_applied", "post_id": post_id, "video_url": video_url, "thumbnail_url": thumbnail_url})
