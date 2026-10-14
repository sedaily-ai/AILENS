import { describe, expect, it } from 'vitest';
import { lensFormatFor, lensPerspectiveFor } from './lensPerspectives';
import { formatAmount } from '@/app/(economy)/_shared/components/format/lensSamples';
import type { CmsLens } from '@/shared/lib/api/cmsPostsApi';

describe('실제 제공 형식의 소비', () => {
  it('중간 형식이 생략되어도 영상·듣기의 이름과 분량을 유지한다', () => {
    for (const format of ['video', 'podcast'] as const) {
      const item = { format, label: '옛 표시 이름', question: '', bullets: [], video_url: '/local.mp4', media_url: '/local.mp3' };
      expect(lensFormatFor(item, 1)).toBe(format);
      expect(lensPerspectiveFor(item, 1).short).toBe(format === 'video' ? '영상' : '팟캐스트');
      const lens: CmsLens = { id: 'partial', is_cms: true, editor_id: '', headline: '', context: '', date: '', cover_image_url: null, source_url: null, lenses: [{ format: 'letter', label: '레터', question: '', bullets: ['본문'] }, item] };
      expect(formatAmount(lens, 1, 90).text).toBe('1:30');
    }
  });
  it('웹툰만 있는 기사와 이전 응답을 호환한다', () => {
    expect(lensFormatFor({ format: 'webtoon' }, 0)).toBe('webtoon');
    expect(lensPerspectiveFor({ format: 'webtoon' }, 0).short).toBe('웹툰');
    expect(lensFormatFor({ label: '팟캐스트' }, 1)).toBe('podcast');
    expect(lensFormatFor(undefined, 2)).toBe('podcast');
  });
});
