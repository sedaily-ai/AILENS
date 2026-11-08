"""쇼츠 합성(shorts_compose) — 제목 나누기와 ffmpeg 인자. 실제 ffmpeg 실행은 하지 않는다."""
import sys
import types
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import shorts_compose  # noqa: E402


def test_short_title_is_one_line():
    assert shorts_compose.wrap_title("Seoul rents rise") == ["Seoul rents rise"]


def test_long_title_wraps_to_max_lines_with_ellipsis():
    lines = shorts_compose.wrap_title("Only a fraction of Seoul's redevelopment zones have broken ground despite the new rules " * 2)
    assert len(lines) == shorts_compose.TITLE_MAX_LINES
    assert lines[-1].endswith("…")
    assert all(len(line) <= shorts_compose.TITLE_WRAP for line in lines)


def test_date_tail_after_pipe_is_dropped():
    assert shorts_compose.wrap_title("Leveraged Chip ETF Losses and Won Shock | November 7 2026") == [
        "Leveraged Chip ETF", "Losses and Won Shock"]


def test_real_episode_titles_fit_without_ellipsis():
    for t in (
        "Bond-Mixed ETFs Top 17 Trillion Won, Dividends Rise: What It Means for Retirees",
        "Eunma Reconstruction Levy and Public-Site Compensation Reform",
        "AI Checkout Goes Bakery: Why Vision Checkout's Growth Is Hitting a Wall",
    ):
        assert not shorts_compose.wrap_title(t)[-1].endswith("…"), t


def test_build_args_places_video_in_vertical_canvas_without_shell():
    files = [Path("/t/t0.txt"), Path("/t/t1.txt")]
    args = shorts_compose.build_args(Path("/in.mp4"), Path("/out.mp4"), files, (Path("/t/b.txt"), Path("/t/s.txt")))
    assert isinstance(args, list) and args[0] == "ffmpeg"
    graph = args[args.index("-filter_complex") + 1]
    assert "scale=1080:-2" in graph and "overlay=0:(H-h)/2" in graph
    assert graph.count("drawtext=") == 4  # 제목 2줄 + 배너 2줄
    assert "expansion=none" in graph  # 제목의 % 등이 해석되지 않는다
    assert "s=1080x1920" in " ".join(args)
    assert args[args.index("-c:a") + 1] == "copy" and args[-1] == "/out.mp4"


def test_compose_raises_with_stderr_tail_when_ffmpeg_fails():
    import tempfile
    original = shorts_compose.subprocess.run
    shorts_compose.subprocess.run = lambda *a, **k: types.SimpleNamespace(returncode=1, stderr="boom: no such filter")
    try:
        with tempfile.TemporaryDirectory() as tmp:
            try:
                shorts_compose.compose(Path(tmp) / "in.mp4", Path(tmp) / "out.mp4", "Title")
            except RuntimeError as e:
                assert "boom: no such filter" in str(e)
            else:
                raise AssertionError("실패해야 한다")
    finally:
        shorts_compose.subprocess.run = original


def test_font_file_exists():
    assert shorts_compose.FONT.exists(), shorts_compose.FONT
