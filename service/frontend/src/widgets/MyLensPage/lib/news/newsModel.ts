import { categoryForDataLabel, ECON_CATEGORIES } from '@ailens/domain';

export type NewsArticle = { id: string; title: string; context: string; date: string; category: string; keywords: string[]; href: string };
export type NewsReason = { type: 'category' | 'sentence'; text: string };
export type NewsRecommendation = NewsArticle & { reasons: NewsReason[] };

export function normalizeCategory(value: string) { return ECON_CATEGORIES.find((item) => item.slug === value) ?? categoryForDataLabel(value); }
