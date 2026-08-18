import type { ArchivedSentence } from '@/shared/types/mbti';
import { getWeekDays, isSameDay } from '@/shared/utils/dateUtils';

// ── 날짜 네비 ── 문장이 있을 때만 보이는 상단 sticky 주간 스트립.
// ArchiveTab.tsx(893줄)가 너무 길어서 다른 독립 서브컴포넌트들과 함께
// 분리했다(2026-08-18) — 이 UI 블록은 archiveDate/archivedSentences 외엔
// 아무것도 필요 없는 완전히 독립적인 조각이었다.
export function ArchiveDateNav({
  archiveDate,
  setArchiveDate,
  archivedSentences,
  onOpenCalendar,
}: {
  archiveDate: Date;
  setArchiveDate: (date: Date) => void;
  archivedSentences: ArchivedSentence[];
  onOpenCalendar: () => void;
}) {
  return (
    <div className="sticky top-0 z-30 bg-white/98 backdrop-blur-md shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-center gap-4 py-3 px-4">
        <button
          onClick={() => {
            const d = new Date(archiveDate);
            d.setDate(d.getDate() - 7);
            setArchiveDate(d);
          }}
          className="p-2 hover:bg-gray-50 rounded-full transition-colors"
        >
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <button
          onClick={onOpenCalendar}
          className="flex items-center gap-1.5 text-[15px] font-semibold text-gray-900 hover:text-gray-600 transition-colors"
        >
          {archiveDate.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' })}
          <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        <button
          onClick={() => {
            const d = new Date(archiveDate);
            d.setDate(d.getDate() + 7);
            if (d <= new Date()) setArchiveDate(d);
          }}
          className="p-2 hover:bg-gray-50 rounded-full transition-colors"
        >
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      <div className="flex justify-center gap-1 px-4 pb-3">
        {getWeekDays(archiveDate).map((day) => {
          const isSelected = isSameDay(day, archiveDate);
          const isToday = isSameDay(day, new Date());
          const isFuture = day > new Date();
          const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
          const count = archivedSentences.filter(s => isSameDay(new Date(s.createdAt), day)).length;

          return (
            <button
              key={day.toISOString()}
              onClick={() => !isFuture && setArchiveDate(day)}
              disabled={isFuture}
              className={`relative flex flex-col items-center px-3 py-2 rounded-xl transition-all duration-200 min-w-[48px] ${
                isSelected
                  ? "bg-blue-500 text-white shadow-sm"
                  : isToday
                    ? "bg-gray-100 text-gray-900 font-semibold"
                    : isFuture
                      ? "text-gray-300 cursor-not-allowed"
                      : "text-gray-500 hover:bg-gray-50"
              }`}
            >
              <span className="text-[11px] mb-1">{dayNames[day.getDay()]}</span>
              <span className="text-[16px] font-medium">{day.getDate()}</span>
              {count > 0 && !isSelected && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-amber-400 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
