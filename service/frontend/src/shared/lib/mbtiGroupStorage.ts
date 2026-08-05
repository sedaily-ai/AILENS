import type { MbtiGroupId } from '@/shared/data/mbtiGroups';

const STORAGE_KEY = 'mbti-group';
const VALID_GROUPS: MbtiGroupId[] = ['NT', 'NF', 'ST', 'SF'];

export function getSavedMbtiGroup(): MbtiGroupId | null {
  if (typeof window === 'undefined') return null;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved && (VALID_GROUPS as string[]).includes(saved) ? (saved as MbtiGroupId) : null;
  } catch {
    return null;
  }
}

export function saveMbtiGroup(group: MbtiGroupId): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, group);
  } catch {
    // localStorage 접근 실패는 무시 — 그룹 선택은 best-effort
  }
}
