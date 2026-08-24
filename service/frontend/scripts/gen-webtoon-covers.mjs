/**
 * 웹툰 표지 썸네일 생성기 — 수동 실행 도구. 빌드에 물려 있지 않다.
 *
 * ══ 왜 필요한가 ══
 * CMS 에 올라오는 웹툰 표지는 1536x1024 PNG **원본**이고 편당 2.3~3.5MB 다
 * (2026-08-19 실측 24편 전부). next.config.ts 의 images.unoptimized 가 true 라
 * next/image 를 써도 리사이즈가 안 돌아서, 목록 페이지가 이 원본을 그대로
 * 받는다. 화면에 실제로 그려지는 크기는 최대 720px(큰 컷) / 112px(작은 컷)다.
 *
 * 즉 목록 레이아웃이 대역폭에 인질로 잡혀 있었다 — 첫 화면에 표지 한 장만
 * 보여도 3MB, 여러 장을 보여주면 장수 x 3MB. 지면 모자이크처럼 컷을 여러 개
 * 늘어놓는 배치가 오히려 더 비싼 구조였다.
 *
 * ══ public/ 에 구운 결과를 커밋하는 이유 ══
 * assets-src/editors/README.md 와 같은 방식이다 — 원본은 서비스가 안 받고,
 * 미리 인코딩한 WebP 만 public/ 에 두고 커밋한다. 빌드에 물리지 않으므로
 * (a) S3 가 안 열려도 빌드가 죽지 않고 (b) 클린 체크아웃이 바로 동작한다.
 * 목록에 없는 새 편은 자동으로 원본 URL 로 폴백한다(느리지만 깨지지 않음).
 *
 * ══ 근본 해결은 이게 아니다 ══
 * images.unoptimized 를 풀 수 있게 배포 파이프라인에서 sharp 를 해결하거나,
 * admin 업로드 시점에 리사이즈해 저장하는 쪽이 맞다. 이건 그때까지의 임시책.
 *
 * ══ 사용법 ══
 *   cd service/frontend
 *   node scripts/gen-webtoon-covers.mjs          # 새 편만
 *   node scripts/gen-webtoon-covers.mjs --force  # 전부 다시
 *
 * sharp 는 next 가 끌어오는 전이 의존성을 그대로 쓴다(이 스크립트는 로컬
 * 전용이라 package.json 에 따로 올리지 않는다).
 */
import { mkdirSync, existsSync, writeFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'public/webtoon/covers');
// shared/ 에 둔다 — /webtoon 페이지와 홈의 WebtoonPreviewSection 이 같이 쓴다.
// app/ 에 두면 features/ 가 app/ 을 import 하는 역방향 의존이 된다.
const MANIFEST = join(ROOT, 'src/shared/lib/webtoonCovers.generated.ts');
const API = process.env.NEXT_PUBLIC_API_URL ?? 'https://chzwwtjtgk.execute-api.us-east-1.amazonaws.com/dev';
const FORCE = process.argv.includes('--force');

/**
 * 세 단계로 굽는다 — 화면에 실제로 그려지는 CSS 폭의 2x 를 맞추는 게 기준이다.
 * 한 단계로 뭉치면 어딘가는 흐리거나 어딘가는 과하게 무겁다.
 *   lg 800px  히어로(새 회차) — CSS 최대 896px, 그대로 쓰면 3MB 원본이 온다
 *   md 480px  카드 격자·가로 레일 — CSS 161~240px 의 2x
 *   sm 224px  상세의 이전/다음화 썸네일 — CSS 112px 의 2x
 */
const LG = { w: 800, q: 70, suffix: '' };
const MD = { w: 480, q: 70, suffix: '-md' };
const SM = { w: 224, q: 70, suffix: '-sm' };

let sharp;
try {
  sharp = (await import('sharp')).default;
} catch {
  console.error('sharp 를 못 찾았다. `npm install` 을 먼저 돌려라 (next 의 전이 의존성).');
  process.exit(1);
}

/** S3 URL -> 파일명. 쿼리스트링·경로를 버리고 basename 만, 안전한 문자로. */
function safeName(url) {
  const base = url.split('?')[0].split('/').pop() ?? '';
  return base.replace(/\.[a-z0-9]+$/i, '').replace(/[^a-zA-Z0-9_-]/g, '_');
}

