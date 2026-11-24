"""Lambda 배포용 zip을 만든다 — lambda_function.py + Pillow(Linux x86_64, Python 3.12 휠) + Pretendard 글꼴 + LENS 로고.

    python pipelines/instagram_single/build_zip.py
    # → pipelines/instagram_single/build/function.zip

instagram_auto/build_zip.py와 같은 방식(Windows에서도 Docker 없이, zipfile로 압축).
글꼴·로고는 저장소 파일을 그대로 복사한다(사본을 두지 않는다).
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
FONT_DIR = ROOT / "apps" / "mobile" / "assets" / "fonts"
FONTS = ["Pretendard-ExtraBold.otf", "Pretendard-SemiBold.otf"]   # 제목 / 날짜
LOGO = ROOT / "service" / "frontend" / "public" / "icon-512.png"


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
        shutil.copy2(FONT_DIR / f, PKG / "fonts" / f)
    shutil.copy2(LOGO, PKG / "lens-logo.png")

    out = BUILD / "function.zip"
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for p in sorted(PKG.rglob("*")):
            if p.is_file():
                z.write(p, p.relative_to(PKG).as_posix())
    print(f"{out} ({out.stat().st_size / 1024 / 1024:.1f} MB)")


if __name__ == "__main__":
    main()
