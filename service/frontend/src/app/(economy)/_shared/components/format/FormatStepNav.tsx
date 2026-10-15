'use client';

import { eunneun } from '@ailens/domain';
import { lensFormatFor, lensPerspectiveFor, lensTabId } from '@/shared/constants/lensPerspectives';
import type { CmsLensItem } from '@/shared/lib/api/cmsPostsApi';
import { trackEvent } from '@/shared/lib/tracking/trackEvent';

// 형식 이어 보기 — 같은 기사를 레터 → 웹툰 → 팟캐스트 → 영상 순서로 차례대로 볼 수 있게 각 형식 맨 아래에 "← 이전 형식 / 다음 형식 →"을 둔다.
// 탭 전환은 형식 탭 버튼을 대신 눌러(LensViewClient.select가 처리) 상태·계측·스크롤 로직을 한 곳에 둔다.
// 크롤러 영향 없음: 네 형식 패널은 항상 DOM에 있고, 여기 요소는 링크가 아니라 버튼이다.
export function FormatStepNav({
  index,
  lenses,
  articleId,
  category,
  webtoonVariant,
}: {
  index: number;
  lenses: CmsLensItem[];
  articleId: string;
  category?: string | null;
  /** 웹툰 패널에서만 의미 — 웹툰→레터 이동을 기존 지표(webtoon_cta_click)로도 계속 센다 */
  webtoonVariant?: 'v1' | 'v2';
}) {
  const last = lenses.length - 1;
  const prev = index > 0 ? index - 1 : null;
  const next = index < last ? index + 1 : null;
  if (prev === null && next === null) return null;

  const go = (to: number, direction: 'prev' | 'next') => {
    trackEvent('format_step_click', {
      article_id: articleId,
      from_format: lensFormatFor(lenses[index], index),
      to_format: lensFormatFor(lenses[to], to),
      direction,
      ...(category ? { category } : {}),
    });
    if (lensFormatFor(lenses[index], index) === 'webtoon' && lensFormatFor(lenses[to], to) === 'letter' && webtoonVariant) {
      trackEvent('webtoon_cta_click', { article_id: articleId, variant: webtoonVariant, target: 'letter', ...(category ? { category } : {}) });
    }
    document.getElementById(lensTabId(to))?.click();
  };

  // 이동 버튼 위 한 줄 — 눌렀을 때 얻는 것을 말해 다음 형식으로 이어 보게 한다(LENS_FORMATS 순서: 레터·웹툰·팟캐스트·영상).
  const HOOK = { letter: '차분히 읽기', webtoon: '가볍게 훑기', podcast: '핵심 듣기', video: '한눈에 보기' };
  const here = lensPerspectiveFor(lenses[index], index).short;

  return (
    <nav aria-label="다른 형식으로 이어 보기" style={{ marginTop: 40 }}>
      <p style={{ margin: '0 0 12px', textAlign: 'center', fontSize: 13.5, color: '#6b7280' }}>{here}{eunneun(here)} 어떠셨어요? 같은 이야기를 다른 방식으로도 만나보세요</p>
      <div style={{ display: 'flex', gap: 10, alignItems: 'stretch' }}>
        {prev !== null ? (
          <button type="button" onClick={() => go(prev, 'prev')} className="fstep fstep-prev" aria-label={`이전 형식, ${lensPerspectiveFor(lenses[prev], prev).short}`}>
            <span className="fstep-dir">← {HOOK[lensFormatFor(lenses[prev], prev)]}</span>
            <span className="fstep-name">{lensPerspectiveFor(lenses[prev], prev).short}</span>
          </button>
        ) : (
          <span style={{ flex: 1 }} aria-hidden />
        )}
        {next !== null ? (
          <button type="button" onClick={() => go(next, 'next')} className="fstep fstep-next" aria-label={`다음 형식, ${lensPerspectiveFor(lenses[next], next).short}`}>
            <span className="fstep-dir">{HOOK[lensFormatFor(lenses[next], next)]} →</span>
            <span className="fstep-name">{lensPerspectiveFor(lenses[next], next).short}</span>
          </button>
        ) : (
          <span style={{ flex: 1 }} aria-hidden />
        )}
      </div>
      <style>{`
        .fstep { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; padding: 14px 18px; border: 1px solid #dbe4f4; border-radius: 12px; background: #fff; color: #111827; cursor: pointer; transition: background .15s ease, transform .15s ease; font: inherit; }
        .fstep:hover { background: #f5f8ff; border-color: #5b8def; }
        .fstep:active { transform: scale(.985); }
        .fstep-prev { align-items: flex-start; text-align: left; }
        .fstep-next { align-items: flex-end; text-align: right; }
        .fstep-dir { font-size: 12px; font-weight: 700; color: #6b7280; white-space: nowrap; }
        .fstep-name { font-size: 16px; font-weight: 800; color: #1d4ed8; }
        @media (max-width: 480px) { .fstep { padding: 14px 12px; } }
        .fstep:focus-visible { outline: 2px solid #5b8def; outline-offset: 2px; }
      `}</style>
    </nav>
  );
}
