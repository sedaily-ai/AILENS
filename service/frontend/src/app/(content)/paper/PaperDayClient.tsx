'use client';

import Link from 'next/link';
import { ArticlePageShell } from '@/widgets/ArticlePageShell';
import { HomeSideBar } from '@/widgets/HomeSideBar';
import { LensPreviewSection } from '@/features/news-feed';
import type { CmsLens } from '@/shared/lib/api/cmsPostsApi';
import type { TodayLetterCardLike } from '@/shared/lib/api/todayLettersApi';
import { PaperDateNav } from './PaperDateNav';
import { paperDateLabel, parsePaperDate } from './paperShared';

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
        {/* 눈에 보이는 '지난 지면' 라벨·제목·날짜 띠는 2026-10-05 삭제(사용자 요청) — 카드 안 제호가 날짜를 말하고, 날짜 선택 달력은 카드 머리띠 오른쪽에 둔다. h1은 검색엔진·스크린리더용으로 숨겨 둔다. */}
        <h1 style={{ position: 'absolute', width: 1, height: 1, margin: -1, padding: 0, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 }}>
          {paperDateLabel(date)} ({parsePaperDate(date).weekday}) 지면
        </h1>
        <div style={{ height: 'clamp(4px, 1.5vw, 12px)' }} />

        {/* 홈과 같은 4탭 카드(variant="archive": 소개 헤더 없이 카드만) */}
        <LensPreviewSection initialItems={items} variant="archive" headerAction={<PaperDateNav date={date} dates={dates} />} />

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
