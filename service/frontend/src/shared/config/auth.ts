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
          redirectSignIn: ['https://ailens.sedaily.ai/auth/callback', 'https://mbti.sedaily.ai/auth/callback', 'http://localhost:3000/auth/callback'],
          redirectSignOut: ['https://ailens.sedaily.ai', 'https://mbti.sedaily.ai', 'http://localhost:3000'],
          responseType: 'code' as const,
          providers: ['Google'] as const,
        },
      },
    },
  },
};

// Get current redirect URL based on environment.
// Use the live origin so login works on either domain (ailens.sedaily.ai primary, mbti.sedaily.ai legacy).
export function getRedirectUrl(): string {
  if (typeof window === 'undefined') return 'https://ailens.sedaily.ai/auth/callback';
  return window.location.hostname === 'localhost'
    ? 'http://localhost:3000/auth/callback'
    : `${window.location.origin}/auth/callback`;
}

export function getSignOutUrl(): string {
  if (typeof window === 'undefined') return 'https://ailens.sedaily.ai';
  return window.location.hostname === 'localhost'
    ? 'http://localhost:3000'
    : window.location.origin;
}
