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
src/features/article/    ArticleScreen(상세)·LetterBody(레터 블록 렌더)·FormatPanels(4형식)·RichText(인라인·용어)·PostVote·LetterArticle(letters 전용)
src/features/player/     PlayerContext — 앱 전체가 공유하는 오디오 플레이어(큐·자동 다음 곡·잠금화면)
src/features/search/     SearchScreen·searchData(목록 로더)·recentSearches(AsyncStorage)
src/features/discover/   DiscoverScreen — 카테고리 섹션 + 웹툰·영상 + 레터
src/components/          AppHeader, CategoryChips, GridCard, MiniPlayer, AsyncView
app/(tabs)/              index(홈) · discover · listen · me(나의 LENS)
app/category/[slug].tsx  카테고리 목록(발견 칩·섹션 "더 보기"가 진입)
app/account.tsx          계정·약관(프로필 아이콘)
app/search.tsx           검색(상단바 돋보기)
app/webtoon/             목록(2열 표지) · [slug] 컷 세로 보기
app/video/               목록 · [slug] 네이티브 플레이어(expo-video)
app/listen/[slug].tsx    오디오 상세(전체 플레이어·배속·대본), 듣기 탭·미니 플레이어와 같은 상태
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
- 카테고리 하위분류·페이지네이션, 가로 칩 활성 표시의 스크롤 연동

## 검색

- 순수 로직(`search`, `countByCategory`, `topKeywords`, `splitHighlight`, `parseTerms`)은 **`@ailens/domain/search`로 승격**해 웹·앱이 공유한다. 웹 `shared/lib/search/searchIndex.ts`는 재수출 + 웹 전용 로더만 남겼고, 기존 웹 테스트 22건이 그대로 통과한다.
- 데이터: 웹과 같은 `GET /api/search-index`(제목·요약·분류·날짜·썸네일, 약 1.4MB/2,684건)를 세션당 1회 받아 기기에서 거른다. 글이 만 건대로 늘면 서버 검색으로 교체(인터페이스 `loadSearchIndex`/`search` 유지).
- 화면: 입력 250ms 디바운스, 엔터·최근 검색어·키워드 탭은 즉시 검색+최근 검색어 저장(기기 AsyncStorage, 최대 8개), 정렬(최신/정확도)·기간(전체/오늘/1주/1달)·분류 탭(건수), 20건씩 무한 스크롤, 제목·요약 강조.

## 웹툰·영상·오디오

- **웹툰**: 목록은 표지만 오고 컷(`panels`)은 단건 조회 `getPost(id, { channel: 'webtoon' })`에만 채워진다(같은 글이 채널마다 따로 발행되므로 채널 지정 필요). 컷은 세로로 이어 보고, `text_caption` 컷만 아래에 글자로 보여 준다.
- **영상**: `video_url`은 S3 mp4. `expo-video` 네이티브 컨트롤(전체화면·PIP).
- **오디오**: `media_embed_url`은 S3 mp3, 대본은 단건 조회의 `transcript`. 전역 `PlayerProvider` 하나가 큐·재생 상태를 갖고 미니 플레이어·듣기 탭·상세가 같은 상태를 본다. 곡이 끝나면 다음 곡 자동 재생, 영상 재생 시작 시 오디오 일시정지, `doNotMix`+잠금화면 컨트롤+백그라운드 재생.
- 네이티브 모듈(`expo-audio`, `expo-video`)이 추가돼 **개발 빌드를 새로 만들어야** 한다(JS 핫리로드로는 반영 안 됨).

## 기사 상세

- **웹과 공용으로 승격한 순수 로직(`@ailens/domain`)**: `parseLetterBlocks`(본문 문단 → 소제목·목록·인용·특별 칸·좌우 비교 블록), `inlineSegments`(굵게·기울임·따옴표·금액 강조), `splitByTerms`(용어집), `letterChapters`, `parseVoteChoices`, `readMinutes`. 웹의 `lensBlocks.ts`·`renderInline.tsx`·`lensChapters.ts` 등은 이를 재수출·사용하도록 바꿨고 웹 테스트(95건)·레터 파서 테스트(12건)는 그대로 통과한다.
- **데이터**: 같은 글이 채널마다 따로 발행되므로 `getPost(id, { channel: 'lens' })`를 먼저 읽고 404면 letters 형태로 읽는다. LENS 글은 `lenses[]`에 형식 4개(레터·웹툰·팟캐스트·영상)가 들어 있고, 형식별로 문단·용어집·컷·mp3·mp4·대본이 있다.
- **화면**: 형식 탭(읽기·웹툰·듣기·영상, 데이터에 없는 형식은 탭에서 제외) / 레터는 소제목 번호·1분 요약·비교 칸·투표·더 보기 / 용어 탭하면 설명 시트 / 팟캐스트는 전역 오디오 플레이어에 올림 / 영상은 expo-video / 글자 크기 4단계(기기 저장) / 읽기 진행바 / 공유 / 원문 링크 / 같은 분류 다른 글.
- **letters 전용 글**: 핵심 요약, 문단 본문(또는 리치텍스트 `body_html` — react-native-render-html), 이미지, 수치 차트(가로 막대), 마무리 문장.
- **미이행**: 문장 선택 팝오버(하이라이트·저장), 이전/다음 글 내비, 챕터 점프 목차, 인쇄, 조회수 기반 "많이 읽힌 글".

