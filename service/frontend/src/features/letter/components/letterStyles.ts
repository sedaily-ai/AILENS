// 레터 화면 공용 스타일(styled-jsx 대신 문자열 <style>을 쓰는 이 코드베이스의 방식). 색은 사이트 톤(서울경제 파랑 #5b8def 계열, 부드러운 그림자, 넉넉한 여백).
export const LETTER_CSS = `
  .lt-wrap, .ld-wrap { word-break: keep-all; overflow-wrap: break-word; }
  .lt-wrap { max-width: 1040px; margin: 0 auto; padding: clamp(20px, 4vw, 44px) 0 96px; }
  .lt-hero { padding: clamp(4px, 1vw, 12px) 0 20px; }
  .lt-eyebrow { font-size: 13px; font-weight: 700; letter-spacing: .06em; color: #5b8def; }
  .lt-h1 { margin: 8px 0 0; font-family: "Noto Serif KR", serif; font-size: clamp(24px, 4.2vw, 34px); font-weight: 700; line-height: 1.3; letter-spacing: -0.02em; color: #111827; text-wrap: balance; }
  .lt-sub { margin: 10px 0 0; font-size: 15px; line-height: 1.7; color: #4b5563; max-width: 640px; }
  .lt-etabs { display: flex; gap: 6px; overflow-x: auto; padding: 6px 2px 14px; margin: 0 -2px 10px; scrollbar-width: none; }
  .lt-etabs::-webkit-scrollbar { display: none; }
  .lt-etab { flex: none; width: 84px; display: flex; flex-direction: column; align-items: center; gap: 7px; padding: 6px 0 4px; border: 0; background: none; font: inherit; color: #6b7280; cursor: pointer; }
  .lt-etab-all .lt-etab-ring { background: #eef3ff; color: #2f5fcf; font-size: 15px; font-weight: 700; }
  .lt-etab-text { display: flex; flex-direction: column; align-items: center; line-height: 1.3; text-align: center; }
  .lt-etab-text strong { font-size: 14px; font-weight: 700; color: #374151; }
  .lt-etab-text em { font-style: normal; font-size: 11px; font-weight: 500; color: #8b93a1; white-space: nowrap; max-width: 84px; overflow: hidden; text-overflow: ellipsis; }
  .lt-etab[aria-pressed='true'] .lt-etab-text strong { color: var(--tone-fg, #2f5fcf); }
  .lt-etab-all[aria-pressed='true'] .lt-etab-text strong { color: #2f5fcf; }
  .lt-avatar { display: inline-grid; place-items: center; border-radius: 50%; font-weight: 700; flex: none; }
  .lt-avatar-img { object-fit: cover; object-position: center 20%; }
  .lt-eintro { display: grid; grid-template-columns: 132px minmax(0, 1fr); gap: 28px; align-items: start; margin: 4px 0 28px; padding: 28px; border-radius: 22px; background: linear-gradient(180deg, var(--tone-bg, #f9fafc) 0%, #ffffff 62%); border: 1px solid #e8ecf2; }
  .lt-eintro-photo { padding: 6px; border-radius: 30px; background: #fff; box-shadow: 0 6px 20px rgba(17,24,39,.08); }
  .lt-eintro-name { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
  .lt-eintro-name h2 { margin: 0; font-family: "Noto Serif KR", serif; font-size: 28px; font-weight: 700; color: #111827; }
  .lt-eintro-role { margin: 4px 0 0; font-size: 14px; font-weight: 700; color: var(--tone-fg, #4b5563); }
  .lt-eintro-quote { margin: 16px 0 0; padding: 2px 0 2px 16px; border-left: 3px solid var(--tone-fg, #cbd5e1); font-size: 16px; line-height: 1.85; color: #1f2937; max-width: 620px; }
  .lt-eintro-scope { margin: 14px 0 0; font-size: 13.5px; line-height: 1.7; color: #4b5563; }
  .lt-eintro-scope span { margin-right: 10px; padding: 2px 8px; border-radius: 6px; background: #eef1f6; font-size: 12px; font-weight: 700; color: #4b5563; }
  .lt-eintro-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 20px; }
  .lt-eintro-sub { height: 42px; padding: 0 22px; border: 0; border-radius: 999px; background: #2f5fcf; font: inherit; font-size: 14.5px; font-weight: 700; color: #fff; cursor: pointer; }
  .lt-eintro-btn { height: 42px; padding: 0 18px; border: 1px solid #d5dbe6; border-radius: 999px; background: #fff; font: inherit; font-size: 14px; font-weight: 700; color: #374151; cursor: pointer; }
  .lt-eintro-btn[aria-pressed='true'] { background: var(--tone-bg, #eef3ff); border-color: var(--tone-fg, #b7cdf5); color: var(--tone-fg, #1f56c0); }
  .lt-ed-badge { padding: 2px 9px; border-radius: 999px; background: #f1f3f6; color: #4b5563; font-family: inherit; font-size: 12px; font-weight: 700; }
  .lt-ed-mbti { background: var(--tone-fg, #111827); color: #fff; letter-spacing: .04em; }
  @media (max-width: 640px) { .lt-eintro { grid-template-columns: 1fr; gap: 16px; padding: 20px; } .lt-eintro-photo { justify-self: start; } }
  .lt-ed-follow { height: 32px; padding: 0 14px; border: 1px solid #d5dbe6; border-radius: 999px; background: #fff; font: inherit; font-size: 13px; font-weight: 700; color: #374151; cursor: pointer; align-self: flex-start; }
  .lt-ed-follow[aria-pressed='true'] { background: #1f56c0; border-color: #1f56c0; color: #fff; }
  .lt-ed-follow:disabled { opacity: .5; cursor: default; }
  .lt-ed-follow-lg { height: 40px; padding: 0 20px; font-size: 14px; }
  .lt-sec-inline { margin: 0; }
  .lt-ed-head { display: flex; align-items: flex-start; gap: 20px; padding: 20px 0 6px; flex-wrap: wrap; }
  .lt-ed-headtext { flex: 1 1 320px; min-width: 0; }
  .lt-ed-h1 { margin: 0; font-family: "Noto Serif KR", serif; font-size: 26px; font-weight: 700; color: #111827; display: flex; align-items: center; gap: 10px; }
  .lt-ed-badge { padding: 2px 9px; border-radius: 999px; background: #f1f3f6; color: #4b5563; font-family: inherit; font-size: 12px; font-weight: 700; }
  .lt-ed-sub { margin: 4px 0 0; font-size: 14px; font-weight: 600; color: #4b5563; }
  .lt-ed-bio { margin: 10px 0 0; max-width: 560px; font-size: 15px; line-height: 1.7; color: #374151; }
  .lt-ed-topics { display: flex; flex-wrap: wrap; gap: 6px; margin: 14px 0 0; padding: 0; list-style: none; }
  .lt-ed-cat { padding: 3px 10px; border-radius: 999px; background: #2f5fcf; color: #fff; font-size: 12.5px; font-weight: 700; }
  .lt-ed-note { margin: 14px 0 0; font-size: 12.5px; color: #6b7280; }
  .ld-editor { margin-left: 6px; padding: 2px 9px; border-radius: 999px; background: #f1f3f6; color: #374151; font-size: 12.5px; font-weight: 700; text-decoration: none; }
  .ld-editor:hover { background: #e4e9f2; }
  .lt-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px 20px; flex-wrap: wrap; margin: 0 0 16px; }
  .lt-filters { display: flex; gap: 8px; flex-wrap: wrap; }
  .lt-searchbox { flex: 0 1 240px; min-width: 160px; height: 36px; padding: 0 14px; border: 1px solid #e5e7eb; border-radius: 999px; font: inherit; font-size: 14px; background: #fff; }
  .lt-searchbox:focus { outline: 2px solid #5b8def; outline-offset: 1px; }
  .lt-activefilter { display: flex; align-items: center; gap: 8px; margin: -4px 0 16px; font-size: 13px; font-weight: 600; color: #6b7280; }
  .lt-ibar { margin: 0 0 24px; }
  .lt-ibar-row { display: flex; align-items: center; justify-content: space-between; gap: 12px 20px; flex-wrap: wrap; padding: 12px 16px; border-radius: 14px; background: #f6f8fb; border: 1px solid #e8ecf2; }
  .lt-ibar-msg { margin: 0; font-size: 13.5px; line-height: 1.55; color: #4b5563; }
  .lt-ibar-msg strong { color: #111827; }
  .lt-ibar-mine { display: flex; align-items: center; gap: 10px; min-width: 0; flex-wrap: wrap; }
  .lt-ibar-label { font-size: 13px; font-weight: 700; color: #111827; }
  .lt-ibar-chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; padding: 0; list-style: none; }
  .lt-ibar-chips .lt-topic { background: #fff; border: 1px solid #e5e9f0; text-decoration: none; }
  .lt-ibar-more { padding: 3px 4px; font-size: 12.5px; font-weight: 700; color: #6b7280; }
  .lt-ibar-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .lt-ibar-toggle { height: 32px; padding: 0 14px; border: 1px solid #d5dbe6; border-radius: 999px; background: #fff; font: inherit; font-size: 13px; font-weight: 700; color: #374151; cursor: pointer; }
  .lt-ibar-toggle[aria-pressed='true'] { background: #1f56c0; border-color: #1f56c0; color: #fff; }
  .lt-ibar-mail { height: 32px; padding: 0 14px; border: 0; border-radius: 999px; background: #2f5fcf; font: inherit; font-size: 13px; font-weight: 700; color: #fff; cursor: pointer; }
  .lt-ibar .lt-int-edit, .lt-ibar .lt-sub-box { margin: 10px 0 0; }
  .lt-chip { height: 36px; padding: 0 16px; border: none; border-radius: 999px; background: #f1f3f6; font: inherit; font-size: 14px; font-weight: 600; color: #374151; cursor: pointer; transition: background .15s; }
  .lt-chip:hover { background: #e4e9f2; }
  .lt-chip[aria-pressed='true'] { background: #2f5fcf; color: #fff; }
  .lt-sec-h { margin: 36px 0 14px; font-size: 14px; font-weight: 700; color: #6b7280; }
  .lt-grid { display: grid; gap: 18px; grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr)); }
  .ld-sum-peek { margin: 6px 0 0; font-size: 14px; line-height: 1.6; color: #374151; display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden; }
  .lt-strip { display: flex; gap: 3px; width: 44px; height: 4px; margin-bottom: 2px; }
  .lt-strip i { flex: 1; border-radius: 2px; }
  .lt-card { display: flex; flex-direction: column; gap: 10px; padding: 22px 22px 18px; border-radius: 18px; background: #fff; border: 1px solid #eceef2; box-shadow: 0 1px 2px rgba(17,24,39,.04); text-decoration: none; color: inherit; transition: box-shadow .2s ease, transform .2s ease, border-color .2s; }
  .lt-card:hover { box-shadow: 0 10px 28px rgba(17,24,39,.09); transform: translateY(-2px); border-color: #dfe3ea; }
  .lt-card-feat { padding: clamp(24px, 4vw, 36px); background: linear-gradient(180deg, #f7faff 0%, #ffffff 70%); border-color: #dbe6fb; }
  .lt-card-cat { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; color: #6b7280; }
  .lt-today { padding: 2px 9px; border-radius: 999px; background: #2f5fcf; color: #fff; font-size: 12px; font-weight: 700; }
  .lt-moa { padding: 2px 9px; border-radius: 999px; background: #eef0f4; color: #374151; font-size: 12px; font-weight: 700; }
  .lt-no { margin-left: auto; color: #6b7280; font-weight: 500; }
  .lt-card-title { margin: 0; font-family: "Noto Serif KR", serif; font-size: 19px; font-weight: 700; line-height: 1.42; letter-spacing: -0.015em; color: #111827; text-wrap: pretty; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
  .lt-card-feat .lt-card-title { font-size: clamp(23px, 3.6vw, 30px); line-height: 1.35; -webkit-line-clamp: unset; display: block; overflow: visible; }
  .lt-card-deck { margin: 0; font-size: 14.5px; line-height: 1.65; color: #4b5563; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
  .lt-card-feat .lt-card-deck { font-size: 16px; -webkit-line-clamp: 4; }
  .lt-axes { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 2px; }
  .lt-int-prompt { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 18px 20px; border-radius: 16px; background: #f8fafc; border: 1px solid #e5e7eb; }
  .lt-int-prompt strong { display: block; font-size: 15px; color: #111827; }
  .lt-int-prompt p { margin: 4px 0 0; font-size: 13px; color: #6b7280; }
  .lt-int-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
  .lt-int-head .lt-sec-h { margin: 0; }
  .lt-int-chips { display: flex; flex-wrap: wrap; gap: 8px; margin: 10px 0 14px; padding: 0; list-style: none; }
  .lt-int-sub { margin: 14px 0 0; font-size: 13px; font-weight: 700; color: #4b5563; }
  .lt-int-btn { padding: 9px 16px; border-radius: 999px; border: 0; background: #2f5fcf; color: #fff; font-size: 14px; font-weight: 700; cursor: pointer; white-space: nowrap; }
  .lt-int-btn:disabled { opacity: .5; cursor: default; }
  .lt-int-link { padding: 6px 4px; border: 0; background: none; color: #4b5563; font-size: 13.5px; text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
  .lt-int-edit { padding: 20px; border-radius: 16px; border: 1px solid #e5e7eb; background: #fff; }
  .lt-int-edit .lt-sec-h { margin: 0 0 4px; }
  .lt-int-details { margin-top: 14px; }
  .lt-int-details summary { cursor: pointer; font-size: 14px; font-weight: 600; color: #374151; }
  .lt-int-group .lt-int-chips { margin: 8px 0 4px; }
  .lt-int-actions { display: flex; align-items: center; gap: 14px; margin-top: 18px; flex-wrap: wrap; }
  .lt-dlg-back { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 16px; background: rgba(17,24,39,.5); }
  .lt-dlg { position: relative; width: min(500px, 100%); max-height: calc(100vh - 32px); overflow-y: auto; padding: 28px 26px 24px; border-radius: 22px; background: #fff; box-shadow: 0 24px 60px rgba(17,24,39,.28); }
  .lt-dlg-x { position: absolute; top: 12px; right: 14px; width: 36px; height: 36px; border: 0; border-radius: 50%; background: transparent; font-size: 26px; line-height: 1; color: #6b7280; cursor: pointer; }
  .lt-dlg-x:hover { background: #f1f3f6; }
  .lt-dlg-h { margin: 0 28px 0 0; font-family: "Noto Serif KR", serif; font-size: 21px; font-weight: 700; line-height: 1.4; color: #111827; }
  .lt-dlg-lead { margin: 8px 0 0; font-size: 14px; line-height: 1.65; color: #4b5563; }
  .lt-dlg-promise { margin: 16px 0 0; padding: 14px 16px; list-style: none; display: grid; gap: 6px; border-radius: 14px; background: #f6f8fb; font-size: 13.5px; color: #374151; }
  .lt-dlg-promise li::before { content: '✓'; margin-right: 8px; font-weight: 700; color: #1f56c0; }
  .lt-dlg-field { display: grid; gap: 6px; margin-top: 20px; font-size: 13px; font-weight: 700; color: #374151; }
  .lt-dlg-field input { height: 48px; padding: 0 14px; border: 1px solid #d1d5db; border-radius: 12px; font: inherit; font-size: 16px; font-weight: 400; color: #111827; background: #fff; }
  .lt-dlg-field input:focus { outline: 2px solid #5b8def; outline-offset: 1px; border-color: transparent; }
  .lt-dlg-field input[aria-invalid='true'] { border-color: #dc2626; }
  .lt-dlg-group { margin: 18px 0 0; padding: 0; border: 0; }
  .lt-dlg-group legend { padding: 0; margin-bottom: 8px; font-size: 13px; font-weight: 700; color: #374151; }
  .lt-seg { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
  .lt-seg-3 { grid-template-columns: repeat(3, 1fr); }
  .lt-seg button { display: grid; gap: 2px; justify-items: center; padding: 11px 8px; border: 1px solid #dfe3ea; border-radius: 12px; background: #fff; font: inherit; color: #374151; cursor: pointer; }
  .lt-seg button b { font-size: 14px; font-weight: 700; }
  .lt-seg button small { font-size: 11.5px; color: #6b7280; }
  .lt-seg button[aria-pressed='true'] { border-color: #2f5fcf; background: #2f5fcf; color: #fff; }
  .lt-seg button[aria-pressed='true'] small { color: #d1d5db; }
  .lt-dlg-consent { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 20px; padding-top: 16px; border-top: 1px solid #eef0f4; }
  .lt-dlg-consent label { display: flex; align-items: center; gap: 10px; font-size: 14px; color: #1f2937; cursor: pointer; }
  .lt-dlg-consent input { width: 18px; height: 18px; accent-color: #2f5fcf; }
  .lt-dlg-more { border: 0; background: none; font: inherit; font-size: 13px; color: #6b7280; text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
  .lt-dlg-detail { margin: 10px 0 0; padding: 12px 14px; border-radius: 12px; background: #f6f8fb; font-size: 12.5px; line-height: 1.7; color: #4b5563; }
  .lt-dlg-detail a { color: #2563eb; text-decoration: underline; }
  .lt-dlg-err { margin: 8px 0 0; font-size: 13px; color: #b91c1c; }
  .lt-dlg-primary { display: block; width: 100%; height: 50px; margin-top: 20px; border: 0; border-radius: 14px; background: #2f5fcf; font: inherit; font-size: 16px; font-weight: 700; color: #fff; cursor: pointer; }
  .lt-dlg-primary:hover:not(:disabled) { background: #254eb0; }
  .lt-dlg-primary:disabled { background: #cbd2dc; cursor: default; }
  .lt-dlg-foot { margin: 10px 0 0; text-align: center; font-size: 12.5px; color: #6b7280; }
  .lt-dlg-done { text-align: center; }
  .lt-dlg-done .lt-dlg-h { margin: 14px 0 0; }
  .lt-dlg-done .lt-dlg-lead { margin-top: 8px; }
  .lt-dlg-check { display: inline-grid; place-items: center; width: 52px; height: 52px; border-radius: 50%; background: #e7f6ec; font-size: 26px; font-weight: 700; color: #1f7a3d; }
  .lt-dlg-steps { margin: 18px 0 0; padding: 0; list-style: none; display: grid; gap: 10px; text-align: left; }
  .lt-dlg-steps li { display: flex; align-items: flex-start; gap: 12px; padding: 12px 14px; border-radius: 12px; background: #f6f8fb; font-size: 14px; line-height: 1.55; color: #1f2937; }
  .lt-dlg-steps b { flex: none; width: 24px; height: 24px; border-radius: 50%; background: #2f5fcf; font-size: 13px; line-height: 24px; text-align: center; color: #fff; }
  .lt-dlg-tip { margin: 14px 0 0; font-size: 12.5px; line-height: 1.6; color: #6b7280; }
  .lt-sub-box { display: flex; gap: 16px; align-items: center; justify-content: space-between; flex-wrap: wrap; margin: 20px 0 8px; padding: 18px 20px; border: 1px solid #e5e7eb; border-radius: 14px; background: #fafbfc; }
  .lt-sub-box strong { font-size: 15px; color: #111827; }
  .lt-sub-box p { margin: 4px 0 0; font-size: 13.5px; line-height: 1.6; color: #4b5563; }
  .lt-sub-form { flex-direction: column; align-items: stretch; justify-content: flex-start; gap: 14px; }
  .lt-sub-form { flex-wrap: nowrap; }
  .lt-sub-row { display: flex; gap: 12px; flex-wrap: wrap; }
  .lt-sub-field { display: flex; flex-direction: column; gap: 6px; font-size: 13px; font-weight: 700; color: #374151; flex: 1 1 160px; }
  .lt-sub-form > .lt-sub-field, .lt-sub-form > .lt-sub-row { flex: 0 0 auto; }
  .lt-sub-field input, .lt-sub-field select { height: 40px; padding: 0 12px; border: 1px solid #d1d5db; border-radius: 10px; font: inherit; font-size: 14px; background: #fff; font-weight: 400; }
  .lt-sub-consent { display: flex; gap: 10px; align-items: flex-start; font-size: 13px; line-height: 1.6; color: #4b5563; }
  .lt-sub-consent input { margin-top: 4px; }
  .lt-sub-consent a { color: #2563eb; text-decoration: underline; }
  .lt-sub-result { flex-direction: column; align-items: flex-start; padding: 28px; }
  .lt-int-err { margin: 12px 0 0; font-size: 13px; color: #b91c1c; }
  .lt-reason { margin: 2px 0 0; font-size: 13px; font-weight: 600; color: #1f56c0; }
  .lt-chip-on { background: #2f5fcf; color: #fff; }
  .lt-topic-btn { cursor: pointer; }
  .lt-topic-btn:hover { background: #e2e8f0; }
  .lt-topic { padding: 3px 10px; border-radius: 999px; background: #f1f5f9; color: #334155; font-size: 12.5px; font-weight: 600; }
  .ld-topics { display: flex; flex-wrap: wrap; gap: 6px; margin: 12px 0 0; padding: 0; list-style: none; }
  .lt-count { font-size: 12.5px; font-weight: 700; color: #374151; padding-left: 4px; }
  .lt-card-meta { display: flex; align-items: center; gap: 6px; margin-top: auto; padding-top: 6px; font-size: 12.5px; color: #6b7280; font-variant-numeric: tabular-nums; }
  .lt-more { margin-left: auto; font-weight: 700; color: #2f5fcf; }
  .lt-empty { padding: 56px 0; text-align: center; color: #6b7280; font-size: 15px; }

  .ld-wrap { max-width: 720px; margin: 0 auto; padding: clamp(16px, 3vw, 32px) 0 96px; }
  .ld-back { display: inline-flex; align-items: center; gap: 4px; font-size: 14px; font-weight: 600; color: #6b7280; text-decoration: none; }
  .ld-back:hover { color: #111827; }
  .ld-head { padding: 20px 0 8px; }
  .ld-cat { display: flex; align-items: center; gap: 8px; font-size: 13.5px; font-weight: 600; color: #6b7280; }
  .ld-title { margin: 12px 0 0; font-family: "Noto Serif KR", serif; font-size: clamp(25px, 5vw, 34px); font-weight: 700; line-height: 1.35; letter-spacing: -0.02em; color: #111827; text-wrap: balance; }
  .ld-deck { margin: 14px 0 0; font-size: 16.5px; line-height: 1.7; color: #4b5563; }
  .ld-axlist { display: grid; gap: 8px; margin: 20px 0 0; padding: 0; list-style: none; }
  .ld-axlist li { display: flex; align-items: center; gap: 10px; font-size: 15px; color: #374151; }
  .ld-meta { margin-top: 16px; font-size: 13px; color: #6b7280; font-variant-numeric: tabular-nums; }
  .ld-mock { margin: 16px 0 0; padding: 10px 14px; border-radius: 10px; background: #fff7e6; color: #8a5a00; font-size: 13px; line-height: 1.55; }
  .ld-panel { margin: 28px 0 0; padding: 20px 20px 8px; border-radius: 16px; background: #f8fafc; border: 1px solid #edf0f5; }
  .ld-panel-h { display: flex; align-items: baseline; gap: 8px; margin: 0 0 6px; font-size: 14.5px; font-weight: 700; color: #111827; }
  .ld-panel-h small { font-size: 12.5px; font-weight: 600; color: #6b7280; }
  .ld-src { display: grid; grid-template-columns: 24px minmax(0,1fr) auto; align-items: center; gap: 12px; padding: 12px 0; border-top: 1px solid #edf0f5; text-decoration: none; color: inherit; }
  .ld-src:first-of-type { border-top: none; }
  .ld-src:hover .ld-src-t { color: #3d70de; }
  .ld-ext { color: #6b7280; font-weight: 700; }
  .ld-src-ph { cursor: default; }
  .ld-src-ph .ld-src-t { color: #4b5563; font-weight: 500; }
  .ld-src-n { width: 22px; height: 22px; border-radius: 50%; background: #e8edf7; color: #4b5d8a; font-size: 12px; font-weight: 700; display: grid; place-items: center; }
  .ld-src-t { font-size: 14.5px; font-weight: 600; line-height: 1.45; color: #1f2937; transition: color .15s; }
  .ld-src-o { margin-top: 2px; font-size: 12px; color: #6b7280; }
  .ld-src-ax { display: flex; gap: 4px; flex-wrap: wrap; justify-content: flex-end; }
  .ld-sum { margin: 24px 0 0; padding: 20px; border-radius: 16px; background: #f4f8ff; border: 1px solid #dbe6fb; }
  .ld-sum-h { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .ld-sum-h strong { font-size: 14.5px; color: #1d3f8f; }
  .ld-sum-btn { border: none; background: none; font: inherit; font-size: 13px; font-weight: 700; color: #2f5fcf; cursor: pointer; }
  .ld-sum ol { margin: 12px 0 0; padding-left: 22px; list-style: decimal; display: grid; gap: 8px; font-size: 15px; line-height: 1.7; color: #1f2937; }
  .ld-sec { margin-top: 40px; }
  .ld-sec-top { display: flex; align-items: center; gap: 10px; }
  .ld-sec-h { margin: 12px 0 0; font-family: "Noto Serif KR", serif; font-size: 22px; font-weight: 700; line-height: 1.4; letter-spacing: -0.015em; color: #111827; }
  .ld-key { margin: 10px 0 0; padding: 10px 14px; border-left: 3px solid var(--ax, #5b8def); background: #fafbfc; border-radius: 0 10px 10px 0; font-size: 15px; font-weight: 600; line-height: 1.6; color: #1f2937; }
  .ld-p { margin: 16px 0 0; font-size: 16.5px; line-height: 1.95; color: #1f2937; }
  .ld-p a { color: #2f5fcf; text-decoration: underline; text-decoration-color: rgba(47,95,207,.4); text-underline-offset: 3px; font-weight: 600; }
  .ld-p a:hover { text-decoration-color: #2f5fcf; }
  .ld-note { margin-top: 44px; padding: 22px; border-radius: 16px; background: #fff; border: 1px solid #eceef2; box-shadow: 0 1px 2px rgba(17,24,39,.04); }
  .ld-note h2 { margin: 0 0 8px; font-size: 14px; font-weight: 700; color: #6b7280; }
  .ld-note p { margin: 0; font-size: 16px; line-height: 1.85; color: #1f2937; }
  .ld-vote { margin-top: 28px; padding: 22px; border-radius: 16px; background: #f8fafc; border: 1px solid #edf0f5; }
  .ld-vote h2 { margin: 0 0 14px; font-size: 16px; font-weight: 700; line-height: 1.5; color: #111827; }
  .ld-opts { display: grid; gap: 8px; }
  .ld-opt { display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%; padding: 13px 16px; border: 1px solid #dfe3ea; border-radius: 12px; background: #fff; font: inherit; text-align: left; cursor: pointer; transition: border-color .15s, background .15s; position: relative; overflow: hidden; }
  .ld-opt:hover:not(:disabled) { border-color: #5b8def; background: #f7faff; }
  .ld-opt:disabled { cursor: default; }
  .ld-opt-bar { position: absolute; inset: 0 auto 0 0; background: #dbe6fb; z-index: 0; transition: width .5s ease; }
  .ld-opt-body { position: relative; z-index: 1; display: grid; gap: 2px; }
  .ld-opt-l { font-size: 15px; font-weight: 700; color: #111827; }
  .ld-opt-h { font-size: 12.5px; color: #6b7280; }
  .ld-opt-p { position: relative; z-index: 1; font-size: 14px; font-weight: 700; color: #1d3f8f; font-variant-numeric: tabular-nums; }
  .ld-opt[aria-pressed='true'] { border-color: #5b8def; }
  .ld-vote-note { margin: 12px 0 0; font-size: 12.5px; color: #6b7280; }
  .ld-next { margin-top: 20px; padding: 20px 22px; border-radius: 16px; background: #f4f8ff; border: 1px solid #dbe6fb; display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
  .ld-next strong { display: block; font-size: 15px; color: #1d3f8f; }
  .ld-next p { margin: 4px 0 0; font-size: 13.5px; line-height: 1.6; color: #4b5563; }
  .ld-next-btn { height: 42px; padding: 0 22px; border: none; border-radius: 999px; background: #2f5fcf; color: #fff; font: inherit; font-size: 14px; font-weight: 700; cursor: pointer; }
  .ld-next-btn:hover { background: #254eb0; }
  .ld-next-msg { flex-basis: 100%; margin: 0 !important; font-size: 13px !important; color: #1d3f8f !important; font-weight: 600; }
  .ld-foot { margin-top: 36px; font-size: 12.5px; line-height: 1.7; color: #6b7280; }
  .ld-nav { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 28px; }
  .ld-btn { display: inline-flex; align-items: center; height: 44px; padding: 0 20px; border-radius: 999px; background: #2f5fcf; color: #fff; font-size: 14.5px; font-weight: 700; text-decoration: none; }
  .ld-btn.ghost { background: #f1f3f6; color: #111827; }
  @media (max-width: 640px) {
    .lt-card { padding: 18px 18px 16px; border-radius: 16px; }
    .ld-src { grid-template-columns: 24px minmax(0,1fr); }
    .ld-src-ax { grid-column: 2; justify-content: flex-start; }
    .ld-p { font-size: 16px; line-height: 1.9; }
  }
  @media (prefers-reduced-motion: reduce) { .lt-card, .ld-opt-bar { transition: none; } .lt-card:hover { transform: none; } }

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
  .ld-sec { margin-top: 52px; padding-top: 28px; border-top: 1px solid #e5e7eb; }
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
  .ld-wrap { --ld-font: 16.5px; }
  .ld-p { font-size: var(--ld-font, 16.5px); }
  .ld-progress { position: fixed; top: 0; left: 0; right: 0; height: 3px; z-index: 120; pointer-events: none; }
  .ld-progress i { display: block; height: 100%; background: #2f5fcf; transform-origin: 0 50%; transform: scaleX(0); transition: transform .08s linear; }
  .ld-tools { position: fixed; right: 24px; bottom: 24px; z-index: 90; display: flex; gap: 2px; padding: 4px; border: 1px solid #e5e7eb; border-radius: 999px; background: rgba(255,255,255,.96); box-shadow: 0 6px 20px rgba(17,24,39,.12); backdrop-filter: blur(6px); }
  .ld-tools button { min-width: 40px; height: 36px; padding: 0 12px; border: 0; border-radius: 999px; background: none; font: inherit; font-size: 14px; font-weight: 700; color: #374151; cursor: pointer; }
  .ld-tools button small { font-size: 11px; margin-left: 1px; }
  .ld-tools button:hover:not(:disabled) { background: #f1f3f6; }
  .ld-tools button:disabled { opacity: .35; cursor: default; }
  .ld-toc { position: fixed; top: 140px; left: calc(50% + 380px); width: 200px; display: none; }
  .ld-toc ol { margin: 0; padding: 0; list-style: none; display: grid; gap: 2px; border-left: 1px solid #e5e7eb; }
  .ld-toc li a { display: block; padding: 6px 0 6px 14px; margin-left: -1px; border-left: 2px solid transparent; font-size: 13px; line-height: 1.5; color: #9ca3af; text-decoration: none; }
  .ld-toc li a b { margin-right: 8px; font-size: 11.5px; font-variant-numeric: tabular-nums; }
  .ld-toc li a:hover { color: #374151; }
  .ld-toc li.on a { color: #111827; font-weight: 700; border-left-color: #111827; }
  @media (min-width: 1280px) { .ld-toc { display: block; } }
  @media (max-width: 640px) { .ld-tools { right: 12px; bottom: 12px; } }
  .lt-dlg, .lt-dlg-back { --blue: #2f5fcf; --line: #e5e7eb; --soft: #f6f7f9; --ink: #111827; }
  /* 저장·읽음(2026-10-11) */
  .lt-toolbar-r { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .lt-savedtab { height: 36px; padding: 0 14px; border: 1px solid #e5e7eb; border-radius: 999px; background: #fff; font: inherit; font-size: 13px; font-weight: 700; color: #374151; cursor: pointer; }
  .lt-savedtab[aria-pressed='true'] { background: #111827; border-color: #111827; color: #fff; }
  .lt-row-read .lt-row-title { color: #6b7280; }
  .lt-row-read .lt-row-deck { color: #9ca3af; }
  .lt-row-readmark { padding: 1px 7px; border-radius: 5px; background: #f3f4f6; font-size: 11px; font-weight: 700; color: #9ca3af; }
  .lt-row-save { margin-left: auto; display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; border: 0; border-radius: 999px; background: none; font: inherit; font-size: 12.5px; font-weight: 600; color: #9ca3af; cursor: pointer; }
  .lt-row-save:hover { color: #374151; background: #f6f7f9; }
  .lt-row-save[aria-pressed='true'] { color: #2f5fcf; }
  .ld-tools button[aria-pressed='true'] { color: #2f5fcf; }
  .lt-main .lt-toolbar { flex-wrap: nowrap; }
  .lt-toolbar-r { flex-wrap: nowrap; margin-left: auto; }
  .lt-toolbar-r .lt-searchbox { flex: 0 1 200px; }
  .lt-savedtab { white-space: nowrap; }
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
  .ld-editor:hover { background: #f6f7f9; border-color: #cfd5de; color: #111827; text-decoration: none; }
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
  /* 구독 온보딩(선택 단계) */
  .lt-ob { margin-top: 18px; padding-top: 16px; border-top: 1px solid #e5e7eb; text-align: left; }
  .lt-ob-h { margin: 0; font-size: 15px; font-weight: 800; color: #111827; }
  .lt-ob-h small, .lt-ob-q small { margin-left: 6px; font-size: 12px; font-weight: 500; color: #9ca3af; }
  .lt-ob-q { margin: 14px 0 8px; font-size: 13px; font-weight: 700; color: #374151; }
  .lt-ob-chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .lt-ob-chips button { padding: 8px 12px; border: 1px solid #e5e7eb; border-radius: 999px; background: #fff; font: inherit; font-size: 13px; color: #374151; cursor: pointer; }
  .lt-ob-chips button[aria-pressed='true'] { background: #2f5fcf; border-color: #2f5fcf; color: #fff; }
  .lt-ob-actions { display: flex; align-items: center; gap: 10px; margin-top: 16px; }
  .lt-ob-actions .lt-dlg-primary { margin-top: 0; flex: 1; height: 44px; }
  .lt-dlg-skip { border: 0; background: none; font: inherit; font-size: 13px; color: #6b7280; text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
  .lt-ob-rec { margin: 12px 0 0; padding: 0; list-style: none; display: grid; gap: 10px; }
  .lt-ob-rec li { display: flex; align-items: center; gap: 12px; padding: 12px; border: 1px solid #e5e7eb; border-radius: 12px; }
  .lt-ob-rec li > div { flex: 1; min-width: 0; }
  .lt-ob-rec strong { font-size: 14.5px; color: #111827; }
  .lt-ob-rec strong small { margin-left: 4px; font-size: 12px; font-weight: 500; color: #6b7280; }
  .lt-ob-rec p { margin: 4px 0 0; font-size: 12.5px; line-height: 1.6; color: #6b7280; }
  .lt-ob-go { flex: none; padding: 7px 12px; border-radius: 999px; background: #f3f4f6; font-size: 12.5px; font-weight: 700; color: #111827; text-decoration: none; }
  .lt-ob-none, .lt-ob-note { margin: 12px 0 0; font-size: 12.5px; line-height: 1.6; color: #6b7280; }
  .lt-dlg-done .lt-ob .lt-dlg-primary { margin-top: 14px; }
  .lt-eintro-pitch { margin: 12px 0 0; font-size: 13.5px; line-height: 1.7; color: #4b5563; }
  .lt-eintro-pitch b { display: block; margin-bottom: 2px; font-size: 12px; font-weight: 700; color: #2f5fcf; }
  .lt-dlg-test { display: grid; gap: 6px; margin-top: 16px; }
  .lt-dlg-testbtn { height: 42px; border: 1px solid #d5dbe6; border-radius: 12px; background: #fff; font: inherit; font-size: 14px; font-weight: 700; color: #374151; cursor: pointer; }
  .lt-dlg-testbtn:hover:not(:disabled) { background: #f6f7f9; }
  .lt-dlg-testbtn:disabled { opacity: .5; cursor: default; }
  .lt-dlg-testnote { font-size: 12.5px; color: #6b7280; }
  .lt-dlg-prevbtn { width: 100%; margin-top: 14px; padding: 10px 0; border: 0; background: none; font: inherit; font-size: 13.5px; font-weight: 700; color: #2f5fcf; text-align: left; cursor: pointer; }
  .lt-dlg-prev { margin-top: 4px; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; background: #f6f7f9; }
  .lt-dlg-prevsub { margin: 0; padding: 10px 14px; border-bottom: 1px solid #e5e7eb; background: #fff; font-size: 12.5px; font-weight: 700; color: #374151; }
  .lt-dlg-prevmsg { margin: 0; padding: 18px 14px; font-size: 13px; color: #6b7280; }
  .lt-dlg-frame { display: block; width: 100%; height: 360px; border: 0; background: #f6f7f9; }
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

  /* 투표 보기: 카드형. 색은 점과 결과 막대에만 쓰고 테두리는 얇은 회색 유지(평면·단순 톤) */
  .ld-opts { grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
  .ld-opt { --t: #2f5fcf; --tb: #eef3fd; flex-direction: column; align-items: flex-start; justify-content: flex-start; gap: 12px; padding: 16px; border: 1px solid #e5e7eb; border-radius: 14px; overflow: visible; }
  .ld-opt[data-tone='w'] { --t: #b7791f; --tb: #fdf4e3; }
  .ld-opt[data-tone='n'] { --t: #6b7280; --tb: #f3f4f6; }
  .ld-opt:hover:not(:disabled) { border-color: #d1d5db; background: var(--tb); }
  .ld-opt-dot { width: 8px; height: 8px; border-radius: 999px; background: var(--t); }
  .ld-opt-l { font-size: 15px; font-weight: 700; color: #111827; }
  .ld-opt[aria-pressed='true'] { border-color: #e5e7eb; background: var(--tb); }
  .ld-opt-res { display: grid; gap: 6px; width: 100%; }
  .ld-opt-track { display: block; height: 4px; border-radius: 999px; background: #e5e7eb; overflow: hidden; }
  .ld-opt-fill { display: block; height: 100%; border-radius: 999px; background: var(--t); transition: width .5s ease; }
  .ld-opt-p { font-size: 18px; font-weight: 700; color: var(--t); }
  .ld-opt-mine { font-size: 12px; font-weight: 600; color: #6b7280; }
  @media (max-width: 520px) { .ld-opts { grid-template-columns: 1fr; } .ld-opt { flex-direction: row; align-items: center; flex-wrap: wrap; } .ld-opt-res { width: auto; margin-left: auto; grid-auto-flow: column; align-items: center; } .ld-opt-track { width: 48px; } }

  /* 시각 블록(타임라인·숫자 카드·막대·양측·접기·강조). 평면·1px 선, 색은 섹션 축 색 하나만 쓴다 */
  .lb { --bt: #2f5fcf; margin: 18px 0 0; }
  .lb-tl { list-style: none; padding: 0; display: grid; gap: 0; border-left: 2px solid #e5e7eb; margin-left: 4px; }
  .lb-tl li { position: relative; display: grid; grid-template-columns: 88px 1fr; gap: 10px; padding: 8px 0 8px 18px; }
  .lb-tl li::before { content: ''; position: absolute; left: -6px; top: 15px; width: 10px; height: 10px; border-radius: 999px; background: var(--bt); }
  .lb-tl-d { font-size: 13.5px; font-weight: 700; color: var(--bt); }
  .lb-tl-t { font-size: 15.5px; line-height: 1.75; color: #1f2937; }
  .lb-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
  .lb-stat { display: grid; gap: 2px; padding: 14px 16px; border: 1px solid #e5e7eb; border-radius: 14px; background: #fff; }
  .lb-stat-l { font-size: 12.5px; color: #6b7280; }
  .lb-stat-v { font-size: 26px; font-weight: 700; color: var(--bt); font-variant-numeric: tabular-nums; }
  .lb-stat-s { font-size: 12.5px; color: #6b7280; }
  .lb-bars { padding: 14px 16px; border: 1px solid #e5e7eb; border-radius: 14px; background: #fff; display: grid; gap: 8px; }
  .lb-bars-t { margin: 0; font-size: 13.5px; font-weight: 700; color: #111827; }
  .lb-bar { display: grid; grid-template-columns: 64px 1fr 72px; align-items: center; gap: 10px; }
  .lb-bar-l { font-size: 13px; color: #374151; }
  .lb-bar-track { height: 10px; border-radius: 999px; background: #f1f3f6; overflow: hidden; }
  .lb-bar-fill { display: block; height: 100%; border-radius: 999px; background: var(--bt); }
  .lb-bar-v { font-size: 13px; font-weight: 700; color: #111827; text-align: right; font-variant-numeric: tabular-nums; }
  .lb-vs { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .lb-vs-c { display: grid; gap: 6px; padding: 14px 16px; border: 1px solid #e5e7eb; border-radius: 14px; background: #fafbfc; align-content: start; }
  .lb-vs-l { font-size: 13.5px; font-weight: 700; color: var(--bt); }
  .lb-vs-t { font-size: 15px; line-height: 1.7; color: #1f2937; }
  .lb-fold { border: 1px solid #e5e7eb; border-radius: 14px; background: #fafbfc; padding: 12px 16px; }
  .lb-fold summary { cursor: pointer; font-size: 14.5px; font-weight: 700; color: #111827; }
  .lb-fold p { margin: 8px 0 0; font-size: 15px; line-height: 1.8; color: #374151; }
  .lb-call { padding: 12px 16px; border-left: 3px solid var(--bt); background: #fafbfc; font-size: 15.5px; line-height: 1.8; color: #1f2937; }
  @media (max-width: 520px) { .lb-tl li { grid-template-columns: 1fr; gap: 2px; } .lb-vs { grid-template-columns: 1fr; } .lb-bar { grid-template-columns: 52px 1fr 64px; } }
`;