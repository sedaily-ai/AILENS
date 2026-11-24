"""prism_batch._run — 기사 사진으로 유튜브 썸네일을 다는지(2026-11-23).

영상 업로드까지 끝난 뒤 thumbnails.set을 부르고, 썸네일이 실패해도 편은 완료로 두는지 본다.
ffmpeg·유튜브·S3는 모두 바꿔 끼운다(실제 호출 없음).
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "common"))
sys.path.insert(0, str(Path(__file__).parent))

import prism_batch  # noqa: E402
import youtube_upload  # noqa: E402

ARTICLE = """제목: Memory prices slide as insurance agency faces shutdown
기자: 홍길동
날짜: 2026-11-17 10:00
지면: 1면
카테고리: 경제
URL: https://www.sedaily.com/article/20000001
사진: https://wimg.sedaily.com/NewsImg/2026/11/17/ABC123_P1.jpg

본문 첫 문단입니다.
"""
PHOTO = "https://wimg.sedaily.com/NewsImg/2026/11/17/ABC123_P1.jpg"
CREDS = {"client_id": "cid", "client_secret": "s", "refresh_token": "r"}


class FakeS3:
    def __init__(self, article=ARTICLE):
        self.objects = {}
        self.article = article

    def put_object(self, Bucket, Key, Body, ContentType=None):
        self.objects[Key] = Body

    def get_object(self, Bucket, Key):
        import io
        if Key not in self.objects:
            raise KeyError(Key)
        return {"Body": io.BytesIO(self.objects[Key])}

    def download_file(self, Bucket, Key, path):
        Path(path).write_text(self.article, encoding="utf-8")


def _setup(monkeypatch, tmp_path, *, article=ARTICLE, photo_raises=False, shorts=False, videos=("vid-long", "vid-shorts")):
    """대본·장면·렌더·업로드를 전부 바꿔 끼우고, 썸네일 호출 기록을 돌려준다."""
    made, set_calls, uploaded = [], [], []
    prompts = []

    def write(guide, message, display_name):
        prompts.append(message)
        return f"script-{len(prompts)}"

    def upload(mp4, meta, creds):
        uploaded.append((Path(mp4).name, meta["title"]))
        return videos[len(uploaded) - 1]

    def make_thumb(photo_url, title, out):
        made.append((photo_url, title, Path(out).name))
        Path(out).write_bytes(b"jpeg")  # set_thumbnail 쪽은 바꿔 끼우므로 내용은 상관없다

    def set_thumb(video_id, thumb_path, creds):
        if photo_raises:
            raise RuntimeError("YouTube 썸네일 403: forbidden")
        set_calls.append((video_id, Path(thumb_path).name))

    monkeypatch.setattr(prism_batch.ddb_prompt, "load_prompt", lambda c: c)
    monkeypatch.setattr(prism_batch, "_write_script", write)
    monkeypatch.setattr(prism_batch, "_make_scene", lambda guide, text: ({"cuts": [], "tag": text}, ""))
    monkeypatch.setattr(prism_batch, "_safe_number_issues", lambda script, article: [])
    monkeypatch.setattr(prism_batch, "date_issues", lambda *a, **k: [])
    monkeypatch.setattr(prism_batch, "_episode_title", lambda t: t)
    monkeypatch.setattr(prism_batch, "render_and_upload", lambda *a, **k: True)
    monkeypatch.setattr(prism_batch.seo_description, "build", lambda *a, **k: (None, []))
    monkeypatch.setattr(prism_batch.dailymotion_upload, "load_credentials", lambda: None)
    monkeypatch.setattr(youtube_upload, "load_credentials", lambda: CREDS)
    monkeypatch.setattr(youtube_upload, "upload", upload)
    monkeypatch.setattr(youtube_upload, "set_thumbnail", set_thumb)
    monkeypatch.setattr(prism_batch.shorts_thumbnail, "make_wide_from_url", make_thumb)
    monkeypatch.setattr(prism_batch.shorts_thumbnail, "make_from_url", make_thumb)
    monkeypatch.setattr(prism_batch.shorts_compose, "compose", lambda src, out, title: Path(out).write_bytes(b"mp4"))
    monkeypatch.setattr(prism_batch.doc_plan, "build_plan", lambda script: None)
    monkeypatch.setenv("PRISM_LAYOUT", "classic")
    monkeypatch.setenv("PRISM_SHORTS", "1" if shorts else "0")
    return {"made": made, "set": set_calls, "uploaded": uploaded, "prompts": prompts}


def _run(tmp_path, article=ARTICLE, type_code="SG8"):
    s3 = FakeS3(article)
    ok = prism_batch._run(s3, tmp_path, batch_id="b", item_id="01", job_id="j", article_key="k",
                          type_code=type_code, recording_date="2026-11-17")
    return ok, json.loads(s3.objects[prism_batch._status_key("b", "01")])


def test_sets_photo_thumbnail_after_upload(monkeypatch, tmp_path):
    rec = _setup(monkeypatch, tmp_path)
    ok, st = _run(tmp_path)
    assert ok is True
    assert rec["made"] == [(PHOTO, "script-1", "video_thumb.jpg")]
    assert rec["set"] == [("vid-long", "video_thumb.jpg")]
    assert st["youtube_thumbnail"] == "photo" and "youtube_thumbnail_error" not in st
    assert st["stage"] == "done"


def test_photo_line_is_not_sent_to_the_script_model(monkeypatch, tmp_path):
    rec = _setup(monkeypatch, tmp_path)
    _run(tmp_path)
    assert PHOTO not in rec["prompts"][0]        # 사진 주소는 대본 AI 입력에서 빠진다
    assert "URL: https://www.sedaily.com/article/20000001" in rec["prompts"][0]


def test_thumbnail_failure_keeps_episode_done(monkeypatch, tmp_path):
    rec = _setup(monkeypatch, tmp_path, photo_raises=True)
    ok, st = _run(tmp_path)
    assert ok is True and st["stage"] == "done"
    assert rec["made"]  # 그림은 만들었고
    assert rec["set"] == []  # 올리는 데서 실패
    assert st["youtube_url"] == "https://www.youtube.com/watch?v=vid-long"
    assert "403" in st["youtube_thumbnail_error"] and "youtube_thumbnail" not in st


def test_no_photo_means_no_thumbnail(monkeypatch, tmp_path):
    no_photo = ARTICLE.replace(f"사진: {PHOTO}\n", "")
    rec = _setup(monkeypatch, tmp_path, article=no_photo)
    ok, st = _run(tmp_path, article=no_photo)
    assert ok is True
    assert rec["made"] == [] and rec["set"] == []
    assert st["youtube_thumbnail"] == "none"


def test_shorts_get_vertical_photo_thumbnail(monkeypatch, tmp_path):
    rec = _setup(monkeypatch, tmp_path, shorts=True)
    ok, st = _run(tmp_path)
    assert ok is True
    assert rec["made"] == [(PHOTO, "script-1", "video_thumb.jpg"), (PHOTO, "script-1", "video_shorts_thumb.jpg")]
    assert rec["set"] == [("vid-long", "video_thumb.jpg"), ("vid-shorts", "video_shorts_thumb.jpg")]
    assert st["youtube_thumbnail"] == "photo" and st["youtube_shorts_thumbnail"] == "photo"


def test_no_credentials_skips_thumbnail(monkeypatch, tmp_path):
    rec = _setup(monkeypatch, tmp_path)
    monkeypatch.setattr(youtube_upload, "load_credentials", lambda: None)
    ok, st = _run(tmp_path)
    assert ok is True and rec["made"] == [] and rec["set"] == []
    assert "youtube_thumbnail" not in st
