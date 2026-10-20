'use client';

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { MbtiGroupId } from "@/shared/data/mbtiGroups";
import type { CmsVideo, CmsWebtoon, CmsLens } from "@/shared/lib/api/cmsPostsApi";
import type { ArchiveItem } from "@/shared/lib/content/archiveItems";
import type { TodayLetterCardLike } from "@/shared/lib/api/todayLettersApi";
import type { HomePlayerPost } from "@/shared/lib/api/homePlayerApi";
import { SearchOverlay } from "@/shared/ui/search/SearchOverlay";
import { Header } from "@/widgets/Header";
import { HomeSideBar } from "@/widgets/HomeSideBar";

// Feature Tab Components
import { NewsFeedTab } from "@/features/news-feed";
import { buildHeaderTabs } from "@/shared/lib/headerTabs";

interface Props {
  selectedGroup: MbtiGroupId;
  onChangeGroup?: () => void;
  onSwitchToStory?: () => void;
  onMbtiChange?: (group: MbtiGroupId) => void;
  // 빌드타임(app/page.tsx) 서버 프리페치 값. NewsFeedTab까지 그대로 하향 전달한다.
  initialWebtoons?: CmsWebtoon[];
  initialVideos?: CmsVideo[];
  initialLensPosts?: CmsLens[];
  paperDates?: string[];
  initialArchiveItems?: ArchiveItem[];
  initialHotLetters?: TodayLetterCardLike[];
  initialHomePlayerPosts?: HomePlayerPost[];
}

export function FeedPage({
  selectedGroup,
  onMbtiChange,
  initialWebtoons,
  initialVideos,
  initialLensPosts,
  paperDates,
  initialArchiveItems,
  initialHotLetters,
  initialHomePlayerPosts,
}: Props) {
  const [showSearch, setShowSearch] = useState(false);

  // 옛 주소 정리(2026-10-19 기능 다이어트). 옛 홈 서랍·'나의 DNA(준비 중)' 탭은 제거됐다.
  // CloudFront 캐시 키에 쿼리가 없어(cache-policy-rsc-aware.json) 서버 리다이렉트를 쓰면 같은 키('/')의 모든 요청이
  // 리다이렉트로 캐시될 수 있으므로 브라우저에서 처리한다. 목적지는 다시 이 규칙에 걸리지 않아 반복 이동이 없다.
  //  - /?tab=archive → 나의 LENS 내 서랍(비로그인은 로그인 후 서랍으로 복귀)
  //  - /?tab=dna, /?tab=feed → 홈(주소의 tab만 지운다)
  const router = useRouter();
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    if (tab === 'archive') {
      router.replace('/my-lens?tab=archive');
      return;
    }
    if (tab === 'dna' || tab === 'feed') {
      params.delete('tab');
      const qs = params.toString();
      window.history.replaceState(window.history.state, '', `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`);
    }
  }, [router]);

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex flex-col">
      {/* Header - 1단 통합 */}
      {/* 탭 배열은 headerTabs.ts의 buildHeaderTabs()를 그대로 쓴다. 이 배열의 항목은 모두 href 이동이라 onClick 전환이 없으며,
          별도 사본을 두면 상단 탭 개편 때 옛 링크가 남는다(SiteFooter.tsx CONTENT_LINKS는 아직 별도 사본이므로 주의).
          홈 화면에는 활성 탭이 없어 active 인자도 필요 없다. */}
      <Header
        searchOpen={showSearch} onSearch={() => setShowSearch((open) => !open)}
        tabs={buildHeaderTabs()}
      />

      <SearchOverlay open={showSearch} onClose={() => setShowSearch(false)} />

      {/* 메인 콘텐츠 */}
      <style>{`
        @keyframes tabFadeIn {
          0% { opacity: 0; transform: translateY(6px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .tab-fade-in { animation: tabFadeIn 0.25s ease-out both; }
      `}</style>
      <main id="main-content" tabIndex={-1} className="flex-1">
        {/* 홈(/)에는 sr-only h1로 페이지 주제 신호를 준다. 각 섹션이 h2부터 동등한 weight로 시작해 하나를 h1으로 승격하면
            시각 위계가 깨지므로, title/og:title과 같은 문구를 시각적으로 숨겨 추가한다(GEO·접근성). */}
        <h1 className="sr-only">AI LENS — 서울경제신문의 AI 경제 뉴스</h1>
        <div className="tab-fade-in">
        {/* 피드 - NewsFeedTab 컴포넌트 */}
        {(
          <NewsFeedTab
            selectedGroup={selectedGroup}
            onMbtiChange={onMbtiChange}
            initialWebtoons={initialWebtoons}
            initialVideos={initialVideos}
            initialLensPosts={initialLensPosts}
            paperDates={paperDates}
            initialArchiveItems={initialArchiveItems}
            initialHomePlayerPosts={initialHomePlayerPosts}
            sidebar={
              <HomeSideBar className="hidden lg:block" initialHotLetters={initialHotLetters} railLimit={6} style={{ paddingTop: 52 }} />
            }
          />
        )}

        </div>

      </main>

    </div>
  );
}
