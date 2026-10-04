'use client';

// 홈 화면 "최신 뉴스" 그리드와 카테고리 레일이 공유하는 카드. 그리드 카드는 제목+본문 미리보기 1줄, 레일 카드는 제목+요약까지 보여 준다.
import Link from 'next/link';
import Image from 'next/image';
import type { ArchiveItem } from '@/shared/lib/content/archiveItems';
import { kstDateTimeLabel } from '@/shared/lib/date/date';

function dateLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map((s) => parseInt(s, 10));
  if (!y || !m || !d) return iso;
  return `${y}.${String(m).padStart(2, '0')}.${String(d).padStart(2, '0')}`;
}

// lens 항목은 published_at(시:분 포함)이 있어 "2026.08.22 16:37"까지 표시할 수 있다. 다른 kind는 publishedAt이 없어(archiveItems.ts 참조) 날짜만 표시한다.
function dateTimeLabel(item: ArchiveItem): string {
  return kstDateTimeLabel(item.publishedAt) ?? (item.date ? dateLabel(item.date) : '');
}

function ArticleThumb({ item, aspectRatio = '16 / 9' }: { item: ArchiveItem; aspectRatio?: string }) {
  return (
    <span
      className="block-thumb"
      style={{
        display: 'block',
        width: '100%',
        aspectRatio,
        borderRadius: 12,
        overflow: 'hidden',
        background: item.avatarUrl ? '#f3f4f6' : `${item.accent}14`,
        flexShrink: 0,
        boxShadow: 'inset 0 0 0 1px rgba(17,24,39,0.06)',
      }}
    >
      {item.avatarUrl && (
        <Image
          src={item.avatarUrl}
          alt=""
          width={400}
          height={225}
          className="block-thumb-img"
          style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform .35s cubic-bezier(.2,.7,.3,1)' }}
        />
      )}
    </span>
  );
}

function CardMeta({ item }: { item: ArchiveItem }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
      {item.category && (
        <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>{item.category}</span>
      )}
      <span style={{ fontSize: 12, color: '#9ca3af' }}>{dateTimeLabel(item)}</span>
    </div>
  );
}

/** 그리드 카드 — 제목 + 본문 미리보기 1줄. excerpt는 모든 ArchiveItem에 채워져 있으므로 레일 카드(ArticleRailCard)와 같은 필드를 그대로 쓴다. */
export function ArticleGridCard({ item }: { item: ArchiveItem }) {
  return (
    <Link href={item.href ?? '#'} className="block group">
      <ArticleThumb item={item} />
      <p
        className="font-bold text-gray-900 group-hover:underline"
        style={{
          marginTop: 10,
          fontSize: 15,
          lineHeight: 1.4,
          letterSpacing: '-0.01em',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {item.title}
      </p>
      {item.excerpt && (
        <p
          style={{
            marginTop: 5,
            fontSize: 12.5,
            color: '#6b7280',
            lineHeight: 1.55,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {item.excerpt}
        </p>
      )}
      <CardMeta item={item} />
    </Link>
  );
}

/** 히어로 카드 — 그리드 맨 앞 1건, 이미지+제목+요약을 크게. */
export function ArticleHeroCard({ item }: { item: ArchiveItem }) {
  return (
    <Link href={item.href ?? '#'} className="grid gap-4 md:gap-8 md:grid-cols-2 items-center group">
      <ArticleThumb item={item} aspectRatio="16 / 10" />
      <div>
        <p
          className="font-bold text-gray-900 group-hover:underline"
          style={{
            fontFamily: '"Noto Serif KR", serif',
            fontSize: 'clamp(20px, 3.4vw, 26px)',
            lineHeight: 1.35,
            letterSpacing: '-0.015em',
          }}
        >
          {item.title}
        </p>
        {item.excerpt && (
          <p
            style={{
              marginTop: 10,
              fontSize: 14.5,
              color: '#6b7280',
              lineHeight: 1.65,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {item.excerpt}
          </p>
        )}
        <CardMeta item={item} />
      </div>
    </Link>
  );
}
