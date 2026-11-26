"""PRISM·지면 영상 유튜브 썸네일 자동 생성 (2026-11-25).

기사 사진 위에 큰 문구(예: kicker "KOSPI" / headline "10,000?")를 얹은 가로(1280x720)·세로(1080x1920) 썸네일을 만든다.

흐름
1. 후보 사진: 입력 txt의 기사 번호(sedaily.com/article/<key>) → daily-xml(녹화일~3일 전)에서 기사에 붙은 사진 전부.
   같은 날 다른 편이 이미 쓴 사진(모양 지문)은 뺀다(media/prism-thumb/<YYYYMMDD>/<job_id>.json).
2. AI(prism_scene 프로파일, Haiku 5.5)가 후보 사진을 직접 보고 사진 1장 + 문구를 고른다.
   코드 검사: 문구의 숫자는 대본에 그대로 있어야, 숫자를 영어 단어로 쓰면 안 됨, 태그·사진 속 인물 이름은 대본에 있어야.
   어긋나면 이유를 붙여 2번까지 다시 요청, 그래도 어긋나면 만들지 않는다.
3. Rekognition으로 얼굴·사람·물체 위치를 찾고, 글자 덩어리를 가장 덜 가리는 자리·크기·사진 배치를 고른다.
   어두운 바탕은 글자 주변에만 깔고 얼굴 자리는 뺀다. 쇼츠 탭은 세로 썸네일 위아래를 약 8%씩 잘라 보여 주므로
   세로는 위아래 11% 띠 밖에만 글자를 둔다.
   얼굴 찾기가 실패하면 얼굴을 가릴 수 있어 만들지 않는다(유튜브 기본 썸네일 유지).

어디서 실패해도 예외를 밖으로 내지 않고 None을 돌려준다 — 영상 업로드·편 완료에 영향이 없어야 한다.
PRISM_THUMBNAIL=0이면 끈다.
"""
from __future__ import annotations

import datetime as dt
import importlib.util
import io
import json
import os
import re
import sys
import urllib.request
from pathlib import Path

import boto3
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont, ImageOps

sys.path.insert(0, str(Path(__file__).parent.parent / "common"))
from config import CMS_MEDIA_BUCKET  # noqa: E402
from bedrock_client import _get_client  # noqa: E402
from bedrock_models import profile_arn  # noqa: E402

_FONTS = Path(__file__).parent / "public" / "fonts"
ANTON = str(_FONTS / "Anton-Regular.ttf")
_SANS = _FONTS / "NotoSansKR-700.ttf"
SANS = str(_SANS) if _SANS.exists() else ANTON
INK = (244, 240, 232)
MAX_CANDIDATES = 14  # AI에 보내는 사진 수 상한(비용)
LOOKBACK_DAYS = 3
_MODEL = profile_arn("prism_scene")


def enabled() -> bool:
    return os.environ.get("PRISM_THUMBNAIL", "1") != "0"


# ── 1. 후보 사진 ─────────────────────────────────────────────────────────────

