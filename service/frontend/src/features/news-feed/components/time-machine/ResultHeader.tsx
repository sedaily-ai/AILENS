// 결과 머리 — 지금 보고 있는 날짜를 항상 박는다. "N년 전" 배지로 얼마나 멀리 왔는지, 과거에서는 "오늘로 돌아가기"를 둔다.
import { formatDateLabel } from '@/shared/lib/timelineDates';
import { BLUE, BLUE_TINT, INK, LINE, MUTED } from './tokens';

export function ResultHeader({
  date, source, yearsBack, isToday, onBackToToday,
}: {
  date: string;
  source: string;
  yearsBack: number;
  isToday: boolean;
  onBackToToday: () => void;
}) {
  return (
    <div className="flex items-center" style={{ flexWrap: 'wrap', gap: '4px 8px', paddingBottom: 12, marginBottom: 4, borderBottom: `1px solid ${LINE}` }}>
      <span style={{ fontSize: 16, fontWeight: 700, color: INK, fontVariantNumeric: 'tabular-nums' }}>
        {isToday && <span style={{ color: BLUE, marginRight: 6 }}>오늘</span>}
        {formatDateLabel(date)}
      </span>
      {yearsBack >= 1 && (
        <span style={{ fontSize: 13, fontWeight: 700, color: BLUE, background: BLUE_TINT, borderRadius: 999, padding: '4px 8px', lineHeight: 1.2 }}>
          {yearsBack}년 전
        </span>
      )}
      <span style={{ fontSize: 13, color: MUTED }}>{source}</span>
      {!isToday && (
        <button type="button" onClick={onBackToToday} className="ntm-sub ntm-focus" style={{ marginLeft: 'auto' }}>
          오늘로 돌아가기
        </button>
      )}
    </div>
  );
}
