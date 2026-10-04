import { FeedPage } from "@/widgets/FeedPage";
import { fetchVideos, fetchWebtoons, fetchLensPosts, fetchPaperDates, fetchCmsPosts, toLensPreviewSummaries, toWebtoonPreviewSummaries, toVideoPreviewSummaries } from "@/shared/lib/api/cmsPostsApi";
import { buildArchiveItems } from "@/shared/lib/content/archiveItems";
import { pickLensPostsForHome, trimArchiveItemsForHome } from "@/shared/lib/content/homeFeedTrim";
import { fetchFollowingLetters } from "@/shared/lib/api/todayLettersApi";
import { fetchHomePlayerPosts, toAudioPreviewSummaries } from "@/shared/lib/api/homePlayerApi";
import type { CmsVideo, CmsWebtoon, CmsLens } from "@/shared/lib/api/cmsPostsApi";
import type { ArchiveItem } from "@/shared/lib/content/archiveItems";
import type { TodayLetterCardLike } from "@/shared/lib/api/todayLettersApi";
import type { HomePlayerPost } from "@/shared/lib/api/homePlayerApi";

// MBTI 페르소나 체계 폐지(2026-08-07) — 이전에는 여기서 viewMode
// ("feed" | "editor-select" | "briefing" | "story")를 useMbtiGroup 에 저장된
// 페르소나 값 기준으로 분기했다. 페르소나 선택 자체가 없어졌으므로 그 라우팅도
// 함께 걷어내고 항상 피드를 보여준다 — 실제로도 기존 기본값이 이미 "신규/
// 온보딩 미완 사용자도 바로 메인 피드 노출"이었으니 사용자 체감 변화는 없다.
// FeedPage 는 selectedGroup: MbtiGroupId 를 여전히 필수 prop 으로 받지만
// (다른 에이전트가 소유한 컴포넌트, 이번 정리 범위 밖) 내부적으로 값 자체를
// 거의 안 쓴다 — 고정 상수만 넘기고 이 페이지에서는 더 이상 저장/변경하지 않는다.
const DEFAULT_GROUP = "SF";

interface HomeContentProps {
  initialWebtoons: CmsWebtoon[];
  initialVideos: CmsVideo[];
  initialLensPosts: CmsLens[];
  initialArchiveItems: ArchiveItem[];
  initialHotLetters: TodayLetterCardLike[];
  initialHomePlayerPosts: HomePlayerPost[];
  paperDates?: string[];
}

function HomeContent({
  initialWebtoons,
  initialVideos,
  initialLensPosts,
  initialArchiveItems,
  initialHotLetters,
  initialHomePlayerPosts,
  paperDates,
}: HomeContentProps) {
  return (
    <FeedPage
      selectedGroup={DEFAULT_GROUP}
      initialWebtoons={initialWebtoons}
      initialVideos={initialVideos}
      initialLensPosts={initialLensPosts}
      initialArchiveItems={initialArchiveItems}
      initialHotLetters={initialHotLetters}
      initialHomePlayerPosts={initialHomePlayerPosts}
      paperDates={paperDates}
    />
  );
}

