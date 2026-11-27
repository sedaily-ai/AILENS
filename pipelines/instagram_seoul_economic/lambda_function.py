"""sedaily-instagram-seoul-economic — 서울경제 지면 1면 기사를 인스타 @seoul_economic에 '사진 1장 + 본문형 캡션'으로 게시.

LENS 시험 채널(pipelines/instagram_single/)과 같은 카드 형식을 서울경제 공식 계정용으로 바꾼 것.
LENS와 다른 점:
  - 기사: LENS 발행을 기다리지 않고 S3 daily-xml에서 지면 1면을 직접 읽는다(새벽 6시 첫 게시가 가능하도록).
    1면 기사는 전날 저녁~자정 무렵 웹에 올라오므로 지면 날짜 D와 D-1 파일을 함께 본다.
    순서: 지면 맨 위(TOP) 기사 → 나머지는 웹 게재 시각 순. 사진 없는(또는 너무 작은) 기사는 건너뛴다.
  - 제목: SNS 말투(ㄷㄷ 등) 대신 담백한 뉴스 제목체.
  - 로고: 오른쪽 위 LENS 로고 대신 아래 가운데 서울경제 로고(S 아이콘 + 서울경제).
  - 알림: Slack 보내지 않음(결과는 CloudWatch 로그).

EventBridge가 매일 부른다. 한 번 부를 때 1건.
  - 1면: 06·07·08·12·14시 KST, 하루 최대 MAX_PER_DAY(5)건. 남은 1면 기사가 없으면(4건뿐인 날의 14시,
    일요일·휴간일) 아무것도 하지 않는다.
  - 연예: 10·16·19·21시 KST, 하루 최대 MAX_ENT_PER_DAY(4)건. 최근 24시간 연예·영화 기사(사진 있는 것) 중
    '문화 많이 본 뉴스'에 오른 것을 먼저, 아니면 AI가 1건 고른다. 민감 기사(열애설·이혼·사건사고·투병·폭로)와
    최근 3일 올린 것과 같은 이야기는 뺀다.

수동 실행 이벤트:
  {"dry_run": true}                     만들기만(업로드·게시 안 함), 결과는 로그
  {"date": "2026-11-26"}                특정 지면 날짜
  {"kind": "front"} / {"kind": "ent"}   종류 지정(없으면 지금 시각으로 판단)
  {"now": "2026-11-26T16:00:00"}        시험용 — 그 시각인 것처럼 후보를 고른다
게시 기록은 S3 비공개 키(STATE_KEY)로 중복을 막는다.
"""
from __future__ import annotations

import html
import io
import json
import math
import os
import re
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from pathlib import Path

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError
from PIL import Image, ImageDraw, ImageFont

KST = timezone(timedelta(hours=9))
HERE = Path(__file__).parent

XML_BUCKET = os.environ.get("XML_BUCKET", "sedaily-news-xml-storage")
XML_PREFIX = "daily-xml"
GRAPH = "https://graph.facebook.com/v27.0"
IG_USER_ID = os.environ.get("IG_USER_ID", "17841401925138933")       # @seoul_economic
S3_BUCKET = os.environ.get("S3_BUCKET", "sedaily-mbti-cms-media-dev")
S3_PREFIX = "media/instagram/seoul_economic"                           # 공개 읽기(버킷 정책 media/*)
STATE_KEY = os.environ.get("STATE_KEY", "instagram/seoul_economic_posted.json")  # 비공개 — media/ 밖
TOKEN_PARAM = os.environ.get("TOKEN_PARAM", "/sedaily-lens/instagram/token-seoul-economic")  # "서울경제 LENS" 시스템 사용자 seoul-economic-publisher
MODEL_ID = os.environ["MODEL_ID"]
MAX_PER_DAY = int(os.environ.get("MAX_PER_DAY", "5"))              # 1면
MAX_ENT_PER_DAY = int(os.environ.get("MAX_ENT_PER_DAY", "4"))      # 연예
MIN_PHOTO_W = 600                          # 이보다 작은 사진은 1080px로 키우면 흐려져 건너뜀

FONT = HERE / "fonts" / "Pretendard-ExtraBold.otf"
FONT_SEMI = HERE / "fonts" / "Pretendard-SemiBold.otf"
LOGO = HERE / "sedaily-logo-white.png"     # sedaily.com의 로고(SVG, 흰색으로)와 S 아이콘을 합친 것
W, H = 1080, 1350
BLUE = (91, 141, 239)
SAFE_W = 900                               # 프로필 격자(3:4)는 4:5 사진 양옆을 34px씩 자름 → 글자는 가운데 900px 안에
LOGO_H = 65                                 # 11/26 40→65(크게)
WEEKDAY = "월화수목금토일"
UA = {"User-Agent": "Mozilla/5.0 (sedaily-instagram)"}

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


