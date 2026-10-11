// 1기사 레터 투표 API(lens-cms-api /api/v2/posts/{slug}/vote). 서버가 번호(o1~o9)만 저장하고 문구는 본문이 정본이다.
import { CMS_API_URL } from '@/shared/config/apiClient';

export interface PostVoteState {
  my_choice: string | null;
  counts: Record<string, number> | null;
}

const url = (slug: string) => `${CMS_API_URL}/api/v2/posts/${encodeURIComponent(slug)}/vote`;

/** 내 투표 여부(투표한 사람에게만 집계가 온다). 실패하면 null — 화면은 투표 전 상태로 둔다. */
export async function fetchPostVote(slug: string, voterId: string): Promise<PostVoteState | null> {
  try {
    const res = await fetch(url(slug), { headers: { 'X-Voter-Id': voterId }, cache: 'no-store' });
    return res.ok ? ((await res.json()) as PostVoteState) : null;
  } catch {
    return null;
  }
}

/** 투표한다. 이미 투표했으면(409) 기존 선택과 집계가 돌아온다. 네트워크·서버 오류는 null. */
export async function castPostVote(slug: string, voterId: string, optionKey: string): Promise<PostVoteState | null> {
  try {
    const res = await fetch(url(slug), {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'X-Voter-Id': voterId },
      body: JSON.stringify({ option_key: optionKey }),
    });
    if (res.ok || res.status === 409) return (await res.json()) as PostVoteState;
    return null;
  } catch {
    return null;
  }
}
