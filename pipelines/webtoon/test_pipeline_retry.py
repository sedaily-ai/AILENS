"""각본 반려·깨진 JSON이 발행 경로의 재생성(최대 3번 시도)을 타는지, 자막이 넘치는 컷만 빠지는지 검사한다.
Bedrock·이미지 실제 호출 없음."""
import sys
from pathlib import Path
from types import ModuleType

import pytest
from PIL import Image

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "common"))
import publishing  # noqa: E402


def _valid_script():
    return {"cuts": [{"cut": i, "image_prompt": f"Scene {i}.", "narration": "설명"} for i in range(1, 9)]}


@pytest.fixture
def webtoon(monkeypatch):
    # pipeline.py import 시점의 OpenAI 키 조회(Secrets Manager)를 막는다.
    fake_openai = ModuleType("openai_client")
    fake_openai.get_client = lambda: None
    monkeypatch.setitem(sys.modules, "openai_client", fake_openai)
    mod = publishing.load_module("test_retry_webtoon_pipeline", HERE / "pipeline.py")
    import webtoon_image

    image_calls = []

    def fake_image(camera, scene, model, out_path, **kwargs):
        image_calls.append(scene)
        Image.new("RGB", (30, 20), "white").save(out_path)
        return True, None

    monkeypatch.setattr(mod.ddb_prompt, "load_prompt", lambda name: "## 0. 지침\n내용")
    monkeypatch.setattr(mod, "get_active_image_model", lambda: "sd_ultra")
    monkeypatch.setattr(mod, "generate_cut_image_to_file", fake_image)
    monkeypatch.setattr(mod.prompts, "get_fixed_characters", lambda: {})
    monkeypatch.setattr(mod.compose_text, "compose", lambda *args, **kwargs: [])
    monkeypatch.setattr(mod, "stitch", lambda out, n: None)
    monkeypatch.setattr(webtoon_image, "_get_bedrock_image_client", lambda: object())
    monkeypatch.setattr(webtoon_image, "get_bubble_detect", lambda: False)
    monkeypatch.setattr(webtoon_image, "get_bubble_style", lambda: False)
    # run_article이 바꾸는 기사 단위 전역값을 테스트 뒤 되돌린다.
    monkeypatch.setattr(webtoon_image, "_run_seed", webtoon_image._run_seed)
    monkeypatch.setattr(webtoon_image, "_run_negative", webtoon_image._run_negative)
    mod.image_calls = image_calls
    return mod


def _script_responses(mod, monkeypatch, scripts):
    calls = []

    def fake_call_json(prompt, **kwargs):
        calls.append(prompt)
        result = scripts[len(calls) - 1]
        if isinstance(result, Exception):
            raise result
        return result

    monkeypatch.setattr(mod, "call_json", fake_call_json)
    return calls


def _article(tmp_path):
    path = tmp_path / "a_article.txt"
    path.write_text("기사 본문", encoding="utf-8")
    return path


def test_rejected_storyboard_is_regenerated_then_webtoon_built(webtoon, monkeypatch, tmp_path):
    calls = _script_responses(webtoon, monkeypatch, [{"cuts": []}, _valid_script()])
    script = publishing.run_webtoon_with_retry(webtoon, "a", _article(tmp_path), tmp_path,
                                               manage_gpu=False, log_prefix="test")
    assert len(calls) == 2
    assert "[직전 시도가 반려된 이유]" not in calls[0]
    assert "[직전 시도가 반려된 이유]" in calls[1] and "8개" in calls[1]
    assert len(script["cuts"]) == 8
    assert len(webtoon.image_calls) == 8
    assert all((tmp_path / "a" / f"컷{n}.png").exists() for n in range(1, 9))


def test_storyboard_rejected_on_every_attempt_fails_before_images(webtoon, monkeypatch, tmp_path):
    bad = {"cuts": [{"cut": 1, "image_prompt": "x"}]}
    calls = _script_responses(webtoon, monkeypatch, [{"cuts": []}, bad, bad])
    with pytest.raises(webtoon.StoryboardRejected, match="8개"):
        publishing.run_webtoon_with_retry(webtoon, "a", _article(tmp_path), tmp_path,
                                          manage_gpu=False, log_prefix="test")
    assert len(calls) == publishing.WEBTOON_SCRIPT_ATTEMPTS == 3
    assert webtoon.image_calls == []


def test_unreadable_json_is_retried_with_reason(webtoon, monkeypatch, tmp_path):
    calls = _script_responses(webtoon, monkeypatch, [ValueError("JSON 없음"), _valid_script()])
    script = publishing.run_webtoon_with_retry(webtoon, "a", _article(tmp_path), tmp_path,
                                               manage_gpu=False, log_prefix="test")
    assert len(calls) == 2
    assert "JSON으로 읽지 못했다" in calls[1]
    assert len(script["cuts"]) == 8


def test_overflowing_narration_drops_only_that_cut(webtoon, monkeypatch, tmp_path):
    _script_responses(webtoon, monkeypatch, [_valid_script()])

    def compose(img_path, cut, *args, **kwargs):
        if cut["cut"] == 3:
            raise webtoon.compose_text.NarrationOverflowError("자막이 하단 영역에 들어가지 않습니다.")
        return []

    monkeypatch.setattr(webtoon.compose_text, "compose", compose)
    script = publishing.run_webtoon_with_retry(webtoon, "a", _article(tmp_path), tmp_path,
                                               manage_gpu=False, log_prefix="test")
    assert len(script["cuts"]) == 8
    assert not (tmp_path / "a" / "컷3.png").exists()
    assert all((tmp_path / "a" / f"컷{n}.png").exists() for n in range(1, 9) if n != 3)
