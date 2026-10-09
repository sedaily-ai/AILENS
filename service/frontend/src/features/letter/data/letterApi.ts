// 이슈 레터 공개 API 클라이언트(lens-cms-api /api/v2/issue-letters). 설계: docs/architecture/lens-erd-src/17-이슈레터-설계.md
// 서버 컴포넌트(목록·상세 읽기)와 브라우저(투표)가 같이 쓴다. 읽기는 실패해도 throw 하지 않고 비어 있는 결과로 돌려 화면이 죽지 않게 한다.
import { CMS_API_URL } from '@/shared/config/apiClient';
import type { IssueLetter, LetterAxis, LetterSection, LetterSegment, LetterVote } from './letterTypes';

const BASE = `${CMS_API_URL}/api/v2/issue-letters`;
const AXIS_ORDER: LetterAxis[] = ['news', 'substance', 'other'];
export const LETTER_REVALIDATE_SECONDS = 60;

interface ApiCard {
  slug: string; issue_no: number; title: string; deck: string; read_minutes: number;
  categories: string[]; axes: string[]; source_count: number; published_at: string;
}
interface ApiSection { axis: LetterAxis; axis_label: string | null; heading: string; key_line: string; paragraphs: LetterSegment[][] }
interface ApiSource { title: string; outlet: string; url: string; axes: LetterAxis[]; external: boolean }
interface ApiDetail extends Omit<ApiCard, 'axes' | 'source_count' | 'categories'> {
  summary: string[]; editor_note: string | null; category_names: string[];
  sections: ApiSection[]; sources: ApiSource[];
  poll: { kind: 'emotion'; question: string; options: { key: string; label: string; hint?: string | null }[] } | null;
}

/** UTC 발행 시각을 한국 날짜(YYYY-MM-DD)로. */
function kstDate(iso: string): string {
  return new Date(new Date(iso).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

function orderedAxes(axes: string[]): LetterAxis[] {
  return AXIS_ORDER.filter((a) => axes.includes(a));
}

function mapCard(c: ApiCard): IssueLetter {
  return {
    slug: c.slug, issueNumber: c.issue_no, title: c.title, deck: c.deck,
    axisLabels: orderedAxes(c.axes).map((axis) => ({ axis, label: '' })),
    categories: c.categories, publishedAt: kstDate(c.published_at), readMinutes: c.read_minutes,
    summary: [], sections: [], editorNote: '', vote: null, sources: [], sourceCount: c.source_count,
  };
}

function mapDetail(d: ApiDetail): IssueLetter {
  const labels = new Map<LetterAxis, string>();
  for (const s of d.sections) if (!labels.has(s.axis)) labels.set(s.axis, s.axis_label ?? '');
  const sections: LetterSection[] = d.sections.map((s) => ({ axis: s.axis, heading: s.heading, keyLine: s.key_line, paragraphs: s.paragraphs }));
  const vote: LetterVote | null = d.poll
    ? { kind: d.poll.kind, question: d.poll.question, options: d.poll.options.map((o) => ({ key: o.key, label: o.label, ...(o.hint ? { hint: o.hint } : {}) })) }
    : null;
  return {
    slug: d.slug, issueNumber: d.issue_no, title: d.title, deck: d.deck,
    axisLabels: orderedAxes([...labels.keys()]).map((axis) => ({ axis, label: labels.get(axis) ?? '' })),
    categories: d.category_names, publishedAt: kstDate(d.published_at), readMinutes: d.read_minutes,
    summary: d.summary, sections, editorNote: d.editor_note ?? '', vote,
    // 자사 기사는 서버가 기사 DB에서 제목·주소를 읽어 준다. 매체명은 서울경제로 표기한다.
    sources: d.sources.map((s) => ({ title: s.title, outlet: s.external ? s.outlet : '서울경제', href: s.url, axes: s.axes, internal: !s.external })),
  };
}

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { next: { revalidate: LETTER_REVALIDATE_SECONDS } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** 발행된 레터 목록(최신순). 실패하면 빈 배열. */
export async function fetchLetterList(limit = 50): Promise<IssueLetter[]> {
  const data = await getJson<{ letters: ApiCard[] }>(`${BASE}?limit=${limit}`);
  return (data?.letters ?? []).map(mapCard);
}

/** 발행된 레터 상세. 없거나 실패하면 null. */
export async function fetchLetterDetail(slug: string): Promise<IssueLetter | null> {
  const data = await getJson<{ letter: ApiDetail }>(`${BASE}/${encodeURIComponent(slug)}`);
  return data ? mapDetail(data.letter) : null;
}

export interface VoteState { my_choice: string | null; counts: Record<string, number> | null }

/** 내 투표 여부(투표한 사람에게만 집계가 온다). 브라우저에서 호출. */
export async function fetchMyVote(slug: string, voterId: string): Promise<VoteState | null> {
  try {
    const res = await fetch(`${BASE}/${encodeURIComponent(slug)}/vote`, { headers: { 'X-Voter-Id': voterId }, cache: 'no-store' });
    return res.ok ? ((await res.json()) as VoteState) : null;
  } catch {
    return null;
  }
}

/** 투표한다. 이미 투표했으면(409) 기존 선택과 집계가 돌아오며 ok=true 로 취급한다. 네트워크·서버 오류는 null. */
export async function postVote(slug: string, voterId: string, optionKey: string): Promise<VoteState | null> {
  try {
    const res = await fetch(`${BASE}/${encodeURIComponent(slug)}/vote`, {
      method: 'POST', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'X-Voter-Id': voterId },
      body: JSON.stringify({ option_key: optionKey }),
    });
    if (res.ok || res.status === 409) return (await res.json()) as VoteState;
    return null;
  } catch {
    return null;
  }
}
