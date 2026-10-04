"""
뉴스 웹툰 파이프라인 — 텍스트 합성(말풍선/캡션/내레이션)
=====================================
2026-08-23 — OpenAI 크레딧 소진으로 3단계 이미지 생성이 막힌 김에, Bedrock
이미지 모델(Nova Canvas, Stable Image Core, SD3.5 Large 전부 테스트함)로
전환을 검토했는데, 셋 다 확산 모델 계열이라 프롬프트로 요청한 한글 텍스트를
그림 안에 정확히 못 그린다(실측: "가계대출 규제 강화"를 요청했더니 의미
없는 한글 비슷한 글자만 나옴 — Nova Canvas·SD3.5 둘 다 동일 증상). GPT의
image_generation 툴은 이걸 잘 하길래 웹툰에 써왔던 것.

그래서 구조를 바꿨다 — Bedrock 이미지 모델에는 "텍스트 없는 배경 그림"만
맡기고(스타일·장면 지침만 프롬프트에 넣고 말풍선/캡션/내레이션 지침은 아예
안 줌), 말풍선/캡션/내레이션은 이 파일이 PIL로 직접 그려서 배경 위에
합성한다. 이러면 텍스트가 100% 정확하다는 게 보장된다(모델이 그림 vs 코드가
그림의 차이). 대신 GPT가 하던 "말풍선 꼬리가 정확히 화자 입을 가리키는"
정교한 배치는 못 한다 — 1·2단계 JSON에 화자 위치(x/y) 데이터가 없어서
(원래 이미지 모델이 그림을 보면서 알아서 배치했음), 여기서는 화자 순서대로
상단에 좌→우로 펼쳐 놓는 단순한 레이아웃으로 타협했다. GPT 경로로 되돌리면
이 타협 없이 원래 방식 그대로 쓸 수 있다(pipeline.py의 IMAGE_PROVIDER 참고).
"""
import math
import re
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

FONT_PATH = Path(__file__).parent / "assets" / "NotoSansKR-Bold.ttf"

_BUBBLE_FILL = (255, 255, 255)
_BUBBLE_OUTLINE = (20, 20, 20)
_TEXT_FILL = (15, 15, 15)
_OUTLINE_WIDTH = 4
_PADDING = 22
_LINE_SPACING = 10
_MAX_BUBBLE_WIDTH_RATIO = 0.42  # 이미지 너비의 42%를 넘기지 않고 줄바꿈

# 2026-09-08 — 상단 제목/컷8 마무리 자막용 짙은 남색. STYLE(webtoon_image.py)의
# "navy blue, sky blue, red" 강조색 팔레트와 맞춘다.
_NAVY_FILL = (26, 41, 74)
_NAVY_TEXT_FILL = (255, 255, 255)
# 2026-09-08(2차) — 참고 이미지(사용자가 카카오톡으로 공유한 "기존 톤앤매너"
# 샘플, 육하원칙 프롬프트 문서 §13 색상표와 동일) 대조 후 추가 — 컷별 제목
# 색상이 짙은 빨강/짙은 남색을 번갈아 쓴다.
_RED_FILL = (178, 34, 42)
_RED_TEXT_FILL = (255, 255, 255)
_HEADLINE_FILL = (255, 255, 255)
_HEADLINE_TEXT_FILL = (20, 20, 20)

# 컷 번호 → 제목 알약 색상. §13 디자인 규격 표 그대로(1은 별도 표지 처리라
# 여기 없음). 정의 안 된 컷 번호는 빨강으로 폴백.
_TITLE_COLOR_BY_CUT = {2: _RED_FILL, 3: _RED_FILL, 4: _NAVY_FILL, 5: _RED_FILL, 6: _NAVY_FILL, 7: _RED_FILL, 8: _RED_FILL}


def title_fill_for_cut(cut_number: int | None) -> tuple[int, int, int]:
    """컷 번호별 제목 알약 색상(§13 표). compose()가 draw_title() 호출 시 쓴다."""
    if cut_number is None:
        return _RED_FILL
    return _TITLE_COLOR_BY_CUT.get(cut_number, _RED_FILL)


# 고해상도 합성(2026-10-01) — 배경 그림은 모델 출력(1216x832)이 한계라 레티나 화면(약 1840px 필요)에서 흐려 보인다.
# 그림은 Lanczos로 키우되, 눈에 가장 거슬리는 글자·말풍선은 키운 캔버스 위에서 처음부터 큰 글자로 다시 그려 선명하게 한다.
# 이 파일의 모든 레이아웃 수치(px)는 1216 기준이라 한 배율(_SCALE)로 함께 키운다 — 배율 1.0이면 예전 출력과 완전히 같다.
_SCALE = 1.0
OUTPUT_SCALE = 1.5  # run_article이 쓰는 기본 배율(1216 -> 1824px)


def _k(v: float) -> float:
    """1216px 기준 길이(px)를 현재 배율로."""
    return v * _SCALE


def _w(v: int) -> int:
    """선 굵기(px) — 최소 1."""
    return max(1, int(round(v * _SCALE)))


def _font(size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONT_PATH), int(round(size * _SCALE)))


def _font_regular(size: int):
    """보통 굵기(약 420) 글꼴 — 네이버 웹툰식 대사. 가변 글꼴을 못 읽으면 기본(굵은) 글꼴로 되돌아간다."""
    try:
        f = ImageFont.truetype(str(_REGULAR_FONT_PATH), int(round(size * _SCALE)))
        f.set_variation_by_axes([430])
        return f
    except Exception:  # noqa: BLE001
        return _font(size)


def _oval_dims(block_w: float, block_h: float) -> tuple[float, float]:
    """글자 덩어리를 감싸는 타원의 가로·세로 전체 크기 — 직사각형 모서리가 타원 밖으로 안 나오는 비율."""
    return block_w * 1.36 + _k(26), block_h * 1.56 + _k(20)


_ACCENT_ON_DARK = (126, 176, 255)  # 검은 띠 위 숫자 강조색(CI 파랑을 어두운 바탕에 맞게 밝힌 값)
_ACCENT_ON_LIGHT = (59, 111, 224)  # 밝은 바탕 숫자 강조색(#3b6fe0)
_NUM_RE = re.compile(r"\d[\d,\.]*\s?(?:%|퍼센트|조|억|만|천|개사|개|곳|명|원|달러|배|건|년|월|일|사|위|분기|포인트|bp)?")


def _font_w(size: int, weight: int):
    """가변 글꼴(Pretendard)의 굵기를 지정해 쓴다. 못 읽으면 기본(굵은) 글꼴."""
    try:
        f = ImageFont.truetype(str(_REGULAR_FONT_PATH), int(round(size * _SCALE)))
        f.set_variation_by_axes([weight])
        return f
    except Exception:  # noqa: BLE001
        return _font(size)


def _draw_line_highlight(draw, cx, y, line, font, fill, accent):
    """한 줄을 가운데 정렬로 그리되, 핵심 숫자(예: 184개사, 26.82달러)만 강조색으로."""
    segs, pos = [], 0
    for m in _NUM_RE.finditer(line):
        if m.start() > pos:
            segs.append((line[pos:m.start()], False))
        segs.append((m.group(0), True))
        pos = m.end()
    if pos < len(line):
        segs.append((line[pos:], False))
    total = sum(draw.textlength(t, font=font) for t, _ in segs)
    x = cx - total / 2
    for t, is_num in segs:
        draw.text((x, y), t, font=font, fill=accent if is_num else fill)
        x += draw.textlength(t, font=font)


def make_summary_card(out_path, headline: str, items: list[dict], scale: float = 1.0, width: int = 1216, height: int = 760) -> bool:
    """마지막 \"핵심 정리\" 카드 — 수치 중심 3줄. 이미지 모델을 쓰지 않고 코드로 그린다(비용 0).
    items = [{"value": "184개사", "label": "연결 기준 상장사"}, ...] (2~3개)."""
    global _SCALE
    prev = _SCALE
    _SCALE = scale
    try:
        items = [it for it in (items or []) if isinstance(it, dict) and str(it.get("value", "")).strip() and str(it.get("label", "")).strip()][:3]
        if len(items) < 2:
            return False
        W, H = int(round(width * scale)), int(round(height * scale))
        img = Image.new("RGB", (W, H), (255, 255, 255))
        d = ImageDraw.Draw(img)
        # 상단 알약 + 제목
        pill_f = _font_w(26, 700)
        label = "핵심 정리"
        tw = d.textlength(label, font=pill_f)
        px0, py0 = _k(70), _k(60)
        d.rounded_rectangle([px0, py0, px0 + tw + _k(36), py0 + _k(48)], radius=_k(24), fill=_ACCENT_ON_LIGHT)
        d.text((px0 + _k(18), py0 + _k(7)), label, font=pill_f, fill=(255, 255, 255))
        title_f = _font_w(40, 700)
        head = (headline or "").strip().replace("\n", " ")
        for ln in _wrap_text(d, head, title_f, int(W - _k(140)))[:2]:
            pass
        lines = _wrap_text(d, head, title_f, int(W - _k(140)))[:2]
        ty = py0 + _k(78)
        for ln in lines:
            d.text((px0, ty), ln, font=title_f, fill=(25, 25, 25))
            ty += _k(54)
        # 수치 줄
        row_top = ty + _k(26)
        row_h = (H - row_top - _k(90)) / len(items)
        val_f = _font_w(64, 800)
        lab_f = _font_w(34, 400)
        for i, it in enumerate(items):
            y = row_top + i * row_h
            d.line([(px0, y), (W - px0, y)], fill=(225, 229, 238), width=_w(2))
            d.text((px0, y + row_h / 2 - _k(36)), str(it["value"]).strip(), font=val_f, fill=_ACCENT_ON_LIGHT)
            lab = str(it["label"]).strip()
            d.text((px0 + _k(380), y + row_h / 2 - _k(20)), lab, font=lab_f, fill=(55, 55, 55))
        foot_f = _font_w(24, 500)
        d.text((px0, H - _k(62)), "서울경제 AI LENS", font=foot_f, fill=(150, 156, 170))
        img.save(out_path)
        return True
    finally:
        _SCALE = prev


