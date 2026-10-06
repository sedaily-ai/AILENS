'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { HotLettersRail, type RailItem } from '@/shared/ui/list/HotLettersRail';
import { SajuCard } from './SideCards';
import type { TodayLetterCardLike } from '@/shared/lib/api/todayLettersApi';

// 홈 우측 사이드바: 인기글(HotLettersRail)과 안내 카드를 하나의 컨테이너로 묶는다. lg 미만에서는 렌더하지 않는다(NewsFeedTab.tsx에서 className="hidden lg:block").
// 본문이 사이드바보다 훨씬 길어 스크롤할수록 사이드바 아래 여백만 커지므로 position:sticky로 따라오게 하며, top은 헤더(56px, sticky) 아래에 자리 잡도록 헤더 높이만큼 띄운다.
// 그리드 부모가 기본 align-items:stretch라 alignSelf:'start'가 없으면 sticky가 동작하지 않는다(그리드 아이템이 이미 행 전체 높이로 늘어나 있어서).
export function HomeSideBar({
  className,
  style,
  initialHotLetters,
  railHeading,
  railItems,
  railLimit,
}: {
  className?: string;
  /** 페이지마다 본문 칼럼의 상단 여백이 달라(예: lens 상세는 헤더 아래 paddingTop을 따로 줌) 두 칼럼의 시작선을 맞추려면 사이드바도 그 값에 맞춘다. 필요한 호출부가 넘긴다. */
  style?: CSSProperties;
  initialHotLetters?: TodayLetterCardLike[];
  /** 카테고리 페이지처럼 "이 분류의 많이 읽은 글"을 보여 줄 때 레일 제목과 목록을 직접 넘긴다. */
  railHeading?: string;
  railItems?: RailItem[];
  /** 레일에 보일 항목 수(기본 10) — 홈은 본문보다 길어지지 않게 더 적게. */
  railLimit?: number;
}) {
  // 따라다니는 레일: 안에서 따로 스크롤되지 않게 하고, 레일이 화면보다 길면 "아래가 화면 아래에 닿을 때까지 같이 스크롤된 뒤 고정"되도록
  // sticky의 top을 계산한다(top = min(헤더 아래 76px, 화면높이 - 레일높이 - 16px), 길면 음수). 짧으면 헤더 아래에 붙는다.
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
        // 스크롤을 따라다닌다. 레일이 화면보다 길면 안에서만 스크롤(스크롤바 숨김)해 아래가 잘리지 않게 한다.
        position: 'sticky',
        top,
        alignSelf: 'start',
        ...style,
      }}
    >
      <HotLettersRail initialItems={initialHotLetters} heading={railHeading} items={railItems} limit={railLimit} />
      <div style={{ borderTop: '1px solid #ececec' }} aria-hidden />
      {/* 안내 카드 둘(지난 지면 / 사주). 영문판의 "Most Read + 시리즈 카드" 구조를 따른다. */}
      <SajuCard />
    </aside>
  );
}
