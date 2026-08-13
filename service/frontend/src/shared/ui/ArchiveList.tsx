'use client';

// 콘텐츠 타입별 전용 페이지(레터/트렌드/칼럼/영상/전체) 공통 리스트 렌더러 —
// 2026-08-11, /letters 안에 있던 카드 렌더링을 4개 라우트가 같이 쓸 수 있게
// 분리. 아이콘만 features/news-feed/icons에서 그대로 가져온다(shared는
// features를 못 부르는 게 원칙이지만, 아이콘을 여기 복제하면 원본이 바뀔 때
// 슬쩍 어긋날 수 있어 단일 출처를 그대로 참조하는 쪽을 택했다 — boundaries
// 규칙은 warn이라 빌드는 안 막힌다).
import Link from 'next/link';
import Image from 'next/image';
import { LetterMailIcon, StockBullIcon, LightbulbIcon } from '@/features/news-feed/components/icons/HandDrawnIcons';
import type { ArchiveItem } from '@/shared/lib/archiveItems';

function VideoPlayIcon({ accent, className }: { accent: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke={accent} strokeWidth="1.6" />
      <path d="M10 8.5l6 3.5-6 3.5v-7z" fill={accent} />
    </svg>
  );
}

function dateLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map((s) => parseInt(s, 10));
  if (!y || !m || !d) return iso;
  const dow = ['일', '월', '화', '수', '목', '금', '토'][new Date(y, m - 1, d).getDay()];
  return `${y}.${String(m).padStart(2, '0')}.${String(d).padStart(2, '0')} (${dow})`;
}

export function ArchiveList({ items, emptyLabel }: { items: ArchiveItem[]; emptyLabel?: string }) {
  if (items.length === 0) {
    return (
      <p style={{ fontSize: 14, color: '#9ca3af', padding: '40px 0', textAlign: 'center' }}>
        {emptyLabel ?? '아직 콘텐츠가 없어요.'}
      </p>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.map((item) => {
        const Icon =
          item.kind === 'trend' ? StockBullIcon
          : item.kind === 'column' ? LightbulbIcon
          : item.kind === 'video' ? VideoPlayIcon
          : LetterMailIcon;

        const inner = (
          <>
            {item.avatarUrl ? (
              <span
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 12,
                  flexShrink: 0,
                  overflow: 'hidden',
                  background: '#f3f4f6',
                }}
              >
                <Image
                  src={item.avatarUrl}
                  alt=""
                  width={56}
                  height={56}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </span>
            ) : (
              <span
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 12,
                  flexShrink: 0,
                  background: `${item.accent}14`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon accent={item.accent} className="w-7 h-7" />
              </span>
            )}
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
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
              {item.excerpt && (
                <p
                  style={{
                    fontSize: 13,
                    color: '#9ca3af',
                    lineHeight: 1.5,
                    marginTop: 3,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {item.excerpt}
                </p>
              )}
            </div>
          </>
        );

        if (item.href && item.external) {
          return (
            <a
              key={item.key}
              href={item.href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-4 rounded-2xl transition-colors hover:bg-gray-50"
              style={{ padding: '14px 16px', border: '1px solid #f1f1f0' }}
            >
              {inner}
            </a>
          );
        }
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
  );
}