// 서버 컴포넌트로 전환(2026-08-07, 홈 SSG 감사) — 이전엔 페이지 전체가
// 'use client'라 정적 HTML에 nav/footer(192자)뿐이었다. 홈 피드가 실제로
// 렌더하는 섹션들(LatestGridSection/WebtoonPreviewSection/VideoPreviewSection)의 데이터를 미리 가져와 FeedPage → NewsFeedTab →
// 각 섹션까지 initialX prop으로 내려준다. 나머지 섹션(NewsTimeMachineSection
// 등)은 의도된 mock/placeholder라 그대로 둔다.
//
// 홈 구조 개편(2026-08-17, 뉴닉 홈 참고) — "이슈 톡톡"(FollowingFeed)과
// "인사이트"(ColumnPreviewSection) 형식 기준 섹션 2개를 "최신 뉴스"
// 히어로+그리드(LatestGridSection)로 교체했다. 카테고리 레일 6개
// (증시/부동산/...)도 만들어봤지만 카드마다 이미 붙는 카테고리 태그와
// 순수 중복이라 바로 뺐다(사용자 지적) — LatestGridSection.tsx 참조.
// fetchCmsPosts('letters', ...) + buildArchiveItems 한 번으로 최신순
// 슬라이스를 만든다. initialLensPosts(fetchLensPosts())는 이제
// LensPreviewSection 대신 이 히어로의 원본 데이터로 쓰인다
// (NewsFeedTab.tsx의 lensToHeroItem 참조) — 별도 섹션이 아니라 최신
// 뉴스 히어로 한 자리로 흡수됐다.
//
// force-dynamic을 걸었다가(SSR 전환 직후) 다시 뺐다(2026-08-08) — 아래 fetch들이
// posts:* 태그로 캐시되므로, 매 요청 강제 재렌더링보다 Next가 이 라우트를
// 정적/캐시로 취급하고 admin 발행 시 POST /api/revalidate 가 revalidateTag()
// 로 정확히 무효화하는 쪽이 "클릭 즉시 이동" 요구에 맞다.

