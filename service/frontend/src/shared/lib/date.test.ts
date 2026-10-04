import { afterEach, describe, expect, it, vi } from 'vitest';
import { clampModifiedIso, kstDateTimeLabel, kstTodayStr } from './date';

afterEach(() => vi.useRealTimers());

describe('date', () => {
  it('kstTodayStr: UTC 15시 이후는 KST 다음 날', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-03T15:30:00Z'));
    expect(kstTodayStr()).toBe('2026-10-04');
  });
  it('clampModifiedIso: 없음·역전·미래·잘못된 값은 발행일', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-04T00:00:00Z'));
    const pub = '2026-10-01T00:00:00.000Z';
    expect(clampModifiedIso(null, pub)).toBe(pub);
    expect(clampModifiedIso('2026-09-30T00:00:00Z', pub)).toBe(pub);
    expect(clampModifiedIso('2026-12-01T00:00:00Z', pub)).toBe(pub);
    expect(clampModifiedIso('nope', pub)).toBe(pub);
    expect(clampModifiedIso('2026-10-02T00:00:00Z', pub)).toBe('2026-10-02T00:00:00.000Z');
  });
  it('kstDateTimeLabel: null 처리', () => {
    expect(kstDateTimeLabel(null)).toBeNull();
    expect(kstDateTimeLabel('bad')).toBeNull();
  });
});
