# 2026-08-20 4포맷 프롬프트 파이프라인 — CRUD·LLMOps 테스트·lens 에디터 전면 개편

작성: 영광 + Claude Code
관련: `admin/backend/routes/prompts.py`, `admin/frontend/src/components/PromptDrawer/`,
`admin/frontend/src/components/PostForm/LensMode.tsx`,
`service/frontend/src/app/(content)/lens/[slug]/LensViewClient.tsx`,
`service/backend/handlers/cms_posts_public.py`,
`service/backend/prompts/{letters,webtoon,podcast,video}/`,
마스터DB `03_개발·프롬프트/4포맷_파이프라인/`

## 배경

2026-08-18에 "4가지 시선(원인/공감/실무/숫자)을 레터·카드뉴스·팟캐스트·
영상 4개 출력 포맷으로 보여달라"는 국장님 지시로 정적 개념 목업을 만든
바 있다(`2026-08-18-lens-4format-concept-mockup.md`). 이번엔 그 뒤를
잇는 실제 작업 — 사용자가 "AILENS 콘텐츠 파이프라인" 프롬프트 스펙
8개 문서(00_CONTEXT~07_VERIFY, 기사 1건 → 사실추출 → 레터/웹툰/팟캐스트/
영상 4포맷 생성)를 채팅으로 전달하며 "프롬프트 넣는 공간을 만들고,
저장된 프롬프트로 실제 테스트까지 해보라"고 요청했다. 여기서 시작해
결과적으로 admin의 프롬프트 CRUD 시스템 전체 개편과 lens 편집 화면
재설계까지 이어진 하루였다.

## 한 것

### 1. 프롬프트 CRUD — 4채널 콘텐츠 채우기 + 신규 진입점

- `sedaily-mbti-admin-prompts-dev`(DynamoDB)에 letters/webtoon/podcast/video
  4개 채널 × draft/published 2스코프, 총 8건을 사용자가 준 8개 문서
  기준으로 채워 넣음(이전까지 이 4채널은 전부 빈 프롬프트였다 — 버튼만
  있고 내용 없음).
- "4가지 시선"(`lens/page.tsx`)에 그동안 없던 프롬프트 버튼 추가.
- "팟캐스트" 전용 관리 화면(`admin/frontend/src/app/(authenticated)/
  podcast/page.tsx`) 신설 — 아직 생성 파이프라인이 없어 프롬프트 편집만
  가능, Sidebar에 마이크 아이콘으로 항목 추가.

### 2. LLMOps 테스트 실행 — 프롬프트 드로어에서 바로 생성

- 백엔드: `admin/backend/routes/prompts.py`에 `handle_test` 신설 —
  `POST /admin/prompts/{category}/{name}/test`. 저장 여부와 무관하게
  지금 편집 중인 content + 붙여넣은 기사 원문을 GPT-4o에 넘겨 산출물을
  반환. `admin/backend/shared/secrets_client.py` 신규(Secrets Manager
  래퍼, ssm_client.py와 같은 5분 TTL 캐시 패턴).
- API Gateway에 라우트 직접 생성(`aws apigatewayv2 create-route`,
  기존 통합 `lgj4lzl` 재사용), Lambda 재배포.
- **IAM 권한**: `sedaily-mbti-admin-api-dev-role`에 `secretsmanager:
  GetSecretValue`(리소스: `sedaily-mbti/openai-api-key` 시크릿 하나로
  최소 권한) 추가가 필요했는데, 하네스 자체 안전장치가 IAM 변경을
  자동 승인 없이 막아 사용자가 직접 `aws iam put-role-policy` 실행 —
  실제 OpenAI 호출로 동작 확인 완료.
- 프론트: `PromptDrawer.tsx`에 "테스트 실행" 섹션(기사 원문 textarea +
  실행 버튼 + 산출물 미리보기) 추가. `adminClient.ts`에 `testPrompt()`.

### 3. 실제 산출물 검증 — 빵지순례 기사로 3개 포맷 생성 + 실물 샘플

- 사용자가 실제 기사(아고다 "빵지순례" 여행 트렌드)를 붙여주고 레터/
  웹툰/팟캐스트 3개 생성 요청(영상 제외).
- 1차 생성 후 품질 문제 발견 → 프롬프트 2차 튜닝:
  - 웹툰: "맞장구만 하는 대사 금지" 규칙에 나쁜 예/좋은 예 + 출력 전
    자가점검 지시 추가 → 재생성 결과 B의 대사가 실제로 새 정보를
    담기 시작.
  - 팟캐스트: "여러분" 완전 금지 + 자가점검(마지막에 스스로 검색해
    확인) 추가 → 재생성 결과 "여러분" 0회.
  - 레터: 분량 강제 문구 추가했으나 여전히 1000자대(목표 2000~2800자)
    — **미해결**.
