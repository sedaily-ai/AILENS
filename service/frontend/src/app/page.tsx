import { Suspense } from "react";
import { FeedPage } from "@/components/mbti/FeedPage";
import { fetchCmsPosts, fetchVideos, fetchWebtoons } from "@/shared/lib/cmsPostsApi";
import { fetchFollowingLetters } from "@/shared/lib/todayLettersApi";
import { fetchFollowingWordTerms } from "@/features/news-feed";
import type { CmsLetter, CmsVideo, CmsWebtoon } from "@/shared/lib/cmsPostsApi";
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
  initialCmsLetters: CmsLetter[];
}

function HomeContent({
  initialFollowingLetters,
  initialWebtoons,
  initialVideos,
  initialWordTerms,
  initialCmsLetters,
}: HomeContentProps) {
  return (
    <FeedPage
      selectedGroup={DEFAULT_GROUP}
      initialFollowingLetters={initialFollowingLetters}
      initialWebtoons={initialWebtoons}
      initialVideos={initialVideos}
      initialWordTerms={initialWordTerms}
      initialCmsLetters={initialCmsLetters}
    />
  );
}

// 서버 컴포넌트로 전환(2026-08-07, 홈 SSG 감사) — 이전엔 페이지 전체가
// 'use client'라 정적 HTML에 nav/footer(192자)뿐이었다. 홈 피드가 실제로
// 렌더하는 5개 섹션(FollowingFeed/WebtoonPreviewSection/VideoPreviewSection/
// WordsPreviewSection/MiniHeadlinesSection)의 데이터를 미리 가져와 FeedPage →
// NewsFeedTab → 각 섹션까지 initialX prop으로 내려준다. 나머지 섹션
// (TimelinePreviewSection/TrendingEconomySection/ColumnPreviewSection 등)은
// 의도된 mock/placeholder라 그대로 둔다.
// force-dynamic(SSR, 2026-08-08) — webtoon/page.tsx, letters/page.tsx와 동일
// 이유. 홈은 특히 방문 빈도가 가장 높아 이 설정이 없으면 신규 발행 콘텐츠가
// 가장 눈에 띄게 안 보이는 페이지가 된다.
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const [initialFollowingLetters, initialWebtoons, initialVideos, initialWordTerms, initialCmsLetters] =
    await Promise.all([
      fetchFollowingLetters(),
      fetchWebtoons(),
      fetchVideos(),
      fetchFollowingWordTerms(),
      fetchCmsPosts('letters', undefined, 50),
    ]);

  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white/50"></div></div>}>
      <HomeContent
        initialFollowingLetters={initialFollowingLetters}
        initialWebtoons={initialWebtoons}
        initialVideos={initialVideos}
        initialWordTerms={initialWordTerms}
        initialCmsLetters={initialCmsLetters}
      />
    </Suspense>
  );
}
