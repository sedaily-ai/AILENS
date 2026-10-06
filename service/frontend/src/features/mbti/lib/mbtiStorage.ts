import type { MbtiGroupId } from '@/shared/data/mbtiGroups';
import { parseSavedMbti, type MbtiType, type SavedMbti } from './mbtiCorner';

// 코너 전용 키 — 옛 홈 질문 탭(features/question)이 쓰던 `mbti-group`과 겹치지 않게 한다.
const KEY = 'mbti-corner-type';

/** 저장소를 못 쓰는 환경(사생활 보호 모드 등)에서는 null — 화면은 그대로 동작한다. */
export function readSavedMbti(): SavedMbti | null {
  try {
    return parseSavedMbti(window.localStorage.getItem(KEY));
  } catch {
    return null;
  }
}

export function saveMbti(value: MbtiType | MbtiGroupId): void {
  try {
    window.localStorage.setItem(KEY, value);
  } catch {
    /* 저장 못 해도 이번 방문은 계속 볼 수 있다 */
  }
}
