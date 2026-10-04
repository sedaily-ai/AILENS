"""뉴스 웹툰 파이프라인 — 3단계(이미지 생성) 프롬프트 보조 모듈.

1·2단계(스크립트·장면 연출) 지침과 3단계 STYLE/FIXED_CHARACTERS는 admin이 발행한
DDB 문서(`PROMPT#webtoon/published`, `PROMPT#webtoon-image/published`)가 정본이다.
이 파일은 조회 함수(`get_style`, `get_fixed_characters`)를 재export하고, 톤별 분기
로직이 섞여 DB 문자열로 대체할 수 없는 말풍선·캡션·내레이션 지시문만 코드로 유지한다.
"""

# 스타일 문구(STYLE)를 정할 때 확인된 제약. 문구는 DDB에서 관리하므로 변경 시 참고용으로 남긴다.
# - 실사풍("semi-photographic")은 실존 인물로 오인될 수 있어 쓰지 않는다. 다만 "flat cel-shading,
#   painterly 금지"처럼 디테일까지 눌러도 품질이 떨어진다. 실사 여부와 디테일은 별개 축이며,
#   디테일은 유지하되 "손으로 그린 일러스트"임을 명시한다.
# - "Kingdom(킹덤)" 같은 사극 레퍼런스를 넣으면 한옥·전통의상이 따라 나온다. 현대 배경·복장을
#   명시하고 사극·판타지를 금지하며, [SCENE]에 없는 군중·인물을 추가하지 않게 지시한다.
# - 확산 모델은 긴 프롬프트에서 뒤쪽 [SCENE]의 구체적 지시를 스타일 문구보다 약하게 반영한다.
#   build_background_prompt/build_image_prompt가 [SCENE] 직후에 같은 취지를 다시 한 번 둔다.
# - 안경·배지 같은 작은 액세서리 단위의 캐릭터 동일성은 프롬프트로 보장되지 않는다.
#   문구를 과하게 강조하면 오히려 색상이 사라진다.
# - 이미 그려진 컷을 레퍼런스 이미지와 함께 다시 그리는 img2img 편집 방식은 현재 구조(텍스트 설명만으로
#   각 컷을 처음부터 생성)와 다르므로 채택하지 않았다.

from webtoon_image import get_fixed_characters, get_style

# 재export 대상임을 pyflakes에 알린다(pyflakes는 `# noqa`를 읽지 않고 __all__만 본다).
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

# 평범한 대사는 매끈한 타원 말풍선, 놀람·흥분한 대사는 삐죽한 폭발형 말풍선으로 구분한다.
# 스크립트의 dialogue[].tone("보통"|"격앙")을 그대로 받아 형태를 가른다.
def bubbles(*pairs):
    """말풍선 렌더링 지시문. pairs = [("A", "대사", "보통"), ("B", "대사", "격앙")]
    하위 호환: tone 없이 ("A", "대사") 2-tuple로 불러도 "보통"으로 처리."""
    normalized = [(p[0], p[1], p[2] if len(p) > 2 else "보통") for p in pairs]
    lines = [f'  [{spk}] tone={tone}: 「{line}」' for spk, line, tone in normalized]
    return BUBBLE_RULES + f"Draw exactly {len(normalized)} speech bubble(s):\n" + "\n".join(lines)


def caption(text):
    """캡션 박스 렌더링 지시문."""
    return f"\n\n[CAPTION BOX]\nSmall caption box text: 「{text}」"


# 내레이션은 "말풍선으로 렌더하지 말라"는 지시만 주면 화면에 전혀 나오지 않는다.
# 캡션(작은 수치 박스)과 다른 자리·스타일(다큐 타이틀 카드)로 그리라고 명시한다.
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
