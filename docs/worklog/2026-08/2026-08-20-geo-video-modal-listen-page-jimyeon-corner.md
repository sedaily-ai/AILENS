# 2026-08-20 GEO 점검 + 영상 모달 리뉴얼 + /listen 페이지 신설 + "지면 특별 코너" 개편

작성: 영광 + Claude Code
관련: `service/frontend/public/llms.txt`, `service/frontend/src/app/(content)/lens/[slug]/LensViewClient.tsx`,
`service/frontend/src/features/news-feed/components/VideoPreviewSection.tsx`,
`service/frontend/src/shared/ui/VideoLightbox.tsx`,
`service/frontend/src/app/(content)/video/VideoListClient.tsx`,
`service/frontend/src/widgets/TodayNewsPlayer/TodayNewsPlayer.tsx`,
`service/frontend/src/app/(content)/listen/`,
`service/frontend/src/features/news-feed/components/LensPreviewSection.tsx`,
`service/backend/handlers/cms_posts_public.py`

## 배경

RSS 최신화 확인에서 시작해, GEO/AEO/SEO 전반 점검("검색엔진에 잘 걸리려면?"),
4포맷 콘텐츠 제작 비용 분석, 영상 섹션 UX 리뉴얼, 오디오 플레이북(TodayNewsPlayer)
기능 확장, 마지막으로 홈 "오늘의 이슈, 4가지 시선" 박스를 "지면 특별 코너"로
개편하는 요청까지 하루 안에 여러 스레드가 이어졌다.

## 한 것

### 1. RSS/GEO/AEO/SEO 점검
- `rss.xml` 라이브 확인 — 캐시 태그 리보얼리데이션으로 정상 최신화되는 것 확인.
- Google 2026 SEO 리서치: FAQ rich result가 2026-05 완전 폐지(GSC 리포트·Rich
  Results Test까지 2026-06 제거)됨을 확인 — 기존에 우선순위로 제안했던
  FAQPage 스키마 마크업 방향을 철회. AI Overviews/AI Mode는 특정 스키마보다
  인용 가능한 구조화 본문(리스트·수치)과 엔티티 명확성이 더 중요하다는 게
  Google 공식 입장.
- `public/llms.txt` 오류 정정: 4가지 시선 설명이 옛 포맷("원인·사람·내 일·숫자")
  그대로 남아있던 것 → "레터·웹툰·팟캐스트·영상 네 형식"으로, 웹툰 설명도
  "흑백 펜화 컷"(옛 스타일) → "컬러 일러스트 컷"으로 수정. 문화 카테고리 추가.
  이후 `/listen` 신설에 맞춰 오디오 섹션 URL도 추가.
- `LensViewClient.tsx`의 "30초 핵심" 요약 블록이 데모 전용 하드코딩
  (`articleSummarySample()`, 특정 lens ID 1개에만 동작)이라 실제 기사에서는
  한 번도 작동한 적이 없었던 걸 발견 → `coreSummaryBullets()`로 교체, 실제
  `lens.lenses[]` 불릿을 팟캐스트 우선 순서(팟캐스트→영상→웹툰→레터)로 사용,
  `data-speakable="summary"` 마커 추가.
- 4포맷 콘텐츠 1건 제작 비용을 tiktoken으로 실측: 레터 $0.013 / 팟캐스트
  $0.038 / 웹툰 $1.354(이미지 8컷×$0.165=92%) / 영상 $0.028, 합계 ≈$1.43.
  컷 수 축소 등 최적화는 사용자가 명시적으로 보류("컷 수 줄이는건 안합니다").

### 2. 영상 섹션 리뉴얼 (여러 라운드)
- 위치를 웹툰 섹션 바로 다음으로 이동(기존엔 홈 최하단).
- 재생 버튼 디자인 2차 변경: 가운데 글로우 링 → 우상단 미니멀 아이콘 → 완전
  제거(카드 전체 클릭 시 모달, hover 시에만 글래스모피즘 재생 아이콘).
- 영상 카드 클릭 시 `/video/{id}` 리다이렉트 대신 모달(`VideoLightbox`)로 재생하도록
  전환. `/video` 목록 페이지도 동일하게 통일.
- **버그**: 모달을 처음 붙였을 때 배경은 어두워지는데 영상·닫기 버튼이 안 보이고
  헤더·하단 오디오바가 안 가려지는 문제 발생. 원인: `FeedPage.tsx`의
  `.tab-fade-in { animation: tabFadeIn 0.25s ease-out both; }`가
  `animation-fill-mode: both`라서 애니메이션 종료 후에도 `transform:
  translateY(0)`이 조상 요소에 남고, **transform 값이 identity여도 `position:
  fixed` 자손의 containing block을 새로 만든다** — 그래서 모달의 fixed 좌표가
  뷰포트가 아니라 그 조상 wrapper(페이지 전체 높이) 기준으로 계산되어 화면
  밖으로 밀려났다. `createPortal(modalJSX, document.body)`로 해결,
  `VideoLightbox`를 `shared/ui/VideoLightbox.tsx`로 추출해 홈/`/video` 양쪽에서
  공용으로 사용.
- 영상 썸네일이 기사 원문 사진/웹툰 컷으로 잘못 나오던 문제 → ffmpeg로 실제
  영상 프레임 추출(`ffmpeg -ss 2 -frames:v 1`), S3 업로드 후 lens 서브아이템에
  `thumbnail_url` 필드 신설(백엔드 `_shape_lens` 수정 + 기존 3건 DDB 백필).
- 2×2 그리드로 확대, 시네마틱 비네트/그라데이션 스크림 적용.

