# 2026-09-08 웹툰 화풍 격차 해소 — Stable Image Style Guide 전환

작성: Claude Code
관련: `pipelines/webtoon/pipeline.py`, `pipelines/webtoon/compose_text.py`,
`pipelines/common/webtoon_image.py`, `pipelines/common/assets/webtoon_style_reference.png`,
`service/backend/prompts/webtoon/published.md`(admin DDB `PROMPT#webtoon/published`),
admin DDB `PROMPT#webtoon-image/published`, Bedrock application inference profile
`lens-webtoon-image-style-guide`

## 배경

전달받은 "육하원칙 기반 웹툰 프롬프트" 문서(원래는 다른 GPT에 통째로 붙여넣어
스크립트+장면+이미지를 한 번에 만드는 독립형 프롬프트)를 검토하면서 시작.
사용자가 그 문서로 뽑힌 참고 샘플(카카오톡 공유)을 실제 파이프라인 출력과
나란히 대조한 결과, 톤앤매너가 완전히 다르다는 지적을 받았다 — 화풍 자체가
"플랫 셀 채색 웹툰"이 아니라 "반실사 디지털 페인팅"으로 나오고 있었다.

## 한 것

**1단계 — 구조 이식 (참고 문서에서 안전하게 옮길 수 있는 것부터)**
- `compose_text.py`: `draw_title()`(컷별 상단 제목 알약)·`draw_cover_header()`
  (컷1 전용 "서울경제 웹툰" 브랜드 헤더 + 헤드라인 박스, 키워드 빨간 강조)·
  `draw_closing_caption()`(컷8 전용 하단 마무리 자막) 신설. `draw_dialogue()`
  폴백 순서를 좌→우에서 우→좌로 변경(한국어 읽기 흐름, dialogue[0]=오른쪽
  화자). 부수 발견 버그 수정: 격앙(폭발형) 말풍선이 텍스트를 잘라먹던 문제
  (타원이 텍스트 사각형에 내접해 있던 게 원인, inflate=1.3으로 수정).
- `published.md`(admin DDB v6→v8): 1단계 스크립트 스키마에 `title`/
  `title_keyword`/`closing_caption` 필드, "첫 화자 = dialogue[0] = 오른쪽"
  규칙, 체크리스트 갱신.
- STYLE 프롬프트(admin DDB `webtoon-image/published` v2→v3)에 "FULL COLOR,
  grayscale/sepia/pencil-sketch 금지" 강제 문구 추가 — 첫 실측에서 컷1이
  흑백으로 나온 걸 발견해서 대응.

**2단계 — 인물 묘사 재조정**
- CHARACTER_FEMALE/MALE(v3→v4)을 "단발+안경+배지"에서 참고 샘플에 맞춘
  "긴 웨이브 갈색조 머리, 안경 없음" 등 큰 특징 위주로 재작성 — 작은
  액세서리 단위 지시는 이미 이 저장소에 실패로 기록된 패턴(prompts.py
  "겪었던 문제 4")이라 반복하지 않음.

**3단계 — 근본 원인 진단과 모델 전환 (이번 세션의 핵심)**
- 2단계까지 해도 화풍 격차가 안 좁혀져서, 실제 2_scenes.json(정확히
  "사무실 회의실·화이트보드"라고 써 있음)과 실제 생성 이미지(번화가 시장
  거리)를 대조 — 모델이 [SCENE] 지시 자체를 거의 무시하고 있다는 걸
  확인(prompts.py에 이미 기록된 "겪었던 문제 3"과 동일 증상).
- 사용자가 "인물 캐릭터 디자인부터 다르다"고 재지적 — Bedrock 이미지 모델
  목록을 다시 훑다가 `stability.stable-image-style-guide-v1:0`(참고
  이미지를 화풍 기준으로 받는 모델) 발견. 단발 테스트 2회(참고 이미지 1장
  고정, 서로 다른 장면)로 화풍·인물 톤이 크게 근접함을 확인.
- 프로덕션 전환: `lens-webtoon-image-style-guide` application inference
  profile 신설(비용태깅_규칙.md 준수), 참고 이미지를
  `pipelines/common/assets/webtoon_style_reference.png`로 저장소 자산화,
  `webtoon_image.py`에 `build_style_guide_prompt()`/
  `generate_bedrock_style_guide_image_bytes()` 신설, `pipeline.py`의
  `IMAGE_PROVIDER` 기본값을 `"bedrock"`→`"bedrock-style-guide"`로 승격.
  `_generate_and_qa_cut()`이 `generate_fn` 파라미터를 받도록 일반화해서
  Core/Style Guide 둘 다 같은 QA(사극·인물오탐 검증+재생성) 구조 재사용.

## 결정