def _wrap_text(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont, max_width: int) -> list[str]:
    """공백 기준으로 줄바꿈. 한글은 공백 없이 길게 이어지는 경우가 많아서,
    한 "단어"(공백으로 나눈 조각)가 그 자체로 max_width를 넘으면 글자 단위로도
    쪼갠다.

    2026-09-20 — 스크립트 단일 호출 전환(정리후보 A/pipeline.py) 이후
    headline 필드가 "韓·佛, 영상산업\n5년·8000억 투자 선언"처럼 줄바꿈을
    포함해서 오는 걸 확인(컷1 표지). PIL의 draw.textlength()는 개행이
    섞인 문자열을 주면 "can't measure length of multiline text"로 바로
    예외를 던져서 컷1 텍스트 합성 전체가 실패했다 — 어차피 이 함수 자체가
    폭에 맞춰 줄바꿈을 다시 계산하는 게 일이라, 호출자가 준 개행은 신뢰하지
    않고 공백으로 합친 뒤 새로 감아준다."""
    text = text.replace("\n", " ")
    words = text.split(" ")
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if draw.textlength(candidate, font=font) <= max_width:
            current = candidate
            continue
        if current:
            lines.append(current)
        if draw.textlength(word, font=font) <= max_width:
            current = word
        else:
            # 단어 자체가 너무 김 — 글자 단위로 쪼갠다
            chunk = ""
            for ch in word:
                if draw.textlength(chunk + ch, font=font) <= max_width:
                    chunk += ch
                else:
                    lines.append(chunk)
                    chunk = ch
            current = chunk
    if current:
        lines.append(current)
    return lines


def _measure_block(draw, lines, font):
    heights = [draw.textbbox((0, 0), ln, font=font)[3] for ln in lines]
    widths = [draw.textlength(ln, font=font) for ln in lines]
    return max(widths) if widths else 0, sum(heights) + _LINE_SPACING * (len(lines) - 1)


_BUBBLE_STYLE = "classic"  # "oval" = 네이버 웹툰식(타원·얇은 선·보통 굵기 글꼴·짧은 꼬리). cut["bubble_style"]로 켠다
_REGULAR_FONT_PATH = Path(__file__).parent / "assets" / "PretendardVariable.ttf"
_MARGIN_RATIO = 0.30  # 말풍선 여백 높이(그림 높이 대비)
_SPECIAL_TONES = ("격앙", "속삭임", "생각")
_TAIL_MAX_RATIO = 0.15  # 꼬리 길이 상한 = 이미지 높이의 15%(QA 요청서 1번)
_TAIL_TARGET_Y_RATIO = 0.50  # 화자 인물 중심 높이(대략 화면 가운데)
_BUBBLE_CHARS_PER_LINE = 12  # 말풍선 한 줄 목표 글자 수(QA 요청서 4번)


def _tail_geometry(x0, y1, x1, tail_x, target, img_h, exact=False, y0=None):
    """꼬리 삼각형 (밑변 한쪽, 밑변 다른쪽, 끝점).
    기본(exact=False): 풍선 아래 변에서 목표 쪽으로, 길이 [26px, 이미지 높이 15%]. 목표가 풍선 아래쪽에 없으면 곧게 내린다.
    exact=True(사람이 찍었거나 얼굴 위치로 계획한 끝점): 풍선 네 변 중 목표에 가장 가까운 변에서 나가 그 점까지 닿는다 —
    목표가 위·옆에 있어도 꼬리가 자연스럽게 그쪽을 향한다."""
    min_len = _k(26)
    half = _k(16)
    if exact and y0 is not None and target is not None:
        tx, ty = target
        # 목표에 가장 가까운 변과 그 변 위의 출발점 — 풍선 바깥으로 더 많이 벗어난 축(가로/세로)을 따라 나간다.
        # (방향이 거의 수평인데 위·아래 변에서 내보내면 밑변과 방향이 나란해져 삼각형이 철사처럼 납작해진다)
        cx = min(max(tx, x0 + _k(30)), x1 - _k(30))
        cy = min(max(ty, y0 + _k(22)), y1 - _k(22))
        out_x = (x0 - tx) if tx < x0 else (tx - x1) if tx > x1 else 0.0
        out_y = (y0 - ty) if ty < y0 else (ty - y1) if ty > y1 else 0.0
        if out_x > 0 and out_x >= out_y:
            if tx < x0:
                a, b, p0 = (x0 + _k(4), cy - half), (x0 + _k(4), cy + half), (x0, cy)
            else:
                a, b, p0 = (x1 - _k(4), cy - half), (x1 - _k(4), cy + half), (x1, cy)
        elif ty < y0:
            a, b, p0 = (cx - half, y0 + _k(4)), (cx + half, y0 + _k(4)), (cx, y0)
        else:
            a, b, p0 = (cx - half, y1 - _k(4)), (cx + half, y1 - _k(4)), (cx, y1)
        dx, dy = tx - p0[0], ty - p0[1]
        dist = max(math.hypot(dx, dy), 1.0)
        length = max(dist, min_len)
        # 꼬리가 길수록 밑변을 넓혀 가느다란 바늘처럼 보이지 않게 한다
        grow = min(max(length - _k(60), 0) * 0.10, _k(14))
        if grow > 0:
            ux, uy = (b[0] - a[0]), (b[1] - a[1])
            nrm = max(math.hypot(ux, uy), 1.0)
            ux, uy = ux / nrm * grow, uy / nrm * grow
            a, b = (a[0] - ux, a[1] - uy), (b[0] + ux, b[1] + uy)
        return [a, b, (p0[0] + dx / dist * length, p0[1] + dy / dist * length)]
    base_y = y1 - _k(4)
    tip_x, tip_y = tail_x, y1 + min_len
    if target is not None and target[1] > y1 + min_len:
        dx, dy = target[0] - tail_x, target[1] - y1
        dist = math.hypot(dx, dy)
        length = max(min(dist, img_h * _TAIL_MAX_RATIO), min_len)
        tip_x = tail_x + dx / dist * length
        tip_y = y1 + dy / dist * length
    return [(tail_x - half, base_y), (tail_x + half, base_y), (tip_x, tip_y)]


def _bubble_lines(draw, text, font, max_width):
    """12자 안팎에서 두 줄로 나눈다. 12자 이하는 한 줄, 24자를 넘거나 폭을 넘으면 폭 기준 줄바꿈으로 폴백."""
    text = " ".join(text.replace("\n", " ").split())
    if len(text) <= _BUBBLE_CHARS_PER_LINE:
        return [text] if draw.textlength(text, font=font) <= max_width else _wrap_text(draw, text, font, max_width)
    if len(text) <= _BUBBLE_CHARS_PER_LINE * 2:
        mid = len(text) / 2
        spaces = [i for i, c in enumerate(text) if c == " "]
        cut = min(spaces, key=lambda i: abs(i - mid)) if spaces else int(mid)
        lines = [text[:cut].strip(), text[cut:].strip()]
        if all(ln and draw.textlength(ln, font=font) <= max_width for ln in lines):
            return lines
    return _wrap_text(draw, text, font, max_width)


def _rounded_bubble_path(draw, x0, y0, x1, y1, tail_x, radius=26, tail_pts=None):
    radius = _k(radius)
    """부드러운 타원형 말풍선(보통 톤) — 둥근 사각형 + 하단 중앙에서 아래로
    뻗는 삼각 꼬리."""
    draw.rounded_rectangle([x0, y0, x1, y1], radius=radius, fill=_BUBBLE_FILL, outline=_BUBBLE_OUTLINE, width=_OUTLINE_WIDTH)
    draw.polygon(
        tail_pts or [(tail_x - _k(16), y1 - _k(4)), (tail_x + _k(16), y1 - _k(4)), (tail_x, y1 + _k(26))],
        fill=_BUBBLE_FILL, outline=_BUBBLE_OUTLINE, width=_OUTLINE_WIDTH,
    )
    # 꼬리와 몸통 이음새의 겹친 외곽선을 지운다
    draw.line([(tail_x - _k(14), y1 - _k(2)), (tail_x + _k(14), y1 - _k(2))], fill=_BUBBLE_FILL, width=_OUTLINE_WIDTH + _w(2))


def _spiky_bubble_path(draw, x0, y0, x1, y1, tail_x, spikes=14, inflate=1.3, tail_pts=None):
    """격앙 톤 — 폭발형(삐죽삐죽) 말풍선.

    2026-09-08 버그 수정: x0..x1/y0..y1은 텍스트를 감싸도록 계산된
    사각형인데, 예전엔 그 사각형에 내접하는 타원으로 폭발 꼭짓점을
    그렸다 — 타원은 사각형 모서리 쪽에서 안으로 파고들기 때문에 텍스트
    가로 폭이 넓은(1~2줄) 말풍선에서 좌우 글자가 삐죽삐죽한 테두리에
    잘리는 게 실제로 확인됐다(격앙 톤 스모크 테스트, "실제로 입주까지
    이어질까요?"). inflate로 반지름을 텍스트 사각형보다 30% 키워서
    타원이 사각형을 완전히 감싸게 한다 — 격앙 말풍선이 보통보다 조금
    크게 보이는 건 오히려 published.md의 "격앙 말풍선은 보통보다 조금
    크게 표현" 규칙과도 맞다."""
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    rx, ry = (x1 - x0) / 2 * inflate, (y1 - y0) / 2 * inflate
    points = []
    for i in range(spikes * 2):
        angle = math.pi * 2 * i / (spikes * 2)
        r_scale = 1.0 if i % 2 == 0 else 0.82
        points.append((cx + math.cos(angle) * rx * r_scale, cy + math.sin(angle) * ry * r_scale))
    draw.polygon(points, fill=_BUBBLE_FILL, outline=_BUBBLE_OUTLINE, width=_OUTLINE_WIDTH)
    draw.polygon(
        tail_pts or [(tail_x - _k(16), y1 - _k(4)), (tail_x + _k(16), y1 - _k(4)), (tail_x, y1 + _k(26))],
        fill=_BUBBLE_FILL, outline=_BUBBLE_OUTLINE, width=_OUTLINE_WIDTH,
    )


