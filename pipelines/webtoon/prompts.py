"""
뉴스 웹툰 파이프라인 — 3단계(이미지 생성) 프롬프트 정의
=====================================
1·2단계(스크립트·장면연출) 지침은 여기 없다 — admin 프롬프트 드로어
("/lens" → 프롬프트 → 웹툰 탭)가 관리하는 DDB(`PROMPT#webtoon/published`)가
정본이고, `pipeline.py`가 `ddb_prompt.load_prompt("webtoon")`로 그걸 그대로
가져다 쓴다.

2026-08-20 이전엔 이 파일에 SCRIPT_PROMPT_TEMPLATE/SCENE_PROMPT_TEMPLATE로
1·2단계 지침이 따로 하드코딩돼 있었다 — admin에서 프롬프트를 아무리
고쳐도 이 파이프라인이 실제로 이미지를 만들 때는 그 하드코딩된 옛
버전을 계속 썼다는 뜻(발견 경위: 라운드기록.md 이슈 트래커 #11). 지금은
지웠다 — 다시 여기 하드코딩하지 말 것, DDB가 유일한 정본이어야 한다.

3단계(이미지 생성 API 호출)만 이 파일에 코드로 남아있는 이유는 다르다 —
이건 프롬프트 텍스트가 아니라 "말풍선 모양을 tone에 따라 어떻게 분기할지"
같은 실행 로직이 섞여 있어서, DB에서 문자열 하나로 뽑아 그대로 실행하기
안전하지 않다(DB에 저장된 임의 텍스트를 코드처럼 해석/실행하는 건 그
자체로 위험한 패턴이다). 대신 admin의 webtoon 프롬프트 문서 안에도 같은
내용이 "3단계 — 이미지 생성 스타일 (참고용)" 섹션으로 그대로 적혀 있다 —
**이 파일을 고치면 그 섹션도 반드시 같이 고칠 것.** 서로 다른 저장소
(dev2 git vs DDB)에 있어서 자동으로는 안 맞는다.
"""

# ─────────────────────────────────────────────────────────────
# 3단계: 이미지 생성 프롬프트 — 아트 스타일 + 말풍선 렌더링 규칙
# ─────────────────────────────────────────────────────────────
#
# ⚠️ 이 스타일 문구는 세 번의 시행착오 끝에 확정된 것이다. 절대 아무
# 이유 없이 되돌리지 말 것 — 아래 "겪었던 문제들" 참고.
#
# 겪었던 문제 1: 처음엔 "Realistic Korean editorial illustration,
#   semi-photographic rendering"으로 갔다가 완전히 실사 사진처럼
#   나왔음. 뉴스 웹툰인데 사진처럼 보이면 실존 인물로 오인될 위험이
#   커서 위험하다 판단, 폐기.
# 겪었던 문제 2: 그래서 "flat cel-shading, 2-3톤만, painterly 금지"로
#   확 눌렀더니 이번엔 품질이 너무 단순해짐. "실사냐 아니냐"와
#   "디테일이 많냐 적냐"는 다른 축이라는 걸 여기서 깨달음.
# 최종 해법: 역사로 프로젝트(마스터DB
#   03_개발·프롬프트/웹툰_이미지생성_참고(역사로)/generate.py, 이 저장소
#   바깥)의 "Kingdom(킹덤)급 프리미엄 웹툰" 스타일을 참고 — 디테일은
#   최대로 유지하되 "이건 손으로 그린 일러스트다"라는 지시를 명시해서
#   실사화를 막았다. 디테일과 실사 여부는 별개 축이라는 게 핵심 교훈.

