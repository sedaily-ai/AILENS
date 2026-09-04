"""frontpage_auto/run.py·mustknow_auto/run.py 공용 발행 헬퍼.

2026-09-04 — 리팩토링 감사로 신설. 두 run.py는 "import 아님 — frontpage_auto는
스크립트라 import 시 부작용이 있고, 프로덕션 코드를 건드리는 리스크도 피하기
위함"(mustknow_auto/run.py 자체 설명)이라는 이유로 헬퍼 함수 9개를 그대로
복사-붙여넣기 해왔다. 그런데 바로 이 패턴 때문에 실제 버그가 났다 —
`_parse_letter_summary_bullets()`의 줄바꿈 처리 버그를 한쪽만 고치고 다른
쪽은 안 고쳐서 프로덕션에 두 번 심어진 게 2026-09-04 콘텐츠 품질 검수로
드러났다(worklog 2026-09-04 참조). "복사해온다"는 이유 자체는 여전히
유효하지만(각 run.py는 여전히 독자적인 스크립트, 서로를 import 안 함),
공통부만 이 모듈로 옮기면 양쪽 다 이 모듈 하나만 import해서 원본을 안 건드리는
전제를 유지하면서도 다음 버그부터는 한 번만 고치면 된다.
"""
from __future__ import annotations

import importlib.util
import re
import subprocess
import sys
import traceback
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent  # pipelines/
VIDEO_DIR = _ROOT / "video"

_NON_SLUG = re.compile(r"[^0-9A-Za-z가-힣]+")

# 사이트 6개 카테고리로의 매핑 — display_category()가 쓴다.
CATEGORY_MAP = {
    "증권": "증시",
    "부동산": "부동산",
    "산업": "산업",
    "금융": "금융·정책",
    "국제": "국제",
    "문화·라이프": "문화",
}


