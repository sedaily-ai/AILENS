"""prism_batch.run — 예상 못 한 오류로 죽어도 상태를 error로 남기는지(2026-11-10 '장면 나누는 중'에 멈춘 문제)."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "common"))
sys.path.insert(0, str(Path(__file__).parent))

import prism_batch  # noqa: E402


class FakeS3:
    def __init__(self):
        self.objects = {}

    def put_object(self, Bucket, Key, Body, ContentType=None):
        self.objects[Key] = Body

    def get_object(self, Bucket, Key):
        import io
        if Key not in self.objects:
            raise KeyError(Key)
        return {"Body": io.BytesIO(self.objects[Key])}


def test_crash_is_recorded_as_error_and_keeps_title(monkeypatch, tmp_path):
    s3 = FakeS3()
    key = prism_batch._status_key("b1", "03")
    s3.objects[key] = json.dumps({"job_id": "j", "type": "SG8", "stage": "scene", "title": "T"}).encode()

    def boom(*a, **k):
        raise ValueError("invalid literal for int() with base 10: ''")

    monkeypatch.setattr(prism_batch, "_run", boom)
    monkeypatch.setattr(prism_batch.prism_notify, "notify_if_batch_done", lambda *a, **k: None)
    ok = prism_batch.run(s3, tmp_path, batch_id="b1", item_id="03", job_id="j-r1", article_key="k",
                         type_code="SG8", recording_date="2026-11-10")
    assert ok is False
    st = json.loads(s3.objects[key])
    assert st["stage"] == "error" and st["title"] == "T" and st["job_id"] == "j-r1"
    assert "ValueError" in st["message"]