- 실물 샘플까지 생성:
  - **웹툰 8컷 실제 이미지** — 마스터DB `뉴스웹툰_파이프라인` 파이프라인
    그대로 재사용(2단계 장면연출 GPT-4o + 3단계 이미지 Responses API
    `gpt-5.5` + `image_generation` 툴). 8컷 전부 성공, 컷2에서 "성심당"
    실존 브랜드명이 배경 간판에 그대로 렌더된 걸 발견 — 프롬프트에
    "실제 로고·상표 금지" 명시했음에도 완전 차단은 안 됨(README에
    이미 적혀있던 한계가 실제로 재현됨, 발행 전 육안 확인 필요).
  - **팟캐스트 실제 음성** — ElevenLabs는 계정에 후보가 2개(
    `ElevenLabs/ApiKey`, `ai-labs/elevenlabs`, 둘 다 설명/태그 없음)라
    아직 안 붙이고, 이미 계정에 있던 **AWS Polly**(한국어 Seoyeon,
    generative 엔진)로 우선 실제 mp3 생성 — 별도 키 발급 없이 동작.

### 4. lens 편집 화면 전면 개편 — "4가지 시선" → "4개 포맷"

- `LensMode.tsx` 재작성: 시선①~④(원인이 궁금한 사람 등 4개 고정
  독자-관점 라벨) → 레터/웹툰/팟캐스트/영상 4개 탭. 기사 원문을 한 번
  붙여넣고 각 탭에서 "AI로 생성"(위 LLMOps 테스트 엔드포인트 재사용)
  → 결과를 보고 직접 다듬어 저장하는 흐름.
- "웹툰 탭 누르면 웹툰을 실제로 넣을 수 있어야 한다"는 요청으로 각
  탭이 해당 채널의 실제 편집 컴포넌트를 재사용(저장 위치만 별도):
  - 웹툰 탭 — `WebtoonPanelsEditor` 그대로(이미지 업로드+캡션, 웹툰
    화면과 동일 컴포넌트).
  - 영상 탭 — `VideoMode.tsx`와 같은 YouTube URL 입력 + 썸네일 미리보기
    패턴.
  - 팟캐스트 탭 — `home-player`와 같은 "미디어 링크" 입력 패턴.
  - 레터 탭 — 문단(paragraphs) 텍스트.
- `CmsLensItem` 타입(admin + service 양쪽) 확장: `paragraphs`(레터 전용
  문단 산문), `images`(웹툰 전용 컷), `video_url`(영상 전용),
  `media_url`(팟캐스트 전용) 4개 필드 신설 — 기존 `label/question/
  bullets`는 유지(하위 호환).
- `service/backend/handlers/cms_posts_public.py`의 `_shape_lens`가
  엄격한 allowlist라 새 필드 4개를 명시적으로 추가 안 하면 공개 API
  응답에서 조용히 빠짐 — 반영.
- `LensViewClient.tsx`: 실제 미디어가 있으면(images/video_url/
  media_url) 기존 정적 목업 대신 진짜 콘텐츠 렌더 — 웹툰은 실제 컷
  이미지 순서대로, 영상·팟캐스트는 `resolveVideo()`(기존 `/video`
  페이지와 같은 유틸, 유튜브·네이버TV 지원) 기반 실제 iframe 임베드.
  없으면 기존 목업으로 자동 폴백.
- 포맷 이름 `cardnews` → `webtoon`으로 전체 통일(타입·렌더 조건·UI
  문구) — 국장님 원래 지시는 "카드뉴스"였지만, 실제로 붙인 파이프라인
  (마스터DB 뉴스웹툰_파이프라인, 오늘 만든 프롬프트)이 전부 "웹툰"
  이름이라 사용자가 이 이름으로 정정.
- **프롬프트 드로어도 4채널 탭으로** — "프롬프트가 4가지 시선 쪽에
  있어야 하는데 탭별로 구분되면 좋겠다" 지적으로 `PromptDrawer`가
  단일 `channel` 외에 `channels: {id,label}[]` prop을 받도록 확장,
  새 `ChannelTabs.tsx` 컴포넌트 추가. `/lens` 페이지의 프롬프트 버튼이
  이제 letters/webtoon/podcast/video 4개 탭을 보여준다(예전엔
  `channel="lens"`라는, 아무도 안 쓰는 빈 채널을 열고 있었음 — 실제
  "AI로 생성"이 읽는 프롬프트와 불일치했던 버그).

### 5. 프롬프트 섹션 모델 개편 — 설명/구조/지침 → 설명/지침/파일

