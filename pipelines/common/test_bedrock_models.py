"""모델 레지스트리 검사: 정책 JSON·관리자 모델 표가 레지스트리와 어긋나지 않는지."""
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import bedrock_models as M  # noqa: E402

ROOT = Path(__file__).parent.parent
ARN_RE = re.compile(r"arn:aws:bedrock:[a-z0-9-]+:%s:application-inference-profile/([a-z0-9]+)" % M.ACCOUNT_ID)
# 정책에 반드시 있어야 하는 별칭(해당 태스크가 코드에서 쓰는 것)
NEEDED = {
    "frontpage_auto": ["letters_sonnet5", "letters_sonnet46", "podcast_sonnet5", "video_sonnet5", "webtoon_script_sonnet5", "prism_scene"],
    "issueletter_auto": ["letters_sonnet5"],
}


def test_arn_format_and_snapshot():
    assert M.profile_arn("letters_sonnet46") == "arn:aws:bedrock:us-east-1:887078546492:application-inference-profile/nrr81xvevv5k"
    assert M.profile_arn("image_sd_ultra").startswith("arn:aws:bedrock:us-west-2:")


def test_env_override(monkeypatch):
    monkeypatch.setenv("BEDROCK_MODEL_LETTERS_SONNET5", "arn:test")
    assert M.profile_arn("letters_sonnet5") == "arn:test"


def test_task_policies_allow_needed_profiles():
    for task, aliases in NEEDED.items():
        text = (ROOT / task / "task-policy.json").read_text(encoding="utf-8")
        ids = set(ARN_RE.findall(text))
        missing = [a for a in aliases if M.PROFILES[a][1] not in ids]
        assert not missing, f"{task}/task-policy.json 에 없는 프로파일: {missing}"


def test_admin_prompt_models_are_registered():
    text = (ROOT.parent / "admin/backend/routes/prompts.py").read_text(encoding="utf-8")
    known = {p[1] for p in M.PROFILES.values()}
    # 관리자 전용 프로파일(textlab 등)은 레지스트리 밖이므로 파이프라인 공용 이름(lens-letters/podcast/video/webtoon-script)만 비교한다
    shared = re.findall(r'application-inference-profile/([a-z0-9]+)",?\s*#\s*(lens-(?:letters|podcast|video|webtoon-script)-sonnet-5)', text)
    assert shared, "관리자 모델 표를 읽지 못함"
    for pid, name in shared:
        assert pid in known, f"{name}({pid})가 레지스트리에 없음"
