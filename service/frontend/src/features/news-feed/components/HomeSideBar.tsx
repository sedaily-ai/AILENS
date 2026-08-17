'use client';

import { HotLettersRail } from './HotLettersRail';
import { SajuMiniRail } from './SajuMiniRail';

// 홈 우측 사이드바(2026-08-17) — 인기글(HotLettersRail) + 사주 궁합
// (SajuMiniRail) 두 섹션을 하나의 sticky 컨테이너로 묶는다. lg 미만에서는
// 아예 렌더하지 않는다(NewsFeedTab.tsx에서 className="hidden lg:block").
export function HomeSideBar({ className }: { className?: string }) {
  return (
    <aside className={className} style={{ position: 'sticky', top: 88, alignSelf: 'start', display: 'flex', flexDirection: 'column', gap: 36 }}>
      <HotLettersRail />
      <SajuMiniRail />
    </aside>
  );
}
