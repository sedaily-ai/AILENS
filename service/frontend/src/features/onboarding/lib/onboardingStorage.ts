// 온보딩 선택값 로컬 저장 — 비회원 상태(STEP 1~5)에서도 취향이 사라지지
// 않게 한다. 공용 useLocalStorage 훅이 이 레포에 없어서(NewsletterEmailField,
// SmartSearchOverlay 등도 각자 ad-hoc하게 처리) 같은 관행을 따른다.

const FORMAT_KEY = 'onboarding-format';
const INTERESTS_KEY = 'onboarding-interests';
const COMPLETED_KEY = 'onboarding-completed';
const BANNER_DISMISSED_KEY = 'onboarding-banner-dismissed';

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

// 메인 피드 상단 배너(DiscoveryBanner) 전용 — 온보딩을 "완료"하지 않고
// 그냥 닫기만 해도 다음 방문부터 안 뜨게 한다. completed와 분리한 이유:
// 안 눌러도 다시 안 나오게 하고 싶은 사람과, 나중에 다시 보고 싶어서
// 그냥 무시만 한 사람을 같은 취급하면 전자가 짜증나므로 배너 전용 플래그.
export function dismissDiscoveryBanner() {
  safeSet(BANNER_DISMISSED_KEY, '1');
}

export function isDiscoveryBannerDismissed(): boolean {
  return safeGet(BANNER_DISMISSED_KEY) === '1';
}
