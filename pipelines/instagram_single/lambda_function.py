"""sedaily-lens-instagram-single — 서울경제 1면 기사를 인스타 lens.sedaily에 '사진 1장 + 본문형 캡션'으로 게시.

EventBridge 규칙 sedaily-lens-instagram-single-4x(매일 09·12·15·18시 KST)가 부른다. 한 번 부를 때 1건.
흐름: 공개 API에서 오늘 1면(paper_section="전체", display_order 순) 중 아직 안 올린 첫 기사
→ 원문 기사에서 대표 사진 설명(figcaption) 확보
→ Claude(Bedrock, LENS 비용 태그 프로필)가 사진+사진설명+레터를 보고 제목 2줄·자를 위치·캡션 작성
→ 1080x1350 JPEG(사진 + 아래 어둡게 + 제목 흰/파랑 + 오른쪽 위 LENS 로고)
→ S3 media/instagram/single/ 업로드(공개 읽기) → 그래프 API 단일 이미지 게시
→ SNS(ailens-ops-alerts) → Slack #03_lens-alarm.

수동 실행 이벤트:
  {"dry_run": true}                     만들기만(업로드·게시 안 함), 결과는 로그
  {"date": "2026-11-24"}                특정 날짜
하루 최대 MAX_PER_DAY건. 게시 기록은 S3 비공개 키(STATE_KEY)로 중복을 막는다.
"""
from __future__ import annotations

import html
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
from botocore.config import Config
from botocore.exceptions import ClientError
from PIL import Image, ImageDraw, ImageFont

KST = timezone(timedelta(hours=9))
HERE = Path(__file__).parent

LENS_API = "https://ailens.sedaily.ai/api/v2/posts"
GRAPH = "https://graph.facebook.com/v27.0"
IG_USER_ID = os.environ.get("IG_USER_ID", "17841439200858381")       # @lens.sedaily
S3_BUCKET = os.environ.get("S3_BUCKET", "sedaily-mbti-cms-media-dev")
S3_PREFIX = "media/instagram/single"                                   # 공개 읽기(버킷 정책 media/*)
STATE_KEY = os.environ.get("STATE_KEY", "instagram/single_posted.json")  # 비공개 — media/ 밖
TOKEN_PARAM = os.environ.get("TOKEN_PARAM", "/sedaily-lens/instagram/token")
NOTIFY_TOPIC_ARN = os.environ.get("NOTIFY_TOPIC_ARN", "")
MODEL_ID = os.environ["MODEL_ID"]                                      # LENS 비용 태그 application inference profile
MAX_PER_DAY = int(os.environ.get("MAX_PER_DAY", "4"))

FONT = HERE / "fonts" / "Pretendard-ExtraBold.otf"
FONT_SEMI = HERE / "fonts" / "Pretendard-SemiBold.otf"
LOGO = HERE / "lens-logo.png"
W, H = 1080, 1350
BLUE = (91, 141, 239)                      # 둘째 줄 강조색 — 11/24 형광 연두에서 원래 파란색으로 되돌림(11/26)
SAFE_W = 900                               # 프로필 격자(3:4)는 4:5 사진 양옆을 34px씩 자름 → 글자는 가운데 900px 안에
WEEKDAY = "월화수목금토일"
UA = {"User-Agent": "Mozilla/5.0 (sedaily-lens-instagram)"}

s3 = boto3.client("s3")
bedrock = boto3.client("bedrock-runtime", config=Config(read_timeout=240, retries={"max_attempts": 2}))


# ── 공용 ─────────────────────────────────────────────────────────────

def http_json(url: str, data: dict | None = None) -> dict:
    body = urllib.parse.urlencode(data).encode() if data is not None else None
    req = urllib.request.Request(url, data=body, method="POST" if body else "GET", headers=UA)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"HTTP {e.code}: {e.read().decode('utf-8', 'replace')[:500]}") from None


def http_bytes(url: str) -> bytes:
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
        return r.read()


def get_token() -> str:
    return boto3.client("ssm").get_parameter(Name=TOKEN_PARAM, WithDecryption=True)["Parameter"]["Value"].strip()


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


# ── 1. 기사·사진 ────────────────────────────────────────────────────

def front_page(date: str) -> list[dict]:
    listing = http_json(f"{LENS_API}?channel=lens&limit=300")
    items = listing.get("items") or listing.get("posts") or []
    front = [p for p in items if p.get("paper_section") == "전체" and str(p.get("date", "")).startswith(date)]
    front.sort(key=lambda p: p.get("display_order") or 0)
    return front


