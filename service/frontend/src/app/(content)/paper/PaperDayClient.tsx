'use client';

import Link from 'next/link';
import { ArticlePageShell } from '@/widgets/ArticlePageShell';
import { HomeSideBar } from '@/widgets/HomeSideBar';
import { LensPreviewSection } from '@/features/news-feed';
import type { CmsLens } from '@/shared/lib/api/cmsPostsApi';
import type { TodayLetterCardLike } from '@/shared/lib/api/todayLettersApi';
import { PaperDateNav } from './PaperDateNav';
import { paperDateLabel, paperPath, parsePaperDate } from './paperShared';

/** "2026-10-07" → "10월 7일" */
function shortLabel(date: string): string {
  const { month, day } = parsePaperDate(date);
  return `${month}월 ${day}일`;
}

// 지난 지면 한 날 — 홈의 4탭 지면 카드를 그 날짜 기사로 보여 주고, 위에서 날짜를 옮긴다.
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
  // dates는 최신순이다(dates[0]이 가장 최근 지면). 앞 인덱스가 더 새로운 날짜.
  const newerDate = idx > 0 ? dates[idx - 1] : null;
  const olderDate = idx >= 0 && idx < dates.length - 1 ? dates[idx + 1] : null;

  return (
    <ArticlePageShell sidebar={<HomeSideBar className="hidden lg:block" initialHotLetters={initialHotLetters} />}>
      <main id="main-content" style={{ paddingBottom: 100, minHeight: '80vh' }}>
        {/* 눈에 보이는 '지난 지면' 라벨·제목·날짜 띠는 두지 않는다. 카드 안 제호가 날짜를 말하고 날짜 선택 달력은 카드 머리띠 오른쪽에 둔다. h1은 검색엔진·스크린리더용으로 숨겨 둔다. */}
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

        {/* 날짜 이동 링크 — 달력(PaperDateNav)은 열어야 링크가 생기므로 크롤러가 다른 날짜를 찾지 못한다. 서버가 렌더하는 이전·다음 링크와 최근 날짜 목록을 항상 둔다. */}
        <nav aria-label="다른 날짜의 지면" style={{ margin: '28px 0 0', display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, fontSize: 14, fontWeight: 600 }}>
            {olderDate ? (
              <Link href={paperPath(olderDate)} rel="prev" style={{ color: '#3d70de', textDecoration: 'none' }}>
                ← 이전 지면 ({shortLabel(olderDate)})
              </Link>
            ) : (
              <span />
            )}
            {newerDate && (
              <Link href={paperPath(newerDate)} rel="next" style={{ color: '#3d70de', textDecoration: 'none' }}>
                다음 지면 ({shortLabel(newerDate)}) →
              </Link>
            )}
          </div>
          <ul style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', margin: 0, padding: 0, listStyle: 'none', fontSize: 13 }}>
            {dates.slice(0, 14).map((d) => (
              <li key={d}>
                {d === date ? (
                  <span aria-current="page" style={{ fontWeight: 700, color: '#111827' }}>{shortLabel(d)}</span>
                ) : (
                  <Link href={paperPath(d)} style={{ color: '#6b7280', textDecoration: 'none' }}>{shortLabel(d)}</Link>
                )}
              </li>
            ))}
          </ul>
        </nav>
      </main>
    </ArticlePageShell>
  );
}
