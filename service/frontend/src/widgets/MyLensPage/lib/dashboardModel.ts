import type { IssueLetter } from '@/features/letter';

/** 같은 slug의 목록 정보를 우선하고 개인 피드의 추천 이유를 함께 유지한다. */
export function mergeLetters(letters: IssueLetter[], feed: IssueLetter[]) {
  const merged = new Map(feed.map((letter) => [letter.slug, letter]));
  for (const letter of letters) merged.set(letter.slug, { ...letter, reason: merged.get(letter.slug)?.reason ?? letter.reason });
  return [...merged.values()];
}
