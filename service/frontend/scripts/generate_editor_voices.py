#!/usr/bin/env python3
"""레터 에디터 소개 음성(mp3) 생성 — ElevenLabs. 결과는 public/editors/voice/{id}.mp3 로 저장한다(정적 파일로 배포, 브라우저에 키를 두지 않는다).

- API 키는 AWS Secrets Manager `ai-labs/elevenlabs`(JSON {api_key})에서 읽고 출력하지 않는다.
- 음성은 이전 서비스 기록의 voiceId·설정을 그대로 쓴다(legacy/dev_v1 elevenlabs.ts, 2026-05-18 선별).
- 소개 문구는 src/features/letter/data/editors.ts 의 intro 를 읽는다. 문구를 바꾸면 이 스크립트를 다시 실행한다.

  python3 scripts/generate_editor_voices.py            # 없는 파일만 생성
  python3 scripts/generate_editor_voices.py --force    # 모두 다시 생성
"""
import json
import re
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "editors" / "voice"
VOICES = {  # 에디터 id -> (voiceId, 설명)
    "mincheol": ("RU7aSi6lT4uQBXMLgDxK", "TeddyNote"),
    "haeun": ("AW5wrnG1jVizOYY7R1Oo", "JiYoung"),
    "junseo": ("5XgfKMHL4qnyg2mabE5t", "Deck"),
    "soyul": ("QPFsEL6IBxlT15xfiD6C", "Hana Lee"),
}
SETTINGS = {"stability": 0.5, "similarity_boost": 0.78, "style": 0.25, "use_speaker_boost": True}
MODEL = "eleven_multilingual_v2"


def api_key() -> str:
    out = subprocess.run(["aws", "secretsmanager", "get-secret-value", "--secret-id", "ai-labs/elevenlabs", "--profile", "yeonggwang",
                          "--region", "us-east-1", "--query", "SecretString", "--output", "text"], capture_output=True, text=True, check=True).stdout
    return json.loads(out)["api_key"]


def intro(editor_id: str) -> str:
    src = (ROOT / "src/features/letter/data/editors.ts").read_text(encoding="utf-8")
    m = re.search(r"id: '" + editor_id + r"'.*?intro: '((?:[^'\\]|\\.)*)'", src, re.S)
    if not m:
        sys.exit(f"intro not found: {editor_id}")
    return m.group(1).replace("\\'", "'")


def main() -> None:
    force = "--force" in sys.argv
    OUT.mkdir(parents=True, exist_ok=True)
    key = None
    for eid, (voice_id, label) in VOICES.items():
        target = OUT / f"{eid}.mp3"
        if target.exists() and not force:
            print(f"- {eid}: 이미 있음 — 건너뜀")
            continue
        key = key or api_key()
        body = json.dumps({"text": intro(eid), "model_id": MODEL, "voice_settings": SETTINGS}).encode()
        req = urllib.request.Request(f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}?output_format=mp3_44100_128", data=body, method="POST",
                                     headers={"xi-api-key": key, "Content-Type": "application/json", "Accept": "audio/mpeg"})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                data = r.read()
        except urllib.error.HTTPError as e:
            print(f"- {eid} ({label}): 실패 HTTP {e.code} {e.read()[:200].decode('utf-8', 'ignore')}")
            continue
        target.write_bytes(data)
        print(f"- {eid} ({label}): 저장 {len(data) // 1024}KB")


if __name__ == "__main__":
    main()
