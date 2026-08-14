/**
 * 실시간 LLM 클라이언트 — 자유 입력 의도분류 + 매듭 서술 생성.
 *
 * 정적 사이트라 브라우저에서 Bedrock 을 직접 부를 수 없으므로,
 * Bedrock 을 호출하는 백엔드(Function URL Lambda) 엔드포인트로 POST 한다.
 *   - 엔드포인트: NEXT_PUBLIC_CHAT_API_URL (미설정 시 LLM 비활성 → 호출측 템플릿 폴백)
 *   - 모델: 백엔드 env 로 지정 (테스트 Haiku 4.5 / 운영 Sonnet 4.6~Opus 4.8)
 * 참조 백엔드: scripts/backend/lambda/chat-bedrock/
 */
import type { ConcernId, SajuContext } from './types';

const ENDPOINT = process.env.NEXT_PUBLIC_CHAT_API_URL;

export const llmEnabled = (): boolean => !!ENDPOINT;

export type LlmTask = 'classify' | 'predict' | 'hit' | 'overlay' | 'knot' | 'freeform';

export interface LlmPayload {
  task: LlmTask;
  lang: 'ko' | 'en';
  saju: SajuContext;
  concern?: ConcernId;
  narrowAnswers?: string[];
  prior?: ConcernId[];
  eraFacts?: { text: string; source: string }[];
  userText?: string;
  /** 직전 대화 맥락 (freeform 시 연속성 유지용) */
  history?: { role: 'bot' | 'user'; text: string }[];
}

/** 엔드포인트로 POST. 실패/미설정 시 null → 호출측에서 템플릿으로 폴백 */
export async function callLlm(payload: LlmPayload, signal?: AbortSignal): Promise<string | null> {
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

const CONCERN_IDS: ConcernId[] = ['career', 'money', 'relationship', 'overwhelmed'];

/** 자유 입력 → concern 분류. 실패 시 null (호출측 키워드 폴백) */
export async function classifyConcern(userText: string, lang: 'ko' | 'en', saju: SajuContext): Promise<ConcernId | null> {
  const out = await callLlm({ task: 'classify', lang, saju, userText });
  if (!out) return null;
  const v = out.toLowerCase();
  return CONCERN_IDS.find(id => v.includes(id)) ?? null;
}
