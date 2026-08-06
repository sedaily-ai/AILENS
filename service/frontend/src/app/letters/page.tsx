'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Header } from '@/widgets/Header';
import { SmartSearchOverlay } from '@/components/mbti/SmartSearchOverlay';
import { useMbtiGroup } from '@/shared/hooks/useMbtiGroup';
import { buildHeaderTabs } from '@/shared/lib/headerTabs';
import { fetchCmsPosts, fetchTrendCards } from '@/shared/lib/cmsPostsApi';
import { letterHref } from '@/shared/lib/letterHref';
import {
  withDisplayMeta,
  toLetterIdFromApi,
} from '@/shared/lib/todayLettersApi';
import { LetterMailIcon, StockBullIcon, LightbulbIcon } from '@/features/news-feed/components/icons/HandDrawnIcons';

// 홈의 "레터"/"요즘 화제의 경제 이슈"/"이번 주 인기 칼럼" 세 섹션은 각각 오늘자
// 몇 편만 보여준다 — 지금까지 쌓인 전체를 훑어보고 싶으면 이 페이지. 예전엔
// "더보기 →"가 경제 캘린더(시장 일정 표)로 잘못 연결돼 있었다.
//
// 필터는 매경 dig(dig.mk.co.kr/Digging)의 카테고리 알약 버튼 형태를 참고했다 —
// 다만 저긴 "사회/금융/부동산" 같은 주제 카테고리고, 여긴 홈 화면 3섹션(레터/
// 트렌드/칼럼)을 그대로 필터 축으로 쓴다. 트렌드·칼럼 카드는 아직 자체 상세
// 페이지가 없어(홈에서도 클릭이 안 됨) 목록에서도 링크 없이 카드로만 보여준다.
const PAGE_SIZE = 100;

type Kind = 'letter' | 'trend' | 'column';

interface ArchiveItem {
  key: string;
  kind: Kind;
  title: string;
  excerpt: string;
  date: string;
  accent: string;
  href: string | null;
  avatarUrl: string | null;
  badgeLabel: string;
}

const FILTERS: Array<{ key: 'all' | Kind; label: string }> = [
  { key: 'all', label: '전체' },
  { key: 'letter', label: '레터' },
  { key: 'trend', label: '트렌드' },
  { key: 'column', label: '인기 칼럼' },
];

const TREND_ACCENT = '#dc2626';
const COLUMN_ACCENT = '#059669';

function dateLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map((s) => parseInt(s, 10));
  if (!y || !m || !d) return iso;
  const dow = ['일', '월', '화', '수', '목', '금', '토'][new Date(y, m - 1, d).getDay()];
  return `${y}.${String(m).padStart(2, '0')}.${String(d).padStart(2, '0')} (${dow})`;
}