def strip_html(s: str) -> str:
    s = re.sub(r"<br\s*/?>|</p>", "\n", s or "", flags=re.I)
    s = html.unescape(re.sub(r"<[^>]+>", "", s))
    return re.sub(r"[ \t]+", " ", re.sub(r"\n\s*\n+", "\n", s)).strip()


# ── 1. 기사(S3 daily-xml 지면 1면) ──────────────────────────────────

def _xml_root(day: str) -> ET.Element | None:
    try:
        raw = s3.get_object(Bucket=XML_BUCKET, Key=f"{XML_PREFIX}/{day}.xml")["Body"].read()
    except ClientError as e:
        if e.response.get("Error", {}).get("Code") in ("NoSuchKey", "404"):
            return None
        raise
    return ET.fromstring(raw)


def front_page(date: str) -> list[dict]:
    """지면 날짜 date(YYYY-MM-DD)의 1면 기사. TOP 먼저, 나머지는 웹 게재 시각 순. 사진 없거나 작은 기사는 뺀다."""
    paper = date.replace("-", "")
    prev = (datetime.strptime(paper, "%Y%m%d") - timedelta(days=1)).strftime("%Y%m%d")
    found: dict[str, dict] = {}
    for day in (prev, paper):
        root = _xml_root(day)
        if root is None:
            continue
        for it in root:
            p = it.find("paper")
            if p is None or (p.findtext("editingInfo/paperNumber") or "").strip() != "1" \
                    or (p.findtext("publishInfo/date") or "").strip() != paper:
                continue
            a = _article(it)
            if a:
                a["top"] = (p.findtext("editingInfo/paragraph") or "").strip() == "TOP"
                found[a["id"]] = a                                # 같은 기사가 두 파일에 있으면 뒤(최신)로 덮음
    arts = sorted(found.values(), key=lambda a: (not a["top"], a["at"]))
    return [a for a in arts if _photo_ok(a)]


def _article(it: ET.Element) -> dict | None:
    nsid = (it.findtext("nsid") or "").strip()
    title = (it.findtext("title") or "").strip()
    if not nsid or not title:
        return None
    img = it.find("image")
    return {
        "id": nsid,
        "key": (it.findtext("key") or "").strip(),                # sedaily.com/article/{key} 공개 번호
        "title": title,
        "sub_title": strip_html(it.findtext("subTitle") or ""),
        "content": strip_html(it.findtext("content") or ""),
        "categories": [c.get("name", "") for c in it.findall("category")],
        "url": (it.find("url").get("href") if it.find("url") is not None else "") or "",
        "photo_url": img.get("href") if img is not None else None,
        "photo_w": int(img.get("width") or 0) if img is not None else 0,
        "photo_caption": " ".join(x for x in ((img.get("caption_title") or "").strip(),
                                              (img.get("caption_content") or "").strip()) if x)
                         if img is not None else "",
        "at": f"{(it.findtext('date') or '').strip()} {(it.findtext('time') or '').strip()}",
    }


# 사진 설명으로 알아보는 그래픽·표·로고 이미지 — 제목을 얹으면 글자가 겹쳐 지저분해 건너뜀(11/27)
GRAPHIC_RE = re.compile(r"그래픽|자료\s*=|인포그래픽|도표|\bCI\b|로고|캡처|캡쳐")


def _photo_ok(a: dict) -> bool:
    if not a["photo_url"]:
        print(f"사진 없음 — 건너뜀: {a['title']}")
        return False
    if a["photo_w"] and a["photo_w"] < MIN_PHOTO_W:
        print(f"사진 작음({a['photo_w']}px) — 건너뜀: {a['title']}")
        return False
    if GRAPHIC_RE.search(a.get("photo_caption") or ""):
        print(f"그래픽·표 사진 — 건너뜀: {a['title']}")
        return False
    return True


# ── 1-3. 코주부(@co.ju.boo) 기사 — 그날 지면의 주식·부동산·코인 ────────

COJUBOO_GROUPS = ("주식", "부동산", "코인")


def cojuboo_group(a: dict) -> str | None:
    tops = {c.split(",")[0] for c in a["categories"]}
    text = " ".join(a["categories"]) + " " + a["title"]
    if "블록체인" in tops or "코인" in text or "가상자산" in text:
        return "코인"
    if "부동산" in tops:
        return "부동산"
    if "증권" in tops and a.get("page", 0) >= 6:          # 신문 뒤쪽 증권면(Market-signal 지면에 가깝게)
        return "주식"
    return None


