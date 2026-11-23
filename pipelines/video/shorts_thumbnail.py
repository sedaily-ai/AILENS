"""PRISM 썸네일 이미지 — 기사 사진 + 제목 (2026-11-17, 롱폼 2026-11-23).

영상은 건드리지 않고 별도 이미지(쇼츠 1080x1920·롱폼 1280x720 JPEG)만 만든다. 롱폼(1280x720)은 prism_batch가
유튜브 업로드 뒤 thumbnails.set으로 달고, 쇼츠용은 유튜브 스튜디오에서 올리거나 같은 방식으로 단다.
제목 나누기·글꼴·팔레트는 shorts_compose와 같은 것을 쓴다.

사진 사용 권한은 이 모듈이 판단하지 않는다 — 호출하는 쪽이 자사 사진만 넘길지 정한다.
"""
from __future__ import annotations

import subprocess
import tempfile
import textwrap
import urllib.request
from pathlib import Path

import shorts_compose as sc

THUMB_W, THUMB_H = 1080, 1920
SHADE_TOP = 0.55          # 이 높이(비율)부터 아래로 점점 어둡게 깔아 제목 글자를 읽게 한다
SHADE_STEPS = 16          # 반투명 띠를 겹쳐 그라데이션처럼 보이게 한다(경계가 보이지 않도록 잘게)
SHADE_STEP_ALPHA = 0.05
TITLE_WRAP = 19           # 78px 글자 기준 한 줄 글자 수(좌우 여백 확보). shorts_compose.TITLE_WRAP(64px용)보다 좁다
FIT_PHOTO_Y = 300          # 가로 사진을 놓는 y(사진 높이는 폭 1080 기준 약 720)
TITLE_SIZE = 78
TITLE_LINE_H = 98
TITLE_BOTTOM = 1700       # 마지막 줄 아래 끝 y
TAG_Y = 150               # 위쪽 AI PRISM 태그
DOWNLOAD_TIMEOUT = 15


def download_photo(url: str, dest: Path) -> Path:
    """사진 주소 → 파일. 열리지 않으면 예외."""
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=DOWNLOAD_TIMEOUT) as resp:
        dest.write_bytes(resp.read())
    return dest


def _drawtext(textfile: Path, size: int, color: str, x: str, y: int) -> str:
    return (
        f"drawtext=fontfile={sc.FONT}:textfile={textfile}:expansion=none:fontsize={size}:fontcolor={color}"
        f":borderw=3:bordercolor=black@0.55:x={x}:y={y}"
    )


def photo_size(photo: Path) -> tuple[int, int]:
    r = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", str(photo)],
        capture_output=True, text=True,
    )
    w, h = r.stdout.strip().split(",")[:2]
    return int(w), int(h)


def _base_graph(landscape: bool) -> str:
    """가로 사진은 폭 1080에 맞춰 놓고(원본 이하로 줄이거나 조금만 확대) 위아래는 같은 사진을 흐리게 깐다.
    세로 사진은 화면 전체를 채운다. 어느 쪽이든 확대를 최소로 해 사실적인 질감을 지킨다."""
    if landscape:
        return (
            f"[0:v]split[a][b];"
            f"[a]scale={THUMB_W}:{THUMB_H}:force_original_aspect_ratio=increase,crop={THUMB_W}:{THUMB_H},gblur=sigma=45,eq=brightness=-0.18[bg];"
            f"[b]scale={THUMB_W}:-2:flags=lanczos[fg];"
            f"[bg][fg]overlay=0:{FIT_PHOTO_Y}"
        )
    return f"[0:v]scale={THUMB_W}:{THUMB_H}:force_original_aspect_ratio=increase:flags=lanczos,crop={THUMB_W}:{THUMB_H}"


