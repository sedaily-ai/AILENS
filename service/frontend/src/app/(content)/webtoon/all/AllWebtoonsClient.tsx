'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Header } from '@/widgets/Header';
import { SmartSearchOverlay } from '@/shared/ui/SmartSearchOverlay';
import { buildHeaderTabs } from '@/shared/lib/headerTabs';
import { fetchWebtoons, type CmsWebtoon } from '@/shared/lib/api/cmsPostsApi';
import { groupIntoSeries } from '@/shared/lib/webtoonSeries';
import { buildPageItems } from '@/shared/lib/pagination';
import {
  INK,
  BODY,
  MUTED,
  BAND,
  WEBTOON_GRID_CSS,
  computeCategoryFilter,
  SectionHead,
  SeriesCard,
  CategoryChipsNav,
  PageLink,
} from '../webtoonSeriesUi';

// "전체 웹툰" 전용 페이지(2026-08-21) — /webtoon(홈 목록: 히어로 캐러셀+
// "최근 업데이트" 레일+"전체 웹툰" 그리드 1페이지)의 "더보기" 링크가 실제로
// 갈 곳. 섹션 부제(편수 텍스트)를 "더보기"로 바꾸면서 그 링크가 눌렸을 때
// 갈 페이지가 필요해졌다 — "모든 웹툰을 볼 수 있는 페이지를 만들어라"는
// 요청대로, 히어로 캐러셀 없이 카테고리 칩 + 시리즈 격자 + 페이지네이션만
// 있는 순수 브라우징 페이지다.
//
// 카드·칩·페이지 버튼·CSS는 WebtoonListClient.tsx와 완전히 같은 컴포넌트를
// webtoonSeriesUi.tsx에서 가져와 쓴다(§4 일관성 우선) — 두 페이지가 같은
// 시리즈 카드를 각자 구현하면 한쪽만 고치는 실수가 생긴다. 카테고리 거르기
// 규칙(computeCategoryFilter)도 동일 — cat 파라미터를 이 페이지로 넘기면
// 홈 목록에서 고르던 카테고리가 그대로 이어진다(위 SectionHead moreHref 참조).
const PAGE_SIZE = 24;

