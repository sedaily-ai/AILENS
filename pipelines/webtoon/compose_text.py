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

# 2026-09-08 — 상단 제목/컷8 마무리 자막용 짙은 남색. STYLE(webtoon_image.py)의
# "navy blue, sky blue, red" 강조색 팔레트와 맞춘다.
_NAVY_FILL = (26, 41, 74)
_NAVY_TEXT_FILL = (255, 255, 255)


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


def _spiky_bubble_path(draw, x0, y0, x1, y1, tail_x, spikes=14, inflate=1.3):
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
    "전혀 없던 것"보다는 훨씬 나은 근사치.

    2026-09-08 — 폴백 순서를 좌→우에서 우→좌로 뒤집었다(육하원칙 프롬프트
    문서 검토 후 published.md에 추가한 "첫 번째 말풍선은 화면 오른쪽 화자"
    규칙과 맞추기 위함). 1단계 dialogue 배열의 첫 번째 항목이 그 컷에서
    먼저 말하는(=오른쪽에 있는) 화자라는 게 이제 스크립트 단계의 계약이므로,
    face_x가 없을 때도 dialogue[0]을 오른쪽에 앵커해야 한글 독자의 우→좌
    읽기 흐름과 어긋나지 않는다."""
    if not dialogue:
        return
    n = len(dialogue)
    # 0.06 → 0.16(2026-09-08): draw_title()이 상단에 제목 알약을 새로
    # 그리게 되면서, 말풍선이 그 아래부터 시작하도록 자리를 내줬다.
    top_y = int(img.height * 0.16)
    use_face_x = face_x is not None and len(face_x) == n
    for i, d in enumerate(dialogue):
        if use_face_x:
            anchor_x = int(img.width * face_x[i])
        else:
            anchor_x = int(img.width * (n - 0.5 - i) / n)
        tone = d.get("tone", "보통")
        _draw_bubble(img, d["line"], tone, anchor_x, top_y)


def draw_title(img: Image.Image, text: str):
    """상단 제목 알약형 라벨 — 2026-09-08 신설(육하원칙 기반 웹툰 프롬프트
    문서 검토 후 도입). 기존 draw_caption(좌하단 수치용)·draw_narration
    (하단 다큐 타이틀 카드)과 역할이 다르다 — 모든 컷 상단에 고정 배치돼
    "제목만 순서대로 읽어도 이야기 흐름이 드러나야 한다"(published.md
    "상단 제목" 절)를 담당한다. 한 줄(12자 이내 규칙)을 전제로 폭을
    넉넉히 잡는다 — 넘치면 줄바꿈되지만 자간이 빡빡해질 뿐 잘리지 않는다."""
    draw = ImageDraw.Draw(img)
    font = _font(30)
    max_width = int(img.width * 0.6)
    lines = _wrap_text(draw, text, font, max_width)
    if not lines:
        return
    block_w, block_h = _measure_block(draw, lines, font)
    bw = block_w + _PADDING * 2.4
    bh = block_h + _PADDING * 1.3
    x0 = (img.width - bw) / 2
    y0 = img.height * 0.03
    x1 = x0 + bw
    y1 = y0 + bh
    draw.rounded_rectangle([x0, y0, x1, y1], radius=bh / 2, fill=_NAVY_FILL)
    ty = y0 + (bh - block_h) / 2
    for ln in lines:
        tw = draw.textlength(ln, font=font)
        draw.text(((img.width - tw) / 2, ty), ln, font=font, fill=_NAVY_TEXT_FILL)
        ty += draw.textbbox((0, 0), ln, font=font)[3] + _LINE_SPACING


def draw_closing_caption(img: Image.Image, text: str):
    """컷8 전용 마무리 자막 — 2026-09-08 신설. 화면 하단 짙은 남색 둥근
    바 + 흰 굵은 글씨. draw_narration(하단 1/3 어두운 스크림 + 다큐
    타이틀)과 시각적으로 겹치므로, 컷8은 narration 대신 이걸 쓴다
    (compose() 참고 — 같은 컷에 둘 다 그리지 않는다). published.md의
    "컷8 마무리 자막" 규칙(25자 이내, 대사·캡션과 중복 금지, 숫자
    지양)을 그대로 따르는 짧은 한 줄을 전제로 폭을 넉넉히 잡지만, 스크립트
    단계가 글자 수를 넘길 수도 있어(2026-09-08 실측 — closing_caption이
    25자를 넘겼는데 draw_closing_caption이 첫 줄만 그리고 나머지를 조용히
    버려서, 하마터면 문장 뒷부분이 통째로 사라질 뻔했다) 최대 2줄까지는
    허용한다 — 잘림보다 두 줄이 낫다."""
    draw = ImageDraw.Draw(img)
    font = _font(32)
    max_width = int(img.width * 0.82)
    lines = _wrap_text(draw, text, font, max_width)[:2]
    if not lines:
        return
    block_w, block_h = _measure_block(draw, lines, font)
    bw = block_w + _PADDING * 2.4
    bh = block_h + _PADDING * 1.6
    x0 = (img.width - bw) / 2
    y1 = img.height - img.height * 0.05
    y0 = y1 - bh
    x1 = x0 + bw
    draw.rounded_rectangle([x0, y0, x1, y1], radius=min(bh / 2, 40), fill=_NAVY_FILL)
    ty = y0 + (bh - block_h) / 2
    for ln in lines:
        tw = draw.textlength(ln, font=font)
        draw.text(((img.width - tw) / 2, ty), ln, font=font, fill=_NAVY_TEXT_FILL)
        ty += draw.textbbox((0, 0), ln, font=font)[3] + _LINE_SPACING


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
    """배경 이미지(img_path) 위에 cut의 title/dialogue/caption/(closing_caption
    또는 narration)을 순서대로 합성해서 같은 경로에 덮어쓴다. face_x — 비전
    검증 단계에서 감지한 얼굴 x좌표 목록(draw_dialogue 참고, 없으면 균등
    분할 폴백).

    2026-09-08 — title/closing_caption 추가. closing_caption과 narration은
    둘 다 하단 텍스트 요소라 시각적으로 겹친다 — closing_caption이 있으면
    (컷8) 그걸 쓰고 narration은 무시한다(published.md 규칙상 컷8은 둘 중
    closing_caption만 쓰도록 스크립트 단계에서 이미 나뉘어 있어야 하지만,
    방어적으로 여기서도 우선순위를 명시)."""
    img = Image.open(img_path).convert("RGB")
    if cut.get("title"):
        draw_title(img, cut["title"])
    if cut.get("dialogue"):
        draw_dialogue(img, cut["dialogue"], face_x)
    if cut.get("caption"):
        draw_caption(img, cut["caption"])
    if cut.get("closing_caption"):
        draw_closing_caption(img, cut["closing_caption"])
    elif cut.get("narration"):
        draw_narration(img, cut["narration"])
    img.save(img_path)
