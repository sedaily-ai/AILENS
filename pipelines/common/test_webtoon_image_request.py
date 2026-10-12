"""Stability 3모델(Core·Large·Ultra) 요청 본문이 금지 문구·seed를 같이 보내는지 확인한다."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import webtoon_image as w  # noqa: E402


def _capture(monkeypatch, fn):
    sent = {}

    def fake(_client, model_id, body, **_kw):
        sent["model_id"], sent["body"] = model_id, json.loads(body)
        return b"png"

    monkeypatch.setattr(w, "_invoke_and_decode_image", fake)
    monkeypatch.setattr(w, "_get_bedrock_image_client", lambda: object())
    fn("scene")
    return sent


def test_all_three_models_send_negative_and_seed(monkeypatch):
    w.set_run_negative("anime, chibi")
    w.set_run_seed(7)
    try:
        for fn in (w.generate_bedrock_image_bytes, w.generate_bedrock_sd35_image_bytes, w.generate_bedrock_sd_ultra_image_bytes):
            body = _capture(monkeypatch, fn)["body"]
            assert body["negative_prompt"].endswith("anime, chibi")
            assert body["seed"] == 7
    finally:
        w.set_run_negative(None)
        w.set_run_seed(None)


def test_large_keeps_text_to_image_mode(monkeypatch):
    assert _capture(monkeypatch, w.generate_bedrock_sd35_image_bytes)["body"]["mode"] == "text-to-image"
    assert "mode" not in _capture(monkeypatch, w.generate_bedrock_image_bytes)["body"]
