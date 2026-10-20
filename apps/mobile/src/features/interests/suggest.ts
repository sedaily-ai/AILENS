// 관심 담기의 검색·추천(순수 함수 — 저장소·React·네트워크 없음).
// 분야·섹터·화두를 사용자에게는 "주제" 하나로 보여 주기 위해 한 목록(Entry)으로 평탄화해서 다룬다.
import { keyOf, needlesOf, type Interest } from './match';

export interface Entry {
  it: Interest;
  /** 소속 분야 slug(분야 항목은 자기 자신). 모르면 null. */
  cat: string | null;
  /** 칩 아래에 보여 줄 소속 이름("시그널"). 분야 항목은 "분야". */
  catLabel: string;
}

const norm = (s: string) => s.toLowerCase().replace(/[\s·.]/g, '');

/** 검색: 이름이 검색어로 시작 > 이름에 포함 > 별칭에 포함 순. 같으면 분야 < 섹터 < 화두가 아니라 가나다순. */
export function searchEntries(entries: Entry[], q: string, limit = 24): Entry[] {
  const nq = norm(q);
  if (!nq) return [];
  const scored: Array<{ e: Entry; s: number }> = [];
  for (const e of entries) {
    const name = norm(e.it.label);
    let s = 0;
    if (name.startsWith(nq)) s = 3;
    else if (name.includes(nq)) s = 2;
    else if (needlesOf(e.it.label).some((n) => norm(n).includes(nq))) s = 1;
    if (s > 0) scored.push({ e, s });
  }
  return scored
    .sort((a, b) => b.s - a.s || a.e.it.label.localeCompare(b.e.it.label, 'ko'))
    .slice(0, limit)
    .map((x) => x.e);
}

export interface SuggestContext {
  picked: Set<string>;
  /** keyOf(it) → 최근 24시간 새 소식 건수. */
  fresh: Map<string, number>;
  editorCats: string[];
  editorTopics: string[];
  /** 최근 읽은 글의 분야 slug(최근 순, 중복 가능). */
  readCats: string[];
  limit?: number;
  /** 한 분야에서 최대 몇 개까지 추천할지(다양성). */
  perCategory?: number;
}

/**
 * 추천 점수: 내 에디터 담당 주제 +3, 에디터 담당 분야 +1.5, 최근 읽은 분야 +2(많이 읽을수록 가산, 최대 +3), 새 소식 건수 +0.3/건(최대 +3).
 * 이미 담은 것·너무 넓은 분야 항목은 제외하고, 한 분야에 몰리지 않게 perCategory 만큼만 담는다.
 */
export function suggest(entries: Entry[], ctx: SuggestContext): Entry[] {
  const limit = ctx.limit ?? 8;
  const per = ctx.perCategory ?? 2;
  const readCount = new Map<string, number>();
  for (const c of ctx.readCats) readCount.set(c, (readCount.get(c) ?? 0) + 1);
  const scored = entries
    .filter((e) => e.it.type !== 'category' && !ctx.picked.has(keyOf(e.it)))
    .map((e) => {
      let s = 0;
      if (e.it.type === 'topic' && ctx.editorTopics.includes(e.it.label)) s += 3;
      if (e.cat && ctx.editorCats.includes(e.cat)) s += 1.5;
      if (e.cat) s += Math.min(3, (readCount.get(e.cat) ?? 0) * 1);
      s += Math.min(3, (ctx.fresh.get(keyOf(e.it)) ?? 0) * 0.3);
      return { e, s };
    })
    .filter((x) => (ctx.fresh.get(keyOf(x.e.it)) ?? 0) > 0)
    .sort((a, b) => b.s - a.s || a.e.it.label.localeCompare(b.e.it.label, 'ko'));
  const out: Entry[] = [];
  const used = new Map<string, number>();
  for (const { e } of scored) {
    if (out.length >= limit) break;
    const k = e.cat ?? '_';
    if ((used.get(k) ?? 0) >= per) continue;
    out.push(e);
    used.set(k, (used.get(k) ?? 0) + 1);
  }
  return out;
}
