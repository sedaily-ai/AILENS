"""sedaily-lens-instagram-webtoon — 서울경제 1면 AI LENS 웹툰을 인스타 lens.sedaily에 캐러셀(10장)로 게시.

EventBridge 규칙 sedaily-lens-instagram-webtoon-daily(매일 08:00 KST)가 부른다.
흐름: 공개 API에서 오늘 1면(paper_section="전체") → 기사마다 표지 1 + 웹툰 8컷 + 마무리 1 = 10장 JPEG
→ S3 media/instagram/ 업로드(공개 읽기 경로라 인스타가 가져갈 수 있음) → 그래프 API 캐러셀 게시
→ SNS(ailens-ops-alerts) → Q Developer → Slack #03_lens-alarm 요약.

수동 실행 이벤트:
  {"dry_run": true}                    이미지·캡션만 만들고 게시·업로드 안 함(로그로 확인)
  {"date": "2026-11-20", "only": 3}    특정 날짜·n번째 기사만
토큰은 SSM SecureString(TOKEN_PARAM)에서 읽는다. 게시 기록은 S3 비공개 키(STATE_KEY)로 중복을 막는다.
"""
from __future__ import annotations

import io
import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

import boto3
from botocore.exceptions import ClientError
from PIL import Image, ImageDraw, ImageFilter, ImageFont

KST = timezone(timedelta(hours=9))
HERE = Path(__file__).parent
TMP = Path("/tmp/ig")

LENS_API = "https://ailens.sedaily.ai/api/v2/posts"
GRAPH = "https://graph.facebook.com/v27.0"
IG_USER_ID = os.environ.get("IG_USER_ID", "17841439200858381")       # @lens.sedaily
S3_BUCKET = os.environ.get("S3_BUCKET", "sedaily-mbti-cms-media-dev")
S3_PREFIX = "media/instagram"                                          # 공개 읽기(버킷 정책 media/*)
STATE_KEY = os.environ.get("STATE_KEY", "instagram/posted.json")       # 비공개 — media/ 밖
TOKEN_PARAM = os.environ.get("TOKEN_PARAM", "/sedaily-lens/instagram/token")
NOTIFY_TOPIC_ARN = os.environ.get("NOTIFY_TOPIC_ARN", "")
GAP_BETWEEN_POSTS_SEC = int(os.environ.get("GAP_BETWEEN_POSTS_SEC", "60"))  # Lambda 15분 한도 안에 4~5건

FONT_BOLD = HERE / "fonts" / "Pretendard-ExtraBold.otf"
FONT_SEMI = HERE / "fonts" / "Pretendard-SemiBold.otf"
FONT_REG = HERE / "fonts" / "Pretendard-Medium.otf"

SIZE = (1824, 1490)                        # 웹툰 컷과 같은 크기 → 캐러셀 안에서 한 장도 안 잘림
LENS_COLORS = ["#F5A524", "#3B82F6", "#22C55E", "#EF4444"]

s3 = boto3.client("s3")


# ── 공용 ─────────────────────────────────────────────────────────────

def http_json(url: str, data: dict | None = None) -> dict:
    body = urllib.parse.urlencode(data).encode() if data is not None else None
    req = urllib.request.Request(url, data=body, method="POST" if body else "GET")
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"HTTP {e.code}: {e.read().decode('utf-8', 'replace')[:500]}") from None


def http_bytes(url: str) -> bytes:
    with urllib.request.urlopen(url, timeout=60) as r:
        return r.read()


def strip_emoji(s: str) -> str:
    # 표지 글꼴에 이모지가 없어 네모로 깨지므로 그림용 제목에서만 뺀다(캡션엔 그대로 둔다).
    return re.sub(r"[\U0001F000-\U0001FFFF☀-➿️‍]", "", s).strip()


def get_token() -> str:
    ssm = boto3.client("ssm")
    return ssm.get_parameter(Name=TOKEN_PARAM, WithDecryption=True)["Parameter"]["Value"].strip()


