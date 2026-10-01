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


def _rounded_bubble_path(draw, x0, y0, x1, y1, tail_x, radius=26):
    radius = _k(radius)
    """부드러운 타원형 말풍선(보통 톤) — 둥근 사각형 + 하단 중앙에서 아래로
    뻗는 삼각 꼬리."""
    draw.rounded_rectangle([x0, y0, x1, y1], radius=radius, fill=_BUBBLE_FILL, outline=_BUBBLE_OUTLINE, width=_OUTLINE_WIDTH)
    tail_h = _k(26)
    draw.polygon(
        [(tail_x - _k(16), y1 - _k(4)), (tail_x + _k(16), y1 - _k(4)), (tail_x, y1 + tail_h)],
        fill=_BUBBLE_FILL, outline=_BUBBLE_OUTLINE, width=_OUTLINE_WIDTH,
    )
    # 꼬리와 몸통 이음새의 겹친 외곽선을 지운다
    draw.line([(tail_x - _k(14), y1 - _k(2)), (tail_x + _k(14), y1 - _k(2))], fill=_BUBBLE_FILL, width=_OUTLINE_WIDTH + _w(2))


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
    tail_h = _k(26)
    draw.polygon(
        [(tail_x - _k(16), y1 - _k(4)), (tail_x + _k(16), y1 - _k(4)), (tail_x, y1 + tail_h)],
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
    x0 = max(_k(10), min(img.width - bw - _k(10), anchor_x - bw / 2))
    x1 = x0 + bw
    y0 = top_y
    y1 = y0 + bh
    tail_x = min(max(x0 + _k(30), anchor_x), x1 - _k(30))

    if tone == "격앙":
        _spiky_bubble_path(draw, x0, y0, x1, y1, tail_x)
    else:
        _rounded_bubble_path(draw, x0, y0, x1, y1, tail_x)

    ty = y0 + _PADDING
    for ln in lines:
        tw = draw.textlength(ln, font=font)
        draw.text((x0 + (bw - tw) / 2, ty), ln, font=font, fill=_TEXT_FILL)
        ty += draw.textbbox((0, 0), ln, font=font)[3] + _LINE_SPACING

    return y1 + _k(26)  # 꼬리 아래 여백 포함, 다음 말풍선이 겹치지 않을 y


_DEFAULT_BUBBLE_TOP_RATIO = 0.16  # draw_title()의 제목 알약 아래로 자리를 내주는 기본 높이
_FACE_BUBBLE_MARGIN_PX = 150  # 얼굴 상단에서 이만큼 위에 말풍선을 배치(2줄짜리 말풍선이 넉넉히 들어가는 여유)


def draw_dialogue(img: Image.Image, dialogue: list[dict], faces: list[dict] | None = None, min_top_y: float | None = None):
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
    if n == 2:
        measure_draw = ImageDraw.Draw(img)
        measure_font = _font(34)  # _draw_bubble()의 기본 font_size와 맞춘다
        half_widths = []
        for d in dialogue:
            lines = _wrap_text(measure_draw, d["line"], measure_font, int(img.width * _MAX_BUBBLE_WIDTH_RATIO))
            block_w, _ = _measure_block(measure_draw, lines, measure_font)
            half_widths.append((block_w + _PADDING * 2) / 2)

        min_gap = half_widths[0] + half_widths[1] + _k(40)  # 말풍선 사이 여백 40px
        if abs(anchors_x[0] - anchors_x[1]) < min_gap:
            mid = sum(anchors_x) / 2
            anchors_x = [mid + min_gap / 2, mid - min_gap / 2]

        shift = 0.0
        right_edge = anchors_x[0] + half_widths[0]
        if right_edge > img.width - _k(10):
            shift = (img.width - _k(10)) - right_edge
        left_edge = anchors_x[1] - half_widths[1] + shift
        if left_edge < _k(10):
            shift += _k(10) - left_edge
        anchors_x = [int(anchors_x[0] + shift), int(anchors_x[1] + shift)]

    for i, d in enumerate(dialogue):
        tone = d.get("tone", "보통")
        _draw_bubble(img, d["line"], tone, anchors_x[i], tops_y[i])


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


def compose(img_path: Path, cut: dict, faces: list[dict] | None = None, scale: float = 1.0):
    """(scale > 1이면 배경을 Lanczos로 키운 뒤 글자·말풍선을 그 크기에 맞춰 새로 그린다 — 아래 _compose_at 참고.)"""
    global _SCALE
    g = globals()
    prev_scale = _SCALE
    _SCALE = scale
    for name, base in _BASE_METRICS.items():
        g[name] = max(1, int(round(base * scale))) if name in ("_OUTLINE_WIDTH", "_ICON_STROKE_W") else base * scale
    try:
        _compose_at(img_path, cut, faces, scale)
    finally:
        _SCALE = prev_scale
        for name, base in _BASE_METRICS.items():
            g[name] = base


def _compose_at(img_path: Path, cut: dict, faces: list[dict] | None, scale: float):
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
    cut_no = cut.get("cut")
    title_bottom = None
    if cut_no == 1 and cut.get("title"):
        title_bottom = draw_cover_header(img, "서울경제 웹툰", cut["title"], cut.get("title_keyword"))
    elif cut.get("title"):
        title_bottom = draw_title(img, cut["title"], fill=title_fill_for_cut(cut_no))
    if cut.get("dialogue"):
        draw_dialogue(img, cut["dialogue"], faces, title_bottom)
    bottom_top = None
    if cut.get("closing_caption"):
        bottom_top = draw_closing_caption(img, cut["closing_caption"])
    elif cut.get("narration"):
        bottom_top = draw_narration(img, cut["narration"])
    if cut.get("caption"):
        draw_caption(img, cut["caption"], bottom_limit=bottom_top)
    img.save(img_path)
