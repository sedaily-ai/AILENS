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
# 최종 해법(당시): 역사로 프로젝트(마스터DB
#   03_개발·프롬프트/웹툰_이미지생성_참고(역사로)/generate.py, 이 저장소
#   바깥)의 "Kingdom(킹덤)급 프리미엄 웹툰" 스타일을 참고 — 디테일은
#   최대로 유지하되 "이건 손으로 그린 일러스트다"라는 지시를 명시해서
#   실사화를 막았다. 디테일과 실사 여부는 별개 축이라는 게 핵심 교훈.
#
# 겪었던 문제 3 (2026-09, 기자 피드백 — 컷마다 배경·인물이 시나리오와
#   무관하게 나옴): "Kingdom/킹덤" 레퍼런스가 실제로 조선시대 사극 톤(한옥
#   거리, 전통의상)을 끌어오는 걸 실측으로 확인(같은 [SCENE]으로 그
#   레퍼런스만 빼고 재생성 → 사극 느낌 소멸). 다만 그 레퍼런스를 빼도
#   [SCENE] 지문(예: "국무회의장 부감 샷, 정장 차림 인물들")과 무관하게
#   "번화가에 젊은 남녀 클로즈업 + 군중"이라는 K-웹툰 로맨스물 정형으로
#   회귀하는 더 근본적인 문제가 남아있었음 — 확산 모델이 길고 복합적인
#   프롬프트에서 뒤쪽 [SCENE] 지문의 구체적 지시를 스타일 문구의 일반적
#   톤보다 약하게 반영하는 것으로 추정. 대응: (1) "Kingdom" 고유명사
#   제거하고 실사화 방지 지시는 그대로 유지, (2) 현대 배경·복장을
#   명시하고 사극/판타지 금지를 명문화, (3) "[SCENE]에 없는 군중·인물을
#   추가하지 말라"를 명문화, (4) build_background_prompt/build_image_prompt
#   에서 [SCENE] 직후에 같은 취지를 한 번 더 짧게 반복(끝부분 재강조).
#   완전한 해결은 아님 — 확산 모델의 복합 프롬프트 이행력 자체의 한계라
#   프롬프트만으로 100% 보장은 안 됨.
#
# 겪었던 문제 4 (2026-09-05, "다른 톤으로 가보면 어떻냐"는 별도 프롬프트
#   문서 참고 요청): 그 문서는 "이미 그려진 컷 + 스타일 레퍼런스 이미지"를
#   주고 다시 그리게 하는 img2img 편집 방식이라, 지금 구조(각 컷을 텍스트
#   설명만으로 처음부터 생성하는 Bedrock 경로)와는 아키텍처 자체가 다르다
#   — 그대로 옮기려면 OpenAI 이미지 편집 API를 되살려야 하는데 그건 이미
#   크레딧 문제로 꺼둔 경로다(위 compose_text.py 모듈 docstring 참고).
#   그 문서의 "그림체" 부분만 골라 반영한다: 흰색/밝은 회색 중심의 정돈된
#   배경, 남색·하늘색·빨간색 강조 색상, 깔끔한 검은 선화. **단, "겪었던
#   문제 2"(flat/2-3톤/painterly 금지 → 품질 단순화)를 반복하지 않도록
#   "부드러운 셀 채색"이지 "명암 없음"은 아니라는 걸 명시했다** — 실제로
#   그 문서 방식으로 뽑은 예시 결과물(사용자 확인)이 단순하지 않고 품질이
#   괜찮았어서, 이번엔 디테일을 완전히 죽이지 않는 선에서 반영.
#   같이 도입: 여성 기자(설명자)·남성 청자 고정 2인 캐릭터(FIXED_CHARACTERS
#   참조) — 기사마다 인물을 새로 짓던 것에서 "AI Lens 웹툰"이라는 하나의
#   진행자 듀오가 매번 등장하는 포맷으로 전환. 그 문서의 서울경제 배지도
#   여성 캐릭터 묘사에 텍스트로 포함(실제 로고 이미지 합성은 안 함 —
#   확산 모델이 텍스트 지시만으로 그리는 것이라 "S" 모양이 정확하지
#   않을 수 있음, 완벽 재현은 image-editing 없이는 한계가 있다).
#   그 문서의 나머지(참조 이미지 편집, 상단 빨간 타이틀바/하단 남색
#   요약바 레이아웃)는 이번에 반영 안 함 — 전자는 아키텍처 변경, 후자는
#   compose_text.py에 새 PIL 합성 함수가 필요한 별개 기능이라 범위 밖.
#
# ⚠️ 이 파일을 고치면 admin의 DDB "3단계 — 이미지 생성 스타일 (참고용)"
# 섹션도 반드시 손으로 같이 맞출 것(위 모듈 docstring 참고) — 이번
# 변경은 아직 그쪽에 반영 안 됨.

