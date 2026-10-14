# apps/mobile 홈·내비게이션 설계

작성: 2026-10-14. 기준: 웹 홈(`service/frontend/src/features/news-feed/components/NewsFeedTab.tsx`)의 섹션 구성. 상위: `apps-mobile-Expo-설계.md`.

## 내비게이션 (2026-10-14 확정 — 뉴닉 구조를 따름, 햄버거 메뉴 없음)

| 위치 | 구성 |
|---|---|
| 하단 탭 4개 | 홈 / 발견 / 듣기 / 나의 LENS |
| 상단바 | 좌 `AI LENS BETA`, 우 검색 + 프로필 아이콘 |
| 프로필 아이콘 | `/account` — 로그인·로그아웃, 약관·개인정보, 앱 정보(햄버거를 대신함) |
| 홈 | 오늘의 핵심에 집중: 오늘의 지면 → 최신 뉴스 |
| 발견 | 카테고리 칩 → 카테고리 섹션 사이사이에 웹툰·영상 레일, 레터 |
| 듣기 | home_player 오디오 목록(재생은 M4) |
| 나의 LENS | 저장·구독(백엔드 연동 후 M4), 지금은 로그인 안내 |

근거: 뉴닉 앱은 하단 5탭 + 상단 아이콘(검색·북마크·프로필)이고 햄버거가 없으며, 카테고리는 "발견" 탭의 칩으로 둔다. 콘텐츠 종류가 많은 AI LENS도 카테고리·보조 콘텐츠를 발견 탭에 모으면 4탭으로 충분하다(판단).

## 원칙

- 웹 홈과 **섹션 순서·데이터 규칙을 같게** 하고, 화면 배치는 모바일 단일 칼럼으로 옮긴다(웹의 2/3+1/3 짝 배치는 쓰지 않음).
- **라우트 파일은 얇게**(`app/(tabs)/index.tsx`는 `HomeScreen` 재수출). 실제 구성은 `src/features/home/`.
- **데이터 규칙(순수 함수)·조회(훅)·화면 조각(컴포넌트)을 분리**한다. 규칙은 네트워크·UI 없이 테스트 가능해야 한다.
- 섹션은 **fail-open**: 채널 하나가 실패해도 나머지는 보여 준다. 핵심 채널(letters·lens)이 모두 실패할 때만 오류 화면.

## 구조

```
src/features/home/
├─ HomeScreen.tsx        로드 상태 + 섹션 조립(오늘의 지면, 최신 뉴스)
├─ useHomeData.ts        5개 채널 병렬 조회(allSettled), 부분 실패 허용
├─ model.ts              순수 로직: buildLatest, PAPER_TABS/pickPaperSection/paperTitle, groupByCategory
└─ sections/             PaperHero, LatestSection, CategorySection, LettersSection, MediaRails(웹툰·영상·오디오), SectionHeader
src/features/search/     SearchScreen·searchData(목록 로더)·recentSearches(AsyncStorage)
src/features/discover/   DiscoverScreen — 카테고리 섹션 + 웹툰·영상 + 레터
src/components/          AppHeader, CategoryChips, GridCard, MiniPlayer, AsyncView
app/(tabs)/              index(홈) · discover · listen · me(나의 LENS)
app/category/[slug].tsx  카테고리 목록(발견 칩·섹션 "더 보기"가 진입)
app/account.tsx          계정·약관(프로필 아이콘)
app/search.tsx           검색(상단바 돋보기)
```

## 섹션 (웹 홈의 순서를 홈/발견으로 나눔)

- 홈: ① 오늘의 지면(4탭: 지면/증권/산업/시그널, 대표 1 + 작은 3, `lens.paper_section`) ② 최신 뉴스 2열 8건(letters+lens 병합, 같은 id는 lens 우선, 최신순)
- 발견: 카테고리 섹션(시그널·부동산·경제·금융) → 웹툰·영상 레일 → 카테고리(산업·정치) → 레터 → 카테고리(사회·국제·문화). 각 카테고리는 대표 1 + 목록 3
- 듣기: 오디오 전체 목록

카테고리 라벨 매칭은 `categoryForDataLabel`(`@ailens/domain`)로 옛 이름('증시', '금융·정책')도 같은 분류로 본다.

## 미이행 / 자리표시

- 뉴스 타임머신(S3 지면), 게임, 요즘 많이 읽힌 글(인기 레일, 로그인·집계 API 필요)
- 검색: 범위(제목/요약)·하위 분류 필터, 디스크 캐시(지금은 세션 메모리) — 웹에만 있음
- 미니 플레이어 재생(UI만), 약관·개인정보 웹 경로(`/terms`, `/privacy`)는 미확인
- 웹툰·영상·오디오 전용 상세 화면 — 지금은 글 상세로 연결
- 카테고리 하위분류·페이지네이션, 가로 칩 활성 표시의 스크롤 연동

## 검색

- 순수 로직(`search`, `countByCategory`, `topKeywords`, `splitHighlight`, `parseTerms`)은 **`@ailens/domain/search`로 승격**해 웹·앱이 공유한다. 웹 `shared/lib/search/searchIndex.ts`는 재수출 + 웹 전용 로더만 남겼고, 기존 웹 테스트 22건이 그대로 통과한다.
- 데이터: 웹과 같은 `GET /api/search-index`(제목·요약·분류·날짜·썸네일, 약 1.4MB/2,684건)를 세션당 1회 받아 기기에서 거른다. 글이 만 건대로 늘면 서버 검색으로 교체(인터페이스 `loadSearchIndex`/`search` 유지).
- 화면: 입력 250ms 디바운스, 엔터·최근 검색어·키워드 탭은 즉시 검색+최근 검색어 저장(기기 AsyncStorage, 최대 8개), 정렬(최신/정확도)·기간(전체/오늘/1주/1달)·분류 탭(건수), 20건씩 무한 스크롤, 제목·요약 강조.