def cojuboo_candidates(date: str) -> list[dict]:
    """지면 날짜 date의 기사 중 코주부 주제(주식·부동산·코인), 사진 쓸 수 있는 것. group·page를 붙여 돌려준다."""
    paper = date.replace("-", "")
    prev = (datetime.strptime(paper, "%Y%m%d") - timedelta(days=1)).strftime("%Y%m%d")
    found: dict[str, dict] = {}
    for day in (prev, paper):
        root = _xml_root(day)
        if root is None:
            continue
        for it in root:
            p = it.find("paper")
            if p is None or (p.findtext("publishInfo/date") or "").strip() != paper:
                continue
            a = _article(it)
            if not a:
                continue
            a["page"] = int((p.findtext("editingInfo/paperNumber") or "0").strip() or 0)
            g = cojuboo_group(a)
            if g:
                a["group"] = g
                found[a["id"]] = a
    out = []
    for a in sorted(found.values(), key=lambda a: (a["page"], a["at"])):
        if a["page"] < 6:                                   # 1~5면 종합면 제외 — 분류가 엉뚱하게 붙은 기사가 많다(11/27 신현송 기사가 '부동산')
            continue
        if not _photo_ok(a):
            continue
        if not (a.get("photo_caption") or "").strip():     # 지면 그래픽·표는 사진 설명이 비어 있는 경우가 많다(11/27 K바이오 기사)
            print(f"사진 설명 없음(그래픽 가능성) — 건너뜀: {a['title']}")
            continue
        out.append(a)
    return out


# 하루 5건 = 주식 3 · 부동산 1 · 코인 1 (11/27 결정). 칸마다 이 순서의 주제를 먼저 찾는다.
COJUBOO_ORDER = ("주식", "부동산", "주식", "코인", "주식")


def pick_cojuboo(cands: list[dict], recent_groups: list[str]) -> dict | None:
    """오늘 n번째 칸 → COJUBOO_ORDER[n] 주제의 지면 앞쪽 기사. 그 주제 후보가 없으면 아직 몫이 남은 다른 주제, 그래도 없으면 아무 주제."""
    if not cands:
        return None
    n = len(recent_groups)
    want = COJUBOO_ORDER[n % len(COJUBOO_ORDER)]
    quota = {g: COJUBOO_ORDER.count(g) - recent_groups.count(g) for g in COJUBOO_GROUPS}
    key = lambda a: (a["page"], a["at"])  # noqa: E731
    for pool in ([a for a in cands if a["group"] == want],
                 [a for a in cands if quota.get(a["group"], 0) > 0],
                 cands):
        if pool:
            return min(pool, key=key)
    return None


# ── 1-2. 연예 기사(S3 daily-xml, 최근 24시간) ──────────────────────

def ent_candidates(now: datetime) -> list[dict]:
    """now 기준 최근 24시간에 웹에 올라온 연예 기사 + 영화 기사(리뷰·인터뷰 판단은 AI), 사진 있는 것만."""
    since = (now - timedelta(hours=24)).strftime("%Y-%m-%d %H:%M:%S")
    until = now.strftime("%Y-%m-%d %H:%M:%S")
    found: dict[str, dict] = {}
    for day in ((now - timedelta(days=1)).strftime("%Y%m%d"), now.strftime("%Y%m%d")):
        root = _xml_root(day)
        if root is None:
            continue
        for it in root:
            a = _article(it)
            if not a or not (since <= a["at"] <= until):
                continue
            if any(c.startswith("연예,") or c == "문화·라이프,문화,영화" for c in a["categories"]):
                found[a["id"]] = a
    return [a for a in sorted(found.values(), key=lambda a: a["at"]) if _photo_ok(a)]


def popular_keys() -> list[str]:
    """서울경제 모바일 '문화 많이 본 뉴스'(조회수 순위)의 기사 번호. 실패하면 빈 목록(고르기는 AI만으로)."""
    try:
        page = http_bytes("https://m.sedaily.com/culture/movie").decode("utf-8", "ignore")
    except Exception as e:  # noqa: BLE001
        print(f"많이 본 뉴스 읽기 실패: {e}")
        return []
    i = page.find("많이 본 뉴스")
    return re.findall(r'href="[^"]*article/(\d+)"', page[i:i + 6000]) if i >= 0 else []


ENT_PICK_PROMPT = """아래는 서울경제 연예·영화 기사 후보다. 서울경제 공식 인스타그램(뉴스 계정)에 지금 올릴 기사 1건을 고른다.

1) 빼야 할 기사(민감): 열애설·결별·이혼·불륜, 사건·사고·범죄·마약 등 논란, 투병·건강 악화, 폭로·악플.
   (공식 결혼·열애 발표, 임신·출산 소식, 자녀 이야기, 고인 추모, 성형·시술 고백은 괜찮다.)
2) 영화 분류 기사는 영화 리뷰·배우 인터뷰·흥행 소식만 후보로 본다. 영화 정책·산업 기사는 뺀다.
3) [최근 올린 기사]와 같은 인물·같은 이야기면 뺀다. [최근 올린 기사]의 마지막 줄(바로 전 게시물)과 같은 종류의 소재
   (예: 자녀 자랑 → 자녀 자랑, 결혼 소식 → 결혼 소식)는 연달아 고르지 않는다.
4) 남은 후보 중 인스타에서 반응이 좋을 기사 1건: 많이 알려진 작품·인물, 흥미로운 장면·발언, 새 작품·흥행 소식.
   [많이 본 뉴스] 표시가 있는 후보가 조건을 만족하면 그것을 먼저 고른다.
올릴 만한 기사가 없으면 no를 0으로.

JSON만 출력: {"no": 번호, "why": "짧게"}

[최근 올린 기사]
%s

[후보]
%s"""


