import type { IssueLetter } from '@/features/letter';
import type { ArchiveSentenceResponse } from '@/shared/lib/api/archiveApi';
import { type NewsArticle } from './news/newsModel';

/** 후보가 둘 이상이면 직전 문장을 제외하고, 나머지에서 하나를 무작위로 고른다. */
export function pickDiscoverySentence<T extends { id: string }>(sentences: T[], previousId: string | null): T | undefined {
  if (!sentences.length) return undefined;
  const others = sentences.filter((sentence) => sentence.id !== previousId);
  const candidates = others.length ? others : sentences;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

export function sentenceSourceHref(sentence: ArchiveSentenceResponse, articles: NewsArticle[], letters: IssueLetter[]) {
  if (sentence.href?.startsWith('/lens/') || sentence.href?.startsWith('/letter/')) return sentence.href;
  const letter = letters.find((item) => item.slug === sentence.article_id);
  if (letter) return `/letter/${encodeURIComponent(letter.slug)}`;
  return articles.find((item) => item.id === sentence.article_id)?.href ?? `/lens/${encodeURIComponent(sentence.article_id)}`;
}
