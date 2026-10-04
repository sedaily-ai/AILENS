'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { fetchFollowingLetters, type TodayLetterCardLike } from '@/shared/lib/api/todayLettersApi';

/** 레일에 그리는 한 줄 — 홈·기사 쪽은 TodayLetterCardLike를, 카테고리 페이지는 그 카테고리의 글(ArchiveItem)을 이 모양으로 바꿔 넘긴다. */
export interface RailItem {
  key: string;
  href: string;
  title: string;
  thumb: string | null;
  /** 제목 아래 작은 분류 라벨(예: 금융·정책). */
  label: string;
}

const HOT_LETTERS_LIMIT = 10;

export function HotLettersRail({ initialItems, items, heading = '많이 읽은 글', limit = HOT_LETTERS_LIMIT }: { initialItems?: TodayLetterCardLike[]; items?: RailItem[]; heading?: string; limit?: number }) {
  const [hotLetters, setHotLetters] = useState<TodayLetterCardLike[]>(initialItems ?? []);

  useEffect(() => {
    // 서버가 준 인기 글 5건이 있으면 브라우저에서 레터 50건(약 270KB)을 다시 받아 같은 순위를 계산하지 않는다(2026-10-03).
    // 순위는 서버가 발행 때·최대 5분 주기로 갱신한 HTML에 반영된다.
    if (initialItems && initialItems.length > 0) return;
    let cancelled = false;
    fetchFollowingLetters(HOT_LETTERS_LIMIT).then((cards) => {
      if (!cancelled) setHotLetters(cards);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const rows: RailItem[] =
    items && items.length > 0
      ? items
      : hotLetters.filter((l) => l.category).map((l) => ({ key: l.letterId, href: l.href, title: l.title, thumb: l.thumbnailUrl ?? l.editorAvatar, label: l.category ?? '' }));
  if (rows.length === 0) return null;

  // 사이드바 개편(2026-10-04) — 영문판(en.sedaily.com) "{분류} Most Read"를 그대로 따른다: 굵은 제목, 항목마다 굵은 제목(최대 3줄)+아래 작은 분류 라벨,
  // 오른쪽에 작은 사진과 모서리 번호 배지, 항목 사이 얇은 선. 10건. 마우스를 올리면 제목이 파랗게, 사진이 살짝 커진다.
  return (
    <section>
      <style>{`
        .hl-row { display: flex; gap: 16px; align-items: flex-start; padding: 16px 0; text-decoration: none; border-top: 1px solid #ececec; transition: transform .15s cubic-bezier(.22,.8,.22,1); }
        .hl-row:first-child { border-top: none; padding-top: 10px; }
        .hl-title { transition: color .18s ease; }
        .hl-row:hover .hl-title { color: #3d70de; }
        .hl-thumb img { transition: transform .4s cubic-bezier(.22,.8,.22,1); }
        .hl-row:hover .hl-thumb img { transform: scale(1.06); }
        .hl-row:active { transform: scale(.99); }
        @media (prefers-reduced-motion: reduce) { .hl-thumb img, .hl-row { transition: none; } .hl-row:active { transform: none; } }
      `}</style>
      <h3 style={{ margin: '-3px 0 6px', lineHeight: 1.25, fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', color: '#111827' }}>{heading}</h3>
      <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column' }}>
        {rows.slice(0, limit).map((r, idx) => (
          <li key={r.key}>
            <Link href={r.href} className="hl-row">
              <div style={{ flex: 1, minWidth: 0 }}>
                <p
                  className="hl-title"
                  style={{
                    margin: 0,
                    fontSize: 15.5,
                    fontWeight: 700,
                    lineHeight: 1.45,
                    letterSpacing: '-0.015em',
                    color: '#111827',
                    display: '-webkit-box',
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    wordBreak: 'keep-all',
                    textWrap: 'pretty', // 끝의 이모지 하나만 다음 줄로 떨어지는 것을 막는다
                  }}
                >
                  {r.title}
                </p>
                {r.label && <p style={{ margin: '8px 0 0', fontSize: 13, color: '#9ca3af' }}>{r.label}</p>}
              </div>
              <span className="hl-thumb" style={{ position: 'relative', width: 100, height: 66, borderRadius: 4, overflow: 'hidden', background: '#f3f4f6', flexShrink: 0, display: 'block' }}>
                {r.thumb && <Image src={r.thumb} alt="" width={200} height={132} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                <span style={{ position: 'absolute', left: 0, top: 0, minWidth: 22, height: 22, padding: '0 6px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: '#2f5fe0', color: '#fff', fontSize: 13, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
                  {idx + 1}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
