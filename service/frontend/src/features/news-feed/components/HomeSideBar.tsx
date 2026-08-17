'use client';

import { HotLettersRail } from './HotLettersRail';
import { SajuMiniRail } from './SajuMiniRail';
import type { TodayLetterCardLike } from '@/shared/lib/todayLettersApi';

// 홈 우측 사이드바(2026-08-17) — 인기글(HotLettersRail) + 사주 궁합
// (SajuMiniRail) 두 섹션을 하나의 컨테이너로 묶는다. lg 미만에서는 아예
// 렌더하지 않는다(NewsFeedTab.tsx에서 className="hidden lg:block").
//
// position:sticky를 뺐다(2026-08-17, 사용자 피드백: "서로 따로 스크롤
// 되는게 아니가" → "두개 따로가 아니라 그냥 같이 움직이는 구조로 잡아
// 주시죠") — sticky였을 땐 사이드바 콘텐츠가 본문 칼럼보다 짧아서 화면
// 위쪽에 고정된 채 본문만 스크롤되는 것처럼 보였는데, 그게 "따로 논다"는
// 인상을 줬다. 이제 본문·사이드바 둘 다 그냥 일반 문서 흐름대로 같이
// 스크롤된다.
export function HomeSideBar({ className, initialHotLetters }: { className?: string; initialHotLetters?: TodayLetterCardLike[] }) {
  return (
    <aside className={className} style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      <HotLettersRail initialItems={initialHotLetters} />
      {/* 성격이 다른 두 섹션(인기글 랭킹 vs 사주 미니앱)이 구분선 없이
          바로 붙어 있으면 하나로 뭉쳐 보인다는 피드백(2026-08-17, "분리
          같은거 하거나... 어떻게 해야하지") — 얇은 구분선 추가. */}
      <div style={{ borderTop: '1px solid #f3f4f6' }} aria-hidden />
      <SajuMiniRail />
    </aside>
  );
}
