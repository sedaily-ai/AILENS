"""Lambda 배포용 zip을 만든다 — lambda_function.py + Pillow(Linux x86_64, Python 3.12 휠) + Pretendard 글꼴.

    python pipelines/instagram_auto/build_zip.py
    # → pipelines/instagram_auto/build/function.zip

Windows에서도 Linux용 Pillow 휠을 받아 넣으므로 Docker가 필요 없다. 압축은 zipfile로 한다
(PowerShell Compress-Archive는 경로 구분자를 역슬래시로 넣어 Lambda(Linux)에서 깨진다).
글꼴은 저장소의 apps/mobile/assets/fonts 를 그대로 복사한다(사본을 두지 않는다).
"""
from __future__ import annotations

import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
BUILD = HERE / "build"
PKG = BUILD / "pkg"
FONTS = ["Pretendard-ExtraBold.otf", "Pretendard-SemiBold.otf", "Pretendard-Medium.otf"]
FONT_SRC = ROOT / "apps" / "mobile" / "assets" / "fonts"


def main() -> None:
    shutil.rmtree(BUILD, ignore_errors=True)
    (PKG / "fonts").mkdir(parents=True)
    wheels = BUILD / "wheels"
    subprocess.run([sys.executable, "-m", "pip", "download", "pillow", "--platform", "manylinux2014_x86_64",
                    "--only-binary=:all:", "--python-version", "3.12", "--implementation", "cp",
                    "--no-deps", "-q", "-d", str(wheels)], check=True)
    for whl in wheels.glob("*.whl"):
        with zipfile.ZipFile(whl) as z:
            z.extractall(PKG)
    shutil.copy2(HERE / "lambda_function.py", PKG / "lambda_function.py")
    for f in FONTS:
        shutil.copy2(FONT_SRC / f, PKG / "fonts" / f)

    out = BUILD / "function.zip"
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for p in sorted(PKG.rglob("*")):
            if p.is_file():
                z.write(p, p.relative_to(PKG).as_posix())
    print(f"{out} ({out.stat().st_size / 1024 / 1024:.1f} MB)")


if __name__ == "__main__":
    main()
