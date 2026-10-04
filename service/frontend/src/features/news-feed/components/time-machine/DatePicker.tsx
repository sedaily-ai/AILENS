'use client';

// 탑승구 — 날짜를 고르는 패널: 되감기 칩(N년 전 오늘·랜덤) + 직접 입력 + "이날 보기". 선택은 부모가 갖고 여기는 입력 상태만 갖는다.
import { useId, useState } from 'react';
import Link from 'next/link';
import { BIGKINDS_MIN_DATE } from '@/shared/constants/timeline';
import { digitsToValidDate, formatDateDigits, randomDateInRange, yearsAgoToday } from '@/shared/lib/timelineDates';
import type { TimelineEvent } from '@/shared/data/timelineEvents';
import { INK, LINE, MUTED, PANEL } from './tokens';

const REWIND_YEARS = [10, 20, 30];

export function DatePicker({
  pickedDate, hidden, events, activeEventKey, onPick, onPickEvent, onDepart,
}: {
  pickedDate: string;
  hidden: boolean;
  /** "역사 속 그날" 칩에 올릴 사건들. */
  events: TimelineEvent[];
  activeEventKey: string | null;
  onPickEvent: (event: TimelineEvent) => void;
  /** 칩으로 날짜를 골랐다(이동 전, 목록만 바뀐다). */
  onPick: (date: string) => void;
  /** "이날 보기" — 직접 입력한 날짜가 있으면 그 날짜로 이동한다. */
  onDepart: (typedDate: string | null) => void;
}) {
  const inputId = useId();
  const [digits, setDigits] = useState('');
  const typedDate = digitsToValidDate(digits);
  const typedInvalid = digits.length === 8 && typedDate === null;

  return (
    <div
      style={{
        display: hidden ? 'none' : undefined, background: PANEL, borderBottom: `1px solid ${LINE}`,
        padding: 'clamp(16px, 3vw, 20px) clamp(16px, 4vw, 24px)', textAlign: 'center',
      }}
    >
      <p style={{ fontSize: 16, fontWeight: 700, color: INK, letterSpacing: '-0.01em', lineHeight: 1.5, wordBreak: 'keep-all' }}>
        오늘이든, 내가 태어난 날이든 — 그날 세상은 이랬어요
      </p>

      {/* 칩은 스스로 "10년 전 오늘"이라 말하므로 줄 이름이 없다. "랜덤 날짜"는 선택 토글이 아니라 매번 다른 날짜를 뽑는 동작이라 aria-pressed가 없다. */}
      <div className="flex items-center justify-center" style={{ flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        {REWIND_YEARS.map((n) => {
          const date = yearsAgoToday(n);
          return (
            <button key={n} type="button" aria-pressed={pickedDate === date} onClick={() => { setDigits(''); onPick(date); }} className="ntm-chip ntm-focus">
              {n}년 전 오늘
            </button>
          );
        })}
        <button type="button" onClick={() => { setDigits(''); onPick(randomDateInRange()); }} className="ntm-chip ntm-focus">
          랜덤 날짜
        </button>
      </div>

      {events.length > 0 && (
        <div className="flex items-center justify-center" style={{ flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: MUTED, whiteSpace: 'nowrap' }}>역사 속 그날</span>
          {events.map((f) => (
            <button key={f.id} type="button" aria-pressed={activeEventKey === f.id} onClick={() => { setDigits(''); onPickEvent(f); }} className="ntm-chip ntm-focus">
              {f.date.slice(0, 4)} {f.shortTitle}
            </button>
          ))}
          <Link href="/timeline/chronicle" className="ntm-chip ntm-focus" style={{ textDecoration: 'none', background: '#dbeafe', color: '#1d4ed8' }}>
            전체 연대기 →
          </Link>
        </div>
      )}

      <div className="flex items-center justify-center" style={{ flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        <label htmlFor={inputId} style={{ fontSize: 13, fontWeight: 600, color: MUTED, whiteSpace: 'nowrap' }}>날짜 직접 입력</label>
        <span
          style={{
            display: 'inline-flex', alignItems: 'center', minHeight: 44, padding: '0 16px', background: '#fff',
            border: `1px solid ${typedInvalid ? '#b91c1c' : LINE}`, borderRadius: 999,
          }}
        >
          <input
            id={inputId}
            type="text"
            inputMode="numeric"
            value={formatDateDigits(digits)}
            onChange={(e) => setDigits(e.target.value.replace(/[^0-9]/g, '').slice(0, 8))}
            onKeyDown={(e) => { if (e.key === 'Enter' && typedDate) onDepart(typedDate); }}
            placeholder="1999 / 11 / 17"
            maxLength={14}
            aria-invalid={typedInvalid}
            aria-describedby={typedInvalid ? `${inputId}-err` : undefined}
            className="ntm-focus"
            style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 14, color: INK, fontFamily: 'inherit', width: 112, fontVariantNumeric: 'tabular-nums' }}
          />
        </span>
        <button type="button" onClick={() => onDepart(typedDate)} className="ntm-go ntm-focus">이날 보기 →</button>
      </div>

      {typedInvalid && (
        <p id={`${inputId}-err`} role="alert" style={{ marginTop: 8, fontSize: 13, fontWeight: 600, color: '#b91c1c' }}>
          {BIGKINDS_MIN_DATE.slice(0, 4)}년 1월 1일부터 오늘 사이의 날짜를 넣어주세요.
        </p>
      )}
    </div>
  );
}
