'use client';

import { LightbulbIcon, CoinJarIcon, HouseSunIcon } from './icons/HandDrawnIcons';

interface MockColumn {
  id: string;
  series: string;
  accent: string;
  accentBg: string;
  title: string;
  date: string;
  excerpt: string;
}

// 목업 — TrendingEconomySection 과 같은 이유로 자리채우기. 리스트형으로 톤을
// 바꿔서 위 카드 그리드와 시각적 리듬을 다르게 줌(UPPITY 의 칼럼/머니레터처럼
// 섹션마다 레이아웃이 미묘하게 달라야 "여러 코너가 있다"는 느낌이 남).
const COLUMN_ICONS = [LightbulbIcon, CoinJarIcon, HouseSunIcon];

const COLUMNS: MockColumn[] = [
  {
    id: 'col-1',
    series: '투자 인사이트',
    accent: '#059669',
    accentBg: '#e6f4ef',
    title: '"밸류에이션 비싸다"는 말, 언제부터 안 통했나',
    date: '2026.08.05',
    excerpt: '매 사이클마다 나오는 고평가 경고가 이번엔 왜 시장을 못 꺾었는지, 지난 세 번의 랠리를 복기하며 짚어봤다.',
  },
  {
    id: 'col-2',
    series: '머니 라이프',
    accent: '#7c3aed',
    accentBg: '#f0edf7',
    title: '월급쟁이가 3년 만에 종잣돈 1억 모은 방법',
    date: '2026.08.04',
    excerpt: '특별한 재테크 비법보다 "새는 돈부터 막았다"는 평범한 답. 그 평범함을 실제로 지킨 3년의 기록.',
  },
  {
    id: 'col-3',
    series: '오늘의 시선',
    accent: '#d97706',
    accentBg: '#f7f0e3',
    title: '부동산 규제, 이번엔 정말 다를 수 있는 이유',
    date: '2026.08.03',
    excerpt: '역대 정부의 규제와 무엇이 다른지, 공급 대책의 실행 가능성까지 짚어야 진짜 그림이 보인다.',
  },
];

export function ColumnPreviewSection() {
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
        {COLUMNS.map((c, i) => {
          const Icon = COLUMN_ICONS[i];
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
              style={{ width: 80, height: 80, borderRadius: 14, background: c.accentBg }}
            >
              <Icon accent={c.accent} className="w-1/2 h-1/2" />
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <p className="font-semibold" style={{ fontSize: 11.5, color: c.accent, marginBottom: 6 }}>
                {c.series}
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
              {c.date}
            </span>
          </article>
          );
        })}
      </div>
    </section>
  );
}
