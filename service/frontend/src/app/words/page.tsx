'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Header } from '@/widgets/Header';
import { SmartSearchOverlay } from '@/components/mbti/SmartSearchOverlay';
import { useMbtiGroup } from '@/shared/hooks/useMbtiGroup';
import { buildHeaderTabs } from '@/shared/lib/headerTabs';
import { fetchCmsPosts } from '@/shared/lib/cmsPostsApi';
import { toLetterIdFromApi } from '@/shared/lib/todayLettersApi';
import { letterHref } from '@/shared/lib/letterHref';

// 레터마다 본문 하단에 있던 "단어" 목록을 전부 모아 보여준다 — 새 데이터 구조
// 없이 이미 있는 letter.keywords 를 모으기만 하면 돼서(레서 참고 — 2026-08-06),
// 단어장 자체가 하나의 새 콘텐츠 타입은 아니고 기존 데이터의 다른 진입점이다.
//
// 2026-08-07: 단어를 눌렀을 때 그 단어를 다룬 레터(스토리)로 이동하는 링크
// 추가 — 용어가 어느 레터에서 왔는지 원래는 버려지던 정보를 href로 살려둔다.
// 용어 하나가 여러 레터에 등장하면(중복 dedupe) 그중 설명이 더 긴 쪽의 출처를 쓴다.
interface Term {
  term: string;
  explain: string;
  href: string | null;
}

function dedupeTerms(all: Term[]): Term[] {
  const seen = new Map<string, Term>();
  for (const t of all) {
    const key = t.term.trim();
    if (!key) continue;
    // 같은 단어가 여러 레터에 나오면 설명이 더 긴(자세한) 쪽을 남긴다.
    const prev = seen.get(key);
    if (!prev || t.explain.length > prev.explain.length) {
      seen.set(key, { term: key, explain: t.explain.trim(), href: t.href });
    }
  }
  return [...seen.values()].sort((a, b) => a.term.localeCompare(b.term, 'ko'));
}

// 사이트 나머지가 쓰는 손그림·MBTI 컬러 팔레트를 단어 카드에도 순환 배정 —
// 처음엔 흑백 리스트뿐이라 "사전 API 응답 같다"는 피드백(2026-08-06)으로
// 색·디테일을 더했다. 카테고리 데이터가 없어 의미상 배정은 아니지만, 목적은
// 스캔하기 좋은 리듬(형광펜으로 표시한 단어장 느낌)이지 분류가 아니다.
const ACCENT_PALETTE = [
  { accent: '#dc2626', bg: '#fdeeee' },
  { accent: '#0891b2', bg: '#eaf6f7' },
  { accent: '#7c3aed', bg: '#f0edf7' },
  { accent: '#d97706', bg: '#f7f0e3' },
  { accent: '#059669', bg: '#e8f5ef' },
  { accent: '#db2777', bg: '#fce8f1' },
];

