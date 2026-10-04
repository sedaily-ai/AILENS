'use client';

import Link from 'next/link';
import { ArticlePageShell } from '@/widgets/ArticlePageShell';
import { HomeSideBar } from '@/widgets/HomeSideBar';
import { LensPreviewSection } from '@/features/news-feed';
import type { CmsLens } from '@/shared/lib/api/cmsPostsApi';
import type { TodayLetterCardLike } from '@/shared/lib/api/todayLettersApi';
import { PaperDateNav } from './PaperDateNav';

// 지난 지면 한 날(2026-10-04) — 홈의 4탭 지면 카드를 그 날짜 기사로 보여 주고, 위에서 날짜를 옮긴다.
// 날짜 이동은 전부 링크(서버가 같은 HTML을 만들어 검색엔진도 따라갈 수 있다). 지면이 편성된 날만 이동 대상이다(dates).
export function PaperDayClient({
  date,
  dates,
  items,
  initialHotLetters,
}: {
  date: string;
  /** 지면이 있는 날짜(최신순). */
  dates: string[];
  /** 그 날의 지면 기사(최대 16건, 4개 탭). */
  items: CmsLens[];
  initialHotLetters?: TodayLetterCardLike[];
}) {
  const idx = dates.indexOf(date);

  return (
    <ArticlePageShell sidebar={<HomeSideBar className="hidden lg:block" initialHotLetters={initialHotLetters} />}>
      <main id="main-content" style={{ paddingBottom: 100, minHeight: '80vh' }}>
        <header style={{ padding: 'clamp(28px, 4vw, 40px) 0 6px' }}>
          <p style={{ margin: 0, fontSize: 13.5, fontWeight: 800, letterSpacing: '0.02em', color: '#6b7280' }}>지난 지면</p>
          {/* 제목이 곧 날짜 선택기(눌러서 달력) + 가벼운 날짜 띠 — PaperDateNav. 설명 문장은 탭이 이미 말해 주므로 뺐다. */}
          <div style={{ marginTop: 8 }}>
            <PaperDateNav date={date} dates={dates} />
          </div>
        </header>

        {/* 홈과 같은 4탭 카드(variant="archive": 소개 헤더 없이 카드만) */}
        <LensPreviewSection initialItems={items} variant="archive" />

        {idx > 0 && (
          <p style={{ margin: '28px 0 0' }}>
            <Link href="/" style={{ fontSize: 14, fontWeight: 600, color: '#3d70de', textDecoration: 'none' }}>
              오늘의 지면 보러 가기 →
            </Link>
          </p>
        )}
      </main>
    </ArticlePageShell>
  );
}
