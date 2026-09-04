import { SITE_URL } from '@/shared/constants/site';

// AWS Cognito Auth Configuration
export const authConfig = {
  Auth: {
    Cognito: {
      userPoolId: 'us-east-1_ZS8PgF3iX',
      userPoolClientId: '66c9bq3ovmk007d0eepkle92k3',
      loginWith: {
        oauth: {
          domain: 'sedaily-mbti.auth.us-east-1.amazoncognito.com',
          scopes: ['email', 'profile', 'openid'] as const,
          redirectSignIn: [`${SITE_URL}/auth/callback`, 'http://localhost:3000/auth/callback'],
          redirectSignOut: [SITE_URL, 'http://localhost:3000'],
          responseType: 'code' as const,
          providers: ['Google'] as const,
        },
      },
    },
  },
};

// Get current redirect URL based on environment.
// mbti.sedaily.ai 도메인 폐기(2026-08-08, ailens.sedaily.ai로 통합) — CloudFront
// alias·Route53 레코드 삭제 완료, 여기 남아있던 참조도 함께 제거.
export function getRedirectUrl(): string {
  if (typeof window === 'undefined') return `${SITE_URL}/auth/callback`;
  return window.location.hostname === 'localhost'
    ? 'http://localhost:3000/auth/callback'
    : `${window.location.origin}/auth/callback`;
}

export function getSignOutUrl(): string {
  if (typeof window === 'undefined') return SITE_URL;
  return window.location.hostname === 'localhost'
    ? 'http://localhost:3000'
    : window.location.origin;
}
