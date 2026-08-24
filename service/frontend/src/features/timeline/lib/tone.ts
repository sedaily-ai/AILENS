/**
 * 타임머신 화면(/timeline, /timeline/[date])의 디자인 토큰.
 *
 * ── 왜 이 파일이 생겼나 ──────────────────────────────────────────
 * 이 기능은 "빈티지 신문" 톤이었다 — 크림 배경(#faf8f3), 갈색 액센트
 * (#8a6d3f·#b08d57·#c4b48f), Noto Serif KR. 그 색값이 10개 파일에 하드코딩돼
 * 흩어져 있었다(TimelineResultView 35곳, TimelineBigkindsView 19곳 등).
 *
 * 문제가 둘이었다.
 *
 *  1) 홈과 톤이 안 맞는다. 홈 형제 섹션(LensPreview·VideoPreview·
 *     WordsPreview·WebtoonPreview) 중 세리프를 쓰는 곳은 하나도 없다.
 *     2026-08-18 에 홈 타임머신 섹션의 갈색을 걷어냈는데, 정작 그 버튼을
 *     눌러 도착하는 이 페이지가 갈색이라 전환에서 톤이 튀었다.
 *
 *  2) 갈색 계열이 크림 배경 위에서 대비를 못 넘겼다 — 기사 순번 1.93:1,
 *     카테고리 2.91:1, 바이라인 2.38:1. 카테고리는 이 화면의 유일한 분류
 *     정보인데 안 읽혔다.
 *
 * 그래서 홈과 같은 중립 회색 + 파랑 하나로 통일하고, 색값을 역할 이름으로
 * 여기 모았다. 브랜드 색이 바뀌어도 한 곳만 고치면 된다.
 *
 * 주석의 대비 비율은 WCAG 2.1 상대휘도 공식으로 계산한 실측값이다.
 * 기준: 본문 4.5:1 / 18px 이상 3:1 / 인터랙티브 요소 경계 3:1.
 */
import type { CSSProperties } from 'react';

/* ══ 색 — 역할로 명명한다 ═══════════════════════════════════════ */

/** 페이지 배경. 크림(#faf8f3) 을 걷고 홈과 같은 흰 배경으로. */
export const SURFACE = '#ffffff';
/** 한 단계 눌린 면 — 카드·부가 섹션 배경. */
export const SURFACE_SUNKEN = '#f9fafb';
/** 칩·태그 배경. */
export const SURFACE_CHIP = '#f3f4f6';

/** 제목 등 가장 강한 텍스트. 17.74:1 on #fff. */
export const TEXT_STRONG = '#111827';
/** 본문. 10.31:1 on #fff, 9.37:1 on #f3f4f6. */
export const TEXT_BODY = '#374151';
/** 보조·메타. 4.83:1 on #fff, 4.63:1 on #f9fafb — 회색 위 연회색을 피한 최소값. */
export const TEXT_MUTED = '#6b7280';
/** 진한 면 위의 텍스트. */
export const TEXT_INVERSE = '#ffffff';

/**
 * 액센트. 브랜드 파랑 #3182F6 은 흰 글씨와 3.71:1 로 미달이라 쓰지 않는다.
 * #1d4ed8 은 흰 배경과 6.70:1, 흰 글씨와도 6.70:1 로 양방향 통과.
 */
export const ACCENT = '#1d4ed8';
/** 액센트 hover. */
export const ACCENT_HOVER = '#1a44bd';
/** 연한 파랑 배경. ACCENT 글자와 5.49:1. */
export const ACCENT_SUNKEN = '#dbeafe';

/**
 * 장식용 헤어라인 — 목록 구분선·카드 테두리. 홈 형제 섹션과 같은 값.
 * 1.2:1 수준으로 3:1 을 못 넘지만, WCAG 1.4.11(비텍스트 대비)은 "컨트롤을
 * 식별하는 데 필요한" 경계에만 적용된다. 순수 장식 구분선은 대상이 아니다.
 * 컨트롤 경계에는 BORDER_CONTROL 을 쓴다.
 */
export const BORDER_HAIRLINE = 'rgba(17,24,39,0.09)';
/** 버튼·토글 등 인터랙티브 요소의 경계. #fff 와 4.83:1 — 3:1 통과. */
export const BORDER_CONTROL = '#6b7280';
/** 지면 머리 밑줄처럼 구조를 나누는 굵은 선. */
export const BORDER_STRONG = '#111827';

/* ══ 타이포 — 스케일에서만 고른다 ═══════════════════════════════
   허용: 12 / 13 / 14 / 16 / 18 / 20 / 24 / 32 / 40
   기존 코드의 10.5·11·11.5·12.5·13.5·14.5·15·17·34 는 전부 제거. */
export const FONT = {
  /** 출처·꼬리 정보. 원칙상 캡션 최소값. */
  caption: 13,
  /** 메타·카테고리 칩·버튼. */
  meta: 14,
  /** 본문 및 목록 제목. 뉴스 서비스 본문 최소값. */
  body: 16,
  /** 분야 섹션 제목. */
  sectionTitle: 18,
  /** 페이지 h1(모바일). */
  pageTitle: 24,
  /** 페이지 h1(데스크톱). */
  pageTitleLg: 32,
} as const;

/** 한글 행간. 라틴보다 넓어야 읽힌다. */
export const LEADING = {
  tight: 1.4,
  title: 1.5,
  body: 1.7,
} as const;

/* ══ 여백 — 4px 배수만 ═══════════════════════════════════════════ */
export const SPACE = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  section: 48,
} as const;

export const RADIUS = {
  chip: 8,
  card: 16,
  pill: 9999,
} as const;

