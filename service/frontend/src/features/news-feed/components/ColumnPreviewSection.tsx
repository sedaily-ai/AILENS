'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { LightbulbIcon, CoinJarIcon, HouseSunIcon } from './icons/HandDrawnIcons';
import { fetchTrendCards, fetchCmsPosts, type CmsTrendCard } from '@/shared/lib/cmsPostsApi';
import { letterHref } from '@/shared/lib/letterHref';
import { BRAND_ACCENTS } from '@/shared/data/brandAccents';

type ColumnItem = CmsTrendCard & { href?: string | null; imageUrl?: string | null };

// 리스트형으로 톤을 바꿔서 위 TrendingEconomySection 카드 그리드와 시각적
// 리듬을 다르게 줌(UPPITY 의 칼럼/머니레터처럼 섹션마다 레이아웃이 미묘하게
// 달라야 "여러 코너가 있다"는 느낌이 남). 아이콘은 카드 순서로 순환 배정,
// 강조색은 공용 브랜드 팔레트(brandAccents.ts, 2026-08-06 통일)에서.
const COLUMN_ICONS = [LightbulbIcon, CoinJarIcon, HouseSunIcon];

// admin 이 아직 칼럼 카드를 하나도 안 만들었을 때 홈이 통째로 비어 보이지
// 않도록 두는 자리채우기 — CMS 에 카드가 있으면 그쪽이 우선한다.
const FALLBACK: ColumnItem[] = [
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
  const [cmsCards, setCmsCards] = useState<ColumnItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchTrendCards(),
      fetchCmsPosts('letters', undefined, 100),
    ]).then(([cards, letters]) => {
      if (cancelled) return;
      // "칼럼" 태그(section:'column')가 명시된 글뿐 아니라, editor_id가 없거나
      // 기본 명의("AI LENS")인 일반 레터도 여기로 편입한다 — "이슈 톡톡"은
      // admin이 실제 이름으로 태깅한 레터 전용으로 좁혔으니(FollowingFeed.tsx
      // 참조, 2026-08-07 사용자 확인), 태그 없는 일반 레터의 자리가 여기다.
      const tagged: ColumnItem[] = letters
        .filter(
          (l) => l.section === 'column' || (!l.section && (!l.editor_id || l.editor_id === 'AI LENS')),
        )
        .map((l) => ({
          id: l.id,
          section: 'column' as const,
          category: l.category || l.editor_id || 'AI LENS',
          title: l.headline,
          excerpt: l.subtitle ?? '',
          date: l.publish_date ?? '',
          is_cms: true as const,
          href: letterHref(l.id),
          imageUrl: l.cover_image_url || null,
        }));
      const merged = [...tagged, ...cards.filter((c) => c.section === 'column')].sort((a, b) =>
        b.date.localeCompare(a.date),
      );
      setCmsCards(merged);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // 홈은 최신 3개만 티저로 — 전체는 '더보기'로 이동하는 /letters 아카이브에서.
  // (전체를 다 보여주면 '더보기' 링크 자체가 무의미해진다.)
  const cards = (cmsCards && cmsCards.length > 0 ? cmsCards : FALLBACK).slice(0, 3);

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
            Column
          </p>
          {/* 섹션 제목 타이포 통일(2026-08-06) — 홈 화면 섹션 제목을 전부
              Pretendard Bold로(웹툰만 튀어 보이던 문제). */}
          <h2 className="text-gray-900" style={{ fontSize: 'clamp(20px, 4.4vw, 24px)', fontWeight: 800, letterSpacing: '-0.02em' }}>
            이번 주 인기 칼럼
          </h2>
        </div>
        {/* "더보기 →" — 예전엔 경제 캘린더로 잘못 연결됐던 링크(위 파일 상단
            주석 참조). /letters 전체 아카이브 페이지가 이미 있어 거기로. */}
        <Link
          href="/letters"
          className="text-gray-500 hover:text-gray-900"
          style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 4 }}
        >
          더 보기
          <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6" />
          </svg>
        </Link>
      </header>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(8px, 2vw, 12px)' }}>
        {cards.map((c, i) => {
          const Icon = COLUMN_ICONS[i % COLUMN_ICONS.length];
          // "매거진 고급짐" 카드 톤(2026-08-06) — 이슈 톡톡·트렌드와 같은 원칙:
          // 각진 라운드·테두리 없음·옅은 그림자·무채색 킥커. 아이콘 배경도 카드마다
          // 다른 파스텔(보라/핑크/초록)이 나란히 있으니 알록달록해 보였다는 지적으로
          // 중립 회색으로 통일(아이콘 라인 컬러만 accent 유지 — 완전히 무채색은 아님).
          const { accent } = BRAND_ACCENTS[i % BRAND_ACCENTS.length];
          const cardStyle = {
            gap: 16,
            padding: 14,
            borderRadius: 8,
            background: '#fff',
            boxShadow: '0 1px 2px rgba(17,24,39,0.03), 0 3px 10px rgba(17,24,39,0.04)',
            // 그림자만으로는 가장자리가 흐릿해 보일 수 있어 아주 옅은 헤어라인을 같이 준다.
            border: '1px solid rgba(0,0,0,0.06)',
            cursor: c.href ? ('pointer' as const) : ('default' as const),
          };
          const cardInner = (
            <>
              <div
                className="flex-shrink-0 flex items-center justify-center overflow-hidden"
                style={{ width: 80, height: 80, borderRadius: 8, background: '#f5f5f4' }}
              >
                {c.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.imageUrl} alt={c.title} className="w-full h-full" style={{ objectFit: 'cover' }} />
                ) : (
                  <Icon accent={accent} className="w-1/2 h-1/2" />
                )}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <p
                  className="text-gray-400"
                  style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}
                >
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
            </>
          );
          return c.href ? (
            <Link key={c.id} href={c.href} className="flex items-center" style={cardStyle}>
              {cardInner}
            </Link>
          ) : (
            <article key={c.id} className="flex items-center" style={cardStyle}>
              {cardInner}
            </article>
          );
        })}
      </div>
    </section>
  );
}
