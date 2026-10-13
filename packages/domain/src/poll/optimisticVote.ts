// 투표를 바꿀 때 서버 응답 전에 화면을 먼저 옮기기 위한 낙관적 계산. 서버 응답이 오면 그 값으로 덮어쓴다.
export interface VoteLike {
  my_choice: string | null;
  counts: Record<string, number> | null;
}

/** 이미 투표한 상태에서 key 로 바꾼 모습(집계에서 이전 보기 -1, 새 보기 +1). 집계를 모르는 상태(첫 투표)는 그대로 돌려준다. */
export function applyChoice<T extends VoteLike>(state: T, key: string): T {
  if (!state.counts || !state.my_choice || state.my_choice === key) return state;
  const counts = { ...state.counts };
  counts[state.my_choice] = Math.max(0, (counts[state.my_choice] ?? 0) - 1);
  counts[key] = (counts[key] ?? 0) + 1;
  return { ...state, my_choice: key, counts };
}
