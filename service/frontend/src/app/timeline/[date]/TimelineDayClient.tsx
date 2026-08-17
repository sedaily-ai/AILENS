'use client';

import Link from 'next/link';
import { TimelineResultView, TimelineBigkindsView, type Article, type BigKindsArticle, type InvestmentScenario } from '@/features/timeline';

type Props =
  | { date: string; initialArticles: Article[]; initialBigkindsArticles?: undefined; initialInvestments?: undefined }
  | { date: string; initialArticles?: undefined; initialBigkindsArticles: BigKindsArticle[]; initialInvestments: InvestmentScenario[] };

// 공용 Header 대신 좌상단 EXIT 필로 대체 — /games·/webtoon과 같은 "완전
// 몰입형 공간" 기법(2026-08-17, ConditionalFooter.tsx가 이미 이 라우트의
// 공용 푸터를 숨기고 있음 — 헤더도 같은 이유로 마저 뺐다). 다만 저 두
// 라우트는 어두운 톤이라 반투명 검정 필을 썼는데, 여기는 크림·세리프
// "빈티지 신문" 톤이라 팔레트를 그대로 맞췄다(밝은 배경 위 흰 필 + 잉크
// 텍스트, 진한 배경 위 대비되는 필 대신).
export function TimelineDayClient({ date, initialArticles, initialBigkindsArticles, initialInvestments }: Props) {
  return (
    <div className="min-h-screen" style={{ background: '#faf8f3' }}>
      <Link
        href="/"
        aria-label="AI LENS 로 돌아가기"
        style={{
          position: 'fixed',
          top: 20,
          left: 20,
          zIndex: 60,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 16px',
          background: '#fff',
          border: '1px solid #e6e0d4',
          borderRadius: 999,
          color: '#2a2622',
          fontSize: 12.5,
          fontWeight: 700,
          letterSpacing: '0.02em',
          textDecoration: 'none',
          boxShadow: '0 2px 10px rgba(80,60,30,0.08)',
          transition: 'all 0.18s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = '#fdfcf9';
          e.currentTarget.style.borderColor = '#d8cfb8';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = '#fff';
          e.currentTarget.style.borderColor = '#e6e0d4';
        }}
      >
        ◀ AI LENS
      </Link>
      {initialBigkindsArticles ? (
        <TimelineBigkindsView date={date} articles={initialBigkindsArticles} investments={initialInvestments} />
      ) : (
        <TimelineResultView date={date} initialArticles={initialArticles} />
      )}
    </div>
  );
}