def _rr_points(x0, y0, x1, y1, radius, step=18.0, jitter=0.0, seed=0):
    """둥근 사각형 둘레를 일정 간격으로 찍은 점 목록. jitter>0이면 손으로 그은 듯 살짝 흔든다(같은 seed면 같은 모양)."""
    import random

    rng = random.Random(seed)
    r = min(radius, (x1 - x0) / 2, (y1 - y0) / 2)
    pts = []

    def edge(ax, ay, bx, by):
        n = max(1, int(math.hypot(bx - ax, by - ay) / step))
        for i in range(n):
            t = i / n
            pts.append((ax + (bx - ax) * t, ay + (by - ay) * t))

    def arc(cx, cy, a0):
        for i in range(6):
            a = math.radians(a0 + 90 * i / 6)
            pts.append((cx + math.cos(a) * r, cy + math.sin(a) * r))

    edge(x0 + r, y0, x1 - r, y0)
    arc(x1 - r, y0 + r, -90)
    edge(x1, y0 + r, x1, y1 - r)
    arc(x1 - r, y1 - r, 0)
    edge(x1 - r, y1, x0 + r, y1)
    arc(x0 + r, y1 - r, 90)
    edge(x0, y1 - r, x0, y0 + r)
    arc(x0 + r, y0 + r, 180)
    if jitter:
        # 이웃 점끼리 부드럽게 이어지도록 느리게 변하는 값 두 개를 섞는다
        ph1, ph2 = rng.random() * 6.28, rng.random() * 6.28
        pts = [
            (x + math.sin(i * 0.55 + ph1) * jitter + rng.uniform(-0.25, 0.25) * jitter,
             y + math.sin(i * 0.43 + ph2) * jitter + rng.uniform(-0.25, 0.25) * jitter)
            for i, (x, y) in enumerate(pts)
        ]
    return pts


def _dashed_polyline(draw, pts, dash, gap, width, fill, closed=True):
    """닫힌 점 목록을 따라 점선(속삭임 말풍선 테두리)."""
    pts = list(pts) + ([pts[0]] if closed else [])
    on, left = True, dash
    for (ax, ay), (bx, by) in zip(pts, pts[1:]):
        seg = math.hypot(bx - ax, by - ay)
        pos = 0.0
        while pos < seg:
            take = min(left, seg - pos)
            if on:
                t0, t1 = pos / seg, (pos + take) / seg
                draw.line([(ax + (bx - ax) * t0, ay + (by - ay) * t0), (ax + (bx - ax) * t1, ay + (by - ay) * t1)], fill=fill, width=width)
            pos += take
            left -= take
            if left <= 0:
                on = not on
                left = dash if on else gap


def _handdrawn_bubble(draw, x0, y0, x1, y1, tail_pts, seed):
    """보통 톤 — 모서리와 선이 살짝 흔들린 둥근 말풍선. 완벽한 둥근 사각형보다 사람이 그린 느낌."""
    pts = _rr_points(x0, y0, x1, y1, _k(26), step=_k(16), jitter=_k(2.2), seed=seed)
    draw.polygon(tail_pts, fill=_BUBBLE_FILL, outline=_BUBBLE_OUTLINE, width=_OUTLINE_WIDTH)
    draw.polygon(pts, fill=_BUBBLE_FILL)
    draw.line(pts + [pts[0]], fill=_BUBBLE_OUTLINE, width=_OUTLINE_WIDTH, joint="curve")
    # 꼬리와 몸통이 만나는 자리의 겹친 선을 지운다
    (ax, ay), (bx, by), _tip = tail_pts
    # 꼬리 밑변을 풍선 안쪽으로 살짝 밀어 그 자리의 겹친 테두리 선을 흰색으로 지운다(꼬리가 어느 변에서 나가든 같은 방식)
    mx, my = (ax + bx) / 2, (ay + by) / 2
    ccx, ccy = (x0 + x1) / 2, (y0 + y1) / 2
    ln = max(math.hypot(ccx - mx, ccy - my), 1.0)
    ix, iy = (ccx - mx) / ln * _k(3), (ccy - my) / ln * _k(3)
    draw.line([(ax + ix, ay + iy), (bx + ix, by + iy)], fill=_BUBBLE_FILL, width=_OUTLINE_WIDTH + _w(2))


def _whisper_bubble(draw, x0, y0, x1, y1, tail_pts, seed):
    """속삭임 — 점선 테두리, 꼬리도 점선."""
    pts = _rr_points(x0, y0, x1, y1, _k(26), step=_k(6))
    draw.polygon(tail_pts, fill=_BUBBLE_FILL)
    draw.polygon(pts, fill=_BUBBLE_FILL)
    _dashed_polyline(draw, pts, _k(14), _k(9), _w(3), _BUBBLE_OUTLINE)
    (ax, ay), (bx, by), tip = tail_pts
    draw.line([(ax + _k(3), ay), (bx - _k(3), by)], fill=_BUBBLE_FILL, width=_w(6))
    _dashed_polyline(draw, [(ax, ay + _k(2)), tip, (bx, by + _k(2))], _k(10), _k(7), _w(3), _BUBBLE_OUTLINE, closed=False)


def _thought_bubble(draw, x0, y0, x1, y1, tail_pts, seed):
    """생각 — 구름 모양 + 화자 쪽으로 점점 작아지는 동그라미 꼬리."""
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    rx, ry = (x1 - x0) / 2, (y1 - y0) / 2
    n = max(8, int((x1 - x0) / _k(34)) * 2)
    bumps = []
    for i in range(n):
        a = math.pi * 2 * i / n
        bumps.append((cx + math.cos(a) * rx, cy + math.sin(a) * ry))
    br = _k(24)
    for bx, by in bumps:
        draw.ellipse([bx - br, by - br, bx + br, by + br], fill=_BUBBLE_OUTLINE)
    for bx, by in bumps:
        draw.ellipse([bx - br + _w(4), by - br + _w(4), bx + br - _w(4), by + br - _w(4)], fill=_BUBBLE_FILL)
    draw.ellipse([x0, y0, x1, y1], fill=_BUBBLE_FILL)
    (ax, ay), (bx2, by2), tip = tail_pts
    sx, sy = (ax + bx2) / 2, y1 + _k(6)
    for i, r in enumerate((_k(13), _k(9), _k(6))):
        t = (i + 1) / 3.2
        px, py = sx + (tip[0] - sx) * t, sy + (tip[1] - sy) * t
        draw.ellipse([px - r, py - r, px + r, py + r], fill=_BUBBLE_FILL, outline=_BUBBLE_OUTLINE, width=_w(3))


def _draw_text_italic(img, xy, text, font, fill, shear=0.22):
    """글자를 투명 레이어에 그린 뒤 기울여 붙인다(이탤릭 글꼴이 없어서 가짜 기울임)."""
    d = ImageDraw.Draw(img)
    l, t, r, b = d.textbbox((0, 0), text, font=font)
    w, h = int(r - l + abs(shear) * (b - t) + 8), int(b - t + 8)
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(layer).text((4 - l, 4 - t), text, font=font, fill=fill + (255,))
    layer = layer.transform(layer.size, Image.AFFINE, (1, shear, -shear * h / 2, 0, 1, 0), resample=Image.BICUBIC)
    img.paste(layer, (int(xy[0] + l - 4 - shear * (b - t) / 4), int(xy[1] + t - 4)), layer)


def _ellipse_tail(cx, cy, a, b, target, img_h, max_ratio=0.16):
    """타원(반지름 a,b) 테두리에서 목표 쪽으로 나가는 꼬리. (꼬리 다각형, 이음새 선 두 점) 또는 None.
    밑변을 테두리 안쪽에 살짝 걸쳐 두고 이음새를 나중에 흰색으로 덮어, 풍선과 꼬리가 끊겨 보이지 않게 한다."""
    if target is None:
        return None
    dx, dy = target[0] - cx, target[1] - cy
    dist = max(math.hypot(dx, dy), 1.0)
    ux, uy = dx / dist, dy / dist
    r = 1.0 / math.sqrt((ux / a) ** 2 + (uy / b) ** 2)
    if dist <= r + _k(8):
        return None
    px, py = cx + ux * r, cy + uy * r
    length = min(dist - r, img_h * max_ratio)
    tip = (px + ux * length, py + uy * length)
    nx, ny = -uy, ux
    half = _k(9) + min(max(length - _k(40), 0) * 0.08, _k(8))  # 길수록 밑변을 넓혀 바늘처럼 안 보이게
    inset = _k(8)
    base1 = (px - ux * inset + nx * half, py - uy * inset + ny * half)
    base2 = (px - ux * inset - nx * half, py - uy * inset - ny * half)
    seam = ((px - ux * _k(1) + nx * (half - _k(3)), py - uy * _k(1) + ny * (half - _k(3))),
            (px - ux * _k(1) - nx * (half - _k(3)), py - uy * _k(1) - ny * (half - _k(3))))
    return [base1, base2, tip], seam


def _oval_bubble(draw, x0, y0, x1, y1, target, img_w, img_h):
    """네이버 웹툰식 말풍선 — 얇은 검은 선의 흰 타원 + 화자 쪽으로 짧고 뾰족한 꼬리."""
    ow = _w(2)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    tail = _ellipse_tail(cx, cy, (x1 - x0) / 2, (y1 - y0) / 2, target, img_h)
    if tail:
        draw.polygon(tail[0], fill=_BUBBLE_FILL, outline=_BUBBLE_OUTLINE, width=ow)
    draw.ellipse([x0, y0, x1, y1], fill=_BUBBLE_FILL, outline=_BUBBLE_OUTLINE, width=ow)
    if tail:
        draw.line(list(tail[1]), fill=_BUBBLE_FILL, width=ow + _w(2))


def _spiky_with_tail(draw, x0, y0, x1, y1, target, img_h, spikes=14, inflate=1.3):
    """격앙 — 삐죽한 폭발형 풍선. 꼬리는 사각형이 아니라 실제 폭발 테두리(평균 반지름)에서 나가고 이음새를 지운다."""
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    rx, ry = (x1 - x0) / 2 * inflate, (y1 - y0) / 2 * inflate
    tail = _ellipse_tail(cx, cy, rx * 0.88, ry * 0.88, target, img_h)
    if tail:
        draw.polygon(tail[0], fill=_BUBBLE_FILL, outline=_BUBBLE_OUTLINE, width=_w(2))
    pts = []
    for i in range(spikes * 2):
        ang = math.pi * 2 * i / (spikes * 2)
        rs = 1.0 if i % 2 == 0 else 0.82
        pts.append((cx + math.cos(ang) * rx * rs, cy + math.sin(ang) * ry * rs))
    draw.polygon(pts, fill=_BUBBLE_FILL, outline=_BUBBLE_OUTLINE, width=_w(2))
    if tail:
        draw.line(list(tail[1]), fill=_BUBBLE_FILL, width=_w(4))


