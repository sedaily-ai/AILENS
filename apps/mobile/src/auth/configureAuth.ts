// react-native-get-random-values 는 Amplify(암호 난수)보다 먼저 로드돼야 한다 — 앱 진입점에서 이 파일을 가장 먼저 import 한다.
import 'react-native-get-random-values';
import { Amplify } from 'aws-amplify';
import { cognitoUserPoolsTokenProvider } from 'aws-amplify/auth/cognito';
import { secureStorage } from './secureStorage';

// 웹(service/frontend/src/shared/config/auth.ts)과 같은 User Pool·App Client 를 공유한다. 다른 건 redirect 뿐이다.
// redirect — Amplify RN(aws-amplify v6)은 로그인 시 "http·https 가 아닌 앱 스킴" 주소만 고른다
// (getRedirectUrl.native: 목록에 앱 스킴이 없으면 InvalidAppSchemeException 으로 앱 시작 시 오류, 로그인 주소를 고르는 옵션도 없음).
// 그래서 앱 스킴 `ailens://` 를 쓴다. 인증 코드 플로우 + PKCE 라서 스킴을 가로채도 코드만으로는 토큰을 얻지 못한다(RFC 8252 허용 방식, 차선).
// 이 주소들은 Cognito App Client 의 Callback/SignOut URLs 에 등록돼 있어야 한다.
// 인증된 https 링크(권장 방식)가 필요해지면 로그인을 expo-auth-session 기반 자체 PKCE 구현으로 바꾼다
// (Cognito 에 https 콜백이 이미 등록돼 있고 assetlinks·intentFilters 도 준비돼 있다). 근거: docs/architecture/auth-env-공유설계-Amplify.md
export const OAUTH_REDIRECT_SIGN_IN = 'ailens://auth/callback';
export const OAUTH_REDIRECT_SIGN_OUT = 'ailens://auth/signout';

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
            redirectSignIn: [OAUTH_REDIRECT_SIGN_IN],
            redirectSignOut: [OAUTH_REDIRECT_SIGN_OUT],
            responseType: 'code',
            providers: ['Google'],
          },
        },
      },
    },
  });
}
