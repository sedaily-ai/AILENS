"""공개 Lambda/oneshot worker 공용 소스 패키징. 비밀·테스트는 포함하지 않는다."""
import argparse
from pathlib import Path
import shutil
import tempfile
import zipfile

BACKEND = Path(__file__).resolve().parents[1]
MODULES = ('clients', 'handlers', 'config', 'core', 'models', 'repositories',
           'services', 'common', 'newsletter', 'prompts')


def copy_sources(stage):
    for module in MODULES:
        source = BACKEND / module
        if source.exists():
            shutil.copytree(source, stage / module, dirs_exist_ok=True,
                            ignore=shutil.ignore_patterns('__pycache__', '*.pyc', 'tests',
                                                         'test_*', '.env*', '*.bak*', '.pytest_cache', '*.log', '*.dump', '*.zip', '*.tar*'))
    shutil.copy2(BACKEND / 'notification_worker.py', stage / 'notification_worker.py')
    for line in (BACKEND / 'lambda_handlers.txt').read_text().splitlines():
        if not line.strip() or line.startswith('#'):
            continue
        _, old, new = line.split()
        if old == '-' or old == new:
            continue
        target = stage / (old.replace('.', '/') + '.py')
        target.parent.mkdir(parents=True, exist_ok=True)
        (target.parent / '__init__.py').touch(exist_ok=True)
        target.write_text(f'from {new} import lambda_handler  # noqa: F401\n')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--stage', type=Path)
    parser.add_argument('--source-zip', type=Path)
    args = parser.parse_args()
    if args.stage:
        copy_sources(args.stage)
    elif args.source_zip:
        with tempfile.TemporaryDirectory(prefix='lens-source-') as directory:
            stage = Path(directory)
            copy_sources(stage)
            with zipfile.ZipFile(args.source_zip, 'w', zipfile.ZIP_DEFLATED) as bundle:
                for path in sorted(stage.rglob('*')):
                    if path.is_file():
                        bundle.write(path, path.relative_to(stage))
    else:
        parser.error('--stage 또는 --source-zip 필요')


if __name__ == '__main__':
    main()
