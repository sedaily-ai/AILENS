import { afterEach, describe, expect, it, vi } from 'vitest';
import { isShareableSize, parseImageSize, resolveShareImages } from './shareImage';

const bytes = (...n: number[]) => Uint8Array.from(n);
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

function png(w: number, h: number): Uint8Array {
  const d = new Uint8Array(33);
  d.set([0x89, ...ascii('PNG'), 0x0d, 0x0a, 0x1a, 0x0a], 0);
  d.set(bytes(0, 0, 0, 13, ...ascii('IHDR')), 8);
  d.set(bytes((w >>> 24) & 255, (w >>> 16) & 255, (w >>> 8) & 255, w & 255), 16);
  d.set(bytes((h >>> 24) & 255, (h >>> 16) & 255, (h >>> 8) & 255, h & 255), 20);
  return d;
}

function jpeg(w: number, h: number): Uint8Array {
  // SOI + APP0(길이 16) + SOF0
  const app0 = [0xff, 0xe0, 0x00, 0x10, ...new Array(14).fill(0)];
  const sof = [0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1];
  return bytes(0xff, 0xd8, ...app0, ...sof);
}

function webpHeader(fourcc: string): Uint8Array {
  const d = new Uint8Array(40);
  d.set(ascii('RIFF'), 0);
  d.set(ascii('WEBP'), 8);
  d.set(ascii(fourcc), 12);
  return d;
}

describe('parseImageSize', () => {
  it('PNG', () => expect(parseImageSize(png(1200, 630))).toEqual({ width: 1200, height: 630 }));

  it('JPEG — APP0 세그먼트를 건너뛰고 SOF에서 읽는다', () => {
    expect(parseImageSize(jpeg(386, 93))).toEqual({ width: 386, height: 93 });
  });

  it('WebP 확장(VP8X)', () => {
    const d = webpHeader('VP8X');
    const [w, h] = [1824 - 1, 1752 - 1];
    d.set(bytes(w & 255, (w >> 8) & 255, (w >> 16) & 255, h & 255, (h >> 8) & 255, (h >> 16) & 255), 24);
    expect(parseImageSize(d)).toEqual({ width: 1824, height: 1752 });
  });

  it('WebP 손실(VP8)', () => {
    const d = webpHeader('VP8 ');
    d.set(bytes(960 & 255, 960 >> 8, 960 & 255, 960 >> 8), 26);
    expect(parseImageSize(d)).toEqual({ width: 960, height: 960 });
  });

  it('WebP 무손실(VP8L)', () => {
    const d = webpHeader('VP8L');
    const v = (1500 - 1) | ((900 - 1) << 14);
    d.set(bytes(v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255), 21);
    expect(parseImageSize(d)).toEqual({ width: 1500, height: 900 });
  });

  it('모르는 형식·짧은 데이터는 null', () => {
    expect(parseImageSize(bytes(1, 2, 3))).toBeNull();
    expect(parseImageSize(new Uint8Array(40))).toBeNull();
  });
});

describe('isShareableSize', () => {
  it('폭 1200 이상이고 가로세로비 3 이하만 통과', () => {
    expect(isShareableSize({ width: 1200, height: 630 })).toBe(true);
    expect(isShareableSize({ width: 1824, height: 1752 })).toBe(true);
    expect(isShareableSize({ width: 1199, height: 800 })).toBe(false);
    expect(isShareableSize({ width: 386, height: 93 })).toBe(false);
    expect(isShareableSize({ width: 1500, height: 400 })).toBe(false); // 배너형
  });
});

describe('resolveShareImages', () => {
  afterEach(() => vi.unstubAllGlobals());

  const stubFetch = (map: Record<string, Uint8Array | 'fail'>) =>
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const body = map[url];
        if (!body || body === 'fail') throw new Error('network');
        return new Response(body as BodyInit, { status: 206 });
      }),
    );

  it('작은 본지 사진을 건너뛰고 조건을 채우는 다음 후보를 고른다', async () => {
    stubFetch({ 'https://x/photo-small.jpg': jpeg(386, 93), 'https://x/cut.png': png(1800, 1200) });
    const r = await resolveShareImages(['https://x/photo-small.jpg', 'https://x/cut.png']);
    expect(r.primary).toEqual({ url: 'https://x/cut.png', width: 1800, height: 1200 });
    expect(r.all).toEqual(['https://x/cut.png']);
    expect(r.isDefault).toBe(false);
  });

  it('큰 본지 사진이 1순위면 그대로 쓴다', async () => {
    stubFetch({ 'https://x/photo-big.jpg': jpeg(1200, 800), 'https://x/cut2.png': png(1800, 1200) });
    const r = await resolveShareImages(['https://x/photo-big.jpg', 'https://x/cut2.png']);
    expect(r.primary.url).toBe('https://x/photo-big.jpg');
    expect(r.all).toEqual(['https://x/photo-big.jpg', 'https://x/cut2.png']);
  });

  it('전부 미달이면 /og-image.png(1200×630)로 폴백', async () => {
    stubFetch({ 'https://x/a.jpg': jpeg(400, 149), 'https://x/b.jpg': jpeg(600, 340) });
    const r = await resolveShareImages(['https://x/a.jpg', 'https://x/b.jpg']);
    expect(r.primary.url).toMatch(/\/og-image\.png$/);
    expect(r.primary).toMatchObject({ width: 1200, height: 630 });
    expect(r.isDefault).toBe(true);
  });

  it('측정 실패는 기존 동작(첫 후보)으로 폴백', async () => {
    stubFetch({ 'https://x/unreachable.jpg': 'fail' });
    const r = await resolveShareImages(['https://x/unreachable.jpg']);
    expect(r.primary).toEqual({ url: 'https://x/unreachable.jpg' });
    expect(r.isDefault).toBe(false);
  });

  it('후보가 없으면 폴백', async () => {
    const r = await resolveShareImages([]);
    expect(r.isDefault).toBe(true);
  });
});
