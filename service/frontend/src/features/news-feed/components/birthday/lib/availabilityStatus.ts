import { isPaperlessSunday } from './birthdayNewspaper';

export type DayStatus = { photo?: string; bigkinds_front?: string; bigkinds_day?: string; naver_front?: string };

/** 저장된 상태가 선택일의 기사임이 분명한 경우에만 먼저 보여준다. */
export function cachedArticleStatus(date: string, hasNotice: boolean, day?: DayStatus): 'front' | 'day' | 'loading' {
  if (hasNotice || isPaperlessSunday(date)) return 'loading';
  if (day?.bigkinds_front === 'available' || day?.naver_front === 'available') return 'front';
  return day?.bigkinds_day === 'available' ? 'day' : 'loading';
}
