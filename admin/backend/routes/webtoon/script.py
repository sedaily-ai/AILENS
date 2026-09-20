"""웹툰 스크립트+장면 연출 생성 — 발행된 프롬프트(105K자, "## N. 제목"
챕터 구조)에서 필요한 챕터만 잘라 단일 Bedrock 호출을 조립하고, 그
결과 컷을 다운스트림(컷 이미지 생성·compose_text.py)이 기대하는 필드
이름으로 정규화한다. `routes/chat_ws.py`(스크립트챗랩 WebSocket)가
이 모듈의 `build_script_call`/`normalize_cuts`를 직접 부른다.

2026-09-20 — `routes/prompts.py`(범용 프롬프트 CRUD 파일)에 섞여 있던
웹툰 전용 함수들을 여기로 옮겼다(사용자 요청: "웹툰 관련한거는...
기능별로 코드파일들이 있기를 원하는데요"). `_CATEGORY_BEDROCK`/
`_WEBTOON_SYSTEM_PROMPT`/`_WEBTOON_JSON_INSTRUCTION`은 여러 카테고리
(letters/podcast/quiz 등)와 공유하는 `_call_bedrock_for_category`가
계속 쓰므로 prompts.py에 남기고 여기서 import만 한다.

단계 분리 배경(2026-09-16) — 발행된 웹툰 프롬프트 전체(105K자, 22개
챕터)를 통째로 시스템 프롬프트에 넣던 걸, 챕터 번호 기준으로 필요한
것만 잘라 조립하도록 바꿨다. 새 프롬프트 파일을 따로 안 만들고(admin에
다단 파일 편집 UI를 새로 만들 필요 없음), 발행된 프롬프트 문서 자체에서
그때그때 챕터를 추출한다 — 문서가 수정돼도(챕터 번호 체계를 유지하는
한) 자동으로 최신 내용을 반영한다.

⚠️ 이 작업 중 실제 발행 프롬프트 원본 자체에 결함을 발견했다(고쳐야 할
것 — DDB 원본은 안 건드림, 아래 `extract_chapters`가 방어적으로 우회):
0~21장이 문서 안에 통째로 두 번 들어있고(뒤쪽 사본이 최신 — "챕터당
마지막 등장만 쓴다"로 자동 회피), 맨 끝에 admin 파일 편집 UI의
라벨("### 파일 · 새 파일")과 테스트로 보이는 "aaaa" 텍스트가 그대로
발행 내용에 섞여 있다("### 파일" 이후를 잘라낸다). 원본 정리는
별도로 다룰 것.

2026-09-18 — "1단계(스크립트)/2단계(장면 연출)" 구분 자체를 없앴다(사용자
요청: "스테이지 구분 자체가 왜 있어야하는거죠?? 그런거 필요없을텐데요").
그 전까지는 Bedrock을 두 번 나눠 불러(_build_step1_call → _build_step2_call)
1단계 스크립트 결과를 2단계 프롬프트에 다시 끼워넣는 방식이었는데, 발행
프롬프트 어디에도 "2단계"라는 개념이 없다 — 22장은 "Stage 1 Script Output
Format"이라고만 돼 있고 2단계용 정식 출력 스키마 챕터 자체가 없어서, 코드
쪽 상수가 그 자리를 강제로 메꾸고 있었던 것뿐이다(그 강제 스키마가
camera_distance/camera_height/composition/background 같은, 사용자가
요청한 적 없는 필드를 계속 밀어넣던 원인). 이제 필요한 모든 챕터(사실분석+
장면설계+텍스트화이트리스트+공통이미지스타일)를 한 번에 넘기고, 22장
스크립트 스키마의 각 컷에 camera/scene 두 필드만 코드에서 추가 요구해서
단일 호출로 끝낸다."""
from __future__ import annotations

import re

from routes.prompts import _CATEGORY_BEDROCK, _WEBTOON_JSON_INSTRUCTION, _WEBTOON_SYSTEM_PROMPT

_CHAPTER_HEADER_RE = re.compile(r"^##\s*(\d+)\.\s*.+$", re.MULTILINE)
_KNOWN_GARBAGE_MARKERS = ("### 파일 · 새 파일",)  # admin 편집 UI 라벨이 섞여 들어간 흔적


def extract_chapters(content: str, chapter_numbers: list[int]) -> str:
    """"## N. 제목" 헤더로 구분된 챕터 중 번호가 일치하는 것만 뽑아 순서대로
    이어붙인다. 같은 번호가 여러 번 나오면(발행 프롬프트 실측 결함 참고)
    가장 마지막(=가장 최근에 수정된) 사본만 쓴다. 챕터 헤더 패턴 자체가
    없는 문서(예: 실험용 prompt_override 초안)면 안전하게 원문 그대로
    반환한다 — 이 구조를 전제로 만들어진 문서가 아닐 수 있어서다."""
    matches = list(_CHAPTER_HEADER_RE.finditer(content))
    if not matches:
        return content

    starts = [m.start() for m in matches]
    last_start_by_num: dict[int, int] = {}
    for m in matches:
        last_start_by_num[int(m.group(1))] = m.start()

    parts = []
    for num in chapter_numbers:
        start = last_start_by_num.get(num)
        if start is None:
            continue
        end = next((s for s in starts if s > start), len(content))
        chunk = content[start:end]
        for marker in _KNOWN_GARBAGE_MARKERS:
            idx = chunk.find(marker)
            if idx != -1:
                chunk = chunk[:idx].rstrip()
        parts.append(chunk.strip())
    return "\n\n".join(parts)


