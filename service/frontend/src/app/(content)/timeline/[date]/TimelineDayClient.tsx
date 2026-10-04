'use client';

import { TimelineResultView, TimelineBigkindsView, ExitPill, SURFACE, GLOBAL_CSS } from '@/features/timeline';
import type { Article, BigKindsArticle, InvestmentScenario } from '@/shared/lib/api/timelineApi';

type Props =
  | { date: string; initialArticles: Article[]; initialBigkindsArticles?: undefined; initialInvestments?: undefined }
  | { date: string; initialArticles?: undefined; initialBigkindsArticles: BigKindsArticle[]; initialInvestments: InvestmentScenario[] };

// 공용 Header 대신 좌상단 EXIT 필을 둔다. /games·/webtoon과 같은 "완전 몰입형 공간" 기법이며, ConditionalFooter.tsx가 이 라우트의 공용 푸터를 숨기는 것과 같은 이유이다.
// EXIT 필 경계는 4.83:1 회색을 쓴다(WCAG 1.4.11 인터랙티브 요소 경계 3:1). hover는 인라인 이벤트 대신 CSS 클래스(.tl-exit)로 처리해 키보드 포커스에도 반응한다.
//
// 전역 CSS(포커스 링·행 hover·reduced-motion)는 두 뷰가 공유하므로 각 뷰가 아니라 이 껍데기에서 한 번만 심는다.
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
