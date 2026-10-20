/** 레터 화면의 좁은 폭 배치. 모달의 포커스·배경 격리 동작은 유지한다. */
export const MOBILE_CSS = `
  @media (max-width: 767px) {
    .lt-wrap { padding: 20px 0 48px; }
    .lt-hero { padding-bottom: 20px; }
    .lt-h1 { font-size: 24px; }
    .lt-sub { font-size: 14px; }
    .lt-etabs { margin-bottom: 20px; }
    .lt-etab { flex-basis: 112px; width: 112px; min-width: 112px; padding: 10px 6px; }
    .lt-etab-all { flex-basis: 88px; width: 88px; min-width: 88px; }
    .lt-toolbar, .lt-main .lt-toolbar { grid-template-columns: minmax(0,1fr) auto; grid-template-areas: 'search search' 'heading saved'; gap: 12px; }
    .lt-main .lt-toolbar-r .lt-searchbox { width: 100%; }
    .lt-layout { gap: 20px; }
    .lt-eintro { padding-bottom: 12px; }
    .lt-eintro-summary { margin-top: 8px; }
    .lt-eintro-details { margin-top: 4px; }
    .lt-row { padding: 20px 0; }
    .lt-row-title { font-size: 20px; line-height: 1.5; }
    .lt-row-meta { gap: 6px 10px; }
    .lt-row-time { flex-basis: 100%; }
    .lt-row-authors { flex: 1 1 180px; }
    .lt-row-byline { align-items: flex-start; }
    .lt-row .lt-row-save { flex: none; }
    .ld-wrap { padding: 20px 0 48px; }
    .ld-title { font-size: 24px; }
    .ld-deck { font-size: 14px; }
    .ld-sec { margin-top: 36px; padding-top: 24px; }
    .ld-wrap .ld-sec-h { font-size: calc(var(--ld-font, 16.5px) * 1.45); }
    .ld-key { font-size: 16.5px; }
    .ld-src { grid-template-columns: 22px minmax(0,1fr); }
    .ld-src-ax { grid-column: 2; justify-content: flex-start; margin-top: 6px; }
    .ld-related-item { gap: 10px; }
    .ld-link-card, .ld-term-card { width: min(300px, 78vw); }
    .lt-dlg-back { padding: 0; align-items: flex-end; }
    .lt-dlg { width: 100%; max-height: 92vh; border-radius: 22px 22px 0 0; padding: 22px 18px 20px; }
    .lt-dlg-h { font-size: 19px; }
    .lt-dlg-frame { height: 300px; }
    .lt-ob-rec li { flex-wrap: wrap; }
    .lt-ob-go { margin-left: auto; }
  }
  .ld-key-l { margin-right: 4px; font-size: .85em; font-weight: 700; color: #2f5fcf; }
`;
