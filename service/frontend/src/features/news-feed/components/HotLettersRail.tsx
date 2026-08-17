'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { fetchFollowingLetters, type TodayLetterCardLike } from '@/shared/lib/todayLettersApi';
import { letterHref } from '@/shared/lib/letterHref';

const HOT_LETTERS_LIMIT = 5;

// 홈 우측 사이드바(2026-08-17) — SideRail.tsx의 "요즘 가장 많이 읽힌 글"
// 부분만 떼어냈다. 인기글 목록 자체는 원래 무채색이라 손댈 것 없이 그대로
// 재사용. 사주 궁합 파트는 별도로 SajuMiniRail.tsx로 뽑아 톤(violet)만
// 다시 입혔다 — 둘 다 HomeSideBar.tsx가 하나의 sticky 컨테이너로 묶는다
// (이 컴포넌트 자체는 sticky를 갖지 않는 평범한 <section>).
export function HotLettersRail() {
  const [hotLetters, setHotLetters] = useState<TodayLetterCardLike[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchFollowingLetters(HOT_LETTERS_LIMIT).then((cards) => {
      if (!cancelled) setHotLetters(cards);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (hotLetters.length === 0) return null;

  return (
    <section>
      <header className="flex items-baseline justify-between mb-3">
        <h3
          className="font-medium text-gray-900"
          style={{ fontFamily: '"Noto Serif KR", serif', fontSize: 15, letterSpacing: '-0.015em' }}
        >
          요즘 가장 많이 읽힌 글
        </h3>
        <Link href="/?tab=archive" className="text-gray-400 hover:text-gray-900 transition-colors" style={{ fontSize: 11.5, fontWeight: 500 }}>
          전체 →
        </Link>
      </header>
      <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 0 }}>
        {hotLetters.map((l, idx) => (
          <li key={l.letterId}>
            <Link
              href={letterHref(l.letterId)}
              className="group flex items-start transition-opacity"
              style={{
                gap: 12,
                padding: '12px 0',
                borderTop: idx === 0 ? 'none' : '1px solid #f3f4f6',
                textDecoration: 'none',
              }}
            >
              <span
                className="flex-shrink-0"
                style={{
                  fontFamily: '"Noto Serif KR", serif',
                  fontSize: 18,
                  fontWeight: 700,
                  color: '#9ca3af',
                  letterSpacing: '-0.02em',
                  fontVariantNumeric: 'tabular-nums',
                  minWidth: 22,
                  lineHeight: 1.1,
                }}
              >
                {String(idx + 1).padStart(2, '0')}
              </span>
              <span className="flex-shrink-0" style={{ width: 40, height: 40, borderRadius: 8, overflow: 'hidden', background: '#f3f4f6' }}>
                <Image
                  src={l.thumbnailUrl ?? l.editorAvatar}
                  alt=""
                  width={40}
                  height={40}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </span>
              <div className="flex-1 min-w-0">
                <p
                  className="text-gray-900 font-medium group-hover:opacity-70 transition-opacity"
                  style={{
                    fontFamily: '"Noto Serif KR", serif',
                    fontSize: 13,
                    lineHeight: 1.45,
                    letterSpacing: '-0.015em',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {l.title}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
