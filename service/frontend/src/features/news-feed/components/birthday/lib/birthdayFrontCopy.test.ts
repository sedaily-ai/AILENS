import { expect, test } from 'vitest';
import type { FrontDayBasis, FrontPageData, FrontPageKind, FrontPageReason } from '@/shared/lib/api/timelineApi';
import { frontNotice, frontSourceNote } from './birthdayFrontPage';

// 그날 서울경제 장면의 지면 위 안내·지면 아래 출처 줄. 실제 지면이 아니라 보관본에서 고른 기사라서 '1면'이라고 부르지 않는다(2026-10-22).
const FRONT_WORD = '1면';
const plain = (text: string) => text.replaceAll('\u00a0', ' ');
const article = (coverage?: number) => ({ news_id: '1', title: '제목', content: '', byline: '', category: '', original_link: null, ...(coverage ? { coverage } : {}) });
const data = (over: Partial<FrontPageData>): FrontPageData =>
  ({ date: '2024-10-13', date_kind: 'front', shown_date: '2024-10-13', kind: 'front', reason: null, basis: null, articles: [article()], ...over });

test("지면 위 안내는 모든 kind·reason·생일 시기 조합에서 '1면'을 쓰지 않는다", () => {
  const kinds: FrontPageKind[] = ['front', 'day', 'none'];
  const reasons: (FrontPageReason | null)[] = [null, 'sunday', 'no_paper', 'not_yet', 'archive_missing'];
  const bases: (FrontDayBasis | null)[] = [null, 'issue', 'no_ranking', 'no_match', 'ranking_failed'];
  let notices = 0;
  for (const kind of kinds) for (const reason of reasons) for (const dateKind of ['front', 'day'] as const) for (const basis of bases) {
    for (const shown of kind === 'none' ? [null] : ['2024-10-13', '2024-10-12']) {
      const note = frontNotice(data({ kind, reason, date_kind: dateKind, basis: kind === 'day' ? basis : null, shown_date: shown }));
      if (!note) continue;
      notices++;
      expect(note.title).not.toContain(FRONT_WORD);
      for (const line of note.lines) expect(line).not.toContain(FRONT_WORD);
      expect(note.lines.join(' ')).not.toContain('면 번호');
    }
  }
  // 생일과 다른 날짜를 보여 줄 때(kind front·day)만 안내가 있다.
  expect(notices).toBeGreaterThan(0);
});

test('지면 아래 출처 줄 — 보관본에서 고른 기사이고 실제 지면이 아니라고 밝힌 뒤, 고른 기준을 적는다', () => {
  const picked = '빅카인즈 보관본에서 고른 그날 서울경제 기사예요. 실제 지면을 옮긴 것이 아니에요.';
  const longest = `${picked} 기사는 본문이 긴 순서로, 사진 설명은 맨 뒤에 보여 줘요.`;
  expect(plain(frontSourceNote(data({})))).toBe(longest);
  // 찾는 중·오류·안내(자료 없음)와 보관본에 없는 날(kind none)은 보여 주는 기사가 없어 이 문장을 쓰지 않는다.
  expect(frontSourceNote(null)).toBe('');
  expect(frontSourceNote(data({ kind: 'none', shown_date: null, reason: 'archive_missing', articles: [] }))).toBe('');
  const issue = data({ date_kind: 'day', kind: 'day', basis: 'issue', articles: [article(97), article(40)] });
  expect(plain(frontSourceNote(issue))).toBe(`${picked} 그날 여러 언론이 가장 많이 다룬 소식을 보여 줘요.`);
  // 이슈로 고르지 못해 본문이 긴 기사로 채운 칸이 있으면 그 사실을 덧붙인다.
  expect(plain(frontSourceNote({ ...issue, articles: [article(97), article()] })))
    .toBe(`${picked} 그날 여러 언론이 가장 많이 다룬 소식을 보여 줘요. 이슈로 고르지 못한 칸은 본문이 긴 기사로 채워요.`);
  for (const basis of ['no_ranking', 'no_match', 'ranking_failed'] as const) {
    expect(plain(frontSourceNote(data({ date_kind: 'day', kind: 'day', basis })))).toBe(longest);
  }
  for (const kind of ['front', 'day', 'none'] as const) for (const basis of [null, 'issue', 'no_ranking', 'no_match', 'ranking_failed'] as const) {
    const note = frontSourceNote(data({ kind, basis }));
    expect(note).not.toContain(FRONT_WORD);
    expect(note).not.toContain('면 번호');
  }
});
