"""PRISM 가로 영상 → 유튜브 쇼츠용 세로(9:16) 영상 합성 (2026-11-06).

이미 만든 가로 mp4(1920x1080)를 1080x1920 캔버스 가운데에 그대로 넣고, 위에 제목, 아래에 AI PRISM 배너를
붙인다(서울경제TV 쇼츠와 같은 구조). 장면을 세로로 다시 그리거나 Lambda로 다시 렌더하지 않고 ffmpeg로
합성만 하므로 렌더 비용이 늘지 않고 가로 공개도 늦어지지 않는다. 오디오는 그대로 복사한다.
"""
from __future__ import annotations

import subprocess
import tempfile
import textwrap
from pathlib import Path

CANVAS_W, CANVAS_H = 1080, 1920
FONT = Path(__file__).parent / "public" / "fonts" / "NotoSansKR-800.ttf"

# PRISM 아웃트로와 같은 팔레트(남색 바탕, 종이색 글자, 노란 강조).
BG_COLOR = "0x1C2A4A"
TITLE_COLOR = "0xF2EBDD"
ACCENT_COLOR = "0xF7C531"

TITLE_FONT_SIZE = 76
TITLE_LINE_HEIGHT = 96
TITLE_TOP = 230
TITLE_WRAP = 20      # 한 줄 글자 수 (1080 폭에 좌우 여백 60px을 두고 맞춘 값)
TITLE_MAX_LINES = 3
BANNER_Y = 1450


def wrap_title(title: str) -> list[str]:
    """제목을 최대 3줄로 나눈다. 넘치면 마지막 줄 끝을 …로 줄인다."""
    lines = textwrap.wrap(" ".join(title.split()), width=TITLE_WRAP, break_long_words=True) or [""]
    if len(lines) > TITLE_MAX_LINES:
        lines = lines[:TITLE_MAX_LINES]
        lines[-1] = lines[-1][: TITLE_WRAP - 1].rstrip() + "…"
    return lines


def _drawtext(textfile: Path, size: int, color: str, y: int) -> str:
    # 파일에서 읽고 expansion=none으로 % 등이 해석되지 않게 한다(제목에 어떤 문자가 와도 안전).
    return (
        f"drawtext=fontfile={FONT}:textfile={textfile}:expansion=none:fontsize={size}:fontcolor={color}"
        f":x=(w-text_w)/2:y={y}"
    )


def build_args(src: Path, out: Path, textfiles: list[Path], banner_files: tuple[Path, Path]) -> list[str]:
    """ffmpeg 인자 목록(셸을 거치지 않는다)."""
    draws = [
        _drawtext(tf, TITLE_FONT_SIZE, TITLE_COLOR, TITLE_TOP + i * TITLE_LINE_HEIGHT)
        for i, tf in enumerate(textfiles)
    ]
    draws.append(_drawtext(banner_files[0], 120, ACCENT_COLOR, BANNER_Y))
    draws.append(_drawtext(banner_files[1], 44, TITLE_COLOR, BANNER_Y + 150))
    graph = (
        f"[1:v]scale={CANVAS_W}:-2[v];[0:v][v]overlay=0:(H-h)/2[bg];[bg]" + ",".join(draws) + "[out]"
    )
    return [
        "ffmpeg", "-y",
        "-f", "lavfi", "-i", f"color=c={BG_COLOR}:s={CANVAS_W}x{CANVAS_H}:r=30",
        "-i", str(src),
        "-filter_complex", graph,
        "-map", "[out]", "-map", "1:a?",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
        "-c:a", "copy", "-shortest", "-movflags", "+faststart",
        str(out),
    ]


def compose(src: Path, out: Path, title: str) -> None:
    """src(가로 mp4) → out(세로 쇼츠 mp4). 실패하면 RuntimeError(ffmpeg 오류 끝부분 포함)."""
    if not FONT.exists():
        raise RuntimeError(f"글꼴 파일이 없습니다: {FONT}")
    with tempfile.TemporaryDirectory() as tmp:
        files = []
        for i, line in enumerate(wrap_title(title)):
            f = Path(tmp) / f"title{i}.txt"
            f.write_text(line, encoding="utf-8")
            files.append(f)
        brand = (Path(tmp) / "brand.txt", Path(tmp) / "sub.txt")
        brand[0].write_text("AI PRISM", encoding="utf-8")
        brand[1].write_text("Seoul Economic Daily", encoding="utf-8")
        result = subprocess.run(build_args(src, out, files, brand), capture_output=True, text=True)
    if result.returncode != 0 or not out.exists():
        raise RuntimeError(f"ffmpeg 합성 실패(returncode={result.returncode}): {result.stderr[-500:]}")
