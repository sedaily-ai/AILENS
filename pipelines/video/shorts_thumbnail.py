"""PRISM 쇼츠 썸네일 이미지 — 기사 사진 + 제목 (2026-11-17).

영상은 건드리지 않고 별도 이미지(1080x1920 JPEG)만 만든다. 폰 유튜브 앱·스튜디오에서 수동으로 올리거나,
이후 thumbnails.set API 연결에 그대로 쓴다. 제목 나누기·글꼴·팔레트는 shorts_compose와 같은 것을 쓴다.

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
WIDE_MAX_UPSCALE = 1.25     # 사진을 이 배율보다 크게 늘리지 않는다(뭉개짐 방지). 모자라는 곳은 흐린 배경
WIDE_TEXT_X = 690
WIDE_TITLE_SIZE = 76
WIDE_TITLE_LINE_H = 96
WIDE_TITLE_WRAP = 12
WIDE_SHADE_LEFT = 0.38      # 이 지점부터 오른쪽으로 점점 어둡게
WIDE_SHADE_STEPS = 30


def wide_wrap_title(title: str) -> list[str]:
    title = title.split(" | ")[0]
    lines = textwrap.wrap(" ".join(title.split()), width=WIDE_TITLE_WRAP, break_long_words=True) or [""]
    if len(lines) > 4:
        lines = lines[:4]
        lines[-1] = lines[-1][: WIDE_TITLE_WRAP - 1].rstrip() + "…"
    return lines


def build_wide_args(photo: Path, out: Path, title_files: list[Path], tag_file: Path, size: tuple[int, int]) -> list[str]:
    w, h = size
    s = min(WIDE_H / h, WIDE_MAX_UPSCALE)
    fg_w, fg_h = round(w * s / 2) * 2, round(h * s / 2) * 2
    fg_x = 0 if fg_w >= 900 else 50
    fg_y = (WIDE_H - fg_h) // 2
    n = len(title_files)
    top = (WIDE_H - n * WIDE_TITLE_LINE_H) // 2 + 20
    shade = ",".join(
        f"drawbox=x=iw*{WIDE_SHADE_LEFT + (1 - WIDE_SHADE_LEFT) * k / WIDE_SHADE_STEPS:.4f}:y=0:w=iw:h=ih:color=black@0.04:t=fill"
        for k in range(WIDE_SHADE_STEPS)
    )
    draws = [
        _drawtext(tf, WIDE_TITLE_SIZE, sc.TITLE_COLOR, str(WIDE_TEXT_X), top + i * WIDE_TITLE_LINE_H)
        for i, tf in enumerate(title_files)
    ]
    draws.append(_drawtext(tag_file, 44, sc.ACCENT_COLOR, str(WIDE_TEXT_X), 50))
    graph = (
        f"[0:v]split[a][b];"
        f"[a]scale={WIDE_W}:{WIDE_H}:force_original_aspect_ratio=increase,crop={WIDE_W}:{WIDE_H},gblur=sigma=40,eq=brightness=-0.2[bg];"
        f"[b]scale={fg_w}:{fg_h}:flags=lanczos[fg];"
        f"[bg][fg]overlay={fg_x}:{fg_y},{shade},{','.join(draws)}[out]"
    )
    return ["ffmpeg", "-y", "-i", str(photo), "-filter_complex", graph, "-map", "[out]", "-frames:v", "1", "-q:v", "1", str(out)]


def make_wide(photo: Path, title: str, out: Path) -> None:
    """photo + title → 가로 1280x720 JPEG(롱폼 썸네일). 실패하면 RuntimeError."""
    if not sc.FONT.exists():
        raise RuntimeError(f"글꼴 파일이 없습니다: {sc.FONT}")
    with tempfile.TemporaryDirectory() as tmp:
        files = []
        for i, line in enumerate(wide_wrap_title(title)):
            f = Path(tmp) / f"t{i}.txt"
            f.write_text(line, encoding="utf-8")
            files.append(f)
        tag = Path(tmp) / "tag.txt"
        tag.write_text("AI PRISM", encoding="utf-8")
        result = subprocess.run(build_wide_args(photo, out, files, tag, photo_size(photo)), capture_output=True, text=True)
    if result.returncode != 0 or not out.exists():
        raise RuntimeError(f"가로 썸네일 합성 실패(returncode={result.returncode}): {result.stderr[-500:]}")


def make_wide_from_url(photo_url: str, title: str, out: Path) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        photo = download_photo(photo_url, Path(tmp) / "photo")
        make_wide(photo, title, out)
