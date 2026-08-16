'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { StockBullIcon, CoinExchangeIcon, ServerRobotIcon, PiggyBankIcon } from './icons/HandDrawnIcons';
import { fetchSectionCards, type CmsSectionCard } from '@/shared/lib/cmsPostsApi';
import { BRAND_ACCENTS } from '@/shared/data/brandAccents';

// trend_card 채널 카드(요약뿐, 상세 없음) + "트렌드" 태그를 단 실제 레터
// (channel=letters, body_inline.section) 를 합쳐서 보여준다 — 태그만 있고
// 홈에 안 뜨면 admin 입장에서 "표출"이 안 되는 것처럼 보이는 문제가 있었다.
// fetch+merge 로직 자체는 ColumnPreviewSection과 공유(fetchSectionCards,
// shared/lib/cmsPostsApi.ts 참조).
type TrendItem = CmsSectionCard;

// 아이콘은 admin 이 입력하는 값이 아니라 카드 순서로 순환 배정 — 사진 대신
// 손그림 라인아트 아이콘을 쓰는 이유와 같다(실제 없는 기사에 엉뚱한 사진을
// 붙이는 것보다 정직한 선택). 강조색은 예전엔 이 섹션만의 빨강/청록 조합을
// 따로 썼는데, "섹션마다 색을 즉흥적으로 지어낸다"는 지적(2026-08-06)으로
// 공용 브랜드 팔레트(brandAccents.ts)로 교체했다.
const TREND_ICONS = [StockBullIcon, CoinExchangeIcon, ServerRobotIcon, PiggyBankIcon];

// admin 이 아직 이슈 카드를 하나도 안 만들었을 때 홈이 통째로 비어 보이지
// 않도록 두는 자리채우기 — CMS 에 카드가 있으면 그쪽이 우선한다.
const FALLBACK: TrendItem[] = [
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

interface Props {
  // 빌드타임(app/page.tsx) 서버 프리페치 값 — 다른 홈 섹션(웹툰/영상/시선)과
  // 같은 이유(2026-08-07 홈 SSG 감사). 없으면 마운트 후 클라이언트에서
  // fetchSectionCards로 로드하는 동안 FALLBACK 목업이 먼저 보였다가 실제
  // 데이터로 바뀌는 깜빡임이 있었다(2026-08-16 피드백) — initialItems가 있으면
  // 첫 페인트부터 바로 실제 데이터.
  initialItems?: TrendItem[];
}

export function TrendingEconomySection({ initialItems }: Props) {
  const [cmsCards, setCmsCards] = useState<TrendItem[] | null>(initialItems ?? null);

  useEffect(() => {
    let cancelled = false;
    fetchSectionCards('trend').then((merged) => {
      if (cancelled) return;
      setCmsCards(merged);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // 홈은 최신 몇 개만 티저로 — ColumnPreviewSection과 동일한 이유
  // (2026-08-07, 카드 개수 제한이 없으면 콘텐츠가 늘 때 홈이 무한정 길어진다).
  const cards = (cmsCards && cmsCards.length > 0 ? cmsCards : FALLBACK).slice(0, 4);

  return (
    <section style={{ padding: 'clamp(28px, 4vw, 40px) 0 0' }}>
      <header
        style={{
          marginBottom: 14,
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div>
          <p
            className="text-gray-400"
            style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}
          >
            딥다이브
          </p>
          {/* 섹션 제목 타이포 통일(2026-08-06) — 웹툰만 굵은 산세리프라 튀어
              보인다는 지적으로, 홈 화면 섹션 제목을 전부 Pretendard Bold로. */}
          <h2 className="text-gray-900" style={{ fontSize: 'clamp(20px, 4.4vw, 24px)', fontWeight: 800, letterSpacing: '-0.02em' }}>
            요즘 화제의 경제 이슈
          </h2>
        </div>
        {/* "더보기 →" — 콘텐츠 타입별 페이지 분리(2026-08-11)로 트렌드 전용
            /trend가 생겨 거기로(예전엔 /letters 통합 아카이브였음). */}
        <Link
          href="/trend"
          className="text-gray-500 hover:text-gray-900"
          style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 4 }}
        >
          더 보기
          <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6" />
          </svg>
        </Link>
      </header>

      {/* 모바일 2열·데스크톱 4열 고정(2026-08-12) — FollowingFeed.tsx와 같은
          이유로 auto-fill(minmax 160~240px)을 걷어냈다: 실제 모바일 폭에서
          2열이 겨우 들어맞는 수준이라 패딩·스크롤바 오차로 1열로 허물어지는
          문제가 실제로 있었다(웹툰 섹션과 그리드 통일 요청, 사용자 스크린샷
          확인). 카드 1~2개뿐일 때 남는 칸은 빈 트랙으로 두되(옛 우려), 열
          수를 고정하는 쪽이 실제 렌더 안정성에서 더 낫다고 판단. */}
      <div
        className="grid grid-cols-2 sm:grid-cols-4"
        style={{
          gap: 'clamp(8px, 2vw, 14px)',
        }}
      >
        {cards.map((a, i) => {
          const Icon = TREND_ICONS[i % TREND_ICONS.length];
          const { accent, soft: accentBg } = BRAND_ACCENTS[i % BRAND_ACCENTS.length];
          // "매거진 고급짐" 카드 톤(2026-08-06) — FollowingFeed와 동일 원칙:
          // 각진 라운드(8) + 테두리 없음 + 옅고 촘촘한 그림자 + 카테고리는
          // 색 텍스트 대신 상단 얇은 바로. 재미 섹션(웹툰 등)은 원래 톤 유지.
          const cardStyle = {
            display: 'block' as const,
            borderRadius: 8,
            background: '#fff',
            boxShadow: '0 1px 2px rgba(17,24,39,0.03), 0 3px 10px rgba(17,24,39,0.04)',
            // 그림자만으로는 가장자리가 흐릿해 보일 수 있어 아주 옅은 헤어라인을 같이 준다.
            border: '1px solid rgba(0,0,0,0.06)',
            overflow: 'hidden' as const,
            cursor: a.href ? ('pointer' as const) : ('default' as const),
          };
          const cardInner = (
            <>
              {/* 상단 컬러 바를 시도했다가 카드마다 다른 원색이 나란히 있으니 무지개
                  줄무늬처럼 촌스러워 보였다(2026-08-06 피드백) — 뺐다. */}
              <div
                className="aspect-square relative flex items-center justify-center overflow-hidden"
                style={{ background: accentBg }}
              >
                {a.imageUrl ? (
                  <Image src={a.imageUrl} alt={a.title} fill sizes="(min-width: 640px) 25vw, 50vw" style={{ objectFit: 'cover' }} />
                ) : (
                  <Icon accent={accent} className="w-2/5 h-2/5" />
                )}
              </div>
              <div style={{ padding: 'clamp(10px, 2.2vw, 14px)' }}>
                <p
                  className="text-gray-400"
                  style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}
                >
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
            </>
          );
          return a.href ? (
            <Link key={a.id} href={a.href} style={cardStyle}>
              {cardInner}
            </Link>
          ) : (
            <article key={a.id} style={cardStyle}>
              {cardInner}
            </article>
          );
        })}
      </div>
    </section>
  );
}
