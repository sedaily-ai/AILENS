'use client';

import { Check, X } from 'lucide-react';
import { SAJU } from '@saju/shared/ui/sajuTokens';
import { getWeekStatus } from '../lib/points';

export function WeeklyCheckIn() {
  const week = getWeekStatus();

  return (
    <div className="grid grid-cols-7 gap-1.5">
      {week.map(day => {
        const state: 'claimed' | 'missed' | 'upcoming' = day.claimed
          ? 'claimed'
          : day.isFuture || day.isToday
            ? 'upcoming'
            : 'missed';

        const circleStyle =
          state === 'claimed'
            ? { background: SAJU.warmDeep, color: '#fff' }
            : state === 'missed'
              ? { background: '#E5E7EB', color: '#9CA3AF' }
              : { background: '#fff', color: '#D1D5DB', boxShadow: `inset 0 0 0 1.5px ${SAJU.line}` };

        return (
          <div key={day.label} className="flex flex-col items-center gap-1.5">
            <span
              className="text-[11.5px] font-bold"
              style={{ color: day.isToday ? SAJU.warmDeep : SAJU.inkSub }}
            >
              {day.label}
            </span>
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center"
              style={circleStyle}
            >
              {state === 'claimed' && <Check size={16} strokeWidth={3} />}
              {state === 'missed' && <X size={14} strokeWidth={3} />}
            </div>
            <span
              className="text-[10.5px] font-bold"
              style={{ color: state === 'claimed' ? SAJU.warmDeep : SAJU.inkSub }}
            >
              +{day.amount}
            </span>
          </div>
        );
      })}
    </div>
  );
}
