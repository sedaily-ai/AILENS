"""handle_get — 지금 작업 번호를 편별 status.json 기준으로 보여 주는지(2026-11-10 주식 '대기' 고착)."""
from __future__ import annotations

import json

from routes import prism_batch

BATCH = "20261110-1005-a2ce9a"


def _setup(monkeypatch, files: dict) -> None:
    monkeypatch.setattr(prism_batch, "_read_json", lambda key: files.get(key))
    monkeypatch.setattr(prism_batch, "_public_base", lambda: "https://cdn")


def _get() -> dict:
    res = prism_batch.handle_get({}, {"batch_id": BATCH}, {})
    return json.loads(res["body"])["data"]["items"] if "data" in json.loads(res["body"]) else json.loads(res["body"])["items"]


def test_status_job_id_wins_when_manifest_lost_the_retry(monkeypatch):
    # 동시 [다시 시도]로 manifest에는 옛 번호(r2b49)가 남고, 실제 작업(r0c87)은 끝났다.
    p = prism_batch._PREFIX
    _setup(monkeypatch, {
        f"{p}/{BATCH}/manifest.json": {"items": [{"item_id": "03", "job_id": f"prism-{BATCH}-03-r2b49"}]},
        f"{p}/{BATCH}/03.status.json": {"stage": "done", "job_id": f"prism-{BATCH}-03-r0c87", "title": "T"},
    })
    row = _get()[0]
    assert row["stage"] == "done"
    assert row["job_id"].endswith("-r0c87")
    assert row["video_url"].endswith(f"prism-{BATCH}-03-r0c87.mp4")


def test_just_retried_shows_queued(monkeypatch):
    p = prism_batch._PREFIX
    _setup(monkeypatch, {
        f"{p}/{BATCH}/manifest.json": {"items": [{"item_id": "03", "job_id": f"prism-{BATCH}-03"}]},
        f"{p}/{BATCH}/03.status.json": {"stage": "queued", "job_id": f"prism-{BATCH}-03-rabcd"},
    })
    row = _get()[0]
    assert row["stage"] == "queued" and row["job_id"].endswith("-rabcd")


def test_no_status_falls_back_to_manifest(monkeypatch):
    p = prism_batch._PREFIX
    _setup(monkeypatch, {f"{p}/{BATCH}/manifest.json": {"items": [{"item_id": "01", "job_id": f"prism-{BATCH}-01"}]}})
    row = _get()[0]
    assert row["stage"] == "queued" and row["job_id"] == f"prism-{BATCH}-01"
