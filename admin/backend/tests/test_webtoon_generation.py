"""관리자 생성·재합성이 옛 대사 입력에도 그림을 가리지 않는지 검사한다. AWS 호출 없음."""
import io
import json
from unittest.mock import Mock

import pytest
from PIL import Image

from routes.webtoon import generate


@pytest.fixture
def art(monkeypatch):
    data = io.BytesIO()
    Image.new("RGB", (80, 60), "navy").save(data, "PNG")
    raw = data.getvalue()
    s3 = Mock()
    s3.get_object.return_value = {"Body": io.BytesIO(raw)}
    monkeypatch.setattr(generate.jobs, "bucket", lambda: "test-media")
    monkeypatch.setattr(generate.jobs, "s3", lambda: s3)
    monkeypatch.setattr(generate.audit, "log", Mock())
    return raw, s3


def test_generation_keeps_art_and_returns_external_caption(monkeypatch, art):
    raw, s3 = art
    model = Mock(return_value=(raw, None))
    monkeypatch.setattr(generate, "_generate_composed", model)
    update = Mock()
    monkeypatch.setattr(generate.jobs, "update_job", update)
    # 켜져 있던 과거 설정도 읽거나 호출하지 않는다.
    monkeypatch.setattr(generate.webtoon_image, "get_bubble_detect", Mock(side_effect=AssertionError("말풍선 설정 조회")))
    events = []
    generate.run_composed_generation("test-no-bubbles", {
        "cut": 1, "scene": "An editorial cartoon.", "title": "제목", "narration": "설명",
        "dialogue": [{"speaker": "A", "line": "옛 대사"}], "bubble_detect": True, "bubble_webtoon": True,
    }, push=events.append)
    assert model.call_args.args[2] is False
    assert s3.put_object.call_args.kwargs["Body"] == raw
    assert events[0]["layout"] == []
    assert events[0]["caption"] == "설명" and events[0]["text_caption"] is True
    assert update.call_args.args[1]["status"] == "done"


def test_recompose_returns_uncovered_background_and_legacy_caption(art):
    raw, s3 = art
    result = generate.handle_recompose({
        "bg_url": "https://test-media.s3.us-east-1.amazonaws.com/media/webtoon-lab/old-bg.png",
        "cut": {"cut": 1, "title": "제목", "dialogue": [{"speaker": "A", "line": "설명으로 보존"}]},
    }, {}, {})
    assert result["statusCode"] == 200
    payload = json.loads(result["body"])
    assert payload["layout"] == [] and payload["caption"] == "설명으로 보존"
    assert s3.put_object.call_args.kwargs["Body"] == raw
