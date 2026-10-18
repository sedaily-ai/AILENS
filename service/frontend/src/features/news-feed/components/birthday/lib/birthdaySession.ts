import type { Sex, ViewMode } from '../data/birthdayTypes';

export type BirthdaySelection = { date: string; sex: Sex; mode: ViewMode };

// 홈 → 결과 페이지의 클라이언트 이동 동안만 유지한다. URL·서버·브라우저 저장소에는 쓰지 않는다.
// 새로고침/새 탭에서는 생일을 다시 선택하며, 공유 링크는 별도로 연도만 복원한다.
let selection: BirthdaySelection | null = null;
const listeners = new Set<() => void>();

export const getBirthdaySelection = () => selection;
export const getServerBirthdaySelection = () => null;
export function subscribeBirthdaySelection(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function rememberBirthdaySelection(next: BirthdaySelection) {
  if (typeof window === 'undefined') return;
  selection = next;
  listeners.forEach(listener => listener());
}
