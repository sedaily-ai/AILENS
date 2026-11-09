import { describe, expect, it } from 'vitest';
import { cachedArticleStatus } from './availabilityStatus';

describe('cachedArticleStatus', () => {
  it('확인된 1면과 그날 기사를 구분한다', () => {
    expect(cachedArticleStatus('1996-06-01', false, { bigkinds_front: 'available' })).toBe('front');
    expect(cachedArticleStatus('2010-06-01', false, { bigkinds_day: 'available' })).toBe('day');
    expect(cachedArticleStatus('2010-06-01', false, { naver_front: 'available' })).toBe('front');
  });
  it('대체 날짜를 정해야 하는 일요일과 미확인은 먼저 단정하지 않는다', () => {
    expect(cachedArticleStatus('2018-07-01', false, { bigkinds_front: 'available' })).toBe('loading');
    expect(cachedArticleStatus('2018-07-02', true, { bigkinds_front: 'available' })).toBe('loading');
    expect(cachedArticleStatus('2018-07-02', false, { bigkinds_front: 'unknown' })).toBe('loading');
  });
});
