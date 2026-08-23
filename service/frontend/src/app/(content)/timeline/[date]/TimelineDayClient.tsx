'use client';

import {
  TimelineResultView, TimelineBigkindsView, ExitPill, SURFACE, GLOBAL_CSS,
  type Article, type BigKindsArticle, type InvestmentScenario,
} from '@/features/timeline';

type Props =
  | { date: string; initialArticles: Article[]; initialBigkindsArticles?: undefined; initialInvestments?: undefined }
  | { date: string; initialArticles?: undefined; initialBigkindsArticles: BigKindsArticle[]; initialInvestments: InvestmentScenario[] };

// 공용 Header 대신 좌상단 EXIT 필로 대체 — /games·/webtoon과 같은 "완전
// 몰입형 공간" 기법(2026-08-17, ConditionalFooter.tsx가 이미 이 라우트의
// 공용 푸터를 숨기고 있음 — 헤더도 같은 이유로 마저 뺐다).
//
// 2026-08-19: 크림 배경(#faf8f3)과 갈색 테두리(#e6e0d4)를 걷었다. 테두리는
// 1.24:1 로 WCAG 1.4.11(인터랙티브 요소 경계 3:1) 위반이었다 — 링크인데
// 경계가 안 보였다. 4.83:1 인 회색으로 바꾸고, hover 를 인라인 이벤트에서
// CSS 클래스(.tl-exit)로 옮겼다 — 인라인 onMouseEnter 는 키보드 포커스에
// 반응하지 않아 마우스 사용자만 피드백을 받았다.
//
// 전역 CSS(포커스 링·행 hover·reduced-motion)는 두 뷰가 같이 쓰므로 각
// 뷰에서 <style> 을 두 번 심지 않고 이 껍데기에서 한 번만 심는다.
export function TimelineDayClient({ date, initialArticles, initialBigkindsArticles, initialInvestments }: Props) {
  return (
    <div className="min-h-screen" style={{ background: SURFACE }}>
      <style>{GLOBAL_CSS}</style>
      <ExitPill />
      {initialBigkindsArticles ? (
        <TimelineBigkindsView date={date} articles={initialBigkindsArticles} investments={initialInvestments} />
      ) : (
        <TimelineResultView date={date} initialArticles={initialArticles} />
      )}
    </div>
  );
}
