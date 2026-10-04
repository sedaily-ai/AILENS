// 시리즈 카드/그리드/페이지네이션/카테고리 칩 — WebtoonListClient.tsx(홈 목록: 히어로+레일+그리드)와 /webtoon/all(전체보기)이 공유하는 조각들.
// 두 페이지가 같은 컴포넌트·CSS를 참조하게 해, 카드가 따로 관리되며 한쪽만 고쳐지는 문제를 막는다.
// 히어로 캐러셀(풀블리드 구간)은 홈 목록 전용이라 여기에 없다.
/** 구조색 — 흰 배경과 17.74:1. */
export const INK = '#111827';
/** 본문 — 흰 배경 10.31:1 */
export const BODY = '#374151';
/** 보조 정보 — 흰 배경 4.83:1 (AA 통과). */
export const MUTED = '#6b7280';
/** 비활성 칩 채움. */
const CHIP = '#f3f4f6';
/** 표지가 오기 전 자리를 잡아두는 면. */
const PLACEHOLDER = '#f3f4f6';
/** 격자 밴드 — 13px MUTED 가 4.63:1 로 통과하는 가장 진한 회색. */
const BAND = '#f9fafb';
const BAND_EDGE = '#eef0f3';
/** /video 카드와 동일 — 액자 대신 부양감으로 카드를 구분한다. */
const CARD_SHADOW = '0 1px 2px rgba(17,24,39,0.04), 0 6px 18px rgba(17,24,39,0.05)';
/**
 * 사이트 유일의 파란 액센트 — Header.tsx TAB_ACCENT·BETA 배지와 같은 값(#1d4ed8, 흰 배경·흰 글자 모두 6.70:1).
 * "총 N화" 배지에 쓴다. 새 파란색을 만들지 않고 검증된 값을 재사용한다.
 */
export const EP_BLUE = '#1d4ed8';

export const fmtDate = (d: string) => d.replaceAll('-', '.');
/**
 * 두 페이지가 공유하는 CSS — 시리즈 카드·세로 포스터·격자·밴드·가로 레일·
 * 카테고리 칩·페이지 버튼·더보기 링크. 히어로 캐러셀 전용 CSS는 여기 없다
 * (WebtoonListClient.tsx 안에만 필요).
 */
