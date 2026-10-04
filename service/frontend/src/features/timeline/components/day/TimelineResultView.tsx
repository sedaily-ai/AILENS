'use client';

// /timeline/[date] 최근 구간(2026-02-01~) 결과 화면 — 서버가 미리 가져온 기사를 그대로 그린다(클라이언트 fetch 없음).
// 2026-10-04: 항상 비어 있던 "그날의 이슈" 보기와 그 fetch·지표 패널·이슈 카드를 걷어냈다. 목록 렌더는 TimelineArticleList로 뺐다.
import Link from 'next/link';
import type { Article } from '@/shared/lib/api/timelineApi';
import { kdate } from '@/shared/lib/date/timelineDates';
import {
  SURFACE, TEXT_STRONG, TEXT_MUTED, BORDER_CONTROL, BORDER_STRONG, FONT, SPACE, TOUCH_MIN, CONTAINER_MAX,
} from '@/features/timeline/lib/tone';
import { ArticleList } from './TimelineArticleList';
import { SajuFunnelCard } from './SajuFunnelCard';

const OTHER_DATE_LINK_STYLE = {
  display: 'inline-block', padding: '10px 22px', borderRadius: 9999, border: `1px solid ${BORDER_CONTROL}`,
  background: 'transparent', color: TEXT_STRONG, fontSize: FONT.meta, fontWeight: 700, textDecoration: 'none',
} as const;

function EmptyDay() {
  return (
    <div style={{ textAlign: 'center', padding: '60px 0' }}>
      <p style={{ fontSize: FONT.sectionTitle, fontWeight: 700, color: TEXT_STRONG, marginBottom: 8 }}>그날의 기사는 아직 보관되지 않았어요</p>
      <p style={{ fontSize: FONT.meta, color: TEXT_MUTED, marginBottom: 22 }}>다른 날짜로 다시 돌려볼까요?</p>
      <Link href="/timeline" style={OTHER_DATE_LINK_STYLE}>다른 날짜 고르기</Link>
    </div>
  );
}

export function TimelineResultView({ date, initialArticles }: { date: string; initialArticles: Article[] }) {
  return (
    <div style={{ minHeight: '100vh', background: SURFACE }}>
      <style>{`
        @keyframes tmPaper { from { opacity:0; transform: translateY(20px) scale(.985);} to {opacity:1; transform:none;} }
        @keyframes tmHead { from { opacity:0; } to { opacity:1; } }

        /* 지면 머리 고정 — 기사 목록을 훑는 동안 "어느 날짜의 지면인가"가 계속
           보여야 한다. 배경이 불투명해야 아래로 지나가는 기사가 비치지 않는다.
           z-index 는 ExitPill(60)보다 낮게 둬서 탈출구가 위에 남는다.

           이 머리는 tmPaper 래퍼 **밖**에 있어야 한다. tmPaper 키프레임에
           transform 이 있고, transform 이 걸린 조상은 containing block 을 만들어
           position:sticky 가 뷰포트가 아니라 그 조상을 기준으로 붙는다.
           그래서 등장 연출은 transform 없는 opacity 페이드(tmHead)로 따로 준다. */
        /* 지면 머리 높이는 padding 두 값으로만 조절한다 — h1 font-size 를 건드리면
           스케일(tone.ts FONT)을 벗어나고 모바일 clamp 까지 같이 흔들린다. */
        .tm-head { position: sticky; top: 0; z-index: 40; background: ${SURFACE};
          padding-top: ${SPACE.xxl}px; padding-bottom: ${SPACE.xl}px;
          animation: tmHead .5s ease; }

        /* 좁은 화면에서는 좌상단 ExitPill(fixed, top ${SPACE.lg} + 높이 ${TOUCH_MIN})이
           붙어 있는 머리와 같은 줄에 온다. 그만큼 아래에서 시작해 겹침을 피한다. */
        @media (max-width: 640px) {
          .tm-head { padding-top: ${SPACE.lg + TOUCH_MIN + SPACE.sm}px; }
        }

        @media (prefers-reduced-motion: reduce) {
          .tm-head { animation: none; }
        }
      `}</style>
      <div style={{ maxWidth: CONTAINER_MAX, margin: '0 auto', padding: '0 clamp(20px, 5vw, 32px) clamp(40px, 8vw, 88px)' }}>
        <div className="tm-head" style={{ textAlign: 'center', borderBottom: `2px solid ${BORDER_STRONG}`, marginBottom: 28 }}>
          <p style={{ fontSize: FONT.caption, letterSpacing: '0.2em', color: TEXT_MUTED, marginBottom: SPACE.sm }}>SEOUL ECONOMIC DAILY · 보관본</p>
          <h1 style={{ fontSize: `clamp(${FONT.pageTitle}px, 5.4vw, ${FONT.pageTitleLg}px)`, fontWeight: 800, color: TEXT_STRONG, letterSpacing: '-0.02em' }}>
            {kdate(date)}자 서울경제
          </h1>
        </div>

        <div style={{ animation: 'tmPaper .5s ease' }}>
          {initialArticles.length === 0 ? (
            <EmptyDay />
          ) : (
            <>
              <ArticleList items={initialArticles} />
              <SajuFunnelCard />
              <div style={{ textAlign: 'center', marginTop: 36 }}>
                <Link href="/timeline" style={OTHER_DATE_LINK_STYLE}>다른 날짜 보기</Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