def pick_ent(cands: list[dict], recent_titles: list[str], popular: list[str]) -> dict | None:
    if not cands:
        return None
    lst = "\n".join(f"{i}. {'[많이 본 뉴스] ' if a['key'] in popular else ''}[{a['categories'][0].split(',')[-1]}] "
                    f"{a['title']} — {a['content'][:200]}" for i, a in enumerate(cands, 1))
    resp = bedrock.converse(
        modelId=MODEL_ID,
        messages=[{"role": "user", "content": [{"text": ENT_PICK_PROMPT % ("\n".join(recent_titles) or "(없음)", lst)}]}],
        inferenceConfig={"maxTokens": 8000})
    text = "".join(b.get("text", "") for b in resp["output"]["message"]["content"])
    g = json.loads(text[text.find("{"): text.rfind("}") + 1])
    no = int(g.get("no") or 0)
    print(f"연예 고르기: 후보 {len(cands)}건 → {no} ({g.get('why', '')})")
    return cands[no - 1] if 1 <= no <= len(cands) else None


def photo_credit(caption: str) -> str:
    """XML 사진 설명 끝의 출처("… 삼성전자", "… 청와대사진기자단", "… 조태형 기자", "사진 제공=…")."""
    caption = (caption or "").strip()
    m = re.search(r"사진\s*(?:제공)?\s*=\s*([^\s,.]+)", caption)   # "사진=…", "사진 제공=…", "사진제공=…"
    if m:
        return "사진=" + m.group(1)
    m = re.search(r"[.。]\s*([^.。]{2,15})$", caption)       # 마지막 문장이 짧으면 출처로 본다
    return "사진=" + m.group(1).strip() if m else ""


HANJA = {"李": "이", "尹": "윤", "文": "문", "朴": "박", "金": "김", "韓": "한", "美": "미", "中": "중", "日": "일",
         "北": "북", "靑": "청", "與": "여", "野": "야", "檢": "검", "黃": "황", "英": "영", "獨": "독", "露": "러",
         "故": "고", "前": "전", "現": "현", "新": "신", "對": "대", "佛": "프", "伊": "이", "印": "인"}


def check_quotes(t: str, art: dict) -> str:
    """제목의 따옴표 안 글이 기사(제목·부제·본문)에 그대로 없으면 따옴표를 뗀다 — 지어낸 말을 발언처럼 보이게 하지 않도록.
    띄어쓰기·문장부호는 무시하고 비교한다."""
    norm = lambda s: re.sub(r"[\s\"'“”‘’.,…·!?~]", "", s)  # noqa: E731
    # 같은 문장 안에 따옴표 속 단어가 모두 있으면 통과(조사를 뺀 정도의 줄임은 허용)
    sents = [norm(s) for s in re.split(r"[.!?\n…]", " ".join((art["title"], art["sub_title"], art["content"])))]
    for q in re.findall(r"[\"“'‘]([^\"”'’]+)[\"”'’]", t):
        words = [norm(w) for w in q.split() if norm(w)]
        ok = any(all(w in s or (len(w) > 2 and w[:-1] in s) for w in words) for s in sents)
        if words and not ok:
            print(f"따옴표 안 글이 기사에 없음 → 따옴표 뗌: {q}")
            t = re.sub(r"[\"“'‘]" + re.escape(q) + r"[\"”'’]", q, t)
    return t


def no_hanja(t: str) -> str:
    """제목 글꼴(Pretendard)에 한자가 없어 네모로 깨진다 → 신문에 자주 쓰는 한자는 한글로, 나머지가 남으면 실패."""
    t = "".join(HANJA.get(c, c) for c in t)
    if re.search(r"[一-鿿㐀-䶿豈-﫿]", t):
        raise RuntimeError(f"제목에 한자가 남음: {t}")
    return t


# ── 숫자 대조·투자 권유 검사(11/27) ─────────────────────────────────
# AI가 지시를 어기고 기사에 없는 숫자(예: 700조·2000조 → "3배")를 만들어 낸 적이 있어, 프롬프트만 믿지 않고 코드로 대조한다.

class CopyCheckError(RuntimeError):
    """AI 글이 숫자·표현 검사를 두 번 다 통과하지 못함 → 그 기사는 실패 처리(다음 칸은 다음 기사)."""