def load_module(name: str, file_path: Path):
    """letters/podcast/webtoon이 전부 `pipeline.py`라는 같은 파일명을 써서
    일반 import로는 서로를 가릴 수 있다 — 파일 경로 기준으로 직접 로드."""
    folder = str(file_path.parent)
    if folder not in sys.path:
        sys.path.insert(0, folder)
    spec = importlib.util.spec_from_file_location(name, file_path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def display_category(article: dict) -> str | None:
    """발행 시 body_inline.category에 넣을 사이트 카테고리 라벨.

    top_category는 XML에서 그 기사의 **첫 번째** category 태그만 본다
    (discovery/pipeline.py) — 기사 하나가 category 태그를 여러 개 달고
    있는 경우가 흔해서(예: "경제,사회,금융,증권,산업,국제" 6개를 동시에
    달았는데 top_category는 그중 맨 앞의 "경제"만 봄), 실제로는 증권/산업
    기사인데도 카테고리 없이 발행되는 버그가 있었다. 그 기사의 전체
    category 태그(`article["categories"]`)를 순서대로 훑어 사이트 6개
    카테고리 중 하나와 일치하는 첫 값을 쓴다. 정치·사회·오피니언처럼
    애초에 경제 카테고리 태그가 전혀 없는 기사는 None을 돌려준다 — 사이트에
    대응 카테고리 페이지가 없는 게 맞기 때문에 억지로 하나 붙이지 않는다."""
    for c in article.get("categories") or [article.get("top_category", "")]:
        if c in CATEGORY_MAP:
            return CATEGORY_MAP[c]
    return None


def slugify(publish_date: str, headline: str) -> str:
    tail = _NON_SLUG.sub("-", (headline or "").strip()).strip("-")
    base = f"{publish_date}-{tail}" if tail else publish_date
    return base[:80].rstrip("-")


def parse_letters(raw_md: str) -> list[str]:
    """레터 산출물(마크다운)에서 본문 문단만 뽑는다."""
    from text_utils import extract_fact_ids  # noqa: lazy — 호출부가 sys.path 세팅 완료 후 부름

    # FACT_IDS 트레일러를 먼저 떼어낸다. 이 함수엔 본문 종료 조건이 없어서
    # (자료: 뒤로도 계속 buf에 쌓는다) 안 떼면 커버리지 줄이 그대로 발행
    # 본문 문단이 된다.
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
        # [핵심 요약]("30초 핵심" 전용 불릿) 블록은 parse_letter_summary_bullets()가
        # 따로 뽑으므로, 여기서는 만나는 순간부터 끝까지 전부 skip해 본문
        # 문단에 안 섞이게 한다.
        if line.startswith("[핵심 요약]"):
            flush()
            break
        if skipping:
            continue
        buf.append(line)
    flush()
    return paragraphs


def parse_letter_summary_bullets(raw_md: str) -> list[str]:
    """레터 산출물의 [핵심 요약] 블록에서 "- "로 시작하는 불릿만 뽑는다.
    "30초 핵심" 카드가 이 불릿을 쓴다(lensSamples.ts의 coreSummaryBullets) —
    예전엔 이 카드가 웹툰 컷 캡션을 재활용해서, 그림 없이 텍스트만 보면
    맥락이 빠지는 문제가 있었다(기자 피드백). 블록이 없는 옛 프롬프트
    결과물이면 빈 리스트를 돌려주고, "30초 핵심"은 기존처럼 다른 포맷으로
    폴백한다.

    2026-09-04 — 긴 불릿을 모델이(프롬프트 자체 예시가 그렇게 보여주듯)
    두 줄로 줄바꿈해 출력하는 경우가 있는데, "-"로 시작하지 않는 이어지는
    줄을 그냥 버려서 불릿이 문장 중간에 끊긴 채 발행된 실제 버그를 여기서
    고쳤다 — "-"로 시작 안 하는 줄은 직전 불릿에 이어붙인다."""
    from text_utils import extract_fact_ids  # noqa: lazy

    raw_md, _ = extract_fact_ids(raw_md)
    body = re.sub(r"^```\w*\n|```$", "", raw_md.strip(), flags=re.MULTILINE).strip()
    lines = [l.strip() for l in body.split("\n") if l.strip()]

    bullets, in_block = [], False
    for line in lines:
        if line.startswith("[핵심 요약]"):
            in_block = True
            continue
        if not in_block:
            continue
        if line.startswith("-"):
            bullets.append(line.lstrip("-").strip())
        elif bullets:
            bullets[-1] = f"{bullets[-1]} {line}".strip()
    return bullets


def already_published(table, article_key: str) -> bool:
    """이 article_key가 이미 (다른 파이프라인 포함) 발행됐는지 확인 —
    source_url 완전일치가 아니라 contains로 본다(쿼리스트링·수동발행
    케이스 때문에 완전일치는 놓친다, 실제로 겪은 문제)."""
    if not article_key:
        return False
    resp = table.scan(
        FilterExpression="contains(source_url, :k)",
        ExpressionAttributeValues={":k": f"article/{article_key}"},
        ProjectionExpression="id",
    )
    return len(resp.get("Items", [])) > 0


def generate_video(
    name: str, article_path: Path, out_dir: Path, *,
    photo_url: str | None = None, photo_caption: str | None = None,
    log_prefix: str = "publish",
) -> dict | None:
    """성공하면 {"mp4_path": Path, "thumb_path": Path|None} 반환, 팩트
    누락으로 실패하면 None(그 기사는 영상 없이 3/4 포맷만 발행)."""
    from generate_script import generate_script  # pipelines/video/generate_script.py — 호출부가 sys.path 세팅 완료 후 부름

    try:
        script_path = generate_script(
            name, str(article_path), output_root=out_dir, photo_url=photo_url, photo_caption=photo_caption
        )
    except ValueError as e:
        print(f"[{log_prefix}] {name} 영상 각본 생성 실패(사람 확인 필요) — {e}")
        return None
    except Exception:
        print(f"[{log_prefix}] {name} 영상 각본 생성 중 예상 못한 오류:\n{traceback.format_exc()}")
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
        print(f"[{log_prefix}] {name} 영상 렌더 실행 자체 실패(npm/ffmpeg 없음?) — {e}")
        return None
    if result.returncode != 0:
        print(f"[{log_prefix}] {name} 영상 렌더 실패:\n{result.stdout[-2000:]}\n{result.stderr[-2000:]}")
        return None

    thumb_path = out_dir / name / "thumb.jpg"
    subprocess.run(
        ["ffmpeg", "-y", "-ss", "2", "-i", str(mp4_path), "-frames:v", "1", str(thumb_path)],
        capture_output=True,
    )
    return {"mp4_path": mp4_path, "thumb_path": thumb_path if thumb_path.exists() else None}


def get_revalidate_secret(session, log_prefix: str = "publish"):
    try:
        return session.client("ssm").get_parameter(
            Name="/sedaily-mbti/ssr-revalidate-secret", WithDecryption=True
        )["Parameter"]["Value"]
    except Exception:
        print(f"[{log_prefix}] revalidate secret 조회 실패 — 이번 실행 내내 캐시 무효화 스킵:\n{traceback.format_exc()}")
        return None


def notify_revalidate(secret, log_prefix: str = "publish") -> None:
    import requests  # noqa: lazy

    try:
        requests.post(
            "https://ailens.sedaily.ai/api/revalidate",
            headers={"Content-Type": "application/json", "X-Revalidate-Secret": secret},
            json={},
            timeout=30,
        )
    except Exception:
        print(f"[{log_prefix}] revalidate 웹훅 실패(콘텐츠는 이미 발행됨):\n{traceback.format_exc()}")
