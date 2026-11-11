import { ImageResponse } from 'next/og';
import { displayCategoryLabel, seoHeadline } from '@ailens/domain';
import type { CmsLens } from '@/shared/lib/api/cmsPostsApi';
import { pickLensPhoto } from '@/shared/constants/lensPerspectives';
import { parseImageSize } from '@/shared/lib/seo/share/shareImage';
import { loadFonts } from './renderCompareCard';

// 기사 공유 카드(1200×630 PNG) — 카카오톡·슬랙·텔레그램 링크 미리보기용 og:image.
// 예전 og:image는 S3의 웹툰 컷 WebP였는데, 메신저(특히 카카오톡)는 WebP 미리보기를 못 띄우는 경우가 있어
// 대표 사진 위에 제목·AI LENS 표기를 얹은 PNG 카드를 따로 만든다(2026-11-11).
// 이 이미지는 메신저 봇이 /card/{id}/share.png를 요청할 때만 만들고 CDN에 보관하므로 독자의 페이지 로딩과는 무관하다.

export const SHARE_CARD_SIZE = { width: 1200, height: 630 };

const PHOTO_TIMEOUT_MS = 4_000; // 한국 원본 사진(wimg)이 미국 서버에서 느릴 때가 있다 — 넘기면 사진 없이 만든다.
const PHOTO_MAX_BYTES = 8_000_000;
const PHOTO_MIN_WIDTH = 600;
const PHOTO_MAX_ASPECT = 3; // 배너형(예: 386×93)은 배경으로 쓰면 뭉개져 뺀다.
const HEADLINE_MAX = 58; // 3줄(56px, 폭 1080px)에 들어가는 글자 수

const NAVY = '#0f1b33';
const ACCENT = '#60a5fa';

/** 사진을 받아 JPEG·PNG면 data URI로. next/og(satori)는 WebP를 못 그려서 WebP·기타 형식은 건너뛴다. */
async function loadPhoto(url: string | null): Promise<string | null> {
  if (!url || !/^https?:\/\//.test(url)) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PHOTO_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > PHOTO_MAX_BYTES) return null;
    const isPng = buf[0] === 0x89 && buf[1] === 0x50;
    const isJpeg = buf[0] === 0xff && buf[1] === 0xd8;
    if (!isPng && !isJpeg) return null;
    const size = parseImageSize(buf);
    if (!size || size.width < PHOTO_MIN_WIDTH || size.height <= 0 || size.width / size.height > PHOTO_MAX_ASPECT) return null;
    return `data:image/${isPng ? 'png' : 'jpeg'};base64,${Buffer.from(buf).toString('base64')}`;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function clampHeadline(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > HEADLINE_MAX ? `${t.slice(0, HEADLINE_MAX - 1).trimEnd()}…` : t;
}

/** 기사 날짜(한국 날짜). published_at은 UTC라 앞 10자를 자르면 아침 7시 발행 기사가 하루 전으로 나온다 — 발행일 date를 먼저 쓴다. */
function shareDate(lens: CmsLens): string {
  let d = (lens.date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) && lens.published_at) {
    const t = Date.parse(lens.published_at);
    d = Number.isNaN(t) ? '' : new Date(t + 9 * 3_600_000).toISOString().slice(0, 10);
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d.replace(/-/g, '.') : '';
}

export async function renderShareCard(lens: CmsLens, headers: Record<string, string>) {
  const [photo, fonts] = await Promise.all([loadPhoto(pickLensPhoto(lens)), loadFonts()]);
  const headline = clampHeadline(seoHeadline(lens.headline));
  const category = displayCategoryLabel(lens.category);
  const date = shareDate(lens);
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', position: 'relative', background: NAVY, fontFamily: 'Pretendard' }}>
        {photo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" width={1200} height={630} style={{ position: 'absolute', top: 0, left: 0, width: 1200, height: 630, objectFit: 'cover' }} />
        )}
        {photo ? (
          <>
            {/* 사진 전체를 조금 어둡게 + 제목이 놓이는 아래쪽을 진하게(사진 속 글자·현수막에 제목이 묻히지 않게). */}
            <div style={{ position: 'absolute', top: 0, left: 0, width: 1200, height: 630, display: 'flex', backgroundColor: 'rgba(8,12,24,0.35)' }} />
            <div
              style={{
                position: 'absolute',
                left: 0,
                bottom: 0,
                width: 1200,
                height: 400,
                display: 'flex',
                backgroundImage: 'linear-gradient(180deg, rgba(8,12,24,0) 0%, rgba(8,12,24,0.8) 45%, rgba(8,12,24,0.95) 100%)',
              }}
            />
          </>
        ) : (
          <div style={{ position: 'absolute', top: 0, left: 0, width: 1200, height: 630, display: 'flex', backgroundImage: `linear-gradient(135deg, ${NAVY} 0%, #1e3a6e 100%)` }} />
        )}
        <div style={{ position: 'absolute', top: 0, left: 0, width: 1200, height: 630, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '48px 60px 44px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ fontSize: 30, fontWeight: 700, color: '#ffffff', letterSpacing: 1 }}>AI LENS</span>
            {category && (
              <span style={{ fontSize: 22, fontWeight: 700, color: NAVY, background: ACCENT, padding: '4px 14px', borderRadius: 999 }}>{category}</span>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
            <div style={{ display: 'flex', fontSize: 56, lineHeight: 1.3, fontWeight: 700, color: '#ffffff', letterSpacing: -1, wordBreak: 'keep-all' }}>
              {headline}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 24, fontWeight: 500, color: 'rgba(255,255,255,0.8)' }}>서울경제 · 오늘의 이슈를 4가지 시선으로</span>
              <span style={{ fontSize: 24, fontWeight: 500, color: 'rgba(255,255,255,0.8)' }}>{date}</span>
            </div>
          </div>
        </div>
      </div>
    ),
    { ...SHARE_CARD_SIZE, fonts, headers },
  );
}