_BIG = {"조": 10**12, "억": 10**8, "만": 10**4, "천": 10**3}
_NUM_RE = re.compile(
    r"(약\s*)?"
    r"((?:\d+(?:\.\d+)?\s*(?:조|억|만|천)\s*)*\d+(?:\.\d+)?(?:\s*(?:조|억|만|천))?)"
    r"\s*(%\s*p|%\s*P|%\s*포인트|퍼센트\s*포인트|%|퍼센트|포인트|배|년|월|일|분기|차|호|위|시|세|회|번째|주년|기|대|명|건|가구|원|달러|위안|엔|유로|개|곳|종|단|층|주|㎡|GWh|MWh|GW|MW|kWh|톤)?")
_STRICT = {"pct", "pp", "times"}                     # 이 단위는 기사에도 같은 단위로 있어야 함
_LENIENT = {"년", "월", "일", "분기", "차", "호", "위", "시", "세", "회", "번째", "주년", "기"}  # 날짜·서수: 숫자만 있으면 통과


def _norm_num_text(s: str) -> str:
    s = unicodedata.normalize("NFKC", s or "")
    return re.sub(r"(?<=\d),(?=\d{3})", "", s)     # 3,000 → 3000


def _unit_class(u: str) -> str:
    u = (u or "").replace(" ", "")
    if u in ("%p", "%P", "%포인트", "퍼센트포인트"):
        return "pp"
    if u in ("%", "퍼센트"):
        return "pct"
    if u == "배":
        return "times"
    if u in _LENIENT:
        return "lenient"
    return "other"


def _num_value(body: str) -> tuple[float, float]:
    """'72만6454' → (726454, 1), '3000억' → (3e11, 1e8), '1.2조' → (1.2e12, 1e11). (값, 마지막 자리 크기)"""
    body = body.replace(" ", "")
    total, prec = 0.0, 1.0
    for num, big in re.findall(r"(\d+(?:\.\d+)?)(조|억|만|천)?", body):
        mult = _BIG.get(big, 1)
        total += float(num) * mult
        dec = len(num.split(".")[1]) if "." in num else 0
        prec = mult / (10 ** dec)
    return total, prec


def extract_numbers(text: str) -> list[dict]:
    out = []
    for m in _NUM_RE.finditer(_norm_num_text(text)):
        approx, body, unit = m.group(1), m.group(2), m.group(3) or ""
        v, prec = _num_value(body)
        out.append({"raw": m.group(0).strip(), "value": v, "prec": prec, "cls": _unit_class(unit),
                    "approx": bool(approx), "digits": re.findall(r"\d+(?:\.\d+)?", body)})
    return out


def missing_numbers(text: str, source: str) -> list[str]:
    """text(AI 글)의 숫자 중 source(기사)에 근거가 없는 것. 쉼표·띄어쓰기·전각 차이는 무시.
    %·%p·배는 기사에도 같은 단위여야 하고, 날짜·서수(년·월·일·분기·차·호·위 등)는 숫자만 있으면 통과.
    "약"이 붙으면 기사 숫자를 같은 자리에서 내림·반올림한 값까지 인정(약 72만 ← 72만6454), "약" 없이 반올림하면 불일치."""
    src = extract_numbers(source)
    src_digits = {d for s in src for d in s["digits"]}
    bad = []
    for n in extract_numbers(text):
        if n["cls"] == "lenient":
            if not all(d in src_digits for d in n["digits"]):
                bad.append(n["raw"])
            continue
        if n["cls"] in _STRICT:
            pool = [s for s in src if s["cls"] == n["cls"]]
        else:
            pool = [s for s in src if s["cls"] != "times"]
        ok = any(abs(s["value"] - n["value"]) <= 1e-9 * max(1.0, abs(s["value"])) for s in pool)
        if not ok and n["approx"]:
            p = n["prec"]
            ok = any(abs(math.floor(s["value"] / p) * p - n["value"]) < p * 1e-6
                     or abs(round(s["value"] / p) * p - n["value"]) < p * 1e-6 for s in pool)
        if not ok:
            bad.append(n["raw"])
    return bad


ADVICE_RE = re.compile(
    r"(매수|매도|투자)\s*(기회|추천|타이밍|적기|하세요|해야|할\s*때)|지금\s*(사|팔|담|매수|매도)|사야\s*(할|한다|해|합니다)|팔아야|"
    r"급등\s*(예상|임박)|추천\s*(종목|주)|기회(를\s*잡|입니다|예요|일까|로\s*삼)|수익\s*보장|대박|놓치지\s*마|담아야")
COJUBOO_DISCLAIMER = "※ 본 게시물은 투자 권유가 아닙니다."


def copy_problems(g: dict, art: dict, kind: str) -> list[str]:
    """AI 결과(제목 2줄·캡션 본문)의 숫자·표현 문제. 캡션 본문 = 출처·원문·해시태그를 붙이기 전 g['caption']."""
    text = "\n".join((g.get("title1", ""), g.get("title2", ""), g.get("caption", "")))
    source = "\n".join((art.get("title", ""), art.get("sub_title", ""), art.get("content", ""), art.get("photo_caption", "")))
    probs = [f"기사에 없는 숫자: {x}" for x in missing_numbers(text, source)]
    if kind == "cojuboo":
        probs += [f"투자 권유 표현: {m.group(0)}" for m in ADVICE_RE.finditer(text)]
    return probs


