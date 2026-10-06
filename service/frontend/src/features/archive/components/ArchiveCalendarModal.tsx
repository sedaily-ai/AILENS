import type { ArchivedSentence } from '@/shared/types/mbti';
import { getMonthDays, isSameDay } from '@/shared/utils/dateUtils';

// ── 캘린더 팝업 ── 월 달력으로 특정 날짜로 바로 이동한다. archiveDate/archivedSentences/calendarMonth 외에는 의존하지 않는 독립 컴포넌트이다.
export function ArchiveCalendarModal({
  open,
  onClose,
  archiveDate,
  setArchiveDate,
  archivedSentences,
  calendarMonth,
  setCalendarMonth,
}: {
  open: boolean;
  onClose: () => void;
  archiveDate: Date;
  setArchiveDate: (date: Date) => void;
  archivedSentences: ArchivedSentence[];
  calendarMonth: Date;
  setCalendarMonth: (date: Date) => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-[340px]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1))}
            className="p-2 hover:bg-gray-100 rounded-full"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="text-[18px] font-bold">
            {calendarMonth.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' })}
          </span>
          <button
            onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1))}
            className="p-2 hover:bg-gray-100 rounded-full"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 mb-2">
          {['월', '화', '수', '목', '금', '토', '일'].map((d) => (
            <div key={d} className="text-center text-[12px] text-gray-400 py-2">{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {getMonthDays(calendarMonth.getFullYear(), calendarMonth.getMonth()).map((day, idx) => {
            if (!day) return <div key={idx} />;
            const isSelected = archiveDate && isSameDay(day, archiveDate);
            const isToday = isSameDay(day, new Date());
            const isFuture = day > new Date();
            const hasSentences = archivedSentences.some(s => isSameDay(new Date(s.createdAt), day));

            return (
              <button
                key={idx}
                onClick={() => {
                  if (!isFuture) {
                    setArchiveDate(day);
                    onClose();
                  }
                }}
                disabled={isFuture}
                className={`aspect-square flex flex-col items-center justify-center rounded-full text-[14px] transition-all relative ${
                  isSelected
                    ? "bg-blue-500 text-white font-bold"
                    : isToday
                      ? "bg-gray-200 text-gray-900 font-semibold"
                      : isFuture
                        ? "text-gray-300 cursor-not-allowed"
                        : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                {day.getDate()}
                {hasSentences && !isSelected && (
                  <span className="absolute bottom-1 w-1 h-1 bg-amber-400 rounded-full" />
                )}
              </button>
            );
          })}
        </div>

        <button
          onClick={() => {
            setArchiveDate(new Date());
            onClose();
          }}
          className="w-full mt-4 py-3 bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-600 transition-colors"
        >
          오늘로 이동
        </button>
      </div>
    </div>
  );
}
