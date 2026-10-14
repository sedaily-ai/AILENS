import { getApiConfig } from '@ailens/api-client';
import { authFetch } from '../../auth/authProvider';

// "내 서랍"(담은 문장) 서버 API — 웹 shared/lib/api/archiveApi.ts 와 같은 계약. 모두 로그인 필요(Authorization: Bearer idToken).
export interface ArchiveSentence {
  id: string;
  text: string;
  article_id: string;
  article_title: string;
  article_published_at: string;
  created_at: string;
}

const base = () => `${getApiConfig().apiUrl}/api/archive`;

async function fail(res: Response, label: string): Promise<never> {
  const err = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
  throw new Error(err?.error?.message || `${label} 실패 (${res.status})`);
}

export async function listArchive(userId: string, limit = 100): Promise<ArchiveSentence[]> {
  const res = await authFetch(`${base()}?${new URLSearchParams({ user_id: userId, limit: String(limit) })}`);
  if (!res.ok) return fail(res, '서랍 불러오기');
  return ((await res.json()) as { sentences: ArchiveSentence[] }).sentences ?? [];
}

export async function saveSentence(payload: {
  user_id: string;
  text: string;
  article_id: string;
  article_title: string;
  article_published_at?: string;
}): Promise<ArchiveSentence> {
  const res = await authFetch(base(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (!res.ok) return fail(res, '문장 저장');
  return ((await res.json()) as { sentence: ArchiveSentence }).sentence;
}

export async function deleteSentence(id: string, userId: string): Promise<void> {
  const res = await authFetch(`${base()}/${encodeURIComponent(id)}?user_id=${encodeURIComponent(userId)}`, { method: 'DELETE' });
  if (!res.ok) await fail(res, '문장 삭제');
}