### 3. TodayNewsPlayer(하단 오디오바) 기능 확장
- 로그인 시 북마크(localStorage `ailens-player-bookmarks`, 서버 저장 아님 — 기기
  이동 시 유실됨을 코드 주석으로 명시).
- 재생목록 패널(위로 펼쳐짐) + 우측 일러스트(`ListeningHeadphoneIllustration`
  신규 추가) + "전체 목록 보기 →" `/listen` 링크.
- 기존 mp3 파일 직접재생 지원(`DIRECT_AUDIO_RE`, 네이티브 `<audio>`), 팟캐스트
  mp3 3건을 home_player 채널에 백필.
- 디자인 피드백 반영: 재생 버튼 검정 → 블루(`#3b82f6`), 패널 헤더 라벨
  "재생목록 · N개" 추가, 행별 포맷 아이콘(헤드폰/재생) 추가, 접힌 미니바 좌측
  아이콘을 `/listen`으로 가는 링크로 전환.

### 4. `/listen` 페이지 신설 (검색엔진 노출)
- 사용자 지적: "이거(오디오 플레이북) 검색엔진에 뜰려나? 탭을 만들어야 하려나?"
  → 기존엔 전용 URL이 없어 SEO 표면이 전혀 없었음.
- `/listen`(목록) + `/listen/[slug]`(상세) 신설. `CollectionPage`/`ItemList`
  JSON-LD, mp3 항목은 `PodcastEpisode`+`PodcastSeries`, 유튜브/네이버TV 항목은
  `VideoObject` 스키마로 분기.
- 헤더 탭(`headerTabs.ts`)·푸터(`SiteFooter.tsx`)·sitemap(`sitemap.ts`)에 등록.
- 백엔드 `_shape_home_player_item`에 `excerpt`(subtitle)/`date`(publish_date)
  필드 추가, `homePlayerApi.ts`에 SSR 캐시 버전(`fetchHomePlayerPosts`,
  `fetchHomePlayerBySlug`) 신설. revalidate 웹훅 `CONTENT_TAGS`에
  `posts:home_player` 추가.

### 5. "오늘의 이슈, 4가지 시선" → "지면 특별 코너" 개편
- 요청: 전체/증권/산업/시그널 4개 "지면" 탭을 만들고, 각 지면 안에 기사
  최대 4건을 화살표로 넘겨볼 수 있게 구조 변경. 상단 헤더 탭이 아니라
  기존 이 박스 자체를 개편하는 것.
- **1차 시도(오판, 배포까지 갔다가 롤백)**: 박스 전체를 "4개 탭 × 탭별
  기사 리스트(제목만)"로 바꿔버림 — 원래 있던 "사진+헤드라인+4형식 캐릭터
  행" 비주얼을 통째로 버림. 사용자가 스크린샷으로 정정: 그 형태가 아니라
  기존 룩을 유지하되 화살표로 기사만 넘기는 것.
- **2차 시도(오판)**: "탭마다 대표 기사 1건, 화살표는 탭 사이 이동" 으로 재해석 —
  이것도 틀림.
  최종 정정: "탭(전체/증권/산업/시그널)은 지면을 선택하는 것이고, 그 탭 안에서
  화살표 좌우로 그 지면에 속한 기사(최대 4건)를 넘긴다"는 2단 구조.
- **최종 구현**(`LensPreviewSection.tsx`): `SECTIONS` 배열(전체/증권/산업/시그널,
  각 탭이 `CmsLens.category`로 필터링) → 탭 클릭 시 `articleIndex` 리셋 →
  탭 안에서는 원래 레이아웃(사진+헤드라인+4형식 행) 그대로, 화살표/점
  네비게이터는 탭 내 기사(최대 4건)만 넘김. 시그널 탭은 아직 매칭되는
  카테고리가 없어 "지면을 준비하고 있어요" 빈 상태 노출.
- 마지막 수정: 4형식 행(레터/웹툰/팟캐스트/영상) 아래 부가설명이 `bullets[0]`
  기반이라 팟캐스트·영상 행에만 보이고 레터·웹툰 행은 비어 보이던 문제 —
  `/lens` 상세 페이지 형식 선택 카드와 동일한 고정 태그라인(`p.tagline`)으로
  4행 전부 통일.

## 결정

- FAQPage 스키마 마크업은 더 이상 SEO 우선순위 아님(Google 2026-05 rich
  result 폐지) — 향후 GEO 작업은 구조화 본문·엔티티 명확성 쪽에 집중.
- 웹툰 이미지 컷 수(현재 8컷/$1.354)는 비용 최적화 대상에서 제외 — 사용자가
  품질 우선으로 명시적 결정.
- TodayNewsPlayer 북마크는 당분간 localStorage 전용으로 유지(서버 저장은
  다음 라운드 과제).
- `isDirectAudioUrl()` 신규 공용 헬퍼는 만들었지만 기존 `TodayNewsPlayer.tsx`/
  구버전 `VideoLightbox`의 로컬 정규식은 그대로 둠 — 이미 배포된 코드를 굳이
  건드릴 리스크 대비 이득이 작다고 판단.

## 다음

- 지면 특별 코너 "시그널" 탭에 매칭할 카테고리/콘텐츠 소스가 아직 없음 —
  콘텐츠 소싱 방향 결정 필요.
- lens 4형식 JSON-LD의 Q&A 4개가 실은 "같은 질문의 4가지 표현"이라 서로
  구분되는 질문이 아니라는 지적 있었음 — 다음 4포맷 프롬프트 개선 라운드에서
  다룰 것.
- TodayNewsPlayer 북마크 서버 영속화(현재 기기 바꾸면 유실).
- 4개 포맷을 "독립 완결"로 갈지 "브릿지 문구로 연결"할지 방향 미정(이전
  세션부터 이어지는 미해결 항목).
