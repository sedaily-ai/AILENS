## 설명

기사 원문을 8컷 뉴스 웹툰(인스타그램·웹용)으로 변환하는 프롬프트. 웹툰은
"서사와 장면"을 다룬다 — 정보를 나열하는 게 아니라, 독자가 다음 컷을 넘기게
만드는 이야기다. 3단계로 진행한다: 1단계 스크립트(대사·내레이션·캡션) →
2단계 연출(카메라 앵글·장면 묘사) → 3단계 이미지 생성(GPT 이미지 API).
입력은 0단계(사실 추출)에서 만든 facts.json.

## 지침

**서사 구조 (최우선)** — 8컷은 정보 8개의 나열이 아니라 하나의 이야기다.

1. 축이 되는 질문 하나를 정한다. 컷1~3에서 열고, 컷7에서 답하거나 뒤집는다.
   예: "왜 60년 동안 아무도 안 팠나"
2. 순서를 바꿔도 어색하지 않다면 흐름이 없는 것이다. 각 컷은 앞 컷 때문에
   성립해야 한다.
3. 버릴 컷이 없어야 한다. 완성 후 각 컷을 빼봤을 때 구멍이 나는지 확인한다.
   빼도 되는 컷이 있으면 다시 쓴다.

**1단계 출력 — 반드시 JSON**
```json
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
      "title": "",
      "title_keyword": "",
      "narration": "",
      "caption": "",
      "dialogue": [{ "speaker": "A", "line": "", "tone": "보통" }],
      "fact_ids": [8]
    },
    {
      "cut": 8,
      "title": "",
      "closing_caption": "",
      "caption": "",
      "dialogue": [{ "speaker": "A", "line": "", "tone": "보통" }],
      "fact_ids": [8]
    }
  ]
}
```
인물 없는 소재는 characters를 null, dialogue를 빈 배열로. fact_ids는 이
컷이 담은 facts.json의 id 배열.

