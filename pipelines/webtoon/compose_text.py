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
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

FONT_PATH = Path(__file__).parent / "assets" / "NotoSansKR-Bold.ttf"

_BUBBLE_FILL = (255, 255, 255)
_BUBBLE_OUTLINE = (20, 20, 20)
_TEXT_FILL = (15, 15, 15)
_OUTLINE_WIDTH = 4
_PADDING = 22
_LINE_SPACING = 10
_MAX_BUBBLE_WIDTH_RATIO = 0.42  # 이미지 너비의 42%를 넘기지 않고 줄바꿈


def _font(size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONT_PATH), size)


def _wrap_text(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont, max_width: int) -> list[str]:
    """공백 기준으로 줄바꿈. 한글은 공백 없이 길게 이어지는 경우가 많아서,
    한 "단어"(공백으로 나눈 조각)가 그 자체로 max_width를 넘으면 글자 단위로도
    쪼갠다."""
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


def _rounded_bubble_path(draw, x0, y0, x1, y1, tail_x, radius=26):
    """부드러운 타원형 말풍선(보통 톤) — 둥근 사각형 + 하단 중앙에서 아래로
    뻗는 삼각 꼬리."""
    draw.rounded_rectangle([x0, y0, x1, y1], radius=radius, fill=_BUBBLE_FILL, outline=_BUBBLE_OUTLINE, width=_OUTLINE_WIDTH)
    tail_h = 26
    draw.polygon(
        [(tail_x - 16, y1 - 4), (tail_x + 16, y1 - 4), (tail_x, y1 + tail_h)],
        fill=_BUBBLE_FILL, outline=_BUBBLE_OUTLINE, width=_OUTLINE_WIDTH,
    )
    # 꼬리와 몸통 이음새의 겹친 외곽선을 지운다
    draw.line([(tail_x - 14, y1 - 2), (tail_x + 14, y1 - 2)], fill=_BUBBLE_FILL, width=_OUTLINE_WIDTH + 2)


def _spiky_bubble_path(draw, x0, y0, x1, y1, tail_x, spikes=14):
    """격앙 톤 — 폭발형(삐죽삐죽) 말풍선."""
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    rx, ry = (x1 - x0) / 2, (y1 - y0) / 2
    points = []
    for i in range(spikes * 2):
        angle = math.pi * 2 * i / (spikes * 2)
        r_scale = 1.0 if i % 2 == 0 else 0.82
        points.append((cx + math.cos(angle) * rx * r_scale, cy + math.sin(angle) * ry * r_scale))
    draw.polygon(points, fill=_BUBBLE_FILL, outline=_BUBBLE_OUTLINE, width=_OUTLINE_WIDTH)
    tail_h = 26
    draw.polygon(
        [(tail_x - 16, y1 - 4), (tail_x + 16, y1 - 4), (tail_x, y1 + tail_h)],
        fill=_BUBBLE_FILL, outline=_BUBBLE_OUTLINE, width=_OUTLINE_WIDTH,
    )


def _draw_bubble(img: Image.Image, text: str, tone: str, anchor_x: int, top_y: int, font_size: int = 34):
    """anchor_x를 가로 중심으로 위쪽 top_y부터 말풍선을 그린다. 실제로 그려진
    말풍선의 (다음 요소가 안 겹치게 쓸) 세로 하단 좌표를 돌려준다."""
    draw = ImageDraw.Draw(img)
    font = _font(font_size)
    max_width = int(img.width * _MAX_BUBBLE_WIDTH_RATIO)
    lines = _wrap_text(draw, text, font, max_width)
    block_w, block_h = _measure_block(draw, lines, font)

    bw = block_w + _PADDING * 2
    bh = block_h + _PADDING * 2
    x0 = max(10, min(img.width - bw - 10, anchor_x - bw / 2))
    x1 = x0 + bw
    y0 = top_y
    y1 = y0 + bh
    tail_x = min(max(x0 + 30, anchor_x), x1 - 30)

    if tone == "격앙":
        _spiky_bubble_path(draw, x0, y0, x1, y1, tail_x)
    else:
        _rounded_bubble_path(draw, x0, y0, x1, y1, tail_x)

    ty = y0 + _PADDING
    for ln in lines:
        tw = draw.textlength(ln, font=font)
        draw.text((x0 + (bw - tw) / 2, ty), ln, font=font, fill=_TEXT_FILL)
        ty += draw.textbbox((0, 0), ln, font=font)[3] + _LINE_SPACING

    return y1 + 26  # 꼬리 아래 여백 포함, 다음 말풍선이 겹치지 않을 y


