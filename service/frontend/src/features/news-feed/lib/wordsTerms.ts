// WordsPreviewSection이 'use client'라 서버 컴포넌트(app/page.tsx)에서 직접
// import해 부를 수 없다 — 순수 로직만 이 파일로 분리(archiveItems.ts와 동일
// 패턴, 2026-08-07 홈 SSG 감사).
import { fetchCmsPosts } from '@/shared/lib/api/cmsPostsApi';

export interface Term {
  term: string;
  explain: string;
}

function dedupeTerms(all: Term[], limit: number): Term[] {
  const seen = new Map<string, Term>();
  for (const t of all) {
    const key = t.term.trim();
    if (!key || seen.has(key)) continue;
    seen.set(key, { term: key, explain: t.explain.trim() });
    if (seen.size >= limit) break;
  }
  return [...seen.values()];
}

// 서버(app/page.tsx 빌드타임 프리페치)와 클라이언트(WordsPreviewSection 갱신
// effect) 양쪽이 같은 로직을 쓰도록 공유 — fetchFollowingLetters와 동일 패턴.
export async function fetchFollowingWordTerms(): Promise<Term[]> {
  const letters = await fetchCmsPosts('letters', undefined, 50);
  const all = letters.flatMap((l) => l.keywords ?? []).filter((k) => k.term?.trim() && k.explain?.trim());
  return dedupeTerms(all, 8);
}
