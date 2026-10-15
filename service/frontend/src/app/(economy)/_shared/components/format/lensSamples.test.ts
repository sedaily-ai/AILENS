import { describe, expect, it } from 'vitest';
import type { CmsLens } from '@/shared/lib/api/cmsPostsApi';
import { clock, spoken } from '@/shared/lib/media/mediaPlayerFormat';
import { formatAmount } from './lensSamples';

const lens = { id: 'duration-regression', lenses: [
  { format: 'video', video_url: '/test.mp4' },
  { format: 'podcast', media_url: '/test.mp3' },
] } as CmsLens;

describe('형식 탭과 플레이어의 실측 시간 일치', () => {
  it.each([29.888, 59.999, 60.001, 271.104])('소수 duration %s초를 공통 기준으로 표시한다', (seconds) => {
    for (const index of [0, 1]) {
      expect(formatAmount(lens, index, seconds)).toEqual({ text: clock(seconds), spoken: spoken(seconds) });
    }
  });

  it('29.888초를 30초로 올리거나 소수 초로 표시하지 않는다', () => {
    expect(formatAmount(lens, 0, 29.888)).toEqual({ text: '0:29', spoken: '29초' });
  });

  it.each([undefined, 0, -1, NaN, Infinity])('실측값 %s를 모르면 길이를 만들지 않는다', (seconds) => {
    expect(formatAmount(lens, 0, seconds)).toEqual({ text: '⋯', spoken: '길이 확인 중' });
  });
});
