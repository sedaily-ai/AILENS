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

// 홈은 항상 메인 피드를 보여 준다. FeedPage는 selectedGroup: MbtiGroupId를 필수 prop으로 받지만 내부적으로 거의 쓰지 않으므로 고정 상수만 넘긴다.
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

// 서버 컴포넌트 — 홈 피드가 렌더하는 섹션(LatestGridSection/WebtoonPreviewSection/VideoPreviewSection)의 데이터를 서버에서 미리 가져와
// FeedPage → NewsFeedTab → 각 섹션까지 initialX prop으로 내려준다. 정적 HTML에 콘텐츠가 포함되어야 SEO에 유리하다.
// 나머지 섹션(NewsTimeMachineSection 등)은 의도된 mock/placeholder라 그대로 둔다.
// 최신 뉴스 히어로+그리드(LatestGridSection)는 fetchCmsPosts('letters', ...) + buildArchiveItems 한 번으로 최신순 슬라이스를 만든다.
// initialLensPosts(fetchLensPosts())는 이 히어로의 원본 데이터로 쓰인다(NewsFeedTab.tsx의 lensToHeroItem 참조).
//
// force-dynamic은 쓰지 않는다. 아래 fetch가 posts:* 태그로 캐시되므로 Next가 라우트를 정적/캐시로 취급하고,
// admin 발행 시 POST /api/revalidate가 revalidateTag()로 정확히 무효화하는 방식이 "클릭 즉시 이동"에 맞다.

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
    // 홈은 최신 100건이면 충분하다(히어로 4지면 탭·카테고리 줄·최신 그리드가 최신 몇 건만 사용). 기본값 1000건은 홈 HTML에 약 1.8MB를 싣는다.
    // 100건은 LensPreviewSection의 클라이언트 조회와 같은 캐시 키(lens:100)다.
    fetchLensPosts(100),
    fetchCmsPosts('letters', undefined, 100),
    // "요즘 가장 많이 읽힌 글"(HotLettersRail) 서버 프리페치. 클라이언트 useEffect로만 불러오면 빈 화면 후 팝인되므로 서버에서 가져온다.
    // fetchFollowingLetters는 서버(app/page.tsx)와 클라이언트가 같은 로직을 쓰도록 설계되어 있다(todayLettersApi.ts 참조).
    fetchFollowingLetters(10),
    // 오디오 섹션(AudioPreviewSection) 서버 프리페치.
    fetchHomePlayerPosts(),
  ]);
  // "최신 뉴스" 그리드에도 lens("4가지 시선") 글을 섞는다. 그리드가 letters 채널만 보면 letters 발행이 뜸해질 때 그리드가 낡은 채로 남는다.
  // 히어로 캐러셀에서 제외하는 것은 화면에 항상 보이는 1번째(가장 최신) 슬라이드 1건뿐이다. 나머지를 통째로 빼면 신규 글이 적은 날 그리드에 쌓이지 않는다.
  // /lens 목록 페이지(LensListClient.tsx)도 같은 관례를 따른다.
  // 화면이 쓰는 건수(최신 그리드 8 + 카테고리 카드당 3)만 클라이언트로 보낸다(homeFeedTrim.ts 참조). 기사 링크는 서버 렌더 DOM에 있어 크롤러가 보는 구조는 같다.
  const initialArchiveItems = trimArchiveItemsForHome(
    buildArchiveItems(
      letters,
      [],
      [],
      initialLensPosts.slice(1),
    ),
  );

  // LensPreviewSection은 포맷당 question 한 줄만 쓰므로 4포맷 전체 본문 대신 축약본만 직렬화한다(cmsPostsApi.ts의 toLensPreviewSummaries() 참조).
  // buildArchiveItems()가 필요한 필드를 이미 별도 ArchiveItem[]로 만들어 두므로 축약해도 그 결과엔 영향이 없다.
  // 지면 탭 4개가 쓰는 최대 16건만 보낸다(homeFeedTrim.ts 참조).
  const lensPreviewPosts = toLensPreviewSummaries(pickLensPostsForHome(initialLensPosts));
  // 홈 지면 헤더의 ◀(이전 지면)이 가는 날짜 — 지면이 있는 날 중 홈이 보여 주는 날(가장 최근) 바로 앞날. 지면이 없는 날(주말 등)은 건너뛴다.
  const allPaperDates = await fetchPaperDates();
  const shownDate = lensPreviewPosts.reduce((m, l) => (l.date > m ? l.date : m), "");
  const paperDates = allPaperDates.filter((d) => d <= shownDate).slice(0, 30);

  // AudioPreviewSection은 최대 4장만 쓰므로 축약해 넘긴다(homePlayerApi.ts의 toAudioPreviewSummaries() 참조). 이 값의 유일한 소비자라 잘라도 안전하다.
  const audioPreviewPosts = toAudioPreviewSummaries(initialHomePlayerPosts);

  // 웹툰/영상 미리보기도 상위 4개만 쓰므로 축약해 넘긴다(cmsPostsApi.ts의 toWebtoonPreviewSummaries()/toVideoPreviewSummaries() 참조). 각각 WebtoonPreviewSection/VideoPreviewSection 외 소비자가 없다.
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