STYLE = (
    "Modern Korean webtoon illustration — clean, crisp black linework "
    "with confident, uncluttered line weight. Soft cel-shaded coloring "
    "with gentle, restrained shading (not flat single-tone, not heavy "
    "painterly texture — controlled shading that reads clearly at a "
    "glance). This is a hand-illustrated artwork — clearly rendered "
    "with visible linework, NOT a photograph, NOT photorealistic, NOT "
    "camera-captured, NOT 3D-rendered.\n\n"
    "Natural adult character proportions and clear, expressive but NOT "
    "exaggerated eyes and expressions. Professional, editorial mood — "
    "restrained faces; natural body language that reads clearly at a "
    "glance (not exaggerated melodrama — this is a news setting, not "
    "battle drama). Do NOT render in Studio Ghibli style, watercolor "
    "style, storybook/fairy-tale illustration style, or Japanese anime "
    "style. Do NOT render overly young/childlike characters, chibi/SD "
    "proportions, or 3D-rendered characters.\n\n"
    "Contemporary present-day South Korea only — modern office/newsroom "
    "interiors, business-casual or business-formal wardrobe (suits, "
    "blouses, cardigans), modern furniture and electronics. Do NOT "
    "render historical, period (Joseon-era/sageuk), fantasy, or "
    "traditional hanbok clothing or settings under any circumstance.\n\n"
    "Render exactly what [SCENE] describes and nothing more — do not "
    "add extra background crowds, bystanders, or characters beyond what "
    "[SCENE] and [CHARACTERS] specify. If [SCENE] describes an empty "
    "room, render it empty with no people.\n\n"
    "Clean, uncluttered backgrounds — white or light-gray tones, tidy "
    "and orderly, minimal background detail so the characters and any "
    "infographic elements stay the clear focus. Accent color palette "
    "centered on navy blue, sky blue, and red for emphasis elements "
    "(charts, highlights, key colors) — a crisp editorial news-content "
    "look rather than a moody cinematic one.\n\n"
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

# 2026-09-05 — 고정 진행자 2인("AI Lens 웹툰" 포맷). 기존엔 characters를
# 1단계 스크립트가 기사마다 새로 지어냈는데(아래 _characters_block
# 문서 참고 — pipeline.py), 이제 기사 내용과 무관하게 이 두 사람이 항상
# 등장한다: 여성 기자가 설명하고 남성 청자가 반응하는 고정 포맷.
# run_article()이 script.get("characters") 대신 이 값을 쓴다.
# 참고: "서울경제신문 AILens 웹툰 제작 예시.docx"의 인물 스펙을 텍스트
# 프롬프트용으로 옮김(그 문서의 image-editing 방식 자체는 아키텍처가
# 달라 채택 안 함 — 위 "겪었던 문제 4" 참고).
FIXED_CHARACTERS = {
    "A (여성 기자, 설명자)": (
        "Korean woman, early-to-mid 30s. Chin-length neat black bob "
        "haircut, thin round metal-frame glasses. Navy blazer over a "
        "light sky-blue blouse/shirt. Small white circular enamel badge "
        "on the left chest of the blazer with a simple blue stylized "
        "'S' monogram (a news outlet logo badge) — keep the badge small "
        "and consistent, never oversized, never add any other text or "
        "logo. Friendly but professional demeanor — actively gestures "
        "while explaining: pointing at documents/charts, open palm "
        "gestures, leaning toward materials. Keep face, hairstyle, "
        "glasses, and outfit IDENTICAL across every cut."
    ),
    "B (남성 청자)": (
        "Korean man, late 20s. Natural short black hair, no glasses. "
        "White t-shirt under a dark gray cardigan. No badge, no logo of "
        "any kind. Represents the reader's curiosity — reacts to what's "
        "being explained: leaning in to look at materials, tilting "
        "forward, resting chin on hand while thinking, looking "
        "surprised or curious as the scene calls for. Keep face, "
        "hairstyle, and outfit IDENTICAL across every cut."
    ),
}

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


# ─────────────────────────────────────────────────────────────
# QA(3단계 결과물 검증) — 2026-09-02 신설. 위쪽 STYLE/BUBBLE_RULES 등과
# 성격이 다르다: 저것들은 "이미지를 어떻게 그릴지" 지시하는 생성용
# 프롬프트라 admin이 편집하고 DDB의 "3단계 — 이미지 생성 스타일" 섹션과
# 반드시 동기화해야 하는데(위 모듈 docstring 참조), VALIDATE_SYSTEM은
# "이미 그려진 이미지가 괜찮은지" 판정하는 QA 전용 프롬프트라 admin
# 편집 대상이 아니고 DDB에 미러링할 필요도 없다. 위치만 다른 프롬프트
# 상수들과 통일하려고 여기로 옮겼을 뿐(pipeline.py에 있었음) — DDB
# 동기화 의무가 새로 생기는 게 아니라는 걸 명확히 해둔다.
VALIDATE_SYSTEM = (
    "당신은 뉴스 웹툰 이미지 QA 담당자입니다. 주어진 이미지 하나를 보고 "
    "아래 JSON 스키마 그대로만 응답하세요(설명 문구 없이 JSON 객체 하나만):\n"
    '{"sageuk": true|false, "no_people_violated": true|false, '
    '"faces_left_to_right_x": [0.0~1.0 사이 숫자, ...]}\n\n'
    "- sageuk: 이미지에 조선시대/사극/한복/전통 한옥 지붕 등 시대극 요소가 "
    "하나라도 보이면 true.\n"
    "- no_people_violated: [인물 없음 지시]가 주어졌는데 이미지에 사람이 "
    "보이면 true. 인물 없음 지시가 없었다면 항상 false.\n"
    "- faces_left_to_right_x: 이미지에서 뚜렷이 보이는 사람 얼굴들을 "
    "왼쪽에서 오른쪽 순서로, 각 얼굴의 가로 중심 위치를 이미지 너비 대비 "
    "0(왼쪽 끝)~1(오른쪽 끝) 사이 소수로 나열. 얼굴이 없으면 빈 배열."
)