## 탐색·타임머신·나의 LENS 보강 (2026-10-14)

- **카테고리**: 검색과 같은 전체 목록(`/api/search-index`)에서 분류별로 20건씩 이어 붙이고, 하위 분류 칩(시그널→국내증시/해외증시/IB&Deal 등)으로 거른다. **검색**: 범위(제목/요약)·하위 분류 필터 추가.
- **그날로 떠나요(`/timeline`, `/timeline/[date]`)**: 날짜 입력·하루씩 이동·역사 속 그날(연대별 사건 79건) → 그날의 신문. 2026-02-01 이후는 서울경제 S3 아카이브(`POST /api/timeline`), 이전은 빅카인즈(`GET /time-machine`, 투자 시나리오 포함). 사건 데이터는 웹 생성 파일을 `apps/mobile/scripts/sync-timeline-events.mjs`로 복사(장기적으로 생성기 출력을 `@ailens/domain`으로 옮겨 복사를 없앤다).
- **지난 지면(`/paper/[date]`)**: 그날 발행된 LENS 글을 4탭 지면으로.
- **나의 LENS**: 내 서랍(서버, 담은 문장 검색·삭제·공유), 저장한 글·읽은 글(기기 저장 — 웹도 브라우저 범위), 관심 분야 최신 글, 읽기 통계(열람 기준). 기사에서 문단을 길게 눌러 문장을 담는다. 웹의 리워드·배지·개인화 푸시는 서버가 없어(웹도 "예시/초안" 표기) 앱에도 넣지 않았다.
- **비밀번호 변경(`/settings/password`)**: 소셜 계정은 비밀번호가 없어 안내만 표시.

## 나머지 웹 기능 이식 (2026-10-14)

| 웹 | 앱 | 구현 |
|---|---|---|
| /start 온보딩 | `/start`(질문 2개→내 유형·추천 형식→오늘 1면), 홈 첫 방문 카드 | 질문·결과 데이터는 `@ailens/domain/onboarding`(웹 재수출). 선택 형식은 기사 상세 기본 탭 |
| /letter 이슈 레터 | `/letter`, `/letter/[slug]` | 3축(소식·실체·다른 시각) 섹션, 시각 블록 6종(타임라인·수치·막대·비교·접기·콜아웃), 출처, 독자 투표 |
| /games | `/games`, `/games/[slug]` | 게임 목록은 `@ailens/domain` 공용, 플레이는 WebView(웹 H5 게임 HTML) |
| /about·/contact·/terms·/privacy | `/info/[page]` | 웹 페이지를 앱 안 WebView 로(웹이 정본). 외부 도메인 링크는 브라우저로 |
| 기사 부가 | 목차(챕터 점프), 이전/다음 글, 링크 복사, 글자 크기, 진행바 | 레터 소제목 위치를 등록해 `measureLayout`+`scrollTo` |
| 푸시 알림 | `/settings/notifications` | 기기 권한·테스트 알림·알림 탭 시 기사 이동(payload `{slug, format?}`). **서버 발송·토큰 등록·FCM 은 미연동** |

미이행 / 보류(사유):
- **용어 해설(/words)**: 웹 데이터 원천이 letters 목록의 `keywords`인데 현재 API 목록 응답에 용어가 없다(0건 확인) → 데이터 원천부터 확인 필요. 앱에서는 기사 안 용어 탭 설명(시트)으로 제공.
- **공유 카드(/card/[id])**: 앱은 OS 공유 시트·링크 복사로 대체.
- **레터 구독·해지·에디터 팔로우(/letter/subscribe·unsubscribe·editors)**: 이메일 구독 API·에디터 데이터가 목업 단계(웹 코드 주석) → 서버 확정 후.
- **나의 LENS 리워드·배지·개인화 푸시·계정 동기화**: 서버 미구현(백엔드 인수인계 문서 P1~P4).
- **푸시 서버**: 토큰 등록·발송 팬아웃(`services/push`)과 Android FCM(Firebase 프로젝트·`google-services.json`)이 선행. 
