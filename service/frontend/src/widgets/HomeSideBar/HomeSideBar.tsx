'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { HotLettersRail, type RailItem } from '@/shared/ui/HotLettersRail';
import { SajuCard } from './SideCards';
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
  railHeading,
  railItems,
  railLimit,
}: {
  className?: string;
  /** 페이지마다 본문 칼럼의 상단 여백이 달라(예: lens 상세는 헤더 아래
   *  paddingTop을 따로 줌) 사이드바도 그 값에 맞춰야 두 칼럼의 시작선이
   *  나란해진다(2026-08-18, "헤더에 너무 붙은거 아닌가?") — 호출부가
   *  필요하면 넘긴다. */
  style?: CSSProperties;
  initialHotLetters?: TodayLetterCardLike[];
  /** 카테고리 페이지처럼 "이 분류의 많이 읽은 글"을 보여 줄 때 레일 제목과 목록을 직접 넘긴다. */
  railHeading?: string;
  railItems?: RailItem[];
  /** 레일에 보일 항목 수(기본 10) — 홈은 본문보다 길어지지 않게 더 적게. */
  railLimit?: number;
}) {
  // 따라다니는 레일(2026-10-04): 안에서 따로 스크롤되지 않게 하고(사용자 지적), 레일이 화면보다 길면 "아래가 화면 아래에 닿을 때까지 같이 스크롤된 뒤 고정"되게
  // sticky의 top을 계산한다(top = min(헤더 아래 76px, 화면높이 - 레일높이 - 16px) — 길면 음수). 짧으면 헤더 아래에 붙는다.
  const ref = useRef<HTMLElement>(null);
  const [top, setTop] = useState(76);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setTop(Math.min(76, Math.round(window.innerHeight - el.offsetHeight - 16)));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);
  return (
    <aside
      ref={ref}
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 28,
        // 스크롤을 따라다닌다(2026-10-04, 사용자 지시). 레일이 화면보다 길면 안에서만 스크롤(스크롤바 숨김)해 아래가 잘리지 않게 한다.
        position: 'sticky',
        top,
        alignSelf: 'start',
        ...style,
      }}
    >
      <HotLettersRail initialItems={initialHotLetters} heading={railHeading} items={railItems} limit={railLimit} />
      <div style={{ borderTop: '1px solid #ececec' }} aria-hidden />
      {/* 2026-10-04 개편: 사주 미니 위젯 → 안내 카드 둘(지난 지면 / 사주). 영문판의 "Most Read + 시리즈 카드" 구조를 따른다. */}
      <SajuCard />
    </aside>
  );
}
