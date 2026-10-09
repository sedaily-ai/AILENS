import { describe, expect, it } from 'vitest';
import type { CmsLens } from '@/shared/lib/api/cmsPostsApi';
import { buildLensVideoObject } from './lensVideoObject';

const opts = { url: 'https://x.test/a', headline: '제목', published: '2026-10-09T07:00:00+09:00', fallbackThumbnail: 'https://x.test/og.png' };
const lens = (lenses: unknown[]) => ({ context: '요약', lenses }) as unknown as CmsLens;

describe('buildLensVideoObject', () => {
  it('영상 형식이 없으면 null', () => {
    expect(buildLensVideoObject(lens([{ label: '레터' }]), opts)).toBeNull();
  });
  it('video_url이 비어 있으면 null', () => {
    expect(buildLensVideoObject(lens([{ label: '영상', video_url: '' }]), opts)).toBeNull();
  });
  it('video_url이 있으면 contentUrl과 대체 썸네일로 만든다', () => {
    const v = buildLensVideoObject(lens([{ label: '영상', video_url: 'https://s3.test/a.mp4' }]), opts);
    expect(v).toMatchObject({ '@type': 'VideoObject', '@id': 'https://x.test/a#video', contentUrl: 'https://s3.test/a.mp4', thumbnailUrl: 'https://x.test/og.png' });
  });
});
