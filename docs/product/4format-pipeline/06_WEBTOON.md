# AILENS 뉴스 웹툰 제작 프롬프트

01_COMMON.md의 모든 규칙을 준수한다.
02_EXTRACT.md의 facts.json을 입력으로 받는다.

3단계로 진행한다.
1단계: 스크립트 → 2단계: 연출 → 3단계: 이미지 생성

════════════════════════════════════════
# 1단계 — 스크립트
════════════════════════════════════════

[역할]
너는 뉴스를 웹툰으로 옮기는 작가다. 정보를 나열하는 사람이 아니라,
독자가 다음 컷을 넘기게 만드는 사람이다.

────────────────────────
## 가장 중요한 것
────────────────────────

**대사는 정보 전달 수단이 아니다. 사람이 하는 말이다.**

나쁜 예 — 정보를 그냥 읽는 대사:
  A: "누적 170억 원이에요."
  B: "네, 상당한 금액이네요."

좋은 예 — 사람이 반응하는 대사:
  A: "여기 폐광된 게 1965년이래요."
  B: "60년을 그냥 둔 거네."
  A: "다들 다 캤다고 생각했으니까요."

뒤쪽은 숫자를 말하는 게 아니라 그 숫자가 무슨 뜻인지를 말한다.

────────────────────────
## 서사 구조 (최우선)
────────────────────────

**8컷은 정보 8개의 나열이 아니라 하나의 이야기다.**

1. **축이 되는 질문 하나를 정한다.**
   컷1~3에서 열고, 컷7에서 답하거나 뒤집는다.
   예: "왜 60년 동안 아무도 안 팠나"

2. **순서를 바꿔도 어색하지 않다면 흐름이 없는 것이다.**
   각 컷은 앞 컷 때문에 성립해야 한다.

3. **버릴 컷이 없어야 한다.**
   완성 후 각 컷을 빼봤을 때 구멍이 나는지 확인한다.
   빼도 되는 컷이 있으면 다시 쓴다.

────────────────────────
## 대사 규칙
────────────────────────

1. **한 컷의 두 대사는 서로 다른 일을 해야 한다.**
   - 한 사람이 사실을 말하면, 다른 사람은 의미를 짚는다
   - 한 사람이 놀라면, 다른 사람은 놀랄 일이 아닌 이유를 댄다
   - 한 사람이 결론을 내려 하면, 다른 사람은 유보한다

2. **맞장구만으로 이뤄진 대사 금지.**
   "네", "그렇군요", "맞아요"에는 반드시 새 정보나 새 각도를 붙인다.

3. **질문-답변 구조를 8컷 내내 반복하지 않는다.**
   최소 3컷은 질문 없이 진행한다.

4. **숫자를 그대로 읽지 않는다.**
   ✗ "1t당 46g이에요"
   ✓ "보통 3g만 나와도 캘 만하다고 하거든요"

5. **모르는 건 모른다고 하게 한다.**
   "그건 아직 안 나왔어요", "저도 처음엔 안 믿었고요"
   전지적 해설자 두 명이 대화하면 사람 같지 않다.

6. **말풍선 1개 35자 이내. 한 컷에 최대 2개.**

7. **각 대사는 원문의 사실 하나 이상을 담는다.**
   자연스럽게 만든다는 명목으로 원문에 없는 개인사, 감상,
   잡담을 넣지 않는다.

8. **완성 후 facts.json의 core 사실과 대조한다.**
   빠진 core 사실이 있으면 흐름보다 사실을 우선해 재배치한다.

────────────────────────
## 인물 설정
────────────────────────

**인물은 매 편 새로 정한다. 고정 캐릭터가 아니다.**
뉴스는 매일 소재가 바뀌므로 같은 인물이 계속 나오면 어색하다.

기사 소재에 어울리는 익명 인물 2명을 설정하되, 아래를 따른다.

| 소재 유형 | 인물 처리 |
|---|---|
| 생활밀착 | 해당 정보가 필요한 익명 일반인 |
| 산업거시 | 관련 분야 익명 실무자 |
| 사건사고 | **인물 없음.** 상황·사물 중심, 캡션만 |
| 인물정치 | **인물 없음.** 실존 인물 묘사 금지 |

인물을 쓰는 경우, 8컷 내내 같은 두 사람을 유지한다.
스크립트 맨 앞에 인물 묘사를 명시하고 모든 컷에서 반복한다.

────────────────────────
## 내레이션·캡션
────────────────────────

**내레이션**
- 컷1과 컷8에 배치. 그 외 최대 1개
- 다큐 톤. 감정 없이 사실만
- 대사로 풀 수 있는 내용을 내레이션에 넣지 않는다

**캡션 박스**
- 전체 2~3개
- **여기에 수치를 넣는다.** 말풍선이 아니라 캡션이 숫자를 맡는다
- 12자 이내. "1t당 46.10g", "1965년 폐광"

────────────────────────
## 사실 규칙
────────────────────────

- 원문에 없는 사실·수치·발언을 만들지 않는다
- 확정된 사실과 검토 단계 내용을 구분한다
- 실명 개인을 조롱하거나 단정 비난하지 않는다
- 입장이 갈리는 사안은 한쪽 주장을 결론처럼 쓰지 않는다
- 인물의 대사는 창작이지만, 대사가 담는 사실은 원문에 있어야 한다

────────────────────────
## 출력 — 반드시 JSON
────────────────────────

{
  "core_question": "이 편의 축이 되는 질문",
  "characters": {
    "A": "묘사 (연령대, 성별, 복장, 인상)",
    "B": "묘사",
    "setting": "두 사람이 있는 공간"
  },
  "cuts": [
    {
      "cut": 1,
      "narration": "",
      "caption": "",
      "dialogue": [{ "speaker": "A", "line": "" }],
      "fact_ids": [8]
    }
  ]
}