export function AllWebtoonsClient({
  initialItems,
  initialPage,
  initialCategory,
}: {
  initialItems: CmsWebtoon[];
  initialPage: number;
  initialCategory?: string;
}) {
  const [items, setItems] = useState<CmsWebtoon[]>(initialItems);
  const [showSearch, setShowSearch] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchWebtoons().then((rows) => {
      if (!cancelled && rows.length > 0) setItems(rows);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const allSeries = useMemo(() => groupIntoSeries(items), [items]);
  const { categoryCounts, categories, activeCategory, filtering, pool } = useMemo(
    () => computeCategoryFilter(allSeries, initialCategory),
    [allSeries, initialCategory],
  );

  const totalPages = Math.max(1, Math.ceil(pool.length / PAGE_SIZE));
  const currentPage = Math.min(initialPage, totalPages);
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const paged = pool.slice(startIndex, startIndex + PAGE_SIZE);

  const href = (opts: { page?: number; cat?: string | null }) => {
    const cat = opts.cat === undefined ? activeCategory : opts.cat;
    const page = opts.page ?? 1;
    const q = new URLSearchParams();
    if (cat) q.set('cat', cat);
    if (page > 1) q.set('page', String(page));
    const s = q.toString();
    return s ? `/webtoon/all?${s}` : '/webtoon/all';
  };

  return (
    <div className="min-h-screen bg-white">
      <style>{WEBTOON_GRID_CSS}</style>

      <Header onSearch={() => setShowSearch(true)} tabs={buildHeaderTabs()} frosted />
      <SmartSearchOverlay open={showSearch} onClose={() => setShowSearch(false)} />

      <main style={{ paddingBottom: 96 }}>
        <div className="wt-wrap" style={{ paddingTop: 'clamp(28px, 5vw, 56px)' }}>
          <header style={{ marginBottom: 24 }}>
            <p style={{ fontSize: 13, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 600, color: MUTED, marginBottom: 4 }}>
              Webtoon
            </p>
            <h1 style={{ fontSize: 'clamp(24px, 5vw, 32px)', fontWeight: 800, letterSpacing: '-0.02em', color: INK, marginBottom: 8 }}>
              전체 웹툰
            </h1>
            <p style={{ fontSize: 16, color: BODY, lineHeight: 1.7, maxWidth: 520 }}>
              연재 중인 모든 시리즈를 한눈에 볼 수 있어요.
            </p>
          </header>

          <CategoryChipsNav
            categories={categories}
            categoryCounts={categoryCounts}
            activeCategory={activeCategory}
            totalCount={allSeries.length}
            buildHref={(cat) => href({ cat, page: 1 })}
          />

          {allSeries.length === 0 && (
            <div style={{ padding: '72px 24px', textAlign: 'center', background: BAND, borderRadius: 12 }}>
              <p style={{ fontSize: 18, fontWeight: 700, color: INK, marginBottom: 8 }}>아직 연재된 웹툰이 없어요</p>
              <p style={{ fontSize: 16, color: BODY, lineHeight: 1.7 }}>곧 첫 시리즈로 찾아올게요.</p>
            </div>
          )}

          {allSeries.length > 0 && pool.length === 0 && (
            <div style={{ padding: '56px 24px', textAlign: 'center', background: BAND, borderRadius: 12 }}>
              <p style={{ fontSize: 18, fontWeight: 700, color: INK, marginBottom: 8 }}>
                {activeCategory} 웹툰은 아직 없어요
              </p>
              <p style={{ fontSize: 16, color: BODY, lineHeight: 1.7, marginBottom: 16 }}>
                다른 카테고리를 보거나 전체 목록에서 골라보세요.
              </p>
              <Link href={href({ cat: null, page: 1 })} className="wt-chip" style={{ background: INK, color: '#fff', fontWeight: 700 }}>
                전체 웹툰 보기
              </Link>
            </div>
          )}

          {paged.length > 0 && (
            <>
              <SectionHead
                title={filtering ? `${activeCategory} 웹툰` : '전체 웹툰'}
                sub={`${pool.length}편${totalPages > 1 ? ` · ${currentPage}/${totalPages}쪽` : ''}`}
              />
              <ul className="wt-grid">
                {paged.map((s, i) => (
                  <li key={s.slug}>
                    <SeriesCard
                      series={s}
                      showCategory={!filtering}
                      sizes="(min-width: 900px) 220px, (min-width: 640px) 30vw, 46vw"
                      eager={i === 0}
                    />
                  </li>
                ))}
              </ul>

              {totalPages > 1 && (
                // flex-wrap + 생략 부호(2026-09-02) — /webtoon와 같은 버그
                // (총 페이지 수만큼 무조건 다 렌더링) — /webtoon/all은
                // 시리즈 전체를 보여주는 페이지라 오히려 더 많이 깨질
                // 수 있었다.
                <nav aria-label="웹툰 목록 페이지" className="flex items-center justify-center flex-wrap" style={{ gap: 8, marginTop: 32 }}>
                  <PageLink href={href({ page: currentPage - 1 })} label="이전 페이지" disabled={currentPage === 1}>
                    ←
                  </PageLink>
                  {buildPageItems(currentPage, totalPages).map((item, i) =>
                    item === 'ellipsis' ? (
                      <span key={`ellipsis-${i}`} aria-hidden style={{ width: 44, textAlign: 'center', color: MUTED }}>
                        …
                      </span>
                    ) : (
                      <PageLink key={item} href={href({ page: item })} label={`${item}페이지`} active={currentPage === item}>
                        {item}
                      </PageLink>
                    ),
                  )}
                  <PageLink href={href({ page: currentPage + 1 })} label="다음 페이지" disabled={currentPage === totalPages}>
                    →
                  </PageLink>
                </nav>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