STYLE = (
    "Premium Korean webtoon illustration (Kingdom/킹덤-level production "
    "quality) — ultra-detailed ink linework, rich painterly color fills "
    "with nuanced shading and texture, cinematic panel composition. This "
    "is a hand-illustrated artwork — clearly rendered with visible "
    "brushwork and linework, NOT a photograph, NOT photorealistic, NOT "
    "camera-captured.\n\n"
    "Masterpiece-level illustrated detail: fabric texture on suits, wood "
    "grain on desks, glass/metal reflections — all rendered as painterly "
    "linework and color, not photographic texture. Soft cinematic "
    "lighting — directional light with gentle shadow falloff, believable "
    "depth between foreground/midground/background. Highly expressive "
    "but professional, restrained faces; natural body language that "
    "reads clearly at a glance (not exaggerated melodrama — this is a "
    "news setting, not battle drama).\n\n"
    "Rich, grounded color palette: cool corporate blues/grays, warm "
    "desk-lamp amber, crisp window light — editorial documentary mood.\n\n"
    "Anonymous generic characters only — do NOT render the specific "
    "likeness of any real public figure; faces should read as illustrated "
    "original characters, not a portrait of someone identifiable.\n\n"
    "Any readable text inside a prop (document, poster, screen, chart, "
    "sign, table) must come ONLY from the text explicitly given in this "
    "prompt's [SCENE]/[CAPTION BOX]/[NARRATION]/speech bubble content. "
    "Never invent additional readable text — no invented company names, "
    "prices, dates, phone numbers, or stats. If a prop would otherwise "
    "need text that wasn't given, render it blank, blurred, or angled "
    "away from camera instead of inventing content."
)

BUBBLE_RULES = (
    "\n\n[SPEECH BUBBLES — CRITICAL]\n"
    "Bold Korean gothic font, high contrast black text, fully legible. "
    "Position upper/side areas — never cover faces or key action.\n"
    "Bubble shape depends on tone:\n"
    "  - 보통 (default): crisp white fill, clean 3px black outline, "
    "smooth rounded edges, tail pointing precisely at the speaker's mouth.\n"
    "  - 격앙: jagged spiky burst outline (explosion/shout-bubble shape), "
    "same white fill and bold text, tail still pointing at the speaker's "
    "mouth. Only for bubbles marked 격앙 below — never make every bubble "
    "in the cut spiky.\n"
)

# 2026-08-20: 복학왕 등 실제 웹툰 컷 분석에서 확인 — 평범한 대사는 매끈한
# 타원 말풍선, 놀람·흥분한 대사는 삐죽삐죽한 폭발형 말풍선으로 톤을
# 구분해서 그린다. 1단계 스크립트의 dialogue[].tone("보통"|"격앙")을
# 그대로 받아 여기서 형태를 갈라 그리게 지시한다.
def bubbles(*pairs):
    """말풍선 렌더링 지시문. pairs = [("A", "대사", "보통"), ("B", "대사", "격앙")]
    하위 호환: tone 없이 ("A", "대사") 2-tuple로 불러도 "보통"으로 처리."""
    normalized = [(p[0], p[1], p[2] if len(p) > 2 else "보통") for p in pairs]
    lines = [f'  [{spk}] tone={tone}: 「{line}」' for spk, line, tone in normalized]
    return BUBBLE_RULES + f"Draw exactly {len(normalized)} speech bubble(s):\n" + "\n".join(lines)


def caption(text):
    """캡션 박스 렌더링 지시문."""
    return f"\n\n[CAPTION BOX]\nSmall caption box text: 「{text}」"


# 2026-08-20: 컷1·컷8의 narration이 "컨텍스트로만 쓰고 말풍선으로 렌더하지
# 말라"는 지시만 있고 "그럼 어떻게 보여줄지"가 없어서, 실제로는 화면에
# 전혀 안 보이는 버그가 있었다(1단계 스크립트엔 있는데 이미지엔 텍스트가
# 없음). caption()처럼 명시적으로 화면에 그리라는 지시를 준다 — 다만
# 캡션(작은 수치 박스)과는 다른 자리·다른 스타일(다큐 타이틀 카드 느낌)로.
def narration(text):
    """내레이션(컷1·컷8) 렌더링 지시문 — 다큐 톤 타이틀 카드처럼 화면에 표시."""
    return (
        "\n\n[NARRATION TEXT — CRITICAL]\n"
        "This is NOT a speech bubble. Render it as a documentary-style "
        "title card: clean sans-serif Korean text, no bubble outline, "
        "placed in a calm empty area of the frame (e.g. lower third or "
        "upper third), subtle dark scrim behind it for legibility. "
        f"Render the Korean text EXACTLY as given: 「{text}」"
    )
