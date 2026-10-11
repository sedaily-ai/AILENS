// 모아쓰기 레터 공개 목록 — 사이트맵·RSS·llms 같은 검색·피드 용도(shared 레이어에서 features/letter 를 가져오지 않으려고 따로 둔 최소 클라이언트).
// 화면용 상세 읽기는 features/letter/data/letterApi.ts 가 한다. 읽기 실패는 빈 배열로 돌려 사이트맵·피드가 죽지 않게 한다.
import { CMS_API_URL } from '@/shared/config/apiClient';

export interface IssueLetterCard {
  slug: string;
  title: string;
  deck: string;
  published_at: string;
  categories: string[];
  topics?: string[];
}

export const ISSUE_LETTER_SEO_REVALIDATE = 300;

export async function fetchIssueLetterCards(limit = 100): Promise<IssueLetterCard[]> {
  try {
    const res = await fetch(`${CMS_API_URL}/api/v2/issue-letters?limit=${limit}`, { next: { revalidate: ISSUE_LETTER_SEO_REVALIDATE } });
    if (!res.ok) return [];
    const data = (await res.json()) as { letters?: IssueLetterCard[] };
    return data.letters ?? [];
  } catch {
    return [];
  }
}

/** 레터 상세 주소(한글 slug 는 인코딩한다). */
export function issueLetterPath(slug: string): string {
  return `/letter/${encodeURIComponent(slug)}`;
}
