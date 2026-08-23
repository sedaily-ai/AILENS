'use client';

import type { CSSProperties } from 'react';
import { HotLettersRail } from './HotLettersRail';
import { SajuMiniRail } from './SajuMiniRail';
import type { TodayLetterCardLike } from '@/shared/lib/api/todayLettersApi';

// 홈 우측 사이드바(2026-08-17) — 인기글(HotLettersRail) + 사주 궁합
// (SajuMiniRail) 두 섹션을 하나의 컨테이너로 묶는다. lg 미만에서는 아예
// 렌더하지 않는다(NewsFeedTab.tsx에서 className="hidden lg:block").
//
// 2026-08-17엔 position:sticky를 뺐다("서로 따로 스크롤 되는게 아니가" →
// "그냥 같이 움직이는 구조로") — 그런데 본문이 사이드바보다 훨씬 길어서
// 스크롤할수록 사이드바 아래로 여백만 커지는 게 오히려 더 어색하다는
// 반대 피드백을 받았다(2026-08-23, "스크롤 내리면 사라지게 되어있는데
// 따라오도록 하면 어떤가요 — 여백 생기는게 좀 별로라서"). sticky를
// 다시 넣되, 이번엔 헤더(56px, sticky) 아래에 자리 잡도록 top을 헤더
// 높이만큼 띄운다 — 이전에 "따로 논다"는 인상을 줬던 건 sticky 자체가
// 아니라 top 오프셋 없이 헤더에 바짝 붙어 있던 것도 한몫했을 가능성이
// 있어 같이 손봄. 그리드 부모가 기본 align-items:stretch라 alignSelf:
// 'start'가 없으면 sticky가 안 먹는다(그리드 아이템이 이미 행 전체
// 높이로 늘어나 있어서 "붙어서 따라갈" 여지가 없음).
export function HomeSideBar({
  className,
  style,
  initialHotLetters,
}: {
  className?: string;
  /** 페이지마다 본문 칼럼의 상단 여백이 달라(예: lens 상세는 헤더 아래
   *  paddingTop을 따로 줌) 사이드바도 그 값에 맞춰야 두 칼럼의 시작선이
   *  나란해진다(2026-08-18, "헤더에 너무 붙은거 아닌가?") — 호출부가
   *  필요하면 넘긴다. */
  style?: CSSProperties;
  initialHotLetters?: TodayLetterCardLike[];
}) {
  return (
    <aside
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 28,
        position: 'sticky',
        top: 80,
        alignSelf: 'start',
        ...style,
      }}
    >
      <HotLettersRail initialItems={initialHotLetters} />
      {/* 성격이 다른 두 섹션(인기글 랭킹 vs 사주 미니앱)이 구분선 없이
          바로 붙어 있으면 하나로 뭉쳐 보인다는 피드백(2026-08-17, "분리
          같은거 하거나... 어떻게 해야하지") — 얇은 구분선 추가. */}
      <div style={{ borderTop: '1px solid #f3f4f6' }} aria-hidden />
      <SajuMiniRail />
    </aside>
  );
}
