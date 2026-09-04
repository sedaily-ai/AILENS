#!/usr/bin/env python3
"""완성된 웹툰 폴더들(meta.json 존재)을 모아 INDEX.md + index.json으로 요약."""
import json, sys
from pathlib import Path


def build(root: Path):
    lines = ["# 뉴스 웹툰 배치 결과", ""]
    index = []
    for folder in sorted(root.iterdir()):
        if not folder.is_dir():
            continue
        meta_path = folder / "meta.json"
        if not meta_path.exists():
            continue
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        cuts = len(list(folder.glob("컷[1-8].png")))

        lines += [
            f"## {folder.name}",
            f"**{meta['titles'][0]}**", "",
            meta["description"], "",
            f"- 제목 후보: {' / '.join(meta['titles'])}",
            f"- 컷 수: {cuts}/8, 폴더: `{folder.name}/`", "",
        ]
        index.append({"folder": folder.name, "titles": meta["titles"],
                       "description": meta["description"], "cuts": cuts})

    (root / "INDEX.md").write_text("\n".join(lines), encoding="utf-8")
    (root / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"INDEX.md, index.json 저장 완료 — {len(index)}편")


if __name__ == "__main__":
    build(Path(sys.argv[1]) if len(sys.argv) > 1 else Path("."))
