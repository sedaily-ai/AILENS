/**
 * 결정 카드 실시간 LLM 클라이언트.
 *
 * 정적 사이트라 브라우저에서 Bedrock 을 직접 부를 수 없으므로,
 * Bedrock 을 호출하는 백엔드(Function URL Lambda) 엔드포인트로 POST 한다.
 *   - 엔드포인트: NEXT_PUBLIC_DECISION_API_URL (미설정 시 비활성 → 호출측 mock 폴백)
 * 참조 백엔드: scripts/backend/lambda/decision-card/
 */
import type { DecisionOption, PersonaId } from '../types';

const ENDPOINT = process.env.NEXT_PUBLIC_DECISION_API_URL;

export const decisionLlmEnabled = (): boolean => !!ENDPOINT;

export interface DecisionLlmPayload {
  lang: 'ko' | 'en';
  decisionText: string;
  chosenOption: DecisionOption;
  personaId: PersonaId;
  saju?: { ilganOh: string };
}

/** 엔드포인트로 POST. 실패/미설정 시 null → 호출측에서 mock(deckEngine)으로 폴백 */
export async function callDecisionLlm(payload: DecisionLlmPayload, signal?: AbortSignal): Promise<string | null> {
  if (!ENDPOINT) return null;
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    const text = data && typeof data === 'object' && typeof (data as { text?: unknown }).text === 'string'
      ? (data as { text: string }).text.trim()
      : '';
    return text || null;
  } catch {
    return null;
  }
}
