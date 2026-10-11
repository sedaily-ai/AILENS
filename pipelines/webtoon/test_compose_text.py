"""compose_text 순수 함수 특성화 테스트(2026-10-12). 글꼴·그리기 없이 계산만 검증한다."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
sys.path.insert(0, str(Path(__file__).parent.parent / "common"))

import compose_text as ct  # noqa: E402


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
