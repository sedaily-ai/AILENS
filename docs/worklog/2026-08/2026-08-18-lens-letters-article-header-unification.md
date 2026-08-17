# 2026-08-18 시선/레터 상세 페이지 헤더·공유 영역 통일

작성: Claude Code
관련: `service/frontend/src/app/lens/[slug]/LensViewClient.tsx`,
`service/frontend/src/app/letters/[id]/LetterDetailClient.tsx`,
`service/frontend/src/features/news-feed/components/HomeSideBar.tsx`,
`service/frontend/src/features/news-feed/components/HotLettersRail.tsx`,
커밋 `1ac11f0`, `4df3893`, 배포 릴리스 `20260817-161503`

## 배경

전날(2026-08-17) 세션에서 `/lens/[slug]` 상세 페이지에 실제 sedaily.com
영문 사이트 컴포넌트를 참고해 공유 버튼·글자크기·인쇄 기능을 새로 이식했다.
이번 세션은 그 마무리 다듬기(구글 아이콘, 배지 위치, 간격)로 시작했는데,
사용자가 "이 헤더/공유버튼/발행일/카테고리 구성을 전체 글에 동일하게
적용해야 한다"고 요청 — `/letters/[id]` 레터 상세 페이지도 같은 헤더
구성으로 맞추는 작업으로 이어졌다. 웹툰 상세 페이지는 의도적으로 다른
다크 톤 "만화방" 디자인이라 이번 통일 대상에서 제외했고(사용자 확인),
비디오 상세 페이지도 사용자가 명시적으로 제외했다.

## 한 것

### 1. `/lens/[slug]` 마무리 다듬기
- "구글 검색 선호 출처로 추가" 링크에 구글 공식 4색 "G" 아이콘 추가.
- "4가지 시선" 카테고리 배지를 날짜 오른쪽에서 좌측(날짜보다 앞)으로
  이동 — 카테고리 태그는 독자 시선이 가장 먼저 닿는 자리에 있어야
  한다는 사용자 피드백. 이어서 구글 링크도 같은 줄 우측 끝으로 합쳐
  좌:[배지+날짜] / 우:[구글 링크] 한 줄 구성으로 정리.
- 공유 버튼에 카카오톡·인스타그램 아이콘 추가. 카카오는 SDK 키(Kakao
  Developers 앱 등록 필요, 현재 레포에 없음)가 없어 링크 복사로 대체,
  인스타그램도 데스크톱 웹에 링크 공유 API가 없어 마찬가지로 링크
  복사로 대체 — 이미 `features/timeline/components/ShareBar.tsx`가 같은
  문제를 같은 방식으로 풀어둔 선례를 따름. 처음엔 브랜드 컬러 배지로
  넣었다가, 나머지 공유 아이콘(FB/Twitter/LinkedIn)과 톤이 안 맞는다는
  피드백으로 같은 회색 선(스케치) 스타일 SVG로 다시 그림.
- 글자크기(A A A)·인쇄 버튼이 각자 테두리를 가진 채 나란히 붙어있어
  "따로 붙은 두 부품"처럼 보인다는 피드백 — 테두리 하나로 감싸고 사이에
  얇은 구분선만 넣어 한 세트로 통일.
- 홈 사이드바(`HomeSideBar`)가 헤더에 바로 붙어 보이는 문제 — 본문 칼럼의
  `paddingTop`과 값을 맞추도록 `style` prop 추가.
- 발행일 앞에 "입력" 라벨 추가, "· 서울경제" 문구는 제거(페이지 전체가
  이미 서울경제 브랜드라 반복 불필요하다는 판단).

### 2. `/letters/[id]` 헤더를 lens와 동일 구성으로 통일
- 배지·발행일(달력 아이콘 + "입력")·구글 선호 출처 링크·공유 툴바(카카오톡
  /인스타그램/FB/Twitter/LinkedIn/링크복사)·글자크기+인쇄 컨트롤을 lens와
  같은 컴포넌트·같은 레이아웃으로 이식(로컬 복제 — 이유는 "결정" 참조).
- 처음 붙였을 때 메타줄을 `<h1>` 앞에 두는 실수를 해서 "제목 위에 떠
  있다"는 지적을 받음 — lens와 같은 순서(헤드라인 → 부제 → 메타줄 →
  공유 툴바, 서로 붙어서)로 재배치. 원래 메타줄과 공유 툴바 사이에 끼어
  있던 부제·팟캐스트 플레이어는 툴바 아래로 옮김.