const res = await fetch(`${API}/api/v2/posts?channel=webtoon&limit=100`);
if (!res.ok) {
  console.error(`CMS 응답 ${res.status} — 중단한다.`);
  process.exit(1);
}
const { posts = [] } = await res.json();
console.log(`웹툰 ${posts.length}편`);

mkdirSync(OUT_DIR, { recursive: true });

/** @type {Record<string, { lg: string; md: string; sm: string }>} */
const manifest = {};
const seen = new Map();
let made = 0, skipped = 0, srcBytes = 0, outBytes = 0;

for (const p of posts) {
  const url = p.cover_image_url;
  if (!url || !/^https?:/.test(url)) continue;

  const name = safeName(url);
  if (seen.has(name) && seen.get(name) !== url) {
    console.error(`파일명 충돌: ${name} <- ${url} / ${seen.get(name)}`);
    process.exit(1);
  }
  seen.set(name, url);

  const targets = [LG, MD, SM].map((v) => ({ ...v, file: join(OUT_DIR, `${name}${v.suffix}.webp`) }));
  manifest[url] = {
    lg: `/webtoon/covers/${name}.webp`,
    md: `/webtoon/covers/${name}-md.webp`,
    sm: `/webtoon/covers/${name}-sm.webp`,
  };

  if (!FORCE && targets.every((t) => existsSync(t.file))) {
    skipped++;
    outBytes += targets.reduce((a, t) => a + statSync(t.file).size, 0);
    continue;
  }

  let buf;
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    buf = Buffer.from(await r.arrayBuffer());
  } catch (e) {
    console.error(`  받기 실패 ${name}: ${e.message} — 이 편은 원본 URL 로 폴백된다`);
    delete manifest[url];
    continue;
  }
  srcBytes += buf.length;

  for (const t of targets) {
    await sharp(buf).resize(t.w, null, { withoutEnlargement: true }).webp({ quality: t.q }).toFile(t.file);
    outBytes += statSync(t.file).size;
  }
  made++;
  const kb = (n) => Math.round(n / 1024);
  console.log(`  ${name}  ${kb(buf.length)}KB -> ${targets.map((t) => kb(statSync(t.file).size) + 'KB').join(' + ')}`);
}

const kb = (n) => Math.round(n / 1024);
console.log(`\n새로 구움 ${made} / 건너뜀 ${skipped}`);
if (srcBytes) console.log(`원본 ${kb(srcBytes)}KB -> 결과 ${kb(outBytes)}KB`);
console.log(`public/webtoon/covers 합계 ${kb(outBytes)}KB`);

const entries = Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b));
const body = entries
  .map(([url, v]) => `  ${JSON.stringify(url)}: { lg: '${v.lg}', md: '${v.md}', sm: '${v.sm}' },`)
  .join('\n');
writeFileSync(
  MANIFEST,
  `// 자동 생성 파일 — 직접 고치지 말고 \`node scripts/gen-webtoon-covers.mjs\` 를 다시 돌려라.
//
// CMS 표지 원본(1536x1024 PNG, 편당 2.3~3.5MB) 을 미리 WebP 로 구운 결과의
// 매핑이다. 목록에 없는 표지는 원본 URL 을 그대로 쓴다(coverThumb() 참조).
// 쓰는 곳: /webtoon 목록·상세, 홈의 WebtoonPreviewSection.
// 생성 시각: ${new Date().toISOString()}
// 편수 ${entries.length} / 합계 약 ${kb(outBytes)}KB

export type CoverSize = 'lg' | 'md' | 'sm';

export const COVER_THUMBS: Record<string, Record<CoverSize, string>> = {
${body}
};

/**
 * 표지 URL 을 미리 구운 WebP 로 바꾼다. 아직 안 구운 새 편은 원본을 돌려주므로
 * 화면이 깨지지는 않는다(대신 그 한 장은 원본 크기를 그대로 받는다).
 */
export function coverThumb(url: string | null | undefined, size: CoverSize): string | null {
  if (!url) return null;
  return COVER_THUMBS[url]?.[size] ?? url;
}
`,
  'utf8',
);
console.log(`매니페스트 ${entries.length}건 -> src/shared/lib/webtoonCovers.generated.ts`);
