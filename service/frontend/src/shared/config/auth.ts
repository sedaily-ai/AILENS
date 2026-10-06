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

// 환경에 따른 현재 redirect URL을 돌려준다.
