import { ECON_CATEGORIES } from '@ailens/domain';
import type { InterestItem, IssueLetter } from '@/features/letter';

export function categoryLabel(key: string) {
  return ECON_CATEGORIES.find((c) => c.slug === key)?.label ?? key;
}

export function matchesCategory(letter: IssueLetter, key: string) {
  const category = ECON_CATEGORIES.find((c) => c.slug === key);
  return letter.categories.some((name) => name === key || name === category?.label || category?.dataLabels.includes(name));
}

/** 같은 slug의 목록 정보를 우선하고 개인 피드의 추천 이유를 함께 유지한다. */
export function mergeLetters(letters: IssueLetter[], feed: IssueLetter[]) {
  const merged = new Map(feed.map((letter) => [letter.slug, letter]));
  for (const letter of letters) merged.set(letter.slug, { ...letter, reason: merged.get(letter.slug)?.reason ?? letter.reason });
  return [...merged.values()];
}

export function recommendLetters(letters: IssueLetter[], interests: InterestItem[], followedIds: string[], read: string[], budget: number) {
  const ranked = letters.map((letter) => {
    const category = interests.find((item) => item.type === 'category' && matchesCategory(letter, item.key));
    const followed = (letter.editors ?? []).some((id) => followedIds.includes(id));
    const reason = letter.reason || (category ? `관심 카테고리 ‘${categoryLabel(category.key)}’의 레터예요` : followed ? '팔로우한 에디터가 쓴 레터예요' : '최근 발행된 레터예요');
    return { ...letter, reason, score: (letter.reason ? 4 : category ? 3 : followed ? 2 : 0) + (read.includes(letter.slug) ? 0 : 1) };
  }).sort((a, b) => b.score - a.score || b.publishedAt.localeCompare(a.publishedAt));
  const picked: IssueLetter[] = [];
  let minutes = 0;
  for (const letter of ranked) {
    const duration = Math.max(1, letter.readMinutes || 1);
    if (budget && minutes + duration > budget) continue;
    picked.push(letter);
    minutes += duration;
    if (picked.length === 3) break;
  }
  return picked;
}

/** 날짜·완독률을 추정하지 않고, 확인한 열람 레터의 카테고리만 집계한다. */
export function readingCategories(letters: IssueLetter[], read: string[]) {
  return ECON_CATEGORIES.map((category) => ({ ...category, count: letters.filter((letter) => read.includes(letter.slug) && matchesCategory(letter, category.slug)).length }))
    .filter((category) => category.count > 0).sort((a, b) => b.count - a.count).slice(0, 4);
}
