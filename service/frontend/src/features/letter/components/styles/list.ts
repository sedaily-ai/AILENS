/** 레터 CSS — 목록 화면(단순 레이어·2단 레이아웃·목록 행·톤앤매너). 합치는 순서는 letterStyles.ts(뒤에 오는 규칙이 앞을 덮는다). */
export const LIST_CSS = `
  /* ── 단순한 레이어(2026-10-11): 그라데이션·장식 없이 단색 바탕, 1px 헤어라인, 굵은 산세리프 제목, 포인트 색 하나(파랑). 참고: 뉴닉·요즘IT·퍼블리·Substack. */
  .lt-wrap { --ink: #111827; --blue: #2f5fcf; --line: #e5e7eb; --soft: #f6f7f9; }
  .lt-hero { padding: 4px 0 18px; }
  .lt-eyebrow { color: var(--blue); font-weight: 700; letter-spacing: .04em; }
  .lt-h1 { margin: 8px 0 0; font-family: inherit; font-size: clamp(24px, 3.6vw, 32px); font-weight: 800; letter-spacing: -0.02em; line-height: 1.3; color: var(--ink); text-wrap: balance; }
  .lt-sub { margin: 10px 0 0; font-size: 15px; color: #6b7280; max-width: 560px; }
  .lt-etabs { display: flex; gap: 4px; overflow-x: auto; margin: 0 0 24px; padding: 0 0 14px; border-bottom: 1px solid var(--line); scrollbar-width: none; }
  .lt-etabs::-webkit-scrollbar { display: none; }
  .lt-etab { flex: none; width: 92px; display: flex; flex-direction: column; align-items: center; gap: 9px; padding: 4px 0; border: 0; background: none; font: inherit; color: #6b7280; cursor: pointer; outline: none; -webkit-tap-highlight-color: transparent; }
  .lt-etab-ring { display: grid; place-items: center; width: 54px; height: 54px; border-radius: 50%; border: 1px solid var(--line); overflow: hidden; background: var(--tone-bg, var(--soft)); font-size: 14px; font-weight: 700; color: #374151; }
  .lt-etab { opacity: .72; transition: opacity .15s; }
  .lt-etab:hover { opacity: .85; }
  .lt-etab[aria-pressed='true'] { opacity: 1; }
  .lt-etab[aria-pressed='true'] .lt-etab-text::after { content: ''; width: 16px; height: 2px; margin-top: 5px; border-radius: 2px; background: var(--ink); }
  .lt-etab-all .lt-etab-ring { background: var(--soft); }
  .lt-etab-text { display: flex; flex-direction: column; align-items: center; gap: 1px; line-height: 1.3; text-align: center; }
  .lt-etab-text strong { font-size: 14px; font-weight: 700; color: #374151; }
  .lt-etab[aria-pressed='true'] .lt-etab-text strong { color: var(--ink); }
  .lt-etab-text em { font-style: normal; font-size: 11.5px; font-weight: 400; color: #9ca3af; white-space: nowrap; max-width: 90px; overflow: hidden; text-overflow: ellipsis; }
  .lt-avatar-img { object-position: center 18%; }
  .lt-eintro { grid-template-columns: 104px minmax(0, 1fr); gap: 24px; margin: 0 0 32px; padding: 24px; border: 1px solid var(--line); border-radius: 16px; background: #fff; box-shadow: none; }
  .lt-eintro-photo { padding: 0; border: 1px solid var(--line); border-radius: 50%; background: var(--soft); box-shadow: none; transform: none; overflow: hidden; line-height: 0; width: 104px; height: 104px; }
  .lt-eintro-photo .lt-avatar { width: 104px !important; height: 104px !important; border-radius: 50% !important; }
  .lt-eintro-name h2 { font-family: inherit; font-size: 24px; font-weight: 800; letter-spacing: -0.02em; }
  .lt-ed-badge { border: 0; background: var(--soft); color: #6b7280; font-weight: 600; }
  .lt-ed-mbti { background: var(--soft); color: #374151; letter-spacing: .03em; }
  .lt-eintro-role { margin-top: 2px; color: #6b7280; font-weight: 600; }
  .lt-eintro-quote { margin: 14px 0 0; padding: 0; border: 0; background: none; font-size: 15.5px; line-height: 1.8; color: #1f2937; max-width: 620px; }
  .lt-eintro-scope { margin-top: 12px; color: #6b7280; }
  .lt-eintro-scope span { margin-right: 8px; padding: 0; background: none; font-size: 12.5px; font-weight: 700; color: #374151; }
  .lt-eintro-actions { gap: 8px; margin-top: 18px; }
  .lt-eintro-sub, .lt-int-btn, .lt-dlg-primary { border: 0; box-shadow: none; background: var(--blue); }
  .lt-eintro-sub:hover, .lt-int-btn:hover, .lt-dlg-primary:hover:not(:disabled) { background: #254eb0; transform: none; box-shadow: none; }
  .lt-eintro-sub { height: 40px; padding: 0 20px; font-size: 14px; }
  .lt-eintro-btn { height: 40px; border: 1px solid var(--line); box-shadow: none; color: #374151; font-weight: 600; }
  .lt-eintro-btn:hover { background: var(--soft); }
  .lt-eintro-btn[aria-pressed='true'] { background: var(--soft); border-color: #cbd5e1; color: var(--ink); }
  .lt-ibar-row { border: 0; border-radius: 12px; background: var(--soft); box-shadow: none; }
  .lt-card { border: 1px solid var(--line); border-radius: 16px; box-shadow: none; background: #fff; }
  .lt-card:hover { border-color: #b8c0cc; box-shadow: none; transform: none; }
  .lt-card-feat { border: 1px solid var(--line); background: var(--soft); box-shadow: none; }
  .lt-card-title { font-family: inherit; font-weight: 800; letter-spacing: -0.015em; line-height: 1.4; color: var(--ink); }
  .lt-card-feat .lt-card-title { font-size: clamp(22px, 3.2vw, 28px); }
  .lt-card-ed { display: inline-flex; align-items: center; gap: 5px; padding: 0; border: 0; background: none; font-size: 12.5px; font-weight: 600; color: #6b7280; }
  .lt-card-ed .lt-avatar { width: 20px; height: 20px; border: 1px solid var(--line); }
  .lt-card-cat { flex-wrap: wrap; }
  .lt-sec-h { font-size: 13px; font-weight: 700; color: #6b7280; }
  .lt-searchbox { border-radius: 10px; border-color: var(--line); }
  .lt-dlg { border: 0; border-radius: 20px; box-shadow: 0 20px 60px rgba(17,24,39,.22); }
  .lt-dlg-h { font-family: inherit; font-weight: 800; letter-spacing: -0.02em; }
  .lt-dlg-faces { display: flex; margin: 0 0 12px; }
  .lt-dlg-face { margin-right: -8px; border: 2px solid #fff; border-radius: 50%; overflow: hidden; background: #fff; box-shadow: none; line-height: 0; }
  .lt-dlg-promise { border: 0; border-radius: 12px; background: #f6f7f9; box-shadow: none; }
  .lt-seg button { border: 1px solid #e5e7eb; box-shadow: none; }
  .lt-seg button[aria-pressed='true'] { border-color: #2f5fcf; background: #2f5fcf; color: #fff; box-shadow: none; transform: none; }
  @media (max-width: 640px) { .lt-hero { padding-bottom: 18px; } .lt-eintro { grid-template-columns: 1fr; padding: 20px; gap: 16px; } .lt-etab { width: 84px; } }

  /* ── 2단 레이아웃(2026-10-11): 왼쪽 레터 목록(메인) + 오른쪽 고정 패널 */
  .lt-layout { display: grid; grid-template-columns: minmax(0, 1fr) 316px; gap: 48px; align-items: start; }
  .lt-main { min-width: 0; }
  .lt-aside { position: sticky; top: 84px; display: grid; gap: 14px; }
  .lt-toolbar { margin: 0 0 6px; padding-top: 0; align-items: center; }
  .lt-main .lt-searchbox { flex: 0 1 220px; height: 36px; }
  .lt-rows { display: block; }
  .lt-row { padding: 22px 0; border-bottom: 1px solid var(--line); }
  .lt-row:first-child { padding-top: 16px; }
  .lt-layout { margin-top: 2px; }
  .lt-row-link { display: block; color: inherit; text-decoration: none; }
  .lt-row-meta { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 10px; font-size: 12.5px; font-weight: 600; color: #6b7280; }
  .lt-row-dim { margin-left: auto; font-weight: 400; color: #9ca3af; font-variant-numeric: tabular-nums; }
  .lt-row-new { padding: 1px 7px; border-radius: 5px; background: var(--blue); color: #fff; font-size: 11px; font-weight: 800; letter-spacing: .04em; }
  .lt-row-title { margin: 8px 0 0; font-family: inherit; font-size: 21px; font-weight: 800; letter-spacing: -0.015em; line-height: 1.4; color: var(--ink); }
  .lt-row-link:hover .lt-row-title { color: var(--blue); }
  .lt-row-deck { margin: 8px 0 0; font-size: 14.5px; line-height: 1.65; color: #6b7280; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .lt-row-foot { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 8px; margin-top: 12px; }
  .lt-row-axes { display: inline-flex; align-items: center; gap: 10px; margin-right: 6px; font-size: 12.5px; font-weight: 700; color: #374151; }
  .lt-row-axes span { display: inline-flex; align-items: center; gap: 5px; }
  .lt-row-axes i { width: 7px; height: 7px; border-radius: 50%; }
  .lt-row-topic { padding: 2px 9px; border: 0; border-radius: 999px; background: var(--soft); font: inherit; font-size: 12px; font-weight: 600; color: #4b5563; cursor: pointer; }
  .lt-row-topic:hover { background: #e9ecf1; }
  .lt-aside-card { padding: 20px; border: 1px solid var(--line); border-radius: 16px; background: #fff; }
  .lt-aside-h { margin: 0; font-size: 16px; font-weight: 800; letter-spacing: -0.01em; color: var(--ink); }
  .lt-aside-p { margin: 8px 0 0; font-size: 13.5px; line-height: 1.65; color: #6b7280; }
  .lt-aside-axes { margin: 14px 0 0; padding: 0; list-style: none; display: grid; gap: 10px; }
  .lt-aside-axes li { display: grid; grid-template-columns: 8px auto 1fr; align-items: center; gap: 8px; font-size: 13.5px; color: #4b5563; }
  .lt-aside-axes i { width: 8px; height: 8px; border-radius: 50%; }
  .lt-aside-axes b { color: var(--ink); }
  .lt-eintro { display: block; margin: 0; padding: 20px; border: 1px solid var(--line); border-radius: 16px; background: #fff; }
  .lt-eintro-head { display: flex; align-items: center; gap: 14px; }
  .lt-eintro-photo { width: 72px; height: 72px; flex: none; border: 1px solid var(--line); border-radius: 50%; overflow: hidden; background: var(--soft); box-shadow: none; transform: none; line-height: 0; }
  .lt-eintro-photo .lt-avatar { width: 72px !important; height: 72px !important; border-radius: 50% !important; }
  .lt-eintro-name { display: flex; align-items: center; gap: 8px; }
  .lt-eintro-name h2 { margin: 0; font-size: 22px; }
  .lt-eintro-role { margin: 2px 0 0; font-size: 13.5px; }
  .lt-eintro-quote { margin: 16px 0 0; font-size: 14.5px; line-height: 1.75; }
  .lt-eintro-scope { margin: 12px 0 0; font-size: 12.5px; line-height: 1.7; }
  .lt-eintro-scope span { display: block; margin: 0 0 2px; }
  .lt-eintro-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 18px; }
  .lt-eintro-sub { grid-column: 1 / -1; width: 100%; height: 42px; }
  .lt-eintro-btn { height: 38px; padding: 0 10px; }
  .lt-eintro-ai { margin: 14px 0 0; font-size: 11.5px; color: #9ca3af; }
  .lt-aside .lt-ibar { margin: 0; }
  .lt-aside .lt-ibar-row { display: grid; gap: 12px; padding: 16px; }
  .lt-aside .lt-ibar-actions { justify-content: flex-start; }
  @media (max-width: 900px) { .lt-layout { grid-template-columns: 1fr; gap: 24px; } .lt-aside { position: static; order: -1; } .lt-eintro-actions { grid-template-columns: repeat(3, auto); } .lt-eintro-sub { grid-column: auto; width: auto; } }

  /* ── 사이트 톤앤매너 정렬(2026-10-11): 본문 폭·여백, 기사 제목 명조(Noto Serif KR), 탭 선택은 파랑 밑줄 — 시그널 등 다른 페이지와 같은 규칙 */
  .lt-wrap { max-width: 1200px; padding-left: clamp(24px, 3.5vw, 44px); padding-right: clamp(24px, 3.5vw, 44px); }
  .lt-h1 { font-family: "Noto Serif KR", serif; font-weight: 700; letter-spacing: -0.01em; }
  .lt-row-title { font-family: "Noto Serif KR", serif; font-weight: 700; letter-spacing: -0.01em; font-size: 21px; }
  .lt-etabs { gap: 2px; padding-bottom: 0; margin-bottom: 26px; }
  .lt-etab { padding-bottom: 12px; border-bottom: 2px solid transparent; margin-bottom: -1px; }
  .lt-etab[aria-pressed='true'] { border-bottom-color: var(--blue); }
  .lt-etab[aria-pressed='true'] .lt-etab-text::after { display: none; }
  .lt-etab[aria-pressed='true'] .lt-etab-text strong { color: var(--blue); }
  .lt-eintro-name h2 { font-family: "Noto Serif KR", serif; font-weight: 700; }
  .lt-dlg-sm { width: min(420px, 100%); }
  .lt-dlg-link { display: flex; align-items: center; justify-content: center; text-decoration: none; }
  .lt-dlg-sm .lt-dlg-h { margin-right: 28px; }

  /* 선택 표시: 밑줄 대신 옅은 회색 둥근 배경(2026-10-11) */
  .lt-etabs { border-bottom: 0; gap: 2px; margin-bottom: 28px; padding: 0; }
  .lt-etab { padding: 10px 0; border-bottom: 0; margin-bottom: 0; border-radius: 16px; transition: opacity .15s, background .15s; }
  .lt-etab:hover { background: #fafafb; }
  .lt-etab[aria-pressed='true'] { background: var(--soft); border-bottom: 0; }
  .lt-etab[aria-pressed='true'] .lt-etab-text strong { color: var(--ink); }
  .lt-etab[aria-pressed='true'] .lt-etab-ring { border-color: var(--line); box-shadow: none; transform: none; }
  .lt-etab:hover .lt-etab-ring { transform: none; }

  /* 목록 행: 왼쪽 에디터 일러스트(권고 C) */
  .lt-row { display: flex; gap: 20px; align-items: flex-start; }
  .lt-row-main { min-width: 0; flex: 1; }
  .lt-row-thumb { flex: none; width: 84px; height: 84px; border-radius: 17px; overflow: hidden; border: 1px solid var(--line); line-height: 0; margin-top: 2px; }
  .lt-row-thumb:hover { border-color: #b8c0cc; }
  .lt-row-thumb .lt-avatar { display: block; }
  @media (max-width: 640px) { .lt-row { gap: 14px; } .lt-row-thumb { width: 56px; height: 56px; border-radius: 12px; } .lt-row-thumb .lt-avatar { width: 56px !important; height: 56px !important; border-radius: 12px !important; } }

`;
