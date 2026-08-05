/**
 * `authFetch` — `fetch` wrapper that attaches the Cognito ID token.
 *
 * Until 2026-04 the backend trusted a client-supplied `user_id` field on
 * every authenticated request, allowing trivial impersonation. The fix is
 * two-sided: the backend now verifies a Cognito JWT via
 * `core/auth.py:verify_cognito_token`, and every authenticated request
 * from the frontend goes through this helper so the `Authorization:
 * Bearer <idToken>` header is always present.
 *
 * Usage
 * -----
 *   // Required-auth (default) — throws if not signed in.
 *   const res = await authFetch(`${API_URL}/api/user/profile`, {
 *     method: 'POST',
 *     headers: { 'Content-Type': 'application/json' },
 *     body: JSON.stringify({ ...payload }),
 *   });
 *
 *   // Optional-auth — sends the token if signed in, omits it otherwise.
 *   // Use only on endpoints that personalise-when-authenticated but work
 *   // without an account (e.g. recommended feed, public archive search).
 *   const res = await authFetch(url, { requireAuth: false });
 */
import { fetchAuthSession } from 'aws-amplify/auth';

export interface AuthFetchOptions extends RequestInit {
  /** When true (default), throws if no valid Cognito session is available. */
  requireAuth?: boolean;
}

export class NotSignedInError extends Error {
  constructor(message = 'Not signed in. This action requires authentication.') {
    super(message);
    this.name = 'NotSignedInError';
  }
}

async function getIdToken(): Promise<string | undefined> {
  try {
    const session = await fetchAuthSession();
    return session.tokens?.idToken?.toString();
  } catch {
    return undefined;
  }
}

export async function authFetch(
  input: RequestInfo | URL,
  options: AuthFetchOptions = {}
): Promise<Response> {
  const { requireAuth = true, headers, ...rest } = options;

  const idToken = await getIdToken();

  if (!idToken && requireAuth) {
    throw new NotSignedInError();
  }

  // Carefully merge headers — caller may have passed a Headers, [string, string][],
  // or Record<string, string>. We always end up with a plain Record so the
  // Authorization key wins on overlap (caller-supplied Authorization is rare
  // but easier to overwrite than to special-case).
  const merged = new Headers(headers as HeadersInit | undefined);
  if (idToken) {
    merged.set('Authorization', `Bearer ${idToken}`);
  }

  return fetch(input, { ...rest, headers: merged });
}
