import { describe, expect, it } from 'vitest';
import { appendReadingSignal, parseReadingSignals, readingSignalKey, type ReadingSignal } from './readingSignals';

const signal: ReadingSignal = { id: 'a', kind: 'news', title: '기사', categories: ['산업'], keywords: ['반도체'], seenAt: '2026-10-14T00:00:00Z' };
describe('개인화의 브라우저 열람 신호', () => {
  it('계정/비로그인 저장 위치를 분리한다', () => {
    expect(new Set(['browser', 'account:a', 'account:b'].map(readingSignalKey)).size).toBe(3);
  });
  it('반복 열기와 포맷 변경으로 같은 콘텐츠 수가 늘지 않는다', () => {
    expect(appendReadingSignal([signal], { ...signal, seenAt: '2026-10-14T02:00:00Z' })).toHaveLength(1);
    expect(appendReadingSignal([signal], { ...signal, kind: 'letter' })).toHaveLength(2);
  });
  it('손상된/90일 이전/미래/다른 타입의 기록을 버린다', () => {
    const now = Date.parse('2026-10-14T03:00:00Z');
    expect(parseReadingSignals('{', now)).toEqual([]);
    const records = [signal, { ...signal, seenAt: '2026-01-01' }, { ...signal, seenAt: '2027-01-01' }, { ...signal, keywords: [42] }];
    expect(parseReadingSignals(JSON.stringify(records), now)).toEqual([signal]);
  });
});