def _draw_bubble(img: Image.Image, text: str, tone: str, anchor_x: int, top_y: int, font_size: int = 34, target: tuple[float, float] | None = None, exact_tail: bool = False, info: list | None = None):
    """anchor_x를 가로 중심으로 위쪽 top_y부터 말풍선을 그린다. 실제로 그려진
    말풍선의 (다음 요소가 안 겹치게 쓸) 세로 하단 좌표를 돌려준다."""
    draw = ImageDraw.Draw(img)
    oval = _BUBBLE_STYLE == "oval" and tone not in _SPECIAL_TONES
    font = _font_regular(font_size) if oval else _font(font_size)
    max_width = int(img.width * _MAX_BUBBLE_WIDTH_RATIO * (0.78 if oval else 1.0))
    lines = _bubble_lines(draw, text, font, max_width)
    block_w, block_h = _measure_block(draw, lines, font)

    if oval:
        bw, bh = _oval_dims(block_w, block_h)
    else:
        bw = block_w + _PADDING * 2
        bh = block_h + _PADDING * 2
    x0 = max(_k(10), min(img.width - bw - _k(10), anchor_x - bw / 2))
    x1 = x0 + bw
    y0 = top_y
    y1 = y0 + bh
    tail_x = min(max(x0 + _k(30), anchor_x), x1 - _k(30))

    tail_pts = _tail_geometry(x0, y1, x1, tail_x, target, img.height, exact=exact_tail, y0=y0)
    if info is not None:
        tip = tail_pts[2]
        info.append({
            "x": round((x0 + x1) / 2 / img.width, 4), "y": round(y0 / img.height, 4),
            "w": round(bw / img.width, 4), "h": round(bh / img.height, 4),
            "tip_x": round(tip[0] / img.width, 4), "tip_y": round(tip[1] / img.height, 4),
        })
    seed = sum(ord(c) for c in text)
    if oval:
        _oval_bubble(draw, x0, y0, x1, y1, target, img.width, img.height)
    elif tone == "격앙":
        _spiky_with_tail(draw, x0, y0, x1, y1, target, img.height)
    elif tone == "속삭임":
        _whisper_bubble(draw, x0, y0, x1, y1, tail_pts, seed)
    elif tone == "생각":
        _thought_bubble(draw, x0, y0, x1, y1, tail_pts, seed)
    else:
        _handdrawn_bubble(draw, x0, y0, x1, y1, tail_pts, seed)

    ty = y0 + (bh - block_h) / 2 if oval else y0 + _PADDING
    for ln in lines:
        tw = draw.textlength(ln, font=font)
        fill = (95, 95, 95) if tone == "속삭임" else _TEXT_FILL
        if tone == "격앙":
            _draw_text_italic(img, (x0 + (bw - tw) / 2, ty), ln, font, fill)  # 힘주는 대사는 기울임(웹툰 관례)
        else:
            draw.text((x0 + (bw - tw) / 2, ty), ln, font=font, fill=fill)
        ty += draw.textbbox((0, 0), ln, font=font)[3] + _LINE_SPACING

    return y1 + _k(26)  # 꼬리 아래 여백 포함, 다음 말풍선이 겹치지 않을 y


_DEFAULT_BUBBLE_TOP_RATIO = 0.16  # draw_title()의 제목 알약 아래로 자리를 내주는 기본 높이
_FACE_BUBBLE_MARGIN_PX = 150  # 얼굴 상단에서 이만큼 위에 말풍선을 배치(2줄짜리 말풍선이 넉넉히 들어가는 여유)


def _plan_with_people(img, dialogue, detect, min_top_y, max_bottom=0.85):
    """Rekognition이 찾은 사람·얼굴 위치로 말풍선 자리와 꼬리 끝을 정한다.

    - 왼쪽 사람=A, 오른쪽 사람=B(대사의 speaker가 A/B일 때). 화자를 못 맞추면 None(고정 배치로 폴백).
    - 얼굴과 머리 윗부분은 크게 감점, 몸통은 약하게 감점해서 배경의 빈 곳을 고른다.
    - 꼬리 끝은 화자의 머리 꼭대기(얼굴이 잡히면 얼굴 위쪽 가장자리)에 닿게 한다 — 얼굴을 덮지 않는다.
    반환: dialogue와 같은 길이의 [{"pos": {...}, "tail": {...}}] 또는 None."""
    persons = sorted(detect.get("persons") or [], key=lambda b: b["l"] + b["w"] / 2)
    faces = detect.get("faces") or []
    if len(dialogue) != 2 or len(persons) < 1 or {d.get("speaker") for d in dialogue} != {"A", "B"}:
        return None
    def person_of(face):
        fx, fy = face["l"] + face["w"] / 2, face["t"] + face["h"] / 2
        inside = [p for p in persons if p["l"] <= fx <= p["l"] + p["w"] and p["t"] - 0.05 <= fy <= p["t"] + p["h"]]
        return min(inside, key=lambda p: p["w"] * p["h"]) if inside else None

    # 성별로 화자와 인물을 잇는다(A=여성, B=남성) — 위치(왼쪽/오른쪽) 가정보다 정확하다. 성별이 안 잡히면 위치로 폴백.
    fem = [f for f in faces if f.get("gender") == "Female"]
    mal = [f for f in faces if f.get("gender") == "Male"]
    pa = person_of(max(fem, key=lambda f: f["w"] * f["h"])) if fem else None
    pb = person_of(max(mal, key=lambda f: f["w"] * f["h"])) if mal else None
    if pa is not None and pb is not None and pa is not pb:
        left, right = pa, pb  # 아래 heads에서 A/B로 그대로 쓴다(왼쪽/오른쪽 이름만 유지)
    elif len(persons) >= 2:
        left, right = persons[0], persons[-1]
        if pa is not None and pa is not left and pa is right:
            left, right = right, left  # 여성이 오른쪽에 있으면 A=오른쪽 인물
        elif pb is not None and pb is not right and pb is left:
            left, right = right, left
    else:
        # 사람이 한 명만 보이면: 화면 왼쪽 절반에 있으면 A, 오른쪽이면 B로 보고, 나머지 화자(화면 밖)는 꼬리 목표 없이 풍선만 빈 곳에 놓는다
        only = persons[0]
        if only["l"] + only["w"] / 2 < 0.5:
            left, right = only, None
        else:
            left, right = None, only
    W, H = img.width, img.height

    def head_of(p):
        inside = [f for f in faces if p["l"] <= f["l"] + f["w"] / 2 <= p["l"] + p["w"] and p["t"] - 0.05 <= f["t"] + f["h"] / 2 <= p["t"] + p["h"]]
        if inside:
            f = max(inside, key=lambda f: f["w"] * f["h"])
            return {"cx": f["l"] + f["w"] / 2, "top": f["t"], "box": (f["l"], f["t"], f["l"] + f["w"], f["t"] + f["h"])}
        hw = min(p["w"] * 0.5, 0.16)
        cx = p["l"] + p["w"] / 2
        return {"cx": cx, "top": p["t"], "box": (cx - hw / 2, p["t"], cx + hw / 2, p["t"] + min(p["h"] * 0.16, 0.2))}

    heads = {"A": head_of(left) if left else None, "B": head_of(right) if right else None}
    # 금지 영역: (l, t, r, b, 가중치) — 얼굴·머리는 무겁게, 몸통은 가볍게
    zones = []
    for p in (left, right):
        if p is None:
            continue
        zones.append((p["l"], p["t"], p["l"] + p["w"], p["t"] + p["h"], 0.8))
        zones.append((p["l"], p["t"], p["l"] + p["w"], p["t"] + min(p["h"] * 0.22, 0.25), 6.0))
    for f in faces:
        zones.append((f["l"] - f["w"] * 0.1, f["t"] - f["h"] * 0.1, f["l"] + f["w"] * 1.1, f["t"] + f["h"] * 1.1, 10.0))

    draw = ImageDraw.Draw(img)
    font = _font(34)
    sizes = []
    for d in dialogue:
        is_oval = _BUBBLE_STYLE == "oval" and d.get("tone") not in _SPECIAL_TONES
        f_ = _font_regular(34) if is_oval else font
        lines = _bubble_lines(draw, d["line"], f_, int(img.width * _MAX_BUBBLE_WIDTH_RATIO * (0.78 if is_oval else 1.0)))
        bw_, bh_ = _measure_block(draw, lines, f_)
        if is_oval:
            ow_, oh_ = _oval_dims(bw_, bh_)
            sizes.append((ow_ / W, oh_ / H))
        else:
            infl = 1.3 if d.get("tone") == "격앙" else 1.0
            sizes.append(((bw_ + _PADDING * 2) * infl / W, (bh_ + _PADDING * 2) * infl / H))

    top_min = (min_top_y / H + 0.015) if min_top_y is not None else 0.03
    plans: list = [None, None]
    placed: list[tuple[float, float, float, float]] = []

    def overlap(a, b):
        w = min(a[2], b[2]) - max(a[0], b[0])
        h = min(a[3], b[3]) - max(a[1], b[1])
        return max(0.0, w) * max(0.0, h)

    # 읽는 순서: 첫 대사가 더 위에 오게 — 첫 대사부터 놓고, 둘째는 첫째보다 아래만 허용
    first_y = 0.0
    for i, d in enumerate(dialogue):
        bw, bh = sizes[i]
        head = heads[d["speaker"]]
        anchor_x = head["cx"] if head else (0.15 if d["speaker"] == "A" else 0.85)
        best = None
        for dx in (0, -0.08, 0.08, -0.16, 0.16, -0.24, 0.24, -0.32, 0.32, -0.4, 0.4):
            cx = min(1 - bw / 2 - 0.01, max(bw / 2 + 0.01, anchor_x + dx))
            for k in range(0, 28):
                y = top_min + k * 0.03
                if y + bh > max_bottom:
                    break
                rect = (cx - bw / 2, y, cx + bw / 2, y + bh)
                cost = sum(overlap(rect, z[:4]) * z[4] for z in zones) / (bw * bh) * 100
                grown = [(o[0] - 0.02, o[1] - 0.03, o[2] + 0.02, o[3] + 0.03) for o in placed]
                cost += sum(overlap(rect, o) for o in grown) / (bw * bh) * 5000  # 풍선끼리 겹침은 사실상 금지
                cost += abs(dx) * 6 + k * 0.8  # 화자 가까이, 위쪽 선호
                if head:
                    # 꼬리가 짧을수록 좋다 — 풍선 중심에서 머리 상자까지의 거리
                    l_, t_, r_, b_ = head["box"]
                    ddx = max(l_ - cx, 0, cx - r_)
                    ddy = max(t_ - (y + bh / 2), 0, (y + bh / 2) - b_)
                    cost += (ddx ** 2 + ddy ** 2) ** 0.5 * 40
                if i == 1 and y < first_y - 0.005:
                    cost += 60  # 둘째 풍선이 첫째보다 위에 있으면 읽는 순서가 꼬인다(질문이 위, 답이 아래)
                if best is None or cost < best[0]:
                    best = (cost, cx, y)
        if best is None:
            # 제한(max_bottom) 안에 들어갈 자리가 없으면(표지 컷처럼 위쪽을 제목이 차지한 경우) 한도를 풀어서 다시 찾는다
            for k in range(0, 40):
                y = top_min + k * 0.03
                if y + bh > 0.95:
                    break
                rect = (anchor_x - bw / 2, y, anchor_x + bw / 2, y + bh)
                cost = sum(overlap(rect, z[:4]) * z[4] for z in zones) / (bw * bh) * 100 + k * 0.5
                if best is None or cost < best[0]:
                    best = (cost, min(1 - bw / 2 - 0.01, max(bw / 2 + 0.01, anchor_x)), y)
        if best is None:
            return None  # 호출부가 고정 배치로 되돌아간다
        _, cx, y = best
        placed.append((cx - bw / 2, y, cx + bw / 2, y + bh))
        if i == 0:
            first_y = y
        if head is None:
            plans[i] = {"pos": {"x": round(cx, 4), "y": round(y, 4)}}  # 화면 밖 화자 — 꼬리는 기본(아래로)
            continue
        # 꼬리 끝 — 머리(얼굴) 상자에서 풍선과 가장 가까운 변의 바로 바깥. 얼굴 위로 꼬리가 지나가지 않는다.
        l_, t_, r_, b_ = head["box"]
        pad = 0.012
        mx, my = cx, y + bh / 2
        if y + bh <= t_:  # 풍선이 머리 위 → 머리 꼭대기 위쪽 가장자리로
            tx, ty = min(max(mx, l_), r_), t_ - pad
        elif y >= b_:  # 풍선이 머리 아래 → 턱 아래로
            tx, ty = min(max(mx, l_), r_), b_ + pad
        else:  # 옆 → 머리 옆면으로
            tx, ty = (l_ - pad if mx < (l_ + r_) / 2 else r_ + pad), min(max(my, t_), b_)
        plans[i] = {"pos": {"x": round(cx, 4), "y": round(y, 4)}, "tail": {"x": round(tx, 4), "y": round(ty, 4)}}
    return plans