SCRIPT_CHAPTERS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 22]

_SCRIPT_OUTPUT_ADDENDUM = (
    "\n\n---\n### 출력 형식 (코드 보강)\n"
    "위 \"Stage 1 Script Output Format\" JSON 스키마 그대로 컷 8개를 채우되,"
    " 각 cuts 원소마다 다음 두 필드를 추가한다:\n"
    '- "camera": 카메라 거리·앵글을 서술하는 한국어 문장.\n'
    '- "scene": 구도·배경·인물 동작·소품을 서술하는 한국어 문장(위 12장'
    " Scene Design 지침 반영, 8컷 연속 동일 구도 금지).\n"
    "다른 설명 없이 JSON 객체 하나만 응답한다."
)


def build_script_call(content: str, article: str) -> tuple[str, str, str, int]:
    """스크립트+장면 연출을 한 번에 만드는 단일 호출용 (system, user_message,
    model, max_tokens) 조립. routes/chat_ws.py가 이 결과로 직접
    converse_stream을 불러 실시간으로 청크를 밀어보낸다."""
    webtoon_cfg = _CATEGORY_BEDROCK["webtoon"]
    stage_content = extract_chapters(content, SCRIPT_CHAPTERS)
    user_message = (
        stage_content
        + "\n\n---\n[지금 할 일]\n위 지침을 참고해서 스크립트와 장면 연출을 한 번에 만든다.\n\n[입력 기사]\n"
        + article
        + _WEBTOON_JSON_INSTRUCTION
        + _SCRIPT_OUTPUT_ADDENDUM
    )
    return _WEBTOON_SYSTEM_PROMPT, user_message, webtoon_cfg["model"], webtoon_cfg["max_tokens"]


def _cut_number(d: dict) -> int | None:
    """v11 스키마는 컷 번호를 정수 "cut" 대신 문자열 "cut_id"("cut_01")로
    준다 — 둘 다 받는다."""
    n = d.get("cut")
    if isinstance(n, int):
        return n
    cut_id = d.get("cut_id") or d.get("id")
    if isinstance(cut_id, str):
        digits = "".join(ch for ch in cut_id if ch.isdigit())
        if digits:
            return int(digits)
    return None


def _first_nonempty(*values: object) -> str:
    for v in values:
        if isinstance(v, str) and v.strip():
            return v
    return ""


def _dialogue_from_bubbles(c: dict) -> list[dict]:
    """v11 스키마는 "dialogue" 배열 대신 bubble_1/bubble_2(각각
    {"speaker":"female"|"male","text":...})로 준다 — 구도 없이 만들어진
    옛 dialogue 스키마와 나란히 지원."""
    if c.get("dialogue"):
        return c["dialogue"]
    lines = []
    for key in ("bubble_1", "bubble_2"):
        b = c.get(key)
        if isinstance(b, dict) and b.get("text"):
            speaker = "A" if b.get("speaker") == "female" else "B" if b.get("speaker") == "male" else key
            lines.append({"speaker": speaker, "line": b["text"]})
    return lines


def normalize_cuts(script: dict) -> list[dict]:
    """단일 호출(build_script_call) 결과의 cuts를 컷 이미지 생성·
    compose_text.py가 기대하는 옛 필드 이름(camera/scene/dialogue/title/
    narration/caption)으로 정규화한다.

    2026-09-18 — 예전엔 script(1단계)+scenes(2단계) 두 호출 결과를 컷
    번호로 매칭해 합치는 _merge_storyboard_cuts였다. 이제 한 번의 호출이
    같은 컷 객체 안에 camera/scene까지 직접 채워 주므로(build_script_call
    참고) 두 딕셔너리를 매칭할 필요가 없다 — script["cuts"]를 그대로
    순회하며 필드 이름만 맞춘다.

    2026-09-15 — 저장된 웹툰 프롬프트가 v11에서 컷 번호(cut→cut_id)·대사
    (dialogue→bubble_1/bubble_2)를 새 스키마로 바꿨다(사용자 확인: 진행
    중인 개편, 되돌릴 생각 없음) — 있으면 그대로 쓰고 없으면 새 필드에서
    끌어와 채운다."""
    cuts = []
    for c in script.get("cuts") or []:
        cuts.append({
            "cut": _cut_number(c),
            "narration": _first_nonempty(c.get("narration"), c.get("new_conclusion")),
            "caption": _first_nonempty(c.get("caption"), c.get("keyword")),
            "closing_caption": c.get("closing_caption") or "",
            "title": _first_nonempty(c.get("title"), c.get("headline")),
            "title_keyword": c.get("title_keyword") or "",
            "dialogue": _dialogue_from_bubbles(c),
            "camera": c.get("camera") or "",
            "scene": c.get("scene") or "",
        })
    return cuts