- **OpenAI 미사용, Stable Diffusion 계열 유지**(사용자 명시 결정) — 이
  제약 안에서 참고 샘플에 가장 가까운 방법을 찾는 것으로 방향을 좁혔다.
  중간에 "OpenAI 크레딧이 복구됐다"는 사실을 확인했지만 채택하지 않음.
- Style Guide 프롬프트는 `build_background_prompt()`보다 일부러 훨씬
  짧게 유지한다(스타일 힌트 한 줄 + 카메라 + [SCENE] + 짧은 내용 규칙).
  `characters_block`/`CHARACTER_REINFORCEMENT`(장문 인물 묘사)를
  일부러 안 받는다 — 참고 이미지가 이미 인물 톤을 앵커하는데 장문 텍스트를
  더 얹으면 화풍이 도로 무너지는 걸 실측으로 두 번 확인했다(아래 "시행착오"
  참고).

## 시행착오 — 같은 문제 반복하지 않기

1. **참고 이미지만으론 화풍이 안 지켜진다.** 단발 테스트 2회는 성공했는데
   (짧은 프롬프트 + "flat cel-shaded webtoon" 문구 명시), 그대로
   파이프라인에 옮기며 그 문구를 "이미지가 알아서 전달하겠지"라고 판단해
   빼고 대신 인물 묘사·재강조 텍스트를 잔뜩 붙였더니 화풍이 반실사로
   되돌아갔다(fidelity를 0.5→0.75로 올려도 마찬가지, 오히려 참고 이미지의
   "스튜디오 사진" 요소까지 강하게 전이돼 더 사진스러워짐). 원인을 좁히려고
   단일 컷 테스트를 반복한 끝에, 스타일 힌트 문구를 프롬프트 맨 앞에
   복원하고 나머지를 짧게 유지하니 다시 해결됐다. **참고 이미지는 화풍의
   "보조" 앵커일 뿐, 텍스트 스타일 지시를 대신하지 못한다 — 항상 같이 쓸 것.**
2. **`aspect_ratio` 파라미터를 빠뜨리면 1:1 정사각형으로 나온다.** 첫 통합
   실행에서 이걸 놓쳐서 컷이 정사각형으로 나왔고, 좁아진 캔버스에서
   말풍선 2개가 겹쳐 얼굴을 가리는 부수 문제까지 만들었다(compose_text.py의
   말풍선 배치가 3:2 비율 전제로 튜닝돼 있음). `BEDROCK_ASPECT_RATIO`(3:2)를
   명시적으로 넘기도록 수정.
3. **국기 등 국가 상징물이 Bedrock 콘텐츠 필터에 걸릴 수 있다.** 컷1
   장면에 "태극기와 프랑스 삼색기"가 명시돼 있었는데, 재시도 2회 모두
   동일 사유(`Filter reason: prompt`)로 실패 — 랜덤 변동성이 아니라
   결정적 콘텐츠 정책 매치로 보인다.

## 검증

- 실제 기사(서울경제 20088268, 뤼미에르 파트너십)로 8컷 파이프라인
  총 5회 반복 실행(v1 grayscale 발견 → v2 색상 수정 → v3 인물 재조정 →
  v4 Style Guide 첫 통합(화풍 실패) → v5 스타일 힌트 복원, 최종 성공).
- v5 결과: 8컷 중 7컷 성공, 화풍(플랫 셀 채색)·인물 톤·인포그래픽 통합
  전부 참고 샘플에 크게 근접 확인(사용자 확인). 1컷은 위 시행착오 3번
  사유로 실패.

## 다음

- 컷1처럼 국기·국가 상징물이 스크립트/장면에 명시되는 경우의 콘텐츠
  필터 회피 방안 필요 — "태극기와 삼색기가 나란히 선" 같은 구체적 묘사
  대신 "양국 국기가 걸린" 정도로 완화하거나, 필터 실패 시 장면 문구를
  자동으로 순화해 재시도하는 로직 추가를 검토할 것.
- 8컷 전체(지금까지는 부분 확인)로 인물 얼굴 동일성이 끝까지 유지되는지
  더 여러 편으로 검증 필요 — Style Guide도 완벽한 얼굴 고정을 보장하는
  건 아니다(참고 이미지 기반 "톤" 앵커일 뿐).
- fidelity 파라미터(현재 0.5) 최적값은 몇 편 더 뽑아보며 조정 여지 있음.
- admin "웹툰 이미지 실험(Lab)" 패널(`webtoon_lab.py`)은 여전히 Stable
  Image Core 전용 — Style Guide 실험도 필요해지면 그 도구도 확장 검토.
- `pipelines/webtoon/README.md`가 여전히 "GPT-5.5 이미지 생성"을 정본
  아키텍처로 설명하고 있어 실제와 어긋남(2026-08-23 Bedrock 전환,
  2026-09-08 Style Guide 전환 둘 다 반영 안 됨) — 다음 세션에서 문서
  갱신 필요.
