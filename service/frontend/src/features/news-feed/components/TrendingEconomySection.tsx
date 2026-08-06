'use client';

import { useEffect, useState } from 'react';
import { StockBullIcon, CoinExchangeIcon, ServerRobotIcon, PiggyBankIcon } from './icons/HandDrawnIcons';
import { fetchTrendCards, type CmsTrendCard } from '@/shared/lib/cmsPostsApi';

// 아이콘·강조색은 admin 이 입력하는 값이 아니라 카드 순서로 순환 배정 —
// 사진 대신 손그림 라인아트 아이콘을 쓰는 이유와 같다(실제 없는 기사에 엉뚱한
// 사진을 붙이는 것보다 정직한 선택). CMS 연결 전 목업 4장이 쓰던 팔레트 그대로.
const TREND_ICONS = [StockBullIcon, CoinExchangeIcon, ServerRobotIcon, PiggyBankIcon];
const ACCENT_PALETTE = [
  { accent: '#dc2626', accentBg: '#fdeeee' },
  { accent: '#0891b2', accentBg: '#eaf6f7' },
  { accent: '#7c3aed', accentBg: '#f0edf7' },
  { accent: '#d97706', accentBg: '#f7f0e3' },
];

// admin 이 아직 이슈 카드를 하나도 안 만들었을 때 홈이 통째로 비어 보이지
// 않도록 두는 자리채우기 — CMS 에 카드가 있으면 그쪽이 우선한다.
const FALLBACK: CmsTrendCard[] = [
  {
    id: 'trend-1',
    section: 'trend',
    category: '증시',
    title: '코스피 6600 돌파, 이번엔 진짜 다른가',
    date: '2026-08-05',
    excerpt: '외국인 순매수가 8거래일 연속 이어지며 지수를 밀어올렸다. 반도체·2차전지 대형주가 상승을 주도했지만, 밸류에이션 부담을 지적하는 목소리도 만만치 않다.',
    is_cms: true,
  },
  {
    id: 'trend-2',
    section: 'trend',
    category: '환율·금리',
    title: '美 금리 동결 시그널, 원·달러 환율 향방은',
    date: '2026-08-04',
    excerpt: '연준이 9월 인하 가능성을 열어두면서도 이번 회의에서는 동결을 시사했다. 시장은 이미 되돌림을 반영해 원화 강세로 반응하는 분위기다.',
    is_cms: true,
  },
  {
    id: 'trend-3',
    section: 'trend',
    category: '산업',
    title: 'AI 데이터센터 전력난, 다음 수혜주는',
    date: '2026-08-03',
    excerpt: '빅테크의 캡엑스 경쟁이 전력 인프라 병목으로 옮겨붙었다. 변압기·전선·소형모듈원전(SMR) 밸류체인이 새로운 투자 테마로 떠오르는 중이다.',
    is_cms: true,
  },
  {
    id: 'trend-4',
    section: 'trend',
    category: '재테크',
    title: '2030 청년 목돈 마련, ISA 개편안 뜯어보기',
    date: '2026-08-02',
    excerpt: '비과세 한도가 늘고 중도인출 요건도 완화됐다. 청년형 ISA로 갈아타야 할지, 기존 계좌를 유지해야 할지 조건별로 정리했다.',
    is_cms: true,
  },
];

export function TrendingEconomySection() {
  const [cmsCards, setCmsCards] = useState<CmsTrendCard[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchTrendCards().then((all) => {
      if (cancelled) return;
      setCmsCards(all.filter((c) => c.section === 'trend'));
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
          Trend
        </p>
        <h2
          className="font-medium text-gray-900"
          style={{ fontFamily: '"Noto Serif KR", serif', fontSize: 'clamp(20px, 4.4vw, 24px)', letterSpacing: '-0.02em' }}
        >
          요즘 화제의 경제 이슈
        </h2>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-4" style={{ gap: 'clamp(8px, 2vw, 14px)' }}>
        {cards.map((a, i) => {
          const Icon = TREND_ICONS[i % TREND_ICONS.length];
          const { accent, accentBg } = ACCENT_PALETTE[i % ACCENT_PALETTE.length];
          return (
          <article
            key={a.id}
            style={{
              borderRadius: 16,
              background: '#fff',
              border: '1px solid #f1f1f0',
              boxShadow: '0 1px 2px rgba(17,24,39,0.04), 0 8px 24px rgba(17,24,39,0.05)',
              overflow: 'hidden',
            }}
          >
            <div
              className="aspect-square flex items-center justify-center"
              style={{ background: accentBg }}
            >
              <Icon accent={accent} className="w-2/5 h-2/5" />
            </div>
            <div style={{ padding: 'clamp(10px, 2.2vw, 14px)' }}>
              <p className="font-semibold" style={{ fontSize: 11, color: accent, marginBottom: 6 }}>
                {a.category}
              </p>
              <h3
                className="font-medium text-gray-900"
                style={{
                  fontFamily: '"Noto Serif KR", serif',
                  fontSize: 14.5,
                  lineHeight: 1.4,
                  letterSpacing: '-0.02em',
                  marginBottom: 6,
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {a.title}
              </h3>
              <p className="text-gray-400" style={{ fontSize: 11, marginBottom: 6 }}>
                {a.date.replaceAll('-', '.')}
              </p>
              <p
                className="text-gray-500"
                style={{
                  fontSize: 12,
                  lineHeight: 1.55,
                  display: '-webkit-box',
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {a.excerpt}
              </p>
            </div>
          </article>
          );
        })}
      </div>
    </section>
  );
}
