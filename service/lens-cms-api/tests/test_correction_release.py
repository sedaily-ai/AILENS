"""로컬 tar 생성만 확인한다. 업로드·원격 실행 없음."""
import hashlib
from pathlib import Path
import subprocess
import sys
import tarfile


def test_release_contains_reviewed_plan_and_tool_without_other_local_seeds(tmp_path):
    root=Path(__file__).resolve().parents[1]
    output=tmp_path/'release.tar.gz'
    subprocess.run([sys.executable,str(root/'scripts/package_release.py'),'--output',str(output)],check=True)
    name='seed/2026-10-15-audit-corrections.json'
    with tarfile.open(output) as bundle:
        assert 'scripts/apply_publication_corrections.py' in bundle.getnames()
        assert hashlib.sha256(bundle.extractfile(name).read()).digest()==hashlib.sha256((root/name).read_bytes()).digest()
        seeds={n for n in bundle.getnames() if n.startswith('seed/') and n.endswith('.json')}
        assert seeds=={name}|{'seed/'+s for s in ('issue_letters_seed.json','topics_seed.json','interest_bundles_seed.json','editors_seed.json','editors_topics_seed.json')}