# ── 2. 글(AI) ───────────────────────────────────────────────────────

PROMPT = """아래는 서울경제신문 지면 1면 기사와, 게시물에 쓸 기사 사진(첨부)·사진 설명이다.
서울경제 공식 인스타그램에 올릴 '사진 1장 + 본문형 캡션' 게시물을 만들어라.

[이미지 제목] 사진 아래 크게 들어가는 2줄. 각 줄 공백 포함 14자 이내. 신문 기사 제목처럼 담백한 뉴스 제목체.
- 1줄은 주체·상황, 2줄은 핵심 내용·숫자. 발언이 핵심이면 짧은 따옴표 인용("...") 가능.
- 예시 톤: "민주당, 조희대 탄핵 / 12월 안에 의결 목표", "블랙먼데이 공포에 / 증안펀드 가동 착수", "이 대통령 울산 방문 / \\"내년엔 더 좋아질 것\\""
- 이미지 제목은 [기사 제목]·[부제]의 핵심을 짧게 다듬은 것이어야 한다. 제목·부제에 없는 본문 소재를 주제로 삼지 말 것.
- 따옴표 안에는 기사에 나온 발언을 그대로 쓴다. 줄일 수는 있어도 단어를 바꿔 쓰지 말 것. 그대로 넣기 길면 따옴표 없이 풀어 쓴다.
- 한자 쓰지 말 것(글꼴에 없음). 李→이 대통령, 靑→청와대, 美→미국, 中→중국처럼 한글로.
- 금지: ㄷㄷ·ㅋㅋ 같은 인터넷 말투, 감탄사, 궁금증만 부추기는 물음표, 과장된 표현, 이모지.
- 사실을 과장·왜곡하지 말 것. 줄이다가 뜻이 바뀌면 안 된다(예: '첫 여성'을 '65년 만의 여성'으로 줄이면 예전에도 있었던 것처럼 읽힌다 → 금지).
- 숫자는 기사에 쓰인 그대로만. 기사 숫자로 배수·비율·합계를 직접 계산해 새 숫자를 만들지 말 것(예: 영업익 700조·시총 2000조 → "3배" 금지).
- 숫자에는 단위를 붙인다(예: "3000억"이 아니라 "3000억 원", "73만"이 아니라 "73만 명"). %%와 %%p(퍼센트포인트)를 기사 표기대로 구분한다.
- 숫자를 반올림·줄이면 반드시 "약"을 붙인다(예: 72만6454명 → "약 72만 명"). "약" 없이 반올림 금지.
- 전망·목표·계획·추정을 확정된 일처럼 쓰지 말 것(예: "~할 전망"을 "~했다"로, "목표 50만 가구"를 "50만 가구 공급"으로 바꾸기 금지).
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
해시태그는 쓰지 말고 hashtags 배열로 따로 5~7개 (#없이). 기사 내용에 맞는 단어로.

반드시 JSON 한 개만 출력: {"title1": "...", "title2": "...", "focus_x": 0.5, "caption": "...", "hashtags": ["..."]}

[사진 설명] %s
[기사 제목] %s
[부제] %s
[본문]
%s
"""


PROMPT_LABEL = {"front": "서울경제신문 지면 1면 기사", "ent": "서울경제 연예·영화 기사",
                "cojuboo": "서울경제신문 지면 증권·부동산·코인 기사"}
COJUBOO_RULE = """
[코주부 추가 규칙] 코인·주식·부동산 정보 계정이다. 투자 권유로 읽힐 표현 금지: 매수·매도 권유, "지금 사야", "급등 예상", "추천 종목", "투자 기회" 같은 말.
기사 사실만 전하고, 특정 종목을 사라·팔라는 뉘앙스를 피한다.
"""


def write_copy(art: dict, photo: Image.Image, kind: str = "front", note: str = "") -> dict:
    """AI가 가끔 항목을 빠뜨리고 답해서 한 번 더 묻는다. note = 다시 쓰게 할 때 붙이는 지적."""
    try:
        return _write_copy(art, photo, kind, note)
    except (RuntimeError, ValueError) as e:
        print(f"AI 응답 문제 → 한 번 더: {e}")
        return _write_copy(art, photo, kind, note)


