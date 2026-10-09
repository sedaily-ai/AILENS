'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Header } from '@/widgets/Header';
import { SearchOverlay } from '@/shared/ui/search/SearchOverlay';
import { buildHeaderTabs } from '@/shared/lib/headerTabs';
import { LightbulbIcon } from '@/shared/ui/icons/HandDrawnIcons';
import type { Term } from './words';

// /letters 아카이브와 같은 톤(아이콘 배지 + 서리프 타이틀 + 옅은 테두리 카드). 용어는 분류가 없어 이 페이지가 쓰던 앰버 하나로 통일하고,
// "해설" 의미에 맞는 LightbulbIcon 하나만 재사용한다.
const ACCENT = '#d97706';

// page.tsx(서버)가 미리 가져온 initialTerms를 받아 처음부터 실제 목록을 렌더한다(크롤러에도 빈 페이지가 아니다). 이 컴포넌트는 검색 인터랙션(입력·필터링)만 담당한다.
// widgets/FeedPage/FeedPage.tsx와 같은 형태로, page.tsx는 라우팅·메타데이터·서버 데이터 페칭만 맡고 구현은 widgets에 둔다. URL은 /words다.
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
      {/* 'feed' 탭은 상단 nav에 없다(headerTabs.ts 참조). 이 페이지에는 강조할 대응 탭이 없다. */}
      <Header onSearch={() => setShowSearch(true)} tabs={buildHeaderTabs()} frosted />
      <SearchOverlay open={showSearch} onClose={() => setShowSearch(false)} />

      {/* /letters 아카이브와 같은 헤더 톤. 그라데이션 배경·그림자 아이콘박스 없이 회색 대문자 eyebrow + 서리프 타이틀만 둔다. */}
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
