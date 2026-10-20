/**
 * 이슈 레터(모아쓰기 레터) 공개 API — GET {cmsApiUrl}/api/v2/issue-letters[/{slug}], 투표 GET/POST …/{slug}/vote.
 * 웹 features/letter/data/letterApi.ts 와 같은 계약. 한 레터는 3축(소식·실체·다른 시각) 섹션과 출처·투표로 이뤄진다.
 * 웹과 달리 읽기 실패는 throw 한다(앱 화면이 재시도를 보여 준다). 설계: docs/architecture/lens-erd-src/17-이슈레터-설계.md
 */
import { getApiConfig } from './config.js';
import { ApiError } from './posts.js';

export type LetterAxis = 'news' | 'substance' | 'other';

/** 시각 블록 — 문단 자리에 한 조각짜리 배열로 들어간다(서버 BLOCK_KINDS 와 같은 목록). */
export type LetterBlock =
  | { block: 'timeline'; items: { label: string; text: string }[] }
  | { block: 'stats'; items: { label: string; value: string; sub?: string }[] }
  | { block: 'bars'; title?: string; unit?: string; items: { label: string; value: number }[] }
  | { block: 'versus'; left: { label: string; text: string }; right: { label: string; text: string } }
  | { block: 'fold'; title: string; text: string }
  | { block: 'callout'; text: string };

/** 본문 조각: 문자열, 인라인 링크(원문 기사), 또는 시각 블록. */
export type LetterSegment = string | { text: string; href: string } | LetterBlock;

export interface IssueLetterCard {
  slug: string;
  issue_no: number;
  title: string;
  deck: string;
  categories: string[];
  axes: LetterAxis[];
  source_count: number;
  published_at: string;
  topics?: string[];
  editors?: string[];
}

export interface IssueLetterSection {
  axis: LetterAxis;
  axis_label: string | null;
  heading: string;
  key_line: string;
  paragraphs: LetterSegment[][];
}

export interface IssueLetterSource {
  title: string;
  outlet: string;
  url: string;
  axes: LetterAxis[];
  external: boolean;
}

export interface IssueLetterPoll {
  kind: 'emotion';
  question: string;
  options: { key: string; label: string; hint?: string | null }[];
}

export interface IssueLetterDetail extends Omit<IssueLetterCard, 'axes' | 'source_count' | 'categories' | 'topics'> {
  summary: string[];
  editor_note: string | null;
  category_names: string[];
  topics?: { name: string }[];
  sections: IssueLetterSection[];
  sources: IssueLetterSource[];
  poll: IssueLetterPoll | null;
}

export interface LetterVoteState {
  my_choice: string | null;
  counts: Record<string, number> | null;
}

const base = () => `${getApiConfig().cmsApiUrl}/api/v2/issue-letters`;

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { signal });
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') throw e;
    throw new ApiError('네트워크 오류');
  }
  if (!res.ok) throw new ApiError(`요청 실패 (${res.status})`, res.status);
  return (await res.json()) as T;
}

/** 발행된 레터 목록(최신순). */
export async function listIssueLetters(limit = 50, signal?: AbortSignal): Promise<IssueLetterCard[]> {
  return (await getJson<{ letters: IssueLetterCard[] }>(`${base()}?limit=${limit}`, signal)).letters ?? [];
}

export async function getIssueLetter(slug: string, signal?: AbortSignal): Promise<IssueLetterDetail> {
  return (await getJson<{ letter: IssueLetterDetail }>(`${base()}/${encodeURIComponent(slug)}`, signal)).letter;
}

/** 내 투표 여부(투표한 사람에게만 집계가 온다). 실패하면 null. */
export async function fetchIssueVote(slug: string, voterId: string): Promise<LetterVoteState | null> {
  try {
    const res = await fetch(`${base()}/${encodeURIComponent(slug)}/vote`, { headers: { 'X-Voter-Id': voterId } });
    return res.ok ? ((await res.json()) as LetterVoteState) : null;
  } catch {
    return null;
  }
}

/** 투표한다. 이미 투표했으면(409) 기존 선택과 집계가 돌아온다. 네트워크·서버 오류는 null. */
export async function castIssueVote(slug: string, voterId: string, optionKey: string): Promise<LetterVoteState | null> {
  try {
    const res = await fetch(`${base()}/${encodeURIComponent(slug)}/vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Voter-Id': voterId },
      body: JSON.stringify({ option_key: optionKey }),
    });
    if (res.ok || res.status === 409) return (await res.json()) as LetterVoteState;
    return null;
  } catch {
    return null;
  }
}
