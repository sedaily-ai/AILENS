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


def test_margin_bubble_tails_stop_above_faces(tmp_path):
    path = tmp_path / "panel.png"
    Image.new("RGB", (1216, 832), "navy").save(path)
    layout = ct.compose(path, {"bubble_style": "oval", "bubble_margin": True,
                              "dialogue": [{"speaker": "A", "line": "조건을 확인하나요?"},
                                           {"speaker": "B", "line": "예산 심의가 필요해요."}],
                              "narration": "예산 승인 뒤 결정한다."})
    height = Image.open(path).height
    assert len(layout) == 2
    assert all(box["tip_y"] * height <= round(832 * 0.30) + 832 * 0.05 for box in layout)