export default function WordsPage() {
  const [userGroup] = useMbtiGroup('SF');
  const [showSearch, setShowSearch] = useState(false);
  const [terms, setTerms] = useState<Term[] | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetchCmsPosts('letters', undefined, 100).then((letters) => {
      if (cancelled) return;
      const all = letters.flatMap((l) => {
        const id = l.mbti_group ? toLetterIdFromApi(l.mbti_group, l.publish_date ?? '') : l.id;
        const href = letterHref(id);
        return (l.keywords ?? []).map((k) => ({ ...k, href }));
      });
      setTerms(dedupeTerms(all));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!terms) return null;
    const q = query.trim();
    if (!q) return terms;
    return terms.filter((t) => t.term.includes(q) || t.explain.includes(q));
  }, [terms, query]);

  return (
    <div className="min-h-screen" style={{ background: '#fdfcfa' }}>
      <Header onSearch={() => setShowSearch(true)} tabs={buildHeaderTabs('feed')} frosted />
      <SmartSearchOverlay open={showSearch} onClose={() => setShowSearch(false)} selectedGroup={userGroup} />

      {/* 진입 임팩트 — 제목만 달랑 있던 걸 컬러 그라데이션 배경 + 아이콘으로.
          "이 페이지가 뭘 하는 곳인지" 1초 안에 보이도록. */}
      <div
        style={{
          background: 'radial-gradient(120% 100% at 15% 0%, #fef3c7 0%, #fdfcfa 55%)',
          borderBottom: '1px solid #f3f0ea',
        }}
      >
        <main style={{ maxWidth: 680, margin: '0 auto', padding: 'clamp(32px, 6vw, 60px) clamp(20px, 5vw, 32px) clamp(20px, 4vw, 28px)' }}>
          <div className="flex items-center" style={{ gap: 14, marginBottom: 14 }}>
            <div
              className="flex items-center justify-center flex-shrink-0"
              style={{ width: 48, height: 48, borderRadius: 14, background: '#fff', boxShadow: '0 2px 8px rgba(217,119,6,0.18)' }}
            >
              <span style={{ fontSize: 22 }} aria-hidden>💡</span>
            </div>
            <div>
              <p
                className="text-amber-700"
                style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 2 }}
              >
                Glossary
              </p>
              <h1
                className="font-medium text-gray-900"
                style={{ fontFamily: '"Noto Serif KR", serif', fontSize: 'clamp(24px, 4.5vw, 30px)', letterSpacing: '-0.02em' }}
              >
                단어장
              </h1>
            </div>
          </div>
          <p style={{ fontSize: 13.5, color: '#78716c', marginBottom: 22, lineHeight: 1.6 }}>
            레터에 나온 경제 용어를 모아뒀어요. 궁금할 때마다 하나씩 찾아보세요.
          </p>

          {/* 검색창 — 아이콘·둥근 필·포커스 링으로 존재감을 줬다(이전엔 밋밋한 회색 박스). */}
          <div className="relative">
            <span
              aria-hidden
              className="absolute"
              style={{ left: 16, top: '50%', transform: 'translateY(-50%)', fontSize: 15, opacity: 0.4 }}
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
                padding: '13px 16px 13px 42px',
                fontSize: 14,
                color: '#111827',
                background: '#fff',
                border: '1.5px solid #eee8dd',
                borderRadius: 999,
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                transition: 'border-color 0.15s, box-shadow 0.15s',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = '#d97706';
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(217,119,6,0.14)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = '#eee8dd';
                e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)';
              }}
            />
          </div>
        </main>
      </div>

      <main style={{ maxWidth: 680, margin: '0 auto', padding: '20px clamp(20px, 5vw, 32px) 80px' }}>
        {filtered !== null && filtered.length > 0 && (
          <p style={{ fontSize: 11.5, color: '#a8a29e', marginBottom: 12, fontWeight: 600 }}>
            총 {filtered.length}개
          </p>
        )}

        {terms === null && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} style={{ height: 56, borderRadius: 14, background: '#f3f1ec' }} />
            ))}
          </div>
        )}

        {filtered !== null && filtered.length === 0 && (
          <div style={{ padding: '52px 0', textAlign: 'center' }}>
            <p style={{ fontSize: 26, marginBottom: 8 }} aria-hidden>
              {query ? '🔎' : '📖'}
            </p>
            <p style={{ fontSize: 13.5, color: '#a8a29e' }}>
              {query ? '검색 결과가 없어요.' : '아직 모인 단어가 없어요.'}
            </p>
          </div>
        )}

        {filtered !== null && filtered.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map((t, i) => {
              const { accent, bg } = ACCENT_PALETTE[i % ACCENT_PALETTE.length];
              const rowStyle = {
                borderRadius: 12,
                background: '#fff',
                border: '1px solid #f1efe9',
                borderLeft: `4px solid ${accent}`,
                overflow: 'hidden' as const,
                cursor: t.href ? ('pointer' as const) : ('default' as const),
              };
              const rowInner = (
                <>
                  <div style={{ padding: '13px 16px', flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 15, fontWeight: 700, color: '#1c1917', margin: '0 0 4px', letterSpacing: '-0.01em' }}>
                      {t.term}
                    </p>
                    {t.explain && (
                      <p style={{ fontSize: 13, color: '#78716c', margin: 0, lineHeight: 1.65 }}>{t.explain}</p>
                    )}
                  </div>
                  {/* 스토리(더보기)가 있는 단어만 화살표로 눌러볼 수 있다는 걸 표시 */}
                  {t.href && (
                    <div className="flex items-center flex-shrink-0" style={{ padding: '0 14px' }}>
                      <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#a8a29e" strokeWidth={2.4} aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6" />
                      </svg>
                    </div>
                  )}
                </>
              );
              const handlers = {
                onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
                  e.currentTarget.style.background = bg;
                },
                onMouseLeave: (e: React.MouseEvent<HTMLElement>) => {
                  e.currentTarget.style.background = '#fff';
                },
              };
              return t.href ? (
                <Link key={t.term} href={t.href} className="flex items-center transition-colors" style={rowStyle} {...handlers}>
                  {rowInner}
                </Link>
              ) : (
                <div key={t.term} className="flex items-center transition-colors" style={rowStyle} {...handlers}>
                  {rowInner}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