def photo_caption(source_url: str, photo_url: str) -> str:
    """원문 기사에서 대표 사진 설명(figcaption). 못 찾으면 ''."""
    try:
        page = http_bytes(source_url).decode("utf-8", "ignore")
    except Exception:  # noqa: BLE001
        return ""
    key = re.sub(r"_[A-Z0-9]+\.\w+$", "", photo_url.split("/")[-1])   # 크기 접미사(_P1 등) 앞까지
    i = page.find(key, max(0, page.find("<figure")))
    if i < 0:
        return ""
    m = re.search(r"<figcaption[^>]*>(.*?)</figcaption>", page[i:i + 6000], re.S)
    return html.unescape(re.sub(r"<[^>]+>|\s+", " ", m.group(1))).strip() if m else ""


def photo_credit(caption: str) -> str:
    m = re.search(r"(사진(?:제공)?\s*=\s*[^\s,.]+|(?:연합뉴스|뉴스1|AP|AFP|로이터|EPA|게티이미지(?:뱅크)?)\s*$)", caption)
    if not m:
        return ""
    return "사진=" + re.sub(r"^사진(제공)?=", "", m.group(1).replace(" ", ""))


HANJA = {"李": "이", "尹": "윤", "文": "문", "朴": "박", "金": "김", "韓": "한", "美": "미", "中": "중", "日": "일",
         "北": "북", "靑": "청", "與": "여", "野": "야", "檢": "검", "黃": "황", "英": "영", "獨": "독", "露": "러",
         "故": "고", "前": "전", "現": "현", "新": "신", "對": "대", "佛": "프", "伊": "이", "印": "인"}


def no_hanja(t: str) -> str:
    """제목 글꼴(Pretendard)에 한자가 없어 네모로 깨진다 → 신문에 자주 쓰는 한자는 한글로, 나머지가 남으면 실패."""
    t = "".join(HANJA.get(c, c) for c in t)
    if re.search(r"[一-鿿㐀-䶿豈-﫿]", t):
        raise RuntimeError(f"제목에 한자가 남음: {t}")
    return t


# ── 2. 글(AI) ───────────────────────────────────────────────────────

PROMPT = """아래는 서울경제 1면 기사를 AI LENS가 정리한 내용과, 게시물에 쓸 기사 사진(첨부)·사진 설명이다.
인스타그램 '사진 1장 + 본문형 캡션' 게시물을 만들어라.

[이미지 제목] 사진 아래 크게 들어가는 2줄. 각 줄 공백 포함 14자 이내. 피드에서 손가락이 멈추게 하는 SNS 뉴스 썸네일 말투.
- 1줄은 상황·인물, 2줄은 핵심 숫자·반전·궁금증.
- 예시 톤: "5000피 붕괴에도 / 청와대 \\"증시 충격 일시적\\"", "미워도 삼전닉스! / 배당 잔치 열렸다 ㄷㄷ", "전기세 내다가 / 개인정보 다 털렸다?", "토스 북미까지 진출 / 이번엔 캐나다 뚫는다"
- 짧은 인용("..."), 물음표, ㄷㄷ 허용. 이모지 금지.
- 한자 쓰지 말 것(글꼴에 없어 네모로 깨짐). 李→이 대통령, 靑→청와대, 美→미국, 中→중국처럼 한글로.
- 사실을 과장·왜곡하지 말 것. 줄이다가 뜻이 바뀌면 안 된다(예: '첫 여성'을 '65년 만의 여성'으로 줄이면 예전에도 있었던 것처럼 읽힌다 → 금지).
- 기사 속 서로 다른 대상·조치를 한 문장으로 합치지 말 것. 1줄의 주어·상황과 2줄의 결과는 기사에서 실제로 이어진 내용이어야 한다(예: 내신 부정행위는 '퇴학', 국가자격시험 부정행위는 '징역 5년'인데 "시험때 스마트워치 / 퇴학+징역 5년"으로 쓰면 한 사람이 둘 다 받는 것처럼 읽힌다 → 금지).

[사진 자르기] 사진은 세로 4:5로 잘린다. 사진 설명을 근거로, 제목에서 말하는 주인공이 사진 가로 어디에 있는지 focus_x(0=왼쪽 끝, 1=오른쪽 끝)로 답하라.
- 사진 설명에 "왼쪽부터" 같은 순서가 있으면 그 순서로 위치를 정한다. 얼굴로 사람을 알아보려 하지 말 것.
- 제목 주인공이 사진에 없거나 위치를 알 수 없으면, 제목에 사진에 없는 특정 인물 이름을 넣지 말고 focus_x는 0.5.

[캡션] 다음 형식을 정확히 따른다. 기사에 있는 사실·숫자만 쓴다. 추측 금지. ~입니다/~했는데요 체.
1) 도입 2~3문장 (첫 문장은 한눈에 무슨 일인지)
2) 빈 줄
3) "📌 소제목" 줄 + "- 요점" 3줄
4) 빈 줄
5) "📌 소제목" 줄 + "- 요점" 2~3줄
6) 빈 줄
7) 마무리 1~2문장 (앞으로 볼 점)
해시태그는 쓰지 말고 hashtags 배열로 따로 5~7개 (#없이).

반드시 JSON 한 개만 출력: {"title1": "...", "title2": "...", "focus_x": 0.5, "caption": "...", "hashtags": ["..."]}

[사진 설명] %s
[기사 제목] %s
[부제] %s
[요점]
%s
[본문]
%s
"""


