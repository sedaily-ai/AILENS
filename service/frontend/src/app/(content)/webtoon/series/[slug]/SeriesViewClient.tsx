'use client';

import { useEffect, useMemo, useState } from 'react';
import { displayHeadline } from '@/shared/lib/content/displayHeadline';
import Link from 'next/link';
import Image from 'next/image';
import { Header } from '@/widgets/Header';
import { SearchOverlay } from '@/shared/ui/search/SearchOverlay';
import { buildHeaderTabs } from '@/shared/lib/headerTabs';
import { fetchWebtoons, type CmsWebtoon } from '@/shared/lib/api/cmsPostsApi';
import { coverThumb } from '@/shared/lib/webtoonCovers.generated';
import { findSeriesBySlug, episodeNumberInSeries, type WebtoonSeries } from '@/shared/lib/content/webtoonSeries';
import { INK, BODY, MUTED, WEBTOON_GRID_CSS, EP_BLUE, fmtDate } from '../../webtoonSeriesUi';

// /webtoon/series/{slug} — SeriesCard(webtoonSeriesUi.tsx)가 가리키는 시리즈 상세 페이지. groupIntoSeries()(webtoonSeries.ts)로 묶은 편들을 최신순 목록으로 보여 준다.
// /webtoon/[slug]와 달리 컷은 직접 보여주지 않고(컷은 각 편 상세에 있다), webtoonSeriesUi.tsx의 SeriesCard/grid와 같은 카드를 episode 단위로 재사용한다.
export function SeriesViewClient({
  slug,
  initialItems,
}: {
  slug: string;
  initialItems: CmsWebtoon[];
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

  const series: WebtoonSeries | null = useMemo(() => findSeriesBySlug(items, slug), [items, slug]);

  if (!series) {
    return (
      <div className="min-h-screen bg-white">
        <Header onSearch={() => setShowSearch(true)} tabs={buildHeaderTabs()} frosted />
        <SearchOverlay open={showSearch} onClose={() => setShowSearch(false)} />
        <div className="mx-auto max-w-[680px] px-5 py-20 text-center" style={{ color: MUTED }}>
          <p>시리즈를 찾을 수 없어요.</p>
          <Link href="/lens" className="mt-4 inline-block text-sm underline underline-offset-4" style={{ color: MUTED }}>
            최신 뉴스로
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <style>{WEBTOON_GRID_CSS}</style>

      <Header onSearch={() => setShowSearch(true)} tabs={buildHeaderTabs()} frosted />
      <SearchOverlay open={showSearch} onClose={() => setShowSearch(false)} />

      <main style={{ paddingBottom: 96 }}>
        <div className="wt-wrap" style={{ paddingTop: 'clamp(28px, 5vw, 56px)' }}>
          <p style={{ fontSize: 13, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 600, color: MUTED, marginBottom: 4 }}>
            Webtoon Series
          </p>
          <h1 style={{ fontSize: 'clamp(24px, 5vw, 32px)', fontWeight: 800, letterSpacing: '-0.02em', color: INK, marginBottom: 8, wordBreak: 'keep-all' }}>
            {series.title}
          </h1>
          <p style={{ fontSize: 14, color: MUTED, fontWeight: 600, marginBottom: 32 }}>
            {[series.category, `총 ${series.episodes.length}화`, `${fmtDate(series.latestDate)} 업데이트`].filter(Boolean).join(' · ')}
          </p>

          <ul className="wt-grid">
            {series.episodes.map((ep, i) => {
              const src = coverThumb(ep.cover_image_url, 'md');
              const epNumber = episodeNumberInSeries(series, ep.id) ?? series.episodes.length - i;
              return (
                <li key={ep.id}>
                  <Link
                    href={`/webtoon/${encodeURIComponent(ep.id)}`}
                    prefetch={false}
                    className="wt-card"
                    aria-label={`${ep.title} ${epNumber}화`}
                    style={{ display: 'flex', flexDirection: 'column' }}
                  >
                    <div className="wt-poster">
                      {src ? (
                        <div className="wt-poster-fg">
                          <Image
                            src={src}
                            alt={`${ep.title} 표지`}
                            fill
                            sizes="(min-width: 900px) 220px, (min-width: 640px) 30vw, 46vw"
                            loading={i === 0 ? 'eager' : 'lazy'}
                            priority={i === 0}
                            style={{ objectFit: 'cover' }}
                          />
                        </div>
                      ) : (
                        <div className="flex items-center justify-center w-full h-full relative" style={{ fontSize: 14, color: BODY }}>
                          준비 중
                        </div>
                      )}
                      <span className="wt-poster-badge" style={{ background: EP_BLUE }}>
                        {epNumber}화
                      </span>
                    </div>
                    <div style={{ padding: '12px 0 0', flex: 1 }}>
                      <p style={{ fontSize: 13, color: MUTED, fontWeight: 600, marginBottom: 8, fontVariantNumeric: 'tabular-nums' }}>
                        {fmtDate(ep.date)}
                      </p>
                      <h3
                        style={{
                          fontSize: 16,
                          fontWeight: 700,
                          letterSpacing: '-0.015em',
                          lineHeight: 1.4,
                          color: INK,
                          wordBreak: 'keep-all',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}
                      >
                        {displayHeadline(ep.title)}
                      </h3>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </main>
    </div>
  );
}
