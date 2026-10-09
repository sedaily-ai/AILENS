// 레터 화면 공용 스타일(styled-jsx 대신 문자열 <style>을 쓰는 이 코드베이스의 방식). 색은 사이트 톤(서울경제 파랑 #5b8def 계열, 부드러운 그림자, 넉넉한 여백).
export const LETTER_CSS = `
  .lt-wrap, .ld-wrap { word-break: keep-all; overflow-wrap: break-word; }
  .lt-wrap { max-width: 1040px; margin: 0 auto; padding: clamp(20px, 4vw, 44px) 0 96px; }
  .lt-hero { padding: clamp(8px, 2vw, 20px) 0 28px; }
  .lt-eyebrow { font-size: 13px; font-weight: 700; letter-spacing: .06em; color: #5b8def; }
  .lt-h1 { margin: 8px 0 0; font-family: "Noto Serif KR", serif; font-size: clamp(26px, 4.6vw, 38px); font-weight: 700; line-height: 1.3; letter-spacing: -0.02em; color: #111827; text-wrap: balance; }
  .lt-sub { margin: 12px 0 0; font-size: 15.5px; line-height: 1.7; color: #4b5563; max-width: 640px; }
  .lt-filters { display: flex; gap: 8px; flex-wrap: wrap; margin: 4px 0 28px; }
  .lt-chip { height: 36px; padding: 0 16px; border: none; border-radius: 999px; background: #f1f3f6; font: inherit; font-size: 14px; font-weight: 600; color: #374151; cursor: pointer; transition: background .15s; }
  .lt-chip:hover { background: #e4e9f2; }
  .lt-chip[aria-pressed='true'] { background: #111827; color: #fff; }
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
  .lt-interest { margin: 28px 0 8px; }
  .lt-int-prompt { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 18px 20px; border-radius: 16px; background: #f8fafc; border: 1px solid #e5e7eb; }
  .lt-int-prompt strong { display: block; font-size: 15px; color: #111827; }
  .lt-int-prompt p { margin: 4px 0 0; font-size: 13px; color: #6b7280; }
  .lt-int-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
  .lt-int-head .lt-sec-h { margin: 0; }
  .lt-int-chips { display: flex; flex-wrap: wrap; gap: 8px; margin: 10px 0 14px; padding: 0; list-style: none; }
  .lt-int-sub { margin: 14px 0 0; font-size: 13px; font-weight: 700; color: #4b5563; }
  .lt-int-btn { padding: 9px 16px; border-radius: 999px; border: 0; background: #111827; color: #fff; font-size: 14px; font-weight: 700; cursor: pointer; white-space: nowrap; }
  .lt-int-btn:disabled { opacity: .5; cursor: default; }
  .lt-int-link { padding: 6px 4px; border: 0; background: none; color: #4b5563; font-size: 13.5px; text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
  .lt-int-edit { padding: 20px; border-radius: 16px; border: 1px solid #e5e7eb; background: #fff; }
  .lt-int-edit .lt-sec-h { margin: 0 0 4px; }
  .lt-int-details { margin-top: 14px; }
  .lt-int-details summary { cursor: pointer; font-size: 14px; font-weight: 600; color: #374151; }
  .lt-int-group .lt-int-chips { margin: 8px 0 4px; }
  .lt-int-actions { display: flex; align-items: center; gap: 14px; margin-top: 18px; flex-wrap: wrap; }
  .lt-int-err { margin: 12px 0 0; font-size: 13px; color: #b91c1c; }
  .lt-reason { margin: 2px 0 0; font-size: 13px; font-weight: 600; color: #1f56c0; }
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
  .ld-btn { display: inline-flex; align-items: center; height: 44px; padding: 0 20px; border-radius: 999px; background: #111827; color: #fff; font-size: 14.5px; font-weight: 700; text-decoration: none; }
  .ld-btn.ghost { background: #f1f3f6; color: #111827; }
  @media (max-width: 640px) {
    .lt-card { padding: 18px 18px 16px; border-radius: 16px; }
    .ld-src { grid-template-columns: 24px minmax(0,1fr); }
    .ld-src-ax { grid-column: 2; justify-content: flex-start; }
    .ld-p { font-size: 16px; line-height: 1.9; }
  }
  @media (prefers-reduced-motion: reduce) { .lt-card, .ld-opt-bar { transition: none; } .lt-card:hover { transform: none; } }
`;
