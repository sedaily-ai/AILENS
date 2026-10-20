// 오늘의 브리핑 선정 로직(네트워크·UI 없음). 규칙 기반 개인화: 관심 분야, 읽은 글, 오늘 지면의 비중을 점수로 합친다.
// 서버 추천 API 가 생기면 이 파일의 pickBriefing 만 바꿔 끼우면 된다.
import type { LensPost } from '@ailens/api-client';
import { categoryForDataLabel, displayHeadline, ECON_CATEGORIES } from '@ailens/domain';
import type { LetterEditor } from '@ailens/domain';
import { PAPER_TABS, pickPaperSection, type FeedItem } from './model';
import { categoriesOf } from './myEditor';

export interface BriefingPick {
  id: string;
  title: string;
  excerpt: string;
  category?: string | null;
  imageUrl?: string | null;
  /** "왜 이 글인가" 한 줄. 에이전트가 고른 이유를 보여 준다. */
  reason: string;
}

export const BRIEFING_SIZE = 3;

interface Candidate extends BriefingPick {
  score: number;
  slug: string | null;
}

const fromLens = (l: LensPost, score: number, reason: string): Candidate => ({
  id: l.id,
  title: displayHeadline(l.headline),
  excerpt: l.context ?? '',
  category: l.category,
  imageUrl: l.photo_image_url,
  reason,
  score,
  slug: categoryForDataLabel(l.category)?.slug ?? null,
});

const fromFeed = (i: FeedItem, score: number, reason: string): Candidate => ({
  id: i.id,
  title: i.title,
  excerpt: i.excerpt,
  category: i.category,
  imageUrl: i.imageUrl,
  reason,
  score,
  slug: categoryForDataLabel(i.category)?.slug ?? null,
});

const labelOf = (slug: string) => ECON_CATEGORIES.find((c) => c.slug === slug)?.label ?? slug;

/**
 * 오늘 챙길 3가지. 점수: 관심 분야 일치 +3, 오늘 지면 1면 +2.5, 다른 코너 1면 +1.5, 최신 글 +0.5(최신일수록 약간 더).
 * 이미 읽은 글과 excludeIds(홈의 지면 카드가 이미 크게 보여 주는 기사)는 뺀다. 같은 분야가 겹치지 않게 분야별로 하나씩 고른 뒤 모자라면 채운다.
 */
export function pickBriefing(lens: LensPost[], latest: FeedItem[], interests: string[], readIds: Set<string>, excludeIds: Set<string> = new Set(), size: number = BRIEFING_SIZE, editor?: LetterEditor | null): BriefingPick[] {
  const pool = new Map<string, Candidate>();
  const put = (c: Candidate) => {
    if (readIds.has(c.id) || excludeIds.has(c.id)) return;
    const prev = pool.get(c.id);
    if (!prev || c.score > prev.score) pool.set(c.id, c);
  };

  PAPER_TABS.forEach((t) => {
    const hero = pickPaperSection(lens, t.paperSection)[0];
    if (hero) put(fromLens(hero, t.key === 'all' ? 2.5 : 1.5, t.key === 'all' ? '오늘 지면 1면이에요' : `오늘 ${t.label}이에요`));
  });
  latest.slice(0, 30).forEach((i, idx) => put(fromFeed(i, 0.5 + (30 - idx) / 100, '방금 올라온 소식이에요')));

  // 가점과 이유 문구. 내 에디터가 맡는 분야(+3.5)나 담당 주제어가 제목에 있으면(+2.5) 에디터의 시선으로, 관심 분야(+3)면 관심 분야로 골랐다고 알려 준다.
  const edSlugs = editor ? categoriesOf(editor.id) : [];
  const edTopics = editor ? editor.topics.map((t) => t.name) : [];
  const scored = [...pool.values()].map((c) => {
    const inEditorCat = !!c.slug && edSlugs.includes(c.slug);
    const inEditorTopic = !!editor && edTopics.some((t) => c.title.includes(t) || c.excerpt.includes(t));
    const inInterest = !!c.slug && interests.includes(c.slug);
    if (editor && (inEditorCat || inEditorTopic)) {
      return { ...c, score: c.score + (inEditorCat ? 3.5 : 2.5) + (inInterest ? 1 : 0), reason: `${editor.nickname} 에디터 시선으로 골랐어요` };
    }
    if (inInterest && c.slug) return { ...c, score: c.score + 3, reason: `관심 분야 '${labelOf(c.slug)}'라서 골랐어요` };
    return c;
  });
  scored.sort((a, b) => b.score - a.score);

  const picks: Candidate[] = [];
  const usedSlug = new Set<string>();
  for (const c of scored) {
    if (picks.length >= size) break;
    if (c.slug && usedSlug.has(c.slug)) continue;
    picks.push(c);
    if (c.slug) usedSlug.add(c.slug);
  }
  for (const c of scored) {
    if (picks.length >= size) break;
    if (!picks.includes(c)) picks.push(c);
  }
  return picks.map(({ score: _s, slug: _g, ...p }) => p);
}

/** 시간대별 인사. */
export function greeting(now: Date = new Date()): string {
  const h = now.getHours();
  if (h >= 5 && h < 11) return '좋은 아침이에요';
  if (h >= 11 && h < 17) return '좋은 오후예요';
  if (h >= 17 && h < 22) return '오늘 하루도 수고했어요';
  return '늦은 시간이네요';
}