def draw_dialogue(img: Image.Image, dialogue: list[dict], faces: list[dict] | None = None, min_top_y: float | None = None, detect: dict | None = None, max_bottom: float = 0.85):
    """dialogue = [{"speaker":..., "line":..., "tone":"보통"|"격앙"}, ...]

    2026-09-28 — 호출부(webtoon_image.py::generate_cut_image())가
    Rekognition 얼굴 감지를 완전히 제거해서 `faces`는 이제 항상 None이다
    (사용자 결정: "리코그니션 자체를 안 사용하기로 했고 삭제했어요").
    즉 아래 `use_faces` 분기는 사실상 항상 폴백(균등 분할)으로만 동작한다.
    파라미터·로직은 남겨뒀다 — 균등분할 자체가 그 폴백 경로라 별도
    분기 제거가 불필요했다. 아래는 그 기능이 있던 시절의 설계 기록.

    min_top_y — 2026-09-08(3차) 추가. compose()가 draw_title()/
    draw_cover_header()의 실제 반환값(제목 알약 하단 y좌표)을 넘긴다.
    이전엔 "제목 아래 16%"라는 고정 비율로 안전거리를 추측했는데, 제목
    글자 수가 길어 알약이 예상보다 커지는 컷에서 그 추측이 틀려 말풍선이
    제목과 겹치는 게 실측(컷6)으로 확인됐다 — 이제 실제 값을 쓴다.
    None이면(제목이 없는 컷 등) _DEFAULT_BUBBLE_TOP_RATIO로 폴백.

    2026-09-02 — 원래는 화자 위치 데이터가 없어서(1·2단계 JSON에 x/y 없음)
    상단에 좌→우로 순서대로 펼쳐 놓는 게 유일한 방법이었다(기자 피드백 —
    "인물과 연결되지 않은 말풍선이 허공을 가리키는 컷이 있다").

    2026-09-08(얼굴 회피 리팩토링) — pipeline.py가 생성된 배경 이미지를
    rekognition_client.detect_main_faces()로 훑어 얼굴 바운딩 박스(x/y/폭/높이,
    0~1 정규화) 목록을 넘겨준다. 개수가 대사 수와 일치하면 각 얼굴의
    가로 중심에 앵커하고, **세로 위치도 얼굴 상단 바로 위**로 계산한다 —
    예전(2026-09-02~09-07)엔 얼굴의 x좌표만 있고 y좌표·크기 정보가 아예
    없어서(당시 Claude 비전 모델이 x좌표만 추정) 세로는 항상 고정된
    16% 높이였는데, 인물이 클로즈업으로 크게 나오는 컷에서 그 고정
    높이가 얼굴(특히 이마·눈)을 그대로 덮는 문제가 실제로 있었다.
    Rekognition은 바운딩 박스 전체를 주므로 이제 얼굴 상단을 알고 그
    위에 배치할 수 있다.

    개수가 안 맞거나(얼굴 인식 실패, 인물 수 불일치 등) faces가 없으면
    기존의 균등 분할 폴백(고정 16% 높이)으로 돌아간다.

    폴백 순서는 좌→우가 아니라 우→좌다(published.md "첫 번째 말풍선은
    화면 오른쪽 화자" 규칙 — dialogue[0]이 그 컷에서 먼저 말하는=오른쪽
    화자라는 게 스크립트 단계의 계약). rekognition_client.detect_main_faces()도
    이미 오른쪽부터 정렬해서 반환하므로 같은 순서로 dialogue와 zip된다."""
    if not dialogue:
        return
    # 한 컷의 두 대사가 모두 특수 톤(격앙·속삭임·생각)이면 앞 대사만 살리고 뒤는 보통으로 — 프롬프트 규칙을 모델이 어겼을 때의 안전망
    if len(dialogue) == 2 and all(d.get("tone") in _SPECIAL_TONES for d in dialogue):
        dialogue = [dialogue[0], {**dialogue[1], "tone": "보통"}]
    n = len(dialogue)
    default_top_y = int(min_top_y + _k(20)) if min_top_y is not None else int(img.height * _DEFAULT_BUBBLE_TOP_RATIO)
    use_faces = faces is not None and len(faces) == n

    anchors_x: list[int] = []
    tops_y: list[int] = []
    for i in range(n):
        if use_faces:
            f = faces[i]
            anchors_x.append(int(img.width * (f["left"] + f["width"] / 2)))
            face_top_px = int(img.height * f["top"])
            # 얼굴 위 여백을 두되, 화면 밖(음수)으로 넘치거나 제목 알약과
            # 겹치지 않게 default_top_y보다 낮아지지는 않게 한다 — 얼굴이
            # 화면 최상단에 붙어있는 표지형 구도에서 보호막 역할.
            tops_y.append(max(default_top_y, face_top_px - _FACE_BUBBLE_MARGIN_PX))
        else:
            anchors_x.append(int(img.width * (n - 0.5 - i) / n))
            tops_y.append(default_top_y)

    # 화자 기준 배치(QA 요청서 1번) — 두 명이 말하고 화자가 A/B면, 인물 배치 계약(A=왼쪽, B=오른쪽)대로
    # 풍선도 화자 쪽에 둔다. 예전엔 "첫 대사=오른쪽"이라는 순서 규칙만 써서, A가 먼저 말하면 풍선과 꼬리가 엉뚱한 인물을 가리켰다.
    by_speaker = n == 2 and not use_faces and {d.get("speaker") for d in dialogue} == {"A", "B"}
    if by_speaker:
        anchors_x = [int(img.width * (0.25 if d.get("speaker") == "A" else 0.75)) for d in dialogue]

    # 2026-09-08(2차) — 얼굴 회피를 적용한 뒤 실측(테스트_뤼미에르파트너십_v6)
    # 으로 발견한 부수 문제: 두 말풍선이 서로 겹쳐 글자가 가려졌다. 처음엔
    # "앵커 간격이 화면 폭의 50% 미만이면 벌린다"는 고정 비율로 고쳤는데
    # (v6_face 커밋), 컷4를 여러 번 재현 테스트했지만 재현이 안 됐다 —
    # _draw_bubble()의 x0 clamp(`max(10, min(img.width-bw-10, ...))`,
    # 화면 밖으로 안 나가게 하는 안전장치)를 다시 읽고서야 진짜 원인을
    # 찾았다: 대사가 길어 말풍선이 넓어지면, 앵커 간격은 50% 이상으로
    # 충분히 벌려놔도 그 넓은 말풍선이 화면 오른쪽 끝에 걸려 clamp가
    # 안쪽(왼쪽)으로 밀어 넣으면서 결과적으로 두 말풍선이 다시 가까워질
    # 수 있다 — 앵커만 보는 고정 비율 검사로는 이 경우를 못 잡는다.
    #
    # 그래서 실제 텍스트를 미리 측정해 진짜 말풍선 폭(half-width)을 구하고,
    # (1) 그 폭 기준으로 최소 간격을 계산해 앵커를 벌린 뒤 (2) 벌린 쌍
    # 전체가 화면 안에 들어가도록 함께 이동시킨다 — 각자 따로 clamp하면
    # 간격이 도로 좁아지는 문제를 이 순서로 피한다.
    # 꼬리가 가리킬 화자 위치 — 균등분할과 같은 관례(첫 대사=오른쪽 화자). 얼굴이 감지되면 그 얼굴 중심.
    target_y = img.height * _TAIL_TARGET_Y_RATIO
    targets = [(x, target_y) for x in anchors_x]
    if n == 2 and not use_faces:
        if by_speaker:
            targets = [(img.width * (0.30 if d.get("speaker") == "A" else 0.70), target_y) for d in dialogue]
        else:
            targets = [(img.width * 0.70, target_y), (img.width * 0.30, target_y)]

    if n == 2:
        measure_draw = ImageDraw.Draw(img)
        measure_font = _font(34)  # _draw_bubble()의 기본 font_size와 맞춘다
        half_widths = []
        for d in dialogue:
            lines = _bubble_lines(measure_draw, d["line"], measure_font, int(img.width * _MAX_BUBBLE_WIDTH_RATIO))
            block_w, _ = _measure_block(measure_draw, lines, measure_font)
            half_widths.append((block_w + _PADDING * 2) / 2)

        # 오른쪽 풍선(r)/왼쪽 풍선(l) — 대사 순서가 아니라 실제 위치 기준
        r, l = (0, 1) if anchors_x[0] >= anchors_x[1] else (1, 0)
        min_gap = half_widths[0] + half_widths[1] + _k(40)  # 말풍선 사이 여백 40px
        if abs(anchors_x[r] - anchors_x[l]) < min_gap:
            mid = sum(anchors_x) / 2
            anchors_x[r], anchors_x[l] = mid + min_gap / 2, mid - min_gap / 2

        shift = 0.0
        right_edge = anchors_x[r] + half_widths[r]
        if right_edge > img.width - _k(10):
            shift = (img.width - _k(10)) - right_edge
        left_edge = anchors_x[l] - half_widths[l] + shift
        if left_edge < _k(10):
            shift += _k(10) - left_edge
        anchors_x = [int(anchors_x[0] + shift), int(anchors_x[1] + shift)]

    # 사람이 CMS에서 직접 옮긴 위치(비율 0~1)가 있으면 자동 계산값을 덮어쓴다.
    #   pos  = {"x": 말풍선 가로 중심, "y": 말풍선 윗변}
    #   tail = {"x", "y"}: 꼬리 끝이 닿을 점
    exact = [False] * n
    # 사람·얼굴 위치(Rekognition)가 있으면 풍선 자리·꼬리를 거기에 맞춰 자동 계획 — 사람이 직접 옮긴 값(pos/tail)이 우선한다
    try:
        planned = _plan_with_people(img, dialogue, detect, min_top_y, max_bottom) if detect else None
    except Exception as e:  # noqa: BLE001 — 자리 계산이 어떤 이유로든 실패하면 글자 합성 전체를 잃지 말고 고정 배치로
        print(f"[compose_text] 말풍선 자리 계산 실패 — 고정 배치로 진행: {type(e).__name__}: {e}")
        planned = None
    for i, d in enumerate(dialogue):
        pos, tail = d.get("pos"), d.get("tail")
        if planned and not pos and not tail:
            pos, tail = planned[i]["pos"], planned[i].get("tail")
        if isinstance(pos, dict) and "x" in pos and "y" in pos:
            anchors_x[i] = int(float(pos["x"]) * img.width)
            tops_y[i] = int(float(pos["y"]) * img.height)
        if isinstance(tail, dict) and "x" in tail and "y" in tail:
            targets[i] = (float(tail["x"]) * img.width, float(tail["y"]) * img.height)
            exact[i] = True

    layout: list[dict] = []
    for i, d in enumerate(dialogue):
        tone = d.get("tone", "보통")
        _draw_bubble(img, d["line"], tone, anchors_x[i], tops_y[i], target=targets[i], exact_tail=exact[i], info=layout)
    return layout


