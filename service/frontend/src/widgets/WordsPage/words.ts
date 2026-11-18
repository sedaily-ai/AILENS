import { fetchCmsPosts, fetchLensPosts } from '@/shared/lib/api/cmsPostsApi';
import { letterHref, lensPath } from '@ailens/domain';

// 기존 레터와 새 기사 렌디션의 keywords를 함께 모아 보여 준다. 새 데이터 구조 없이 기존 데이터의 다른 진입점이다.
// 단어를 누르면 그 단어를 다룬 레터(스토리)로 이동하도록 출처를 href로 보존한다. 용어 하나가 여러 레터에 등장하면(중복 dedupe) 설명이 더 긴 쪽의 출처를 쓴다.
// app/words/page.tsx(서버)와 WordsPage.tsx(클라이언트)가 Term 타입을 같이 쓰므로 여기 분리했다(/timeline의 timelineApi.ts와 같은 이유).
export interface Term {
  term: string;
  explain: string;
  href: string | null;
}

function dedupeTerms(all: Term[]): Term[] {
  const seen = new Map<string, Term>();
  for (const t of all) {
    const key = t.term.trim();
    if (!key) continue;
    // 같은 단어가 여러 레터에 나오면 설명이 더 긴(자세한) 쪽을 남긴다.
    const prev = seen.get(key);
    if (!prev || t.explain.length > prev.explain.length) {
      seen.set(key, { term: key, explain: t.explain.trim(), href: t.href });
    }
  }
  return [...seen.values()].sort((a, b) => a.term.localeCompare(b.term, 'ko'));
}

export async function fetchTerms(): Promise<Term[]> {
  const [letters, lenses] = await Promise.all([
    fetchCmsPosts('letters', undefined, 100),
    fetchLensPosts(),
  ]);
  const all = letters.flatMap((l) => {
    const href = letterHref(l.id);
    return (l.keywords ?? []).map((k) => ({ ...k, href }));
  });
  const articleTerms = lenses.flatMap((lens) =>
    lens.lenses.flatMap((format) =>
      (format.keywords ?? []).map((keyword) => ({ ...keyword, href: lensPath(lens) })),
    ),
  );
  return dedupeTerms([...all, ...articleTerms]);
}

// 용어가 1,600개를 넘어 한 페이지에 전부 그리면 HTML이 1.5MB를 넘는다. 서버는 100개씩 나눠 /words, /words/page/{n}으로 내보낸다(2026-11-18).
// 검색은 전체 목록이 필요하므로 클라이언트가 입력을 시작할 때 fetchTerms()로 한 번만 가져온다.
export const WORDS_PAGE_SIZE = 100;

export function sliceTermsPage(terms: Term[], page: number) {
  const totalPages = Math.max(1, Math.ceil(terms.length / WORDS_PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, Math.floor(page) || 1), totalPages);
  const items = terms.slice((currentPage - 1) * WORDS_PAGE_SIZE, currentPage * WORDS_PAGE_SIZE);
  return { items, currentPage, totalPages, totalCount: terms.length };
}

export function wordsPagePath(n: number): string {
  return n <= 1 ? '/words' : `/words/page/${n}`;
}
