import { API_URL } from "@/shared/config/api";
import { authFetch } from "@/shared/lib/authFetch";

// v1 endpoints below (recordArticleRead etc.) require a Cognito ID token.
// The backend derives the canonical user_id from the verified JWT `sub`
// claim and ignores any `user_id` field on the body / query string (it
// stays in the URL only for human-readable logs and to keep API Gateway
// access-log lines unchanged).
//
// v2 endpoints (recordArticleReadV2) are AuthorizationType: NONE per v2
// backend convention — user_id is read from the body, no JWT attached.
// The Round 5-C interaction Lambda will get JWT auth in a separate
// hardening round.

/**
 * Record that a user read an article. Fire-and-forget; failures are logged
 * but never thrown to the caller — the read view should not be blocked by
 * tracker hiccups.
 */
export async function recordArticleRead(
  userId: string,
  articleId: string,
  articleTitle?: string
): Promise<void> {
  try {
    const res = await authFetch(`${API_URL}/api/user/read`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        article_id: articleId,
        article_title: articleTitle,
      }),
    });
    if (!res.ok) {
      console.warn(`recordArticleRead returned ${res.status}`);
    }
  } catch (error) {
    console.error("Failed to record article read:", error);
  }
}

/**
 * Record an interaction event to the v2 backend's POST /api/v2/interactions
 * endpoint. Phase 3 personalization (Round 5-E wire-up) — dual-writes alongside
 * v1 recordArticleRead so existing v1-based features (DNA tab, recommend API)
 * keep working while v2 user_interactions accumulates the data the
 * Consolidation Lambda needs.
 *
 * Wire-up scope (Round 5-E): only `click` events fire here, only with the
 * 2-char MBTI group (frontend doesn't yet collect 4-char MBTI; that's a
 * separate round). Backend lazy profile-create requires the 4-char form, so
 * this round does not yet trigger any user_profiles creation — the events
 * just get logged. Once a profile-create flow ships, the same events start
 * driving real personalization.
 *
 * Why no Cognito JWT here:
 *   The v2 interaction endpoint is AuthorizationType: NONE (per backend
 *   convention) and reads user_id from the request body. Using authFetch
 *   would attach a JWT the backend ignores, so we use plain fetch.
 *
 * Fire-and-forget; failures are swallowed because the read view should
 * never be blocked by tracker hiccups. Symmetric with v1 recordArticleRead.
 */
export async function recordArticleReadV2(
  userId: string,
  articleId: string,
  mbtiGroup: string,
): Promise<void> {
  try {
    const res = await fetch(`${API_URL}/api/v2/interactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        news_id: articleId,
        interaction_type: "click",
        mbti_type: mbtiGroup,
      }),
    });
    if (!res.ok) {
      console.warn(`recordArticleReadV2 returned ${res.status}`);
    }
  } catch (error) {
    console.error("Failed to record v2 interaction:", error);
  }
}

