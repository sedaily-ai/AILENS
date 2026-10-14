import { categoryForDataLabel, ECON_CATEGORIES, lensPath } from '@ailens/domain';
import type { ReadingSignal } from '@/entities/user';
import type { IssueLetter } from '@/features/letter';

export type NewsArticle = { id: string; title: string; context: string; date: string; category: string; keywords: string[]; href: string };
export type NewsEvidence = Pick<ReadingSignal, 'id' | 'kind' | 'title' | 'categories' | 'keywords'>;
export type NewsReason = { type: 'category' | 'keyword' | 'sentence'; text: string };
export type NewsRecommendation = NewsArticle & { reasons: NewsReason[]; score: number };
export type NewsFilter = 'all' | NewsReason['type'];
const normalize = (value: string) => value.normalize('NFKC').toLowerCase().trim();
const STOPWORDS = new Set('그리고 그러나 하지만 또는 있다 없다 된다 하는 대한 위해 통해 것이 것을 것은 에서 이런 같은 우리 이번 오늘 관련 있는 없는 한다 입니다 했어요 있어요 있어 있다 내일 뉴스 기사 경제'.split(' '));

export function normalizeCategory(value: string) { return ECON_CATEGORIES.find((item) => item.slug === value) ?? categoryForDataLabel(value); }

export function parseNewsArticles(raw: unknown): NewsArticle[] {
  if (!raw || typeof raw !== 'object' || !('posts' in raw) || !Array.isArray(raw.posts)) return [];
  const articles: NewsArticle[] = [];
  for (const item of raw.posts.slice(0, 100)) {
    if (!item || typeof item !== 'object') continue;
    const x = item as Record<string, unknown>;
    if (typeof x.id !== 'string' || !x.id || typeof x.headline !== 'string' || typeof x.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(x.date) || !Number.isFinite(Date.parse(x.date))) continue;
    const keywords = Array.isArray(x.lenses) ? x.lenses.flatMap((lens) => {
      if (!lens || typeof lens !== 'object' || !('keywords' in lens) || !Array.isArray(lens.keywords)) return [];
      return lens.keywords.flatMap((word: unknown) => word && typeof word === 'object' && 'term' in word && typeof word.term === 'string' ? [word.term] : []);
    }) : [];
    const category = typeof x.category === 'string' ? x.category : '';
    articles.push({ id: x.id, title: x.headline, context: typeof x.context === 'string' ? x.context : '', date: x.date, category, keywords: [...new Set(keywords)], href: lensPath({ id: x.id, date: x.date, category }) });
  }
  return [...new Map(articles.map((item) => [item.id, item])).values()];
}

export function mergeNewsEvidence(records: NewsEvidence[], letters: IssueLetter[], readSlugs: string[]): NewsEvidence[] {
  const merged = new Map<string, NewsEvidence>();
  for (const letter of letters.filter((item) => readSlugs.includes(item.slug))) merged.set(`letter:${letter.slug}`, { id: letter.slug, kind: 'letter', title: letter.title, categories: letter.categories, keywords: letter.topics ?? [] });
  for (const item of records) merged.set(`${item.kind}:${item.id}`, item);
  return [...merged.values()];
}

export function buildNewsProfile(evidence: NewsEvidence[], sentences: { text: string }[], dictionary: string[]) {
  const categories = new Map<string, { slug: string; label: string; count: number }>();
  const keywords = new Map<string, { label: string; count: number }>();
  for (const item of evidence) {
    for (const slug of new Set(item.categories.flatMap((name) => { const category = normalizeCategory(name); return category ? [category.slug] : []; }))) {
      const category = ECON_CATEGORIES.find((c) => c.slug === slug)!;
      const old = categories.get(slug);
      categories.set(slug, { slug, label: category.label, count: (old?.count ?? 0) + 1 });
    }
    for (const key of new Set(item.keywords.map(normalize).filter((value) => value.length >= 2 && value.length <= 40 && !STOPWORDS.has(value)))) {
      const old = keywords.get(key);
      keywords.set(key, { label: key, count: (old?.count ?? 0) + 1 });
    }
  }
  const sentenceText = normalize(sentences.map((item) => item.text).join(' '));
  const known = [...new Set([...dictionary, ...keywords.keys()].map(normalize))].filter((term) => term.length >= 2 && term.length <= 40 && !STOPWORDS.has(term) && sentenceText.includes(term));
  const tokens = sentenceText.replace(/[^a-z0-9가-힣\s]/g, ' ').split(/\s+/).map((word) => word.replace(/(?:에서는|으로는|에서|으로|에는|은|는|이|가|을|를|의|와|과)$/, '')).filter((word) => word.length >= 2 && word.length <= 30 && !STOPWORDS.has(word));
  const frequencies = new Map<string, number>();
  for (const word of tokens) frequencies.set(word, (frequencies.get(word) ?? 0) + 1);
  const sentenceTerms = [...new Set([...known, ...[...frequencies].sort((a, b) => b[1] - a[1]).map(([key]) => key)])].slice(0, 8);
  return { categories: [...categories.values()].sort((a, b) => b.count - a.count).slice(0, 5), keywords: [...keywords.values()].sort((a, b) => b.count - a.count).slice(0, 8), sentenceTerms };
}

export function recommendNews(articles: NewsArticle[], evidence: NewsEvidence[], profile: ReturnType<typeof buildNewsProfile>, selectedCategories: string[], archivedIds: string[], selectedTopics: string[] = []) {
  const read = new Set(evidence.filter((item) => item.kind === 'news').map((item) => item.id));
  const archived = new Set(archivedIds);
  return articles.filter((article) => !read.has(article.id) && !archived.has(article.id)).map((article): NewsRecommendation => {
    const reasons: NewsReason[] = [];
    const category = normalizeCategory(article.category);
    const observed = profile.categories.find((item) => item.slug === category?.slug);
    const text = normalize(`${article.title} ${article.context} ${article.keywords.join(' ')}`);
    const keyword = profile.keywords.find((item) => text.includes(normalize(item.label)));
    const selectedTopic = selectedTopics.find((term) => term.trim().length >= 2 && text.includes(normalize(term)));
    const sentence = profile.sentenceTerms.find((term) => text.includes(term));
    if (observed) reasons.push({ type: 'category', text: `${observed.count >= 2 ? '자주 열람한' : '열람한'} ‘${observed.label}’ 분야의 새 글` });
    else if (category && selectedCategories.includes(category.slug)) reasons.push({ type: 'category', text: `직접 선택한 ‘${category.label}’ 분야` });
    if (keyword) reasons.push({ type: 'keyword', text: `${keyword.count >= 2 ? '여러 글에서 접한' : '열람한 글의'} 키워드 ‘${keyword.label}’ 포함` });
    else if (selectedTopic) reasons.push({ type: 'keyword', text: `직접 선택한 주제 ‘${selectedTopic}’ 포함` });
    if (sentence) reasons.push({ type: 'sentence', text: `저장 문장의 단어 ‘${sentence}’ 포함` });
    return { ...article, reasons, score: reasons.reduce((sum, reason) => sum + (reason.type === 'sentence' ? 4 : reason.type === 'keyword' ? 3 : 2), 0) };
  }).sort((a, b) => b.score - a.score || b.date.localeCompare(a.date));
}
