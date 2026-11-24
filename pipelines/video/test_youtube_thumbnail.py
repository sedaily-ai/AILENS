"""youtube_upload.set_thumbnail — thumbnails.set로 썸네일 이미지를 올리는지(2026-11-23).

실제 유튜브 호출은 하지 않고 urlopen을 바꿔 끼워 요청 모양(주소·메서드·본문)만 본다.
"""
import io
import sys
import urllib.error
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "common"))
sys.path.insert(0, str(Path(__file__).parent))

import youtube_upload  # noqa: E402


class FakeResponse:
    def __init__(self, body: bytes = b'{"kind": "youtube#thumbnailSetResponse"}'):
        self._body = body

    def read(self):
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def _creds():
    return {"client_id": "cid", "client_secret": "secret", "refresh_token": "refresh"}


def test_posts_image_to_thumbnails_set(monkeypatch, tmp_path):
    calls = []
    monkeypatch.setattr(youtube_upload, "_access_token", lambda creds: "tok")
    monkeypatch.setattr(youtube_upload.urllib.request, "urlopen", lambda req, timeout=None: calls.append(req) or FakeResponse())
    thumb = tmp_path / "thumb.jpg"
    thumb.write_bytes(b"jpeg-bytes")

    youtube_upload.set_thumbnail("abc123", thumb, _creds())

    assert len(calls) == 1
    req = calls[0]
    assert req.full_url == "https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=abc123&uploadType=media"
    assert req.get_method() == "POST"
    assert req.data == b"jpeg-bytes"
    assert req.headers["Content-type"] == "image/jpeg"
    assert req.headers["Authorization"] == "Bearer tok"


def test_png_content_type(monkeypatch, tmp_path):
    calls = []
    monkeypatch.setattr(youtube_upload, "_access_token", lambda creds: "tok")
    monkeypatch.setattr(youtube_upload.urllib.request, "urlopen", lambda req, timeout=None: calls.append(req) or FakeResponse())
    thumb = tmp_path / "thumb.png"
    thumb.write_bytes(b"png-bytes")

    youtube_upload.set_thumbnail("abc123", thumb, _creds())
    assert calls[0].headers["Content-type"] == "image/png"


def test_too_large_file_is_refused_before_upload(monkeypatch, tmp_path):
    monkeypatch.setattr(youtube_upload, "_access_token", lambda creds: "tok")
    sent = []
    monkeypatch.setattr(youtube_upload.urllib.request, "urlopen", lambda req, timeout=None: sent.append(req) or FakeResponse())
    thumb = tmp_path / "big.jpg"
    thumb.write_bytes(b"x" * (youtube_upload._THUMBNAIL_MAX_BYTES + 1))

    try:
        youtube_upload.set_thumbnail("abc123", thumb, _creds())
    except RuntimeError as e:
        assert "2MB" in str(e)
    else:  # pragma: no cover
        raise AssertionError("2MB 초과는 거부해야 한다")
    assert sent == []


def test_http_error_becomes_runtime_error_with_body(monkeypatch, tmp_path):
    monkeypatch.setattr(youtube_upload, "_access_token", lambda creds: "tok")

    def boom(req, timeout=None):
        raise urllib.error.HTTPError(req.full_url, 403, "Forbidden", {}, io.BytesIO(b'{"error":"forbidden"}'))

    monkeypatch.setattr(youtube_upload.urllib.request, "urlopen", boom)
    thumb = tmp_path / "thumb.jpg"
    thumb.write_bytes(b"jpeg-bytes")

    try:
        youtube_upload.set_thumbnail("abc123", thumb, _creds())
    except RuntimeError as e:
        assert "403" in str(e) and "forbidden" in str(e)
    else:  # pragma: no cover
        raise AssertionError("HTTP 오류는 RuntimeError로 바뀌어야 한다")
