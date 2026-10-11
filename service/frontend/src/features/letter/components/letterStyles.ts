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
  .lt-etab-ring { display: grid; place-items: center; width: 66px; height: 66px; border-radius: 50%; border: 2px solid transparent; transition: border-color .15s, transform .15s, box-shadow .15s; }
  .lt-etab:hover .lt-etab-ring { transform: translateY(-2px); }
  .lt-etab[aria-pressed='true'] .lt-etab-ring { border-color: var(--tone-fg, #2f5fcf); box-shadow: 0 6px 16px rgba(17,24,39,.12); }
  .lt-etab-all .lt-etab-ring { background: #eef3ff; color: #2f5fcf; font-size: 15px; font-weight: 700; }
  .lt-etab-all[aria-pressed='true'] .lt-etab-ring { background: #2f5fcf; color: #fff; border-color: #2f5fcf; }
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
  .lt-hero { padding: 8px 0 26px; }
  .lt-eyebrow { color: var(--blue); font-weight: 700; letter-spacing: .04em; }
  .lt-h1 { margin: 8px 0 0; font-family: inherit; font-size: clamp(26px, 4.2vw, 36px); font-weight: 800; letter-spacing: -0.02em; line-height: 1.3; color: var(--ink); text-wrap: balance; }
  .lt-sub { margin: 10px 0 0; font-size: 15px; color: #6b7280; max-width: 560px; }
  .lt-etabs { display: flex; gap: 4px; overflow-x: auto; margin: 0 0 28px; padding: 0 0 18px; border-bottom: 1px solid var(--line); scrollbar-width: none; }
  .lt-etabs::-webkit-scrollbar { display: none; }
  .lt-etab { flex: none; width: 92px; display: flex; flex-direction: column; align-items: center; gap: 9px; padding: 4px 0; border: 0; background: none; font: inherit; color: #6b7280; cursor: pointer; }
  .lt-etab-ring { display: grid; place-items: center; width: 62px; height: 62px; border-radius: 50%; border: 1px solid var(--line); overflow: hidden; background: var(--tone-bg, var(--soft)); font-size: 14px; font-weight: 700; color: #374151; transition: outline-color .12s; outline: 2px solid transparent; outline-offset: 3px; }
  .lt-etab:hover .lt-etab-ring { outline-color: #cbd5e1; }
  .lt-etab[aria-pressed='true'] .lt-etab-ring { outline-color: var(--ink); }
  .lt-etab-all .lt-etab-ring { background: var(--soft); }
  .lt-etab-all[aria-pressed='true'] .lt-etab-ring { background: var(--ink); color: #fff; border-color: var(--ink); }
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
  .lt-dlg-promise { border: 0; border-radius: 12px; background: var(--soft); box-shadow: none; }
  .lt-seg button { border: 1px solid var(--line); box-shadow: none; }
  .lt-seg button[aria-pressed='true'] { border-color: var(--blue); background: var(--blue); box-shadow: none; transform: none; }
  @media (max-width: 640px) { .lt-hero { padding-bottom: 18px; } .lt-eintro { grid-template-columns: 1fr; padding: 20px; gap: 16px; } .lt-etab { width: 84px; } }
`;
