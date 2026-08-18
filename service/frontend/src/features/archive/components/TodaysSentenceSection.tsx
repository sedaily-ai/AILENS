'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { fetchTodayLetters, toTodayLetterCard, type TodayLetterCardLike } from '@/shared/lib/api/todayLettersApi';
import { letterHref } from '@/shared/lib/letterHref';

// ── 오늘의 한 문장 ────────────────────────────────────────────────
// "볼거리"가 실사용자 archive 축적에 의존하지 않도록 하는 항상-채워지는
// 층(2026-08-06). 오늘 발행된 실제 레터의 closing_line(없으면 요약 문장)을
// 그날짜 기준 결정적으로 하나 골라 보여준다 — 단어 퀴즈처럼 매일 자동으로
// 바뀌는 습관형 콘텐츠지만, 여긴 조작 없이 그냥 보여주기만 한다.
// ArchiveTab.tsx(893줄)가 너무 길어서 다른 독립 서브컴포넌트들과 함께
// 분리했다(2026-08-18).
export function TodaysSentenceSection() {
  const [loading, setLoading] = useState(true);
  const [letter, setLetter] = useState<TodayLetterCardLike | null>(null);
  const [sentence, setSentence] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchTodayLetters()
      .then((res) => {
        if (cancelled) return;
        const candidates = res.letters.filter(
          (l) => l.closing_line?.trim() || l.subtitle?.trim(),
        );
        if (candidates.length === 0) return;
        const picked = candidates[new Date().getDate() % candidates.length];
        const card = toTodayLetterCard(picked, res.date);
        setSentence(picked.closing_line?.trim() || card.excerpt);
        setLetter(card);
      })
      .catch(() => {
        // 오늘 레터를 못 불러와도 이 섹션만 조용히 숨는다 — 서랍 나머지는
        // 정상 동작해야 하므로 여기서 에러를 전파하지 않는다.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 오늘 발행분이 없으면(휴일 등) 조용히 숨긴다 — 가짜로 채우지 않는다.
  if (!loading && !letter) return null;

  return (
    <div className="mb-10">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0">
          <svg className="w-[18px] h-[18px] text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
          </svg>
        </div>
        <div>
          <p className="text-[14px] font-bold text-gray-900">오늘의 한 문장</p>
          <p className="text-[11px] text-gray-400">오늘 발행된 레터에서 골라봤어요</p>
        </div>
      </div>

      {loading || !letter ? (
        <div className="bg-gray-100 rounded-2xl h-[96px]" />
      ) : (
        <Link
          href={letterHref(letter.letterId)}
          className="block p-5 rounded-2xl transition-shadow hover:shadow-[0_2px_12px_rgba(0,0,0,0.06)]"
          style={{ background: letter.accentBg }}
        >
          <p className="text-[15px] font-medium leading-relaxed mb-3 text-gray-800">&quot;{sentence}&quot;</p>
          <div className="flex items-center gap-2">
            <Image src={letter.editorAvatar} alt={letter.editorName} width={20} height={20} className="rounded-full object-cover" />
            <span className="text-[12px] font-semibold" style={{ color: letter.accent }}>{letter.editorName}</span>
            <span className="text-[11px] text-gray-400 truncate">· {letter.title}</span>
          </div>
        </Link>
      )}
    </div>
  );
}