def _load_discovery():
    path = Path(__file__).resolve().parent.parent / "discovery" / "pipeline.py"
    spec = importlib.util.spec_from_file_location("prism_thumb_discovery", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def candidates(article: str, day: dt.date) -> list[dict]:
    """입력 txt에 나온 기사 순서대로, 기사에 붙은 사진 전부 → [{url, title, caption}]."""
    keys = list(dict.fromkeys(re.findall(r"sedaily\.com/article/(\w+)", article)))
    if not keys:
        return []
    disc = _load_discovery()
    s3 = disc._s3_client(None)
    by_key: dict[str, list[dict]] = {}
    for back in range(LOOKBACK_DAYS, -1, -1):  # 오래된 날부터 — 같은 기사면 최근 파일이 남는다
        root = disc._download_root(s3, f"{day - dt.timedelta(days=back):%Y%m%d}")
        if root is None:
            continue
        for it in root.iter("item"):
            key = (it.findtext("key") or "").strip()
            if key not in keys:
                continue
            title = (it.findtext("title") or "").strip()
            by_key[key] = [
                {"url": im.attrib["href"], "title": title,
                 "caption": (im.attrib.get("caption_title", "") + " " + im.attrib.get("caption_content", "")).strip()}
                for im in it.findall("image") if im.attrib.get("href")
            ]
    return [c for k in keys for c in by_key.get(k, [])]


def _download(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.read()


def _small_jpeg(raw: bytes, size: int = 640) -> bytes:
    im = Image.open(io.BytesIO(raw)).convert("RGB")
    im.thumbnail((size, size))
    b = io.BytesIO()
    im.save(b, "JPEG", quality=85)
    return b.getvalue()


def fingerprint(raw: bytes) -> int:
    """사진 모양 지문(16x16 흑백 평균 해시). 다른 주소로 실린 같은 사진을 같은 사진으로 본다."""
    px = list(Image.open(io.BytesIO(raw)).convert("L").resize((16, 16)).tobytes())
    avg = sum(px) / len(px)
    return int("".join("1" if v > avg else "0" for v in px), 2)


def _same_photo(a: int, b: int) -> bool:
    return bin(a ^ b).count("1") <= 20


def _used_today(s3, day: dt.date, job_id: str) -> list[dict]:
    """같은 날 다른 편이 쓴 사진 지문·문구. 영상 서버 역할엔 s3:ListBucket이 없어(2026-11-26 확인) 폴더를 훑지 않고,
    그날 자동 제작 목록(media/prism-auto/<YYYYMMDD>.json)의 작업 번호로 기록 파일을 하나씩 읽는다.
    목록·기록을 못 읽으면 겹침 확인만 건너뛴다(썸네일은 만든다). CMS에서 손으로 올린 묶음은 목록에 없어 확인 대상이 아니다."""
    try:
        manifest = json.loads(s3.get_object(Bucket=CMS_MEDIA_BUCKET, Key=f"media/prism-auto/{day:%Y%m%d}.json")["Body"].read())
        jobs = [i.get("job_id") for i in manifest.get("items", []) if i.get("job_id") and i.get("job_id") != job_id]
    except Exception as e:  # noqa: BLE001
        print(f"[prism-thumb] 그날 목록 없음 — 겹침 확인 건너뜀: {type(e).__name__}")
        return []
    out = []
    for j in jobs:
        try:
            out.append(json.loads(s3.get_object(Bucket=CMS_MEDIA_BUCKET, Key=f"media/prism-thumb/{day:%Y%m%d}/{j}.json")["Body"].read()))
        except Exception:  # noqa: BLE001 — 아직 안 만든 편(권한상 없는 파일은 403으로 온다)
            pass
    return out


# ── 2. AI가 사진·문구 고르기 ─────────────────────────────────────────────────

PROMPT = """You design YouTube thumbnails for AI PRISM, a Korean business-news video series in English.
Write the big text that goes on the thumbnail, and pick the photo.

STYLE (follow these real examples from our channel):
- kicker "KOREA'S NEWEST TREND?" / headline "K-HIKING"
- kicker "KOSPI" / headline "10,000?"
- kicker "" / headline "THE ONLY KOREAN" / tag "Jennie · GTA 6"

RULES
- headline: 1-3 words, max 16 characters. The single most striking number, name or claim of the episode. A number with "?" or a short punchy claim works best. ALL CAPS.
- kicker: optional, 0-4 words, max 24 characters, ALL CAPS. Sets up the headline (topic or question). Use "" if the headline stands alone.
- tag: optional, 2-3 proper nouns joined by " · ", max 28 characters, normal case. Use "" if not needed. Never use our brand (Seoul Economic Daily, AI PRISM) or just a country name.
- Facts must come from the script. Never invent numbers. Do not repeat the video title word for word.
- Numbers: write them as digits exactly as the script states them (you may drop units, e.g. "223 TRILLION" for "223 trillion won"). Never convert (no "1 IN 4" for 26.8 percent, no "ELEVEN" for 11, no rounding).
- tag: every name in the tag must appear in the script and be central to this episode.
- photo: you can SEE each candidate photo (images below, in order). Pick the one that makes the strongest thumbnail AND matches the headline.
  Prefer: a clear photo of the main person/company/product/place in the story, faces looking alert, strong subject.
  Never pick: charts, graphs, tables, infographics or any image that is mostly drawn text/numbers.
  PEOPLE: only pick a photo showing an identifiable person if that exact person is named in the script and the headline is about them or their company. Never put a real person's face next to a claim that is not about them (e.g. a startup founder's face on a "workers quitting jobs" headline). Crowds or people seen from behind are fine.
  Avoid: closed eyes or awkward expressions, AI-generated illustrations, slides/screens full of text, blurry or very dark photos, generic stock scenes when a specific one exists.

Return JSON only: {"kicker": "...", "headline": "...", "tag": "...", "photo": <candidate number>, "person": "<English full name of the identifiable person in the chosen photo, or empty>", "why": "<10 words>"}

OTHER THUMBNAILS ALREADY MADE TODAY (do not reuse their headline or main number; pick a different angle):
{prev}

VIDEO TITLE: {title}

CANDIDATE PHOTOS (numbered; the images follow in the same order):
{cands}

SCRIPT:
{script}
"""


def _norm(t: str) -> str:
    return re.sub(r"(?<=\d),(?=\d)", "", t).lower()


def check(hook: dict, script: str) -> list[str]:
    """AI 답 검사 — 숫자는 대본에 그대로, 숫자를 단어로 쓰지 않기, 태그·사진 속 인물 이름은 대본에 있어야."""
    sc = _norm(script)
    text = f"{hook.get('kicker', '')} {hook.get('headline', '')}"
    out = []
    if not (hook.get("headline") or "").strip():
        out.append("headline is empty")
    for num in re.findall(r"\d[\d,.]*\d|\d", text):
        # 다른 숫자의 일부("11" 속 "1", "223.3" 속 "223")는 안 된다 — 숫자 하나 전체로 있어야 한다
        if not re.search(rf"(?<![\d.]){re.escape(_norm(num))}(?!\.?\d)", sc):
            out.append(f'number "{num}" does not appear in the script')
    if re.search(r"\b(ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE|TEN|ELEVEN|TWELVE)\b", text.upper()):
        out.append("write numbers as digits, as in the script")
    for name in [t.strip() for t in (hook.get("tag") or "").split("·") if t.strip()]:
        if name.lower() not in sc:
            out.append(f'tag name "{name}" does not appear in the script')
    person = (hook.get("person") or "").strip()
    if person and not any(len(w) > 2 and w.lower() in sc for w in person.split()):
        out.append(f"the chosen photo shows {person}, who is not in this episode — pick another photo")
    return out


def choose(script_text: str, title: str, cands: list[dict], thumbs: list[bytes], prev: list[str]) -> dict | None:
    """AI가 사진 번호·문구를 고른다. 검사를 3번 안에 통과하지 못하면 None."""
    body = (PROMPT.replace("{prev}", "\n".join(prev) or "(none)").replace("{title}", title or "")
            .replace("{cands}", "\n".join(f"{n}. article: {c['title']} | caption: {c['caption'][:120]}"
                                          for n, c in enumerate(cands, 1)))
            .replace("{script}", script_text[:9000]))
    content = [{"text": body}]
    for n, t in enumerate(thumbs, 1):
        content += [{"text": f"Photo {n}:"}, {"image": {"format": "jpeg", "source": {"bytes": t}}}]
    msgs = [{"role": "user", "content": content}]
    for attempt in range(3):
        r = _get_client().converse(modelId=_MODEL, messages=msgs, inferenceConfig={"maxTokens": 4000})
        text = "".join(c.get("text", "") for c in r["output"]["message"]["content"])
        m = re.search(r"\{.*\}", text, re.S)
        if not m:
            problems = ["answer was not JSON"]
            hook_json = text[:2000]
        else:
            hook = json.loads(m.group(0))
            hook_json = m.group(0)
            try:
                idx = int(hook.get("photo") or 0)
            except (TypeError, ValueError):
                idx = 0
            problems = check(hook, script_text)
            if not 1 <= idx <= len(cands):
                problems.append(f"photo must be a number from 1 to {len(cands)}")
            if not problems:
                hook["photo"] = idx
                return hook
        print(f"[prism-thumb] 문구 검사 실패({attempt + 1}/3): {problems}")
        msgs += [{"role": "assistant", "content": [{"text": hook_json}]},
                 {"role": "user", "content": [{"text": "Fix these problems and return the JSON again:\n- " + "\n- ".join(problems)}]}]
    return None


# ── 3. 그리기 ────────────────────────────────────────────────────────────────

def detect(im: Image.Image) -> list[tuple]:
    """지킬 상자들(0~1 비율 l,t,r,b, 무게). 얼굴·사람 머리 3, 사람 상체 1, 물체 0.6. 실패하면 예외."""
    small = im.copy()
    small.thumbnail((1000, 1000))
    buf = io.BytesIO()
    small.save(buf, "JPEG", quality=90)
    data = buf.getvalue()
    rk = boto3.client("rekognition", region_name=os.environ.get("AWS_REGION", "us-east-1"))
    boxes = []
    for f in rk.detect_faces(Image={"Bytes": data})["FaceDetails"]:
        b = f["BoundingBox"]
        if f["Confidence"] < 80 or b["Width"] * b["Height"] < 0.002:
            continue
        pad = 0.35
        boxes.append((b["Left"] - b["Width"] * pad, b["Top"] - b["Height"] * pad,
                      b["Left"] + b["Width"] * (1 + pad), b["Top"] + b["Height"] * (1 + pad), 3.0))
    for lab in rk.detect_labels(Image={"Bytes": data}, MaxLabels=30, MinConfidence=75)["Labels"]:
        for ins in lab.get("Instances", []):
            b = ins["BoundingBox"]
            area = b["Width"] * b["Height"]
            if area > 0.6 or area < 0.01:
                continue
            if lab["Name"] == "Person":
                # 눈을 감은 얼굴은 얼굴 찾기가 놓치므로 사람 상자의 머리 쪽도 강하게 지킨다
                boxes.append((b["Left"], b["Top"], b["Left"] + b["Width"], b["Top"] + b["Height"] * 0.35, 3.0))
                boxes.append((b["Left"], b["Top"], b["Left"] + b["Width"], b["Top"] + b["Height"] * 0.7, 1.0))
            else:
                boxes.append((b["Left"], b["Top"], b["Left"] + b["Width"], b["Top"] + b["Height"], 0.6))
    return boxes


def _center(boxes, nw, nh):
    if not boxes:
        return nw / 2, nh / 2
    wsum = sum(b[4] for b in boxes)
    return (sum((b[0] + b[2]) / 2 * b[4] for b in boxes) / wsum * nw,
            sum((b[1] + b[3]) / 2 * b[4] for b in boxes) / wsum * nh)


def _cover(im, W, H, boxes):
    iw, ih = im.size
    s = max(W / iw, H / ih)
    nw, nh = round(iw * s), round(ih * s)
    cx, cy = _center(boxes, nw, nh)
    x0 = int(min(max(cx - W / 2, 0), nw - W))
    y0 = int(min(max(cy - H / 2, 0), nh - H))
    out = im.resize((nw, nh), Image.LANCZOS).crop((x0, y0, x0 + W, y0 + H))
    return out, [(b[0] * nw - x0, b[1] * nh - y0, b[2] * nw - x0, b[3] * nh - y0, b[4]) for b in boxes]


# (배율, 붙이는 쪽, 벌점) — 1.0은 꽉 채워 자르기, 그보다 작으면 사진을 멀리 놓고 빈 곳은 흐린 같은 사진
ZOOMS = [(1.0, "mid", 0.0), (0.8, "start", 0.15), (0.8, "end", 0.15), (0.65, "start", 0.3), (0.65, "end", 0.3)]


def _place(im, W, H, boxes, z, anchor):
    if z >= 1.0:
        return _cover(im, W, H, boxes)
    bg, _ = _cover(im, W, H, [])
    bg = Image.blend(bg.filter(ImageFilter.GaussianBlur(28)), Image.new("RGB", (W, H), (8, 10, 16)), 0.45)
    iw, ih = im.size
    s = max(W / iw, H / ih) * z
    nw, nh = round(iw * s), round(ih * s)
    cx, cy = _center(boxes, nw, nh)
    big = im.resize((nw, nh), Image.LANCZOS)

    def axis(n, C, c):
        if n >= C:
            return int(min(max(c - C / 2, 0), n - C)), 0, C
        return 0, (0 if anchor == "start" else (C - n if anchor == "end" else (C - n) // 2)), n

    ox, px, cw = axis(nw, W, cx)
    oy, py, ch = axis(nh, H, cy)
    bg.paste(big.crop((ox, oy, ox + cw, oy + ch)), (px, py))
    return bg, [(b[0] * nw - ox + px, b[1] * nh - oy + py, b[2] * nw - ox + px, b[3] * nh - oy + py, b[4]) for b in boxes]


def _fit(text, max_w, max_size, min_size=40):
    size = max_size
    while size > min_size:
        f = ImageFont.truetype(ANTON, size)
        if f.getbbox(text)[2] <= max_w:
            return f
        size -= 4
    return ImageFont.truetype(ANTON, min_size)


def _layout(hook, W, H, vertical, k):
    """글자 덩어리 → (줄 목록[(글, 글꼴, 태그 여부)], 줄 높이들, 폭, 높이, 줄 간격, 여백)."""
    m = int(W * 0.06)
    max_w = int((W - 2 * m if vertical else W * 0.56) * k)
    lines = []
    kicker = (hook.get("kicker") or "").strip().upper()
    head = (hook.get("headline") or "").strip().upper()
    tag = (hook.get("tag") or "").strip()
    if kicker:
        kf = ImageFont.truetype(ANTON, int(H * (0.05 if vertical else 0.105) * k))
        cur = ""
        for w in kicker.split():
            t = (cur + " " + w).strip()
            if kf.getbbox(t)[2] > max_w and cur:
                lines.append((cur, kf, False))
                cur = w
            else:
                cur = t
        lines.append((cur, kf, False))
    hmax = int(H * (0.14 if vertical else 0.30) * k)
    hf = _fit(head, max_w, hmax)
    if hf.size < hmax * 0.62 and " " in head:
        ws = head.split()
        half = (len(ws) + 1) // 2
        parts = [" ".join(ws[:half]), " ".join(ws[half:])]
        hf = min((_fit(p, max_w, hmax) for p in parts), key=lambda f: f.size)
        lines += [(p, hf, False) for p in parts]
    else:
        lines.append((head, hf, False))
    if tag:
        lines.append((tag, ImageFont.truetype(SANS, int(H * (0.022 if vertical else 0.048) * max(k, 0.85))), True))
    gap = int(H * 0.008)
    heights = [f.getbbox(t)[3] - f.getbbox(t)[1] for t, f, _ in lines]
    total_h = sum(heights) + gap * (len(lines) - 1) + (int(H * 0.012) if tag else 0)
    return lines, heights, max(f.getbbox(t)[2] for t, f, _ in lines), total_h, gap, m


def _overlap(box, prot):
    l, t, r, b = box
    return sum(max(0, min(r, pr) - max(l, pl)) * max(0, min(b, pb) - max(t, pt)) * w for pl, pt, pr, pb, w in prot)


def render(im: Image.Image, prot01: list[tuple], hook: dict, W: int, H: int, vertical: bool) -> bytes:
    best = None
    for z, anchor, zp in ZOOMS:
        img_z, prot = _place(im, W, H, prot01, z, anchor)
        for k in (1.0, 0.9, 0.8, 0.7, 0.6):
            lines, heights, bw, bh, gap, m = _layout(hook, W, H, vertical, k)
            mt = int(H * 0.11) if vertical else m  # 쇼츠 탭이 위아래를 잘라 보여 준다(2026-11-25 실측 약 8%)
            xs = [m] if vertical else [m + (W - 2 * m - bw) * f / 8 for f in range(9)]
            ys = [mt + (H - 2 * mt - bh) * f / 12 for f in range(13)]
            for x in xs:
                for y in ys:
                    ov = _overlap((x, y, x + bw, y + bh), prot) / (W * H)
                    edge = min(x - m, W - m - bw - x) / W + min(y - mt, H - mt - bh - y) / H
                    score = ov * 40 + (1 - k) * 1.2 + edge * 0.6 + zp
                    if best is None or score < best[0]:
                        best = (score, int(x), int(y), lines, heights, bw, bh, gap, img_z, prot)
    _, x, y, lines, heights, bw, bh, gap, img, prot = best
    right = (not vertical) and x + bw / 2 > W / 2
    # 글자 주변만 어둡게, 얼굴·사람 머리 자리는 빼고
    pad_x, pad_y = int(W * 0.07), int(H * 0.07)
    shade = Image.new("L", (W, H), 0)
    ImageDraw.Draw(shade).rectangle((x - pad_x, y - pad_y, x + bw + pad_x, y + bh + pad_y), fill=175)
    shade = shade.filter(ImageFilter.GaussianBlur(int(min(W, H) * 0.09)))
    keep = Image.new("L", (W, H), 0)
    kd = ImageDraw.Draw(keep)
    for b in prot:
        if b[4] >= 3.0:
            kd.rectangle(b[:4], fill=255)
    keep = keep.filter(ImageFilter.GaussianBlur(int(min(W, H) * 0.03)))
    shade = ImageChops.multiply(shade, ImageOps.invert(keep))
    img = Image.composite(Image.new("RGB", (W, H), (8, 10, 16)), img, shade)
    txt = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    td = ImageDraw.Draw(txt)
    cy = y
    for (t, f, is_tag), h in zip(lines, heights):
        if is_tag and cy != y:
            cy += int(H * 0.012)
        tw = f.getbbox(t)[2]
        td.text(((x + bw - tw) if right else x, cy - f.getbbox(t)[1]), t, font=f, fill=INK + (255,))
        cy += h + gap
    sh = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sh.paste((0, 0, 0, 150), mask=txt.split()[3].filter(ImageFilter.GaussianBlur(6)))
    out = Image.alpha_composite(Image.alpha_composite(img.convert("RGBA"), sh), txt).convert("RGB")
    buf = io.BytesIO()
    out.save(buf, "JPEG", quality=92)
    return buf.getvalue()


# ── 묶음 ─────────────────────────────────────────────────────────────────────

def make(s3, work_dir: Path, *, article: str, script_text: str, title: str, day: dt.date, job_id: str) -> dict | None:
    """썸네일 두 장을 만든다 → {"h": Path, "v": Path, "hook": dict} 또는 None(못 만듦). 예외를 내지 않는다."""
    if not enabled():
        return None
    try:
        cands = candidates(article, day)
        used = _used_today(s3, day, job_id)
        used_fp = [u["fp"] for u in used if "fp" in u]
        prev = [f"- {u.get('kicker', '')} / {u.get('headline', '')}" for u in used]
        pool = []
        for c in cands:
            try:
                raw = _download(c["url"])
                fp = fingerprint(raw)
            except Exception as e:  # noqa: BLE001
                print(f"[prism-thumb] 사진 받기 실패(건너뜀): {c['url']} {e}")
                continue
            pool.append({**c, "raw": raw, "fp": fp})
        fresh = [c for c in pool if not any(_same_photo(c["fp"], u) for u in used_fp)]
        pool = (fresh or pool)[:MAX_CANDIDATES]
        if not pool:
            print("[prism-thumb] 후보 사진 없음 — 썸네일 건너뜀")
            return None
        hook = choose(script_text, title, pool, [_small_jpeg(c["raw"]) for c in pool], prev)
        if hook is None:
            print("[prism-thumb] 문구 검사를 통과하지 못함 — 썸네일 건너뜀")
            return None
        pick = pool[hook["photo"] - 1]
        im = Image.open(io.BytesIO(pick["raw"])).convert("RGB")
        try:
            prot = detect(im)
        except Exception as e:  # noqa: BLE001 — 얼굴 위치를 모르면 가릴 수 있으니 만들지 않는다
            print(f"[prism-thumb] 얼굴 찾기 실패 — 썸네일 건너뜀: {e}")
            return None
        out = {"hook": hook, "photo_url": pick["url"]}
        for sfx, W, H, vertical in (("h", 1280, 720, False), ("v", 1080, 1920, True)):
            path = work_dir / f"thumb_{sfx}.jpg"
            path.write_bytes(render(im, prot, hook, W, H, vertical))
            out[sfx] = path
        s3.put_object(Bucket=CMS_MEDIA_BUCKET, Key=f"media/prism-thumb/{day:%Y%m%d}/{job_id}.json",
                      ContentType="application/json",
                      Body=json.dumps({"fp": pick["fp"], "kicker": hook.get("kicker", ""), "headline": hook.get("headline", ""),
                                       "tag": hook.get("tag", ""), "photo_url": pick["url"]}, ensure_ascii=False).encode("utf-8"))
        print(f"[prism-thumb] {hook.get('kicker')} / {hook.get('headline')} / {hook.get('tag')} — 사진 {pick['caption'][:40]}")
        return out
    except Exception as e:  # noqa: BLE001 — 썸네일 실패가 영상 공개를 막으면 안 된다
        print(f"[prism-thumb] 썸네일 만들기 실패(무시): {e!r}")
        return None