def build_args(photo: Path, out: Path, title_files: list[Path], tag_file: Path, landscape: bool = False) -> list[str]:
    n = len(title_files)
    first_y = TITLE_BOTTOM - n * TITLE_LINE_H
    draws = [
        _drawtext(tf, TITLE_SIZE, sc.TITLE_COLOR, "(w-text_w)/2", first_y + i * TITLE_LINE_H)
        for i, tf in enumerate(title_files)
    ]
    draws.append(_drawtext(tag_file, 64, sc.ACCENT_COLOR, "(w-text_w)/2", TAG_Y))
    shade = ",".join(
        f"drawbox=x=0:y=ih*{SHADE_TOP + (1 - SHADE_TOP) * k / SHADE_STEPS:.4f}:w=iw:h=ih:color=black@{SHADE_STEP_ALPHA}:t=fill"
        for k in range(SHADE_STEPS)
    )
    graph = _base_graph(landscape) + "," + shade + "," + ",".join(draws) + "[out]"
    return [
        "ffmpeg", "-y", "-i", str(photo),
        "-filter_complex", graph,
        "-map", "[out]", "-frames:v", "1", "-q:v", "1",
        str(out),
    ]


def wrap_title(title: str) -> list[str]:
    """제목을 최대 4줄로. shorts_compose와 같은 규칙(날짜 꼬리 제거, 넘치면 …)에 줄 폭만 좁다."""
    title = title.split(" | ")[0]
    lines = textwrap.wrap(" ".join(title.split()), width=TITLE_WRAP, break_long_words=True) or [""]
    if len(lines) > sc.TITLE_MAX_LINES:
        lines = lines[: sc.TITLE_MAX_LINES]
        lines[-1] = lines[-1][: TITLE_WRAP - 1].rstrip() + "…"
    return lines


def _is_landscape(photo: Path) -> bool:
    w, h = photo_size(photo)
    return w / h > 1.1


def make(photo: Path, title: str, out: Path) -> None:
    """photo(파일) + title → out(JPEG). 실패하면 RuntimeError."""
    if not sc.FONT.exists():
        raise RuntimeError(f"글꼴 파일이 없습니다: {sc.FONT}")
    with tempfile.TemporaryDirectory() as tmp:
        files = []
        for i, line in enumerate(wrap_title(title)):
            f = Path(tmp) / f"t{i}.txt"
            f.write_text(line, encoding="utf-8")
            files.append(f)
        tag = Path(tmp) / "tag.txt"
        tag.write_text("AI PRISM", encoding="utf-8")
        result = subprocess.run(build_args(photo, out, files, tag, landscape=_is_landscape(photo)), capture_output=True, text=True)
    if result.returncode != 0 or not out.exists():
        raise RuntimeError(f"썸네일 합성 실패(returncode={result.returncode}): {result.stderr[-500:]}")


def make_from_url(photo_url: str, title: str, out: Path) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        photo = download_photo(photo_url, Path(tmp) / "photo")
        make(photo, title, out)


# ── 가로(롱폼) 썸네일 1280x720 ─────────────────────────────────────────────
WIDE_W, WIDE_H = 1280, 720
WIDE_TEXT_X = 660           # 제목 왼쪽 끝 — 사진은 왼쪽 660px까지 보이고 오른쪽은 그림자·글자
WIDE_TAG_SIZE = 40
WIDE_SHADE_LEFT = 0.22      # 이 지점부터 오른쪽으로 점점 어둡게(선형 그라데이션)
WIDE_SHADE_MAX = 0.90       # 오른쪽 끝에서 검정이 덮는 정도 — 제목 자리(왼쪽 끝)에서 35%쯤
WIDE_LINE_GAP = 1.22        # 줄 높이 = 글자 크기 × 이 값
# (글자 크기, 한 줄 글자 수, 최대 줄 수) — 위에서부터 제목이 다 들어가는 첫 크기를 쓴다(2026-11-23).
# 75자짜리 지면 제목은 64px에서 꼬리가 잘려 없어졌고, 58px이면 6줄로 들어간다.
WIDE_TITLE_LADDER = ((64, 15, 5), (58, 17, 6), (52, 19, 6))


def _wrap(title: str, width: int) -> list[str]:
    head = title.split(" | ")[0]  # 지면 편 제목의 날짜·시리즈 꼬리(' | November 17 2026 | Front Page Daily')는 썸네일에 넣지 않는다
    return textwrap.wrap(" ".join(head.split()), width=width, break_long_words=True) or [""]


