/** 레터 CSS — 투표 보기와 시각 블록. 합치는 순서는 letterStyles.ts(뒤에 오는 규칙이 앞을 덮는다). */
export const VOTE_CSS = `
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
