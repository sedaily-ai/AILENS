import { FeedPage } from "@/widgets/FeedPage";
import { fetchVideos, fetchWebtoons, fetchLensPosts, fetchSectionCards } from "@/shared/lib/cmsPostsApi";
import { fetchFollowingLetters } from "@/shared/lib/todayLettersApi";
import { fetchFollowingWordTerms } from "@/features/news-feed";
import type { CmsVideo, CmsWebtoon, CmsLens, CmsSectionCard } from "@/shared/lib/cmsPostsApi";
import type { TodayLetterCardLike } from "@/shared/lib/todayLettersApi";
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
  initialFollowingLetters: TodayLetterCardLike[];
  initialWebtoons: CmsWebtoon[];
  initialVideos: CmsVideo[];
  initialWordTerms: Term[];
  initialLensPosts: CmsLens[];
  initialTrendItems: CmsSectionCard[];
  initialColumnItems: CmsSectionCard[];
}

function HomeContent({
  initialFollowingLetters,
  initialWebtoons,
  initialVideos,
  initialWordTerms,
  initialLensPosts,
  initialTrendItems,
  initialColumnItems,
}: HomeContentProps) {
  return (
    <FeedPage
      selectedGroup={DEFAULT_GROUP}
      initialFollowingLetters={initialFollowingLetters}
      initialWebtoons={initialWebtoons}
      initialVideos={initialVideos}
      initialWordTerms={initialWordTerms}
      initialLensPosts={initialLensPosts}
      initialTrendItems={initialTrendItems}
      initialColumnItems={initialColumnItems}
    />
  );
}

// 서버 컴포넌트로 전환(2026-08-07, 홈 SSG 감사) — 이전엔 페이지 전체가
// 'use client'라 정적 HTML에 nav/footer(192자)뿐이었다. 홈 피드가 실제로
// 렌더하는 7개 섹션(FollowingFeed/WebtoonPreviewSection/VideoPreviewSection/
// WordsPreviewSection/LensPreviewSection/TrendingEconomySection/
// ColumnPreviewSection)의 데이터를 미리 가져와 FeedPage → NewsFeedTab →
// 각 섹션까지 initialX prop으로 내려준다. 나머지 섹션
// (TimelinePreviewSection 등)은 의도된 mock/placeholder라 그대로 둔다.
// 미니 헤드라인 섹션(MiniHeadlinesSection)은 2026-08-16 삭제됨 — PG 연동
// 전 유료 잠금 UI 컨셉만 있던 상태였는데 통째로 뺐다.
// LensPreviewSection은 2026-08-12에 추가(신설 당시 프리페치를 빠뜨려서
// 클라이언트 useEffect fetch만 있었다 — 실제 lens 글을 발행해 curl로
// 검증하던 중 첫 페인트에 아무것도 안 보이는 걸 발견, 다른 5개 섹션과
// 통일).
// TrendingEconomySection/ColumnPreviewSection도 2026-08-16에 같은 이유로
// 프리페치 추가 — 원래 client useEffect만 있어서 마운트 직후 FALLBACK
// 목업이 먼저 보였다가 ~1초 뒤 실제 데이터로 바뀌는 깜빡임이 있었다
// ("이미지가 늦게 최신화" 피드백). fetch+merge 로직은 두 섹션이 공유하는
// fetchSectionCards(shared/lib/cmsPostsApi.ts)로 뺐다.
// "이슈 톡톡"(FollowingFeed) 전체 삭제했다가(2026-08-12) 같은 날 사용자가
// 다시 부활 요청 — 프리페치도 원복.
// force-dynamic을 걸었다가(SSR 전환 직후) 다시 뺐다(2026-08-08) — 아래 fetch들이
// posts:* 태그로 캐시되므로, 매 요청 강제 재렌더링보다 Next가 이 라우트를
// 정적/캐시로 취급하고 admin 발행 시 POST /api/revalidate 가 revalidateTag()
// 로 정확히 무효화하는 쪽이 "클릭 즉시 이동" 요구에 맞다.

export default async function HomePage() {
  const [
    initialFollowingLetters,
    initialWebtoons,
    initialVideos,
    initialWordTerms,
    initialLensPosts,
    initialTrendItems,
    initialColumnItems,
  ] = await Promise.all([
    fetchFollowingLetters(),
    fetchWebtoons(),
    fetchVideos(),
    fetchFollowingWordTerms(),
    fetchLensPosts(),
    fetchSectionCards('trend'),
    fetchSectionCards('column'),
  ]);

  return (
    <HomeContent
      initialFollowingLetters={initialFollowingLetters}
      initialWebtoons={initialWebtoons}
      initialVideos={initialVideos}
      initialWordTerms={initialWordTerms}
      initialLensPosts={initialLensPosts}
      initialTrendItems={initialTrendItems}
      initialColumnItems={initialColumnItems}
    />
  );
}
