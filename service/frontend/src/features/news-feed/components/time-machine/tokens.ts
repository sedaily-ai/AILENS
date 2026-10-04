// 타임라인 홈 구역(그날로 떠나요)의 색·공용 스타일. 대비는 모두 실측해 WCAG AA를 통과하는 값만 골랐다.
import type { CSSProperties } from 'react';

export const INK = '#111827'; // 17.74:1 on #fff
export const BODY = '#374151'; // 10.31:1 on #fff
export const MUTED = '#6b7280'; // 4.83:1 on #fff
export const BLUE = '#1d4ed8'; // 6.70:1 on #fff
export const BLUE_TINT = '#dbeafe';
export const CHIP = '#f3f4f6';
export const PANEL = '#f9fafb';
export const LINE = 'rgba(17,24,39,0.09)';

export const SR_ONLY: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
};

/** 구역 전용 CSS(.ntm-*) — 칩·버튼·행 hover·포커스 링·등장 애니메이션. */
export const TIME_MACHINE_CSS = `
  @keyframes ntm-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
  .ntm-livedot { animation: ntm-pulse 1.8s ease-in-out infinite; }
  @keyframes ntm-pageturn { 0% { opacity: 0; transform: translateX(10px); } 100% { opacity: 1; transform: translateX(0); } }
  .ntm-pageturn { animation: ntm-pageturn 260ms ease-out; }

  .ntm-focus:focus-visible { outline: 2px solid ${BLUE}; outline-offset: 2px; border-radius: 8px; }

  .ntm-chip { display: inline-flex; align-items: center; justify-content: center;
    min-height: 44px; padding: 0 16px; border-radius: 999px; border: none;
    font-size: 14px; font-weight: 600; background: ${CHIP}; color: ${BODY};
    cursor: pointer; white-space: nowrap; transition: background .15s ease, color .15s ease; }
  .ntm-chip:hover { background: #e9ebef; color: ${INK}; }
  .ntm-chip[aria-pressed="true"] { background: ${INK}; color: #fff; font-weight: 700; }

  .ntm-go { display: inline-flex; align-items: center; justify-content: center;
    min-height: 44px; padding: 0 18px; border-radius: 999px; border: none;
    background: ${BLUE}; color: #fff; font-size: 14px; font-weight: 700;
    cursor: pointer; white-space: nowrap; transition: background .15s ease, transform .12s ease; }
  .ntm-go:hover { background: #1a44bd; }
  .ntm-go:active { transform: scale(.98); }

  .ntm-sub { display: inline-flex; align-items: center; justify-content: center;
    min-height: 44px; padding: 0 8px; background: none; border: none;
    font-size: 14px; font-weight: 600; color: ${MUTED}; cursor: pointer;
    text-decoration: underline; text-underline-offset: 3px; transition: color .15s ease; }
  .ntm-sub:hover { color: ${INK}; }

  .ntm-row { transition: background .14s ease; }
  .ntm-row:hover { background: ${PANEL}; }
  .ntm-row:hover .ntm-title { color: ${BLUE}; }

  @media (prefers-reduced-motion: reduce) {
    .ntm-livedot, .ntm-pageturn { animation: none; }
    .ntm-go, .ntm-chip, .ntm-sub, .ntm-row { transition: none; }
  }
`;