def load_state() -> dict:
    try:
        return json.loads(s3.get_object(Bucket=S3_BUCKET, Key=STATE_KEY)["Body"].read())
    except ClientError as e:
        if e.response.get("Error", {}).get("Code") in ("NoSuchKey", "404"):
            return {}
        raise


def save_state(state: dict) -> None:
    s3.put_object(Bucket=S3_BUCKET, Key=STATE_KEY, ContentType="application/json",
                  Body=json.dumps(state, ensure_ascii=False, indent=1).encode("utf-8"))


# ── 1. 기사 가져오기 ─────────────────────────────────────────────────

def front_page_articles(date: str) -> list[dict]:
    listing = http_json(f"{LENS_API}?channel=lens&limit=300")
    items = listing.get("items") or listing.get("posts") or []
    front = [p for p in items if p.get("paper_section") == "전체" and str(p.get("date", "")).startswith(date)]
    front.sort(key=lambda p: p.get("display_order") or 0)
    out = []
    for p in front:
        detail = http_json(f"{LENS_API}/{urllib.parse.quote(p['id'])}?channel=lens")["post"]
        webtoon = next((l for l in detail.get("lenses", []) if l.get("format") == "webtoon"), None)
        cuts = [im for im in (webtoon or {}).get("images", []) if "webtoon-cut" in im.get("url", "")]
        out.append({
            "id": detail["id"],
            "headline": detail["headline"],
            "date": date,
            "source_url": detail.get("source_url", ""),
            "bullets": (webtoon or {}).get("bullets", []),
            "cuts": cuts[:8],
        })
    return out


# ── 2. 이미지 만들기 ────────────────────────────────────────────────

def wrap(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont, max_w: int) -> list[str]:
    """한국어는 띄어쓰기 단위로 먼저 끊고, 한 단어가 너무 길면 글자 단위로 끊는다."""
    lines, cur = [], ""
    for word in text.split(" "):
        trial = (cur + " " + word).strip()
        if draw.textlength(trial, font=font) <= max_w:
            cur = trial
            continue
        if cur:
            lines.append(cur)
        cur = ""
        for ch in word:
            if draw.textlength(cur + ch, font=font) > max_w:
                lines.append(cur)
                cur = ch
            else:
                cur += ch
    if cur:
        lines.append(cur)
    return lines


def grid_safe_box() -> tuple[int, int]:
    """프로필 격자는 사진 가운데를 세로 3:4로 잘라 보여준다 → 글자는 이 폭 안에만 둔다."""
    w, h = SIZE
    crop_w = h * 3 // 4
    left = (w - crop_w) // 2
    margin = 70
    return left + margin, left + crop_w - margin


def make_cover(article: dict, first_cut: Image.Image) -> Image.Image:
    w, h = SIZE
    bg = first_cut.resize(SIZE).filter(ImageFilter.GaussianBlur(18))
    img = Image.blend(bg, Image.new("RGB", SIZE, (14, 16, 22)), 0.72)
    d = ImageDraw.Draw(img)
    x0, x1 = grid_safe_box()
    cx, max_w = w // 2, x1 - x0

    title = strip_emoji(article["headline"])
    for size in (104, 96, 88, 80, 72):
        title_font = ImageFont.truetype(str(FONT_BOLD), size)
        lines = wrap(d, title, title_font, max_w)
        if len(lines) <= 5:
            break
    line_h = int(title_font.size * 1.3)
    label_font = ImageFont.truetype(str(FONT_SEMI), 60)
    small = ImageFont.truetype(str(FONT_REG), 46)
    block_h = 16 + 50 + 60 + 70 + line_h * len(lines) + 60 + 46
    y = (h - block_h) // 2 - 30

    bar_w, gap = 80, 12
    bx = cx - (bar_w * len(LENS_COLORS) - gap) // 2
    for i, c in enumerate(LENS_COLORS):
        d.rectangle([bx + i * bar_w, y, bx + (i + 1) * bar_w - gap, y + 16], fill=c)
    y += 16 + 50
    d.text((cx, y), "AI LENS 웹툰", font=label_font, fill="#F5A524", anchor="mt")
    y += 60 + 70
    for ln in lines:
        d.text((cx, y), ln, font=title_font, fill="#FFFFFF", anchor="mt")
        y += line_h
    y += 60
    ymd = datetime.strptime(article["date"], "%Y-%m-%d")
    d.text((cx, y), f"서울경제 1면 · {ymd.year}.{ymd.month:02d}.{ymd.day:02d}", font=small, fill="#C9CDD6", anchor="mt")
    return img


