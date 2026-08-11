'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Header } from '@/widgets/Header';
import { SmartSearchOverlay } from '@/shared/ui/SmartSearchOverlay';
import { buildHeaderTabs } from '@/shared/lib/headerTabs';
import { fetchCmsPosts } from '@/shared/lib/cmsPostsApi';
import { letterHref } from '@/shared/lib/letterHref';
import { LightbulbIcon } from '@/features/news-feed/components/icons/HandDrawnIcons';

// 레터마다 본문 하단에 있던 "단어" 목록을 전부 모아 보여준다 — 새 데이터 구조
// 없이 이미 있는 letter.keywords 를 모으기만 하면 돼서(레서 참고 — 2026-08-06),
// 용어 해설(구 명칭 "단어장") 자체가 하나의 새 콘텐츠 타입은 아니고 기존
// 데이터의 다른 진입점이다.
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

// 2026-08-09 — 행마다 무의미하게 순환하던 무지개색 왼쪽 테두리를 걷어내고,
// /letters 아카이브와 같은 톤(아이콘 배지 + 서리프 타이틀 + 옅은 테두리 카드)으로
// 맞췄다. 레터 kind별로 다른 아이콘을 쓰는 아카이브와 달리 용어는 분류가 없어서
// 사이트 전체가 이 페이지에 이미 쓰던 앰버 하나로 통일(과한 색 대신 "해설"이라는
// 의미가 맞는 LightbulbIcon 하나만 재사용).
const ACCENT = '#d97706';

export default function WordsPage() {
  const [showSearch, setShowSearch] = useState(false);
  const [terms, setTerms] = useState<Term[] | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetchCmsPosts('letters', undefined, 100).then((letters) => {
      if (cancelled) return;
      const all = letters.flatMap((l) => {
        const href = letterHref(l.id);
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

        {filtered !== null && filtered.length > 0 && (
          <p style={{ fontSize: 12.5, color: '#9ca3af', marginBottom: 14 }}>총 {filtered.length}개</p>
        )}

        {terms === null && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} style={{ height: 66, borderRadius: 16, background: '#f3f1ec' }} />
            ))}
          </div>
        )}

        {filtered !== null && filtered.length === 0 && (
          <p style={{ fontSize: 14, color: '#9ca3af', padding: '40px 0', textAlign: 'center' }}>
            {query ? '검색 결과가 없어요.' : '아직 모인 단어가 없어요.'}
          </p>
        )}

        {filtered !== null && filtered.length > 0 && (
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
