// 로그인 뒤에 돌아갈 화면을 기억한다. 구글 로그인은 사이트를 한 번 벗어났다 돌아오므로 주소 파라미터 대신 sessionStorage 에 둔다(탭을 닫으면 사라진다).
const KEY = 'lens-login-return';

/** 같은 사이트 안의 경로만 허용한다(//, 백슬래시, 로그인·콜백 화면 제외) — 열린 리다이렉트를 막는다. */
function isSafePath(path: string): boolean {
  return path.startsWith('/') && !path.startsWith('//') && !path.includes('\\') && !path.startsWith('/login') && !path.startsWith('/auth');
}

export function rememberReturnTo(path: string): void {
  try {
    if (isSafePath(path)) sessionStorage.setItem(KEY, path);
  } catch {
    /* 저장할 수 없는 환경이면 로그인 뒤 홈으로 간다 */
  }
}

/** 기억해 둔 경로를 한 번만 꺼낸다. 없거나 안전하지 않으면 null. */
export function takeReturnTo(): string | null {
  try {
    const path = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    return path && isSafePath(path) ? path : null;
  } catch {
    return null;
  }
}
