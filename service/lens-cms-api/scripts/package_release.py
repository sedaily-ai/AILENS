"""CMS 릴리스 생성만 수행. SQL·worker 공급과 운영 적용을 분리한다."""
import argparse
from pathlib import Path
import shutil
import tarfile
import tempfile
import sys

SERVICE = Path(__file__).resolve().parents[1]
ROOT = SERVICE.parents[1]
sys.path.insert(0, str(ROOT / 'service/backend/deployment'))
from package import copy_sources


def build(output):
    with tempfile.TemporaryDirectory(prefix='lens-cms-package-') as directory:
        stage = Path(directory)
        for path in SERVICE.glob('*.py'):
            shutil.copy2(path, stage / path.name)
        shutil.copy2(SERVICE / 'requirements.txt', stage / 'requirements.txt')
        # 서버 비밀을 포함한 기존 ecosystem.config.js는 덮어쓰지 않는다.
        shutil.copytree(SERVICE / 'scripts', stage / 'scripts', ignore=shutil.ignore_patterns('__pycache__', '*.pyc', 'test_*'))
        (stage / 'migrations').mkdir()
        for version in range(48, 56):
            matches = list((ROOT / 'docs/architecture/lens-erd-src').glob(f'lens_schema_v1.{version}_*.sql'))
            if len(matches) != 1:
                raise RuntimeError(f'SQL v1.{version} 누락/중복')
            shutil.copy2(matches[0], stage / 'migrations' / matches[0].name)
        # 기존 편집용 정본 seed 공급 유지; 검증 합성 seed는 포함하지 않는다.
        (stage / 'seed').mkdir()
        for name in ('issue_letters_seed.json', 'topics_seed.json', 'interest_bundles_seed.json', 'editors_seed.json', 'editors_topics_seed.json'):
            shutil.copy2(ROOT / 'docs/product/모아쓰기레터/seed' / name, stage / 'seed' / name)
        for version in (38, 42, 43, 44, 45, 46, 47):
            for path in (ROOT / 'docs/architecture/lens-erd-src').glob(f'lens_schema_v1.{version}_*.sql'):
                shutil.copy2(path, stage / 'seed' / path.name)
        copy_sources(stage / 'notification-worker')
        shutil.copy2(SERVICE / 'deployment/lens-notification-worker.service', stage / 'notification-worker.service')
        shutil.copy2(SERVICE / 'deployment/lens-notification-worker.timer', stage / 'notification-worker.timer')
        # deploy의 umask=077과 무관하게 서비스 계정이 번들을 읽을 수 있어야 한다.
        for path in stage.rglob('*'):
            path.chmod(0o755 if path.is_dir() else 0o644)
        with tarfile.open(output, 'w:gz') as bundle:
            for path in sorted(stage.iterdir()):
                bundle.add(path, arcname=path.name)
    print('CMS·SQL v1.48~55·worker 패키지 생성 완료')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, required=True)
    build(parser.parse_args().output)
