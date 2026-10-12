'use client';

import { useState } from 'react';
import type { CompareCardData } from '@/shared/lib/content/compareCard';
import { Header } from '@/widgets/Header';
import { SearchOverlay } from '@/shared/ui/search/SearchOverlay';
import { buildHeaderTabs } from '@/shared/lib/headerTabs';
import { ONBOARDING_CSS } from './onboardingStyles';
import { HeroSection } from './sections/HeroSection';
import { FormatGlanceSection } from './sections/FormatGlanceSection';
import { FeatureMapSection } from './sections/FeatureMapSection';
import { MadeBySection } from './sections/MadeBySection';
import { NewsletterSection } from './sections/NewsletterSection';

/**
 * /onboarding — AI LENS 서비스 소개(로그인 불필요).
 * 이 화면이 할 일: ① 메일을 받을지 결정하게 하기 ② LENS를 한눈에 보여주기 ③ 어떤 기능이 있는지 알려주기.
 * 순서는 방문자가 품는 질문 순서다: 이게 뭐야(히어로) → 직접 보여줘(비교 카드) → 뭘 할 수 있어(기능 지도) → 믿을 만해(만드는 방식) → 받을까(메일).
 *
 * ⚠️ 이름 혼동 주의 — "온보딩" 화면이 하나 더 있다. `features/onboarding/OnboardingFlow.tsx`(질문 2개 + 결과)는 `/start` 라우트에서 동작한다.
 * 온보딩 흐름 수정 요청은 둘 중 어느 화면인지 먼저 확인할 것.
 */
export interface OnboardingGlance {
  card: CompareCardData;
  /** 오늘 1면 기사의 정본 주소(4형식 탭 화면). */
  articleHref: string;
}

export function OnboardingClient({ glance }: { glance: OnboardingGlance | null }) {
  const [showSearch, setShowSearch] = useState(false);

  return (
    <div className="ob-page">
      <style>{ONBOARDING_CSS}</style>
      <Header onSearch={() => setShowSearch(true)} tabs={buildHeaderTabs()} frosted />
      <SearchOverlay open={showSearch} onClose={() => setShowSearch(false)} />
      <main id="main-content" className="ob-main">
        <HeroSection />
        <FormatGlanceSection glance={glance} />
        <FeatureMapSection />
        <MadeBySection />
        <NewsletterSection />
      </main>
    </div>
  );
}
