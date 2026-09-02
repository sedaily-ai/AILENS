'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Layers, Image as ImageIcon, Headphones, Video } from 'lucide-react';
import { Header } from '@/widgets/Header';
import { SmartSearchOverlay } from '@/shared/ui/SmartSearchOverlay';
import { ArchiveHeader } from '@/shared/ui/ArchiveHeader';
import { HomeSideBar } from '@/widgets/HomeSideBar';
import { buildHeaderTabs } from '@/shared/lib/headerTabs';
import { LENS_ACCENT } from '@/shared/constants/lensPerspectives';
import { BRAND_ACCENTS } from '@/shared/data/brandAccents';
import type { TodayLetterCardLike } from '@/shared/lib/api/todayLettersApi';

export interface FormatCardData {
  key: 'lens' | 'webtoon' | 'podcast' | 'video';
  href: string;
  title: string;
  tagline: string;
  count: number;
  latest: string | null;
}

// 2026-08-28 재설계 — 카드 색·아이콘은 LENS_PERSPECTIVES(lens/[slug]/의 4형식
// 선택기)와 같은 팔레트를 쓴다. lens 인덱스 1~3(웹툰/팟캐스트/영상)과 이
// 페이지의 카드 순서가 정확히 대응하므로 BRAND_ACCENTS를 그대로 재사용 —
// 새 색을 만들지 않는다. lens(4가지 시선) 카드만 팔레트에 없어서
// LENS_ACCENT(#3b82f6, 이미 lens 채널 전역에서 쓰는 색)로 별도 지정한다.
const CARD_META: Record<FormatCardData['key'], { icon: typeof Layers; color: string; tint: string }> = {
  lens: { icon: Layers, color: LENS_ACCENT, tint: '#eff6ff' },
  webtoon: { icon: ImageIcon, color: BRAND_ACCENTS[1].accent, tint: BRAND_ACCENTS[1].soft },
  podcast: { icon: Headphones, color: BRAND_ACCENTS[2].accent, tint: BRAND_ACCENTS[2].soft },
  video: { icon: Video, color: BRAND_ACCENTS[3].accent, tint: BRAND_ACCENTS[3].soft },
};

function FormatCard({ card }: { card: FormatCardData }) {
  const meta = CARD_META[card.key];
  const Icon = meta.icon;
  return (
    <Link
      href={card.href}
      className="group"
      style={{
        display: 'block',
        border: '1px solid rgba(17,24,39,0.08)',
        borderRadius: 16,
        padding: 'clamp(18px, 2.6vw, 24px)',
        textDecoration: 'none',
        transition: 'border-color .14s ease, box-shadow .14s ease',
      }}
    >
      <span
        className="flex items-center justify-center"
        style={{ width: 44, height: 44, borderRadius: 12, background: meta.tint, marginBottom: 16 }}
      >
        <Icon size={22} color={meta.color} aria-hidden />
      </span>
      <h2 style={{ fontSize: 19, fontWeight: 800, color: '#111827', letterSpacing: '-0.02em', marginBottom: 6 }}>
        {card.title}
      </h2>
      <p style={{ fontSize: 14, color: '#6b7280', lineHeight: 1.6, marginBottom: 14, wordBreak: 'keep-all' }}>
        {card.tagline}
      </p>
      <div style={{ borderTop: '1px solid rgba(17,24,39,0.07)', paddingTop: 12 }}>
        {card.latest && (
          <p
            style={{
              fontSize: 13.5,
              color: '#374151',
              marginBottom: 6,
              display: '-webkit-box',
              WebkitLineClamp: 1,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              wordBreak: 'keep-all',
            }}
          >
            최신: {card.latest}
          </p>
        )}
        <div className="flex items-center justify-between">
          <span style={{ fontSize: 12.5, color: '#9ca3af', fontVariantNumeric: 'tabular-nums' }}>
            지금까지 {card.count}개
          </span>
          <span
            className="group-hover:translate-x-0.5"
            aria-hidden
            style={{ fontSize: 14, color: meta.color, fontWeight: 700, transition: 'transform .14s ease' }}
          >
            전체 보기 ›
          </span>
        </div>
      </div>
    </Link>
  );
}

export function ArchiveHubClient({
  cards,
  initialHotLetters,
}: {
  cards: FormatCardData[];
  initialHotLetters?: TodayLetterCardLike[];
}) {
  const [showSearch, setShowSearch] = useState(false);

  return (
    <div className="min-h-screen bg-white">
      <Header onSearch={() => setShowSearch(true)} tabs={buildHeaderTabs()} frosted />
      <SmartSearchOverlay open={showSearch} onClose={() => setShowSearch(false)} />

      <div className="mx-auto" style={{ maxWidth: 1320, padding: 'clamp(8px, 2vw, 16px) clamp(24px, 3.5vw, 44px) 0' }}>
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px]" style={{ columnGap: 64 }}>
          <main style={{ padding: '0 0 80px' }}>
            <ArchiveHeader
              kicker="Archive"
              title="지금까지의 모든 콘텐츠"
              accentColor="#111827"
              description="같은 이슈도 형식을 바꾸면 다르게 다가와요. 지금 상황에 맞는 형식을 골라 보세요."
            />
            <div className="grid grid-cols-1 sm:grid-cols-2" style={{ gap: 16, marginTop: 8 }}>
              {cards.map((card) => (
                <FormatCard key={card.key} card={card} />
              ))}
            </div>
          </main>

          <HomeSideBar className="hidden lg:block" initialHotLetters={initialHotLetters} />
        </div>
      </div>
    </div>
  );
}