def write_copy(post: dict, photo: Image.Image, caption_src: str) -> dict:
    letter = next((l for l in post.get("lenses", []) if l.get("format") == "letter"), {})
    prompt = PROMPT % (caption_src or "(없음)", post["headline"], post.get("context", ""),
                       "\n".join(letter.get("bullets") or []), "\n".join(letter.get("paragraphs") or [])[:6000])
    small = photo.copy()
    small.thumbnail((1200, 1200))
    buf = io.BytesIO()
    small.save(buf, "JPEG", quality=85)
    resp = bedrock.converse(
        modelId=MODEL_ID,
        messages=[{"role": "user", "content": [
            {"image": {"format": "jpeg", "source": {"bytes": buf.getvalue()}}},
            {"text": prompt}]}],
        inferenceConfig={"maxTokens": 12000})      # Sonnet 5는 답 전에 생각 토큰을 써서 넉넉히
    text = "".join(b.get("text", "") for b in resp["output"]["message"]["content"])
    if "{" not in text:
        raise RuntimeError(f"AI 응답에 JSON 없음 (stop={resp.get('stopReason')})")
    g = json.loads(text[text.find("{"): text.rfind("}") + 1])
    for k in ("title1", "title2", "caption"):
        if not str(g.get(k, "")).strip():
            raise RuntimeError(f"AI 응답에 {k} 없음")
    return g


# ── 3. 이미지 ───────────────────────────────────────────────────────

