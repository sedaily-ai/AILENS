import { FeedPage } from "@/widgets/FeedPage";
import { fetchVideos, fetchWebtoons, fetchLensPosts, fetchCmsPosts } from "@/shared/lib/cmsPostsApi";
import { buildArchiveItems } from "@/shared/lib/archiveItems";
import { fetchFollowingWordTerms } from "@/features/news-feed";
import type { CmsVideo, CmsWebtoon, CmsLens } from "@/shared/lib/cmsPostsApi";
import type { ArchiveItem } from "@/shared/lib/archiveItems";
import type { Term } from "@/features/news-feed";

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
}

function HomeContent({
  initialWebtoons,
  initialVideos,
  initialWordTerms,
  initialLensPosts,
  initialArchiveItems,
}: HomeContentProps) {
  return (
    <FeedPage
      selectedGroup={DEFAULT_GROUP}
      initialWebtoons={initialWebtoons}
      initialVideos={initialVideos}
      initialWordTerms={initialWordTerms}
      initialLensPosts={initialLensPosts}
      initialArchiveItems={initialArchiveItems}
    />
  );
}

// 서버 컴포넌트로 전환(2026-08-07, 홈 SSG 감사) — 이전엔 페이지 전체가
// 'use client'라 정적 HTML에 nav/footer(192자)뿐이었다. 홈 피드가 실제로
// 렌더하는 섹션들(LatestGridSection/CategoryRailSection x6/WebtoonPreviewSection/
// VideoPreviewSection/WordsPreviewSection/LensPreviewSection)의 데이터를 미리
// 가져와 FeedPage → NewsFeedTab → 각 섹션까지 initialX prop으로 내려준다.
// 나머지 섹션(NewsTimeMachineSection 등)은 의도된 mock/placeholder라 그대로 둔다.
//
// 홈 구조 개편(2026-08-17, 뉴닉 홈 참고) — "이슈 톡톡"(FollowingFeed)과
// "인사이트"(ColumnPreviewSection) 형식 기준 섹션 2개를 "최신 뉴스"
// 히어로+그리드(LatestGridSection) + 카테고리 레일 6개(CategoryRailSection)로
// 교체했다. 그 둘이 각자 다른 API를 부르던 걸 letters 전체 fetch 한 번
// (fetchCmsPosts('letters', ...) + buildArchiveItems)으로 합쳐서, 최신순
// 슬라이스와 카테고리별 필터 양쪽에 재사용한다 — 네트워크 요청도 줄고
// "형식별로 따로 캐시가 어긋나는" 문제도 없어진다.
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
  ] = await Promise.all([
    fetchWebtoons(),
    fetchVideos(),
    fetchFollowingWordTerms(),
    fetchLensPosts(),
    fetchCmsPosts('letters', undefined, 100),
  ]);
  const initialArchiveItems = buildArchiveItems(letters, [], []);

  return (
    <HomeContent
      initialWebtoons={initialWebtoons}
      initialVideos={initialVideos}
      initialWordTerms={initialWordTerms}
      initialLensPosts={initialLensPosts}
      initialArchiveItems={initialArchiveItems}
    />
  );
}