**title(2026-09-08 추가)** — 컷마다 화면 상단에 고정 배치되는 짧은
제목. 12자 이내(공백 포함), 한 줄. 제목만 순서대로 이어 읽어도 이야기의
흐름이 드러나야 한다("공급 대책, 왜?" → "재고는 쌓이는데" → "그런데
안 팔린다" 처럼). 같은 문장 구조를 반복하지 않는다. 대사나 캡션과 같은
말을 반복하지 않는다.

컷1은 다른 컷과 렌더링이 다르다(compose_text.py::draw_cover_header) —
"서울경제 웹툰" 브랜드 라벨 + 큰 흰색 헤드라인 박스로 표지처럼 그려진다.
그래서 컷1의 title은 다른 컷보다 조금 길어도(표지 헤드라인이니 20자
안팎까지 허용) 되고, 핵심 수치나 키워드 하나를 반드시 포함한다(예:
"한·프 8천억, 영화판 바꿀까?"). 컷2~8의 title은 짙은 빨강/짙은 남색
알약으로 번갈아 그려진다(compose_text.py의 title_fill_for_cut() 표 —
2·3·5·7·8은 빨강, 4·6은 남색. 이 색 배정은 admin이 편집할 필요 없는
렌더링 상수라 여기서 더 손댈 게 없다).

**title_keyword(2026-09-08 추가, 컷1 전용)** — 컷1 title(헤드라인) 안에서
빨간색으로 강조할 부분 문자열. title에 실제로 등장하는 문자열 그대로
넣는다(예: title="한·프 8천억, 영화판 바꿀까?"라면 title_keyword="8천억").
보통 기사의 핵심 수치나 가장 중요한 단어 하나. title 안에 없는 문자열을
넣으면 강조가 적용되지 않고 그냥 무시된다(compose_text.py가 in 검사로
찾는다) — 없어도 되는 필드지만, 있으면 표지 임팩트가 확실히 산다.

**closing_caption(2026-09-08 추가, 컷8 전용)** — 컷8은 narration 대신
이 필드를 쓴다(같은 컷에 둘 다 넣지 않는다 — compose_text.py가 컷8에서
closing_caption을 받으면 narration을 무시한다). 25자 이내, 한 줄.
- 앞에서 나온 대사·캡션을 그대로 반복하지 않는다.
- 기사의 핵심 결론·남은 과제·앞으로 확인할 문제 중 하나를 제시한다.
- 한쪽 입장을 정답처럼 단정하지 않는다.
- 숫자는 가급적 넣지 않는다.
- 좋은 예: "이제 관건은 약속을 현실로 옮기는 일이다", "제도의 효과는
  현장에서 다시 확인해야 한다"
- 나쁜 예: "정부는 후속 지원 방침을 밝혔다"(사실 재진술), 대사와 같은
  문장을 짧게 반복한 것, 기사에 없는 평가·전망을 단정한 문장

`tone`은 "보통" 또는 "격앙"만 쓴다. "격앙"은 놀람·충격·흥분처럼 목소리가
커지는 대사에만 붙인다(예: "60년을 그냥 둔 거네?!"). 이 값이 2단계·3단계로
그대로 넘어가 말풍선 모양을 바꾼다 — 아래 "말풍선 톤" 참고. 한 컷 안의
두 대사를 전부 "격앙"으로 두지 않는다(§대사 규칙 1의 기능 대비와 같은
이유 — 둘 다 흥분하면 대비가 안 산다).

**2단계 출력 — 반드시 JSON**
```json
{
  "scenes": [
    { "cut": 1, "camera": "부감 와이드", "scene": "장면 묘사" }
  ]
}
```

**2단계 연출 원칙**

1. 컷마다 앵글을 바꾼다. 같은 구도를 연속으로 쓰지 않는다.
   와이드 → 클로즈업 → 오버숄더 → 부감 → 인서트
2. 대사가 있는 컷은 화자의 표정·손짓이 대사와 맞물리게. 놀라는 대사에
   무표정을 그리지 않는다.
3. 컷1과 컷8은 상징적 장면. 인물 없이 공간이나 사물만 써도 좋다.
4. 인서트 컷을 최소 1개 넣는다. 손에 든 서류, 화면 속 그래프, 창밖 풍경
   같은 것.
5. 스크립트에 없는 사건·수치를 장면에 만들지 않는다.
6. 실존 인물의 얼굴·외형을 지정하지 않는다.
7. 실제 기업 로고, 상표, 기관 표식을 그리지 않는다.
8. 인서트로 서류·포스터·화면·표 같은 "읽을 수 있는 텍스트가 있는 소품"을
   넣을 때는, 그 안에 들어갈 구체적 텍스트(제목·수치·업체명·날짜·연락처
   등)까지 장면 묘사에 명시한다. "빵집 목록이 적힌 서류" 처럼 뭉뚱그려
   묘사하면 이미지 생성 단계에서 그 안의 텍스트를 마음대로 지어낸다 —
   실제로 라운드3에서 원문에 없는 가짜 업체명 3개와 가짜 매장 사진이
   담긴 문서를 통째로 만들어낸 적이 있다. 소품에 텍스트를 넣고 싶은데
   구체적으로 정할 게 없으면, 텍스트 없는 소품(빈 문서, 흐릿한 화면)으로
   바꾸거나 아예 넣지 않는다.

### 절대 원칙 (모든 포맷 공통)

1. 각 포맷은 독립된 완결물이다. 하나만 봐도 이해돼야 한다.
2. 같은 사실을 다른 층위에서 다룬다. 같은 논리 전개를 반복하지 않는다.
3. 원문에 없는 것은 만들지 않는다. 웹툰 대사만 예외이나, 대사가 담는
   사실은 반드시 원문에 있어야 한다.

### 가장 중요한 것

대사는 정보 전달 수단이 아니다. 사람이 하는 말이다.

나쁜 예 — 정보를 그냥 읽는 대사:
- A: "누적 170억 원이에요."
- B: "네, 상당한 금액이네요."

좋은 예 — 사람이 반응하는 대사:
- A: "여기 폐광된 게 1965년이래요."
- B: "60년을 그냥 둔 거네."
- A: "다들 다 캤다고 생각했으니까요."

뒤쪽은 숫자를 말하는 게 아니라 그 숫자가 무슨 뜻인지를 말한다.

### 대사 규칙

0. (2026-09-08 추가) 그 컷에서 먼저 말하는 화자를 dialogue 배열의 첫
   번째로 둔다. 한국어 독자는 오른쪽에서 왼쪽으로 읽는 흐름에 익숙하므로,
   compose_text.py가 dialogue[0]을 화면 오른쪽에 배치한다 — 배열 순서 =
   말하는 순서 = 오른쪽부터 왼쪽 순서. 인물 위치를 8컷 내내 고정하지
   않는다: 질문하는 인물이 먼저 말하면 그 컷에선 질문하는 인물이
   dialogue[0]이다.
1. 한 컷의 두 대사는 서로 다른 일을 해야 한다 — 한 사람이 사실을 말하면
   다른 사람은 의미를 짚는다. 한 사람이 놀라면 다른 사람은 놀랄 일이 아닌
   이유를 댄다. 한 사람이 결론을 내려 하면 다른 사람은 유보한다.
2. 맞장구만으로 이뤄진 대사 금지. "네", "그렇군요", "맞아요"에는 반드시
   새 정보나 새 각도를 붙인다.
3. 질문-답변 구조를 8컷 내내 반복하지 않는다. 최소 3컷은 질문 없이 진행한다.
4. 숫자를 그대로 읽지 않는다. ✗ "1t당 46g이에요" → ✓ "보통 3g만 나와도
   캘 만하다고 하거든요"
5. 모르는 건 모른다고 하게 한다. "그건 아직 안 나왔어요", "저도 처음엔
   안 믿었고요" — 전지적 해설자 두 명이 대화하면 사람 같지 않다.
6. 말풍선 1개 35자 이내. 한 컷에 최대 2개.
7. 각 대사는 원문의 사실 하나 이상을 담는다. 자연스럽게 만든다는 명목으로
   원문에 없는 개인사, 감상, 잡담을 넣지 않는다.
8. 완성 후 facts.json의 core 사실과 대조한다. 빠진 core 사실이 있으면
   흐름보다 사실을 우선해 재배치한다.
9. 정보를 요약해서 되읽는 대사 금지. B가 방금 캡션·내레이션에 나온 사실을
   다른 말로 바꿔 말하기만 하면 안 된다 — 새로운 해석, 감정 반응, 다음
   질문 중 하나를 반드시 더한다.
   ✗ A: "정선에서는 빵트레일런도 한다고요." B: "트레일런과 빵의 조합이라니
   신선하네요." — B가 그냥 감탄만 하고 새 정보가 없다.
   ✓ A: "정선에서는 빵트레일런도 한다고요." B: "완주 못해도 체크포인트마다
   빵을 나눠준대요. 그러니 부담 없이 나가는 거죠."
   같은 이유로 "~네요/~군요/~죠"로만 끝나는 리액션이 3컷 이상 연속되면
   안 된다 — 매 컷 반응 어미가 겹치는지 스스로 확인한다.
10. A·B의 말투 격식도 대비시킨다. 기능이 다르면(1번 규칙) 말투도 다르게
    들려야 자연스럽다 — 한쪽만 감탄사·느낌표가 많은 리액션형이면, 다른
    쪽은 짧고 단정적인 진술형으로 쓴다.
    예: A(리액션형) "헐, 60년을?!" / B(단정형) "네. 그냥 방치된 거예요."
    두 사람 다 같은 어조·같은 문장 길이로 말하면 그림이 달라도 목소리가
    안 들린다.

**출력 전 자가 점검(필수)**: 초안을 다 쓴 뒤, 문서 맨 아래 체크리스트
전 항목에 컷별로 대조한다. 위반한 컷이 있으면 그 컷만 다시 써서
통과시킨 뒤에 최종본을 출력한다 — 점검 과정 자체는 출력하지 않는다.

### 인물 설정

인물은 매 편 새로 정한다. 고정 캐릭터가 아니다. 뉴스는 매일 소재가
바뀌므로 같은 인물이 계속 나오면 어색하다. 기사 소재에 어울리는 익명
인물 2명을 설정하되:

| 소재 유형 | 인물 처리 |
|---|---|
| 생활밀착 | 해당 정보가 필요한 익명 일반인 |
| 산업거시 | 관련 분야 익명 실무자 |
| 사건사고 | 인물 없음. 상황·사물 중심, 캡션만 |
| 인물정치 | 인물 없음. 실존 인물 묘사 금지 |

인물을 쓰는 경우, 8컷 내내 같은 두 사람을 유지한다. 스크립트 맨 앞에
인물 묘사를 명시하고 모든 컷에서 반복한다.

### 내레이션·캡션

내레이션: 컷1에 배치(2026-09-08부터 컷8은 narration 대신 closing_caption을
쓴다 — 위 "closing_caption" 절 참고). 그 외 최대 1개. 다큐 톤, 감정 없이
사실만. 대사로 풀 수 있는 내용을 내레이션에 넣지 않는다.

캡션 박스: 전체 2~3개. 여기에 수치를 넣는다 — 말풍선이 아니라 캡션이
숫자를 맡는다. 12자 이내. "1t당 46.10g", "1965년 폐광".

### 사실 규칙

- 원문에 없는 사실·수치·발언을 만들지 않는다
- 확정된 사실과 검토 단계 내용을 구분한다
- 실명 개인을 조롱하거나 단정 비난하지 않는다
- 입장이 갈리는 사안은 한쪽 주장을 결론처럼 쓰지 않는다
- 인물의 대사는 창작이지만, 대사가 담는 사실은 원문에 있어야 한다

### 3단계 — 이미지 생성 스타일 (참고용, 이미지 생성 API 호출 코드가 사용)

```python
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
    "institutional insignia anywhere in frame.\n\n"
    "Any readable text inside a prop (document, poster, screen, chart, "
    "sign, table) must come ONLY from the text explicitly given in this "
    "prompt's [SCENE]/[CAPTION BOX]/speech bubble content. Never invent "
    "additional readable text — no invented company names, prices, "
    "dates, phone numbers, or stats. If a prop would otherwise need "
    "text that wasn't given, render it blank, blurred, or angled away "
    "from camera instead of inventing content."
)

BUBBLE_RULES = (
    "\n\n[SPEECH BUBBLES — CRITICAL]\n"
    "Korean manhwa style, bold Korean gothic font, high contrast black "
    "text, fully legible. Render the Korean text EXACTLY as given — do "
    "not paraphrase, do not alter any character or number. Position in "
    "upper or side areas — never cover faces or key action.\n"
    "Bubble shape depends on tone (1단계 JSON의 dialogue[].tone):\n"
    "  - 보통 (default): crisp white fill, clean 3px black outline, "
    "smooth rounded oval edges, tail pointing precisely at the "
    "speaker's mouth.\n"
    "  - 격앙: jagged spiky burst outline (explosion-shape, like a "
    "shout bubble), same white fill and bold text, tail still pointing "
    "at the speaker's mouth. Use only when tone is 격앙 — never make "
    "every bubble in a cut spiky.\n"
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
```

생성 1024x1536 → 크롭 1080x1350(인스타 4:5). 컷당 약 $0.165, 8컷 기준
건당 약 $1.3.

### 체크리스트

- 축이 되는 질문이 있고, 컷7에서 회수되는가
- 컷 순서를 바꾸면 어색해지는가
- 빼도 되는 컷이 없는가
- 한 컷의 두 대사가 서로 다른 일을 하는가
- 맞장구만 하는 대사가 없는가
- 질문 없이 진행되는 컷이 3개 이상인가
- 수치가 캡션에 있고 말풍선에 없는가
- 원문에 없는 개인사·잡담이 없는가
- facts.json의 core 사실을 담았는가
- 소재 유형에 맞는 인물 처리인가
- 컷마다 앵글이 다른가
- 인서트 컷이 있는가
- "~네요/~군요/~죠" 리액션이 3컷 이상 연속되지 않는가
- 상대 대사를 요약해서 되읽기만 하는 대사가 없는가
- A·B 말투 격식이 대비되는가(둘 다 같은 톤으로 말하지 않는가)
- tone: 격앙을 남발하지 않았는가(한 컷 안에서 둘 다 격앙이 아닌가, 전체
  8컷 중 격앙이 1~2개를 크게 넘지 않는가 — 전부 소리치면 대비가 안 산다)
- 모든 컷에 title이 있고 12자 이내인가, 제목만 이어 읽어도 흐름이
  드러나는가(2026-09-08 추가)
- dialogue[0]이 그 컷에서 먼저 말하는(=화면 오른쪽) 화자인가(2026-09-08
  추가)
- 컷8에 narration 대신 closing_caption이 있고 25자 이내인가, 대사·캡션과
  중복되지 않는가(2026-09-08 추가)
- 컷1 title에 핵심 수치·키워드가 들어있고, title_keyword가 그 title 문자열
  안에 실제로 등장하는가(2026-09-08 추가)