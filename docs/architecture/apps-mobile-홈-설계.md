# apps/mobile 홈 설계

작성: 2026-10-14. 기준: 웹 홈(`service/frontend/src/features/news-feed/components/NewsFeedTab.tsx`)의 섹션 구성. 상위: `apps-mobile-Expo-설계.md`.

## 원칙

- 웹 홈과 **섹션 순서·데이터 규칙을 같게** 하고, 화면 배치는 모바일 단일 칼럼으로 옮긴다(웹의 2/3+1/3 짝 배치는 쓰지 않음).
- **라우트 파일은 얇게**(`app/(tabs)/index.tsx`는 `HomeScreen` 재수출). 실제 구성은 `src/features/home/`.
- **데이터 규칙(순수 함수)·조회(훅)·화면 조각(컴포넌트)을 분리**한다. 규칙은 네트워크·UI 없이 테스트 가능해야 한다.
- 섹션은 **fail-open**: 채널 하나가 실패해도 나머지는 보여 준다. 핵심 채널(letters·lens)이 모두 실패할 때만 오류 화면.

## 구조

```
src/features/home/
├─ HomeScreen.tsx        로드 상태 + 섹션 조립(FlatList, 풀투리프레시)
├─ useHomeData.ts        5개 채널 병렬 조회(allSettled), 부분 실패 허용
├─ model.ts              순수 로직: buildLatest, PAPER_TABS/pickPaperSection/paperTitle, groupByCategory
└─ sections/             PaperHero, LatestSection, CategorySection, MediaRails(웹툰·영상·오디오), SectionHeader
src/components/          AppHeader, CategoryChips, GridCard, MiniPlayer, AsyncView, PostCard
app/category/[slug].tsx  카테고리 목록(홈 칩·섹션 "더 보기"가 진입)
```

## 섹션 순서 (웹과 동일)

1. 오늘의 지면(4탭: 지면/증권/산업/시그널, 대표 1 + 작은 3) — `lens.paper_section`
2. 최신 뉴스 2열 그리드 8건 — letters+lens 병합(같은 id는 lens 우선), 최신순
3. 카테고리 섹션(시그널·부동산 → 경제·금융) — 대표 1 + 목록 3
4. 웹툰·영상 가로 레일
5. 카테고리(산업·정치) → 오디오 목록 → 카테고리(사회·국제·문화)

카테고리 라벨 매칭은 `categoryForDataLabel`(`@ailens/domain`)로 옛 이름('증시', '금융·정책')도 같은 분류로 본다.

## 미이행 / 자리표시

- 뉴스 타임머신(S3 지면), 게임, 요즘 많이 읽힌 글(인기 레일, 로그인·집계 API 필요)
- 검색·햄버거 메뉴 동작(헤더 아이콘은 모양만), 미니 플레이어 재생(UI만)
- 웹툰·영상·오디오 전용 상세 화면 — 지금은 글 상세로 연결
- 카테고리 하위분류·페이지네이션, 가로 칩 활성 표시의 스크롤 연동
