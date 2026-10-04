// aws-amplify(Cognito) 지연 로더(2026-10-04 경량화).
//
// AuthContext가 aws-amplify를 정적으로 import해서 모든 페이지의 첫 번들에 약 122KB(압축 전)가 실렸다. 로그인 여부 확인은 화면이 뜬 뒤에
// 해도 되므로, 모듈을 처음 쓰는 순간에만 불러오고(한 번만 설정), 이후엔 같은 Promise를 재사용한다.
// 타입은 그대로 따라온다(동적 import는 타입 추론이 유지된다) — 호출부는 `const a = await loadAmplifyAuth(); a.signIn(...)` 형태로 쓴다.
import type { ResourcesConfig } from 'aws-amplify';
import { authConfig } from '@/shared/config/auth';

let loading: Promise<{
  auth: typeof import('aws-amplify/auth');
  utils: typeof import('aws-amplify/utils');
}> | null = null;

export function loadAmplifyAuth() {
  if (!loading) {
    loading = (async () => {
      const [{ Amplify }, auth, utils] = await Promise.all([import('aws-amplify'), import('aws-amplify/auth'), import('aws-amplify/utils')]);
      Amplify.configure(authConfig as ResourcesConfig);
      return { auth, utils };
    })();
  }
  return loading;
}
