"""prism_batch._run — 지면 편 추가 지시와 금액 표시 시 대본 1회 다시 쓰기(2026-11-18)."""
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

    def download_file(self, Bucket, Key, path):
        Path(path).write_text("제목: 기사\nSK하이닉스는 112만 원을 기록했다.", encoding="utf-8")


def _setup(monkeypatch, flags_by_script):
    """대본 AI 호출(user_message)을 기록하고, 장면은 대본 이름표만 담는다. 렌더는 실패로 끝내 그 앞까지만 본다."""
    calls = []

    def write(guide, message, display_name):
        calls.append(message)
        return f"script-{len(calls)}"

    monkeypatch.setattr(prism_batch.ddb_prompt, "load_prompt", lambda c: c)
    monkeypatch.setattr(prism_batch, "_write_script", write)
    monkeypatch.setattr(prism_batch, "_make_scene", lambda guide, text: ({"cuts": [], "tag": text}, ""))
    monkeypatch.setattr(prism_batch, "_safe_number_issues", lambda script, article: flags_by_script[script["tag"]])
    monkeypatch.setattr(prism_batch, "date_issues", lambda *a, **k: [])
    monkeypatch.setattr(prism_batch, "_episode_title", lambda t: t)
    monkeypatch.setattr(prism_batch, "render_and_upload", lambda *a, **k: False)
    return calls


def _run(s3, tmp_path, type_code="PG1"):
    prism_batch._run(s3, tmp_path, batch_id="b", item_id="01", job_id="j", article_key="k",
                     type_code=type_code, recording_date="2026-11-17")
    return json.loads(s3.objects[prism_batch._status_key("b", "01")])


def test_rewrite_adopted_when_fewer_flags(monkeypatch, tmp_path):
    calls = _setup(monkeypatch, {"script-1": ["[컷1] 금액 '112 trillion won'"], "script-2": []})
    s3 = FakeS3()
    st = _run(s3, tmp_path)
    assert len(calls) == 2 and "[금액 재확인 요청]" in calls[1] and "112 trillion won" in calls[1]
    assert st["amount_rewrite"] == "adopted" and "number_flags" not in st
    assert s3.objects["media/prism-batch/b/01.script.txt"] == b"script-2"


def test_rewrite_kept_original_when_not_better(monkeypatch, tmp_path):
    calls = _setup(monkeypatch, {"script-1": ["a"], "script-2": ["a", "b"]})
    s3 = FakeS3()
    st = _run(s3, tmp_path)
    assert len(calls) == 2 and st["amount_rewrite"] == "kept-original" and st["number_flags"] == ["a"]
    assert s3.objects["media/prism-batch/b/01.script.txt"] == b"script-1"


def test_no_rewrite_without_flags(monkeypatch, tmp_path):
    calls = _setup(monkeypatch, {"script-1": []})
    st = _run(FakeS3(), tmp_path)
    assert len(calls) == 1 and "amount_rewrite" not in st


def test_paper_note_only_for_paper_types(monkeypatch, tmp_path):
    calls = _setup(monkeypatch, {"script-1": [], "script-2": []})
    _run(FakeS3(), tmp_path, "PG3")
    _run(FakeS3(), tmp_path, "SG1")
    assert "[지면 영상 추가 지시]" in calls[0] and "[지면 영상 추가 지시]" not in calls[1]


def test_paper_title_shape():
    import datetime as dt
    d = dt.date(2026, 11, 17)
    f = prism_batch.paper_title
    # 시험에서 나온 실제 제목들
    # 꼬리 빠진 1면 제목 — 꼬리를 붙이면 107자라 단어 단위로 줄인다(100자 제한)
    t = f("Memory Prices Slide Twenty Percent as Insurance Agency Faces Shutdown | November 17 2026", d, "Front Page Daily")
    assert t == "Memory Prices Slide Twenty Percent as Insurance Agency Faces | November 17 2026 | Front Page Daily"
    assert len(t) <= 100
    assert f("KOSPI Breaks 5,000 as US Tightens AI Chip Rules | November 18, 2026 | Front Page Daily", d, "Front Page Daily") \
        == "KOSPI Breaks 5,000 as US Tightens AI Chip Rules | November 17 2026 | Front Page Daily"
    assert f("Insurers Cleared in LH Bid-Rigging Case; Upbit Posts First Quarterly Loss | November 17 2026 | Finance Daily", d,
             "Finance Daily") == "Insurers Cleared in LH Bid-Rigging Case | November 17 2026 | Finance Daily"
    long = f("Word " * 30, d, "Securities Daily")
    assert len(long) <= 100 and long.endswith("Word | November 17 2026 | Securities Daily")