def wide_title(text: str) -> tuple[list[str], int, int]:
    """제목 → (줄들, 글자 크기, 줄 높이). 다 들어가는 가장 큰 크기를 고르고, 끝까지 넘치면 …로 줄인다."""
    for size, wrap, max_lines in WIDE_TITLE_LADDER:
        lines = _wrap(text, wrap)
        if len(lines) <= max_lines:
            return lines, size, round(size * WIDE_LINE_GAP)
    wrap, max_lines = WIDE_TITLE_LADDER[-1][1], WIDE_TITLE_LADDER[-1][2]
    lines = _wrap(text, wrap)[:max_lines]
    lines[-1] = lines[-1][: wrap - 1].rstrip() + "…"
    size = WIDE_TITLE_LADDER[-1][0]
    return lines, size, round(size * WIDE_LINE_GAP)


def wide_wrap_title(title: str) -> list[str]:
    """제목 → 썸네일에 들어갈 줄들(크기 결정은 wide_title)."""
    return wide_title(title)[0]


def build_wide_args(photo: Path, out: Path, title_files: list[Path], tag_file: Path, size: tuple[int, int],
                    title_size: int = WIDE_TITLE_LADDER[0][0], line_h: int | None = None) -> list[str]:
    """사진을 화면 가득(cover) 깔고 오른쪽에 그림자를 얹은 뒤 영문 제목을 왼쪽 정렬로 넣는다.

    사진을 높이에 맞춰 넣고 남는 자리를 흐린 배경으로 채우던 예전 방식은 사진·배경 경계선이 눈에 보였다(2026-11-23 시험).
    size(원본 사진 크기)는 호출부 호환용으로만 받는다 — 가로·세로 어느 쪽이든 가운데를 잘라 1280x720을 채운다."""
    line_h = line_h or round(title_size * WIDE_LINE_GAP)
    n = len(title_files)
    top = (WIDE_H - n * line_h) // 2 + 24
    tag_y = max(36, top - 74)
    draws = [
        _drawtext(tf, title_size, sc.TITLE_COLOR, str(WIDE_TEXT_X), top + i * line_h)
        for i, tf in enumerate(title_files)
    ]
    draws.append(_drawtext(tag_file, WIDE_TAG_SIZE, sc.ACCENT_COLOR, str(WIDE_TEXT_X), tag_y))
    left, ramp = WIDE_SHADE_LEFT, 1 - WIDE_SHADE_LEFT
    alpha = f"'clip(255*{WIDE_SHADE_MAX}*((X/{WIDE_W}-{left})/{ramp}),0,255)'"  # 오른쪽으로 갈수록 짙어지는 알파
    graph = (
        f"[0:v]scale={WIDE_W}:{WIDE_H}:force_original_aspect_ratio=increase:flags=lanczos,crop={WIDE_W}:{WIDE_H}[bg];"
        f"color=c=black:s={WIDE_W}x{WIDE_H}:d=1,format=rgba,geq=r=0:g=0:b=0:a={alpha}[shade];"
        f"[bg][shade]overlay=0:0:format=auto,{','.join(draws)}[out]"
    )
    return ["ffmpeg", "-y", "-i", str(photo), "-filter_complex", graph, "-map", "[out]", "-frames:v", "1", "-q:v", "1", str(out)]


def make_wide(photo: Path, title: str, out: Path) -> None:
    """photo + title → 가로 1280x720 JPEG(롱폼 썸네일). 실패하면 RuntimeError."""
    if not sc.FONT.exists():
        raise RuntimeError(f"글꼴 파일이 없습니다: {sc.FONT}")
    lines, title_size, line_h = wide_title(title)
    with tempfile.TemporaryDirectory() as tmp:
        files = []
        for i, line in enumerate(lines):
            f = Path(tmp) / f"t{i}.txt"
            f.write_text(line, encoding="utf-8")
            files.append(f)
        tag = Path(tmp) / "tag.txt"
        tag.write_text("AI PRISM", encoding="utf-8")
        result = subprocess.run(build_wide_args(photo, out, files, tag, photo_size(photo), title_size, line_h),
                                capture_output=True, text=True)
    if result.returncode != 0 or not out.exists():
        raise RuntimeError(f"가로 썸네일 합성 실패(returncode={result.returncode}): {result.stderr[-500:]}")


def make_wide_from_url(photo_url: str, title: str, out: Path) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        photo = download_photo(photo_url, Path(tmp) / "photo")
        make_wide(photo, title, out)
