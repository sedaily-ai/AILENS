// ArticleAudioPlayer 스타일 — 7차(2026-10-03, "요즘 팟캐스트 앱의 재생 화면" 방향).
//
// 6차(종이색·세리프·드롭캡·이중 테두리 인장)는 "AI가 만든 고급 에디토리얼" 공식 그대로라는 피드백을 받아 폐기했다.
// 리서치(Apple Podcasts·Pocket Casts·Spotify 재생 화면, 디자인시스템 오디오 컴포넌트 최소 구성)에서 공통으로 나온 것:
//   · 커버 이미지가 주인공이고, 그 색이 번진 배경 위에 컨트롤이 놓인다
//   · 얇은 진행 바 + 시간, 크고 둥근 재생 버튼, 속도 칩
//   · 장식 없이 위계(크기·굵기·간격)만으로 정리, 폰트는 본문과 같은 고딕
// 그래서: 흰 카드 + 커버를 흐리게 번지게 한 윗부분 배경, 큰 커버(둥근 모서리), 고딕 제목, 가는 진행 바(가짜 파형 제거),
// 파랑 채움 재생 버튼. 세리프·종이색·선 장식·액자는 쓰지 않는다. 강조색(--aap-c)은 진행·재생 버튼·선택 상태에만.
//
// ⚠️ 이 문자열은 SSR HTML에 그대로 실리므로 CSS 안에는 설명 주석을 두지 않는다(여기 파일 주석으로만).
export function aapCss(waveBarCount: number): string {
  // 7차부터 파형 막대를 화면에서 숨기고 얇은 진행 바로 대신한다(막대 DOM은 호환을 위해 유지) — 열 개수는 더 쓰지 않는다.
  void waveBarCount;
  return `
    .aap { --ink: #0f172a; --ink-2: #475569; --ink-3: #94a3b8; --chip: #ffffff;
      position: relative; overflow: hidden; isolation: isolate; border-radius: 24px; padding: clamp(18px, 4vw, 26px); background: #f4f5f7; color: var(--ink); }
    .aap-inner { position: relative; z-index: 1; }

    .aap-head { display: flex; gap: clamp(14px, 3vw, 20px); align-items: center; }
    .aap-cover { flex-shrink: 0; width: 108px; height: 108px; border-radius: 20px; overflow: hidden; background: #e2e8f0;
      box-shadow: 0 18px 30px -16px rgba(15,23,42,0.5), 0 0 0 1px rgba(15,23,42,0.06); }
    .aap-cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
    @media (max-width: 420px) { .aap-cover { width: 84px; height: 84px; border-radius: 16px; } }

    .aap-headtext { flex: 1; min-width: 0; }
    .aap-badge { display: inline-flex; align-items: center; height: 24px; padding: 0 10px; margin-bottom: 9px; border-radius: 999px;
      font-size: 11.5px; font-weight: 700; letter-spacing: 0.01em; color: color-mix(in srgb, var(--aap-c) 70%, #0f1f4d); background: #fff; }
    .aap-title { margin: 0; font-size: clamp(18px, 2.6vw, 22px); font-weight: 700; line-height: 1.35; letter-spacing: -0.025em; color: var(--ink);
      word-break: keep-all; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
    .aap-byline { display: inline-flex; align-items: center; gap: 4px; margin-top: 8px; font-size: 13px; font-weight: 500; color: var(--ink-2);
      background: none; border: none; padding: 0; cursor: default; font-family: inherit; }
    .aap-byline[data-link='true'] { cursor: pointer; text-decoration: none; }
    .aap-byline[data-link='true']:hover { color: var(--ink); }
    .aap-byline[data-link='true']:focus-visible { outline: 2px solid var(--aap-c); outline-offset: 2px; border-radius: 4px; }

    .aap-toprow { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 22px; }
    .aap-toprow[data-solo='true'] { justify-content: flex-end; }
    .aap-tabs { display: flex; gap: 8px; }
    .aap-tab { display: inline-flex; align-items: center; gap: 5px; height: 34px; padding: 0 13px 0 15px; border: none; border-radius: 999px; cursor: pointer;
      font-size: 13.5px; font-weight: 600; background: var(--chip); color: var(--ink-2); font-family: inherit;
      transition: background-color .2s cubic-bezier(.2,0,0,1), color .2s cubic-bezier(.2,0,0,1); }
    .aap-tab:hover { background: #eceef2; color: var(--ink); }
    .aap-tab[aria-expanded='true'] { background: var(--chip); color: var(--ink); }
    .aap-tab:focus-visible { outline: 2px solid var(--aap-c); outline-offset: 2px; }

    .aap-scriptwrap { position: relative; margin-top: 14px; }
    .aap-script { position: relative; height: min(440px, 50vh); overflow-y: auto; -webkit-overflow-scrolling: touch; overscroll-behavior: contain;
      list-style: none; padding: 0 8px 0 0; margin-block: 0; display: flex; flex-direction: column; gap: 4px;
      scrollbar-width: thin; scrollbar-color: #c3c9d3 transparent; scroll-behavior: smooth;
      -webkit-mask-image: linear-gradient(to bottom, transparent 0, black 18px, black calc(100% - 22px), transparent 100%);
      mask-image: linear-gradient(to bottom, transparent 0, black 18px, black calc(100% - 22px), transparent 100%); }
    .aap-script::-webkit-scrollbar { width: 6px; }
    .aap-script::-webkit-scrollbar-track { background: transparent; margin: 14px 0; }
    .aap-script::-webkit-scrollbar-thumb { background: #cdd2db; border-radius: 999px; }
    .aap-script::-webkit-scrollbar-thumb:hover { background: #aeb5c1; }
    .aap-script-jump { position: absolute; right: 0; bottom: -38px; z-index: 3; display: inline-flex; align-items: center; gap: 4px;
      height: 28px; padding: 0 10px 0 12px; border: 1px solid rgba(15,23,42,0.12); border-radius: 999px; cursor: pointer; font-size: 12.5px; font-weight: 600; font-family: inherit;
      background: #fff; color: var(--ink-2); box-shadow: 0 4px 12px -6px rgba(15,23,42,0.25); }
    .aap-script-jump:hover { color: var(--ink); }
    .aap-script-jump:focus-visible { outline: 2px solid var(--aap-c); outline-offset: 3px; }
    @media (prefers-reduced-motion: no-preference) { .aap-script-jump { animation: aap-menu-in .18s cubic-bezier(.2,0,0,1); } }
    .aap-script-item { display: block; width: 100%; text-align: left; border: none; cursor: default; border-radius: 14px; padding: 6px 14px; background: none;
      margin: 0; font-size: 15.5px; line-height: 1.75; color: #7b8798; word-break: keep-all; font-family: inherit;
      transition: background-color .2s cubic-bezier(.2,0,0,1), color .2s cubic-bezier(.2,0,0,1); }
    button.aap-script-item { cursor: pointer; }
    button.aap-script-item:hover { color: var(--ink-2); }
    button.aap-script-item:focus { outline: none; }
    button.aap-script-item:focus-visible { background: rgba(15,23,42,0.05); }
    .aap-script-item[data-active='true'] { color: #2f5fc4; font-weight: 700; background: none; }
    .aap-script-item strong { font-weight: 700; color: inherit; }
    .aap-script-note { margin: 12px 0 0; min-height: 30px; display: flex; align-items: center; padding-right: 150px; font-size: 12px; color: var(--ink-3); line-height: 1.5; }

    .aap-wavewrap { margin-top: 22px; }
    .aap-wave { position: relative; display: block; height: 22px; padding: 0; cursor: pointer; }
    .aap-wave-bar { display: none; }
    .aap-wave::before { content: ''; position: absolute; left: 0; right: 0; top: 50%; height: 4px; margin-top: -2px; border-radius: 999px; background: #dfe2e8;
      transition: height .15s ease, margin-top .15s ease; }
    .aap-wave::after { content: ''; position: absolute; left: 0; top: 50%; height: 4px; margin-top: -2px; width: var(--aap-p, 0%); border-radius: 999px; background: var(--aap-c);
      transition: height .15s ease, margin-top .15s ease; }
    .aap-wave:hover::before, .aap-wave:hover::after { height: 6px; margin-top: -3px; }
    .aap-wave[data-loading='true']::before { animation: aap-wave-shimmer 1.8s ease-in-out infinite; }
    @keyframes aap-wave-shimmer { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }
    @media (prefers-reduced-motion: reduce) { .aap-wave[data-loading='true']::before { animation: none; opacity: 0.7; } }
    .aap-wave-seek { position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; opacity: 0; cursor: pointer; -webkit-appearance: none; appearance: none; z-index: 2; }
    .aap-wave-seek:disabled { cursor: default; }
    .aap-wave-seek:focus-visible ~ .aap-wave-focus-ring { opacity: 1; }
    .aap-wave-focus-ring { position: absolute; inset: -2px; border-radius: 10px; border: 2px solid var(--aap-c); opacity: 0; pointer-events: none; }
    .aap-scrub-tip { position: absolute; bottom: calc(100% + 6px); transform: translateX(-50%); padding: 4px 9px; border-radius: 8px; background: var(--ink); color: #fff;
      font-size: 12px; font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; pointer-events: none; }

    .aap-time-row { display: flex; align-items: center; justify-content: space-between; margin-top: 4px; font-size: 12.5px; font-weight: 600;
      font-variant-numeric: tabular-nums; color: var(--ink-2); }
    .aap-time-row span:last-child { color: var(--ink-3); font-weight: 500; }

    .aap-transport { display: flex; align-items: center; justify-content: center; gap: clamp(14px, 5vw, 26px); margin-top: 16px; }
    .aap-icon-btn { display: flex; align-items: center; justify-content: center; width: 46px; height: 46px; border-radius: 999px; border: none; background: none;
      color: var(--ink-2); cursor: pointer; transition: background-color .2s cubic-bezier(.2,0,0,1), color .2s cubic-bezier(.2,0,0,1); }
    .aap-icon-btn:hover { background: #eceef2; color: var(--ink); }
    .aap-icon-btn:active { background: #e3e6ec; }
    .aap-icon-btn:focus-visible { outline: 2px solid var(--aap-c); outline-offset: 2px; }
    .aap-icon-btn[aria-pressed='true'] { color: var(--aap-c); }

    .aap-play { flex-shrink: 0; display: flex; align-items: center; justify-content: center; width: 66px; height: 66px; border-radius: 999px; border: none; cursor: pointer;
      color: #fff; background: var(--aap-c); box-shadow: 0 16px 28px -14px color-mix(in srgb, var(--aap-c) 85%, #0f172a);
      transition: transform .2s cubic-bezier(.2,0,0,1), filter .2s ease; }
    .aap-play:hover { filter: brightness(1.06); }
    .aap-play:active { transform: scale(.94); }
    .aap-play:focus-visible { outline: 2px solid var(--aap-c); outline-offset: 4px; }
    @media (max-width: 359px) { .aap-play { width: 56px; height: 56px; } }

    .aap-rate-wrap { position: relative; flex-shrink: 0; }
    .aap-rate { display: inline-flex; align-items: center; gap: 4px; height: 34px; padding: 0 12px 0 14px; border: none; border-radius: 999px; cursor: pointer;
      font-size: 13.5px; font-weight: 700; background: var(--chip); color: var(--ink-2); font-family: inherit; font-variant-numeric: tabular-nums;
      transition: background-color .2s cubic-bezier(.2,0,0,1); }
    .aap-rate:hover, .aap-rate[aria-expanded='true'] { background: #eceef2; color: var(--ink); }
    .aap-rate:focus-visible { outline: 2px solid var(--aap-c); outline-offset: 2px; }
    .aap-rate-menu { position: absolute; top: calc(100% + 6px); right: 0; z-index: 5; min-width: 100px; margin: 0; padding: 6px; list-style: none; border-radius: 16px;
      background: #fff; box-shadow: 0 0 0 1px rgba(15,23,42,0.07), 0 20px 36px -16px rgba(15,23,42,0.3); }
    @media (prefers-reduced-motion: no-preference) {
      .aap-rate-menu { animation: aap-menu-in .16s cubic-bezier(.2,0,0,1); }
      @keyframes aap-menu-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
    }
    .aap-rate-opt { display: flex; align-items: center; justify-content: space-between; gap: 10px; width: 100%; height: 38px; padding: 0 10px; border: none; border-radius: 10px;
      background: none; cursor: pointer; font-size: 14px; font-weight: 600; color: var(--ink-2); font-family: inherit; font-variant-numeric: tabular-nums;
      transition: background-color .14s ease; }
    .aap-rate-opt:hover { background: var(--chip); color: var(--ink); }
    .aap-rate-opt:focus-visible { outline: 2px solid var(--aap-c); outline-offset: -2px; }
    .aap-rate-opt[aria-selected='true'] { color: var(--ink); font-weight: 700; }
    .aap-rate-opt[aria-selected='true'] svg { color: var(--aap-c); }

    .aap-fail { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; font-size: 15px; line-height: 1.6; color: var(--ink-2); word-break: keep-all; }
    .aap-retry { flex-shrink: 0; height: 36px; padding: 0 16px; border-radius: 999px; border: none; background: var(--chip); color: var(--ink); font-size: 13px; font-weight: 700;
      cursor: pointer; font-family: inherit; }
    .aap-retry:hover { background: rgba(15,23,42,0.09); }
    .aap-retry:focus-visible { outline: 2px solid var(--aap-c); outline-offset: 2px; }

    @media (prefers-reduced-motion: reduce) {
      .aap-play, .aap-icon-btn, .aap-tab, .aap-script-item, .aap-rate-opt, .aap-wave::before, .aap-wave::after { transition: none; }
      .aap-play:active { transform: none; }
      .aap-tab svg, .aap-rate svg { transition: none; }
    }
  `;
}
