"""frontpage_auto/run.py·mustknow_auto/run.py 공용 발행 헬퍼.

레터 산출물 파싱, 카테고리 매핑, 영상 렌더, 4포맷 생성·업로드·발행을 담당한다.
두 run.py는 서로를 import하지 않는 독립 스크립트이므로, 공통 로직을 이 모듈에 두어
한 번만 고치면 양쪽에 반영되게 한다(복사본 중 한쪽만 고쳐 버그가 남는 문제를 막는다).
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

# "재테크"(사이트 nav 7번째 탭, /investing)는 원문 최상위 카테고리에 없다.
# "산업,투자·재무,투자·재무"·"Signal,Finance,투자"처럼 하위 세그먼트에만 투자 관련 태그가
# 붙으므로 display_category()의 2차 패스가 하위 세그먼트에서 찾는다.
_INVESTING_SUBCATEGORIES = {"투자", "투자·재무", "금융·투자"}

# 하위 카테고리 taxonomy — service/frontend/src/shared/constants/econSubcategories.ts와
# 같은 값이다(의도적 중복). 본지 GNB 메뉴 구조를 따른다. 원문 XML의 category 2번째
# 세그먼트(예: "증권,국내증시,...")는 이 taxonomy와 이름이 맞지 않는 옛 체계라
# 규칙 매핑 대신 LLM으로 분류한다. 탭은 값이 있을 때만 노출되므로 분량이 얇은 분류도 안전하다.
SUBCATEGORY_MAP = {
    "증시": ["국내증시", "해외증시", "IB&Deal", "펀드·채권", "정책", "증권일반"],
    "산업": ["대기업", "중기·IT", "유통·생활", "바이오", "기업인", "투자·재무", "기업일반"],
    "부동산": ["정책", "부동산일반", "건설업계"],
    "금융·정책": ["은행", "보험", "카드", "가상자산", "금융일반"],
    "국제": ["미국·중남미", "일본·중국", "아시아·호주", "유럽", "중동·아프리카"],
    "문화": ["전시·공연", "영화·미디어", "출판", "여행·레저", "문화일반", "아트씽"],
}

# 전용 profile 없이 facts_extract.py와 같은 profile(lens-letters-sonnet-46)을 재사용한다.
_SUBCATEGORY_MODEL = "arn:aws:bedrock:us-east-1:887078546492:application-inference-profile/nrr81xvevv5k"


def display_subcategory(category: str | None, headline: str, context: str) -> str | None:
    """발행 시 body_inline.subcategory에 넣을 하위 카테고리.
    category가 SUBCATEGORY_MAP에 없으면(또는 None) 분류하지 않고 None을 돌려준다 —
    빈 탭을 만들지 않기 위한 제한이다. Bedrock 호출이 실패해도 None으로 폴백한다
    (이 필드가 없어도 발행은 막히면 안 된다)."""
    options = SUBCATEGORY_MAP.get(category or "")
    if not options:
        return None
    try:
        sys.path.insert(0, str(Path(__file__).parent))
        from bedrock_client import call_text  # noqa: lazy — 실패해도 발행이 안 막히게

        system = (
            f"다음 기사가 '{category}' 카테고리 안에서 어느 하위 분류에 가장 가까운지 "
            f"선택지 중 딱 하나만 골라 그 단어 그대로만 출력하세요. 다른 설명은 쓰지 마세요.\n"
            f"선택지: {', '.join(options)}"
        )
        user = f"제목: {headline}\n요약: {context}".strip()
        raw = call_text(system, user, model=_SUBCATEGORY_MODEL, max_tokens=20).strip()
        for opt in options:
            if opt in raw:
                return opt
    except Exception as e:
        print(f"[display_subcategory] 분류 실패, 생략: {e}")
    return None


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

    top_category는 XML의 첫 번째 category 태그만 보지만 기사는 태그를 여러 개 다는
    경우가 흔하다(예: "경제,사회,금융,증권,산업,국제"). 그래서 전체 태그
    (`article["categories"]`)를 순서대로 훑어 사이트 6개 카테고리와 일치하는 첫 값을 쓴다.
    경제 카테고리 태그가 없는 기사(정치·사회·오피니언)는 대응 페이지가 없으므로 None이다.
    "재테크"는 1차 패스(최상위 태그)로 찾을 수 없어, 1차에서 걸리지 않으면
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


# 레터 본문 최소 문단 수·재생성 횟수 — publish_article()의 품질 검사에서 쓴다.
MIN_LETTER_PARAGRAPHS = 6
MAX_LETTER_RETRIES = 2


def parse_letters(raw_md: str) -> list[str]:
    """레터 산출물(마크다운)에서 본문 문단만 뽑는다.

    출력 순서는 [제목] → [리드] → [핵심 요약] → "## 소제목" 본문 → [용어]다.
    [제목]·[핵심 요약]은 skip 구간이며 "##"(또는 "◾") 소제목을 만나면 skip을 풀고
    본문 수집을 재개한다. [핵심 요약]을 영구 종료 신호로 보면 그 뒤 본문이 통째로
    유실된다. [용어] 블록은 본문이 아니므로 만나면 종료한다."""
    from text_utils import extract_fact_ids  # noqa: lazy — 호출부가 sys.path 세팅 완료 후 부름

    # FACT_IDS 트레일러를 먼저 뗀다. 이 함수엔 본문 종료 조건이 없어
    # 그대로 두면 커버리지 줄이 발행 본문 문단이 된다.
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
        if line.startswith("[리드"):  # "[리드]"·"[리드 3~5문장]" 둘 다 매칭(아래 참고)
            skipping = False
            flush()
            continue
        if line.startswith("◾") or line.startswith("##"):
            # 소제목 줄은 별도 문단으로 살려 둔다. 프론트(LensFormatPanel)가
            # "◾"로 시작하는 문단을 소제목으로 구분해 보여준다("##"도 같은 역할).
            skipping = False
            flush()
            paragraphs.append(line)
            continue
        if line.startswith("자료:") or line == "—":
            skipping = False
            flush()
            continue
        # [핵심 요약]("30초 핵심" 전용 불릿)은 parse_letter_summary_bullets()가 따로 뽑으므로
        # 불릿 줄은 여기서 skip한다. 다음 "##"/"◾" 소제목에서 skip이 풀린다.
        if line.startswith("[핵심 요약]"):
            skipping = True
            flush()
            continue
        if line.startswith("[용어]"):
            flush()
            break
        if skipping:
            continue
        buf.append(line)
    flush()
    return paragraphs


_MAX_TITLE_CHARS = 60  # 프롬프트 지침은 15~30자 — 여유를 둔 안전 상한


def parse_letter_title(raw_md: str) -> str | None:
    """레터 산출물의 [제목] 블록에서 독자 시선 진입형 제목을 뽑는다
    (프롬프트 지침: "법은 강화됐습니다"가 아니라 "무효인 계약인데도 갚고 있다" 식, 15~30자).

    종료 조건은 parse_letters()와 같은 마커 집합([리드"로 시작, ◾, 자료:/—, [핵심 요약])이다.
    "[리드 3~5문장]" 같은 변형 헤더도 잡도록 "[리드"로 느슨하게 매칭한다.
    예상 밖 형식으로 새면 본문 전체가 제목이 되므로 길이 상한(_MAX_TITLE_CHARS)이 최후 방어선이다."""
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
        if line.startswith("[리드"):  # "[리드]"·"[리드 3~5문장]" 둘 다 매칭
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


_EMOJI_RE = re.compile(r"[\U0001F300-\U0001FAFF☀-➿⬀-⯿⌀-⏿]️?")


def extract_title_from_lead(paragraphs: list[str]) -> str | None:
    """parse_letter_title()이 실패했을 때의 2차 방어선 — 첫 문단에서 제목을 직접 뽑는다.

    모델이 [제목] 블록을 별도 줄로 쓰지 않고 리드 문장에 섞어 쓰는 경우가 있다.
    프롬프트 규칙상 제목은 이모지 1개로 끝나므로 첫 문단에서 첫 이모지까지 잘라 제목을 복원한다.
    이모지가 제목 맨 앞에 붙는 드문 경우를 막기 위해, 이모지를 제외한 글자가 2자 미만이면
    실패로 보고 None을 돌려준다(호출부가 원문 제목으로 폴백한다)."""
    if not paragraphs:
        return None
    p0 = paragraphs[0]
    m = _EMOJI_RE.search(p0)
    if not m:
        return None
    title = p0[: m.end()].strip()
    if len(_EMOJI_RE.sub("", title).strip()) < 2:
        return None
    if len(title) > _MAX_TITLE_CHARS:
        title = title[:_MAX_TITLE_CHARS].rstrip()
    return title or None


def parse_letter_summary_bullets(raw_md: str) -> list[str]:
    """레터 산출물의 [핵심 요약] 블록에서 "- "로 시작하는 불릿만 뽑는다.
    "30초 핵심" 카드가 이 불릿을 쓴다(lensSamples.ts의 coreSummaryBullets).
    블록이 없는 옛 산출물이면 빈 리스트를 돌려주고 "30초 핵심"은 다른 포맷으로 폴백한다.

    모델이 긴 불릿을 두 줄로 줄바꿈해 출력하는 경우가 있어, "-"로 시작하지 않는 줄은
    직전 불릿이 문장 종결로 끝나지 않았을 때에 한해 이어붙인다.
    "[용어]"와 "##"(본문 소제목)는 종료 마커다. 빠지면 본문 전체가 마지막 불릿에 붙는다."""
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
        # 종료 마커: [용어] 블록과 본문("## 소제목"). 없으면 뒤 줄들이 마지막 불릿에 이어붙는다.
        if line.startswith("[용어]") or line.startswith("##"):
            break
        if line.startswith("-"):
            bullets.append(line.lstrip("-").strip())
        elif bullets and not _ends_sentence(bullets[-1]):
            bullets[-1] = f"{bullets[-1]} {line}".strip()
        # else: 직전 불릿이 문장 종결로 끝났는데 "-" 없는 줄이 오면 줄바꿈 이어쓰기가 아니라
        # 불릿 블록과 "## 본문" 사이의 도입부 문단이다. 무시한다.
    # "자료: 서울경제신문(...)" 출처 줄은 요약 불릿이 아니다. "자료를 공개한 의원은…" 같은
    # 정상 불릿을 지우지 않도록 콜론이 붙은 출처 줄만 제외한다.
    return [b for b in bullets if not re.match(r"^자료\s*[:：]", b)]


def _ends_sentence(text: str) -> bool:
    """불릿이 완결 문장으로 끝났는지. 따옴표·괄호 닫힘을 건너뛰고 마지막
    글자가 . ! ? 면 완결로 본다 — 모델이 긴 불릿을 두 줄로 나눌 때는
    문장 중간에서 끊기므로(이어붙이기 대상) 구분된다."""
    return text.rstrip(" \"'”’)」』]").endswith((".", "!", "?", "。"))


def parse_letter_terms(raw_md: str) -> list[dict]:
    """레터 산출물의 [용어] 블록에서 "용어 | 설명" 쌍을 뽑는다.

    lens.keywords로 전달되며 프론트(shared/ui/TermHighlight.tsx)가 본문에서 이 용어를
    찾아 하이라이트한다. 블록이 없는 옛 산출물이면 빈 리스트."""
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
    """이 source_url이 이미(다른 파이프라인 포함) 발행됐는지 확인한다.

    쿼리스트링을 떼어낸 뒤 lens-cms-api에 완전일치로 조회한다. publish_article()이
    저장할 때 쓰는 정리 규칙(`split("?")[0]`)과 같다."""
    from lens_cms_client import find_by_source_url  # noqa: lazy

    if not source_url:
        return False
    clean = source_url.split("?")[0]
    return find_by_source_url(clean) is not None


def sanitize_video_script(script_path: Path) -> int:
    """영상 각본의 자막 배열에서 빈 조각({"text": ""})을 걸러낸다.
    모델이 "강조" 컷의 caption을 빈 text 조각으로 시작하는 배열로 내는 경우가 있고,
    렌더러(Remotion 스키마)는 text 최소 1자를 요구해 렌더 전 검증에서 거부한다.
    빈 조각만 빼면 의미는 그대로다. 걸러낸 조각 수를 돌려준다."""
    import json  # noqa: lazy

    data = json.loads(script_path.read_text(encoding="utf-8"))
    removed = 0
    for cut in data.get("cuts", []):
        cap = cut.get("caption")
        if isinstance(cap, list):
            kept = [seg for seg in cap if not (isinstance(seg, dict) and not str(seg.get("text", "")).strip())]
            removed += len(cap) - len(kept)
            if kept:
                cut["caption"] = kept
            else:
                cut["caption"] = cut.get("narration") or "—"
    if removed:
        script_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return removed


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
    n_removed = sanitize_video_script(script_path)
    if n_removed:
        print(f"[{log_prefix}] {name} 영상 각본 정리 — 빈 자막 조각 {n_removed}개 제거")

    # CMS video-settings 발행값(성우·엔진·포맷)을 admin 프롬프트 실험 랩
    # (pipelines/video/render_from_script.py)과 똑같이 반영한다. 재배포 없이 다음 발행 영상부터 적용된다.
    import os

    import video_settings  # pipelines/common/ — 호출부가 sys.path 세팅 완료 후 부름

    settings = video_settings.get_render_settings()
    mp4_path = out_dir / name / "video.mp4"
    try:
        # get_render_env()가 TTS_PROVIDER/TTS_VOICE_ID/TTS_ENGINE(+elevenlabs면 ELEVENLABS_*)을
        # 만든다. render_from_script.py와 같은 로직이다(video_settings.py 참고).
        result = subprocess.run(
            [
                "npm", "run", "render", "--",
                "--input", str(script_path.resolve()),
                "--format", settings["format"],
                "--output", str(mp4_path.resolve()),
                "--voice", settings["voice"],
            ],
            cwd=str(VIDEO_DIR),
            capture_output=True,
            text=True,
            env={**os.environ, **video_settings.get_render_env()},
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
    """4포맷(레터/웹툰/팟캐스트/영상) 생성 + S3 업로드 + lens-cms-api(Postgres) 발행.
    발행 여부 판단(중복확인·임계값·source_url 유효성)은 호출부 책임이다.

    frontpage_auto/run.py::process_article()와 mustknow_auto/run.py::_publish()가 공유하는
    블록이다. 두 호출부가 갈리는 지점(중복확인 시점·source_url 검증·이름 폴백·
    paper_section·display_order·로그 접두사)은 파라미터로 받는다.

    lens 글 하나(4포맷 전부 body_inline.lenses[]에 담아)만 쓴다. webtoon/video/home_player
    채널 조회는 cms_posts_repo.py가 lens publications 행의 rendition 포맷으로 채우므로
    형제 글을 따로 만들면 중복 행이 생긴다.

    name/source_url은 호출부가 확정한 값을 받는다. letters_mod/podcast_mod/webtoon_mod도
    호출부가 넘긴다 — 세 모듈 파일명이 모두 `pipeline.py`라 `load_module()`이 호출부마다
    다른 이름으로 등록한 별개 인스턴스이기 때문이다.
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
    # 4포맷이 같은 파일을 읽게 한다. 실패하면 빈 문자열이라 원문만 쓴다.
    article_path = out_dir / f"{name}_article.txt"
    facts = extract_facts(article["content"], today_kst)
    article_text = article["content"] + (f"\n\n---\n[공용 팩트시트]\n{facts}" if facts else "")
    article_path.write_text(article_text, encoding="utf-8")

    letters_path = letters_mod.run_article(name, str(article_path), out_dir)
    letters_raw = letters_path.read_text(encoding="utf-8")
    paragraphs = parse_letters(letters_raw)
    # 레터 본문 품질 검사. 생성 응답이 잘리거나 파싱에서 본문이 유실되면 리드 한 줄만 있는
    # 레터가 발행되므로, 문단이 적으면 최대 MAX_LETTER_RETRIES번 재생성하고 그래도 부족하면
    # 예외로 발행을 보류한다(seen 표시가 안 되어 다음 회차에 다시 후보가 된다). 정상 글은 10문단 안팎이다.
    for _attempt in range(1, MAX_LETTER_RETRIES + 1):
        if len(paragraphs) >= MIN_LETTER_PARAGRAPHS:
            break
        print(f"[{log_prefix}] {name} 레터 본문 {len(paragraphs)}문단(최소 {MIN_LETTER_PARAGRAPHS}) — 재생성 {_attempt}/{MAX_LETTER_RETRIES}")
        letters_path = letters_mod.run_article(name, str(article_path), out_dir)
        letters_raw = letters_path.read_text(encoding="utf-8")
        paragraphs = parse_letters(letters_raw)
    if len(paragraphs) < MIN_LETTER_PARAGRAPHS:
        raise ValueError(f"레터 본문 {len(paragraphs)}문단 — 최소 {MIN_LETTER_PARAGRAPHS}문단 필요, 발행 보류")
    letter_summary_bullets = parse_letter_summary_bullets(letters_raw)
    letter_terms = parse_letter_terms(letters_raw)
    # 프롬프트가 생성하는 "독자 시선 진입형" 제목. [제목] 마커를 못 찾으면
    # 첫 문단의 이모지 경계로 복구하고, 그것도 실패하면 원문 제목으로 폴백한다.
    letter_title = (
        parse_letter_title(letters_raw)
        or extract_title_from_lead(paragraphs)
        or article["title"]
    )

    podcast_mp3 = podcast_mod.run_article(name, str(article_path), out_dir)

    # 웹툰 이미지 생성이 실패해도 이미 성공한 레터·팟캐스트를 버리지 않고 "웹툰 없이 발행"한다.
    # status는 영상 기준으로만 정한다 — 호출부의 결과 집계와 revalidate 웹훅 분기가 그 값에
    # 걸려 있어, 새 status를 끼우면 웹툰만 빠진 기사가 SSR 재검증을 건너뛴다.
    # 컷 단위로도 실패한 컷만 건너뛰고, 남은 컷이 MIN_WEBTOON_CUTS 이상이면 그대로 발행한다.
    # 그 미만이면 전부 버린다(아래 except).
    MIN_WEBTOON_CUTS = max(1, webtoon_mod.N_CUTS - 2)
    webtoon_script: dict = {}
    webtoon_bullets, webtoon_images = [], []
    try:
        # 웹툰 각본에 "cuts"가 없는 모델 출력 이상이 가끔 있어 한 번 더 생성한다
        # (이미지 생성 전 단계라 재시도 비용이 작다).
        webtoon_script = {}
        for _attempt in (1, 2):
            webtoon_mod.run_article(name, str(article_path), out_dir, manage_gpu=manage_gpu)
            webtoon_script = json.loads((out_dir / name / "1_script.json").read_text(encoding="utf-8"))
            if webtoon_script.get("cuts"):
                break
            print(f"[{log_prefix}] {name} 웹툰 각본에 cuts 없음 — 재생성 {_attempt}/2")
        for cut in webtoon_script["cuts"]:
            n = cut["cut"]
            cut_path = out_dir / name / f"컷{n}.png"
            if not cut_path.exists():
                print(f"[{log_prefix}] {name} 컷{n} 파일 없음(생성 실패) — 이 컷만 건너뜀")
                continue
            caption = cut.get("narration") or (
                " ".join(f'{d["speaker"]}: {d["line"]}' for d in cut.get("dialogue", [])) if cut.get("dialogue") else ""
            ) or cut.get("caption", "")
            webtoon_bullets.append(caption)
            # 나레이션을 그림에 굽지 않은 컷이면(웹툰 합성이 남긴 표시 파일) 사이트가 컷 아래 여백에 글자로 보여준다.
            text_caption_flag = {"text_caption": True} if (out_dir / name / f"컷{n}.textcaption").exists() else {}
            # 업로드는 WebP(품질 90)로 한다(1.5배 해상도 PNG는 컷당 2MB대, WebP는 약 300KB).
            # 로컬 PNG는 세로 합치기(stitch)용으로 남기며, 변환 실패 시 PNG로 폴백한다.
            try:
                from PIL import Image

                webp_path = cut_path.with_suffix(".webp")
                Image.open(cut_path).convert("RGB").save(webp_path, "WEBP", quality=90, method=6)
                key = f"media/{log_prefix}/{name}-webtoon-cut{n:03d}.webp"
                webtoon_images.append({"url": _upload(webp_path, key), "caption": caption, **text_caption_flag})
            except Exception as e:
                print(f"[{log_prefix}] {name} 컷{n} WebP 변환 실패 — PNG로 업로드: {e}")
                key = f"media/{log_prefix}/{name}-webtoon-cut{n:03d}.png"
                webtoon_images.append({"url": _upload(cut_path, key), "caption": caption, **text_caption_flag})
        # 핵심 정리 카드(컷9) — 파이프라인이 만들었을 때만 덧붙이며 최소 컷 수 판정에는 넣지 않는다.
        n_cut_images = len(webtoon_images)  # 카드는 제외한 컷 수 — 최소 컷 수 판정용
        card_path = out_dir / name / "컷9.png"
        if webtoon_images and card_path.exists():
            try:
                from PIL import Image

                webp_path = card_path.with_suffix(".webp")
                Image.open(card_path).convert("RGB").save(webp_path, "WEBP", quality=90, method=6)
                webtoon_images.append({"url": _upload(webp_path, f"media/{log_prefix}/{name}-webtoon-card.webp"), "caption": "핵심 정리"})
            except Exception as e:  # noqa: BLE001
                print(f"[{log_prefix}] {name} 핵심 정리 카드 업로드 실패(건너뜀): {e}")
        if n_cut_images < MIN_WEBTOON_CUTS:
            raise ValueError(
                f"컷 {len(webtoon_images)}/{len(webtoon_script['cuts'])}개만 성공 "
                f"(최소 {MIN_WEBTOON_CUTS}개 필요) — 웹툰 전체 폐기"
            )
    except Exception:
        # 부분 성공이어도 MIN_WEBTOON_CUTS 미만이면 통째로 버린다. 부실한 웹툰보다 pending이 낫다.
        webtoon_script, webtoon_bullets, webtoon_images = {}, [], []
        if results is not None:
            results["degraded_no_webtoon"] = results.get("degraded_no_webtoon", 0) + 1
        print(f"[{log_prefix}] {name} 웹툰 실패 — 웹툰 없이 발행\n{traceback.format_exc()}")

    podcast_url = _upload(podcast_mp3, f"media/podcast/{log_prefix}/{name}-podcast.mp3")

    # 팟캐스트/영상 스크립트를 접근성용 텍스트로 같이 저장한다. 팟캐스트는 podcast/pipeline.py가
    # 저장한 대본.md(코드펜스가 안 벗겨진 원본)를 읽어 벗기고, 영상은 script.json의 컷별
    # narration을 이어붙인다.
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
            "category": (category := display_category(article)),
            "subcategory": display_subcategory(category, letter_title, article.get("sub_title") or ""),
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