def make_image(photo: Image.Image, t1: str, t2: str, focus_x: float, date: str) -> Image.Image:
    s = max(W / photo.width, H / photo.height)
    if photo.width / photo.height > 2:         # 여러 명이 나란히 선 긴 사진 → 조금 더 당겨 옆 사람·경계선 제외
        s *= 1.15
    im = photo.resize((round(photo.width * s), round(photo.height * s)), Image.LANCZOS)
    x = min(max(0, round(im.width * focus_x - W / 2)), im.width - W)
    y = min(max(0, (im.height - H) // 3), im.height - H)
    im = im.crop((x, y, x + W, y + H))
    grad = Image.new("L", (1, H))
    for yy in range(H):
        t = max(0.0, (yy - H * 0.40) / (H * 0.42))
        grad.putpixel((0, yy), int(245 * min(1, t) ** 1.2))
    im = Image.composite(Image.new("RGB", (W, H), "black"), im, grad.resize((W, H)))
    d = ImageDraw.Draw(im)
    logo = Image.open(LOGO).convert("RGBA").resize((92, 92), Image.LANCZOS)
    im.paste(logo, (W - 92 - 44, 44), logo)
    size = 104
    while size > 60 and max(d.textlength(t, font=ImageFont.truetype(str(FONT), size)) for t in (t1, t2)) > SAFE_W:
        size -= 2
    f = ImageFont.truetype(str(FONT), size)
    y2 = H - 100 - size
    y1 = y2 - size - int(size * 0.24)
    for txt, yy, col in ((t1, y1, "white"), (t2, y2, BLUE)):
        d.text((W // 2, yy), txt, font=f, fill=col, anchor="mt", stroke_width=2, stroke_fill=(0, 0, 0))
    # 날짜(매일 올라가므로 제목 위에 작게)
    ymd = datetime.strptime(date, "%Y-%m-%d")
    fd = ImageFont.truetype(str(FONT_SEMI), 32)
    d.text((W // 2, y1 - 26), f"{ymd.year}.{ymd.month:02d}.{ymd.day:02d} ({WEEKDAY[ymd.weekday()]})",
           font=fd, fill=(205, 210, 218), anchor="mb")
    return im


# ── 4. 게시 ─────────────────────────────────────────────────────────

def wait_ready(container_id: str, token: str, tries: int = 30) -> None:
    for _ in range(tries):
        st = http_json(f"{GRAPH}/{container_id}?fields=status_code&access_token={token}")
        if st.get("status_code") == "FINISHED":
            return
        if st.get("status_code") in ("ERROR", "EXPIRED"):
            raise RuntimeError(f"컨테이너 {container_id} 상태 {st}")
        time.sleep(4)
    raise RuntimeError(f"컨테이너 {container_id} 준비 시간 초과")


def publish_single(jpeg: bytes, key: str, caption: str, token: str) -> str:
    s3.put_object(Bucket=S3_BUCKET, Key=key, Body=jpeg, ContentType="image/jpeg")
    url = f"https://{S3_BUCKET}.s3.us-east-1.amazonaws.com/{urllib.parse.quote(key)}"
    c = http_json(f"{GRAPH}/{IG_USER_ID}/media", {"image_url": url, "caption": caption, "access_token": token})
    wait_ready(c["id"], token)
    media = http_json(f"{GRAPH}/{IG_USER_ID}/media_publish", {"creation_id": c["id"], "access_token": token})
    return http_json(f"{GRAPH}/{media['id']}?fields=permalink&access_token={token}").get("permalink", media["id"])


def notify(title: str, body: str) -> None:
    print(f"[알림] {title}\n{body}")
    if not NOTIFY_TOPIC_ARN:
        return
    msg = {"version": "1.0", "source": "custom",
           "content": {"textType": "client-markdown", "title": title, "description": body}}
    try:
        boto3.client("sns", region_name=NOTIFY_TOPIC_ARN.split(":")[3]).publish(
            TopicArn=NOTIFY_TOPIC_ARN, Message=json.dumps(msg, ensure_ascii=False))
    except Exception as e:  # noqa: BLE001 — 알림 실패가 게시 결과를 바꾸지 않게
        print(f"[slack] 알림 실패: {e}")


# ── 진입점 ───────────────────────────────────────────────────────────

def lambda_handler(event, context):
    event = event or {}
    date = event.get("date") or datetime.now(KST).strftime("%Y-%m-%d")
    dry_run = bool(event.get("dry_run"))

    state = load_state()
    done = state.get(date, [])
    if len(done) >= MAX_PER_DAY and not dry_run:
        print(f"{date} 이미 {len(done)}건 게시 — 오늘 몫 끝")
        return {"date": date, "skipped": "daily limit"}

    failed = state.get(f"{date}_failed", [])
    skip_ids = {d["id"] for d in done} | set(failed)          # 실패한 기사는 다음 시간대에 건너뜀(같은 기사로 계속 막히지 않게)
    todo = [p for p in front_page(date) if p["id"] not in skip_ids]
    if not todo:
        print(f"{date} 올릴 1면 기사 없음 (게시 {len(done)}건)")   # 주말 등 — 슬랙 안 보냄
        return {"date": date, "skipped": "no article"}

    p = todo[0]
    headline = p["headline"]
    try:
        post = http_json(f"{LENS_API}/{urllib.parse.quote(p['id'])}?channel=lens")["post"]
        url = post.get("photo_image_url") or post.get("cover_image_url")
        if not url:
            raise RuntimeError("기사 사진 없음")
        photo = Image.open(io.BytesIO(http_bytes(url))).convert("RGB")
        cap_src = photo_caption(post.get("source_url", ""), url) if post.get("photo_image_url") else ""
        g = write_copy(post, photo, cap_src)
        g["title1"], g["title2"] = no_hanja(g["title1"].strip()), no_hanja(g["title2"].strip())
        fx =min(1.0, max(0.0, float(g.get("focus_x", 0.5))))
        buf = io.BytesIO()
        make_image(photo, g["title1"].strip(), g["title2"].strip(), fx, date).save(buf, "JPEG", quality=92)
        credit = photo_credit(cap_src)
        caption = (g["caption"].strip() + "\n\n" + (credit + "\n" if credit else "") + "원문: 서울경제신문\n\n"
                   + " ".join("#" + h.lstrip("#").replace(" ", "") for h in g.get("hashtags", [])))[:2200]
        print(f"[{headline}] 제목: {g['title1']} / {g['title2']} focus_x={fx} credit={credit!r}\n{caption}")
        if dry_run:
            return {"date": date, "dry_run": True, "title": [g["title1"], g["title2"]], "caption": caption}
        slug = re.sub(r"[^0-9A-Za-z]+", "-", post.get("source_url", "").rsplit("/", 1)[-1]) or str(int(time.time()))
        link = publish_single(buf.getvalue(), f"{S3_PREFIX}/{date}/{slug}.jpg", caption, get_token())
        done.append({"id": p["id"], "link": link, "at": datetime.now(KST).strftime("%H:%M")})
        state[date] = done
        save_state(state)
        notify(f"🖼️ 인스타 1면 카드 {date} ({len(done)}/{MAX_PER_DAY})",
               f"✅ <{link}|{g['title1']} {g['title2']}>\n{headline}")
        return {"date": date, "link": link}
    except Exception as e:  # noqa: BLE001
        if not dry_run:
            state[f"{date}_failed"] = failed + [p["id"]]
            save_state(state)
        notify(f"⚠️ 인스타 1면 카드 {date} — 게시 실패", f"❌ {headline}\n{type(e).__name__}: {str(e)[:300]}")
        raise