def _write_copy(art: dict, photo: Image.Image, kind: str, note: str = "") -> dict:
    # 11/27 고침: 전엔 front가 아니면 모두 '연예·영화 기사'로 바뀌어 코주부도 연예 기사라고 소개됐다
    base = PROMPT.replace("서울경제신문 지면 1면 기사", PROMPT_LABEL.get(kind, PROMPT_LABEL["front"]))
    prompt = base % (art["photo_caption"] or "(없음)", art["title"], art["sub_title"] or "(없음)", art["content"][:6000])
    if kind == "cojuboo":
        prompt += COJUBOO_RULE
    if note:
        prompt += "\n[다시 쓰기] 이전 답에 문제가 있었다. 아래를 고쳐서 처음부터 다시 써라.\n" + note + \
                  "\n숫자는 기사 본문에 있는 그대로(단위 포함)만 쓰고, 기사에서 찾을 수 없는 숫자는 빼라.\n"
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
    size = 104
    while size > 60 and max(d.textlength(t, font=ImageFont.truetype(str(FONT), size)) for t in (t1, t2)) > SAFE_W:
        size -= 2
    f = ImageFont.truetype(str(FONT), size)
    y2 = H - 131 - size                        # 로고가 커져(11/26) 제목을 조금 올림
    y1 = y2 - size - int(size * 0.24)
    for txt, yy, col in ((t1, y1, "white"), (t2, y2, BLUE)):
        d.text((W // 2, yy), txt, font=f, fill=col, anchor="mt", stroke_width=2, stroke_fill=(0, 0, 0))
    # 제목 위 날짜는 넣지 않는다(11/26 결정 — LENS 카드와 다름)
    logo = Image.open(LOGO).convert("RGBA")
    logo = logo.resize((round(logo.width * LOGO_H / logo.height), LOGO_H), Image.LANCZOS)
    im.paste(logo, ((W - logo.width) // 2, H - 46 - LOGO_H), logo)    # 아래 가운데(기존 서울경제 게시물과 같은 자리)
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


def publish_single(jpeg: bytes, key: str, caption: str, token: str, ig_user_id: str = IG_USER_ID) -> str:
    s3.put_object(Bucket=S3_BUCKET, Key=key, Body=jpeg, ContentType="image/jpeg")
    url = f"https://{S3_BUCKET}.s3.us-east-1.amazonaws.com/{urllib.parse.quote(key)}"
    c = http_json(f"{GRAPH}/{ig_user_id}/media", {"image_url": url, "caption": caption, "access_token": token})
    wait_ready(c["id"], token)
    media = http_json(f"{GRAPH}/{ig_user_id}/media_publish", {"creation_id": c["id"], "access_token": token})
    return http_json(f"{GRAPH}/{media['id']}?fields=permalink&access_token={token}").get("permalink", media["id"])


# ── 진입점 ───────────────────────────────────────────────────────────

def build_post(art: dict, date: str, kind: str = "front") -> tuple[bytes, str, dict]:
    """기사 1건 → (JPEG, 캡션, AI 결과)."""
    photo = Image.open(io.BytesIO(http_bytes(art["photo_url"]))).convert("RGB")
    g = write_copy(art, photo, kind)
    probs = copy_problems(g, art, kind)                  # 숫자 대조(+코주부 투자 권유) — 걸리면 지적을 붙여 1회 다시 쓰기
    if probs:
        print(f"글 검사 걸림 → 다시 쓰기: {probs}")
        g = write_copy(art, photo, kind, note="\n".join("- " + p for p in probs))
        probs = copy_problems(g, art, kind)
        if probs:
            print(f"글 검사 다시 걸림 → 이 기사 실패: {probs}")
            raise CopyCheckError("; ".join(probs))
    g["title1"], g["title2"] = no_hanja(g["title1"].strip()), no_hanja(g["title2"].strip())
    g["title1"], g["title2"] = check_quotes(g["title1"], art), check_quotes(g["title2"], art)
    # 따옴표가 두 줄에 걸친 경우("…시총 / 영업익…")도 이어서 검사(11/27)
    g["title1"], g["title2"] = (check_quotes(g["title1"] + "\n" + g["title2"], art).split("\n", 1) + [""])[:2]
    fx =min(1.0, max(0.0, float(g.get("focus_x", 0.5))))
    buf = io.BytesIO()
    make_image(photo, g["title1"].strip(), g["title2"].strip(), fx, date).save(buf, "JPEG", quality=92)
    credit = photo_credit(art["photo_caption"])
    caption = (g["caption"].strip() + "\n\n" + (credit + "\n" if credit else "") + "원문: 서울경제신문\n"
               + (COJUBOO_DISCLAIMER + "\n" if kind == "cojuboo" else "") + "\n"
               + " ".join("#" + h.lstrip("#").replace(" ", "") for h in g.get("hashtags", [])))[:2200]
    g["focus_x"] = fx
    return buf.getvalue(), caption, g


LAST_JPEG: bytes | None = None
FRONT_HOURS = {6, 7, 8, 12, 14}             # 1면 — EventBridge 입력 {"kind": "front"}가 없을 때 시각으로 판단
ENT_HOURS = {10, 16, 19, 21}                # 연예
# 코주부(09·11·13·15·17시)는 EventBridge 입력 {"kind": "cojuboo"}로만 부른다(시각 판단 없음).
COJUBOO_IG_ID = os.environ.get("COJUBOO_IG_ID", "17841446436396009")   # @co.ju.boo — 같은 시스템 사용자 토큰
MAX_COJUBOO_PER_DAY = int(os.environ.get("MAX_COJUBOO_PER_DAY", "5"))
COJUBOO_START = os.environ.get("COJUBOO_START", "2026-11-30")         # 이 날짜 전엔 게시 안 함(11/27 결정: 다음 주 월요일 시작). 평일만은 EventBridge cron(MON-FRI)이 맡는다.


def lambda_handler(event, context):
    event = event or {}
    now = datetime.fromisoformat(event["now"]).replace(tzinfo=KST) if event.get("now") else datetime.now(KST)  # now는 시험용
    date = event.get("date") or now.strftime("%Y-%m-%d")
    kind = event.get("kind") or ("ent" if now.hour in ENT_HOURS else "front")
    dry_run = bool(event.get("dry_run"))
    if kind == "cojuboo" and date < COJUBOO_START and not dry_run:
        print(f"코주부는 {COJUBOO_START}부터 — {date} 건너뜀")
        return {"date": date, "kind": kind, "skipped": "before start"}
    limit = {"front": MAX_PER_DAY, "ent": MAX_ENT_PER_DAY, "cojuboo": MAX_COJUBOO_PER_DAY}[kind]
    key = {"front": date, "ent": f"{date}_ent", "cojuboo": f"{date}_cojuboo"}[kind]   # 기록 키
    ig_user_id = COJUBOO_IG_ID if kind == "cojuboo" else IG_USER_ID

    state = load_state()
    done = state.get(key, [])
    if len(done) >= limit and not dry_run:
        print(f"{key} 이미 {len(done)}건 게시 — 오늘 몫 끝")
        return {"date": date, "kind": kind, "skipped": "daily limit"}

    failed = state.get(f"{key}_failed", [])
    # 계정별로 중복을 본다 — 서울경제(1면·연예)와 코주부는 같은 기사가 나가도 된다(11/27 결정)
    same_account = (lambda k: "_cojuboo" in k) if kind == "cojuboo" else (lambda k: "_cojuboo" not in k)
    posted_ids = {d["id"] for k, v in state.items() if not k.endswith("_failed") and same_account(k) for d in v}
    skip_ids = posted_ids | set(failed)                       # 실패한 기사는 다음 시간대에 건너뜀
    if kind == "front":
        todo = [a for a in front_page(date) if a["id"] not in skip_ids]
        art = todo[0] if todo else None
    elif kind == "cojuboo":
        art = pick_cojuboo([a for a in cojuboo_candidates(date) if a["id"] not in skip_ids],
                           [d.get("group", "") for d in done])
    else:
        recent_days = {(now - timedelta(days=i)).strftime("%Y-%m-%d") for i in range(3)}
        rows = sorted((k[:10], d.get("at", ""), d.get("title", "")) for k, v in state.items()
                      if k[:10] in recent_days and k.endswith("_ent") for d in v)
        recent = [r[2] for r in rows]                         # 최근 3일 연예 게시, 시간 순(마지막 = 바로 전 게시물)
        art = pick_ent([a for a in ent_candidates(now) if a["id"] not in skip_ids], recent, popular_keys())
    if not art:
        print(f"{key} 올릴 기사 없음 (게시 {len(done)}건)")      # 1면 4건뿐인 날의 14시·일요일·휴간일, 연예 후보 없음
        return {"date": date, "kind": kind, "skipped": "no article"}

    try:
        jpeg, caption, g = build_post(art, date, kind)
        print(f"[{kind}] [{art['title']}] 제목: {g['title1']} / {g['title2']} focus_x={g['focus_x']}\n{caption}")
        if dry_run:
            global LAST_JPEG
            LAST_JPEG = jpeg                                  # 로컬 시험용(Lambda 응답엔 바이트를 넣지 않음)
            return {"date": date, "kind": kind, "dry_run": True, "article": art["title"], "group": art.get("group"),
                    "id": art["id"], "title": [g["title1"], g["title2"]], "caption": caption}
        sub = f"cojuboo/{date}" if kind == "cojuboo" else date
        link = publish_single(jpeg, f"{S3_PREFIX}/{sub}/{art['id']}.jpg", caption, get_token(), ig_user_id)
        row = {"id": art["id"], "title": art["title"], "link": link, "at": now.strftime("%H:%M")}
        if kind == "cojuboo":
            row["group"] = art.get("group", "")
        done.append(row)
        state[key] = done
        save_state(state)
        print(f"게시 완료 {key} ({len(done)}/{limit}) {link}")
        return {"date": date, "kind": kind, "link": link}
    except Exception as e:  # noqa: BLE001
        if not dry_run:
            state[f"{key}_failed"] = failed + [art["id"]]
            save_state(state)
        print(f"게시 실패 {key} {art['title']}: {type(e).__name__}: {e}")
        raise
