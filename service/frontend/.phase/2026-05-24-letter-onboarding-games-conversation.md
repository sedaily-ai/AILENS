# 2026-05-24 — 레터 수기 발행 · about 랜딩 · 뉴스레터 인프라 · 게임 통합 · 대화 디벨롭

한 세션 안에서 진행된 여섯 갈래 작업. 시간순·인과관계대로 정리.
PR 2개 (#12, #13) 가 모두 같은 줄기 — "AI LENS 가 매일 letter 한 통을 발행하고,
사용자가 통화·텍스트로 4 페르소나와 대화하며, 가벼운 게임으로 머무는 일상 채널".

브랜치 흐름:
- `feat/letter-multimodal` → PR #12 (Phase A·B·C·D·E 일부)
- `feat/games-onboarding` → PR #13 (Phase E·F)
- `feat/ai-conversation` — 다음 라운드

---

## Phase A — 2026-05-23 letter 4편 수기 발행 + 이미지 인프라

**의도**
- 4편 letter 를 수기로 작성한 마크다운(`service/database/letter/{nt,nf,st,sf}/0523.md`)
  을 `ApiLetter` 스키마로 변환해 `letters20260523.ts` 신규 등록.
- 5/24 자도 같은 풀로 임시 노출 (5/24 미작성).
- letter 본문에 실 이미지를 박을 수 있도록 `ApiLetter.images?: LetterImage[]` 필드 신설.
- 이미지 생성 인프라 — Bedrock Nova Canvas 시도, **Legacy 차단** → Stable Image Ultra (us-west-2) 로 우회.

**프론트엔드 변경**
- `service/frontend/src/shared/lib/todayLettersApi.ts`
  - `LetterImage { url, alt?, caption?, credit?, aspect? }` interface 신설.
  - `ApiLetter.images?: LetterImage[]` 옵셔널 필드 추가.
- `service/frontend/src/app/letters/[id]/LetterDetailClient.tsx`
  - `LetterImageChannel` 우선순위 변경: `letter.images > letter.chart > mock 폴백`.
  - `LetterImages` 컴포넌트 신설 (figure/figcaption, lazy load, aspect ratio, 캡션·크레딧 위계).
- `service/frontend/src/features/news-feed/data/letters20260523.ts` 신규
  - NT/NF/ST/SF 4편. ■ 섹션 / 1./2./3. 소제목 / [인사이트][의미][공감] 콜아웃 / Q.A. FAQ 패턴
    그대로 박아 `LetterBlock` 자동 위계 렌더 활용.
- `service/frontend/src/features/news-feed/data/letters20260518.ts`
  - `LOCAL_LETTERS_BY_DATE` 에 `'2026-05-23'`·`'2026-05-24'` 두 키 모두 `LETTERS_20260523` 객체 가리키게 등록.
  - `LATEST_LETTERS_DATE` 자동 갱신 (가장 큰 키).

**Bedrock 이미지 시안 — 함정과 우회**
- Nova Canvas (`amazon.nova-canvas-v1:0`) us-east-1:
  - `ResourceNotFoundException: Access denied. This Model is marked by provider as Legacy and you have not been actively using the model in the last 30 days. Please upgrade to an active model on Amazon Bedrock`
  - `amazon.titan-image-generator-v2:0` 도 동일하게 LEGACY.
- 우회: `stability.stable-image-ultra-v1:1` (us-west-2). aspect_ratio 문자열만 받아 다양한 비율 매핑.
- 산출물: `scripts/gen-letter-images.py` — 7개 프롬프트 시안 시드 고정 호출. `public/letter-images/2026-05-22/nf/v{1-7}.png`.
- 비교용 정적 페이지: `public/letter-image-preview.html` (그리드 + 라벨 + 프롬프트 요약).

**검증**
- typecheck pass · letter 8 URL (NT/NF/ST/SF × 5/23·5/24) HTTP 200 · sitemap 자동 등록.

---

## Phase B — /onboarding about 랜딩 + 헤더·푸터·모바일 UX 정리

**의도**
- 신규 사용자 첫 진입 시 5단계 질문형 onboarding (welcome/motivation/context/result/letter) 이
  부담스럽다는 피드백 → about 톤 인터랙티브 랜딩으로 전환.
- 헤더 / 푸터 / 메인 페이지의 "서울경제" 직접 노출 제거 (AI LENS 브랜드 중심).
- 모바일 친화도 점검 + 자잘한 navigation 버그 일괄 정리.

**페이지 변경**
- `service/frontend/src/app/page.tsx` — 자동 `/onboarding` redirect 분기 제거.
  신규 사용자도 기본 SF 페르소나로 바로 메인 피드 노출. 페르소나 변경은
  헤더 '둘러보기' 또는 editor-select 모드로.
- `service/frontend/src/app/onboarding/page.tsx` — 통째로 about·랜딩으로 교체.
  - Hero (큰 세리프 'BETA' 칩 + '같은 뉴스, 네 가지 시선.' + CTA 2개)
  - Why · Editors (4 페르소나 카드) · How it works (01·02·03) · Sample (페르소나 토글 미리보기) · Newsletter · Footer
  - 섹션마다 ScrollReveal fade-in.
  - 기존 `steps/ data/ components/` 폴더는 deprecated (다른 곳 import 없음, 미삭제).

**카피·UX 정리**
- 헤더 (`widgets/Header/Header.tsx`)
  - `AI LENS` 옆 작은 파란 `Beta` 뱃지 (items-center 정렬).
  - 우측 라벨 `내 시각` → `둘러보기` / `서비스 둘러보기` (페이지 톤과 일치).
  - 모바일 메뉴 Link 클릭 시 `onClick={onClose}` 동기 호출 → panel unmount → Next/Link
    navigation 가 commit 되기 전 element 사라지며 cancel 되던 race 정리:
    `requestAnimationFrame(onClose)` 로 close 를 다음 frame 으로 미룸.
- 메인 피드 (`FollowingFeed.tsx`)
  - `오늘`/`어제` 상대 표현 분기 제거 → 항상 `5월 24일 토요일` + `2026.05.24 발행분`.
  - `· 잠들기 전 22:00 도착` 류 페르소나 고정 시간 라벨 제거 (`{readMinutes}분 읽기` 만).
  - letter 카드: `prefetch` 명시 + `active:bg` + `WebkitTapHighlightColor:transparent` 모바일 tap 피드백.
- 푸터 (`widgets/SiteFooter/SiteFooter.tsx`)
  - "발행 서울경제신문 · 1960년 창간..." → "AI LENS · 네 명의 AI 에디터가 같은 사건을..."
  - "© 2026 서울경제신문 AI LENS" → "© 2026 AI LENS".
- about 페이지 본문에서 "서울경제" 단어 제거 (Hero subtitle, How it works step 01).
- letter detail (`LetterDetailClient.tsx`) Header 탭에 `게임` 추가.

**모바일 fix**
- `globals.css` 의 `@view-transition { navigation: auto }` 룰 통째 제거.
  → 새 페이지 스크롤이 이전 페이지 하단 위치로 복원되던 버그 / 간헐적 클릭 hang 해결.
- `@media (max-width: 600px) .br-desktop-only br { display: none }` —
  데스크탑 의도 줄바꿈은 유지, 모바일은 자연 wrap 으로.

**기타 navigation fix**
- `SideRail.tsx` 의 "요즘 가장 많이 읽힌 글" — 하드코딩된 `5/14` letterId (존재 X) → not-found.
  `LATEST_LETTERS` 에서 동적 도출하도록 변경 → 자동 최신 갱신.

---

## Phase C — 뉴스레터 구독 CTA · 메일 SES Configuration Set · VOC

**의도**
- 메인 피드 하단에 4 페르소나 카드 + 이메일 입력 통합 CTA 추가.
- 구독 즉시 첫 letter 한 통이 메일로 도착하는 흐름 검증.
- 발송된 메일의 Open/Click 추적 활성 (이전엔 SES Config Set 밖으로 발송돼 추적 0건).
- 메일 본문에 한 줄 의견 VOC 섹션 + 사이트 letter 상세에 6 카드 피드백 캐러셀.

**공통 컴포넌트**
- `service/frontend/src/shared/ui/NewsletterEmailField.tsx` 신규
  - props: `groups`, `lettersByGroup?`, `accent`, `buttonLabel`, `disabled`, `helperText`, `onSuccess`.
  - 다중 그룹 동시 구독: group 별로 N 회 subscribe API 병렬 호출.
  - `lettersByGroup` payload 있으면 백엔드가 그 letter 즉시 SES 발송.
  - localStorage `newsletter-email` pre-fill (자동 done 진입 X — 항상 재구독 가능).
  - 'chat-tts-muted' / 'newsletter-groups' 캐시.

**메인 피드 CTA**
- `service/frontend/src/features/news-feed/components/NewsletterCTA.tsx` 신규
  - 4 카드 항상 1줄 (`repeat(4, 1fr)`) · 테두리 X · 비선택은 그레이스케일·opacity 0.38
  - 'NEWSLETTER' 라벨 + 'PRESS START' 식 세리프 + 카드 하단 ✓ 뱃지
  - '샘플 한 통 미리보기 ↓' 토글 → 선택된 첫 페르소나 LATEST_LETTERS 인라인 확장
    (헤더+헤드라인+subtitle+첫 단락+전체 보기, fade+slide 마이크로 모션)
  - `lettersByGroup` 매핑 — `LATEST_LETTERS.letters` 에서 그룹별 최신 letter
    한 통씩 (editor_name/role/accent + headline/subtitle/body/key_points/closing_line).

**메일 SES 함정 — Configuration Set 누락**
- `service/backend/handlers/newsletter/subscribe.py`
- 증상: 구독 성공 + DDB put 되지만 CloudWatch SES metrics 모두 0건.
- 원인: `_ses.send_email(...)` 호출에 `ConfigurationSetName` 누락 → 메시지가
  Configuration Set 'ailens-newsletter' 밖으로 발송 → 추적 픽셀 / 링크 래핑 부재.
  (sesv2 의 silent 함정 — 이름 안 넣으면 set 밖으로 가버림. 이전 memory `project_mbti_newsletter_ses.md` 에 동일 사고 기록.)
- 수정:
  - `_CONFIG_SET = os.environ.get('NEWSLETTER_CONFIG_SET') or 'ailens-newsletter'` 상수
  - `EmailTags=[{'Name': 'MessageTag', 'Value': 'newsletter'}]` 추가
    (Config Set 의 `DimensionConfigurations.DefaultDimensionValue` 와 매칭)
  - Lambda env `NEWSLETTER_CONFIG_SET=ailens-newsletter` 설정 (`aws lambda update-function-configuration`)
- 메일 본문 푸터 정리:
  - `AI LENS · 서울경제신문` → `AI LENS`
  - 푸터 위에 VOC 박스 추가: "이번 한 통은 어떠셨어요?" + "한 줄 의견 보내기 →"
  - `_VOC_LINK = os.environ.get('NEWSLETTER_VOC_LINK') or 'mailto:newsletter@mbti.sedaily.ai?subject=...'`
    (추후 Google Form/Typeform URL 받으면 env 한 줄로 교체)

**letter 상세 6 카드 피드백 캐러셀**
- `LetterDetailClient.tsx` 의 `LetterFeedback` 컴포넌트
  - 질문 6개: 별점 (1~5) / 길이 / 난이도 / 가장 유익한 부분 (다중 선택) / NPS (0~10) / 한 줄 의견 (200자)
  - 진행 도트 (페르소나 accent) + N/total 카운터 + 이전/건너뛰기/다음·보내기
  - localStorage 로 letter 별 완료 기억, 다시 응답 가능.
  - GA4 이벤트 `letter_feedback_answer` (질문별 즉시) + `letter_feedback_complete` (최종).
- 'VOC' 라벨 표기 자체는 UI 에서 제거 (user 요청).

---

## Phase D — Admin 대시보드 (mbti-admin.sedaily.ai/newsletter)

**의도**
- 구독자 수·발송·오픈·클릭 한 화면에서 실시간 확인. CloudWatch dashboard 따로
  보지 않고 admin 앱에서 바로.

**CloudWatch dashboard 선행**
- `sedaily-mbti-newsletter` 신규 (us-east-1, account 887078546492):
  - SES Send·Delivery·Open·Click·Bounce·Complaint 시간별 라인
  - 오픈율·클릭율 singleValue (math `100 * sum(open) / sum(send)`)
  - dimension `MessageTag = newsletter` 매칭
  - Log Insights 위젯: `/aws/lambda/sedaily-mbti-newsletter-subscribe-dev` 의 최근 구독 50건

**Backend admin Lambda 확장**
- `service/backend/admin/routes/newsletter.py` 신규
  - `GET /admin/newsletter/stats?days=7` (1~90)
  - DDB scan `sedaily-mbti-newsletter-subscribers-dev` → total / active / by_group / 최근 10건 (이메일 마스킹 `t****2@naver.com`)
  - CloudWatch `get_metric_statistics` 6 metrics + open_rate / click_rate / delivery_rate
- `service/backend/admin/handler.py` HANDLERS 에 `'GET /admin/newsletter/stats': (newsletter.handle_stats, True)` 등록.

**인프라 변경 (user 명시 승인 후 진행)**
- IAM: `sedaily-mbti-admin-api-dev-role` 의 인라인 정책 `AdminApiAccess` 의
  DynamoDBAdmin Resource 에 newsletter subscribers 테이블 ARN 추가.
- API Gateway HTTP API `chzwwtjtgk` 에 새 route `GET /admin/newsletter/stats`
  (기존 admin Lambda integration `lgj4lzl` 재사용).
- Admin Lambda 배포 — `pip install ... --platform manylinux2014_x86_64 --only-binary=:all:` 으로
  zip 생성 (argon2-cffi + PyJWT) → `aws lambda update-function-code`.

**Admin frontend 페이지**
- `admin/src/lib/types.ts` — `NewsletterStatsResponse`, `NewsletterSubscriber` interface.
- `admin/src/lib/adminClient.ts` — `getNewsletterStats(days=7)`.
- `admin/src/components/Nav.tsx` — 메뉴 `Newsletter` (Dashboard 다음). 모든 메뉴 한국어화
  (대시보드 / 뉴스레터 / 비용 / 스케줄·플래그 / 프롬프트 / 설정 / 로그아웃).
- `admin/src/app/(authenticated)/page.tsx` — 메인 대시보드 위젯 라벨 한국어화.
- `admin/src/app/(authenticated)/newsletter/page.tsx` 신규
  - 기간 토글 1/7/30/90일
  - 구독자: 활성수 + 4 페르소나 그리드 (각 카운트, persona accent)
  - 발송 지표: Send/Delivery/Open/Click 4 카드 + 도착·오픈·클릭율
  - Bounce/Complaint 0 초과 시만 노출
  - 최근 구독 10건 표 (마스킹 이메일 + 에디터 chip + 상태 + 상대 시간)
  - CloudWatch dashboard 외부 링크

**환경변수 함정**
- `admin/.env.local` 부재 → 빌드 시 `NEXT_PUBLIC_ADMIN_API_BASE_URL` undefined →
  `NEXT_PUBLIC_ADMIN_API_BASE_URL is not set` 콘솔 에러 → fetch 가 undefined URL 호출.
- 해결: `.env.local` 에 `NEXT_PUBLIC_ADMIN_API_BASE_URL=https://chzwwtjtgk.execute-api.us-east-1.amazonaws.com/dev` 설정 후 재빌드+배포.

---

## Phase E — 헤더 탭 통일 + 게임 통합 (다크 아케이드)

**헤더 탭 헬퍼**
- `service/frontend/src/shared/lib/headerTabs.ts` 신규
  - `buildHeaderTabs(active?)` — 표준 순서 (레터 · 에디터 · 사주 · 타임라인 · 게임 · 커뮤니티 · 내 서랍)
- 7 페이지 hardcoded `tabs={[...]}` → `tabs={buildHeaderTabs('xxx')}` 일괄 교체
  (LetterDetailClient · editors · saju-match · timeline · dna · fortune. calendar 는
  '캘린더' 탭이 표준 X 라 inline 으로 게임만 추가).

**게임 통합 — AI-Games-v3 의 2 게임**
- 두 게임 dist 그대로 복사: `public/games/{cat-blanket,protect-newspaper}/`
  (asset 경로 `./assets/...` relative 라 어디 둬도 동작).
- 썸네일: `Game-Platform/frontend/public/{cat,poop}-thumb.svg` 다운 → `public/games/`.
- `/games/play/[slug]/page.tsx` 신규 — generateStaticParams 로 2 slug 정적 생성.
  - GamePlayClient: 풀스크린 iframe + 좌상단 floating BACK 캡슐 (호버 시 골드 네온).
- `/games/page.tsx` + `GamesClient.tsx`
  - 헤더 제거, 좌상단 'EXIT' 캡슐만 (← AI LENS)
  - 다크 배경 (radial gradient #1a1145 → #050510) + 전역 CRT scanlines + 비네팅
  - Press Start 2P 픽셀 폰트 (globals.css 의 `@import url(...)` — **반드시 파일 최상단**,
    `@import "tailwindcss"` 뒤에 오면 빌드 에러 `@import rules must precede all rules`)
  - 헤딩 'PRESS START' 골드 네온 (3 레이어 textShadow)
  - 카드: 다크 배경 + 게임별 네온 보더 (cat=골드, 신문지키기=블루), 호버 시 6px 위로
  - ArcadeIntro: mount 시 풀스크린 검정 + scanlines + 'INSERT COIN' 깜빡임 + 'AI LENS · ARCADE' 골드,
    `arcadeFadeOut 1.4s ease-in forwards`, `pointer-events: none`.

**게임 IP 마스킹 — bundle 패치**
- `public/games/protect-newspaper/assets/index-*.js` 에서 직접 string 교체 (python3 UTF-8 안전):
  - `SEOUL ECONOMIC DAILY` → `AI LENS ARCADE NEWS` (2건)
  - `서울경제신문` → `AI LENS 한판` (1건)
  - `서울경제` → `AI LENS` (2건)
- cat-blanket 은 sedaily 표기 없음 확인.

---

## Phase F — AI 대화 디벨롭 (통화 default · 텍스트 TTS · 스트리밍 · 1~2문장 · Polly 자연도)

**의도**
- 베이스 경험 = 4 페르소나와 전화 통화. 공공장소 등에서 말로 못할 때만 텍스트 fallback.
- 양 모드 모두 페르소나가 응답 음성으로 말해줘야 함 (텍스트도 자동 TTS).
- 응답 한 호흡 1~2문장 짧게 (이전 300~500자 기사체).
- AWS 안에서 한국어 자연도 최대 — Polly Generative + 발음 치환.

**기본 모드 = voice**
- `components/mbti/SmartSearchOverlay.tsx` line `useState<'text'|'voice'>('text')` → `('voice')`.
- 헤더 "대화" 클릭 시 자동 마이크 권한 요청 → ko-KR listening 시작.
- 텍스트 모드 ttsMuted 토글 (헤더 우측 🔊/🔇, localStorage `chat-tts-muted` 기억, 텍스트 모드 전용 UX).

**스트리밍 TTS — 문장 단위 즉시 재생**
- `shared/lib/voiceChat.ts`
  - `sanitizeForTTS(text)` — 이모티콘 `:)` `:(` `:D`, 마크다운 `**…**` `_…_` `` `…` ``,
    URL, 단독 콜론/세미콜론(숫자 사이 아닐 때) → 쉼표, 헤더 마커 `#` `>`,
    다중 공백 → 한 공백.
  - `makeSentenceFlusher(onSentence, minChars=60)` — chunk 누적해 `[.?!。？！\n]`
    경계마다 sentence 콜백. minChars 미달이면 대기 (짧은 문장 여러 개를 한 호흡으로 묶어 자연 inflection).
- SmartSearchOverlay 의 `sendAi` / `sendAiVoice` 둘 다:
  - onChunk 마다 `flusher.push(chunk)`, onEnd 에 `flusher.end()`.
  - `speak()` 가 Promise chain (`ttsTask`) 으로 serial 재생.
  - 결과: 텍스트가 흐르는 동시에 첫 문장부터 음성 시작 (full 텍스트 안 기다림).

**대화 톤 — 1~2 문장 강제**
- `service/backend/handlers/chatbot_handler.py` 의 `GENERAL_INSTRUCTIONS` 통째 재작성:
  - "한 답변 = 1~2 문장, 60~140자. 절대 그 이상 X. 사용자가 명시적으로 '자세히' 요청할 때만 길게."
  - 마크다운 절대 금지 (`#` `##` `-` `•` `1.` `**…**` 표 `---` 코드블록).
  - 이모지 절대 금지 (📰 💭 🤔 😊 등).
  - 줄바꿈 사용 금지 (한 단락 한 호흡).
  - 답 끝에 매번 질문 다는 패턴 X.
  - 도구 호출 규칙 (get_stock_price / get_market_index / search_news) 은 유지.
- 주의: admin DDB prompt cache TTL 5분 → 첫 5분간 옛 응답 가능.

**Polly 한국어 자연도 — AWS 안에서 최대**
- `service/backend/handlers/voice/tts.py`:
  - `PERSONA_VOICE` 4명 다 `generative` engine (이전 NT/NF/ST 는 neural, SF 만 generative).
    Seoyeon · Jihye 둘 다 한국어 generative 지원 (2025 기준).
    비용 neural $16/M → generative $30/M chars (약 2배).
  - `preprocess_for_polly(text)` — Polly 어색 발음 한국식 치환:
    - 한국 기업 KT/SK/LG/GS/CJ/HD/KB → 케이티/에스케이/엘지/...
    - 일반 약어 AI/IT/ICT/CEO/CFO/CTO/GDP/CPI/PPI/IPO/ETF/PER/PBR/ROE/M&A/MZ/SNS/API/USB → 한국식 발음
    - % → 퍼센트, bp → 베이시스포인트
    - 한자 갈등 표현 勞勞 → 노노, 勞使 → 노사, 勞 → 노, 使 → 사
  - generative 실패 시 자동 neural fallback (region quota / voice mismatch 대비).
  - response `engine` 필드를 실제 사용된 engine (`used_engine`) 으로.

---

## 배포·검증

- 모든 phase 가 `npm run build` (frontend) + `./deploy.sh api` (backend) + `./deploy-admin.sh` (admin)
  통해 prod 반영. CloudFront 무효화 자동.
- AWS 리소스 변경은 명시 승인 후 진행 (IAM 인라인 정책 / API Gateway route 추가 등).
- `feat/letter-multimodal` (12 commits) → PR #12 머지 (cca4eaa)
- `feat/games-onboarding` (10 commits) → PR #13 머지 (3f6a7bb)

## 다음 라운드 (`feat/ai-conversation`)

Tier 1 — 통화 UX 본질:
- VoiceCallView 풀스크린 통화 화면 활성화 (코드 80% 완성, STT/TTS 실연결 + Header 진입 분기)
- 사용자 발화 끼어들기 (barge-in) — TTS 재생 중 STT activity 감지 시 audio.pause()
- 통화 시간 + 종료 버튼 + 연결/종료 효과음

Tier 2 — 텍스트 자연도:
- typing indicator
- 메시지별 TTS 재생 버튼
- 빠른 답변 추천
- 대화 메모리 localStorage 영속

Tier 3 — 공통:
- 페르소나 중간 전환
- 대화 → 내 서랍 저장
- iOS Safari fallback (Transcribe Streaming presign Lambda 활용)
