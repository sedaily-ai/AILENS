import type { ViewMode } from '../data/birthdayTypes';
import { parseDate } from './birthdayModel';

export type BirthdaySelection = { date: string; mode: ViewMode };

// 마지막으로 본 생일을 이 탭의 sessionStorage에만 기억해 새로고침해도 결과 화면이 남게 한다(2026-10-20 요청).
// URL·서버·localStorage에는 쓰지 않으므로 탭을 닫으면 지워지고 다른 탭과 공유 링크로 새지 않는다.
// 공유 링크는 별도로 출생연도만 복원한다(birthdayModel.sharedYear).
const STORAGE_KEY = 'lens-birthday-selection';
const MODES: readonly ViewMode[] = ['personal', 'year'];

/** 저장된 값을 검증해 되살린다. 형식이 다르거나 날짜가 범위를 벗어나면 null(연도만 공유한 결과는 해시로 복원하므로 저장하지 않는다). */
export function parseStoredSelection(raw: string | null): BirthdaySelection | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return null;
    const { date, mode } = value as Record<string, unknown>;
    if (typeof date !== 'string' || !parseDate(date)) return null;
    if (typeof mode !== 'string' || !MODES.includes(mode as ViewMode) || mode === 'year') return null;
    return { date, mode: mode as ViewMode };
  } catch {
    return null;
  }
}

function readStored() {
  try { return parseStoredSelection(window.sessionStorage.getItem(STORAGE_KEY)); } catch { return null; }
}

// undefined = 아직 저장소를 읽지 않음. 한 번 읽은 뒤에는 같은 객체를 돌려줘 useSyncExternalStore가 반복 렌더하지 않게 한다.
let selection: BirthdaySelection | null | undefined;
const listeners = new Set<() => void>();
export function getBirthdaySelection() {
  if (selection === undefined) selection = readStored();
  return selection;
}
export const getServerBirthdaySelection = () => null;
export function subscribeBirthdaySelection(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function rememberBirthdaySelection(next: BirthdaySelection) {
  if (typeof window === 'undefined') return;
  selection = next;
  try {
    if (next.mode === 'year') window.sessionStorage.removeItem(STORAGE_KEY);
    else window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch { /* 저장소를 쓸 수 없는 환경(사생활 보호 모드 등)이면 이번 이동 동안만 기억한다. */ }
  listeners.forEach(listener => listener());
}
