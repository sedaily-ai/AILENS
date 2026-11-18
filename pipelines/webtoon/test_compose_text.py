"""compose_text 순수 함수 특성화 테스트(2026-10-12). 글꼴·그리기 없이 계산만 검증한다."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
sys.path.insert(0, str(Path(__file__).parent.parent / "common"))

import compose_text as ct  # noqa: E402
import pytest  # noqa: E402
from PIL import Image, ImageChops  # noqa: E402


def test_title_fill_by_cut():
    assert ct.title_fill_for_cut(None) == ct._RED_FILL
    assert ct.title_fill_for_cut(4) == ct._NAVY_FILL
    assert ct.title_fill_for_cut(6) == ct._NAVY_FILL
    assert ct.title_fill_for_cut(2) == ct._RED_FILL
    assert ct.title_fill_for_cut(99) == ct._RED_FILL  # 표에 없는 컷은 기본색


def test_scale_helpers(monkeypatch):
    monkeypatch.setattr(ct, "_SCALE", 1.5)
    assert ct._k(10) == 15
    assert ct._w(1) == 2  # 반올림, 최소 1
    monkeypatch.setattr(ct, "_SCALE", 0.1)
    assert ct._w(1) == 1  # 최소 1


def test_oval_dims_grow_with_text_block(monkeypatch):
    monkeypatch.setattr(ct, "_SCALE", 1.0)
    w, h = ct._oval_dims(100, 50)
    assert (w, h) == (100 * 1.36 + 26, 50 * 1.56 + 20)
    assert ct._oval_dims(200, 50)[0] > w


@pytest.mark.parametrize("text", [
    "예산이 승인되면 내년부터 시범 운영한다.",
    "가온시는 예산 승인 시 내년부터 외곽 네 개 노선에서 시범 운영하며 기존 운행 시간표는 당분간 유지한다고 밝혔다. " * 3,
])
def test_narration_stays_inside_band(text):
    img = Image.new("RGB", (1216, 832), "white")
    before = img.copy()
    y0 = ct.draw_narration(img, text)
    assert ImageChops.difference(before, img).crop((0, 0, img.width, y0)).getbbox() is None
    assert ImageChops.difference(before, img).getbbox() is not None


def test_impossible_narration_fails_without_mutating_image():
    img = Image.new("RGB", (1216, 832), "white")
    before = img.copy()
    with pytest.raises(ct.NarrationOverflowError):
        ct.draw_narration(img, "매우 긴 문구 " * 1000)
    assert ImageChops.difference(before, img).getbbox() is None


@pytest.mark.parametrize("speaker,left", [("A", True), ("B", False)])
def test_single_bubble_points_to_its_speaker(speaker, left):
    img = Image.new("RGB", (1216, 832), "white")
    layout = ct.draw_dialogue(img, [{"speaker": speaker, "line": "조건을 확인해요.", "tone": "보통"}])
    assert len(layout) == 1
    assert (layout[0]["tip_x"] < 0.5) == left


def test_explicit_single_bubble_position_still_wins():
    img = Image.new("RGB", (1216, 832), "white")
    layout = ct.draw_dialogue(img, [{"speaker": "A", "line": "확인해요.", "tone": "보통",
                                    "pos": {"x": 0.7, "y": 0.1}, "tail": {"x": 0.8, "y": 0.5}}])
    assert layout[0]["tip_x"] == pytest.approx(0.8, abs=0.002)


def test_compose_never_covers_art_even_with_legacy_bubbles(tmp_path):
    path = tmp_path / "panel.png"
    Image.new("RGB", (1216, 832), "navy").save(path)
    before = Image.open(path).copy()
    layout = ct.compose(path, {"cut": 1, "title": "제목", "caption": "숫자", "closing_caption": "마무리",
                              "bubble_style": "oval", "bubble_margin": True,
                              "dialogue": [{"speaker": "A", "line": "조건을 확인하나요?"},
                                           {"speaker": "B", "line": "예산 심의가 필요해요."}],
                              "narration": "예산 승인 뒤 결정한다."})
    assert layout == []
    with Image.open(path) as result:
        assert result.width == before.width and result.height > before.height
        assert ImageChops.difference(before, result.crop((0, 0, before.width, before.height))).getbbox() is None
        band = result.crop((0, before.height, result.width, result.height))
        assert band.getpixel((0, 0)) == (32, 32, 32)
        assert band.getextrema()[0][1] == 255


def test_compose_scales_only_the_art(tmp_path):
    path = tmp_path / "panel.png"
    Image.new("RGB", (100, 60), "navy").save(path)
    assert ct.compose(path, {}, scale=1.5) == []
    with Image.open(path) as img:
        assert img.size == (150, 90)
        assert img.getpixel((75, 45)) == (0, 0, 128)


def test_subtitle_overflow_preserves_original_file(tmp_path):
    path = tmp_path / "long.png"
    Image.new("RGB", (1216, 832), "navy").save(path)
    before = path.read_bytes()
    with pytest.raises(ct.NarrationOverflowError):
        ct.compose(path, {"narration": "아주 긴 설명 " * 1000})
    assert path.read_bytes() == before


def test_subtitle_save_failure_preserves_original_file(tmp_path, monkeypatch):
    path = tmp_path / "panel.png"
    Image.new("RGB", (1216, 832), "navy").save(path)
    before = path.read_bytes()

    def partial_save(image, target):
        Path(target).write_bytes(b"partial image")
        raise OSError("disk full")

    monkeypatch.setattr(Image.Image, "save", partial_save)
    with pytest.raises(OSError, match="disk full"):
        ct.compose(path, {"narration": "자막"})
    assert path.read_bytes() == before
    assert not path.with_name("panel.caption-tmp.png").exists()
