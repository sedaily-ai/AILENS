'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Header } from '@/widgets/Header';
import { SearchOverlay } from '@/shared/ui/search/SearchOverlay';
import { HomeSideBar } from '@/widgets/HomeSideBar';
import { ArchiveList } from '@/shared/ui/list/ArchiveList';
import { CategoryCards, CategoryLead } from '@/shared/ui/list/CategoryLead';
import { buildHeaderTabs } from '@/shared/lib/headerTabs';
import { buildPageItems } from '@/shared/lib/content/pagination';
import { fetchLensPosts, type CmsLens } from '@/shared/lib/api/cmsPostsApi';
import { displayHeadline, headlineSection } from '@/shared/lib/content/displayHeadline';
import { LENS_ACCENT, pickLensPhoto } from '@/shared/constants/lensPerspectives';
import { lensPath } from '@/shared/lib/content/lensUrl';
import type { ArchiveItem } from '@/shared/lib/content/archiveItems';
import type { RailItem } from '@/shared/ui/list/HotLettersRail';
import type { TodayLetterCardLike } from '@/shared/lib/api/todayLettersApi';

// "최신 뉴스" 목록(/lens, 홈의 "최신 뉴스 · 전체 보기"와 이름을 맞춤) — 카테고리 페이지(/markets 등)와 같은 구조이다.
//   [‹ 오늘의 시선 헤더] → [히어로 1건] → [카드 3건] → [날짜별 목록 | 우측 레일]
// 홈의 지면 영역·기사 상세가 네 형식을 이미 보여 주므로 목록에서는 형식별 요소를 반복하지 않는다. 페이지 주소(/lens, /lens/page/N)와 서버 페이지네이션을 사용한다.
const PAGE_SIZE = 20;

function toItem(l: CmsLens): ArchiveItem {
  return {
    key: l.id,
    kind: 'lens',
    title: displayHeadline(l.headline),
    excerpt: l.context ?? '',
    date: l.date,
    accent: LENS_ACCENT,
    href: lensPath(l),
    avatarUrl: pickLensPhoto(l) || l.cover_image_url || null,
    // 분류 값이 없는 글은 제목 접두어의 부서명(사회·경제 등)으로 대신한다.
    category: l.category ?? headlineSection(l.headline),
    subcategory: l.subcategory ?? null,
    publishedAt: l.published_at ?? null,
    paperSection: l.paper_section ?? null,
  };
}

export function LensListClient({
  initialItems,
  initialPage,
  initialHotLetters,
}: {
  initialItems: CmsLens[];
  initialPage: number;
  initialHotLetters?: TodayLetterCardLike[];
}) {
  const [showSearch, setShowSearch] = useState(false);
  const [items, setItems] = useState<CmsLens[]>(initialItems);

  useEffect(() => {
    let cancelled = false;
    fetchLensPosts().then((rows) => {
      if (!cancelled && rows.length > 0) setItems(rows);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const all = useMemo(() => items.map(toItem), [items]);
  // 사진이 있는 최신 4건 = 히어로 1 + 카드 3(1페이지만). 나머지는 날짜별 목록.
  const featured = useMemo(() => all.filter((it) => it.avatarUrl && it.href).slice(0, 4), [all]);
  const used = new Set(featured.map((it) => it.key));
  const rest = all.filter((it) => !used.has(it.key));

  const totalPages = Math.max(1, Math.ceil(rest.length / PAGE_SIZE));
  const currentPage = Math.min(initialPage, totalPages);
  const pageItems = rest.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const pageHref = (n: number) => (n <= 1 ? '/lens' : `/lens/page/${n}`);
  const firstPage = currentPage === 1;
  const railItems: RailItem[] = all.filter((it) => it.href && it.category).slice(0, 10).map((it) => ({ key: it.key, href: it.href as string, title: it.title, thumb: it.avatarUrl, label: it.category ?? '' }));

  return (
    <div className="min-h-screen bg-white">
      <Header onSearch={() => setShowSearch(true)} tabs={buildHeaderTabs()} frosted section={{ label: '최신 뉴스', href: '/' }} />
      <SearchOverlay open={showSearch} onClose={() => setShowSearch(false)} />

      <div className="mx-auto" style={{ maxWidth: 1320, padding: 'clamp(8px, 2vw, 16px) clamp(24px, 3.5vw, 44px) 0' }}>
        <h1 className="sr-only">최신 뉴스 — 하나의 이슈, 네 가지 형식으로 읽는 AI LENS</h1>

        {firstPage && featured.length >= 1 && <CategoryLead lead={featured[0]} showCategory />}

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px]" style={{ columnGap: 40, paddingTop: 24 }}>
          <main style={{ padding: '0 0 80px' }}>
            {firstPage && featured.length >= 4 && <CategoryCards items={featured.slice(1, 4)} showCategory />}
            <ArchiveList items={pageItems} showCategory emptyLabel="아직 올라온 이슈가 없어요." />

            {totalPages > 1 && (
              <nav aria-label="페이지" style={{ marginTop: 36, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <Link href={pageHref(Math.max(currentPage - 1, 1))} aria-label="이전 페이지" aria-disabled={currentPage === 1} className="lp-pg" style={{ pointerEvents: currentPage === 1 ? 'none' : undefined, opacity: currentPage === 1 ? 0.35 : 1 }}>
                  ‹
                </Link>
                {buildPageItems(currentPage, totalPages).map((n, i) =>
                  n === 'ellipsis' ? (
                    <span key={`e${i}`} aria-hidden style={{ minWidth: 24, textAlign: 'center', color: '#9ca3af' }}>
                      …
                    </span>
                  ) : (
                    <Link key={n} href={pageHref(n)} aria-current={n === currentPage ? 'page' : undefined} aria-label={`${n}페이지`} className={`lp-pg${n === currentPage ? ' is-on' : ''}`}>
                      {n}
                    </Link>
                  ),
                )}
                <Link href={pageHref(Math.min(currentPage + 1, totalPages))} aria-label="다음 페이지" aria-disabled={currentPage === totalPages} className="lp-pg" style={{ pointerEvents: currentPage === totalPages ? 'none' : undefined, opacity: currentPage === totalPages ? 0.35 : 1 }}>
                  ›
                </Link>
                <style>{`
                  .lp-pg { display: inline-flex; align-items: center; justify-content: center; min-width: 38px; height: 38px; padding: 0 8px; border-radius: 999px; font-size: 14px; font-weight: 600; color: #374151; text-decoration: none; transition: background .15s ease; }
                  .lp-pg:hover { background: #f1f5f9; }
                  .lp-pg.is-on { background: #1f2937; color: #fff; pointer-events: none; }
                `}</style>
              </nav>
            )}
          </main>

          <HomeSideBar className="hidden lg:block" initialHotLetters={initialHotLetters} railHeading="많이 읽은 글" railItems={railItems} />
        </div>
      </div>
    </div>
  );
}
