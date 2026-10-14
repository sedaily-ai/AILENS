import type { IssueLetter } from '@/features/letter';
import type { ArchiveSentenceResponse } from '@/shared/lib/api/archiveApi';
import { buildNewsProfile, recommendNews, type NewsArticle, type NewsEvidence } from './news/newsModel';

export function sentenceSourceHref(sentence: ArchiveSentenceResponse, articles: NewsArticle[], letters: IssueLetter[]) {
  const letter = letters.find((item) => item.slug === sentence.article_id);
  if (letter) return `/letter/${encodeURIComponent(letter.slug)}`;
  return articles.find((item) => item.id === sentence.article_id)?.href ?? `/lens/${encodeURIComponent(sentence.article_id)}`;
}

export function relatedSentenceNews(sentence: ArchiveSentenceResponse, articles: NewsArticle[], evidence: NewsEvidence[], archivedIds: string[]) {
  const profile = buildNewsProfile([], [sentence], articles.flatMap((item) => item.keywords));
  return recommendNews(articles, evidence, profile, [], archivedIds)
    .filter((item) => item.reasons.some((reason) => reason.type === 'sentence')).slice(0, 3);
}
