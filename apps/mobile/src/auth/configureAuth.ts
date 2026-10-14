// react-native-get-random-values 는 Amplify(암호 난수)보다 먼저 로드돼야 한다 — 앱 진입점에서 이 파일을 가장 먼저 import 한다.
import 'react-native-get-random-values';
import { Amplify } from 'aws-amplify';
import { cognitoUserPoolsTokenProvider } from 'aws-amplify/auth/cognito';
import { secureStorage } from './secureStorage';

// 웹(service/frontend/src/shared/config/auth.ts)과 같은 User Pool·App Client 를 공유한다. 다른 건 redirect 뿐이다.
// redirect URL 은 Cognito App Client 의 Callback/SignOut URLs 에 등록돼 있어야 한다(docs/architecture/auth-env-공유설계-Amplify.md).
const APP_SCHEME = 'ailens';

let configured = false;

/** 앱 시작 시 1회. 토큰은 SecureStore 에 저장한다. */
export function configureAuth(): void {
  if (configured) return;
  configured = true;

  cognitoUserPoolsTokenProvider.setKeyValueStorage(secureStorage);

  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: 'us-east-1_ZS8PgF3iX',
        userPoolClientId: '66c9bq3ovmk007d0eepkle92k3',
        loginWith: {
          oauth: {
            domain: 'sedaily-mbti.auth.us-east-1.amazoncognito.com',
            scopes: ['email', 'profile', 'openid'],
            redirectSignIn: [`${APP_SCHEME}://auth/callback`],
            redirectSignOut: [`${APP_SCHEME}://`],
            responseType: 'code',
            providers: ['Google'],
          },
        },
      },
    },
  });
}
