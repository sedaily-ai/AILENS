import { describe, expect, it, vi } from 'vitest';
import type { CmsLens } from '@/shared/lib/api/cmsPostsApi';
const { findLens, redirect, missing } = vi.hoisted(() => ({
  findLens: vi.fn(),
  redirect: vi.fn((url: string) => { throw new Error(`redirect:${url}`); }),
  missing: vi.fn(() => { throw new Error('not-found'); }),
}));
vi.mock('next/navigation', () => ({ permanentRedirect: redirect, notFound: missing }));
vi.mock('@/shared/lib/seo/lens/lensCanonical', () => ({ findLensForChannelSlug: findLens }));
import { redirectToLensArticle } from './redirectToLensArticle';
const lens = { id: 'sample', date: '2026-10-15', category: '산업', lenses: [
  { format: 'letter', label: '레터' }, { format: 'webtoon', label: '웹툰' },
  { format: 'podcast', label: '팟캐스트' }, { format: 'video', label: '영상' },
] } as CmsLens;
describe('channel alias preserves the requested format', () => {
  it.each([['webtoon', 2], ['podcast', 3], ['video', 4]] as const)('%s selects its panel', async (format, index) => {
    findLens.mockResolvedValue(lens);
    await expect(redirectToLensArticle('sample', format)).rejects.toThrow(`?v=${index}`);
  });
  it('uses actual rendition position when formats are missing', async () => {
    findLens.mockResolvedValue({ ...lens, lenses: [lens.lenses[0], lens.lenses[3]] });
    await expect(redirectToLensArticle('sample', 'video')).rejects.toThrow('?v=2');
  });
  it('preserves reading aliases and gracefully falls back for an absent format', async () => {
    findLens.mockResolvedValue({ ...lens, lenses: [lens.lenses[0]] });
    await expect(redirectToLensArticle('sample')).rejects.toThrow('redirect:/industry/2026/10/15/sample');
    await expect(redirectToLensArticle('sample', 'video')).rejects.toThrow('redirect:/industry/2026/10/15/sample');
    expect(redirect.mock.lastCall?.[0]).not.toContain('?');
  });
  it('returns a real missing page for an unknown article', async () => {
    findLens.mockResolvedValue(null);
    await expect(redirectToLensArticle('unknown', 'video')).rejects.toThrow('not-found');
  });
});
