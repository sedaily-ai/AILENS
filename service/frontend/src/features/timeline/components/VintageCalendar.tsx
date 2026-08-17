'use client';

// 커스텀 달력 팝오버 — 네이티브 <input type="date">가 브라우저마다 다른
// 기본 캘린더 UI(각지고 사이트 톤과 안 맞는 테두리)를 그대로 띄워서
// "테두리 이상한거 안 되고, 톤앤매너 맞게 예술느낌 나게"라는 피드백으로
// 직접 만들었다(2026-08-17). 인터랙션은 ArchiveTab.tsx의 커스텀 달력과
// 같은 패턴(월 그리드, getMonthDays/isSameDay 재사용)인데, 그건 파란
// 액센트의 모달형이고 여긴 타임머신의 크림·세리프·골드 액센트 톤에 맞춘
// 앵커형 팝오버로 새로 그렸다.
import { useEffect, useRef } from 'react';
import { getMonthDays, isSameDay } from '@/shared/utils/dateUtils';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function toYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function VintageCalendar({
  value,
  min,
  max,
  viewMonth,
  onViewMonthChange,
  onSelect,
  onClose,
}: {
  value: string;
  min: string;
  max: string;
  viewMonth: Date;
  onViewMonthChange: (d: Date) => void;
  onSelect: (ymd: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  const days = getMonthDays(viewMonth.getFullYear(), viewMonth.getMonth());
  const today = new Date();

  return (
    <div
      ref={ref}
      style={{
        position: 'absolute',
        top: 'calc(100% + 10px)',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 50,
        width: 320,
        background: '#fffdf9',
        border: '1px solid #e6e0d4',
        borderRadius: 16,
        boxShadow: '0 16px 40px rgba(80,60,30,0.16), 0 2px 8px rgba(80,60,30,0.06)',
        padding: '18px 18px 14px',
      }}
    >
      <div className="flex items-center justify-between" style={{ marginBottom: 14 }}>
        <button
          type="button"
          aria-label="이전 달"
          onClick={() => onViewMonthChange(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#96876f', padding: 6, fontSize: 16 }}
        >
          ‹
        </button>
        <span style={{ fontFamily: '"Noto Serif KR", serif', fontSize: 15, fontWeight: 700, color: '#2a2622' }}>
          {viewMonth.getFullYear()}년 {viewMonth.getMonth() + 1}월
        </span>
        <button
          type="button"
          aria-label="다음 달"
          onClick={() => onViewMonthChange(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#96876f', padding: 6, fontSize: 16 }}
        >
          ›
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 4 }}>
        {WEEKDAYS.map((w) => (
          <div key={w} style={{ textAlign: 'center', fontSize: 11, color: '#b3aa99', padding: '4px 0' }}>
            {w}
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {days.map((day, i) => {
          if (!day) return <div key={i} />;
          const ymd = toYmd(day);
          const disabled = ymd < min || ymd > max;
          const selected = ymd === value;
          const isToday = isSameDay(day, today);
          return (
            <button
              key={i}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(ymd)}
              style={{
                aspectRatio: '1',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '50%',
                border: isToday && !selected ? '1px solid #c9bb98' : '1px solid transparent',
                background: selected ? '#2a2622' : 'transparent',
                color: disabled ? '#d9d3c4' : selected ? '#fff' : '#2a2622',
                fontSize: 13,
                fontWeight: selected ? 700 : 500,
                cursor: disabled ? 'default' : 'pointer',
                fontVariantNumeric: 'tabular-nums',
                transition: 'background .12s, color .12s',
              }}
              onMouseEnter={(e) => {
                if (!disabled && !selected) e.currentTarget.style.background = '#f3ede0';
              }}
              onMouseLeave={(e) => {
                if (!disabled && !selected) e.currentTarget.style.background = 'transparent';
              }}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>

      <div style={{ textAlign: 'center', marginTop: 12, paddingTop: 12, borderTop: '1px solid #f1e9d6' }}>
        <button
          type="button"
          onClick={() => {
            const t = toYmd(today);
            onViewMonthChange(new Date(today.getFullYear(), today.getMonth(), 1));
            if (t >= min && t <= max) onSelect(t);
          }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#8a6d3f' }}
        >
          오늘로
        </button>
      </div>
    </div>
  );
}
