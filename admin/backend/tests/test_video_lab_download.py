"""영상 내려받기 파일명(routes/video_lab.py) — 한글 이름은 filename*로, 영어 이름은 예전 그대로."""
from routes import video_lab


def test_korean_filename_uses_rfc5987():
    name = video_lab._download_filename({"filename": "1106_부동산.mp4"}, "job")
    assert name == "1106_부동산.mp4"
    cd = video_lab._content_disposition(name)
    assert cd.startswith('attachment; filename="1106__.mp4"; ')
    assert "filename*=UTF-8''1106_%EB%B6%80%EB%8F%99%EC%82%B0.mp4" in cd
    cd.encode("ascii")  # HTTP 헤더는 ASCII만


def test_ascii_filename_unchanged():
    name = video_lab._download_filename({"filename": "ai_prism_CEO_EN_20261105-1300"}, "job")
    assert name == "ai_prism_CEO_EN_20261105-1300.mp4"
    assert video_lab._content_disposition(name) == f'attachment; filename="{name}"'


def test_unsafe_characters_removed():
    name = video_lab._download_filename({"filename": 'a/b"c;d.mp4'}, "job")
    assert "/" not in name and '"' not in name and ";" not in name
    assert video_lab._download_filename({}, "prism-x-01") == "prism-x-01.mp4"
