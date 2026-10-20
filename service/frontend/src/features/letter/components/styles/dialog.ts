/** 레터 CSS — 구독 온보딩 다이얼로그. 합치는 순서는 letterStyles.ts(뒤에 오는 규칙이 앞을 덮는다). */
export const DIALOG_CSS = `
  .lt-dlg-editors{border:0;padding:0;margin:24px 0;text-align:left}.lt-dlg-editors legend{font-size:14px;font-weight:600}.lt-dlg-editors p{font-size:12px;color:#64748b;margin:8px 0 12px}.lt-dlg-editors>div{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.lt-dlg-editors label{display:flex;align-items:center;gap:8px;border:1px solid #e2e8f0;border-radius:8px;padding:10px;cursor:pointer;font-size:14px}.lt-dlg-editors label:has(input:checked){background:#f2f5ff;border-color:#94aaf0}.lt-dlg-editors small{display:block;font-size:11px;color:#64748b}.lt-dlg-editors input{accent-color:#315bd5}

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
  .lt-dlg-prevbtn { width: 100%; margin-top: 14px; padding: 10px 0; border: 0; background: none; font: inherit; font-size: 13.5px; font-weight: 700; color: #2f5fcf; text-align: left; cursor: pointer; }
  .lt-dlg-prev { min-height: 0; display: flex; flex-direction: column; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; background: #fff; }
  .lt-dlg-prevsub { flex: none; margin: 0; padding: 12px 16px; border-bottom: 1px solid #e5e7eb; background: #fff; font-size: 13px; font-weight: 500; line-height: 1.6; color: #374151; overflow-wrap: anywhere; }
  .lt-dlg-prevsub span { display: block; margin-bottom: 4px; font-size: 11px; color: #6b7280; }
  .lt-dlg-prevmsg { margin: 0; padding: 18px 14px; font-size: 13px; color: #6b7280; }
  .lt-dlg-frame { display: block; flex: 1; min-height: 0; width: 100%; border: 0; background: #fff; }
  .lt-dlg.lt-dlg-preview { width: min(760px, 100%); height: min(900px, calc(100dvh - 32px)); overflow: hidden; }
  .lt-mail-preview { height: 100%; display: flex; flex-direction: column; gap: 12px; min-height: 0; }
  .lt-mail-back { align-self: flex-start; min-height: 44px; padding: 0; border: 0; background: none; font: inherit; font-size: 13px; font-weight: 600; color: #2f5fcf; cursor: pointer; }
  .lt-mail-preview .lt-dlg-h { margin: 0; padding-right: 24px; }
  .lt-mail-caption { margin: 0; font-size: 12.5px; line-height: 1.6; color: #6b7280; }
  .lt-mail-preview .lt-dlg-prev { flex: 1; }
  @media (max-width: 600px) { .lt-dlg.lt-dlg-preview { padding: 18px 16px; } }

`;
