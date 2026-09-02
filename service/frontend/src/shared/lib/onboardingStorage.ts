// 온보딩(features/onboarding) 선택값 로컬 저장 — 비회원 상태(STEP 1~5)에서도
// 취향이 사라지지 않게 한다. 공용 useLocalStorage 훅이 이 레포에 없어서
// (NewsletterEmailField, SmartSearchOverlay 등도 각자 ad-hoc하게 처리) 같은
// 관행을 따른다.
//
// shared/lib에 있는 이유(2026-09) — 원래 features/onboarding/lib에 있었는데,
// 저장된 관심분야를 features/news-feed(LensPreviewSection의 기본 탭)에서도
// 읽어야 해서 feature 간 직접 import가 필요해졌다(금지 — CLAUDE.md). 이
// 파일은 React도, 온보딩 도메인 로직도 없는 순수 localStorage 유틸이라
// shared로 내리는 데 걸리는 게 없었다.

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
