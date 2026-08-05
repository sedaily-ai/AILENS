'use client';

import { StockBullIcon, CoinExchangeIcon, ServerRobotIcon, PiggyBankIcon } from './icons/HandDrawnIcons';

interface MockArticle {
  id: string;
  category: string;
  accent: string;
  accentBg: string;
  title: string;
  date: string;
  excerpt: string;
}

// 목업 — 실제 기사 연결 전, 어피티/뉴닉처럼 "경제 미디어 홈"의 밀도를 먼저
// 보여주기 위한 자리채우기. 사진 대신 손그림 라인아트 아이콘 사용
// (실제 없는 기사에 엉뚱한 사진을 붙이는 것보다 정직한 선택).
const TREND_ICONS = [StockBullIcon, CoinExchangeIcon, ServerRobotIcon, PiggyBankIcon];

const TRENDING: MockArticle[] = [
  {
    id: 'trend-1',
    category: '증시',
    accent: '#dc2626',
    accentBg: '#fdeeee',
    title: '코스피 6600 돌파, 이번엔 진짜 다른가',
    date: '2026.08.05',
    excerpt: '외국인 순매수가 8거래일 연속 이어지며 지수를 밀어올렸다. 반도체·2차전지 대형주가 상승을 주도했지만, 밸류에이션 부담을 지적하는 목소리도 만만치 않다.',
  },
  {
    id: 'trend-2',
    category: '환율·금리',
    accent: '#0891b2',
    accentBg: '#eaf6f7',
    title: '美 금리 동결 시그널, 원·달러 환율 향방은',
    date: '2026.08.04',
    excerpt: '연준이 9월 인하 가능성을 열어두면서도 이번 회의에서는 동결을 시사했다. 시장은 이미 되돌림을 반영해 원화 강세로 반응하는 분위기다.',
  },
  {
    id: 'trend-3',
    category: '산업',
    accent: '#7c3aed',
    accentBg: '#f0edf7',
    title: 'AI 데이터센터 전력난, 다음 수혜주는',
    date: '2026.08.03',
    excerpt: '빅테크의 캡엑스 경쟁이 전력 인프라 병목으로 옮겨붙었다. 변압기·전선·소형모듈원전(SMR) 밸류체인이 새로운 투자 테마로 떠오르는 중이다.',
  },
  {
    id: 'trend-4',
    category: '재테크',
    accent: '#d97706',
    accentBg: '#f7f0e3',
    title: '2030 청년 목돈 마련, ISA 개편안 뜯어보기',
    date: '2026.08.02',
    excerpt: '비과세 한도가 늘고 중도인출 요건도 완화됐다. 청년형 ISA로 갈아타야 할지, 기존 계좌를 유지해야 할지 조건별로 정리했다.',
  },
];

export function TrendingEconomySection() {
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
        {TRENDING.map((a, i) => {
          const Icon = TREND_ICONS[i];
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
              style={{ background: a.accentBg }}
            >
              <Icon accent={a.accent} className="w-2/5 h-2/5" />
            </div>
            <div style={{ padding: 'clamp(10px, 2.2vw, 14px)' }}>
              <p className="font-semibold" style={{ fontSize: 11, color: a.accent, marginBottom: 6 }}>
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
                {a.date}
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
