import { lensPath } from '@ailens/domain';
import { pickLensPhoto } from '@/shared/constants/lensPerspectives';
import type { CmsLens } from '@/shared/lib/api/cmsPostTypes';

// 발행 직후 미리 열어 두기(warm-up). /api/revalidate가 캐시를 무효화한 뒤, 독자보다 먼저 이 서버가 자기 자신에게
// 새 기사 페이지와 대표 사진을 요청해 ISR 페이지 캐시와 이미지 변환 캐시를 채운다.
// 2026-10-28 실측: 처음 보는 변환 사진 첫 바이트 p50 0.72초·p90 2.67초(최대 4.58초), 다시 보면 0.06초.
// 이 서버 안에서만 채우므로 CloudFront 엣지 캐시는 그대로 비어 있지만, 엣지가 원본에 물을 때 렌더·변환을 기다리지 않는다.

const LOCAL = `http://127.0.0.1:${process.env.PORT ?? 3000}`;
// 상세 대표 사진 칸(sizes="(min-width: 760px) 720px, 100vw", q=75)에서 휴대폰(2~3배 화면)·PC(1~2배)가 고르는 폭.
const HERO_WIDTHS = [768, 1024, 1280, 1600];
// 자동 발행은 기사마다 webhook을 보내므로 신호가 몰린다. 마지막 신호 뒤 잠시 기다렸다가 한 번에 처리해 서버 부담을 줄인다.
const DEBOUNCE_MS = 20_000;
const REQUEST_TIMEOUT_MS = 20_000;

const pending = new Map<string, CmsLens>();
const warmed = new Map<string, number>(); // `${경로}|${수정 시각}` → 미리 연 시각(같은 판을 두 번 열지 않는다)
let timer: ReturnType<typeof setTimeout> | null = null;
let running: Promise<void> = Promise.resolve();

export function scheduleWarmArticles(posts: CmsLens[]): void {
  for (const lens of posts) pending.set(lens.id, lens);
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    const batch = [...pending.values()];
    pending.clear();
    running = running.then(() => warm(batch)).catch((e) => console.warn('[warm] 실패', e));
  }, DEBOUNCE_MS);
}

async function hit(url: string, headers?: Record<string, string>): Promise<string> {
  const t0 = Date.now();
  try {
    const res = await fetch(url, { headers, cache: 'no-store', signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    await res.arrayBuffer();
    return `${res.status}/${Date.now() - t0}ms`;
  } catch (e) {
    return `실패/${Date.now() - t0}ms(${e instanceof Error ? e.name : 'error'})`;
  }
}

async function warm(batch: CmsLens[]): Promise<void> {
  const now = Date.now();
  for (const [key, at] of warmed) if (now - at > 6 * 60 * 60 * 1000) warmed.delete(key);
  // 홈은 webhook마다 다시 그려야 하므로 배치당 한 번 연다.
  console.log(`[warm] / page ${await hit(`${LOCAL}/`)}`);
  for (const lens of batch) {
    const path = lensPath(lens);
    const key = `${path}|${lens.updated_at ?? lens.published_at ?? ''}`;
    if (warmed.has(key)) continue;
    warmed.set(key, now);
    const page = await hit(`${LOCAL}${path}`);
    const photo = pickLensPhoto(lens);
    const photos: string[] = [];
    if (photo && /^https?:\/\//.test(photo)) {
      for (const w of HERO_WIDTHS) {
        photos.push(`${w}:${await hit(`${LOCAL}/_next/image?url=${encodeURIComponent(photo)}&w=${w}&q=75`, { Accept: 'image/webp,*/*' })}`);
      }
    }
    console.log(`[warm] ${path} page ${page} photo ${photos.join(' ') || '없음'}`);
  }
}
