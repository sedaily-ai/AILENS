import type { IssueLetter } from '@/features/letter';
import type { ArchiveSentenceResponse } from '@/shared/lib/api/archiveApi';
import { type NewsArticle } from './news/newsModel';

export function sentenceSourceHref(sentence: ArchiveSentenceResponse, articles: NewsArticle[], letters: IssueLetter[]) {
  if (sentence.href?.startsWith('/lens/') || sentence.href?.startsWith('/letter/')) return sentence.href;
  const letter = letters.find((item) => item.slug === sentence.article_id);
  if (letter) return `/letter/${encodeURIComponent(letter.slug)}`;
  return articles.find((item) => item.id === sentence.article_id)?.href ?? `/lens/${encodeURIComponent(sentence.article_id)}`;
}