export default async function HomePage() {
  const [
    initialWebtoons,
    initialVideos,
    initialLensPosts,
    letters,
    initialHotLetters,
    initialHomePlayerPosts,
  ] = await Promise.all([
    fetchWebtoons(),
    fetchVideos(),
    // 홈은 최신 100건이면 충분하다(히어로 4지면 탭·카테고리 줄·최신 그리드 모두 최신 몇 건만 씀) — 2026-10-03.
    // 예전엔 기본값 1000건을 통째로 받아 홈 HTML에 약 1.8MB(압축 전)로 심었다. 100건은 LensPreviewSection의 클라이언트 조회와 같은 캐시 키(lens:100)다.
    fetchLensPosts(100),
    fetchCmsPosts('letters', undefined, 100),
    // "요즘 가장 많이 읽힌 글"(HotLettersRail) 서버 프리페치(2026-08-17,
    // 사용자 피드백: "왜 항상 늦게 나타나지, 빨리 뜨도록 하는거 안하고
    // 있나요") — 나머지 홈 섹션과 달리 이 사이드바만 initialItems 없이
    // 클라이언트 useEffect로만 불러와서 항상 빈 화면 → 딜레이 후 팝인이었다.
    // fetchFollowingLetters는 이미 "서버(app/page.tsx)와 클라이언트 양쪽이
    // 같은 로직을 쓰도록" 설계된 함수(todayLettersApi.ts 주석 참조)라 여기
    // 그대로 재사용.
    fetchFollowingLetters(10),
    // 오디오 섹션(AudioPreviewSection) 서버 프리페치(2026-08-21).
    fetchHomePlayerPosts(),
  ]);
  // "최신 뉴스" 그리드에도 lens("4가지 시선") 글을 섞는다(2026-08-20, 사용자
  // 요청 — 앞으로 발행되는 글은 전부 이 4포맷 톤으로 나가는데, 그리드는 여전히
  // letters 채널만 봐서 letters 발행이 뜸해지면 그리드가 계속 낡은 채로 남는다).
  //
  // 처음엔 히어로 캐러셀의 슬라이드 개수(LENS_HOME_HERO_COUNT=5)만큼 통째로
  // 뺐는데, 그러면 하루에 신규 lens 글이 5건 미만이면(보통 그렇다) 전부
  // 그리드에서 숨어버려 "새 글 올려도 그리드가 안 쌓인다"는 문제가 됐다
  // (2026-08-20, 사용자가 실제로 겪고 지적). 캐러셀은 화살표를 눌러야 2번째
  // 슬라이드부터 보이므로, 화면에 항상 동시에 보이는 건 1번째(가장 최신) 슬라이드
  // 뿐이다 — `/lens` 목록 페이지(LensListClient.tsx)도 같은 이유로 "가장 새로운
  // 이슈" 히어로엔 딱 1건만 빼고 나머지는 바로 "다른 이슈"에 쌓는다. 그 관례를
  // 그대로 따라 여기서도 1건만 제외한다.
  // 화면이 쓰는 건수(최신 그리드 8 + 카테고리 카드당 3)만 클라이언트로 보낸다(2026-10-04) — homeFeedTrim.ts 참조.
  // 이전엔 100건 전부(약 74KB)를 HTML에 실었다. 기사 링크는 서버가 렌더한 DOM에 그대로 있어 크롤러가 보는 구조는 같다.
  const initialArchiveItems = trimArchiveItemsForHome(
    buildArchiveItems(
      letters,
      [],
      [],
      initialLensPosts.slice(1),
    ),
  );

  // 2026-09-03 — LensPreviewSection(히어로 "오늘의 이슈, 4가지 시선")은
  // 포맷당 question 한 줄만 쓰는데, 그 앞은 4포맷 전체 본문까지 담긴
  // initialLensPosts를 그대로 클라이언트로 직렬화하고 있었다(홈 HTML
  // 6.7MB의 주된 원인 — cmsPostsApi.ts의 toLensPreviewSummaries() 주석
  // 참조). buildArchiveItems()는 이미 위에서 필요한 필드만 뽑아 별도
  // ArchiveItem[]로 만들어 두므로, 여기서 축약해도 그 결과엔 영향 없다.
  // 2026-10-04 — 지면 탭 4개가 실제로 쓰는 최대 16건만 보낸다(이전 100건, 약 109KB) — homeFeedTrim.ts 참조.
  const lensPreviewPosts = toLensPreviewSummaries(pickLensPostsForHome(initialLensPosts));
  // 홈 지면 헤더의 ◀(이전 지면)이 가는 날짜(2026-10-04) — 지면이 있는 날 중 홈이 보여 주는 날(가장 최근) 바로 앞날. 주말처럼 지면이 없는 날은 건너뛴다.
  const allPaperDates = await fetchPaperDates();
  const shownDate = lensPreviewPosts.reduce((m, l) => (l.date > m ? l.date : m), "");
  const paperDates = allPaperDates.filter((d) => d <= shownDate).slice(0, 30);

  // 2026-09-03 — 같은 문제를 오디오 섹션에서도 발견. AudioPreviewSection은
  // 최대 4장만 쓰는데 최대 1000건(각 건 팟캐스트 전체 대본 포함)을 그대로
  // 넘기고 있었다 — homePlayerApi.ts의 toAudioPreviewSummaries() 참조.
  // 이 값의 유일한 소비자가 AudioPreviewSection이라 여기서 잘라도 안전.
  const audioPreviewPosts = toAudioPreviewSummaries(initialHomePlayerPosts);

  // 2026-09-03 — 같은 패턴을 웹툰/영상 미리보기에서도 확인(오디오 축소가
  // 5.43MB→2.9MB로 예상보다 훨씬 커서, 남은 섹션도 전수 점검). 둘 다 상위
  // 4개만 그리는데 최대 1000건 전체를 넘기고 있었다 — cmsPostsApi.ts의
  // toWebtoonPreviewSummaries()/toVideoPreviewSummaries() 참조. 이 값들도
  // 각각 WebtoonPreviewSection/VideoPreviewSection 외 다른 소비자가 없다.
  const webtoonPreviewItems = toWebtoonPreviewSummaries(initialWebtoons);
  const videoPreviewItems = toVideoPreviewSummaries(initialVideos, initialLensPosts);

  return (
    <HomeContent
      initialWebtoons={webtoonPreviewItems}
      initialVideos={videoPreviewItems}
      initialLensPosts={lensPreviewPosts}
      initialArchiveItems={initialArchiveItems}
      initialHotLetters={initialHotLetters}
      initialHomePlayerPosts={audioPreviewPosts}
      paperDates={paperDates}
    />
  );
}