def draw_dialogue(img: Image.Image, dialogue: list[dict], face_x: list[float] | None = None):
    """dialogue = [{"speaker":..., "line":..., "tone":"보통"|"격앙"}, ...]

    2026-09-02 — 원래는 화자 위치 데이터가 없어서(1·2단계 JSON에 x/y 없음)
    상단에 좌→우로 순서대로 펼쳐 놓는 게 유일한 방법이었다(기자 피드백 —
    "인물과 연결되지 않은 말풍선이 허공을 가리키는 컷이 있다"). 이제
    pipeline.py가 생성된 배경 이미지를 비전 모델로 훑어 실제 얼굴 x좌표
    (0~1 정규화)를 감지해서 넘겨준다 — 개수가 대사 수와 일치하면 그
    좌표를 그대로 앵커로 쓴다. 개수가 안 맞거나(얼굴 인식 실패, 인물 수
    불일치 등) face_x가 없으면 기존의 균등 분할 폴백으로 돌아간다 —
    완벽한 보장은 아니지만(비전 모델의 얼굴 인식 자체도 100%는 아님),
    "전혀 없던 것"보다는 훨씬 나은 근사치."""
    if not dialogue:
        return
    n = len(dialogue)
    top_y = int(img.height * 0.06)
    use_face_x = face_x is not None and len(face_x) == n
    for i, d in enumerate(dialogue):
        if use_face_x:
            anchor_x = int(img.width * face_x[i])
        else:
            anchor_x = int(img.width * (i + 0.5) / n)
        tone = d.get("tone", "보통")
        _draw_bubble(img, d["line"], tone, anchor_x, top_y)


def draw_caption(img: Image.Image, text: str):
    """작은 캡션 박스 — 좌하단, 수치·팩트 표기용."""
    draw = ImageDraw.Draw(img)
    font = _font(26)
    max_width = int(img.width * 0.5)
    lines = _wrap_text(draw, text, font, max_width)
    block_w, block_h = _measure_block(draw, lines, font)
    bw, bh = block_w + _PADDING * 2, block_h + _PADDING * 2
    x0, y0 = 24, img.height - bh - 24
    draw.rectangle([x0, y0, x0 + bw, y0 + bh], fill=(255, 255, 255, 235), outline=_BUBBLE_OUTLINE, width=3)
    ty = y0 + _PADDING
    for ln in lines:
        draw.text((x0 + _PADDING, ty), ln, font=font, fill=_TEXT_FILL)
        ty += draw.textbbox((0, 0), ln, font=font)[3] + _LINE_SPACING


def draw_narration(img: Image.Image, text: str):
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


def compose(img_path: Path, cut: dict, face_x: list[float] | None = None):
    """배경 이미지(img_path) 위에 cut의 dialogue/caption/narration을 순서대로
    합성해서 같은 경로에 덮어쓴다. face_x — 비전 검증 단계에서 감지한 얼굴
    x좌표 목록(draw_dialogue 참고, 없으면 균등 분할 폴백)."""
    img = Image.open(img_path).convert("RGB")
    if cut.get("dialogue"):
        draw_dialogue(img, cut["dialogue"], face_x)
    if cut.get("caption"):
        draw_caption(img, cut["caption"])
    if cut.get("narration"):
        draw_narration(img, cut["narration"])
    img.save(img_path)
