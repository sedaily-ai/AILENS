'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Header } from '@/widgets/Header';
import { SmartSearchOverlay } from '@/shared/ui/SmartSearchOverlay';
import { buildHeaderTabs } from '@/shared/lib/headerTabs';
import { LightbulbIcon } from '@/shared/ui/icons/HandDrawnIcons';
import type { Term } from './words';

// 2026-08-09 — 행마다 무의미하게 순환하던 무지개색 왼쪽 테두리를 걷어내고,
// /letters 아카이브와 같은 톤(아이콘 배지 + 서리프 타이틀 + 옅은 테두리 카드)으로
// 맞췄다. 레터 kind별로 다른 아이콘을 쓰는 아카이브와 달리 용어는 분류가 없어서
// 사이트 전체가 이 페이지에 이미 쓰던 앰버 하나로 통일(과한 색 대신 "해설"이라는
// 의미가 맞는 LightbulbIcon 하나만 재사용).
const ACCENT = '#d97706';

// SSR 분리(2026-08-12, GEO 감사) — 예전엔 이 컴포넌트 자체가 'use client'라
// terms를 useEffect+fetch로 채우고 첫 페인트엔 스켈레톤 8개만 보여줬다(크롤러엔
// 빈 페이지). 이제 page.tsx(서버)가 미리 가져온 initialTerms를 받아 처음부터
// 실제 목록을 렌더한다 — 검색 인터랙션(입력·필터링)만 이 컴포넌트가 담당.
//
// widgets/WordsPage/로 승격(2026-08 리팩토링) — app/words/ 아래
// WordsPageClient.tsx로 직접 있던 걸 widgets/FeedPage/FeedPage.tsx와
// 같은 형태(page.tsx는 라우팅·메타데이터·서버 데이터 페칭만, 실제 구현은
// widgets/로)로 옮겼다. URL(/words)은 그대로다.
export function WordsPage({ initialTerms }: { initialTerms: Term[] }) {
  const [showSearch, setShowSearch] = useState(false);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return initialTerms;
    return initialTerms.filter((t) => t.term.includes(q) || t.explain.includes(q));
  }, [initialTerms, query]);

  return (
    <div className="min-h-screen" style={{ background: '#fdfcfa' }}>
      {/* 'feed' 탭은 2026-08-17 상단 탭 개편으로 nav에서 빠졌다(headerTabs.ts
          참조) — 이 페이지 자체는 남아있지만 강조할 대응 탭이 더 없다. */}
      <Header onSearch={() => setShowSearch(true)} tabs={buildHeaderTabs()} frosted />
      <SmartSearchOverlay open={showSearch} onClose={() => setShowSearch(false)} />

      {/* /letters 아카이브와 같은 헤더 톤 — 그라데이션 배경·그림자 아이콘박스 없이
          회색 대문자 eyebrow + 서리프 타이틀만. */}
      <main style={{ maxWidth: 720, margin: '0 auto', padding: 'clamp(28px, 5vw, 56px) clamp(20px, 5vw, 32px) 80px' }}>
        <header style={{ marginBottom: 20 }}>
          <p
            className="text-gray-400"
            style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}
          >
            Glossary
          </p>
          <h1
            className="font-medium text-gray-900"
            style={{ fontFamily: '"Noto Serif KR", serif', fontSize: 'clamp(24px, 4.5vw, 30px)', letterSpacing: '-0.02em' }}
          >
            용어 해설
          </h1>
          <p style={{ fontSize: 13.5, color: '#9ca3af', marginTop: 8, lineHeight: 1.6 }}>
            레터에 나온 경제 용어를 모아뒀어요. 궁금할 때마다 하나씩 찾아보세요.
          </p>
        </header>

        {/* 검색 — 아카이브 필터 pill과 같은 톤(연한 회색 테두리, 진한 그림자 없음). */}
        <div className="relative" style={{ marginBottom: 24 }}>
          <span
            aria-hidden
            className="absolute"
            style={{ left: 16, top: '50%', transform: 'translateY(-50%)', fontSize: 14, opacity: 0.35 }}
          >
            🔍
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="궁금한 단어를 검색해보세요"
            className="focus:outline-none"
            style={{
              width: '100%',
              padding: '11px 16px 11px 40px',
              fontSize: 13.5,
              color: '#111827',
              background: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: 999,
              transition: 'border-color 0.15s',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = '#111827';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = '#e5e7eb';
            }}
          />
        </div>

        {filtered.length > 0 && (
          <p style={{ fontSize: 12.5, color: '#9ca3af', marginBottom: 14 }}>총 {filtered.length}개</p>
        )}

        {filtered.length === 0 && (
          <p style={{ fontSize: 14, color: '#9ca3af', padding: '40px 0', textAlign: 'center' }}>
            {query ? '검색 결과가 없어요.' : '아직 모인 단어가 없어요.'}
          </p>
        )}

        {filtered.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map((t) => {
              const rowClass = 'flex items-center gap-4 rounded-2xl transition-colors hover:bg-gray-50';
              const rowStyle = { padding: '14px 16px', border: '1px solid #f1f1f0' };
              const inner = (
                <>
                  <span
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: '50%',
                      flexShrink: 0,
                      background: `${ACCENT}14`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <LightbulbIcon accent={ACCENT} className="w-7 h-7" />
                  </span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p
                      className="font-medium text-gray-900"
                      style={{
                        fontFamily: '"Noto Serif KR", serif',
                        fontSize: 15.5,
                        letterSpacing: '-0.01em',
                        marginBottom: 4,
                      }}
                    >
                      {t.term}
                    </p>
                    {t.explain && (
                      <p style={{ fontSize: 13, color: '#78716c', margin: 0, lineHeight: 1.55 }}>{t.explain}</p>
                    )}
                  </div>
                </>
              );
              return t.href ? (
                <Link key={t.term} href={t.href} className={rowClass} style={rowStyle}>
                  {inner}
                </Link>
              ) : (
                <div key={t.term} className={rowClass} style={rowStyle}>
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
