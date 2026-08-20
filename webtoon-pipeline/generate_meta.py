#!/usr/bin/env python3
"""완성된 웹툰 폴더(1_script.json 존재)마다 제목 3안 + 작품설명을 생성해 meta.json으로 저장."""
import json, sys
from pathlib import Path

from pipeline import call_json

PROMPT_TMPL = """다음은 뉴스 기사를 8컷 웹툰으로 만든 스크립트다. 이걸 보고:
1. 제목 후보 3개 (훅이 강한 것부터, 각 20자 내외)
2. 작품 설명 1개 (2~3문장, 독자가 클릭하고 싶게)

반드시 이 JSON 형식으로만 응답:
{"titles": ["...", "...", "..."], "description": "..."}

[스크립트]
{script}
"""


def process(folder: Path):
    script_path = folder / "1_script.json"
    meta_path = folder / "meta.json"
    if not script_path.exists():
        print(f"[{folder.name}] script.json 없음, 스킵")
        return
    if meta_path.exists():
        print(f"[{folder.name}] meta.json 이미 있음, 스킵")
        return
    script = json.loads(script_path.read_text(encoding="utf-8"))
    prompt = PROMPT_TMPL.replace("{script}", json.dumps(script, ensure_ascii=False))
    try:
        result = call_json(prompt)
        meta_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"[{folder.name}] 완료: {result['titles'][0]}")
    except Exception as e:
        print(f"[{folder.name}] 실패: {e}")


if __name__ == "__main__":
    base = Path(".")
    targets = sys.argv[1:] if len(sys.argv) > 1 else None
    if targets:
        folders = [base / t for t in targets]
    else:
        folders = [p for p in base.iterdir() if p.is_dir() and (p / "1_script.json").exists()]
    for f in folders:
        process(f)
