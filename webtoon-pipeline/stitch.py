#!/usr/bin/env python3
"""컷1~N.png를 세로로 이어 붙여 웹툰 스크롤 형식 하나로 합친다."""
from pathlib import Path
from PIL import Image


def stitch(folder: Path, n_cuts: int, gap: int = 24, out_name: str = "웹툰_전체.png"):
    imgs = []
    for i in range(1, n_cuts + 1):
        p = folder / f"컷{i}.png"
        if not p.exists():
            print(f"⚠️  {p.name} 없음, 건너뜀")
            continue
        imgs.append(Image.open(p).convert("RGB"))

    if not imgs:
        print("이미지 없음")
        return

    width = max(im.width for im in imgs)
    resized = []
    for im in imgs:
        if im.width != width:
            ratio = width / im.width
            im = im.resize((width, int(im.height * ratio)), Image.LANCZOS)
        resized.append(im)

    total_height = sum(im.height for im in resized) + gap * (len(resized) - 1)
    canvas = Image.new("RGB", (width, total_height), "white")

    y = 0
    for im in resized:
        canvas.paste(im, (0, y))
        y += im.height + gap

    out_path = folder / out_name
    canvas.save(out_path, quality=95)
    print(f"완성: {out_path}  ({width}x{total_height})")


if __name__ == "__main__":
    import sys
    folder = Path(sys.argv[1])
    n = int(sys.argv[2]) if len(sys.argv) > 2 else 8
    stitch(folder, n)
