/** 레터 CSS — 상세 화면(읽기 리듬·도구·목차·저장/읽음·관련 레터·에디터 표기). 합치는 순서는 letterStyles.ts(뒤에 오는 규칙이 앞을 덮는다). */
export const DETAIL_CSS = `
  /* ── 상세 화면 최소 정리(2026-10-11): 이전 디자인 유지, 사이트 톤(명조 제목·플랫)만 맞춤 */
  .ld-title { font-family: "Noto Serif KR", serif; font-weight: 700; letter-spacing: -0.015em; }
  .ld-cat { flex-wrap: wrap; gap: 4px 10px; }
  .ld-cat-no { margin-left: auto; color: #9ca3af; font-weight: 400; }
  .ld-editor { margin: 0; padding: 0; background: none; font-size: 13.5px; font-weight: 600; color: #4b5563; }
  .ld-editor:hover { background: none; color: #111827; text-decoration: underline; text-underline-offset: 3px; }
  .ld-topics-end { margin: 28px 0 0; }
  .ld-panel-toggle { width: 100%; display: flex; align-items: center; justify-content: space-between; margin: 0 0 6px; padding: 0; border: 0; background: none; font: inherit; font-size: 14.5px; font-weight: 700; color: #111827; cursor: pointer; }
  .ld-panel-caret { font-size: 12.5px; font-weight: 600; color: #6b7280; }
  /* 본문 구간: 알약·막대 박스 없이 글만 */
  .ld-axis-label { font-size: 13px; font-weight: 700; letter-spacing: .02em; }
  .ld-sec-top { margin-bottom: 2px; }
  .ld-key { margin: 8px 0 0; padding: 0; border: 0; background: none; border-radius: 0; font-size: 17px; font-weight: 700; line-height: 1.7; color: #111827; }
  .ld-p a { color: #111827; text-decoration-color: #9ca3af; font-weight: 600; }
  .ld-p a:hover { text-decoration-color: #111827; }
  /* 읽기 리듬(2026-10-11): 섹션 번호·구분선·도입문 위계·에디터 프로필 */
  .ld-sec { scroll-margin-top: 84px; margin-top: 52px; padding-top: 28px; border-top: 1px solid #e5e7eb; }
  .ld-sec-top { display: flex; align-items: baseline; gap: 10px; }
  .ld-sec-no { font-size: 13px; font-weight: 800; letter-spacing: .06em; color: #cbd2dc; font-variant-numeric: tabular-nums; }
  .ld-sec-h { margin-top: 8px; font-size: 26px; line-height: 1.4; }
  .ld-key { margin-top: 12px; font-size: 18px; font-weight: 600; line-height: 1.75; color: #374151; }
  .ld-p { margin-top: 20px; }
  .ld-note { display: block; margin-top: 52px; padding: 24px; border: 1px solid #e5e7eb; border-radius: 16px; background: #fff; box-shadow: none; }
  .ld-note-head { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
  .ld-note-head h2 { margin: 0; font-size: 14px; font-weight: 800; color: #111827; }
  .ld-note-by { font-size: 12.5px; color: #6b7280; }
  .ld-note-ava { flex: none; width: 36px; height: 36px; border-radius: 50%; overflow: hidden; border: 1px solid #e5e7eb; line-height: 0; }
  .ld-note p { margin: 0; font-size: 16px; line-height: 1.85; color: #1f2937; }
  /* 본문 링크 미리보기 카드 */
  .ld-link { position: relative; display: inline; }
  .ld-link-card { position: absolute; left: 0; bottom: calc(100% + 10px); z-index: 30; width: min(340px, 78vw); display: none; flex-direction: column; gap: 4px; padding: 14px 16px; border: 1px solid #e5e7eb; border-radius: 14px; background: #fff; box-shadow: 0 10px 30px rgba(17,24,39,.14); font-size: 14px; line-height: 1.5; font-weight: 400; text-align: left; white-space: normal; pointer-events: none; }
  .ld-link-card::after { content: ''; position: absolute; left: 20px; top: 100%; width: 10px; height: 10px; margin-top: -6px; background: #fff; border-right: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb; transform: rotate(45deg); }
  .ld-link:hover .ld-link-card, .ld-link:focus-within .ld-link-card { display: flex; animation: ld-link-in .14s ease-out; }
  .ld-link-outlet { font-size: 12px; font-weight: 700; color: #6b7280; }
  .ld-link-title { font-size: 14.5px; font-weight: 700; color: #111827; line-height: 1.5; }
  .ld-link-go { margin-top: 4px; font-size: 12.5px; font-weight: 700; color: var(--blue); }
  @keyframes ld-link-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
  @media (hover: none) { .ld-link:hover .ld-link-card { display: none; } .ld-link:focus-within .ld-link-card { display: flex; } }
  /* 읽기 도구·목차·용어(2026-10-11) */
  .ld-p { font-size: var(--ld-font, 16.5px); }
  .ld-progress { position: fixed; top: 0; left: 0; right: 0; height: 3px; z-index: 120; pointer-events: none; }
  .ld-progress i { display: block; height: 100%; background: #2f5fcf; transform-origin: 0 50%; transform: scaleX(0); transition: transform .08s linear; }
  .ld-tools { position: static; flex: none; display: flex; align-items: center; flex-wrap: wrap; gap: 2px; max-width: 100%; width: fit-content; margin: 0; padding: 2px; border: 1px solid #e5e7eb; border-radius: 999px; background: #fff; box-shadow: none; }
  .ld-tools button { display: inline-flex; align-items: center; justify-content: center; min-width: 44px; min-height: 44px; padding: 0 10px; border: 0; border-radius: 999px; background: none; font: inherit; font-size: 14px; font-weight: 600; color: #374151; cursor: pointer; }
  .ld-tools button small { font-size: 11px; margin-left: 1px; }
  .ld-tools button:hover:not(:disabled) { color: #2f5fcf; }
  .ld-tools button:disabled { opacity: .35; cursor: default; }
  .ld-toc-rail { position: absolute; top: 56px; bottom: 72px; left: calc(100% + 36px); width: 180px; display: none; }
  .ld-toc { position: sticky; top: 84px; max-height: calc(100dvh - 108px); overflow-y: auto; overscroll-behavior: contain; }
  .ld-toc ol { margin: 0; padding: 0; list-style: none; display: grid; gap: 2px; border-left: 1px solid #e5e7eb; }
  .ld-toc li a { display: block; padding: 6px 0 6px 14px; margin-left: -1px; border-left: 2px solid transparent; font-size: 13px; line-height: 1.5; color: #9ca3af; text-decoration: none; }
  .ld-toc li a b { margin-right: 8px; font-size: 11.5px; font-variant-numeric: tabular-nums; }
  .ld-toc li a:hover { color: #374151; }
  .ld-toc li.on a { color: #111827; font-weight: 700; border-left-color: #111827; }
  @media (min-width: 1280px) { .ld-toc-rail { display: block; } }
  .lt-dlg-back::backdrop { background: transparent; }
  .lt-dlg, .lt-dlg-back { --blue: #2f5fcf; --line: #e5e7eb; --soft: #f6f7f9; --ink: #111827; }
  /* 저장·읽음(2026-10-11) */
  .lt-savedtab[aria-pressed='true'] { background: #111827; border-color: #111827; color: #fff; }
  .lt-row-read .lt-row-title { color: #6b7280; }
  .lt-row-readmark { padding: 1px 6px; border-radius: 4px; background: #f3f4f6; font-size: 12px; color: #6b7280; }
  .lt-row-save:hover { color: #2f5fcf; }
  .lt-row-save[aria-pressed='true'], .ld-tools button[aria-pressed='true'] { color: #2f5fcf; }
  /* 관련 레터 */
  .ld-related { margin-top: 40px; }
  .ld-related-h { margin: 0 0 6px; font-size: 14px; font-weight: 800; color: #111827; }
  .ld-related ul { margin: 0; padding: 0; list-style: none; }
  .ld-related-item { display: flex; gap: 14px; align-items: center; padding: 14px 0; border-bottom: 1px solid #e5e7eb; text-decoration: none; color: inherit; }
  .ld-related-ava { flex: none; width: 44px; height: 44px; border-radius: 9px; overflow: hidden; border: 1px solid #e5e7eb; line-height: 0; }
  .ld-related-body { display: grid; gap: 2px; min-width: 0; }
  .ld-related-why { font-size: 12px; font-weight: 700; color: #2f5fcf; }
  .ld-related-title { font-family: "Noto Serif KR", serif; font-size: 16px; font-weight: 700; line-height: 1.5; color: #111827; }
  .ld-related-item:hover .ld-related-title { color: #2f5fcf; }
  .ld-related-meta { font-size: 12.5px; color: #9ca3af; }
  /* 에디터 표기: 작은 프로필 + 이름 알약(누르면 에디터 화면) */
  .ld-editor { display: inline-flex; align-items: center; gap: 6px; padding: 2px 10px 2px 3px; border: 1px solid #e5e7eb; border-radius: 999px; background: #fff; font-size: 13px; font-weight: 700; color: #374151; text-decoration: none; transition: background .15s, border-color .15s; }
  .ld-editor:hover { border-color: #cfd5de; color: #111827; text-decoration: none; }
  .ld-editor .lt-avatar { width: 22px; height: 22px; }
  .ld-editor-arrow { margin-left: 1px; font-size: 15px; line-height: 1; color: #9ca3af; }
  .lt-card-ed-badge { padding: 2px 9px 2px 3px; border: 1px solid #e5e7eb; background: #fff; font-size: 12.5px; font-weight: 700; color: #374151; }
  .ld-cat { gap: 8px 8px; align-items: center; }
  .ld-meta { font-variant-numeric: tabular-nums; }
  .ld-editor .lt-avatar { width: 22px !important; height: 22px !important; flex: none; }
  .ld-editor .lt-avatar-img { object-fit: cover; border-radius: 50% !important; }
  /* 에디터 알약은 항상 둥글게 */
  .lt-card-ed, .lt-card-ed-badge, .ld-editor { border-radius: 999px !important; }
  .lt-card-ed-badge { display: inline-flex; align-items: center; gap: 6px; }
  /* 2026-10-13: 목록과 같은 바깥 여백, 제목 아래 작성자·읽기 도구. */
  .ld-wrap { position: relative; --blue: var(--color-accent-primary, #2f5fcf); max-width: 720px; padding: 28px 0 72px; }
  .ld-title { font-size: 32px; line-height: 1.4; text-wrap: pretty; word-break: keep-all; overflow-wrap: anywhere; }
  .ld-cat { font-size: 13px; font-weight: 400; color: #6b7280; }
  .ld-cat .ld-meta { margin: 0; font-size: 13px; }
  .ld-deck { margin-top: 16px; font-size: 16px; line-height: 1.8; color: #6b7280; }
  .ld-byline { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-top: 20px; padding-bottom: 20px; border-bottom: 1px solid #e5e7eb; }
  .ld-byline > .lt-save-note { flex-basis: 100%; margin: 0; }
  .ld-authors { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; min-width: 0; }
  .ld-byline .ld-editor { min-height: 44px; padding: 6px 10px; border: 1px solid #e5e7eb; background: transparent; font-weight: 600; gap: 8px; }
  .ld-editor-action { margin-left: 4px; color: #6b7280; font-size: 12px; font-weight: 400; }
  .ld-byline .ld-editor:hover { color: #2f5fcf; }
  .ld-outline { margin-top: 24px; }
  .ld-outline h2 { margin: 0; font-size: 14px; font-weight: 600; }
  .ld-outline .ld-axlist { margin-top: 14px; }
  .ld-sum { background: #f8f8f6; border-color: #e5e7eb; padding: 20px; border-radius: 12px; }
  .ld-sum-h strong { color: #111827; }
  .ld-sum-btn { min-height: 44px; min-width: 44px; }
  .ld-size { min-width: 36px; text-align: center; font-size: 11px; color: #6b7280; font-variant-numeric: tabular-nums; }
  /* 문단뿐 아니라 도입문·요약·핵심·에디터 한마디·본문 시각 블록도 같은 읽기 크기를 따른다. */
  .ld-wrap :is(.ld-deck, .ld-p, .ld-sum-peek, .ld-sum ol, .ld-key, .ld-note p, .lb-tl-t, .lb-vs-t, .lb-fold p, .lb-call) { font-size: var(--ld-font, 16.5px); }
  .ld-wrap :is(.lb-tl-d, .lb-stat-l, .lb-stat-s, .lb-bars-t, .lb-bar-l, .lb-bar-v, .lb-vs-l, .lb-fold summary) { font-size: calc(var(--ld-font, 16.5px) * .82); }
  .ld-wrap :is(.ld-sec-h, .lb-stat-v) { font-size: calc(var(--ld-font, 16.5px) * 1.58); }
  .ld-wrap .ld-axlist li { font-size: calc(var(--ld-font, 16.5px) * .91); }
  .ld-wrap .ld-src-t { font-size: calc(var(--ld-font, 16.5px) * .88); }
  :is(.lt-wrap, .ld-wrap, .lt-dlg) :is(a, button):hover { filter: none; }
  .ld-wrap .ld-opt:hover:not(:disabled) { background: #fff; }

`;
