"""admin Lambda zip 이 자급자족인지 검사한다.

admin/backend/deploy-admin-api.sh 는 pipelines 의 모듈 몇 개를 zip 루트에 flat 복사한다.
복사된 모듈이 pipelines 의 다른 모듈을 import 하는데 복사 목록에 없으면 배포 뒤 import 오류가 난다.
"""
import ast
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PIPE_DIRS = [ROOT / "pipelines" / d for d in ("common", "webtoon")]


def _copied_modules():
    sh = (ROOT / "admin/backend/deploy-admin-api.sh").read_text(encoding="utf-8")
    code = "\n".join(l for l in sh.splitlines() if not l.lstrip().startswith("#"))  # 주석 속 파일명은 제외
    return set(re.findall(r"pipelines/(?:common|webtoon)/([a-z_]+)\.py", code))


def _pipeline_module_names():
    return {p.stem for d in PIPE_DIRS for p in d.glob("*.py") if not p.name.startswith("test_")}


def test_copied_modules_only_import_copied_modules():
    copied = _copied_modules()
    known = _pipeline_module_names()
    missing = []
    for name in sorted(copied):
        path = next((d / f"{name}.py" for d in PIPE_DIRS if (d / f"{name}.py").exists()), None)
        assert path, f"{name}.py 를 찾지 못함"
        for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
            mods = []
            if isinstance(node, ast.Import):
                mods = [a.name.split(".")[0] for a in node.names]
            elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
                mods = [node.module.split(".")[0]]
            for m in mods:
                if m in known and m not in copied and m != name:
                    missing.append(f"{name}.py → {m}")
    assert not missing, "deploy-admin-api.sh 복사 목록에 없는 의존 모듈: " + ", ".join(sorted(set(missing)))
