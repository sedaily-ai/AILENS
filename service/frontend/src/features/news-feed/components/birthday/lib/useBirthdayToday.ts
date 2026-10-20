import { useSyncExternalStore } from 'react';
import { kstTodayStr } from '@/shared/lib/date/date';
import { AS_OF } from '../data/birthdayCatalog';

// 정적 HTML과 hydration의 첫 화면은 같은 날짜를 사용하고 이후 브라우저의 KST 오늘로 갱신한다.
const serverToday = () => AS_OF;
function subscribeToday(onChange: () => void) {
  const timer = window.setInterval(onChange, 30_000);
  window.addEventListener('focus', onChange);
  document.addEventListener('visibilitychange', onChange);
  return () => {
    window.clearInterval(timer);
    window.removeEventListener('focus', onChange);
    document.removeEventListener('visibilitychange', onChange);
  };
}

export function useBirthdayToday() {
  return useSyncExternalStore(subscribeToday, kstTodayStr, serverToday);
}