def _draw_pill(
    img: Image.Image,
    lines: list[str],
    font: ImageFont.FreeTypeFont,
    y0: float,
    fill: tuple[int, int, int],
    text_fill: tuple[int, int, int],
    *,
    pad_w: float,
    pad_h: float,
    max_radius: float | None = None,
    outline: tuple[int, int, int] | None = None,
    outline_width: int = 2,
    keyword: str | None = None,
    keyword_fill: tuple[int, int, int] | None = None,
) -> float:
    """가로 중앙 정렬된 둥근 사각형("알약") 안에 여러 줄 텍스트를 그리는
    공용 루틴 — 2026-09-08(3차, 리팩토링) 신설. draw_title/
    draw_cover_header/draw_closing_caption 세 함수가 전부 "텍스트 측정
    → 알약 그리기 → 줄마다 중앙 정렬"을 각자 반복하고 있던 걸 추출했다.

    keyword가 주어지면 그 부분 문자열만 keyword_fill로 강조한다
    (draw_cover_header의 헤드라인 박스 전용 기능). 반환값은 알약 하단
    y좌표 — draw_cover_header가 그 아래에 헤드라인 박스를 이어 붙일 때
    쓴다."""
    draw = ImageDraw.Draw(img)
    if not lines:
        return y0
    block_w, block_h = _measure_block(draw, lines, font)
    bw = block_w + pad_w
    bh = block_h + pad_h
    x0 = (img.width - bw) / 2
    x1 = x0 + bw
    y1 = y0 + bh
    radius = bh / 2 if max_radius is None else min(bh / 2, max_radius)
    draw.rounded_rectangle([x0, y0, x1, y1], radius=radius, fill=fill, outline=outline, width=_w(outline_width))

    ty = y0 + (bh - block_h) / 2
    for ln in lines:
        tw = draw.textlength(ln, font=font)
        tx = (img.width - tw) / 2
        if keyword and keyword in ln:
            before, _, after = ln.partition(keyword)
            draw.text((tx, ty), before, font=font, fill=text_fill)
            cx = tx + draw.textlength(before, font=font)
            draw.text((cx, ty), keyword, font=font, fill=keyword_fill)
            cx += draw.textlength(keyword, font=font)
            draw.text((cx, ty), after, font=font, fill=text_fill)
        else:
            draw.text((tx, ty), ln, font=font, fill=text_fill)
        ty += draw.textbbox((0, 0), ln, font=font)[3] + _LINE_SPACING
    return y1


def draw_title(img: Image.Image, text: str, fill: tuple[int, int, int] = _NAVY_FILL) -> float:
    """상단 제목 알약형 라벨 — 2026-09-08 신설(육하원칙 기반 웹툰 프롬프트
    문서 검토 후 도입). 기존 draw_caption(좌하단 수치용)·draw_narration
    (하단 다큐 타이틀 카드)과 역할이 다르다 — 모든 컷 상단에 고정 배치돼
    "제목만 순서대로 읽어도 이야기 흐름이 드러나야 한다"(published.md
    "상단 제목" 절)를 담당한다. 한 줄(12자 이내 규칙)을 전제로 폭을
    넉넉히 잡는다 — 넘치면 줄바꿈되지만 자간이 빡빡해질 뿐 잘리지 않는다.

    fill — 2026-09-08(2차, 참고 이미지 대조 후) 컷별 색상 파라미터화.
    compose()가 title_fill_for_cut()으로 계산한 색을 넘긴다(§13 색상표).

    반환값(제목 알약 하단 y좌표) — 2026-09-08(3차) 추가. 예전엔 이 값을
    버리고 draw_dialogue()가 "제목 아래 16% 지점"이라는 고정 비율로
    안전거리를 추측했는데, 제목 글자 수가 길어 알약이 커지는 컷(예:
    "영진위·MPA도 한팀")에서 그 추측이 실제 알약 하단보다 높아 말풍선이
    제목과 겹치는 게 실측(테스트_뤼미에르파트너십_v6, 컷6)으로 확인됐다.
    이제 compose()가 이 실제 값을 받아 draw_dialogue()에 넘긴다."""
    draw = ImageDraw.Draw(img)
    font = _font(30)
    lines = _wrap_text(draw, text, font, int(img.width * 0.6))
    return _draw_pill(img, lines, font, img.height * 0.03, fill, _NAVY_TEXT_FILL, pad_w=_PADDING * 2.4, pad_h=_PADDING * 1.3)


def draw_cover_header(img: Image.Image, brand: str, headline: str, keyword: str | None = None) -> float:
    """컷1 전용 표지 헤더 — 2026-09-08 신설. 사용자가 공유한 참고 샘플과
    육하원칙 프롬프트 문서 §13 "컷1 표지" 규격을 그대로 따른다:
    (1) 화면 최상단에 작은 짙은 남색 알약형 브랜드 라벨("서울경제 웹툰"),
    (2) 그 아래 큼직한 흰색 둥근 헤드라인 박스 — 검은 굵은 글씨, keyword가
    headline 안에서 발견되면 그 부분만 짙은 빨간색으로 강조.

    draw_title()과 별개 함수인 이유: draw_title()은 컷2~8의 작은 단색
    알약(§13 "컷2~8 상단 제목")이고, 이건 컷1 전용 2단 구성이라 레이아웃과
    강조색 처리 로직 자체가 다르다 — compose()가 cut==1일 때만 이걸 부른다.

    반환값(헤드라인 박스 하단 y좌표) — draw_title()과 같은 이유(2026-09-08
    3차, 제목-말풍선 충돌 수정)로 추가."""
    draw = ImageDraw.Draw(img)

    brand_font = _font(24)
    brand_lines = _wrap_text(draw, brand, brand_font, int(img.width * 0.6))
    by1 = _draw_pill(img, brand_lines, brand_font, img.height * 0.025, _NAVY_FILL, _NAVY_TEXT_FILL, pad_w=_k(32), pad_h=_k(17.6))

    headline_font = _font(46)
    headline_lines = _wrap_text(draw, headline, headline_font, int(img.width * 0.7))[:2]
    return _draw_pill(
        img, headline_lines, headline_font, by1 + img.height * 0.02, _HEADLINE_FILL, _HEADLINE_TEXT_FILL,
        pad_w=_PADDING * 3, pad_h=_PADDING * 2.4, max_radius=_k(44), outline=(210, 210, 210),
        keyword=keyword, keyword_fill=_RED_FILL,
    )