- "구조"가 "지침"과 경계가 흐릿해 실질적으로 항상 같이 채워짐 → 없애고
  그 내용을 "지침" 앞부분으로 병합.
- 빈 자리에 "파일"(attachments 전용) 섹션 신설 — 참고 문서 첨부용,
  본문은 비워둬도 됨. `admin/frontend/src/lib/prompt.ts`의
  `PromptSectionKey`/`SECTION_DEFS`/`HEADING_BY_LABEL`/`presetFromProse`
  정규식 전부 수정.
- 이미 저장해둔 8건(4채널×2스코프)도 새 2헤딩(`## 설명`/`## 지침`)
  구조로 재작성해 재저장 — 옛 `## 구조` 헤딩을 그대로 뒀으면 파서가
  못 알아보고 그 내용이 엉뚱하게 "설명" 섹션에 붙어버렸을 것.

### 6. 원본·폴백 저장 (이 문서 작성 계기)

사용자가 "이거 docs 쪽에 잘 저장되어 있나?" 질문 — DynamoDB에만 있고
repo엔 전혀 없던 걸 확인하고 아래 3곳에 정리:

- 원본 8개 문서(00~07) → 마스터DB `03_개발·프롬프트/4포맷_파이프라인/`
  + `README.md`(운영 버전과의 차이, DDB/파일시스템 이원화 구조 설명).
- 파일시스템 폴백 → `service/backend/prompts/{letters,webtoon,podcast,
  video}/published.md` 신설. `prompt_loader.py`가 원래 "DDB 우선,
  장애 시 `prompts/<category>/<name>.md` 폴백"으로 설계돼 있었는데(
  question/chatbot은 이미 이 패턴), 오늘 만든 4채널은 DDB에만 있고
  폴백 파일이 없어 DDB 장애 시 그냥 죽는 상태였다 — 이번에 채움.
  ⚠️ admin에서 프롬프트를 고쳐도 이 파일은 자동으로 안 바뀐다 — 수동
  동기화 필요(README에 명시).
- 이 worklog.

## 결정

- 웹툰 3단계(이미지 생성)는 이미 검증된 마스터DB 파이프라인 로직을
  그대로 재사용 — 새로 설계하지 않음(STYLE·BUBBLE_RULES 텍스트 동일).
- 팟캐스트 음성은 ElevenLabs 대신 **AWS Polly를 우선 채택** — 이미
  계정에 있고 별도 키 발급이 필요 없어 즉시 검증 가능했음. ElevenLabs
  전환은 계정의 두 후보 시크릿 중 어느 게 이 프로젝트 것인지 확인된
  뒤로 미룸.
- `presetFromProse`(옛 프롬프트 파싱 폴백)는 새 3섹션(설명/지침/파일)만
  인식하도록 바꾸고, 과거 `sections_json`에 `structure` 키가 남아있는
  경우에 대한 별도 마이그레이션 코드는 안 넣음 — 실제 저장된 데이터
  전부 `sections_json` 없이 `content` 평문뿐이라(직접 DDB 기록) 해당
  없음, 향후 발생 시 그 필드는 조용히 드롭됨(허용 가능한 트레이드오프).
- 레터 분량 미달 문제는 이번 세션에서 근본 해결하지 않음 — 프롬프트
  지시만으로는 한계가 있어 `max_tokens`/few-shot 예시 강화 등 추가
  튜닝이 필요하다고 판단, 다음으로 미룸.

## 다음

- 레터 분량(2000~2800자) 미달 — 반복 확인됐으나 미해결.
- 웹툰 이미지의 실존 브랜드명 노출("성심당") — 발행 전 육안 확인
  프로세스가 필요하거나, 프롬프트에 더 강한 제약(예: 배경 상호 자체를
  일반명사로 대체 지시)을 추가해야 함.
- ElevenLabs 시크릿 확정 후 팟캐스트 TTS를 Polly에서 전환할지 결정.
- Remotion 영상 렌더링은 아직 전혀 안 붙음.
- `admin`에서 프롬프트를 고칠 때마다 `service/backend/prompts/*/
  published.md` 폴백 파일을 수동으로 동기화하는 절차가 없음 — 반복
  작업이면 나중에 자동화 검토(예: 저장 시 웹훅으로 파일 갱신, 또는
  주기적 동기화 스크립트).
- 4포맷 파이프라인이 실제 CMS 발행 흐름(`cms_posts`)과 아직 안 붙어
  있음 — 지금은 admin 프롬프트 드로어/` lens/edit`에서 수동으로
  생성·검토·저장하는 반자동 흐름. 완전 자동 파이프라인(0단계 사실
  추출부터 4포맷 동시 생성, 07_VERIFY 커버리지 검증까지)은 범위 밖.