/** 터치 타겟 최소 한 변. 시각 크기가 작아도 패딩으로 이만큼 확보한다. */
export const TOUCH_MIN = 44;

/* ══ 레이아웃 ════════════════════════════════════════════════════ */
/** 페이지 컨테이너. */
export const CONTAINER_MAX = 760;
/**
 * 산문 한 줄 최대 폭. 한글 25~40자 기준 — 16px 에서 40자면 640px 이다.
 * 컨테이너(760) 를 그대로 쓰면 한 줄이 47자까지 늘어나 눈이 되돌아올 곳을
 * 잃는다.
 */
export const PROSE_MAX = 620;

/* ══ 전역 규칙 ═══════════════════════════════════════════════════ */
/**
 * 페이지마다 <style> 로 한 번 심는다.
 *
 * · 등장 애니메이션 — prefers-reduced-motion 에서 차단한다.
 * · :focus-visible 아웃라인 — outline:none 만 쓰고 대체 스타일이 없으면
 *   키보드 사용자가 길을 잃는다. 절대 제거하지 않는다.
 * · 제목 줄임(-webkit-line-clamp).
 */
export const GLOBAL_CSS = `
  @keyframes tlEnter { from { opacity:0; transform: translateY(12px);} to { opacity:1; transform:none;} }
  .tl-enter { animation: tlEnter .42s ease both; }

  .tl-focus:focus-visible { outline: 2px solid ${ACCENT}; outline-offset: 3px; border-radius: 6px; }

  .tl-clamp2 { display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }

  /* 목록 행 — 제목만 파랑으로 물들여 "누를 수 있다"를 알린다. */
  .tl-row { transition: background .14s ease; }
  .tl-row:hover { background: ${SURFACE_SUNKEN}; }
  .tl-row:hover .tl-row-title { color: ${ACCENT}; }

  /* 보기 전환 칩(TimelineResultView) — 터치 타겟 44px 를 패딩으로 확보한다. */
  .tl-chip { display:inline-flex; align-items:center; justify-content:center;
    min-height:${TOUCH_MIN}px; padding:0 ${SPACE.lg}px; border-radius:${RADIUS.pill}px;
    border:none; background:${SURFACE_CHIP}; color:${TEXT_BODY};
    font-size:${FONT.meta}px; font-weight:600; font-family:inherit; cursor:pointer;
    white-space:nowrap; transition: background .15s ease, color .15s ease; }
  .tl-chip:hover { background:#e9ebef; color:${TEXT_STRONG}; }
  .tl-chip[aria-pressed="true"] { background:${TEXT_STRONG}; color:${TEXT_INVERSE}; font-weight:700; }

  /* 좌상단 EXIT 필 — 공용 헤더 대신 쓰는 탈출구. 내용 위에 떠 있어서
     배경이 불투명해야 한다(.tl-btn 은 투명이라 여기엔 못 쓴다). */
  .tl-exit { transition: color .15s ease, border-color .15s ease; }
  .tl-exit:hover { color:${TEXT_STRONG}; border-color:${TEXT_STRONG}; }

  /* 보조 동작 — 테두리 있는 버튼. 경계는 3:1 을 넘겨야 한다. */
  .tl-btn { display:inline-flex; align-items:center; justify-content:center; gap:${SPACE.sm}px;
    min-height:${TOUCH_MIN}px; padding:0 ${SPACE.xl}px; border-radius:${RADIUS.pill}px;
    border:1px solid ${BORDER_CONTROL}; background:transparent; color:${TEXT_BODY};
    font-size:${FONT.meta}px; font-weight:700; font-family:inherit; cursor:pointer;
    text-decoration:none; transition: background .15s ease, color .15s ease; }
  .tl-btn:hover { background:${SURFACE_SUNKEN}; color:${TEXT_STRONG}; }

  /* 목록 안 "더 보기" — 테두리 없는 텍스트+화살표(2026-08-24). 분야마다
     하나씩 붙는 보조 동작이라 .tl-btn 알약이 여러 개 쌓이면 목록보다 버튼이
     더 눈에 띈다. 테두리만 걷고 터치 타겟(44px)은 패딩으로 확보한다 —
     시각적 크기가 작아도 히트 영역은 유지해야 한다. */
  .tl-more { display:inline-flex; align-items:center; gap:${SPACE.xs}px;
    min-height:${TOUCH_MIN}px; padding:0 ${SPACE.sm}px; margin-left:-${SPACE.sm}px;
    border:none; background:transparent; color:${TEXT_MUTED};
    font-size:${FONT.meta}px; font-weight:700; font-family:inherit; cursor:pointer;
    text-decoration:none; transition: color .15s ease; }
  .tl-more:hover { color:${TEXT_STRONG}; text-decoration:underline; text-underline-offset:3px; }

  @media (prefers-reduced-motion: reduce) {
    .tl-enter { animation: none; }
    .tl-row, .tl-chip, .tl-btn, .tl-more, .tl-exit { transition: none; }
  }
`;

/** 화면에서만 숨기고 보조기기엔 읽히는 텍스트. */
export const SR_ONLY: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0,0,0,0)',
  whiteSpace: 'nowrap',
  border: 0,
};

/**
 * "23년 전" — 얼마나 멀리 왔는지. 홈 결과 머리와 같은 표현.
 * 1년 미만이면 붙이지 않는다(“0년 전”은 정보가 아니다).
 */
export function yearsAgoLabel(dateStr: string, now: Date = new Date()): string | null {
  const y = parseInt(dateStr.slice(0, 4), 10);
  if (!Number.isFinite(y)) return null;
  const diff = now.getFullYear() - y;
  return diff >= 1 ? `${diff}년 전` : null;
}