def draw_closing_caption(img: Image.Image, text: str) -> int | None:
    """컷8 전용 마무리 자막 — 2026-09-08 신설. 화면 하단 짙은 남색 둥근
    바 + 흰 굵은 글씨. draw_narration(하단 1/3 어두운 스크림 + 다큐
    타이틀)과 시각적으로 겹치므로, 컷8은 narration 대신 이걸 쓴다
    (compose() 참고 — 같은 컷에 둘 다 그리지 않는다). published.md의
    "컷8 마무리 자막" 규칙(25자 이내, 대사·캡션과 중복 금지, 숫자
    지양)을 그대로 따르는 짧은 한 줄을 전제로 폭을 넉넉히 잡지만, 스크립트
    단계가 글자 수를 넘길 수도 있어(2026-09-08 실측 — closing_caption이
    25자를 넘겼는데 draw_closing_caption이 첫 줄만 그리고 나머지를 조용히
    버려서, 하마터면 문장 뒷부분이 통째로 사라질 뻔했다) 최대 2줄까지는
    허용한다 — 잘림보다 두 줄이 낫다.

    아래에서 위로 쌓는 유일한 호출부라(화면 하단 고정) _draw_pill()의
    top-anchored 계약과 안 맞아 block_h를 먼저 재서 y0를 역산한다 — 측정을
    한 번 더 하는 셈이지만(PIL 텍스트 측정은 저렴) 헬퍼를 bottom-anchor
    모드까지 지원하도록 넓히는 것보다 이 편이 간단하다."""
    draw = ImageDraw.Draw(img)
    font = _font(32)
    lines = _wrap_text(draw, text, font, int(img.width * 0.82))[:2]
    if not lines:
        return
    _, block_h = _measure_block(draw, lines, font)
    bh = block_h + _PADDING * 1.6
    y1 = img.height - img.height * 0.05
    y0 = y1 - bh
    _draw_pill(img, lines, font, y0, _NAVY_FILL, _NAVY_TEXT_FILL, pad_w=_PADDING * 2.4, pad_h=_PADDING * 1.6, max_radius=_k(40))
    return int(y0)


# ─────────────────────────────────────────────────────────────
# 아이콘 배지 — 2026-09-09 신설(캡션 박스 옆 픽토그램, 원본 레퍼런스
# 샘플 §셀프피드백 참고). PIL 도형만으로 그린다 — AI 이미지 생성에
# 맡기면 지금까지 이 세션 내내 겪은 "요청 안 한 텍스트/디테일이
# 불안정하게 나오는" 문제가 아이콘에도 그대로 재현될 것이므로, 텍스트와
# 같은 이유로 결정적(deterministic)인 PIL 드로잉을 쓴다.
# ─────────────────────────────────────────────────────────────
_ICON_BADGE_FILL = _NAVY_FILL
_ICON_STROKE = (255, 255, 255)
_ICON_STROKE_W = 5

# 캡션 텍스트에 등장하는 키워드 → 아이콘 이름. 순서가 우선순위(위에서부터
# 먼저 매치되는 걸 씀) — 화폐 단위가 가장 흔하고 구체적이라 최우선.
_ICON_KEYWORDS: list[tuple[str, tuple[str, ...]]] = [
    ("money", ("유로", "달러", "원", "억", "조", "투자", "예산", "세액공제", "지원금")),
    ("handshake", ("협약", "협정", "체결", "서명", "공동제작", "×", "협력", "MOU")),
    ("calendar", ("년간", "년 안", "개월", "기한", "시한", "차년도")),
    ("film", ("영화", "영상", "콘텐츠", "제작", "촬영", "리메이크", "IP")),
    ("globe", ("국가", "개국", "글로벌", "해외", "세계", "국제", "다자")),
    ("chart", ("증가", "확대", "성장", "규모", "흔들리고", "전환기")),
]


def _pick_icon_for_caption(text: str) -> str | None:
    for icon, keywords in _ICON_KEYWORDS:
        if any(k in text for k in keywords):
            return icon
    return None


def _draw_icon_badge(img: Image.Image, icon: str, x0: float, y0: float, d: float):
    """(x0, y0)를 좌상단으로 하는 d×d 정사각형 안에 색상 원 배지 + 흰색
    픽토그램을 그린다."""
    draw = ImageDraw.Draw(img)
    draw.ellipse([x0, y0, x0 + d, y0 + d], fill=_ICON_BADGE_FILL)
    cx, cy = x0 + d / 2, y0 + d / 2
    r = d * 0.32  # 픽토그램이 원 안에서 차지할 반경 기준

    if icon == "money":
        # 겹친 동전 두 개(타원)
        for dy in (-r * 0.35, r * 0.35):
            draw.ellipse([cx - r, cy + dy - r * 0.42, cx + r, cy + dy + r * 0.42], outline=_ICON_STROKE, width=_ICON_STROKE_W)
    elif icon == "handshake":
        # 2026-09-09 — 처음엔 지그재그 선으로 "악수"를 표현했는데 실측
        # 확인 결과 형체를 못 알아봄. "서명된 계약서"(문서+체크마크)로
        # 바꿈 — 협약·협정·체결 의미를 더 명확하게 전달.
        draw.rounded_rectangle([cx - r * 0.75, cy - r, cx + r * 0.75, cy + r], radius=r * 0.12, outline=_ICON_STROKE, width=_ICON_STROKE_W)
        for ly in (-r * 0.5, -r * 0.1, r * 0.3):
            draw.line([cx - r * 0.4, cy + ly, cx + r * 0.4, cy + ly], fill=_ICON_STROKE, width=_w(3))
        draw.ellipse([cx + r * 0.15, cy + r * 0.15, cx + r * 1.15, cy + r * 1.15], fill=_ICON_BADGE_FILL, outline=_ICON_STROKE, width=_w(4))
        draw.line([cx + r * 0.4, cy + r * 0.65, cx + r * 0.6, cy + r * 0.85, cx + r * 0.95, cy + r * 0.4],
                  fill=_ICON_STROKE, width=_w(5), joint="curve")
    elif icon == "calendar":
        draw.rounded_rectangle([cx - r, cy - r * 0.75, cx + r, cy + r], radius=r * 0.2, outline=_ICON_STROKE, width=_ICON_STROKE_W)
        draw.line([cx - r, cy - r * 0.15, cx + r, cy - r * 0.15], fill=_ICON_STROKE, width=_w(3))
        draw.line([cx - r * 0.5, cy - r * 1.1, cx - r * 0.5, cy - r * 0.6], fill=_ICON_STROKE, width=_w(4))
        draw.line([cx + r * 0.5, cy - r * 1.1, cx + r * 0.5, cy - r * 0.6], fill=_ICON_STROKE, width=_w(4))
    elif icon == "film":
        draw.rounded_rectangle([cx - r, cy - r * 0.75, cx + r, cy + r * 0.75], radius=r * 0.15, outline=_ICON_STROKE, width=_ICON_STROKE_W)
        for fx in (cx - r * 0.6, cx, cx + r * 0.6):
            draw.rectangle([fx - r * 0.12, cy - r * 0.75, fx + r * 0.12, cy - r * 0.5], fill=_ICON_STROKE)
            draw.rectangle([fx - r * 0.12, cy + r * 0.5, fx + r * 0.12, cy + r * 0.75], fill=_ICON_STROKE)
    elif icon == "globe":
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], outline=_ICON_STROKE, width=_ICON_STROKE_W)
        draw.ellipse([cx - r * 0.4, cy - r, cx + r * 0.4, cy + r], outline=_ICON_STROKE, width=_w(3))
        draw.line([cx - r, cy, cx + r, cy], fill=_ICON_STROKE, width=_w(3))
    elif icon == "chart":
        base_y = cy + r * 0.7
        for i, h in enumerate((0.5, 0.9, 1.3)):
            bx = cx - r * 0.7 + i * r * 0.7
            draw.rectangle([bx - r * 0.22, base_y - r * h, bx + r * 0.22, base_y], fill=_ICON_STROKE)


def draw_caption(img: Image.Image, text: str, bottom_limit: int | None = None):
    """작은 캡션 박스 — 좌하단, 수치·팩트 표기용.

    2026-09-09 — 사용자가 공유한 원본 GPT-image 레퍼런스 샘플을 다시
    대조한 결과(셀프피드백), 우리 파이프라인엔 원본에 있던 "아이콘
    배지"(카메라·돈·악수 등 작은 픽토그램이 색상 원 안에 들어간 것)가
    완전히 빠져 있었다 — 이게 원본의 정보 밀도·시각적 재미를 만드는
    핵심 요소 중 하나였는데, AI 이미지 생성 품질과는 별개인 순수
    레이아웃 요소라 새 이미지 모델 호출 없이 PIL로 바로 추가 가능하다.
    caption 텍스트에서 키워드를 찾아 어울리는 아이콘을 캡션 박스 왼쪽에
    붙인다(_pick_icon_for_caption 참고) — 매치되는 키워드가 없으면
    아이콘 없이 기존과 동일하게 그린다(안전한 폴백).

    2026-09-28, 사용자 리포트("좌하단에 흰 박스와 검은 박스가 겹쳐서
    나와 내용 파악이 어렵습니다") — caption은 항상 화면 맨 밑(y0 =
    height - bh - 24)에 고정 배치였는데, 같은 컷에 narration/
    closing_caption(둘 다 하단 텍스트 요소)이 같이 있으면 그 위에
    그대로 겹쳐 그려졌다. compose()가 narration/closing_caption을
    먼저 그려 상단 y좌표를 돌려주면 그 값을 bottom_limit으로 받아
    캡션 박스를 그 위로 띄운다 — draw_title()의 결과를 draw_dialogue()에
    넘기던 것과 같은 패턴(위 compose() 3차 개편 주석 참고)."""
    draw = ImageDraw.Draw(img)
    font = _font(26)
    max_width = int(img.width * 0.5)
    lines = _wrap_text(draw, text, font, max_width)
    block_w, block_h = _measure_block(draw, lines, font)
    bw, bh = block_w + _PADDING * 2, block_h + _PADDING * 2

    icon = _pick_icon_for_caption(text)
    badge_d = bh  # 배지 지름을 캡션 박스 높이에 맞춘다
    badge_gap = _k(12) if icon else 0
    x0 = _k(24) + (badge_d + badge_gap if icon else 0)
    default_y0 = img.height - bh - _k(24)
    y0 = min(default_y0, bottom_limit - bh - _k(16)) if bottom_limit is not None else default_y0

    if icon:
        _draw_icon_badge(img, icon, _k(24), y0, badge_d)

    draw.rectangle([x0, y0, x0 + bw, y0 + bh], fill=(255, 255, 255, 235), outline=_BUBBLE_OUTLINE, width=_w(3))
    ty = y0 + _PADDING
    for ln in lines:
        draw.text((x0 + _PADDING, ty), ln, font=font, fill=_TEXT_FILL)
        ty += draw.textbbox((0, 0), ln, font=font)[3] + _LINE_SPACING


