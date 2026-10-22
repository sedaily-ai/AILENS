"""원격 호출 없이 CMS 옵션·근거 보존과 실제 이미지 요청 본문을 검사한다."""
import ast
import copy
import json
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

sys.path.insert(0, str(Path(__file__).parent))
from webtoon_contract import cut_metadata, image_options, validate_storyboard  # noqa: E402
import webtoon_image as wi  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]


def _storyboard():
    return {
        "generation_status": "ready",
        "negative_prompt": "watercolor, extra people",
        "image_seed": 42,
        "selected_facts": [{"fact_id": "F1", "source_excerpt": "예산 승인 시 시행", "certainty": "예정"}],
        "cuts": [
            {"cut": i, "image_prompt": "네이비 재킷 진행자의 설명 장면", "narration": "예산 승인 시 시행한다.",
             "fact_ids": ["F1"], "cut_function": "조건 설명", "location_id": "L1"}
            for i in range(1, 9)
        ],
    }


@pytest.mark.parametrize("path,function", [
    ("admin/backend/routes/webtoon/script.py", "normalize_cuts"),
    ("pipelines/webtoon/pipeline.py", "_normalize_cuts"),
])
def test_real_normalizers_preserve_options_and_evidence(path, function):
    # 배치 import가 모델·환경을 초기화하지 않도록 실제 순수 함수들만 로드한다.
    tree = ast.parse((ROOT / path).read_text())
    names = {function, "_cut_number", "_first_nonempty", "_dialogue_from_bubbles"}
    ns = {"cut_metadata": cut_metadata, "validate_storyboard": validate_storyboard}
    exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in names],
                            type_ignores=[]), path, "exec"), ns)
    cuts = ns[function](_storyboard())
    assert len(cuts) == 8
    assert cuts[0]["negative_prompt"] == "watercolor, extra people"
    assert cuts[0]["image_seed"] == 42
    assert cuts[0]["fact_ids"] == ["F1"]
    assert cuts[0]["selected_facts"][0]["source_excerpt"] == "예산 승인 시 시행"
    assert cuts[0]["location_id"] == "L1"
    legacy = _storyboard()
    for key in ("generation_status", "negative_prompt", "image_seed", "selected_facts"):
        legacy.pop(key)
    for c in legacy["cuts"]:
        c.pop("fact_ids")
    assert ns[function](legacy)[0]["negative_prompt"] == ""


@pytest.mark.parametrize("options", [
    {"image_seed": True}, {"image_seed": -1}, {"image_seed": 4294967295},
    {"image_seed": "42"}, {"negative_prompt": []}, {"negative_prompt": "x" * 8001},
])
def test_invalid_options_fail_before_inference(options):
    with pytest.raises(ValueError):
        image_options(options)


def test_sparse_bad_evidence_and_incomplete_cuts_rejected():
    with pytest.raises(ValueError, match="기사 근거"):
        validate_storyboard({"generation_status": "needs_article", "cuts": []})
    s = _storyboard()
    validate_storyboard(s, "시에 따르면 예산 승인 시 시행할 예정이다.")
    with pytest.raises(ValueError, match="source_excerpt"):
        validate_storyboard(s, "시행을 취소했다.")
    s["cuts"].pop()
    with pytest.raises(ValueError, match="8개"):
        validate_storyboard(s)
    with pytest.raises(ValueError, match="연결"):
        cut_metadata(_storyboard(), {"fact_ids": ["F99"]})


def test_english_image_contract_keeps_korean_captions():
    s = _storyboard()
    s["image_prompt_language"] = "en"
    with pytest.raises(ValueError, match="영어"):
        validate_storyboard(s)
    for cut in s["cuts"]:
        cut["image_prompt"] = "An editorial webtoon illustration in a newsroom."
    validate_storyboard(s)
    assert s["cuts"][0]["narration"] == "예산 승인 시 시행한다."


@pytest.mark.parametrize("model", ["sd_ultra", "sd35_large", "stable_image_core"])
def test_dispatch_sends_request_local_options_without_leaking(monkeypatch, model):
    calls = []
    monkeypatch.setattr(wi, "_get_bedrock_image_client", lambda: object())
    monkeypatch.setattr(wi, "_invoke_and_decode_image", lambda client, mid, body: calls.append(json.loads(body)) or b"png")
    monkeypatch.setattr(wi, "_run_negative", "old article")
    monkeypatch.setattr(wi, "_run_seed", 999)
    wi.generate_cut_image("", "기사 장면", model, generation_options={"negative_prompt": "extra people", "image_seed": 42})
    wi.generate_cut_image("", "다음 기사", model, generation_options={})
    assert "extra people" in calls[0]["negative_prompt"]
    assert calls[0]["seed"] == 42
    assert calls[1]["negative_prompt"] == wi.ULTRA_NEGATIVE_PROMPT
    assert "seed" not in calls[1]
    assert wi._run_seed == 999


def test_admin_retry_keeps_request_options(monkeypatch):
    tree = ast.parse((ROOT / "admin/backend/routes/webtoon/generate.py").read_text())
    node = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == "_generate_composed")
    calls = []

    def generate(*args, **kwargs):
        calls.append(copy.deepcopy(kwargs))
        if len(calls) == 1:
            raise ValueError("Filter reason: prompt")
        return b"png", None

    ns = {
        "webtoon_image": SimpleNamespace(generate_cut_image=generate, _soften_scene_for_filter=lambda s: s),
        "logger": SimpleNamespace(warning=lambda *args: None),
    }
    exec(compile(ast.Module(body=[node], type_ignores=[]), "generate.py", "exec"), ns)
    options = {"negative_prompt": "extra people", "image_seed": 42}
    assert ns["_generate_composed"]("", "장면", False, generation_options=options) == (b"png", None)
    assert calls[0]["generation_options"] == calls[1]["generation_options"] == options


def test_complete_image_prompt_keeps_style_first(monkeypatch):
    calls = []
    monkeypatch.setattr(wi, "_get_bedrock_image_client", lambda: object())
    monkeypatch.setattr(wi, "_invoke_and_decode_image", lambda client, mid, body: calls.append(json.loads(body)) or b"png")
    scene = "Draw as a 2D Korean webtoon: clean black ink lines. TWO presenters in a navy studio."
    wi.generate_cut_image("", scene, "sd_ultra", generation_options={})
    assert calls[0]["prompt"].startswith(scene)
    assert "Camera: ." not in calls[0]["prompt"]
    assert "Do NOT render any text" in calls[0]["prompt"]


def test_explicit_camera_and_style_are_preserved():
    prompt = wi.build_background_prompt("medium two-shot", "Two presenters.", style="Cel-shaded webtoon.")
    assert prompt.startswith("Cel-shaded webtoon.\nCamera: medium two-shot. 3:2 horizontal.")
    assert "Two presenters." in prompt