def make_ending() -> Image.Image:
    w, h = SIZE
    img = Image.new("RGB", SIZE, (14, 16, 22))
    d = ImageDraw.Draw(img)
    bar_w = 90
    x0 = (w - (bar_w * len(LENS_COLORS) - 12)) // 2
    for i, c in enumerate(LENS_COLORS):
        d.rectangle([x0 + i * bar_w, 430, x0 + (i + 1) * bar_w - 12, 446], fill=c)
    d.text((w // 2, 560), "전체 기사는 AI LENS에서", font=ImageFont.truetype(str(FONT_BOLD), 104), fill="#FFFFFF", anchor="mt")
    d.text((w // 2, 730), "읽기 · 보기 · 듣기", font=ImageFont.truetype(str(FONT_SEMI), 72), fill="#C9CDD6", anchor="mt")
    d.text((w // 2, 900), "ailens.sedaily.ai", font=ImageFont.truetype(str(FONT_BOLD), 88), fill="#F5A524", anchor="mt")
    d.text((w // 2, 1060), "프로필 링크에서 바로 가기", font=ImageFont.truetype(str(FONT_REG), 54), fill="#8A90A0", anchor="mt")
    return img


def build_slides(article: dict, out_dir: Path) -> list[Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    cuts = []
    for cut in article["cuts"]:
        im = Image.open(io.BytesIO(http_bytes(cut["url"]))).convert("RGB")
        cuts.append(im if im.size == SIZE else im.resize(SIZE))
    paths = []
    for i, im in enumerate([make_cover(article, cuts[0]), *cuts, make_ending()], 1):
        p = out_dir / f"{i:02d}.jpg"
        im.save(p, "JPEG", quality=90, optimize=True)   # 인스타는 JPEG만, 장당 8MB 이하
        paths.append(p)
    return paths


def make_caption(article: dict) -> str:
    bullets = article["bullets"]
    summary = " ".join(bullets[:1] + bullets[-1:]) if bullets else ""
    lines = [
        f"[AI LENS 웹툰] {article['headline']}",
        "",
        summary,
        "",
        "컷 8장으로 보는 오늘의 서울경제 1면 기사.",
        "전체 기사는 프로필 링크의 AI LENS에서 읽기·보기·듣기로 확인하세요.",
        "",
        "#AILENS #서울경제 #경제웹툰 #오늘의뉴스 #경제뉴스",
    ]
    return "\n".join(lines).strip()[:2200]


# ── 3. 게시 ─────────────────────────────────────────────────────────

def s3_upload(local: Path, key: str) -> str:
    s3.upload_file(str(local), S3_BUCKET, key, ExtraArgs={"ContentType": "image/jpeg"})
    return f"https://{S3_BUCKET}.s3.us-east-1.amazonaws.com/{urllib.parse.quote(key)}"


def wait_ready(container_id: str, token: str, tries: int = 30) -> None:
    for _ in range(tries):
        st = http_json(f"{GRAPH}/{container_id}?fields=status_code&access_token={token}")
        if st.get("status_code") == "FINISHED":
            return
        if st.get("status_code") in ("ERROR", "EXPIRED"):
            raise RuntimeError(f"컨테이너 {container_id} 상태 {st}")
        time.sleep(4)
    raise RuntimeError(f"컨테이너 {container_id} 준비 시간 초과")


def publish_carousel(article: dict, slide_paths: list[Path], caption: str, token: str) -> str:
    slug = re.sub(r"[^0-9A-Za-z]+", "-", article["source_url"].rsplit("/", 1)[-1]) or "post"
    urls = [s3_upload(p, f"{S3_PREFIX}/{article['date']}/{slug}/{p.name}") for p in slide_paths]
    children = [http_json(f"{GRAPH}/{IG_USER_ID}/media",
                          {"image_url": u, "is_carousel_item": "true", "access_token": token})["id"] for u in urls]
    for cid in children:
        wait_ready(cid, token)
    parent = http_json(f"{GRAPH}/{IG_USER_ID}/media", {
        "media_type": "CAROUSEL", "children": ",".join(children), "caption": caption, "access_token": token})
    wait_ready(parent["id"], token)
    media = http_json(f"{GRAPH}/{IG_USER_ID}/media_publish", {"creation_id": parent["id"], "access_token": token})
    info = http_json(f"{GRAPH}/{media['id']}?fields=permalink&access_token={token}")
    return info.get("permalink", media["id"])


def notify(results: list[dict], date: str, dry_run: bool) -> list[str]:
    lines = []
    for r in results:
        if r.get("link"):
            lines.append(f"✅ <{r['link']}|{r['headline']}>")
        elif r.get("error"):
            lines.append(f"❌ {r['headline']} — {r['error'][:160]}")
        else:
            lines.append(f"⏭ {r['headline']} — {r.get('skipped')}")
    print("[요약]\n" + ("\n".join(lines) or "(1면 기사 없음)"))
    if dry_run or not NOTIFY_TOPIC_ARN:
        return lines
    ok = sum(1 for r in results if r.get("link"))
    fail = sum(1 for r in results if r.get("error"))
    if not results:
        title = f"📷 인스타 웹툰 {date} — 1면 기사 없음"
    elif fail:
        title = f"⚠️ 인스타 웹툰 {date} — {len(results)}건 중 {ok}건 게시, {fail}건 실패"
    else:
        title = f"📷 인스타 웹툰 {date} — {ok}건 게시"
    msg = {"version": "1.0", "source": "custom", "content": {
        "textType": "client-markdown", "title": title,
        "description": "\n".join(lines) or "오늘은 올릴 1면 기사가 없습니다."}}
    try:
        boto3.client("sns", region_name=NOTIFY_TOPIC_ARN.split(":")[3]).publish(
            TopicArn=NOTIFY_TOPIC_ARN, Message=json.dumps(msg, ensure_ascii=False))
    except Exception as e:  # noqa: BLE001 — 알림 실패가 게시 결과를 바꾸지 않게
        print(f"[slack] 알림 실패: {e}")
    return lines


# ── 진입점 ───────────────────────────────────────────────────────────

def lambda_handler(event, context):
    event = event or {}
    date = event.get("date") or datetime.now(KST).strftime("%Y-%m-%d")
    dry_run = bool(event.get("dry_run"))
    only = int(event.get("only") or 0)

    articles = front_page_articles(date)
    print(f"{date} 1면 기사 {len(articles)}건 (dry_run={dry_run})")
    picked = list(enumerate(articles))
    if only:
        picked = picked[only - 1: only]

    state = load_state()
    token = "" if dry_run else get_token()
    results, posted_any = [], False
    for n, a in picked:
        r = {"headline": a["headline"]}
        results.append(r)
        if len(a["cuts"]) < 8:
            r["skipped"] = f"웹툰 컷 {len(a['cuts'])}장뿐(8장 필요)"
            continue
        if a["id"] in state:
            r["skipped"] = f"이미 게시됨 {state[a['id']]}"
            continue
        try:
            paths = build_slides(a, TMP / date / f"{n + 1:02d}")
            caption = make_caption(a)
            if dry_run:
                r["skipped"] = f"미리보기(게시 안 함) — 이미지 {len(paths)}장, 캡션 {len(caption)}자"
                continue
            if posted_any:
                time.sleep(GAP_BETWEEN_POSTS_SEC)
            r["link"] = publish_carousel(a, paths, caption, token)
            posted_any = True
            state[a["id"]] = r["link"]
            save_state(state)
        except Exception as e:  # noqa: BLE001 — 한 기사가 실패해도 다음 기사는 계속
            r["error"] = f"{type(e).__name__}: {e}"
    lines = notify(results, date, dry_run)
    return {"date": date, "dry_run": dry_run, "results": results, "summary": lines}
