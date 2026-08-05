'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { letterHref } from '@/shared/lib/letterHref';
import {
  MOCK_ECONOMIC_EVENTS,
  getCategoryMeta,
  type EconomicEvent,
  type EventCategory,
} from '../data/mockEconomicEvents';

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];

const CATEGORY_FILTERS: { id: 'all' | EventCategory; label: string; color: string }[] = [
  { id: 'all',       label: '전체',     color: '#111827' },
  { id: 'fed',       label: '연준',     color: '#7c3aed' },
  { id: 'macro',     label: '거시지표', color: '#0891b2' },
  { id: 'earnings',  label: '실적',     color: '#059669' },
  { id: 'index',     label: '지수',     color: '#d97706' },
  { id: 'policy',    label: '정책',     color: '#dc2626' },
  { id: 'corporate', label: '공시',     color: '#6366f1' },
];

function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function CalendarMonthView() {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [categoryFilter, setCategoryFilter] = useState<'all' | EventCategory>('all');

  const filteredEvents = useMemo(() => {
    const monthStr = String(viewMonth + 1).padStart(2, '0');
    const monthPrefix = `${viewYear}-${monthStr}`;
    return MOCK_ECONOMIC_EVENTS.filter(e => {
      const inMonth = e.date.startsWith(monthPrefix);
      const inCategory = categoryFilter === 'all' ? true : e.category === categoryFilter;
      return inMonth && inCategory;
    }).sort((a, b) => a.date.localeCompare(b.date));
  }, [viewYear, viewMonth, categoryFilter]);

  const eventsByDate = useMemo(() => {
    const map: Record<string, EconomicEvent[]> = {};
    filteredEvents.forEach(e => {
      if (!map[e.date]) map[e.date] = [];
      map[e.date].push(e);
    });
    return map;
  }, [filteredEvents]);

  const goPrev = () => {
    if (viewMonth === 0) {
      setViewYear(y => y - 1);
      setViewMonth(11);
    } else {
      setViewMonth(m => m - 1);
    }
  };
  const goNext = () => {
    if (viewMonth === 11) {
      setViewYear(y => y + 1);
      setViewMonth(0);
    } else {
      setViewMonth(m => m + 1);
    }
  };
  const goToday = () => {
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
  };

  const isCurrentMonth = viewYear === today.getFullYear() && viewMonth === today.getMonth();

  return (
    <section style={{ maxWidth: 760, margin: '0 auto', padding: 'clamp(28px, 5vw, 56px) clamp(20px, 5vw, 32px)' }}>
      {/* 헤더 */}
      <header style={{ marginBottom: 28 }}>
        <p style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#9ca3af', fontWeight: 600, marginBottom: 4 }}>
          Economic Calendar
        </p>
        <h1
          style={{
            fontFamily: '"Noto Serif KR", serif',
            fontSize: 'clamp(24px, 5.4vw, 32px)',
            fontWeight: 600,
            letterSpacing: '-0.025em',
            color: '#111827',
            lineHeight: 1.35,
          }}
        >
          시장을 흔들 일정
        </h1>
        <p className="text-gray-500 mt-2" style={{ fontSize: 13.5, lineHeight: 1.6 }}>
          월별로 챙겨야 할 일정과 관련 글을 같이 모아봤어요.
        </p>
      </header>

      {/* 월 네비 */}
      <div className="flex items-center justify-between mb-5">
        <button
          type="button"
          onClick={goPrev}
          className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          aria-label="이전 달"
        >
          <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex items-center gap-3">
          <h2
            style={{
              fontFamily: '"Noto Serif KR", serif',
              fontSize: 'clamp(18px, 4.2vw, 21px)',
              fontWeight: 600,
              color: '#111827',
              letterSpacing: '-0.02em',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {viewYear}년 {viewMonth + 1}월
          </h2>
          {!isCurrentMonth && (
            <button
              type="button"
              onClick={goToday}
              className="text-xs text-gray-400 hover:text-gray-900 transition-colors"
              style={{ padding: '4px 10px', borderRadius: 999, background: '#f4f4f3', fontWeight: 500 }}
            >
              오늘로
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={goNext}
          className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          aria-label="다음 달"
        >
          <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* 카테고리 필터 chips */}
      <div className="mb-7" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {CATEGORY_FILTERS.map(f => {
          const active = categoryFilter === f.id;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setCategoryFilter(f.id)}
              className="transition-all duration-200"
              style={{
                padding: '5px 12px',
                borderRadius: 999,
                fontSize: 12,
                fontWeight: active ? 600 : 500,
                background: active ? f.color : 'transparent',
                color: active ? '#fff' : '#6b7280',
                border: active ? 'none' : '1px solid #e5e7eb',
                cursor: 'pointer',
                letterSpacing: '-0.005em',
                boxShadow: active ? `0 3px 10px ${f.color}26` : 'none',
              }}
              aria-pressed={active}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {/* 일정 리스트 */}
      {filteredEvents.length === 0 ? (
        <p className="text-gray-400" style={{ padding: '40px 0', textAlign: 'center', fontSize: 14, lineHeight: 1.7 }}>
          이 달·카테고리에는 챙길 일정이 없어요.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          {Object.keys(eventsByDate).sort().map(date => {
            const items = eventsByDate[date];
            const [, m, d] = date.split('-');
            const dt = new Date(date + 'T00:00:00');
            const isToday = date === toISO(today);

            return (
              <section key={date}>
                <header
                  className="flex items-baseline gap-3 mb-3"
                  style={{
                    paddingBottom: 10,
                    borderBottom: isToday ? '2px solid #111827' : '1px solid #f3f4f6',
                  }}
                >
                  <span
                    style={{
                      fontFamily: '"Noto Serif KR", serif',
                      fontSize: 'clamp(18px, 4.2vw, 21px)',
                      fontWeight: 600,
                      color: isToday ? '#111827' : '#374151',
                      letterSpacing: '-0.02em',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {parseInt(m, 10)}.{parseInt(d, 10)}
                  </span>
                  <span className="text-gray-500 text-sm">
                    {WEEKDAY[dt.getDay()]}요일
                  </span>
                  {isToday && (
                    <span
                      className="inline-flex items-center"
                      style={{
                        padding: '2px 8px',
                        background: '#111827',
                        color: '#fff',
                        fontSize: 10,
                        fontWeight: 600,
                        borderRadius: 999,
                        letterSpacing: '0.04em',
                      }}
                    >
                      오늘
                    </span>
                  )}
                  <span className="text-gray-400 text-xs ml-auto">{items.length}건</span>
                </header>

                <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {items.map(evt => {
                    const meta = getCategoryMeta(evt.category);
                    const inner = (
                      <article
                        className="group flex items-start gap-3 transition-colors"
                        style={{
                          padding: '14px 18px',
                          background: '#fdfcfb',
                          borderRadius: 14,
                          cursor: evt.relatedLetterId ? 'pointer' : 'default',
                        }}
                      >
                        <div className="flex-shrink-0" style={{ width: 70 }}>
                          <span style={{ fontSize: 12, color: '#6b7280', fontVariantNumeric: 'tabular-nums' }}>
                            {evt.time ?? '종일'}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center mb-1.5" style={{ gap: 6, flexWrap: 'wrap' }}>
                            <span
                              style={{
                                padding: '2px 8px',
                                background: meta.soft,
                                color: meta.accent,
                                fontSize: 10.5,
                                fontWeight: 600,
                                borderRadius: 999,
                              }}
                            >
                              {meta.label}
                            </span>
                          </div>
                          <p
                            className="font-medium text-gray-900 group-hover:opacity-70 transition-opacity"
                            style={{
                              fontFamily: '"Noto Serif KR", serif',
                              fontSize: 'clamp(14.5px, 3.6vw, 16px)',
                              letterSpacing: '-0.015em',
                              lineHeight: 1.5,
                              marginBottom: 3,
                            }}
                          >
                            {evt.title}
                          </p>
                          <p className="text-gray-500" style={{ fontSize: 13, lineHeight: 1.6 }}>
                            {evt.brief}
                          </p>
                          {evt.relatedLetterId && (
                            <p style={{ fontSize: 11.5, color: meta.accent, fontWeight: 500, marginTop: 8 }}>
                              관련 글 읽기 →
                            </p>
                          )}
                        </div>
                      </article>
                    );
                    return (
                      <li key={evt.id}>
                        {evt.relatedLetterId ? (
                          <Link href={letterHref(evt.relatedLetterId)} style={{ textDecoration: 'none' }}>
                            {inner}
                          </Link>
                        ) : (
                          inner
                        )}
                      </li>
                    );
                  })}
                </ol>
              </section>
            );
          })}
        </div>
      )}
    </section>
  );
}
