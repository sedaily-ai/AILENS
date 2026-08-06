'use client';

import { useEffect, useState } from 'react';
import { LightbulbIcon, CoinJarIcon, HouseSunIcon } from './icons/HandDrawnIcons';
import { fetchTrendCards, type CmsTrendCard } from '@/shared/lib/cmsPostsApi';

// 리스트형으로 톤을 바꿔서 위 TrendingEconomySection 카드 그리드와 시각적
// 리듬을 다르게 줌(UPPITY 의 칼럼/머니레터처럼 섹션마다 레이아웃이 미묘하게
// 달라야 "여러 코너가 있다"는 느낌이 남). 아이콘·강조색은 카드 순서로 순환 배정.
const COLUMN_ICONS = [LightbulbIcon, CoinJarIcon, HouseSunIcon];
const ACCENT_PALETTE = [
  { accent: '#059669', accentBg: '#e6f4ef' },
  { accent: '#7c3aed', accentBg: '#f0edf7' },
  { accent: '#d97706', accentBg: '#f7f0e3' },
];

// admin 이 아직 칼럼 카드를 하나도 안 만들었을 때 홈이 통째로 비어 보이지
// 않도록 두는 자리채우기 — CMS 에 카드가 있으면 그쪽이 우선한다.
const FALLBACK: CmsTrendCard[] = [
  {
    id: 'col-1',
    section: 'column',
    category: '투자 인사이트',
    title: '"밸류에이션 비싸다"는 말, 언제부터 안 통했나',
    date: '2026-08-05',
    excerpt: '매 사이클마다 나오는 고평가 경고가 이번엔 왜 시장을 못 꺾었는지, 지난 세 번의 랠리를 복기하며 짚어봤다.',
    is_cms: true,
  },
  {
    id: 'col-2',
    section: 'column',
    category: '머니 라이프',
    title: '월급쟁이가 3년 만에 종잣돈 1억 모은 방법',
    date: '2026-08-04',
    excerpt: '특별한 재테크 비법보다 "새는 돈부터 막았다"는 평범한 답. 그 평범함을 실제로 지킨 3년의 기록.',
    is_cms: true,
  },
  {
    id: 'col-3',
    section: 'column',
    category: '오늘의 시선',
    title: '부동산 규제, 이번엔 정말 다를 수 있는 이유',
    date: '2026-08-03',
    excerpt: '역대 정부의 규제와 무엇이 다른지, 공급 대책의 실행 가능성까지 짚어야 진짜 그림이 보인다.',
    is_cms: true,
  },
];

export function ColumnPreviewSection() {
  const [cmsCards, setCmsCards] = useState<CmsTrendCard[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchTrendCards().then((all) => {
      if (cancelled) return;
      setCmsCards(all.filter((c) => c.section === 'column'));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const cards = cmsCards && cmsCards.length > 0 ? cmsCards : FALLBACK;

  return (
    <section style={{ padding: 'clamp(28px, 4vw, 40px) 0 0' }}>
      <header style={{ marginBottom: 14 }}>
        <p
          className="text-gray-400"
          style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}
        >
          Column
        </p>
        <h2
          className="font-medium text-gray-900"
          style={{ fontFamily: '"Noto Serif KR", serif', fontSize: 'clamp(20px, 4.4vw, 24px)', letterSpacing: '-0.02em' }}
        >
          이번 주 인기 칼럼
        </h2>
      </header>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(8px, 2vw, 12px)' }}>
        {cards.map((c, i) => {
          const Icon = COLUMN_ICONS[i % COLUMN_ICONS.length];
          const { accent, accentBg } = ACCENT_PALETTE[i % ACCENT_PALETTE.length];
          return (
          <article
            key={c.id}
            className="flex items-center"
            style={{
              gap: 16,
              padding: 14,
              borderRadius: 16,
              background: '#fff',
              border: '1px solid #f1f1f0',
              boxShadow: '0 1px 2px rgba(17,24,39,0.04), 0 8px 24px rgba(17,24,39,0.05)',
            }}
          >
            <div
              className="flex-shrink-0 flex items-center justify-center"
              style={{ width: 80, height: 80, borderRadius: 14, background: accentBg }}
            >
              <Icon accent={accent} className="w-1/2 h-1/2" />
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <p className="font-semibold" style={{ fontSize: 11.5, color: accent, marginBottom: 6 }}>
                {c.category}
              </p>
              <h3
                className="font-medium text-gray-900"
                style={{
                  fontFamily: '"Noto Serif KR", serif',
                  fontSize: 15.5,
                  lineHeight: 1.4,
                  letterSpacing: '-0.02em',
                  marginBottom: 4,
                  display: '-webkit-box',
                  WebkitLineClamp: 1,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {c.title}
              </h3>
              <p
                className="text-gray-500"
                style={{
                  fontSize: 12.5,
                  lineHeight: 1.55,
                  display: '-webkit-box',
                  WebkitLineClamp: 1,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {c.excerpt}
              </p>
            </div>
            <span className="text-gray-400 flex-shrink-0" style={{ fontSize: 11 }}>
              {c.date.replaceAll('-', '.')}
            </span>
          </article>
          );
        })}
      </div>
    </section>
  );
}
