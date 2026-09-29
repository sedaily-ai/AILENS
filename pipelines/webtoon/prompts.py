"""
뉴스 웹툰 파이프라인 — 3단계(이미지 생성) 프롬프트 정의
=====================================
1·2단계(스크립트·장면연출) 지침은 여기 없다 — admin 프롬프트 드로어
("/lens" → 프롬프트 → 웹툰 탭)가 관리하는 DDB(`PROMPT#webtoon/published`)가
정본이고, `pipeline.py`가 `ddb_prompt.load_prompt("webtoon")`로 그걸 그대로
가져다 쓴다.

2026-09-04 — 3단계(STYLE/FIXED_CHARACTERS)도 이제 같은 방식으로 admin이
관리한다(`PROMPT#webtoon-image/published`, admin "이미지 실험" 패널의
"발행" 버튼). 아래 `get_style()`/`get_fixed_characters()`가 매 호출마다
DDB에서 fresh하게 읽는다 — 자세한 내용·안전망 폴백은
`pipelines/common/webtoon_image.py` 모듈 docstring 참고.

2026-08-20 이전엔 이 파일에 SCRIPT_PROMPT_TEMPLATE/SCENE_PROMPT_TEMPLATE로
1·2단계 지침이 따로 하드코딩돼 있었다 — admin에서 프롬프트를 아무리
고쳐도 이 파이프라인이 실제로 이미지를 만들 때는 그 하드코딩된 옛
버전을 계속 썼다는 뜻(발견 경위: 라운드기록.md 이슈 트래커 #11). 지금은
지웠다 — 다시 여기 하드코딩하지 말 것, DDB가 유일한 정본이어야 한다.

3단계 중 아래 BUBBLE_RULES/bubbles()/caption()/narration()만 이 파일에
코드로 남아있는 이유는 STYLE/FIXED_CHARACTERS와 다르다 — 이건 프롬프트
텍스트가 아니라 "말풍선 모양을 tone에 따라 어떻게 분기할지" 같은 실행
로직이 섞여 있어서, DB에서 문자열 하나로 뽑아 그대로 실행하기 안전하지
않다(DB에 저장된 임의 텍스트를 코드처럼 해석/실행하는 건 그 자체로
위험한 패턴이다). STYLE/FIXED_CHARACTERS 자체는 위에 적었듯 이제 DDB가
정본이라 이 경고가 더 이상 해당 안 된다 — "3단계 — 이미지 생성 스타일
(참고용)" 섹션도 폐기 대상(admin이 DB에서 직접 읽으니 별도 참고 문서가
필요 없어졌다).
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
#   후속 실측(같은 날, article.txt 샘플): 그림체(배경 톤·색감·선화)는
#   확실히 바뀌었지만, 여성 캐릭터의 안경·단발 밥컷·배지는 재강조 문구를
#   두 단계(pipeline.py의 _CHARACTER_REINFORCEMENT 참고)까지 세게
#   눌러봐도 계속 무시됐다(매번 롱헤어 K-드라마풍 얼굴로 회귀) — 반면
#   남성 캐릭터의 "짧은 머리"는 재강조로 개선됨. 문구를 더 세게(대문자
#   태그 나열) 눌렀더니 오히려 색상 자체가 사라지는 부작용까지 나서
#   그 시도는 되돌렸다. 결론: 이 모델·이 프롬프트 구조로는 안경·배지 같은
#   작은 액세서리 단위의 캐릭터 동일성까지는 보장 못 한다 — "겪었던 문제
#   3"과 같은 결의 한계로 받아들이고, 그림체 변경 + 성격 묘사(짧은 머리
#   등 큰 특징) 수준의 재강조까지만 유지한다. 완벽한 인물 동일성이
#   필요해지면 프롬프트가 아니라 "겪었던 문제 4"에서 보류한 image-editing
#   경로(OpenAI)로 가야 한다.
#
# 2026-09-05 — STYLE/FIXED_CHARACTERS 조립 로직은 common/webtoon_image.py로
# 옮겼고(admin 콘솔의 "이미지 실험" 패널도 같은 로직이 필요해져서), 2026-
# 09-04부터는 그 값 자체가 코드 상수가 아니라 admin DB 발행물이 됐다(위
# 모듈 docstring 참고) — 여기서는 그 조회 함수만 재export해서 이 파일을
# import해 쓰던 코드(pipeline.py 등)가 `prompts.get_style()`/
# `prompts.get_fixed_characters()`로 자연스럽게 쓸 수 있게 한다.
from webtoon_image import get_fixed_characters, get_style

# pyflakes에게 "재export라 이 파일 안에서 안 써도 죽은 게 아니다"를 알려준다
# (bare pyflakes는 flake8과 달리 `# noqa` 주석을 안 읽는다 — __all__만 본다).
__all__ = ["get_style", "get_fixed_characters"]

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
# 2026-09-08 — faces_left_to_right_x 필드를 제거했다. 말풍선을 얼굴 위에
# 앵커하려고 이 비전 모델에게 좌표를 추정시켰었는데, x좌표 하나뿐이고
# 세로 위치·크기 정보가 없어 정확도도 낮았다(LLM은 애초에 정밀 좌표
# 추정용이 아님). rekognition_client.detect_main_faces()(AWS Rekognition
# 전용 얼굴 감지 서비스)로 대체 — 바운딩 박스 전체(x/y/폭/높이)+신뢰도를
# 주고, 만화 일러스트에도 실측으로 잘 동작함을 확인했다(pipeline.py
# 호출부 참고). 이 프롬프트는 이제 Rekognition이 못 하는 의미적 판단
# (사극 오염·인물 없음 위반)만 담당한다.
# 2026-09-28 — 위 rekognition_client.detect_main_faces()는 이후 완전히
# 제거됐다(사용자 결정, webtoon_image.py::generate_cut_image() 독스트링
# 참고) — 이 단락은 그 기능이 있던 시절의 역사적 기록으로 남긴다.
VALIDATE_SYSTEM = (
    "당신은 뉴스 웹툰 이미지 QA 담당자입니다. 주어진 이미지 하나를 보고 "
    "아래 JSON 스키마 그대로만 응답하세요(설명 문구 없이 JSON 객체 하나만):\n"
    '{"sageuk": true|false, "no_people_violated": true|false}\n\n'
    "- sageuk: 이미지에 조선시대/사극/한복/전통 한옥 지붕 등 시대극 요소가 "
    "하나라도 보이면 true.\n"
    "- no_people_violated: [인물 없음 지시]가 주어졌는데 이미지에 사람이 "
    "보이면 true. 인물 없음 지시가 없었다면 항상 false."
)
