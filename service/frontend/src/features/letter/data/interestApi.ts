// 레터 이메일 구독 클라이언트. 기존 구독의 관심 데이터는 서버에서 보존한다.
import { CMS_API_URL } from '@/shared/config/apiClient';
import { getDeviceId } from '../lib/deviceId';

const BASE = `${CMS_API_URL}/api/v2/issue-letters`;

// ── 이메일 구독: 가입 → 메일 확인 → 수신거부. 서버는 주소의 가입 여부를 알려 주지 않는다(항상 같은 응답).
export type SubscribeResult = { ok: true } | { ok: false; message: string };

async function postJson(path: string, body: unknown, withDevice = false): Promise<SubscribeResult> {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (withDevice) {
      const id = getDeviceId();
      if (id) headers['X-Voter-Id'] = id;
    }
    const res = await fetch(`${BASE}${path}`, { method: 'POST', cache: 'no-store', headers, body: JSON.stringify(body) });
    if (res.ok) return { ok: true };
    const detail = ((await res.json().catch(() => ({}))) as { detail?: string }).detail;
    return { ok: false, message: typeof detail === 'string' && detail ? detail : '처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.' };
  } catch {
    return { ok: false, message: '네트워크 연결을 확인하고 다시 시도해 주세요.' };
  }
}

export function subscribeByEmail(input: { email: string; editors: string[]; frequency: 'daily' | 'weekly'; sendHour: number }): Promise<SubscribeResult> {
  // editors: 구독한 에디터 slug. 서버는 "구독한 에디터가 쓴 레터가 발행되면" 그 구독자에게 보낸다.
  return postJson('/subscriptions', { email: input.email, editors: input.editors, frequency: input.frequency, send_hour: input.sendHour, consent: true }, true);
}

/** "이렇게 와요" 미리보기: 서버가 만든 실제 메일 본문(HTML). 실패하면 null. */
export async function fetchMailPreview(): Promise<{ subject: string; html: string } | null> {
  try {
    const res = await fetch(`${BASE}/subscriptions/preview`);
    return res.ok ? ((await res.json()) as { subject: string; html: string }) : null;
  } catch {
    return null;
  }
}

export const sendTestMail = (email: string) => postJson('/subscriptions/test', { email });
export const confirmSubscription = (token: string) => postJson('/subscriptions/confirm', { token });
export const unsubscribeByToken = (token: string) => postJson('/subscriptions/unsubscribe', { token });
