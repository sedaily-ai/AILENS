'use client';

/**
 * PageHeader — 점신 결 페이지 헤더 (phase-04)
 *
 * 구조:
 *   [상단 미니바]  좌: 占 + source / 우: M.D weekday
 *   [타이틀 행]    좌: 명조 헤딩 (마지막 글자 워밍 강조) + 부카피
 *                  우: 검색 버튼 + InlineLangToggle
 *
 * title="내 사주" + titleAccent="주" 일 때 → "내 사" + "주"(워밍)
 */

import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { useLang } from '@saju/shared/lib/LangContext';
import { SAJU, SERIF } from './sajuTokens';

interface PageHeaderProps {
  /** 큰 헤딩 (명조) — 예: "내 사주" */
  title: string;
  /** 헤딩 마지막 N글자만 워밍 컬러로 강조. 예: titleAccent="주" → "내 사" + "주" */
  titleAccent?: string;
  /** 헤딩 아래 부카피 */
  sub?: string;
  /** 좌상단 출처 라벨 (한자 마크 占 옆) — 기본 "KASI 만세력 · 궁통보감 · 자평진전" */
  sourceLabel?: string;
  /** 영문 출처 라벨 (lang=en일 때) */
  sourceLabelEn?: string;
  /** 검색 버튼 표시 (default true) */
  showSearch?: boolean;
  /** 검색 클릭 핸들러 (없으면 noop) */
  onSearch?: () => void;
}

export function PageHeader({
  title,
  titleAccent,
  sub,
  sourceLabel = 'KASI 만세력 · 궁통보감 · 자평진전',
  sourceLabelEn = 'KASI · classical texts',
  showSearch = true,
  onSearch,
}: PageHeaderProps) {
  const { t, lang } = useLang();
  const [today, setToday] = useState<{ m: number; d: number; weekday: string } | null>(null);

  useEffect(() => {
    const now = new Date();
    const days = lang === 'en'
      ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
      : ['일', '월', '화', '수', '목', '금', '토'];
    setToday({
      m: now.getMonth() + 1,
      d: now.getDate(),
      weekday: days[now.getDay()],
    });
  }, [lang]);

  // titleAccent 매칭 — 헤딩 마지막 N글자만 워밍
  const accentLen = titleAccent ? titleAccent.length : 0;
  const titleMain = accentLen > 0 && title.endsWith(titleAccent ?? '')
    ? title.slice(0, title.length - accentLen)
    : title;
  const titleHl = accentLen > 0 ? titleAccent ?? '' : '';

  return (
    <>
      {/* 상단 미니바 */}
      <div
        className="relative z-10 flex items-center justify-between px-5 pt-5 pb-1.5 text-[11.5px]"
        style={{ color: SAJU.inkMute }}
      >
        <div className="flex items-center gap-1.5 truncate">
          <span style={{ fontFamily: SERIF, fontWeight: 600, color: SAJU.ink, opacity: 0.55 }}>占</span>
          <span className="truncate">{t(sourceLabel, sourceLabelEn)}</span>
        </div>
        {today && (
          <span
            className="shrink-0 tabular-nums tracking-tight"
            style={{ color: SAJU.inkSoft, fontWeight: 600 }}
          >
            {today.m}.{today.d}
            <span style={{ color: '#C9C2B5', margin: '0 4px' }}>·</span>
            {today.weekday}
          </span>
        )}
      </div>

      {/* 타이틀 행 */}
      <header className="relative z-10 px-5 pt-3 pb-5 flex items-end justify-between">
        <div className="min-w-0">
          <h1
            className="leading-none"
            style={{
              fontFamily: SERIF,
              fontWeight: 900,
              fontSize: 36,
              color: SAJU.ink,
              letterSpacing: '-0.01em',
            }}
          >
            {titleMain}
            {titleHl && <span style={{ color: SAJU.warmDeep }}>{titleHl}</span>}
          </h1>
          {sub && (
            <p
              className="text-[12.5px] mt-2.5"
              style={{ color: SAJU.inkMute, letterSpacing: '-0.005em' }}
            >
              {sub}
            </p>
          )}
        </div>
        {showSearch && (
          <button
            type="button"
            onClick={onSearch}
            aria-label={t('검색', 'Search')}
            className="w-10 h-10 rounded-full flex items-center justify-center transition-all hover:bg-black/5 active:scale-95 shrink-0"
            style={{ color: SAJU.ink }}
          >
            <Search size={19} strokeWidth={2.2} />
          </button>
        )}
      </header>
    </>
  );
}
