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
//
// initialItems — 처음엔 이 값 없이 client useEffect로만 불러와서 항상
// 빈 화면 → 딜레이 후 팝인이었다(2026-08-17, 사용자 피드백: "왜 항상
// 늦게 나타나지, 빨리 뜨도록 하는거 안하고 있나요"). 홈의 다른 섹션들처럼
// app/page.tsx 빌드타임 프리페치 값을 받아 초기 렌더부터 채운다 — effect는
// 여전히 돌려 최신 데이터로 갱신(다른 initial* prop 패턴과 동일, 예:
// WebtoonPreviewSection.tsx).
// 5개를 한꺼번에 다 쌓아 보여주던 걸 화살표로 한 장씩 넘기는 방식으로
// 바꿨다(2026-08-17, 사용자 피드백: "다 보여주려고 하지 말고... 화살표
// 눌러 이동하게 해도 되니... 너무 길게 하지 말아주시죠" — 사이드바가
// sticky라 세로로 길어질수록 그만큼 부담이 됐다). SajuMiniRail의 데모
// 카드가 이미 쓰는 화살표+"n/총" 패턴과 통일.
export function HotLettersRail({ initialItems }: { initialItems?: TodayLetterCardLike[] }) {
  const [hotLetters, setHotLetters] = useState<TodayLetterCardLike[]>(initialItems ?? []);
  const [idx, setIdx] = useState(0);

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
  const safeIdx = Math.min(idx, hotLetters.length - 1);
  const l = hotLetters[safeIdx];

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

      <Link
        href={letterHref(l.letterId)}
        className="group flex items-start transition-opacity"
        style={{ gap: 12, padding: '4px 0 10px', textDecoration: 'none' }}
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
          {String(safeIdx + 1).padStart(2, '0')}
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

      {hotLetters.length > 1 && (
        <div className="flex items-center" style={{ gap: 4, borderTop: '1px solid #f3f4f6', paddingTop: 8 }}>
          <button
            type="button"
            aria-label="이전 글"
            onClick={() => setIdx((i) => (i - 1 + hotLetters.length) % hotLetters.length)}
            style={{ width: 20, height: 20, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'none', color: '#9ca3af', cursor: 'pointer' }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
          </button>
          <span style={{ fontSize: 10, color: '#9ca3af', fontVariantNumeric: 'tabular-nums' }}>{safeIdx + 1}/{hotLetters.length}</span>
          <button
            type="button"
            aria-label="다음 글"
            onClick={() => setIdx((i) => (i + 1) % hotLetters.length)}
            style={{ width: 20, height: 20, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'none', color: '#9ca3af', cursor: 'pointer' }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
          </button>
        </div>
      )}
    </section>
  );
}
