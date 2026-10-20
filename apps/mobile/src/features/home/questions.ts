// 홈 "에디터 추천 질문 → 풀이" 로직(네트워크·UI 없음, 외부 값 import 없음 — 순수 함수라 단독 검증이 된다).
// 재료는 기사(LensPost)의 형식별 항목이다: 웹툰 항목의 question 이 실제 "왜/어떻게" 질문이고, 레터 항목의 bullets·keywords 가 풀이 근거다.
// 질문이 질문처럼 보이지 않는 기사(레터·팟캐스트·영상의 question 은 제목과 같다)는 칩에서 제외한다.

export interface LensItemLike {
  label: string;
  question?: string;
  bullets?: string[];
  keywords?: Array<{ term: string; explain: string }>;
}
export interface LensPostLike {
  id: string;
  headline: string;
  category?: string | null;
  date?: string;
  published_at?: string | null;
  lenses: LensItemLike[];
}

/** 풀이 카드 하단 "이어지는 질문" — 같은 기사를 다른 형식으로 보기. index 는 기사 화면의 형식 순서(레터 0·웹툰 1·팟캐스트 2·영상 3). */
export interface FollowUp {
  index: number;
  label: string;
  /** "웹툰으로 볼까요?" 같은 칩 문구. */
  text: string;
}

export interface QA {
  id: string;
  headline: string;
  category: string | null;
  question: string;
  /** 핵심 정리(레터 항목의 bullets, 최대 4). */
  points: string[];
  /** 더 자세히(웹툰 항목의 bullets). */
  detail: string[];
  terms: Array<{ term: string; explain: string }>;
  followUps: FollowUp[];
}

const Q_WORD = /(왜|어떻게|무엇|무슨|어떤|어디|누가|얼마)/;
const TRAIL = /[\s\p{Extended_Pictographic}️]+$/u;

/** 질문처럼 생긴 문장인지. 제목형 문장("…갔거든요 🚧", "…짜다")은 걸러낸다. */
export function isQuestion(text: string | undefined | null): boolean {
  if (!text) return false;
  const s = text.trim().replace(TRAIL, '');
  if (s.length < 8) return false;
  return Q_WORD.test(s) || /[나까]\??$/.test(s) || s.endsWith('?');
}

/** 칩에 쓸 문구: 끝에 물음표가 없으면 붙인다. */
export function asQuestion(text: string): string {
  const s = text.trim().replace(TRAIL, '');
  return /[?？]$/.test(s) ? s : `${s}?`;
}

const FOLLOW: Array<{ label: string; index: number; text: string }> = [
  { label: '웹툰', index: 1, text: '웹툰으로 볼까요?' },
  { label: '팟캐스트', index: 2, text: '귀로 들어 볼까요?' },
  { label: '영상', index: 3, text: '영상으로 볼까요?' },
];

/** 기사 하나를 질문-풀이 한 쌍으로. 질문이나 핵심 정리가 없으면 null(칩에서 제외). */
export function buildQA(post: LensPostLike): QA | null {
  const webtoon = post.lenses.find((l) => l.label === '웹툰');
  const letter = post.lenses.find((l) => l.label === '레터');
  const q = webtoon?.question;
  if (!isQuestion(q)) return null;
  const points = (letter?.bullets ?? []).filter(Boolean).slice(0, 4);
  const detail = (webtoon?.bullets ?? []).filter(Boolean);
  // 풀이로 쓸 문장이 하나도 없으면 칩만 있고 답이 없는 꼴이라 제외한다.
  if (points.length === 0 && detail.length === 0) return null;
  const have = new Set(post.lenses.map((l) => l.label));
  return {
    id: post.id,
    headline: post.headline,
    category: post.category ?? null,
    question: asQuestion(q as string),
    points: points.length > 0 ? points : detail.slice(0, 4),
    detail: points.length > 0 ? detail : [],
    terms: (letter?.keywords ?? []).slice(0, 2),
    followUps: FOLLOW.filter((f) => have.has(f.label)),
  };
}

export interface PickContext {
  /** 관심 분야 slug 목록. */
  interests: string[];
  /** 내 에디터가 맡는 분야 slug 와 담당 주제어. */
  editorSlugs: string[];
  editorTopics: string[];
  /** 이미 읽은 기사 id(풀이를 본 기사 포함)는 뒤로 미룬다(제외하지 않고 감점). */
  readIds: Set<string>;
  /** 카테고리 라벨 → slug. */
  slugOf: (category: string | null | undefined) => string | null;
  count: number;
}

/**
 * 오늘의 추천 질문. 점수: 에디터 분야 +3.5, 에디터 주제어 +2.5, 관심 분야 +3, 최신 순서 가점(앞 글일수록), 읽은 글 -4.
 * 같은 분야가 한 번씩 먼저 나오도록 고른 뒤 모자라면 채운다.
 */
export function pickQuestions(posts: LensPostLike[], ctx: PickContext): Array<QA & { reason: 'editor' | 'interest' | 'latest' }> {
  const scored: Array<{ qa: QA; slug: string | null; score: number; reason: 'editor' | 'interest' | 'latest' }> = [];
  posts.forEach((p, i) => {
    const qa = buildQA(p);
    if (!qa) return;
    const slug = ctx.slugOf(p.category);
    const text = `${p.headline} ${qa.points.join(' ')}`;
    let score = Math.max(0, 3 - i * 0.1);
    let reason: 'editor' | 'interest' | 'latest' = 'latest';
    if (slug && ctx.editorSlugs.includes(slug)) {
      score += 3.5;
      reason = 'editor';
    } else if (ctx.editorTopics.some((t) => t && text.includes(t))) {
      score += 2.5;
      reason = 'editor';
    }
    if (slug && ctx.interests.includes(slug)) {
      score += 3;
      if (reason === 'latest') reason = 'interest';
    }
    if (ctx.readIds.has(p.id)) score -= 4;
    scored.push({ qa, slug, score, reason });
  });
  scored.sort((a, b) => b.score - a.score);
  const out: typeof scored = [];
  const used = new Set<string>();
  for (const s of scored) {
    if (out.length >= ctx.count) break;
    if (s.slug && used.has(s.slug)) continue;
    out.push(s);
    if (s.slug) used.add(s.slug);
  }
  for (const s of scored) {
    if (out.length >= ctx.count) break;
    if (!out.includes(s)) out.push(s);
  }
  return out.map((s) => ({ ...s.qa, reason: s.reason }));
}
