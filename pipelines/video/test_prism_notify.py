"""PRISM 완료 알림 — 편별 링크, 참고, 검수 칸의 순서와 내용."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "common"))
sys.path.insert(0, str(Path(__file__).parent))

import prism_notify  # noqa: E402

ITEM = {"group": "CEO", "recording_date": "2026-11-08"}


def _desc(status: dict, notes=None) -> str:
    return prism_notify.build_message("b1", [(ITEM, status)], notes)["content"]["description"]


def test_notes_then_checks_after_cms_link():
    text = _desc({"stage": "done", "youtube_url": "y", "dailymotion_url": "d", "number_flags": ["금액 확인"]}, ["같은 그룹 2건"])
    assert "🔎검수 1건" in text
    assert text.index("CMS에서 보기") < text.index("📌 참고") < text.index("🔎 검수 확인 필요")


def test_no_sections_when_nothing_to_say():
    text = _desc({"stage": "done", "youtube_url": "y", "dailymotion_url": "d"})
    assert "📌" not in text and "🔎" not in text


def test_status_keeps_flag_lists_through_report():
    """prism_batch의 report()가 건수로 목록을 덮어쓰면 알림이 TypeError로 죽고 그 묶음 알림이 영영 안 온다."""
    source = (Path(__file__).parent / "prism_batch.py").read_text(encoding="utf-8")
    assert "date_flags=len(" not in source and "number_flags=len(" not in source


def test_shorts_link_shown_only_when_uploaded():
    base = {"stage": "done", "youtube_url": "y", "dailymotion_url": "d"}
    assert "쇼츠" not in _desc(base)  # 기본(세로 업로드 꺼짐)이면 알림이 그대로다
    text = _desc({**base, "youtube_shorts_url": "https://www.youtube.com/shorts/abc"})
    assert "|쇼츠>" in text and text.startswith("✅")


def test_shorts_error_marks_warning_but_keeps_horizontal_links():
    text = _desc({"stage": "done", "youtube_url": "y", "dailymotion_url": "d", "youtube_shorts_error": "403 quota"})
    assert text.startswith("⚠️") and "쇼츠 미업로드(403 quota)" in text and "|유튜브>" in text


def test_shorts_metadata_adds_tag_within_limits():
    import youtube_upload
    meta = {"title": "T" * 150, "description": "desc", "tags": ["a"]}
    out = youtube_upload.shorts_metadata(meta)
    assert out["title"].endswith("#Shorts") and len(out["title"]) <= 100
    assert out["description"].startswith("#Shorts") and out["tags"] == ["a"]
    assert meta["title"] == "T" * 150  # 원본은 바뀌지 않는다
