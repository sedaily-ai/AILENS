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

# "재테크"(사이트 nav 7번째 탭, /investing)는 원문 최상위 카테고리엔
# 없다(2026-09-11 daily-xml 전수조사로 확인 — 그래서 /investing이 계속
# 0건이었다, 사용자 신고). "산업,투자·재무,투자·재무"·"Signal,Finance,투자"
# 처럼 하위 세그먼트에만 투자 관련 태그가 붙는다 — display_category()의
# 2차 패스가 이 세그먼트들을 하위 태그로 찾는다.
_INVESTING_SUBCATEGORIES = {"투자", "투자·재무", "금융·투자"}


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
    대응 카테고리 페이지가 없는 게 맞기 때문에 억지로 하나 붙이지 않는다.

    2026-09-11 — "재테크"만은 최상위 태그 매칭(1차 패스)으로 못 찾는다
    (CATEGORY_MAP 주석 참조). 1차 패스에서 아무 것도 안 걸리면 2차로
    하위 세그먼트에서 투자 관련 태그를 찾는다."""
    cats = article.get("categories") or [article.get("top_category", "")]
    for c in cats:
        top = c.split(",")[0]
        if top in CATEGORY_MAP:
            return CATEGORY_MAP[top]
    for c in cats:
        segments = c.split(",")
        if any(seg in _INVESTING_SUBCATEGORIES for seg in segments[1:]):
            return "재테크"
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


_MAX_TITLE_CHARS = 60  # 프롬프트 지침은 15~30자 — 여유를 둔 안전 상한(2026-09-11)


def parse_letter_title(raw_md: str) -> str | None:
    """레터 산출물의 [제목] 블록에서 독자 시선 진입형 제목을 뽑는다
    (프롬프트 지침: "법은 강화됐습니다"가 아니라 "무효인 계약인데도 갚고
    있다" 식, 15~30자).

    2026-09-10 — 이 제목이 여태 parse_letters()에서 skip만 되고 실제
    발행 headline/question엔 한 번도 안 쓰였다(사용자 지적: "뉴스레터
    제목이 뉴스 기사 제목을 그대로 따오고 있다" — 원인은 프롬프트가
    아니라 이 파싱 누락이었다. publish_article()이 대신 원문 뉴스 제목
    article["title"]을 그대로 썼다).

    2026-09-11 — 종료 조건이 [리드] 하나뿐이었다. parse_letters()는
    [리드]·◾·자료:/—·[핵심 요약] 네 가지를 전부 종료 조건으로 보는데
    (문단 파싱에서 이미 검증된 마커 집합), 이 함수만 [리드]만 보고
    있었다 — 모델이 [제목] 뒤에 [리드]를 안 쓰거나 형식이 어긋나면
    멈출 데를 못 찾고 본문 끝(핵심 요약·용어 설명까지)까지 통째로
    buf에 쌓아 제목이 2000~3000자짜리 본문 전체가 돼버렸다(실사용자
    신고로 발견 — admin 웹툰 목록에서 제목 칸에 본문이 그대로 나옴).
    parse_letters()와 같은 종료 조건 집합으로 맞추고, 그래도 모델이
    예상 못 한 형식으로 새면 길이 상한(_MAX_TITLE_CHARS)이 최후
    방어선이다."""
    from text_utils import extract_fact_ids  # noqa: lazy — 호출부가 sys.path 세팅 완료 후 부름

    raw_md, _ = extract_fact_ids(raw_md)
    body = re.sub(r"^```\w*\n|```$", "", raw_md.strip(), flags=re.MULTILINE).strip()
    lines = [l.strip() for l in body.split("\n") if l.strip()]
    buf: list[str] = []
    in_block = False
    for line in lines:
        if line.startswith("[제목]"):
            in_block = True
            continue
        if line.startswith("[리드]"):
            break
        if line.startswith("◾"):
            break
        if line.startswith("자료:") or line == "—":
            break
        if line.startswith("[핵심 요약]"):
            break
        if in_block:
            buf.append(line)
    title = " ".join(buf).strip()
    if len(title) > _MAX_TITLE_CHARS:
        title = title[:_MAX_TITLE_CHARS].rstrip()
    return title or None


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
        # 2026-09-11 — [용어] 블록 신설(parse_letter_terms 참조) 이후 이
        # 체크가 없으면 "[용어]"와 그 뒤 "용어 | 설명" 줄들이 "-"로 시작 안
        # 하니 전부 마지막 불릿에 이어붙어버린다.
        if line.startswith("[용어]"):
            break
        if line.startswith("-"):
            bullets.append(line.lstrip("-").strip())
        elif bullets:
            bullets[-1] = f"{bullets[-1]} {line}".strip()
    return bullets


def parse_letter_terms(raw_md: str) -> list[dict]:
    """레터 산출물의 [용어] 블록에서 "용어 | 설명" 쌍을 뽑는다.

    2026-09-11 — 사용자 요청: 본문 핵심 용어를 (노란 하이라이트 등으로)
    표시해서 뜻을 바로 확인할 수 있게 하고 싶다는 UX 요청에서 출발.
    letters 프롬프트에 [용어] 섹션 지침을 추가(v6)하고 여기서 파싱해
    lens.keywords로 흘려보낸다 — 프론트(shared/ui/TermHighlight.tsx)가
    본문에서 이 용어들을 찾아 하이라이트 처리한다. 블록이 없는 옛
    산출물이면 빈 리스트."""
    from text_utils import extract_fact_ids  # noqa: lazy

    raw_md, _ = extract_fact_ids(raw_md)
    body = re.sub(r"^```\w*\n|```$", "", raw_md.strip(), flags=re.MULTILINE).strip()
    lines = [l.strip() for l in body.split("\n") if l.strip()]

    terms: list[dict] = []
    in_block = False
    for line in lines:
        if line.startswith("[용어]"):
            in_block = True
            continue
        if not in_block:
            continue
        if "|" not in line:
            continue
        term, _, explain = line.partition("|")
        term, explain = term.strip(), explain.strip()
        if term and explain:
            terms.append({"term": term, "explain": explain})
    return terms


def already_published(source_url: str) -> bool:
    """이 source_url이 이미 (다른 파이프라인 포함) 발행됐는지 확인 — v1.32.

    예전엔 DynamoDB source_url `contains()` 스캔이었다(쿼리스트링 차이
    때문에 완전일치를 피했었음). 이제는 여기서 직접 쿼리스트링을 떼어낸
    뒤 lens-cms-api(Postgres)에 완전일치로 물어본다 — publish_article()이
    저장할 때 쓰는 것과 정확히 같은 정리 규칙(`split("?")[0]`)이라 같은
    문제가 재발하지 않는다."""
    from lens_cms_client import find_by_source_url  # noqa: lazy

    if not source_url:
        return False
    clean = source_url.split("?")[0]
    return find_by_source_url(clean) is not None


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


def publish_article(
    article: dict,
    out_dir: Path,
    s3,
    today_kst: str,
    *,
    name: str,
    source_url: str | None,
    paper_section: str | None,
    display_order: int | None,
    log_prefix: str,
    letters_mod,
    podcast_mod,
    webtoon_mod,
    results: dict | None = None,
    manage_gpu: bool = True,
) -> str:
    """4포맷(레터/웹툰/팟캐스트/영상) 생성 + S3 업로드 + lens-cms-api(Postgres)
    발행 — 발행 여부 판단(중복확인·임계값·source_url 유효성)은 호출부
    책임, 여기선 안 한다.

    2026-09-05 — frontpage_auto/run.py::process_article()와
    mustknow_auto/run.py::_publish()가 이 부분만 바이트 단위로 동일했다
    (2026-09-04 P1에서 코드블록 추출 등 9개 헬퍼 함수는 이미 공용화했지만,
    정작 제일 큰 이 블록 — 실제로 오늘 세션을 시작하게 만든 버그가 살고
    있던 곳과 같은 위험 클래스 — 은 안 건드렸었다, P3 리팩토링 감사에서
    재발견). 두 파일이 갈리는 지점(중복확인 시점·source_url 검증·이름
    폴백·paper_section·display_order·로그 접두사)은 전부 파라미터로 받고,
    그 갈리는 부분(래퍼)은 각 run.py에 그대로 남긴다.

    2026-09-10(v1.32) — 저장 대상이 DynamoDB(`table.put_item()`)에서
    lens-cms-api HTTP API로 바뀌면서 `table` 파라미터를 없앴다. 예전엔
    lens 본글과 별도로 webtoon/video/home_player 채널에 형제 글을
    하나씩 더 썼는데(2026-08-23 도입, "각 채널 전용 화면에도 보이게"),
    Postgres 읽기 경로(cms_posts_repo.py)는 그 형제 글 없이도 lens
    publications 행의 rendition 포맷만 보고 channel=video/webtoon/
    home_player 조회를 채워준다는 게 v1.30 조사로 이미 확인돼 있다 —
    형제 글을 계속 만들면 이번 마이그레이션 내내 고치던 것과 같은
    중복 publications 행 문제를 새로 만드는 것이라 없앴다. lens 글
    하나(4포맷 전부 body_inline.lenses[]에 담아)만 쓴다.

    name/source_url은 호출부가 이미 확정한 값을 받는다(mustknow_auto는
    article["key"]가 항상 있다는 전제, frontpage_auto는 key가 없으면
    slugify로 대체하는 자기만의 폴백이 있음 — 그 폴백 로직 자체는 호출부
    책임). letters_mod/podcast_mod/webtoon_mod도 호출부가 넘긴다 — letters/
    webtoon/podcast 전부 파일명이 `pipeline.py`로 같아서 `load_module()`이
    호출부마다 다른 이름(`frontpage_auto_letters` 등)으로 등록한 별개
    모듈 인스턴스이기 때문에 이 함수가 전역으로 하나만 들고 있을 수 없다.
    """
    from facts_extract import extract_facts  # noqa: lazy — 호출부가 sys.path 세팅 완료 후 부름
    from text_utils import strip_code_fence  # noqa: lazy
    from s3_utils import upload_media  # noqa: lazy
    from config import CMS_MEDIA_BUCKET  # noqa: lazy — frontpage_auto/mustknow_auto 둘 다 같은 값
    from lens_cms_client import create_post, set_status  # noqa: lazy

    import json

    def _upload(local_path: Path, key: str) -> str:
        return upload_media(s3, local_path, key, CMS_MEDIA_BUCKET)

    # 0단계 — 공용 팩트시트(기준일/핵심 숫자/용어/논지)를 원문 뒤에 이어붙여
    # 4포맷 전부가 같은 파일을 읽는다. 실패해도 빈 문자열이라 원문만 쓰던
    # 예전 동작으로 자연히 폴백.
    article_path = out_dir / f"{name}_article.txt"
    facts = extract_facts(article["content"])
    article_text = article["content"] + (f"\n\n---\n[공용 팩트시트]\n{facts}" if facts else "")
    article_path.write_text(article_text, encoding="utf-8")

    letters_path = letters_mod.run_article(name, str(article_path), out_dir)
    letters_raw = letters_path.read_text(encoding="utf-8")
    paragraphs = parse_letters(letters_raw)
    letter_summary_bullets = parse_letter_summary_bullets(letters_raw)
    letter_terms = parse_letter_terms(letters_raw)
    # 프롬프트가 생성하는 "독자 시선 진입형" 제목 — 모델이 안 만들었거나
    # 파싱에 실패한 예외적인 경우에만 원문 뉴스 제목으로 폴백한다.
    letter_title = parse_letter_title(letters_raw) or article["title"]

    podcast_mp3 = podcast_mod.run_article(name, str(article_path), out_dir)

    # 웹툰은 영상과 달리 폴백이 없다 — 이미지 생성이 실패하면(OpenAI 크레딧
    # 소진 등) 이미 성공한 레터·팟캐스트까지 통째로 버려지고 기사가 failed로
    # 집계되는 문제가 있었다(2026-08-24). 영상과 같은 방식으로 "웹툰 없이
    # 발행"까지는 살린다. status는 계속 영상 기준으로만 정한다 — 호출부의
    # 결과 집계와 revalidate 웹훅 분기가 그 값에 걸려 있어서, 여기에 새
    # status를 끼우면 웹툰만 빠진 기사가 SSR 재검증을 조용히 건너뛴다.
    webtoon_script: dict = {}
    webtoon_bullets, webtoon_images = [], []
    try:
        webtoon_mod.run_article(name, str(article_path), out_dir, manage_gpu=manage_gpu)
        webtoon_script = json.loads((out_dir / name / "1_script.json").read_text(encoding="utf-8"))
        for cut in webtoon_script["cuts"]:
            caption = cut.get("narration") or (
                " ".join(f'{d["speaker"]}: {d["line"]}' for d in cut.get("dialogue", [])) if cut.get("dialogue") else ""
            ) or cut.get("caption", "")
            webtoon_bullets.append(caption)
            n = cut["cut"]
            cut_path = out_dir / name / f"컷{n}.png"
            key = f"media/{log_prefix}/{name}-webtoon-cut{n:03d}.png"
            webtoon_images.append({"url": _upload(cut_path, key), "caption": caption})
    except Exception:
        # 부분 성공(예: 3컷까지만 업로드)도 버린다 — 중간에 끊긴 웹툰을
        # 내보내느니 웹툰 탭을 pending으로 두는 편이 낫다.
        webtoon_script, webtoon_bullets, webtoon_images = {}, [], []
        if results is not None:
            results["degraded_no_webtoon"] = results.get("degraded_no_webtoon", 0) + 1
        print(f"[{log_prefix}] {name} 웹툰 실패 — 웹툰 없이 발행\n{traceback.format_exc()}")

    podcast_url = _upload(podcast_mp3, f"media/podcast/{log_prefix}/{name}-podcast.mp3")

    # 팟캐스트/영상 스크립트를 청각장애인 접근성용 텍스트로 같이 저장한다
    # (2026-08-23, 사용자 요청). 팟캐스트는 podcast/pipeline.py가 저장해둔
    # 대본.md를 그대로 읽는다(TTS 입력과 달리 코드펜스가 안 벗겨진 원본이라
    # 여기서 한 번 더 벗긴다). 영상은 generate_script.py가 저장한
    # script.json의 컷별 narration을 이어붙인다.
    podcast_script_path = out_dir / name / "대본.md"
    podcast_transcript = (
        strip_code_fence(podcast_script_path.read_text(encoding="utf-8"))
        if podcast_script_path.exists() else None
    ) or None

    video = generate_video(
        name, article_path, out_dir,
        photo_url=article.get("photo_url"), photo_caption=article.get("photo_caption"),
        log_prefix=log_prefix,
    )
    video_url = thumb_url = None
    video_transcript = None
    status = "published"
    if video:
        video_url = _upload(video["mp4_path"], f"media/video/{log_prefix}/{name}-video.mp4")
        if video["thumb_path"]:
            thumb_url = _upload(video["thumb_path"], f"media/video/{log_prefix}/{name}-thumb.jpg")
        video_script_path = out_dir / name / "script.json"
        if video_script_path.exists():
            video_script_data = json.loads(video_script_path.read_text(encoding="utf-8"))
            video_transcript = "\n\n".join(
                cut["narration"] for cut in video_script_data.get("cuts", []) if cut.get("narration")
            ) or None
    else:
        status = "published_no_video"

    lenses = [
        {"label": "레터", "question": letter_title, "bullets": letter_summary_bullets, "paragraphs": paragraphs,
         "images": [], "video_url": None, "media_url": None, "keywords": letter_terms},
        {"label": "웹툰", "question": webtoon_script.get("core_question") or letter_title, "bullets": webtoon_bullets,
         "paragraphs": [], "images": webtoon_images, "video_url": None, "media_url": None,
         "pending": not webtoon_images},
        {"label": "팟캐스트", "question": letter_title, "bullets": [], "paragraphs": [],
         "images": [], "video_url": None, "media_url": podcast_url, "transcript": podcast_transcript},
        {"label": "영상", "question": letter_title, "bullets": [], "paragraphs": [],
         "images": [], "video_url": video_url, "media_url": None, "thumbnail_url": thumb_url,
         "pending": video_url is None, "transcript": video_transcript},
    ]

    publish_date_iso = f"{today_kst[:4]}-{today_kst[4:6]}-{today_kst[6:8]}"
    clean_source_url = (source_url or "").split("?")[0]
    data = {
        "headline": letter_title,
        "subtitle": article["sub_title"],
        "publish_date": publish_date_iso,
        "channels": ["lens"],
        "cover_image_url": webtoon_images[0]["url"] if webtoon_images else None,
        "source_url": clean_source_url,
        "editor_id": "AI LENS",
        "display_order": display_order,
        "body_inline": {
            "body": [], "key_points": [], "keywords": [], "images": [],
            "lenses": lenses,
            "photo_image_url": article["photo_url"],
            "category": display_category(article),
            "paper_section": paper_section,
            "display_order": display_order,
            "needs_video": video is None,
        },
    }
    post = create_post(data, created_by=log_prefix)
    set_status(post["id"], "published")
    slug = post["slug"]

    print(f"[{log_prefix}] 발행 완료 — {slug} (section={paper_section}, {status})")
    return status
