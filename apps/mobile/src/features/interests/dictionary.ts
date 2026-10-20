import { ECON_CATEGORIES, EDITORS, econSubcategoriesFor, categoryForDataLabel } from '@ailens/domain';
import { getApiConfig } from '@ailens/api-client';
import type { Interest } from './match';

/**
 * 관심 사전: 분야(9) → 섹터(분야의 세부 분류) → 화두(주제어). 화두는 공개 API(/api/v2/issue-letters/topics, 75개, 분야 연결 포함)에서 받고,
 * 실패하면 웹 에디터의 담당 주제어로 대신한다.
 */
export interface Group {
  slug: string;
  label: string;
  items: Interest[];
}

export const categoryItems = (): Interest[] => ECON_CATEGORIES.map((c) => ({ type: 'category', key: c.slug, label: c.label }));

export const subGroups = (): Group[] =>
  ECON_CATEGORIES.map((c) => ({
    slug: c.slug,
    label: c.label,
    items: econSubcategoriesFor(c.slug)
      // "정책"·"…일반"은 분야마다 있거나 너무 넓어 관심 단위로 의미가 적다.
      .filter((n) => !/일반$/.test(n) && n !== '정책')
      .map((n) => ({ type: 'sub' as const, key: `${c.slug}:${n}`, label: n, category: c.slug })),
  })).filter((g) => g.items.length > 0);

interface ApiTopic {
  slug: string;
  name: string;
  kind?: string;
  category_slug?: string;
}

let memo: Promise<Group[]> | null = null;
/** 화두를 분야별로 묶어 돌려준다. 한 번만 받고 메모리에 둔다. */
export function topicGroups(): Promise<Group[]> {
  if (!memo) {
    memo = fetch(`${getApiConfig().cmsApiUrl}/api/v2/issue-letters/topics`)
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json() as Promise<{ topics?: ApiTopic[] } | ApiTopic[]>;
      })
      .then((j) => (Array.isArray(j) ? j : j.topics ?? []))
      .then((list) => group(list.filter((t) => t.name && t.slug)))
      .catch(() => group(fallbackTopics()));
  }
  return memo;
}

function group(list: ApiTopic[]): Group[] {
  const by = new Map<string, Interest[]>();
  for (const t of list) {
    const slug = t.category_slug && ECON_CATEGORIES.some((c) => c.slug === t.category_slug) ? t.category_slug : 'etc';
    const arr = by.get(slug) ?? [];
    if (!arr.some((x) => x.key === t.slug)) arr.push({ type: 'topic', key: t.slug, label: t.name, category: slug === 'etc' ? undefined : slug });
    by.set(slug, arr);
  }
  const order = [...ECON_CATEGORIES.map((c) => c.slug), 'etc'];
  return order
    .filter((s) => by.has(s))
    .map((s) => ({ slug: s, label: ECON_CATEGORIES.find((c) => c.slug === s)?.label ?? '기타', items: by.get(s) as Interest[] }));
}

function fallbackTopics(): ApiTopic[] {
  const seen = new Set<string>();
  const out: ApiTopic[] = [];
  for (const e of EDITORS)
    for (const t of e.topics)
      if (!seen.has(t.slug)) {
        seen.add(t.slug);
        out.push({ slug: t.slug, name: t.name });
      }
  return out;
}

export const slugOfCategory = (label?: string | null): string | null => categoryForDataLabel(label ?? '')?.slug ?? null;
export const labelOfCategory = (slug: string): string | undefined => ECON_CATEGORIES.find((c) => c.slug === slug)?.label;