export default function LettersArchivePage() {
  const [userGroup] = useMbtiGroup('SF');
  const [showSearch, setShowSearch] = useState(false);
  const [items, setItems] = useState<ArchiveItem[] | null>(null);
  const [filter, setFilter] = useState<'all' | Kind>('all');

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchCmsPosts('letters', undefined, PAGE_SIZE),
      fetchTrendCards(),
    ]).then(([letters, cards]) => {
      if (cancelled) return;

      const letterItems: ArchiveItem[] = letters.map((letter) => {
        const meta = withDisplayMeta(letter);
        const date = letter.publish_date ?? '';
        const id = letter.mbti_group ? toLetterIdFromApi(letter.mbti_group, date) : letter.id;
        // admin 이 /letters 태그(트렌드/인기 칼럼)를 달아둔 레터는 채널은
        // 그대로 letters(클릭 가능한 상세 페이지 유지)지만 필터 분류만 그쪽으로.
        const kind: Kind = letter.section === 'trend' || letter.section === 'column' ? letter.section : 'letter';
        return {
          key: `letter-${letter.id}`,
          kind,
          title: letter.headline,
          excerpt: letter.subtitle ?? '',
          date,
          accent: meta.accent,
          href: letterHref(id),
          // 캐릭터 아바타 대신 역할 워딩으로 — "소율"이라는 이름만 봐서는
          // 어떤 이야기인지 짐작이 안 된다는 피드백 반영. "트렌드 캐스터"처럼
          // 스타일을 설명하는 말이 이름보다 낫다.
          avatarUrl: null,
          badgeLabel: meta.editorRole,
        };
      });

      const cardItems: ArchiveItem[] = cards.map((c) => ({
        key: `${c.section}-${c.id}`,
        kind: c.section === 'trend' ? 'trend' : 'column',
        title: c.title,
        excerpt: c.excerpt,
        date: c.date,
        accent: c.section === 'trend' ? TREND_ACCENT : COLUMN_ACCENT,
        href: null,
        avatarUrl: null,
        badgeLabel: c.category || (c.section === 'trend' ? '경제 이슈' : '칼럼'),
      }));

      const all = [...letterItems, ...cardItems].sort((a, b) => b.date.localeCompare(a.date));
      setItems(all);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!items) return null;
    if (filter === 'all') return items;
    return items.filter((it) => it.kind === filter);
  }, [items, filter]);

  return (
    <div className="min-h-screen bg-white">
      <Header onSearch={() => setShowSearch(true)} tabs={buildHeaderTabs('feed')} frosted />
      <SmartSearchOverlay open={showSearch} onClose={() => setShowSearch(false)} selectedGroup={userGroup} />

      <main style={{ maxWidth: 720, margin: '0 auto', padding: 'clamp(28px, 5vw, 56px) clamp(20px, 5vw, 32px) 80px' }}>
        <header style={{ marginBottom: 20 }}>
          <p
            className="text-gray-400"
            style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}
          >
            Archive
          </p>
          <h1
            className="font-medium text-gray-900"
            style={{ fontFamily: '"Noto Serif KR", serif', fontSize: 'clamp(24px, 4.5vw, 30px)', letterSpacing: '-0.02em' }}
          >
            지금까지의 모든 콘텐츠
          </h1>
        </header>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                style={{
                  padding: '8px 18px',
                  borderRadius: 999,
                  fontSize: 13.5,
                  fontWeight: 600,
                  border: active ? 'none' : '1px solid #e5e7eb',
                  background: active ? '#111827' : '#fff',
                  color: active ? '#fff' : '#4b5563',
                  cursor: 'pointer',
                  transition: 'background .15s, color .15s',
                }}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        {filtered !== null && (
          <p style={{ fontSize: 12.5, color: '#9ca3af', marginBottom: 14 }}>총 {filtered.length}개</p>
        )}

        {items === null && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} style={{ height: 84, borderRadius: 16, background: '#f3f4f6' }} />
            ))}
          </div>
        )}

        {filtered !== null && filtered.length === 0 && (
          <p style={{ fontSize: 14, color: '#9ca3af', padding: '40px 0', textAlign: 'center' }}>
            아직 콘텐츠가 없어요.
          </p>
        )}

        {filtered !== null && filtered.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map((item) => {
              const Icon = item.kind === 'trend' ? StockBullIcon : item.kind === 'column' ? LightbulbIcon : LetterMailIcon;
              const inner = (
                <>
                  <span
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: '50%',
                      flexShrink: 0,
                      background: `${item.accent}14`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Icon accent={item.accent} className="w-7 h-7" />
                  </span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: item.accent }}>{item.badgeLabel}</span>
                      <span style={{ fontSize: 11, color: '#9ca3af' }}>{item.date ? dateLabel(item.date) : ''}</span>
                    </div>
                    <p
                      className="font-medium text-gray-900"
                      style={{
                        fontFamily: '"Noto Serif KR", serif',
                        fontSize: 15.5,
                        lineHeight: 1.4,
                        letterSpacing: '-0.01em',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {item.title}
                    </p>
                  </div>
                </>
              );

              if (item.href) {
                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    className="flex items-center gap-4 rounded-2xl transition-colors hover:bg-gray-50"
                    style={{ padding: '14px 16px', border: '1px solid #f1f1f0' }}
                  >
                    {inner}
                  </Link>
                );
              }
              return (
                <div
                  key={item.key}
                  className="flex items-center gap-4 rounded-2xl"
                  style={{ padding: '14px 16px', border: '1px solid #f1f1f0' }}
                >
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
