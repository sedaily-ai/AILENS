/** 레터 CSS — 모바일 최적화. 합치는 순서는 letterStyles.ts(뒤에 오는 규칙이 앞을 덮는다). */
export const MOBILE_CSS = `
  /* ── 모바일 최적화(2026-10-11) ── */
  @media (max-width: 900px) {
    /* 에디터를 고르면 소개 카드가 목록 위, 전체 보기에서는 안내 카드를 목록 아래로 내려 레터가 먼저 보이게 한다 */
    .lt-aside-editor { order: -1; }
    .lt-aside-all { order: 2; margin-top: 8px; }
    .lt-layout { gap: 12px; }
  }
  @media (max-width: 640px) {
    .lt-wrap { padding-left: 16px; padding-right: 16px; }
    .lt-hero { padding-bottom: 12px; }
    .lt-etabs { margin-bottom: 14px; }
    .lt-etab { width: 76px; }
    .lt-etab-ring { width: 50px; height: 50px; }
    .lt-toolbar, .lt-main .lt-toolbar { flex-wrap: wrap; row-gap: 8px; }
    .lt-sec-inline { white-space: nowrap; }
    .lt-toolbar-r { width: 100%; margin-left: 0; }
    .lt-toolbar-r .lt-searchbox { flex: 1 1 auto; min-width: 0; }
    .lt-row { gap: 12px; padding: 18px 0; }
    .lt-row-title { font-size: 18px; }
    .lt-row-meta { gap: 4px 8px; }
    .lt-row-dim { margin-left: 0; width: 100%; }
    .lt-eintro { padding: 18px; }
    .lt-eintro-actions { grid-template-columns: 1fr 1fr; }
    .lt-eintro-sub { grid-column: 1 / -1; }
    .ld-wrap { padding-left: 16px; padding-right: 16px; }
    .ld-title { font-size: 25px; }
    .ld-sec-h { font-size: 22px; }
    .ld-key { font-size: 16.5px; }
    .ld-src { grid-template-columns: 22px minmax(0,1fr); }
    .ld-src-ax { grid-column: 2; justify-content: flex-start; margin-top: 6px; }
    .ld-tools { right: 10px; bottom: 10px; }
    .ld-related-item { gap: 10px; }
    .ld-link-card, .ld-term-card { width: min(300px, 78vw); }
    .lt-dlg-back { padding: 0; align-items: flex-end; }
    .lt-dlg { width: 100%; max-height: 92vh; border-radius: 22px 22px 0 0; padding: 22px 18px 20px; }
    .lt-dlg-h { font-size: 19px; }
    .lt-dlg-frame { height: 300px; }
    .lt-ob-rec li { flex-wrap: wrap; }
    .lt-ob-go { margin-left: auto; }
  }
  .ld-key-l { margin-right: 4px; font-size: 0.85em; font-weight: 700; color: #2f5fcf; }

`;