def draw_narration(img: Image.Image, text: str) -> int:
    """다큐 타이틀 카드 스타일 — 하단 1/3에 어두운 스크림 + 흰 텍스트."""
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    odraw = ImageDraw.Draw(overlay)
    band_h = int(img.height * 0.22)
    y0 = img.height - band_h
    odraw.rectangle([0, y0, img.width, img.height], fill=(0, 0, 0, 150))
    img.paste(Image.alpha_composite(img.convert("RGBA").crop((0, y0, img.width, img.height)), overlay.crop((0, y0, img.width, img.height))).convert("RGB"), (0, y0))

    draw = ImageDraw.Draw(img)
    font = _font(38)
    max_width = int(img.width * 0.82)
    lines = _wrap_text(draw, text, font, max_width)
    block_w, block_h = _measure_block(draw, lines, font)
    ty = y0 + (band_h - block_h) / 2
    for ln in lines:
        tw = draw.textlength(ln, font=font)
        draw.text(((img.width - tw) / 2, ty), ln, font=font, fill=(255, 255, 255))
        ty += draw.textbbox((0, 0), ln, font=font)[3] + _LINE_SPACING
    return y0


# 배율 적용 대상 전역 수치의 1216px 기준값(원본). compose(scale=)가 이 값에 배율을 곱해 일시적으로 덮어쓴다.
_BASE_METRICS = {
    "_OUTLINE_WIDTH": _OUTLINE_WIDTH,
    "_PADDING": _PADDING,
    "_LINE_SPACING": _LINE_SPACING,
    "_FACE_BUBBLE_MARGIN_PX": _FACE_BUBBLE_MARGIN_PX,
    "_ICON_STROKE_W": _ICON_STROKE_W,
}


def compose(img_path: Path, cut: dict, faces: list[dict] | None = None, scale: float = 1.0) -> list[dict]:
    """(scale > 1이면 배경을 Lanczos로 키운 뒤 글자·말풍선을 그 크기에 맞춰 새로 그린다 — 아래 _compose_at 참고.)"""
    global _SCALE
    g = globals()
    prev_scale = _SCALE
    _SCALE = scale
    for name, base in _BASE_METRICS.items():
        g[name] = max(1, int(round(base * scale))) if name in ("_OUTLINE_WIDTH", "_ICON_STROKE_W") else base * scale
    try:
        return _compose_at(img_path, cut, faces, scale)
    finally:
        _SCALE = prev_scale
        for name, base in _BASE_METRICS.items():
            g[name] = base


def _compose_at(img_path: Path, cut: dict, faces: list[dict] | None, scale: float) -> list[dict]:
    """배경 이미지(img_path) 위에 cut의 title/dialogue/caption/(closing_caption
    또는 narration)을 순서대로 합성해서 같은 경로에 덮어쓴다. faces —
    항상 None(2026-09-28, Rekognition 얼굴 감지 제거 — draw_dialogue
    상단 주석 참고), 균등 분할 폴백만 동작한다.

    2026-09-08 — title/closing_caption 추가. closing_caption과 narration은
    둘 다 하단 텍스트 요소라 시각적으로 겹친다 — closing_caption이 있으면
    (컷8) 그걸 쓰고 narration은 무시한다(published.md 규칙상 컷8은 둘 중
    closing_caption만 쓰도록 스크립트 단계에서 이미 나뉘어 있어야 하지만,
    방어적으로 여기서도 우선순위를 명시).

    2026-09-08(2차) — 컷1은 draw_title() 대신 draw_cover_header()("서울경제
    웹툰" 브랜드 라벨 + 헤드라인 박스)를 쓴다. 컷2~8은 title_fill_for_cut()
    으로 계산한 §13 색상표 색을 draw_title()에 넘긴다.

    2026-09-08(3차) — draw_title()/draw_cover_header()가 돌려주는 실제
    제목 하단 y좌표(title_bottom)를 draw_dialogue()에 넘긴다 — 제목이
    길어 알약이 예상보다 커지는 컷에서 말풍선이 제목과 겹치던 문제
    수정(draw_dialogue() 상단 주석 참고).

    2026-09-28 — caption(좌하단 작은 박스)과 narration/closing_caption
    (하단 전체 밴드)이 같은 컷에 같이 있으면 둘 다 화면 맨 밑을 기준으로
    독립적으로 그려져 겹쳤다(사용자 리포트 — "좌하단에 흰 박스와 검은
    박스가 겹쳐서 나와 내용 파악이 어렵습니다"). narration/closing_caption
    을 caption보다 먼저 그리고 그 상단 y좌표를 받아 caption을 그 위로
    띄운다 — title_bottom을 draw_dialogue()에 넘기던 것과 같은 패턴."""
    img = Image.open(img_path).convert("RGB")
    if scale != 1.0:
        # 그림은 Lanczos로 키우고 가장자리를 아주 약하게 샤픈(과하면 인공물이 생겨 약하게).
        img = img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS)
        img = img.filter(ImageFilter.UnsharpMask(radius=1.2, percent=40, threshold=3))
    global _BUBBLE_STYLE
    _BUBBLE_STYLE = cut.get("bubble_style") or "classic"
    # 말풍선 여백 모드(bubble_margin) — 그림 위에 흰 여백을 붙여 말풍선을 그 여백에 둔다(레퍼런스 웹툰 방식: 그림을 가리지 않는다).
    detect_in = cut.get("detect")
    max_bottom_in = 0.85
    if cut.get("bubble_margin") and cut.get("dialogue"):
        H0 = img.height
        margin_px = int(round(H0 * (_MARGIN_RATIO + (0.16 if cut.get("cut") == 1 and cut.get("title") else 0.0))))  # 표지는 제목 띠 자리까지 더한다
        ext = Image.new("RGB", (img.width, H0 + margin_px), (255, 255, 255))
        ext.paste(img, (0, margin_px))
        img = ext
        if detect_in:
            shift = lambda b: {**b, "t": (b["t"] * H0 + margin_px) / img.height, "h": b["h"] * H0 / img.height}  # noqa: E731
            detect_in = {"persons": [shift(b) for b in detect_in.get("persons", [])], "faces": [shift(b) for b in detect_in.get("faces", [])]}
        max_bottom_in = (margin_px + 0.10 * H0) / img.height  # 여백 + 그림 윗부분 조금까지만
    cut_no = cut.get("cut")
    title_bottom = None
    if cut_no == 1 and cut.get("title"):
        title_bottom = draw_cover_header(img, "서울경제 웹툰", cut["title"], cut.get("title_keyword"))
    elif cut.get("title"):
        title_bottom = draw_title(img, cut["title"], fill=title_fill_for_cut(cut_no))
    layout: list[dict] = []
    if cut.get("dialogue"):
        layout = draw_dialogue(img, cut["dialogue"], faces, title_bottom, detect_in, max_bottom_in) or []
    bottom_top = None
    band_text = (cut.get("closing_caption") or cut.get("narration") or "").strip()
    margin_mode = bool(cut.get("bubble_margin") and cut.get("dialogue"))
    # 나레이션을 이미지에 굽지 않고 사이트가 컷 아래 여백에 글자로 보여주는 모드(2026-10-04). 켜져 있으면 검정 띠를 붙이지 않는다.
    narration_as_text = bool(cut.get("narration_as_text"))
    if band_text and not margin_mode:
        if cut.get("closing_caption"):
            bottom_top = draw_closing_caption(img, cut["closing_caption"])
        else:
            bottom_top = draw_narration(img, cut["narration"])
    if cut.get("caption"):
        draw_caption(img, cut["caption"], bottom_limit=bottom_top)
    if band_text and margin_mode and not narration_as_text:
        # 웹툰식(여백) 모드 — 나레이션은 그림 위에 덮지 않고 그림 아래에 검은 띠를 붙여 흰 글씨로 얹는다(그림을 가리지 않는다).
        d = ImageDraw.Draw(img)
        f = _font(34)
        lines = _wrap_text(d, band_text, f, int(img.width * 0.84))
        _, block_h = _measure_block(d, lines, f)
        band_h = int(block_h + _k(46))
        H1 = img.height
        out = Image.new("RGB", (img.width, H1 + band_h), (18, 18, 18))
        out.paste(img, (0, 0))
        od = ImageDraw.Draw(out)
        ty = H1 + (band_h - block_h) / 2
        for ln in lines:
            _draw_line_highlight(od, img.width / 2, ty, ln, f, (255, 255, 255), _ACCENT_ON_DARK)  # 핵심 숫자만 파랑으로
            ty += od.textbbox((0, 0), ln, font=f)[3] + _LINE_SPACING
        ratio = H1 / out.height  # 풍선 위치 비율을 띠가 붙은 최종 높이 기준으로 다시 맞춘다(CMS 편집 손잡이용)
        layout = [{**b, "y": round(b["y"] * ratio, 4), "h": round(b["h"] * ratio, 4), "tip_y": round(b["tip_y"] * ratio, 4)} for b in layout]
        img = out
    img.save(img_path)
    return layout
