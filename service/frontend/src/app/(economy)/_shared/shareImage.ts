import { SITE_URL } from '@/shared/constants/site';

// 검색·공유용 대표 이미지의 크기 검증. 본지 원문 사진은 배너·도표 크기(예: 386×93)가 섞여 있어
// 그대로 og:image로 내보내면 Discover·뉴스 카드 조건(폭 1200px 이상)을 못 채운다(2026-10-09 전수 측정: 2,556건 중 40%가 1200px 미만).
// 렌더 시점에 이미지 앞부분만 읽어 크기를 재고, 조건을 채우는 첫 후보를 고른다. 측정 실패는 기존 동작(첫 후보 그대로)으로 폴백한다.

export const SHARE_IMAGE_MIN_WIDTH = 1200;
export const SHARE_IMAGE_MAX_ASPECT = 3; // 가로세로비가 이보다 크면 카드에서 잘리는 배너형으로 본다.
const PROBE_BYTES = 262_144; // JPEG은 EXIF가 길면 크기 마커가 앞 64KB 밖에 있을 수 있다.
const PROBE_TIMEOUT_MS = 1_500;
const CACHE_LIMIT = 6_000;

export type ImageSize = { width: number; height: number };
export type ShareImage = { url: string; width?: number; height?: number };
export type ShareImages = { primary: ShareImage; all: string[]; isDefault: boolean };

const FALLBACK: ShareImage = { url: `${SITE_URL}/og-image.png`, width: 1200, height: 630 };

/** 이미지 파일 앞부분에서 크기를 읽는다. JPEG·PNG·WebP(VP8/VP8L/VP8X)만 지원하며 모르는 형식은 null. */
export function parseImageSize(d: Uint8Array): ImageSize | null {
  const u16be = (i: number) => (d[i] << 8) | d[i + 1];
  const u32be = (i: number) => ((d[i] << 24) | (d[i + 1] << 16) | (d[i + 2] << 8) | d[i + 3]) >>> 0;
  const ascii = (i: number, s: string) => [...s].every((c, k) => d[i + k] === c.charCodeAt(0));

  // PNG
  if (d.length >= 24 && d[0] === 0x89 && ascii(1, 'PNG')) {
    return { width: u32be(16), height: u32be(20) };
  }
  // WebP
  if (d.length >= 30 && ascii(0, 'RIFF') && ascii(8, 'WEBP')) {
    if (ascii(12, 'VP8X')) {
      return { width: 1 + (d[24] | (d[25] << 8) | (d[26] << 16)), height: 1 + (d[27] | (d[28] << 8) | (d[29] << 16)) };
    }
    if (ascii(12, 'VP8 ')) {
      return { width: (d[26] | (d[27] << 8)) & 0x3fff, height: (d[28] | (d[29] << 8)) & 0x3fff };
    }
    if (ascii(12, 'VP8L')) {
      const width = 1 + (((d[22] & 0x3f) << 8) | d[21]);
      const height = 1 + (((d[24] & 0x0f) << 10) | (d[23] << 2) | ((d[22] & 0xc0) >> 6));
      return { width, height };
    }
    return null;
  }
  // JPEG — SOF 마커(0xC0~0xCF 중 DHT·JPG·DAC 제외)까지 세그먼트를 건너뛴다.
  if (d.length >= 4 && d[0] === 0xff && d[1] === 0xd8) {
    let i = 2;
    while (i + 9 < d.length) {
      if (d[i] !== 0xff) {
        i += 1;
        continue;
      }
      const marker = d[i + 1];
      if (marker === 0xff) {
        i += 1;
        continue;
      }
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: u16be(i + 5), width: u16be(i + 7) };
      }
      i += 2 + u16be(i + 2);
    }
  }
  return null;
}

/** 공유 카드에 쓸 수 있는 크기인가. */
export function isShareableSize(size: ImageSize): boolean {
  return size.width >= SHARE_IMAGE_MIN_WIDTH && size.height > 0 && size.width / size.height <= SHARE_IMAGE_MAX_ASPECT;
}

// 같은 이미지를 generateMetadata와 페이지 본문이 각각 묻는다 — 진행 중인 요청까지 공유하도록 Promise를 캐시한다.
// 실패(null)는 캐시에서 빼서 다음 재검증(revalidate 300초) 때 다시 시도한다.
const sizeCache = new Map<string, Promise<ImageSize | null>>();

async function probeSize(url: string): Promise<ImageSize | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { Range: `bytes=0-${PROBE_BYTES - 1}` }, cache: 'no-store', signal: ctrl.signal });
    if (!res.ok || !res.body) return null;
    // Range를 무시하는 서버가 전체 파일을 보낼 수 있어 PROBE_BYTES까지만 읽고 끊는다.
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (total < PROBE_BYTES) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      chunks.push(value);
      total += value.length;
    }
    void reader.cancel().catch(() => undefined);
    const buf = new Uint8Array(Math.min(total, PROBE_BYTES));
    let off = 0;
    for (const c of chunks) {
      const part = c.subarray(0, Math.max(0, buf.length - off));
      buf.set(part, off);
      off += part.length;
    }
    return parseImageSize(buf);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function measure(url: string): Promise<ImageSize | null> {
  const hit = sizeCache.get(url);
  if (hit) return hit;
  if (sizeCache.size >= CACHE_LIMIT) sizeCache.clear();
  const p = probeSize(url).then((size) => {
    if (!size) sizeCache.delete(url);
    return size;
  });
  sizeCache.set(url, p);
  return p;
}

/**
 * 후보를 우선순위대로 훑어 조건(폭 1200px 이상, 가로세로비 3 이하)을 채우는 첫 이미지를 대표로 고른다.
 * 조건을 채우는 후보가 없으면 측정에 실패한 첫 후보(기존 동작), 그것도 없으면 /og-image.png(1200×630)를 쓴다.
 */
export async function resolveShareImages(candidates: string[]): Promise<ShareImages> {
  const urls = [...new Set(candidates.filter(Boolean))];
  const sizes = await Promise.all(urls.map((u) => measure(u)));
  const ok = urls.flatMap((url, i) => (sizes[i] && isShareableSize(sizes[i]!) ? [{ url, ...sizes[i]! }] : []));
  const unknown = urls.filter((_, i) => !sizes[i]);
  if (ok.length > 0) {
    return { primary: ok[0], all: [...ok.map((x) => x.url), ...unknown], isDefault: false };
  }
  if (unknown.length > 0) {
    return { primary: { url: unknown[0] }, all: unknown, isDefault: false };
  }
  return { primary: FALLBACK, all: [FALLBACK.url], isDefault: true };
}
