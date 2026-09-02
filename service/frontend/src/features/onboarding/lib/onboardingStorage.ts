// 온보딩 선택값 로컬 저장 — 비회원 상태(STEP 1~5)에서도 취향이 사라지지
// 않게 한다. 공용 useLocalStorage 훅이 이 레포에 없어서(NewsletterEmailField,
// SmartSearchOverlay 등도 각자 ad-hoc하게 처리) 같은 관행을 따른다.

const FORMAT_KEY = 'onboarding-format';
const INTERESTS_KEY = 'onboarding-interests';
const COMPLETED_KEY = 'onboarding-completed';

function safeGet(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // 프라이빗 모드 등 저장 실패는 조용히 무시 — 온보딩 진행 자체를 막지 않는다.
  }
}

export function getSavedFormat(): number | null {
  const raw = safeGet(FORMAT_KEY);
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= 3 ? n : null;
}

export function saveFormat(index: number) {
  safeSet(FORMAT_KEY, String(index));
}

export function getSavedInterests(): string[] {
  const raw = safeGet(INTERESTS_KEY);
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function saveInterests(interests: string[]) {
  safeSet(INTERESTS_KEY, JSON.stringify(interests));
}

export function markOnboardingCompleted() {
  safeSet(COMPLETED_KEY, '1');
}

export function isOnboardingCompleted(): boolean {
  return safeGet(COMPLETED_KEY) === '1';
}
