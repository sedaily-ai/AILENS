/** 레터 목록: 공용 셸의 여백을 이어 쓰는 제목 중심 목록. */
export const LIST_CSS = `
  .lt-wrap { --ink: var(--color-text-primary, #111827); --blue: var(--color-accent-primary, #2f5fcf); --line: var(--color-border, #e5e7eb); --soft: var(--color-surface-subtle, #f8f8f6); max-width: none; margin: 0; padding: 28px 0 72px; }
  .lt-hero { padding: 0 0 24px; }
  .lt-h1 { margin: 0; font-family: "Noto Serif KR", serif; font-size: 32px; font-weight: 700; line-height: 1.3; letter-spacing: -.01em; color: var(--ink); }
  .lt-sub { margin: 8px 0 0; font-size: 16px; line-height: 1.6; color: #6b7280; }
  .lt-etabs { position: relative; display: flex; gap: 4px; overflow-x: auto; scrollbar-width: thin; scrollbar-color: #d1d5db transparent; margin: 0 0 24px; padding: 0; border-bottom: 1px solid #d3d6db; }
  .lt-etabs::-webkit-scrollbar { height: 3px; }
  .lt-etabs::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 2px; }
  .lt-etab { display: flex; flex-direction: row; align-items: center; justify-content: center; gap: 8px; flex: none; width: auto; min-width: 88px; min-height: 52px; padding: 8px 12px; border: 0; border-bottom: 3px solid transparent; margin-bottom: -1px; border-radius: 0; background: transparent; font: inherit; color: #6b7280; cursor: pointer; opacity: 1; font-size: 14.5px; font-weight: 500; }
  .lt-etab-all { min-width: 60px; font-size: 14.5px; font-weight: 500; }
  .lt-etab:hover { color: var(--blue); }
  .lt-etab[aria-pressed='true'] { color: var(--ink); font-weight: 700; border-bottom-color: #5b8def; background: transparent; }
  .lt-etab[aria-pressed='true'] .lt-etab-text strong { color: var(--ink); font-weight: 700; }
  .lt-etab-text { display: block; }
  .lt-etab-text strong { color: inherit; font-size: 14.5px; font-weight: inherit; }
  .lt-etab-ring { display: block; width: 28px; height: 28px; border: 0; border-radius: 50%; overflow: hidden; background: var(--soft); }
  .lt-etab-ring .lt-avatar { width: 28px; height: 28px; }
  .lt-etab-text::after { display: none; }
  .lt-etab:focus-visible { outline: 2px solid var(--blue); outline-offset: -3px; }
  .lt-layout { display: grid; grid-template-columns: minmax(0, 1fr) 288px; grid-template-areas: 'main aside'; gap: 48px; align-items: start; }
  .lt-main { grid-area: main; min-width: 0; }
  .lt-aside-all { padding-left: 24px; border-left: 1px solid var(--line); }
  .lt-aside { grid-area: aside; min-width: 0; position: sticky; top: 84px; display: grid; gap: 24px; }
  .lt-toolbar, .lt-main .lt-toolbar { display: grid; grid-template-columns: minmax(0,1fr) auto minmax(160px,240px); grid-template-areas: 'heading saved search'; align-items: center; gap: 12px; margin: 0 0 6px; }
  .lt-toolbar-r { display: contents; }
  .lt-sec-inline { grid-area: heading; margin: 0; color: var(--ink); font-size: 14px; font-weight: 600; }
  .lt-toolbar .lt-savedtab { grid-area: saved; height: 44px; min-width: 0; padding: 0 12px; border: 1px solid var(--line); border-radius: 10px; background: #fff; font: inherit; font-size: 13px; font-weight: 500; cursor: pointer; white-space: nowrap; }
  .lt-main .lt-toolbar-r .lt-searchbox { grid-area: search; min-width: 0; width: 100%; height: 44px; border-radius: 10px; padding: 0 14px; }
  .lt-save-note { margin: 8px 0 4px; font-size: 12.5px; line-height: 1.65; color: #6b7280; word-break: keep-all; overflow-wrap: anywhere; }
  .lt-rows { display: block; }
  .lt-row { display: block; padding: 24px 0; border-bottom: 1px solid var(--line); }
  .lt-row:first-child { padding-top: 20px; }
  .lt-row-top { display: flex; align-items: center; gap: 12px; }
  .lt-row-top .lt-row-meta { flex: 1; min-width: 0; }
  .lt-row-link { display: block; color: inherit; text-decoration: none; }
  .lt-row-meta { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 12px; font-size: 13px; line-height: 1.5; color: #6b7280; font-weight: 400; }
  .lt-row-dim { margin-left: 0; color: #6b7280; font-variant-numeric: tabular-nums; }
  .lt-row-new { padding: 1px 6px; border-radius: 4px; background: #eef3ff; color: var(--blue); font-size: 12px; font-weight: 600; }
  .lt-row-title { margin: 10px 0 0; font-family: 'Noto Serif KR', serif; font-size: 24px; line-height: 1.45; font-weight: 700; letter-spacing: -.015em; color: var(--ink); text-wrap: pretty; word-break: keep-all; overflow-wrap: anywhere; }
  .lt-row-link:hover .lt-row-title { color: var(--blue); }
  .lt-row-deck { margin: 10px 0 0; font-size: 14px; line-height: 1.7; color: #6b7280; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .lt-row-byline { display: flex; align-items: center; flex-wrap: wrap; justify-content: space-between; gap: 2px 12px; margin-top: 8px; }
  .lt-row-authors { display: flex; align-items: center; flex-wrap: wrap; gap: 2px 10px; min-width: 0; }
  .lt-row-author { display: inline-flex; align-items: center; gap: 6px; min-height: 44px; font-size: 13px; color: #6b7280; text-decoration: none; }
  .lt-row-author .lt-avatar { width: 22px; height: 22px; }
  .lt-row-time { color: #6b7280; font-size: 12px; line-height: 1.6; }
  .lt-row .lt-row-save { display: inline-flex; align-items: center; justify-content: center; flex: none; width: 44px; min-height: 44px; padding: 0; border: 0; border-radius: 999px; background: transparent; font-size: 13px; color: #6b7280; cursor: pointer; }
  .lt-row-foot { display: flex; flex-wrap: wrap; gap: 0 8px; margin-top: 4px; }
  .lt-row-topic { display: inline-flex; align-items: center; min-height: 44px; padding: 0; border: 0; background: transparent; font: inherit; cursor: pointer; }
  .lt-row-topic .lt-topic { border: 1px solid var(--line); background: var(--soft); font-size: 12px; font-weight: 500; line-height: 1.5; }
  .lt-row-topic:hover .lt-topic { color: var(--blue); }
  .lt-aside-card { padding: 0 0 24px; border: 0; border-bottom: 1px solid var(--line); border-radius: 0; background: #fff; }
  .lt-aside-h { margin: 0; font-size: 18px; font-weight: 700; color: var(--ink); }
  .lt-aside-p { margin: 12px 0 0; font-size: 14px; line-height: 1.7; color: #6b7280; }
  .lt-aside-axes { display: grid; gap: 14px; padding: 0; margin: 20px 0 0; list-style: none; }
  .lt-aside-axes li { display: grid; grid-template-columns: 8px auto minmax(0,1fr); gap: 8px; align-items: baseline; font-size: 13px; line-height: 1.6; color: #6b7280; }
  .lt-aside-axes i { width: 7px; height: 7px; border-radius: 50%; }
  .lt-aside-axes b { color: var(--ink); }
  .lt-eintro { display: block; margin: 0; padding: 0 0 20px; border: 0; border-bottom: 1px solid var(--line); border-radius: 0; background: #fff; }
  .lt-eintro-head { display: flex; align-items: center; gap: 12px; }
  .lt-eintro-photo { flex: none; width: 44px; height: 44px; padding: 0; border: 0; border-radius: 50%; overflow: hidden; box-shadow: none; line-height: 0; }
  .lt-eintro-photo .lt-avatar { width: 44px !important; height: 44px !important; border-radius: 50% !important; }
  .lt-eintro-name h2 { margin: 0; font-family: inherit; font-size: 18px; font-weight: 700; }
  .lt-ed-badge { padding: 2px 7px; color: #6b7280; background: var(--soft); font-size: 12px; }
  .lt-eintro-role { margin: 4px 0 0; font-size: 12px; line-height: 1.5; font-weight: 400; color: #6b7280; }
  .lt-eintro-summary { margin: 12px 0 0; font-size: 14px; line-height: 1.6; color: #374151; }
  .lt-eintro-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
  .lt-eintro-sub { width: auto; height: 44px; padding: 0 20px; border: 0; border-radius: 999px; background: var(--blue); color: #fff; font: inherit; font-size: 14px; font-weight: 600; cursor: pointer; }
  .lt-eintro-btn { height: auto; min-height: 44px; padding: 10px 16px; border: 1px solid var(--line); border-radius: 999px; background: #fff; color: #374151; font: inherit; font-size: 14px; font-weight: 600; cursor: pointer; }
  .lt-eintro-btn:hover { color: var(--blue); border-color: #cbd5e1; }
  .lt-eintro-btn[aria-pressed='true'] { background: var(--soft); border-color: #cbd5e1; color: var(--ink); }
  .lt-eintro-policy { margin: 8px 0 0; font-size: 12px; line-height: 1.6; color: #6b7280; }
  .lt-eintro-details { margin-top: 8px; }
  .lt-eintro-quote { margin: 12px 0 0; padding: 0; border: 0; font-size: 14px; line-height: 1.8; color: #374151; }
  .lt-eintro-pitch { margin: 12px 0 0; font-size: 14px; line-height: 1.7; }
  .lt-eintro-pitch b { display: block; margin-bottom: 4px; color: #374151; }
  .lt-eintro-scope { font-size: 13px; line-height: 1.7; }
  .lt-eintro-scope span { display: block; padding: 0; background: none; color: #374151; }
  .lt-eintro-voice { display: inline-flex; align-items: center; min-height: 44px; margin-top: 8px; padding: 8px 0; border: 0; border-radius: 0; color: var(--blue); text-decoration: underline; text-underline-offset: 4px; }
  .lt-eintro-voice[aria-pressed='true'] { background: transparent; }
  .lt-eintro-ai { margin-top: 12px; font-size: 12px; line-height: 1.6; color: #6b7280; }
  .lt-aside .lt-ibar { margin: 0; }
  .lt-ibar-row { padding: 0; border: 0; border-radius: 0; background: #fff; }
  .lt-ibar-msg { font-size: 13px; line-height: 1.7; }
  .lt-empty { padding: 28px 0; color: #6b7280; font-size: 14px; line-height: 1.7; }
  .lt-empty p { margin: 0 0 12px; }
  .lt-empty .lt-empty-help { margin: 0 auto 20px; max-width: 480px; font-size: 13px; line-height: 1.7; }
  .lt-empty-actions { display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 12px; }
  .lt-activefilter { flex-wrap: wrap; }
  .lt-dlg { border: 0; border-radius: 20px; box-shadow: 0 20px 60px rgba(17,24,39,.22); }
  .lt-dlg-h { font-family: inherit; font-weight: 800; letter-spacing: -.02em; }
  .lt-dlg-faces { display: flex; margin: 0 0 12px; }
  .lt-dlg-face { margin-right: -8px; border: 2px solid #fff; border-radius: 50%; overflow: hidden; background: #fff; line-height: 0; }
  .lt-dlg-promise { border: 0; border-radius: 12px; background: #f6f7f9; }
  .lt-dlg-sm { width: min(420px, 100%); }
  .lt-dlg-link { display: flex; align-items: center; justify-content: center; text-decoration: none; }
  .lt-dlg-sm .lt-dlg-h { margin-right: 28px; }
  .lt-seg button { border: 1px solid #e5e7eb; box-shadow: none; }
  .lt-seg button[aria-pressed='true'] { border-color: #2f5fcf; background: #2f5fcf; color: #fff; box-shadow: none; transform: none; }
  @media (max-width: 1199px) {
    .lt-layout { grid-template-columns: minmax(0,1fr); grid-template-areas: 'main' 'aside'; gap: 28px; }
    .lt-layout:has(.lt-aside-editor) { grid-template-areas: 'aside' 'main'; }
    .lt-aside { position: static; }
    .lt-aside-all { padding: 24px 0 0; border-left: 0; border-top: 1px solid var(--line); }
  }
`;