- 발행일: `ApiLetter`엔 개별 `date` 필드가 없다(배치 응답
  `ApiTodayLettersResponse.date`에만 존재, 확인함) — 이미 파일에 있던
  `letter.id`의 `l-YYYYMMDD-XX` 패턴 파싱을 재사용해 표시, 실패 시
  `publish_date`로 폴백.
- 글자크기 컨트롤이 실제로 작동하도록 레터 본문(`LetterBlock`)의 여러
  분기 중 실제로 읽는 프로즈(리드 문단·콜아웃 본문·Q&A 답변·기본 문단)
  fontSize를 `calc(Npx * var(--letter-font-scale, 1))`로 배선. 섹션헤더/
  라벨류는 lens가 헤딩·배지를 스케일 대상에서 뺀 것과 같은 기준으로 제외.
- 부제(`letter.subtitle`)에 원본 마커 문법("■", "[태그]")이 그대로
  노출되는 문제 발견 — 화면 표시 시점에만 걷어내는 `cleanSubtitle()`
  추가(데이터 자체는 안 건드림), 2줄 클램프 + 폰트 15→14px로 축소.
- 헤더 배지가 `letter.editorName`(MBTI 페르소나 폐지 이후 모든 레터가
  항상 "AI LENS" 한 값)을 쓰고 있어 정보성이 없고 사이트 로고와 중복되는
  문제 발견 — `letterCategoryLabel()`을 추가해 `letter.category` →
  `letter.section` 한글 라벨(트렌드/칼럼/이슈 브리핑) → 없으면 "AI 레터"
  순으로 폴백하도록 교체.
- 팟캐스트 미니 플레이어("아직 준비 중이에요" 회색 카드) 완전 삭제 —
  대부분의 레터가 오디오가 없어 항상 비활성 카드만 보였음. 전용
  컴포넌트(`LetterPodcastPlayer`)와 헬퍼(`fmtTime`), 이제 안 쓰는 import
  (`LETTER_PODCASTS`, `letterPodcastUrl`, `useRef`)도 같이 정리해 죽은
  코드를 안 남김.

### 3. SEO/GEO/AEO 점검 (조사 에이전트 위임 후 발견분 직접 수정)
- `lens/[slug]/page.tsx`: `generateMetadata`(title/description/canonical/OG/
  Twitter), `NewsArticle`+`BreadcrumbList` JSON-LD, `speakable.cssSelector`
  (`[data-speakable="headline"|"summary"|"qa"]`) 전부 정상 — 오늘 client
  쪽 리마크업 이후에도 세 셀렉터 모두 `LensViewClient.tsx`에 그대로 남아
  있음을 확인. 문제 없음.
- **`letters/[id]/page.tsx`에서 실제 버그 발견·수정**: `usableSubtitle()`이
  옛 MBTI 플레이스홀더 문구 하나만 걸러내고 있어서, subtitle에 "■"/
  "[태그]" 마커가 섞여 있으면 `<meta name="description">`·OG·Twitter
  description·JSON-LD `description`/`abstract`에 마커가 그대로 노출되고
  있었다 — 오늘 화면 표시용으로 만든 `cleanSubtitle()`과 똑같은 문제인데
  서버 메타데이터 쪽은 못 고쳤던 부분. `usableSubtitle()`에 같은 마커
  제거 규칙을 추가해 수정, 재배포(릴리스 `20260817-163119`)까지 반영.
- `speakable` 셀렉터는 `letters/[id]`도 동일하게 확인, 오늘 헤더 재배치·
  팟캐스트 삭제로 인한 손상 없음.
- `sitemap.ts`: `/lens/[slug]`·`/letters/[id]` 둘 다 실제 데이터 기반으로
  생성되고 있고 `lastModified`도 실제 콘텐츠 날짜를 반영. 레터는 최근
  14일(`SEED_DAYS`)치만 포함되는 의도된 제한이 있음(사이트맵 크기·응답
  시간 트레이드오프로 이미 주석에 명시돼 있던 기존 결정, 오늘 새로
  발견된 문제 아님) — 그 외 이상 없음.
