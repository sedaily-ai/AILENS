import { LENS_CARD_BORDER, LENS_CARD_SHADOW } from '@/shared/constants/lensPerspectives';

/**
 * /onboarding 스타일 — 레터 화면(letterStyles.ts)과 같은 문자열 <style> 방식.
 * 색·글자 크기는 globals.css 토큰만 참조한다. 간격은 4px 배수, 375px 기준으로 먼저 짜고 768px 이상에서만 넓힌다.
 * 구현 기준: 2026-10-12 확정 목업 A(차례로 읽는 안).
 */
export const ONBOARDING_CSS = `
  .ob-page { background: var(--color-bg); color: var(--color-text-primary); word-break: keep-all; overflow-wrap: break-word; }
  .ob-page :focus-visible { outline: 3px solid var(--color-accent-primary); outline-offset: 2px; border-radius: 4px; }
  .ob-main { max-width: 640px; margin: 0 auto; padding: 0 16px 64px; }
  .ob-sec { padding-top: 48px; }
  #newsletter { scroll-margin-top: 72px; }
  .ob-h2 { display: flex; align-items: center; gap: 8px; margin: 0; font-size: var(--font-size-20); font-weight: 800; line-height: 1.4; letter-spacing: -0.02em; color: var(--color-text-primary); }
  .ob-h2-icon { flex: none; width: 24px; height: 24px; }
  .ob-lead { margin: 12px 0 0; font-size: var(--font-size-16); line-height: 1.7; color: var(--color-text-secondary); }

  /* 히어로 */
  .ob-hero { padding-top: 32px; }
  .ob-h1 { margin: 0; font-family: "Noto Serif KR", serif; font-size: var(--font-size-32); font-weight: 700; line-height: 1.35; letter-spacing: -0.02em; text-wrap: balance; }
  .ob-mark { position: relative; display: inline-block; }
  .ob-mark svg { position: absolute; left: 0; bottom: -4px; width: 100%; height: 10px; color: var(--color-highlight); }
  .ob-sub { margin: 12px 0 0; font-size: var(--font-size-16); line-height: 1.7; color: var(--color-text-secondary); }
  .ob-formats { display: flex; flex-wrap: wrap; gap: 8px 16px; margin: 16px 0 0; padding: 0; list-style: none; }
  .ob-formats li { display: flex; align-items: center; gap: 4px; font-size: var(--font-size-14); font-weight: 700; }
  .ob-cta { display: flex; flex-direction: column; gap: 8px; margin-top: 24px; }

  /* 버튼 — 주 버튼은 파랑 채움 pill, 보조는 흰 바탕 테두리 pill(사이트 버튼 모양) */
  .ob-btn { display: inline-flex; align-items: center; justify-content: center; min-height: 48px; padding: 0 24px; border-radius: 999px; font: inherit; font-size: var(--font-size-16); font-weight: 700; text-decoration: none; cursor: pointer; transition: background-color .15s, border-color .15s, color .15s; }
  .ob-btn-primary { border: 0; background: var(--color-accent-primary); color: var(--color-bg); }
  .ob-btn-primary:hover { background: color-mix(in srgb, var(--color-accent-primary) 85%, var(--color-text)); }
  .ob-btn-primary:active { transform: translateY(1px); }
  .ob-btn-primary:disabled { background: var(--color-border); color: var(--color-text-muted); cursor: not-allowed; transform: none; }
  .ob-btn-ghost { border: 1px solid var(--color-text-muted); background: var(--color-bg); color: var(--color-text-secondary); }
  .ob-btn-ghost:hover { border-color: var(--color-text-primary); color: var(--color-text-primary); }
  .ob-btn-ghost:active { transform: translateY(1px); }

  /* 비교 카드 */
  .ob-card { margin-top: 16px; padding: 16px; border: ${LENS_CARD_BORDER}; border-radius: 16px; background: var(--color-bg); box-shadow: ${LENS_CARD_SHADOW}; }
  .ob-meta { margin: 0; font-size: var(--font-size-13); color: var(--color-text-muted); }
  .ob-card-title { margin: 4px 0 0; font-family: "Noto Serif KR", serif; font-size: var(--font-size-18); font-weight: 700; line-height: 1.5; }
  .ob-card-title a { color: inherit; text-decoration: none; }
  .ob-card-title a:hover { text-decoration: underline; }
  .ob-cmp { margin: 16px 0 0; padding: 0; list-style: none; }
  .ob-cmp > li { padding: 16px 0 4px; border-top: 1px solid var(--color-border); }
  .ob-cmp-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 4px 8px; }
  .ob-fmt { display: flex; align-items: center; gap: 4px; font-size: var(--font-size-14); font-weight: 800; }
  .ob-who { font-size: var(--font-size-13); color: var(--color-text-muted); }
  .ob-cmp-text { margin: 8px 0 0; font-size: var(--font-size-16); line-height: 1.7; color: var(--color-text-secondary); }
  .ob-cmp-link { display: inline-flex; align-items: center; min-height: 44px; font-size: var(--font-size-14); font-weight: 700; color: var(--color-accent-primary); text-decoration: none; }
  .ob-cmp-link:hover { text-decoration: underline; }
  .ob-card .ob-btn { width: 100%; margin-top: 8px; }
  .ob-note { margin: 12px 0 0; font-size: var(--font-size-13); line-height: 1.6; color: var(--color-text-muted); }
  .ob-empty { margin-top: 16px; padding: 24px 16px; border-radius: 16px; background: var(--color-surface-subtle); font-size: var(--font-size-16); color: var(--color-text-secondary); }
  .ob-empty a { display: inline-flex; align-items: center; min-height: 44px; font-weight: 700; color: var(--color-accent-primary); }

  /* 기능 지도 — 카드 그리드 대신 목록 */
  .ob-flist { margin: 16px 0 0; padding: 0; list-style: none; }
  .ob-flist li + li { border-top: 1px solid var(--color-border); }
  .ob-frow { display: flex; align-items: center; gap: 12px; min-height: 64px; padding: 12px 0; color: inherit; text-decoration: none; }
  .ob-frow:hover .ob-fname { text-decoration: underline; }
  .ob-ficon { flex: none; width: 40px; height: 40px; border-radius: 12px; background: var(--color-surface-subtle); color: var(--color-text-primary); display: grid; place-items: center; }
  .ob-ftext { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .ob-fname { font-size: var(--font-size-16); font-weight: 700; }
  .ob-fdesc { font-size: var(--font-size-14); line-height: 1.6; color: var(--color-text-muted); }
  .ob-chev { flex: none; color: var(--color-text-muted); }

  /* 만드는 방식 */
  .ob-made { margin: 48px 0 0; padding: 24px 16px; border-radius: 16px; background: var(--color-surface-subtle); font-size: var(--font-size-16); line-height: 1.7; color: var(--color-text-secondary); }
  .ob-made p, .ob-empty p { margin: 0; }

  /* 메일 */
  .ob-promise { margin: 16px 0 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 8px; }
  .ob-promise li { display: flex; gap: 8px; font-size: var(--font-size-16); line-height: 1.6; color: var(--color-text-secondary); }
  .ob-promise svg { flex: none; margin-top: 4px; color: var(--color-accent-primary); }

  @media (min-width: 768px) {
    .ob-main { padding: 0 24px 96px; }
    .ob-sec { padding-top: 64px; }
    .ob-hero { padding-top: 64px; }
    .ob-h1 { font-size: var(--font-size-40); }
    .ob-sub { font-size: var(--font-size-18); }
    .ob-h2 { font-size: var(--font-size-24); }
    .ob-cta { flex-direction: row; }
    .ob-card { padding: 24px; }
    .ob-made { margin-top: 64px; padding: 24px; }
  }
  @media (min-width: 1024px) {
    .ob-main { max-width: 760px; }
  }
  @media (prefers-reduced-motion: reduce) {
    .ob-btn { transition: none; }
    .ob-btn:active { transform: none; }
  }
`;
