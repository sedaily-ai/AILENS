// 온보딩(features/onboarding) 선택값 로컬 저장. 비회원 상태(STEP 1~5)에서도 취향이 사라지지 않게 한다.
// 공용 useLocalStorage 훅이 없어 NewsletterEmailField, SmartSearchOverlay 등과 같은 관행(ad-hoc 처리)을 따른다.
// 저장된 관심분야를 features/news-feed(LensPreviewSection의 기본 탭)에서도 읽어야 하는데 feature 간 직접 import는 금지(CLAUDE.md)이므로 shared/lib에 둔다.
// React도 온보딩 도메인 로직도 없는 순수 localStorage 유틸이다.

const FORMAT_KEY = 'onboarding-format';
const COMPLETED_KEY = 'onboarding-completed';

function safeSet(key: string, value: string) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // 프라이빗 모드 등 저장 실패는 조용히 무시 — 온보딩 진행 자체를 막지 않는다.
  }
}

export function saveFormat(index: number) {
  safeSet(FORMAT_KEY, String(index));
}

export function markOnboardingCompleted() {
  safeSet(COMPLETED_KEY, '1');
}
