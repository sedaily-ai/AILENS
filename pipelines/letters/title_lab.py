"""레터 제목 실험실 — 최신 글 N개로 제목 후보를 만들고 코드 검증·사실 확인을 거쳐 하나씩 고른다(저장·발행 없음).
사용: python3 title_lab.py [N]   (프롬프트: docs/prompt/letters/title-prompt-v2-2026-10-11.md)"""
import ast
import json
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "common"))
import headline as H
from bedrock_client import call_text
from json_extract import extract_json_object

from bedrock_models import profile_arn  # noqa: E402
MODEL = profile_arn("letters_sonnet46")
PROMPT = H._load_prompt()
VERIFY = ("당신은 서울경제신문 팩트체커다. [기사 정보]와 [레터 본문]만 근거로 [제목]이 사실과 다르거나 근거 없는 주장을 담았는지 본다. "
          "숫자·주체·관계(누가 무엇을 했는지)가 본문과 어긋나면 not ok. 표현이 압축됐을 뿐 사실이 맞으면 ok. JSON 하나만: {\"ok\": true|false, \"reason\": \"한 줄\"}")


def post_text(p):
    b = p["body"]
    if isinstance(b, str):
        try:
            b = ast.literal_eval(b)
        except Exception:  # noqa: BLE001
            b = [b]
    return "\n".join(b)[:2800]


def make_titles(headline, subtitle, body, used):
    out = call_text(PROMPT, f"[기사]\n제목: {headline}\n부제: {subtitle or ''}\n\n[레터 본문]\n{body}", model=MODEL, max_tokens=900)
    try:
        cands = extract_json_object(out).get("candidates", [])
    except Exception:  # noqa: BLE001
        return None, []

    def verifier(title):
        try:
            r = extract_json_object(call_text(VERIFY, f"[기사 정보]\n{headline}\n{subtitle or ''}\n\n[레터 본문]\n{body}\n\n[제목]\n{title}", model=MODEL, max_tokens=300))
            return bool(r.get("ok"))
        except Exception:  # noqa: BLE001
            return False
    best = H.pick(cands, body + " " + headline + " " + (subtitle or ""), headline, used, verifier)
    return best, cands


if __name__ == "__main__":
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 10
    posts = json.load(urllib.request.urlopen(f"https://ailens.sedaily.ai/api/v2/posts?limit={n}"))["posts"][:n]
    used = {}
    for p in posts:
        body = post_text(p)
        best, cands = make_titles(p["headline"], p.get("subtitle"), body, used)
        if best:
            used[best["type"]] = used.get(best["type"], 0) + 1
        print("기사:", p["headline"][:55])
        print("  →", f"[{best['type']}] {best['title']}" if best else "(통과한 후보 없음 — 폴백: 기사 제목 유지)", "\n")
    print("유형 분포:", used)
