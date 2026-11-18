'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Header } from '@/widgets/Header';
import { SearchOverlay } from '@/shared/ui/search/SearchOverlay';
import { buildHeaderTabs } from '@/shared/lib/headerTabs';
import { LightbulbIcon } from '@/shared/ui/icons/HandDrawnIcons';
import { Pager } from '@/shared/ui/list/Pager';
import { fetchTerms, wordsPagePath, type Term } from './words';

// /letters 아카이브와 같은 톤(아이콘 배지 + 서리프 타이틀 + 옅은 테두리 카드). 용어는 분류가 없어 이 페이지가 쓰던 앰버 하나로 통일하고,
// "해설" 의미에 맞는 LightbulbIcon 하나만 재사용한다.
const ACCENT = '#d97706';

// page.tsx(서버)가 미리 가져온 initialTerms를 받아 처음부터 실제 목록을 렌더한다(크롤러에도 빈 페이지가 아니다). 이 컴포넌트는 검색 인터랙션(입력·필터링)만 담당한다.
// widgets/FeedPage/FeedPage.tsx와 같은 형태로, page.tsx는 라우팅·메타데이터·서버 데이터 페칭만 맡고 구현은 widgets에 둔다. URL은 /words다.
export function WordsPage({
  initialTerms,
  currentPage,
  totalPages,
  totalCount,
}: {
  initialTerms: Term[];
  currentPage: number;
  totalPages: number;
  totalCount: number;
}) {
  const [showSearch, setShowSearch] = useState(false);
  const [query, setQuery] = useState('');
  // 서버는 이 페이지 몫(100개)만 내려준다. 검색은 전체가 필요해서 입력을 시작할 때 한 번만 전체 목록을 가져온다.
  const [allTerms, setAllTerms] = useState<Term[] | null>(null);
  const searching = query.trim() !== '';

  useEffect(() => {
    if (!searching || allTerms) return;
    let cancelled = false;
    fetchTerms()
      .then((rows) => {
        if (!cancelled) setAllTerms(rows);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [searching, allTerms]);

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return initialTerms;
    return (allTerms ?? initialTerms).filter((t) => t.term.includes(q) || t.explain.includes(q));
  }, [initialTerms, allTerms, query]);

  return (
    <div className="min-h-screen" style={{ background: '#fdfcfa' }}>
      <Header searchOpen={showSearch} onSearch={() => setShowSearch((open) => !open)} tabs={buildHeaderTabs('words')} frosted />
      <SearchOverlay open={showSearch} onClose={() => setShowSearch(false)} />

      {/* /letters 아카이브와 같은 헤더 톤. 그라데이션 배경·그림자 아이콘박스 없이 회색 대문자 eyebrow + 서리프 타이틀만 둔다. */}
      <main id="main-content" tabIndex={-1} style={{ maxWidth: 720, margin: '0 auto', padding: 'clamp(28px, 5vw, 56px) clamp(20px, 5vw, 32px) 80px' }}>
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
          <p style={{ fontSize: 12.5, color: '#9ca3af', marginBottom: 14 }}>
            {searching ? `검색 결과 ${filtered.length}개` : `총 ${totalCount}개 · ${currentPage}/${totalPages}페이지`}
          </p>
        )}

        {filtered.length === 0 && (
          <p style={{ fontSize: 14, color: '#9ca3af', padding: '40px 0', textAlign: 'center' }}>
            {query ? '검색 결과가 없어요.' : '아직 모인 단어가 없어요.'}
          </p>
        )}

        {filtered.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* 용어가 1,600개를 넘어 줄마다 같은 SVG·인라인 스타일을 반복하면 HTML이 3MB까지 커졌다(2026-11-18).
                아이콘은 <symbol> 한 번 + <use>로, 반복 스타일은 클래스 한 벌로 묶는다. 겉모습은 그대로다. */}
            <style>{`
              .wd-row { padding: 14px 16px; border: 1px solid #f1f1f0; }
              .wd-ico { width: 44px; height: 44px; border-radius: 50%; flex-shrink: 0; background: ${ACCENT}14; display: flex; align-items: center; justify-content: center; }
              .wd-term { font-family: "Noto Serif KR", serif; font-size: 15.5px; letter-spacing: -0.01em; margin-bottom: 4px; }
              .wd-exp { font-size: 13px; color: #78716c; margin: 0; line-height: 1.55; }
            `}</style>
            <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden focusable="false">
              <symbol id="wd-bulb" viewBox="0 0 96 96">
                <LightbulbIcon accent={ACCENT} />
              </symbol>
            </svg>
            {filtered.map((t) => {
              const rowClass = 'wd-row flex items-center gap-4 rounded-2xl transition-colors hover:bg-gray-50';
              const inner = (
                <>
                  <span className="wd-ico" aria-hidden>
                    <svg className="w-7 h-7" fill="none">
                      <use href="#wd-bulb" />
                    </svg>
                  </span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p className="wd-term font-medium text-gray-900">{t.term}</p>
                    {t.explain && <p className="wd-exp">{t.explain}</p>}
                  </div>
                </>
              );
              return t.href ? (
                <Link key={t.term} href={t.href} className={rowClass}>
                  {inner}
                </Link>
              ) : (
                <div key={t.term} className={rowClass}>
                  {inner}
                </div>
              );
            })}
          </div>
        )}

        {!searching && <Pager currentPage={currentPage} totalPages={totalPages} hrefFor={wordsPagePath} />}
      </main>
    </div>
  );
}
