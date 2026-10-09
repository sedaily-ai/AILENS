// 독자 관심(관심 묶음·주제·내 관심·내 관심사 레터) 클라이언트. 브라우저에서만 호출한다(기기 식별자가 필요하다).
// 서버: lens-cms-api /api/v2/issue-letters/{bundles,topics,me/interests,me/feed}. 설계: docs/architecture/lens-erd-src/19-독자관심-구독-설계.md
import { CMS_API_URL } from '@/shared/config/apiClient';
import { getDeviceId } from '../lib/deviceId';
import type { IssueLetter, LetterAxis } from './letterTypes';

const BASE = `${CMS_API_URL}/api/v2/issue-letters`;

export interface InterestItem { type: 'category' | 'topic'; key: string }
export interface Bundle { slug: string; name: string; description: string | null; items: InterestItem[] }
export interface TopicOption { slug: string; name: string; kind: string; category_slug: string | null }

interface FeedItem {
  slug: string; issue_no: number; title: string; deck: string; read_minutes: number; categories: string[]; axes: string[];
  source_count: number; published_at: string; topics: string[]; reason_text: string;
}

const AXIS_ORDER: LetterAxis[] = ['news', 'substance', 'other'];

async function getJson<T>(path: string, withDevice = false): Promise<T | null> {
  try {
    const headers: Record<string, string> = {};
    if (withDevice) {
      const id = getDeviceId();
      if (!id) return null;
      headers['X-Voter-Id'] = id;
    }
    const res = await fetch(`${BASE}${path}`, { headers, cache: withDevice ? 'no-store' : 'default' });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

export async function fetchBundles(): Promise<Bundle[]> {
  return (await getJson<{ bundles: Bundle[] }>('/bundles'))?.bundles ?? [];
}

export async function fetchTopics(): Promise<TopicOption[]> {
  return (await getJson<{ topics: TopicOption[] }>('/topics'))?.topics ?? [];
}

export async function fetchMyInterests(): Promise<InterestItem[] | null> {
  return (await getJson<{ interests: InterestItem[] }>('/me/interests', true))?.interests ?? null;
}

/** 이 기기의 관심을 통째로 교체한다. 실패하면 null. */
export async function saveMyInterests(items: InterestItem[]): Promise<InterestItem[] | null> {
  const id = getDeviceId();
  if (!id) return null;
  try {
    const res = await fetch(`${BASE}/me/interests`, {
      method: 'PUT', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'X-Voter-Id': id },
      body: JSON.stringify({ interests: items }),
    });
    return res.ok ? ((await res.json()) as { interests: InterestItem[] }).interests : null;
  } catch {
    return null;
  }
}

/** 관심과 겹치는 레터(점수순, 이유 포함). 관심이 없거나 실패하면 빈 배열. */
export async function fetchMyFeed(): Promise<IssueLetter[]> {
  const data = await getJson<{ has_interests: boolean; letters: FeedItem[] }>('/me/feed?limit=6', true);
  return (data?.letters ?? []).map((f) => ({
    slug: f.slug, issueNumber: f.issue_no, title: f.title, deck: f.deck,
    axisLabels: AXIS_ORDER.filter((a) => f.axes.includes(a)).map((axis) => ({ axis, label: '' })),
    categories: f.categories, publishedAt: new Date(new Date(f.published_at).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10),
    readMinutes: f.read_minutes, summary: [], sections: [], editorNote: '', vote: null, sources: [], sourceCount: f.source_count,
    topics: f.topics, reason: f.reason_text,
  }));
}

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

export function subscribeByEmail(input: { email: string; interests: InterestItem[]; frequency: 'daily' | 'weekly'; sendHour: number }): Promise<SubscribeResult> {
  return postJson('/subscriptions', { email: input.email, interests: input.interests, frequency: input.frequency, send_hour: input.sendHour, consent: true }, true);
}

export const confirmSubscription = (token: string) => postJson('/subscriptions/confirm', { token });
export const unsubscribeByToken = (token: string) => postJson('/subscriptions/unsubscribe', { token });
