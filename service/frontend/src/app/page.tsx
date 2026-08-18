import { FeedPage } from "@/widgets/FeedPage";
import { fetchVideos, fetchWebtoons, fetchLensPosts, fetchCmsPosts } from "@/shared/lib/api/cmsPostsApi";
import { buildArchiveItems } from "@/shared/lib/archiveItems";
import { fetchFollowingWordTerms } from "@/features/news-feed";
import { fetchFollowingLetters } from "@/shared/lib/api/todayLettersApi";
import type { CmsVideo, CmsWebtoon, CmsLens } from "@/shared/lib/api/cmsPostsApi";
import type { ArchiveItem } from "@/shared/lib/archiveItems";
import type { Term } from "@/features/news-feed";
import type { TodayLetterCardLike } from "@/shared/lib/api/todayLettersApi";

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
  initialWordTerms: Term[];
  initialLensPosts: CmsLens[];
  initialArchiveItems: ArchiveItem[];
  initialHotLetters: TodayLetterCardLike[];
}

function HomeContent({
  initialWebtoons,
  initialVideos,
  initialWordTerms,
  initialLensPosts,
  initialArchiveItems,
  initialHotLetters,
}: HomeContentProps) {
  return (
    <FeedPage
      selectedGroup={DEFAULT_GROUP}
      initialWebtoons={initialWebtoons}
      initialVideos={initialVideos}
      initialWordTerms={initialWordTerms}
      initialLensPosts={initialLensPosts}
      initialArchiveItems={initialArchiveItems}
      initialHotLetters={initialHotLetters}
    />
  );
}

// 서버 컴포넌트로 전환(2026-08-07, 홈 SSG 감사) — 이전엔 페이지 전체가
// 'use client'라 정적 HTML에 nav/footer(192자)뿐이었다. 홈 피드가 실제로
// 렌더하는 섹션들(LatestGridSection/WebtoonPreviewSection/VideoPreviewSection/
// WordsPreviewSection)의 데이터를 미리 가져와 FeedPage → NewsFeedTab →
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
    initialWordTerms,
    initialLensPosts,
    letters,
    initialHotLetters,
  ] = await Promise.all([
    fetchWebtoons(),
    fetchVideos(),
    fetchFollowingWordTerms(),
    fetchLensPosts(),
    fetchCmsPosts('letters', undefined, 100),
    // "요즘 가장 많이 읽힌 글"(HotLettersRail) 서버 프리페치(2026-08-17,
    // 사용자 피드백: "왜 항상 늦게 나타나지, 빨리 뜨도록 하는거 안하고
    // 있나요") — 나머지 홈 섹션과 달리 이 사이드바만 initialItems 없이
    // 클라이언트 useEffect로만 불러와서 항상 빈 화면 → 딜레이 후 팝인이었다.
    // fetchFollowingLetters는 이미 "서버(app/page.tsx)와 클라이언트 양쪽이
    // 같은 로직을 쓰도록" 설계된 함수(todayLettersApi.ts 주석 참조)라 여기
    // 그대로 재사용.
    fetchFollowingLetters(5),
  ]);
  const initialArchiveItems = buildArchiveItems(letters, [], []);

  return (
    <HomeContent
      initialWebtoons={initialWebtoons}
      initialVideos={initialVideos}
      initialWordTerms={initialWordTerms}
      initialLensPosts={initialLensPosts}
      initialArchiveItems={initialArchiveItems}
      initialHotLetters={initialHotLetters}
    />
  );
}
