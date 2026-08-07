'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Header } from '@/widgets/Header';
import { SmartSearchOverlay } from '@/components/mbti/SmartSearchOverlay';
import { buildHeaderTabs } from '@/shared/lib/headerTabs';
import { fetchCmsPosts, fetchTrendCards, fetchVideos } from '@/shared/lib/cmsPostsApi';
import { LetterMailIcon, StockBullIcon, LightbulbIcon } from '@/features/news-feed/components/icons/HandDrawnIcons';
import { buildArchiveItems, PAGE_SIZE, type ArchiveItem, type Kind } from './archiveItems';

// 홈의 "레터"/"요즘 화제의 경제 이슈"/"이번 주 인기 칼럼"/"영상으로 보는 이슈"
// 섹션은 각각 오늘자 몇 편만 보여준다 — 지금까지 쌓인 전체를 훑어보고 싶으면
// 이 페이지. 예전엔 "더보기 →"가 경제 캘린더(시장 일정 표)로 잘못 연결돼 있었다.
//
// 필터는 매경 dig(dig.mk.co.kr/Digging)의 카테고리 알약 버튼 형태를 참고했다 —
// 다만 저긴 "사회/금융/부동산" 같은 주제 카테고리고, 여긴 홈 화면 섹션(레터/
// 트렌드/칼럼/영상)을 그대로 필터 축으로 쓴다. 트렌드·칼럼 카드는 아직 자체
// 상세 페이지가 없어(홈에서도 클릭이 안 됨) 목록에서도 링크 없이 카드로만
// 보여준다. 영상은 원본 유튜브 URL이 있어 외부 링크로 바로 연결한다
// (2026-08-07, "영상 섹션도 더보기 있어야 할 듯" 피드백).
const FILTERS: Array<{ key: 'all' | Kind; label: string }> = [
  { key: 'all', label: '전체' },
  { key: 'letter', label: '레터' },
  { key: 'trend', label: '트렌드' },
  { key: 'column', label: '인기 칼럼' },
  { key: 'video', label: '영상' },
];

function VideoPlayIcon({ accent, className }: { accent: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke={accent} strokeWidth="1.6" />
      <path d="M10 8.5l6 3.5-6 3.5v-7z" fill={accent} />
    </svg>
  );
}

function dateLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map((s) => parseInt(s, 10));
  if (!y || !m || !d) return iso;
  const dow = ['일', '월', '화', '수', '목', '금', '토'][new Date(y, m - 1, d).getDay()];
  return `${y}.${String(m).padStart(2, '0')}.${String(d).padStart(2, '0')} (${dow})`;
}

export function LettersArchiveClient({ initialItems }: { initialItems: ArchiveItem[] }) {
  const [showSearch, setShowSearch] = useState(false);
  const [items, setItems] = useState<ArchiveItem[]>(initialItems);
  const [filter, setFilter] = useState<'all' | Kind>('all');

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchCmsPosts('letters', undefined, PAGE_SIZE),
      fetchTrendCards(),
      fetchVideos(),
    ]).then(([letters, cards, videos]) => {
      if (cancelled) return;
      const all = buildArchiveItems(letters, cards, videos);
      if (all.length > 0) setItems(all);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (filter === 'all') return items;
    return items.filter((it) => it.kind === filter);
  }, [items, filter]);

  return (
    <div className="min-h-screen bg-white">
      <Header onSearch={() => setShowSearch(true)} tabs={buildHeaderTabs('feed')} frosted />
      <SmartSearchOverlay open={showSearch} onClose={() => setShowSearch(false)} />

      <main style={{ maxWidth: 720, margin: '0 auto', padding: 'clamp(28px, 5vw, 56px) clamp(20px, 5vw, 32px) 80px' }}>
        <header style={{ marginBottom: 20 }}>
          <p
            className="text-gray-400"
            style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}
          >
            Archive
          </p>
          <h1
            className="font-medium text-gray-900"
            style={{ fontFamily: '"Noto Serif KR", serif', fontSize: 'clamp(24px, 4.5vw, 30px)', letterSpacing: '-0.02em' }}
          >
            지금까지의 모든 콘텐츠
          </h1>
        </header>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                style={{
                  padding: '8px 18px',
                  borderRadius: 999,
                  fontSize: 13.5,
                  fontWeight: 600,
                  border: active ? 'none' : '1px solid #e5e7eb',
                  background: active ? '#111827' : '#fff',
                  color: active ? '#fff' : '#4b5563',
                  cursor: 'pointer',
                  transition: 'background .15s, color .15s',
                }}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        <p style={{ fontSize: 12.5, color: '#9ca3af', marginBottom: 14 }}>총 {filtered.length}개</p>

        {filtered.length === 0 && (
          <p style={{ fontSize: 14, color: '#9ca3af', padding: '40px 0', textAlign: 'center' }}>
            아직 콘텐츠가 없어요.
          </p>
        )}

        {filtered.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map((item) => {
              const Icon =
                item.kind === 'trend' ? StockBullIcon
                : item.kind === 'column' ? LightbulbIcon
                : item.kind === 'video' ? VideoPlayIcon
                : LetterMailIcon;
              const inner = (
                <>
                  <span
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: '50%',
                      flexShrink: 0,
                      background: `${item.accent}14`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Icon accent={item.accent} className="w-7 h-7" />
                  </span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: item.accent }}>{item.badgeLabel}</span>
                      <span style={{ fontSize: 11, color: '#9ca3af' }}>{item.date ? dateLabel(item.date) : ''}</span>
                    </div>
                    <p
                      className="font-medium text-gray-900"
                      style={{
                        fontFamily: '"Noto Serif KR", serif',
                        fontSize: 15.5,
                        lineHeight: 1.4,
                        letterSpacing: '-0.01em',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {item.title}
                    </p>
                  </div>
                </>
              );

              if (item.href && item.external) {
                return (
                  <a
                    key={item.key}
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-4 rounded-2xl transition-colors hover:bg-gray-50"
                    style={{ padding: '14px 16px', border: '1px solid #f1f1f0' }}
                  >
                    {inner}
                  </a>
                );
              }
              if (item.href) {
                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    className="flex items-center gap-4 rounded-2xl transition-colors hover:bg-gray-50"
                    style={{ padding: '14px 16px', border: '1px solid #f1f1f0' }}
                  >
                    {inner}
                  </Link>
                );
              }
              return (
                <div
                  key={item.key}
                  className="flex items-center gap-4 rounded-2xl"
                  style={{ padding: '14px 16px', border: '1px solid #f1f1f0' }}
                >
                  {inner}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
