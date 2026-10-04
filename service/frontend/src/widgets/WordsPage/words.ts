import { fetchCmsPosts } from '@/shared/lib/api/cmsPostsApi';
import { letterHref } from '@/shared/lib/content/letterHref';

// 레터마다 본문 하단에 있던 "단어" 목록을 전부 모아 보여준다 — 새 데이터 구조
// 없이 이미 있는 letter.keywords 를 모으기만 하면 돼서(레서 참고 — 2026-08-06),
// 용어 해설(구 명칭 "단어장") 자체가 하나의 새 콘텐츠 타입은 아니고 기존
// 데이터의 다른 진입점이다.
//
// 2026-08-07: 단어를 눌렀을 때 그 단어를 다룬 레터(스토리)로 이동하는 링크
// 추가 — 용어가 어느 레터에서 왔는지 원래는 버려지던 정보를 href로 살려둔다.
// 용어 하나가 여러 레터에 등장하면(중복 dedupe) 그중 설명이 더 긴 쪽의 출처를 쓴다.
//
// app/words/page.tsx(서버)/WordsPage.tsx(클라이언트) 양쪽이 Term 타입을 같이 써서
// 여기 분리했다(2026-08-12, SSR 분리 — /timeline의 timelineApi.ts와 같은 이유).
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
  const letters = await fetchCmsPosts('letters', undefined, 100);
  const all = letters.flatMap((l) => {
    const href = letterHref(l.id);
    return (l.keywords ?? []).map((k) => ({ ...k, href }));
  });
  return dedupeTerms(all);
}