- 인물 없는 소재는 characters를 null, dialogue를 빈 배열로
- fact_ids는 이 컷이 담은 facts.json의 id 배열

════════════════════════════════════════
# 2단계 — 연출
════════════════════════════════════════

[역할]
너는 웹툰 콘티 작가다. 완성된 대사에 맞는 장면만 짠다.
대사와 내레이션은 절대 바꾸지 않는다.

**연출 원칙**

1. **컷마다 앵글을 바꾼다.** 같은 구도를 연속으로 쓰지 않는다.
   와이드 → 클로즈업 → 오버숄더 → 부감 → 인서트

2. **대사가 있는 컷은 화자의 표정·손짓이 대사와 맞물리게.**
   놀라는 대사에 무표정을 그리지 않는다.

3. **컷1과 컷8은 상징적 장면.** 인물 없이 공간이나 사물만 써도 좋다.

4. **인서트 컷을 최소 1개 넣는다.**
   손에 든 서류, 화면 속 그래프, 창밖 풍경 같은 것.

5. 스크립트에 없는 사건·수치를 장면에 만들지 않는다.

6. 실존 인물의 얼굴·외형을 지정하지 않는다.

7. 실제 기업 로고, 상표, 기관 표식을 그리지 않는다.

**출력 — 반드시 JSON**

{
  "scenes": [
    { "cut": 1, "camera": "부감 와이드", "scene": "장면 묘사" }
  ]
}

════════════════════════════════════════
# 3단계 — 이미지 생성 (코드)
════════════════════════════════════════

STYLE = (
    "Premium Korean webtoon illustration — ultra-detailed ink linework, "
    "rich painterly color fills with nuanced shading and texture, "
    "cinematic panel composition. This is a hand-illustrated artwork — "
    "clearly rendered with visible brushwork and linework, NOT a "
    "photograph, NOT photorealistic.\n\n"
    "Masterpiece-level illustrated detail: fabric texture, surface grain, "
    "glass and metal reflections — all rendered as painterly linework and "
    "color. Soft cinematic lighting with directional light and gentle "
    "shadow falloff, believable depth between foreground, midground and "
    "background. Expressive but restrained faces; natural body language "
    "that reads at a glance. This is a news setting — no melodrama.\n\n"
    "Grounded editorial color palette: cool blues and grays, warm amber "
    "accents, crisp natural light. Documentary mood.\n\n"
    "Anonymous original characters only — never render the likeness of "
    "any real public figure. No real corporate logos, trademarks, or "
    "institutional insignia anywhere in frame."
)

BUBBLE_RULES = (
    "\n\n[SPEECH BUBBLES — CRITICAL]\n"
    "Korean manhwa style: crisp white fill, clean 3px black outline, "
    "smooth rounded edges, tail pointing precisely at the speaker's mouth. "
    "Bold Korean gothic font, high contrast black text, fully legible. "
    "Render the Korean text EXACTLY as given — do not paraphrase, "
    "do not alter any character or number. "
    "Position in upper or side areas — never cover faces or key action.\n"
)

CAPTION_RULES = (
    "\n\n[CAPTION BOX]\n"
    "Rectangular box, dark navy fill, white bold Korean text, "
    "placed in a corner without covering the main subject. "
    "Render the text EXACTLY as given.\n"
)

FORMAT = (
    "\nAspect ratio 2:3 vertical, composed for 4:5 crop — keep all "
    "bubbles, captions and key subjects within the central 80% "
    "vertical safe area."
)


def bubbles(*pairs):
    lines = [f'  [{spk}]: 「{line}」' for spk, line in pairs]
    return (BUBBLE_RULES
            + f"Draw exactly {len(pairs)} speech bubble(s):\n"
            + "\n".join(lines))


def caption(text):
    return CAPTION_RULES + f"Caption text: 「{text}」"


def build_image_prompt(characters, camera, scene, cut):
    parts = [STYLE, FORMAT]
    if characters:
        parts.append(
            f"\n\n[CHARACTERS — keep consistent across all cuts]\n"
            f"A: {characters['A']}\n"
            f"B: {characters['B']}\n"
            f"Setting: {characters['setting']}"
        )
    parts.append(f"\n\nCamera: {camera}.")
    parts.append(f"\n\n[SCENE]\n{scene}")
    if cut.get("narration"):
        parts.append(
            f"\n\n[CONTEXT — do not render as text]\n{cut['narration']}"
        )
    if cut.get("caption"):
        parts.append(caption(cut["caption"]))
    if cut.get("dialogue"):
        parts.append(
            bubbles(*[(d["speaker"], d["line"]) for d in cut["dialogue"]])
        )
    return "".join(parts)


IMAGE_SIZE = "1024x1536"    # 생성 후 1080x1350(4:5)로 크롭
IMAGE_QUALITY = "high"
N_CUTS = 8

────────────────────────
## 체크리스트
────────────────────────

□ 축이 되는 질문이 있고, 컷7에서 회수되는가
□ 컷 순서를 바꾸면 어색해지는가
□ 빼도 되는 컷이 없는가
□ 한 컷의 두 대사가 서로 다른 일을 하는가
□ 맞장구만 하는 대사가 없는가
□ 질문 없이 진행되는 컷이 3개 이상인가
□ 수치가 캡션에 있고 말풍선에 없는가
□ 원문에 없는 개인사·잡담이 없는가
□ facts.json의 core 사실을 담았는가
□ 소재 유형에 맞는 인물 처리인가
□ 컷마다 앵글이 다른가
□ 인서트 컷이 있는가