export const WEBTOON_GRID_CSS = `
  .wt-wrap { max-width: 960px; margin: 0 auto;
    padding-left: clamp(20px, 5vw, 32px); padding-right: clamp(20px, 5vw, 32px); }

  /* ── 시리즈 카드 ── 카드 전체를 감싸는 박스는 없다(2026-08-21, 참고
     이미지 피드백 — "텍스트가 있는 곳에는 박스를 없애 달라"). 둥근 모서리·
     그림자는 포스터(.wt-poster)에만 있고, 제목·메타 텍스트는 페이지
     배경 위에 그냥 놓인다 — 참고 이미지의 웹툰 앱들도 표지만 카드처럼
     떠 있고 글자는 배경과 한 몸이다. */
  .wt-card { display: block; text-decoration: none; height: 100%;
    transition: transform .18s ease; }
  .wt-card:hover { transform: translateY(-2px); }
  .wt-card:hover .wt-poster { box-shadow: 0 2px 4px rgba(17,24,39,.06), 0 12px 28px rgba(17,24,39,.10); }
  .wt-card:focus-visible { outline: 2px solid ${INK}; outline-offset: 2px; border-radius: 12px; }
  .wt-card:hover .wt-poster-fg { transform: scale(1.03); }
  .wt-card:hover .wt-t { text-decoration: underline; text-underline-offset: 2px; }

  /* ── 세로 포스터 ── 2:3. contain+블러 배경(레터박스) 방식을 썼다가
     "위아래 뿌연 여백 없이, 확대되어도 사진으로만 세로 비율을 채워 달라"는
     요청으로 cover 로 바꿨다(2026-08-21) — 원본을 세로 박스에 꽉 채우고
     넘치는 부분만 자른다. 표지 상당수가 3:2 가로라 크롭 폭이 크지만(2:3
     박스 기준 원본의 약 44%만 보임), 이건 사용자가 명시적으로 감수하기로
     확인한 트레이드오프다. */
  .wt-poster { position: relative; aspect-ratio: 2 / 3; overflow: hidden;
    background: ${PLACEHOLDER}; border-radius: 12px; box-shadow: ${CARD_SHADOW};
    transition: box-shadow .18s ease; }
  .wt-poster-fg { position: absolute; inset: 0; transition: transform .3s ease; }
  /* 화수 배지 — 파란색(2026-08-21, 참고 이미지 요청. 어두운 반투명 채움 대신
     사이트 유일의 파란 액센트 EP_BLUE 로 통일했다). 흰 글자와 6.70:1. */
  .wt-poster-badge { position: absolute; right: 8px; bottom: 8px; font-size: 12px;
    font-weight: 700; color: #fff; background: ${EP_BLUE}; padding: 4px 8px;
    border-radius: 4px; font-variant-numeric: tabular-nums; }

  /* ── 격자 ── 375px 에서 2열. */
  .wt-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px 12px;
    list-style: none; margin: 0; padding: 0; }
  @media (min-width: 640px) { .wt-grid { grid-template-columns: repeat(3, 1fr); gap: 24px 16px; } }
  @media (min-width: 900px) { .wt-grid { grid-template-columns: repeat(4, 1fr); } }

  /* ── 격자 밴드 ── 13px MUTED 가 4.63:1 로 통과하는 가장 진한 회색. */
  .wt-band { background: ${BAND}; border-top: 1px solid ${BAND_EDGE};
    margin-top: 48px; padding: 40px 0 96px; }

  /* ── 가로 레일 ── 세로 포스터라 슬롯이 좁고 길다. */
  .wt-rail { display: flex; gap: 12px; overflow-x: auto; scroll-snap-type: x mandatory;
    list-style: none; margin: 0; padding: 4px 0 8px; scrollbar-width: thin;
    overscroll-behavior-x: contain; }
  .wt-rail > li { flex: 0 0 132px; scroll-snap-align: start; }
  @media (min-width: 640px) { .wt-rail { gap: 16px; } .wt-rail > li { flex: 0 0 176px; } }

  /* 레일 화살표 — 마우스 사용자용. 터치는 스와이프가 자연스러워 숨긴다. */
  .wt-arrow { display: none; }
  @media (min-width: 640px) {
    .wt-arrow { display: inline-flex; align-items: center; justify-content: center;
      width: 44px; height: 44px; border-radius: 999px; border: 1px solid #e5e7eb;
      background: #fff; color: ${INK}; cursor: pointer;
      transition: background .14s ease, border-color .14s ease; }
    .wt-arrow:hover:not(:disabled) { background: ${CHIP}; border-color: #d1d5db; }
    .wt-arrow:focus-visible { outline: 2px solid ${INK}; outline-offset: 2px; }
    .wt-arrow:disabled { color: #9ca3af; cursor: default; }
  }

  /* ── 카테고리 칩 ── NewsTimeMachineSection 의 .ntm-chip 과 같은 규격
     (44px 터치 타겟 · 알약 · 활성은 채움+굵기). */
  .wt-chips { display: flex; gap: 8px; overflow-x: auto; padding: 4px 0;
    list-style: none; margin: 0; scrollbar-width: none; }
  .wt-chips::-webkit-scrollbar { display: none; }
  .wt-chip { display: inline-flex; align-items: center; justify-content: center;
    min-height: 44px; padding: 0 16px; border-radius: 999px; border: none;
    font-size: 14px; font-weight: 600; background: ${CHIP}; color: ${BODY};
    white-space: nowrap; text-decoration: none;
    transition: background .15s ease, color .15s ease; }
  .wt-chip:hover { background: #e9ebef; color: ${INK}; }
  .wt-chip[aria-current="page"] { background: ${INK}; color: #fff; font-weight: 700; }
  .wt-chip:focus-visible { outline: 2px solid ${INK}; outline-offset: 2px; }
  .wt-chip-n { margin-left: 6px; font-size: 13px; font-weight: 600;
    font-variant-numeric: tabular-nums; color: ${BODY}; }
  .wt-chip:hover .wt-chip-n { color: ${INK}; }
  .wt-chip[aria-current="page"] .wt-chip-n { color: rgba(255,255,255,.75); }

  .wt-page { transition: background .14s ease, color .14s ease; }
  .wt-page:hover { background: ${CHIP}; }
  .wt-page:focus-visible { outline: 2px solid ${INK}; outline-offset: 2px; }

  /* 더보기 — 섹션 제목 옆에 붙는 링크. 밑줄 없는 평문 + 화살표(헤더 nav
     탭과는 다른 신호, "이동"임을 화살표로만 말한다). */
  .wt-more { font-size: 13px; font-weight: 700; color: ${MUTED}; text-decoration: none;
    transition: color .14s ease; }
  .wt-more:hover { color: ${INK}; text-decoration: underline; text-underline-offset: 3px; }
  .wt-more:focus-visible { outline: 2px solid ${INK}; outline-offset: 3px; border-radius: 4px; }

  @media (prefers-reduced-motion: reduce) {
    .wt-card, .wt-poster-fg, .wt-chip, .wt-page, .wt-arrow, .wt-more { transition: none; }
    .wt-card:hover { transform: none; }
    .wt-card:hover .wt-poster-fg { transform: none; }
  }
`;