- `LetterPodcastPlayer` 삭제로 완전히 소비자가 없어진 `letterPodcastUrl`
  (`shared/lib/audioPlayer.ts`)과 `LETTER_PODCASTS`(`features/news-feed/
  data/letterPodcasts.ts`)를 발견했으나, 이 데이터 파일은 과거 세션에서
  "id 체계가 바뀌어 영구히 재사용 불가한 PoC"라는 이유로 이미 한 번
  "그대로 둔다"고 의도적으로 결정된 파일이라 이번엔 손대지 않고 사용자
  판단에 맡긴다(아래 "다음" 참조).
- `npx eslint`로 오늘 수정한 4개 파일 점검: `FontSizeControl`의
  localStorage 하이드레이션 `useEffect`가 `react-hooks/set-state-in-effect`
  에 걸리는데, 같은 패턴이 `widgets/AnnouncementBar/AnnouncementBar.tsx`
  등 기존 코드에도 이미 있었다(직접 재현 확인) — 이 세션에서 새로
  만든 회귀가 아니라 프로젝트 전반에 걸친 기존 관례라 이번엔 손대지
  않음. `LetterDetailClient.tsx`의 미사용 import(`UserMenu`, 오늘 이전부터
  있던 잔재)는 간단해서 바로 정리.

### 4. 배포
`./deploy.sh` 총 2회 실행 — 1차 릴리스 `20260817-161503`(헤더 통일),
2차 릴리스 `20260817-163119`(SEO 메타데이터 버그 수정). 둘 다 헬스체크
200 확인. 매 배치 편집 후 `npx tsc --noEmit` + `npm run build`로 검증.

## 결정

- **웹툰/비디오 상세 페이지는 이번 통일 대상에서 제외.** 웹툰은
  2026-08-11에 의도적으로 다크 톤 "만화방" 디자인(전역 헤더 없음)으로
  따로 만들어져 있어 사용자에게 먼저 물어봤고, 제외로 확정. 비디오는
  사용자가 별도 확인 없이 바로 "패스"라고 명시.
- **공유 버튼·아이콘 세트를 `shared/`로 추출하지 않고 lens 파일의 로컬
  복제를 letters에도 그대로 재사용.** 이미 이 파일들이 Facebook/Twitter/
  LinkedIn 아이콘을 각자 로컬 복제해 둔 선례를 따랐고, `CLAUDE.md`가
  "shared/ 수정 필요 시 먼저 설명하고 승인 받기"·"한 번에 하나의 작업만"을
  요구하는 상황에서 오늘 세션 중 실시간으로 여러 차례 디자인이 바뀌는
  걸 감안하면 즉시 안전하게 반영 가능한 쪽을 택했다. **다음 세션에서
  두 파일의 공유 툴바 관련 코드(ShareButtons/아이콘 6종/PrintButton/
  GoogleIcon, FontSizeControl은 CSS 변수명만 다름)를 `shared/ui`로
  추출하는 걸 권장** — 지금은 완전히 동일한 코드가 두 파일에 중복돼
  있어, 다음에 또 "왜 다르지" 같은 불일치가 생길 실질적 리스크가 있다.
- **카카오톡·인스타그램 공유는 SDK/API 연동 대신 링크 복사로 처리.**
  Kakao는 JS SDK + 앱 키 등록(도메인 인증 포함)이 필요한데 레포에 없고,
  Instagram은 애초에 데스크톱 웹에서 임의 링크를 피드/스토리로 보내는
  공식 API 자체가 없다(앱 인텐트만 가능) — `features/timeline/
  components/ShareBar.tsx`가 이미 같은 결론을 냈던 선례를 그대로 따름.

## 다음

- `shared/ui`로 공유 툴바 컴포넌트 추출 (위 "결정" 참조) — lens/letters
  두 파일에 완전히 동일한 코드가 중복돼 있는 상태.
- `letterPodcastUrl`(`shared/lib/audioPlayer.ts`)·`LETTER_PODCASTS`
  (`features/news-feed/data/letterPodcasts.ts`)는 이제 진짜 소비자가
  0명이다 — 과거엔 "PoC라 남겨둠"이 결정이었지만 그때는 아직 호출부
  (`LetterPodcastPlayer`)가 있었다. 지금은 그 호출부 자체가 삭제돼
  상황이 바뀌었으니, 완전 삭제할지 계속 보류할지 다음에 확인.
- 사용자가 새 사이트맵을 Search Console에 직접 제출 예정 — `/sitemap.xml`
  자체는 이번 세션 변경과 무관하게 정상 생성되고 있음을 확인했다.
