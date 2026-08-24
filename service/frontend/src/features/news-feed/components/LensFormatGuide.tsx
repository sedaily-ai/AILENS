'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LENS_PERSPECTIVES, type LensPerspective } from '@/shared/constants/lensPerspectives';

/**
 * "지면 특별 코너" 첫 방문자용 가이드 — 네 형식(레터·웹툰·팟캐스트·영상)이
 * 각각 뭘 담고 있는지 알려준다.
 *
 * ── 2026-08-21 (1차) 자동재생 캐러셀 → 직접 눌러보는 디스클로저 ──
 * 이전 버전은 커서가 스스로 탭·행을 클릭하는 3단계 루프 애니메이션
 * (LensGuideAnimation.tsx, 삭제) + 그 아래 4형식 정적 리스트였다. 세 가지가
 * 깨져 있었다:
 *  1. **375px에서 무대가 잘렸다.** `STAGE_W = 420`을 슬라이드 폭·트랙 폭·
 *     translateX 이동거리에 그대로 썼는데 375px 실제 가시 폭은 303px
 *     (= 375 − 32 백드롭 padding − 40 패널 padding)이라 오른쪽 117px이
 *     잘렸다. 4번째 탭 "시그널"(x 313~404)은 화면 밖이었다.
 *  2. **14.2초 자동재생인데 제어 수단이 없었다.** 점 인디케이터가
 *     `<span>`이라 클릭 불가, 일시정지·키보드 조작 없음,
 *     `prefers-reduced-motion` 무시.
 *  3. **같은 문구를 두 번 보여줬다.** 캐러셀이 형식별 `content`를 보여준
 *     직후 아래 정적 리스트가 똑같은 문장을 반복했다.
 *
 * 그래서 "보여주기"를 버리고 가이드 자체를 눌러보는 것으로 바꿨다. 커서가
 * 대신 클릭하는 걸 구경하는 대신 사용자가 직접 열어보면 실제 섹션의
 * 조작(형식을 눌러 고른다)을 몸으로 배운다.
 *
 * ── 2026-08-21 (2차) 카드 아코디언 → 헤어라인 인덱스 ──
 * 1차가 "가시성은 높지만 세련되지 않다"는 지적을 받았다. 흰 패널 위에 흰
 * 카드 4장(1px 테두리) + 그 안에 또 흰 샘플 박스(1px 테두리)로 액자가
 * 3중이었고, 일러스트는 40px 원에 갇혀 넷 다 비슷한 회색 덩어리가 됐다.
 * 카드·테두리를 전부 걷어내고 전폭 헤어라인으로만 구분하고, 열림은 배경색
 * 대신 (a) 왼쪽 3px 컬러 룰, (b) 펼쳐진 영역의 넉넉한 여백, (c) 일러스트
 * 불투명도로 표시하도록 바꿨다. 원형 마스크도 제거했다.
 *
 * ── 2026-08-21 (3차) 도식 → 미니어처 UI ──
 * 2차가 "평면적이고 단순해 보인다"는 지적을 받았다. 네 샘플을 나란히 놓고
 * 보니 원인이 분명했다 — **시각적 무게가 1:5:3:10으로 제각각**이었다.
 * 레터는 거의 안 보이는 얇은 회색 줄, 웹툰은 빨간 테두리 4컷에 빨간
 * 말풍선(경고 표시처럼 강렬), 팟캐스트는 초록 띠, 영상은 200px 검정
 * 블록(혼자만 입체감). 크기·모양·비율이 다 달라서 허공에 떠 있는
 * 것처럼 보였고, 그림자나 계층이 없어 평면적이었다.
 *
 * 그래서 샘플을 **공통 규격의 미니어처 UI**로 격상했다:
 *  - 모든 샘플이 같은 **캔버스**(전폭 × 96px, 형식 색 옅은 그라데이션) 위에
 *    같은 크기의 **흰 카드**(72px 고정 + 그림자)로 놓인다. 넷의 무게가
 *    같아지고, 카드가 플레이트 위에 떠서 깊이가 생긴다.
 *  - 카드 안에는 그 형식의 실제 화면 구조를 축소해 그린다 — 태그+헤드라인+
 *    본문(레터), 말풍선 든 4컷(웹툰), 커버+제목+파형(팟캐스트),
 *    프레임+재생+진행바(영상). 도식이 아니라 축소판이라 정보량이 있다.
 *  - 미니어처 안에는 글자를 넣지 않는다 — 실제 크기 글자가 축소판에 섞이면
 *    스케일 착시가 깨진다.
 *
 * ── 색 원칙 ──
 * 최초 버전은 강조색이 5개였다(LENS_ACCENT + 형식 4색 동시 노출). 여기서는
 * **열린 항목 하나의 색만** 보인다. 텍스트는 전부 무채색이고
 * (#111827 / #374151 / #4b5563 / #6b7280), 형식 색은 **흰 카드 위** 도형과
 * 왼쪽 룰에만 쓴다 — 형식 4색은 흰 배경에서 3.18~5.71:1로 UI 요소 기준
 * 3:1을 통과하지만, 자기 tint 위에서는 2.81~4.93:1로 4.5:1을 못 넘긴다
 * (영상 #d97706 on #f7f0e3 = 2.81:1). 그래서 tint는 캔버스 배경으로만 쓰고
 * 그 위에 색 도형이나 색 글자를 직접 얹지 않는다. 서수(①②③④)에도 색을
 * 입히지 않는다 — 14px 비굵은 글자는 4.5:1이 필요해 주황이 통과 못 한다.
 *
 * 형식 구분을 색에만 의존하지 않는다 — 서수 + 이름 + 일러스트가 함께 붙는다.
 *
 * ── 왜 createPortal 인가 ──
 * FeedPage.tsx의 `.tab-fade-in` transform이 조상에 남아 `position:fixed`의
 * containing block이 되면서 모달이 문서 중간으로 밀리는 문제가 있다.
 * VideoLightbox.tsx 상단 주석 참조 — 이 관례는 유지해야 한다.
 */

const EASE = 'cubic-bezier(.22,.8,.22,1)';

/**
 * 웹툰 4컷 — 말풍선 크기·위치와 **인물 위치(fx)** 를 컷마다 달리한다.
 * 넷이 똑같으면 만화가 아니라 반복 패턴으로 읽힌다.
 */
const CUTS = [
  { bw: 22, bh: 9, bx: 5, by: 7, fx: 62 },
  { bw: 15, bh: 8, bx: 14, by: 9, fx: 34 },
  { bw: 24, bh: 10, bx: 4, by: 6, fx: 66 },
  { bw: 17, bh: 8, bx: 11, by: 11, fx: 42 },
];

/** 레터 미니어처 — 제목 한 줄 + 구분선 + 본문 네 줄. 굵기 차이로 위계를 만든다. */
const DOC_BODY = ['100%', '94%', '98%', '62%'];

/** 팟캐스트 미니어처의 파형. 앞 PLAYED 개는 재생된 구간. */
const WAVE = [
  5, 9, 7, 12, 10, 14, 11, 8, 13, 6, 12, 9, 15, 7, 11, 8, 13, 10, 6, 12, 9, 14, 7, 11, 5, 10, 8, 13, 6, 11, 9, 7,
];
const WAVE_PLAYED = 14;

/**
 * 형식별 미니어처 UI. 넷 다 같은 캔버스(96px) 위 같은 카드(72px)에 담긴다 —
 * 크기가 통일돼야 네 형식이 같은 위계로 읽힌다.
 *
 * 등장 모션은 형식의 성격을 설명할 때만 쓴다(장식용 아님): 레터는 줄이
 * 위→아래로 그려지고(읽는 순서), 웹툰은 4컷이 1→2→3→4로 순차 등장하고
 * (컷 넘김), 팟캐스트는 파형이 좌→우로 솟고(시간축), 영상은 진행바가
 * 자란다(재생). 전부 1회성 — 무한 루프 없음.
 */
function FormatSample({ p }: { p: LensPerspective }) {
  switch (p.short) {
    case '레터':
      return (
        <div className="lfg-card lfg-doc">
          <span className="lfg-chip" style={{ background: p.color, animationDelay: '40ms' }} />
          <span className="lfg-hl" style={{ width: '90%', animationDelay: '90ms' }} />
          <span className="lfg-rule" style={{ animationDelay: '140ms' }} />
          {DOC_BODY.map((w, i) => (
            <span key={i} className="lfg-bl" style={{ width: w, animationDelay: `${180 + i * 40}ms` }} />
          ))}
        </div>
      );

    case '웹툰':
      return (
        <div className="lfg-card lfg-strip">
          {CUTS.map((c, i) => (
            <span key={i} className="lfg-cut" style={{ background: p.tint, animationDelay: `${60 + i * 80}ms` }}>
              <span
                className="lfg-bubble"
                style={{ background: p.color, width: c.bw, height: c.bh, left: c.bx, top: c.by }}
              />
              <span className="lfg-fig" style={{ left: `${c.fx}%` }} />
            </span>
          ))}
        </div>
      );

    case '팟캐스트':
      return (
        <div className="lfg-card lfg-pod">
          <span className="lfg-cover" style={{ background: p.color, animationDelay: '50ms' }}>
            <svg width={12} height={12} viewBox="0 0 24 24" fill="#fff" aria-hidden>
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
          <span className="lfg-col">
            <span className="lfg-hl" style={{ width: '78%', animationDelay: '110ms' }} />
            <span className="lfg-bl" style={{ width: '46%', animationDelay: '150ms' }} />
            <span className="lfg-wave">
              {WAVE.map((h, i) => (
                <span
                  key={i}
                  className="lfg-bar"
                  style={{
                    height: h,
                    background: p.color,
                    opacity: i < WAVE_PLAYED ? 1 : 0.24,
                    animationDelay: `${190 + i * 18}ms`,
                  }}
                />
              ))}
            </span>
          </span>
        </div>
      );

    case '영상':
      return (
        <div className="lfg-card lfg-vid">
          <span className="lfg-frame" style={{ animationDelay: '50ms' }}>
            <span className="lfg-play">
              <svg width={11} height={11} viewBox="0 0 24 24" fill={p.color} aria-hidden>
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
            <span className="lfg-cap" />
            <span className="lfg-track">
              <span className="lfg-track-f" style={{ background: p.color }} />
            </span>
          </span>
          <span className="lfg-col">
            <span className="lfg-chip" style={{ background: p.color, animationDelay: '130ms' }} />
            <span className="lfg-hl" style={{ width: '92%', animationDelay: '170ms' }} />
            <span className="lfg-hl" style={{ width: '58%', animationDelay: '210ms' }} />
            <span className="lfg-bl" style={{ width: '74%', animationDelay: '250ms' }} />
          </span>
        </div>
      );

    default:
      return null;
  }
}

export function LensFormatGuide({ onClose }: { onClose: () => void }) {
  // 처음엔 ① 레터가 열려 있다 — 빈 인덱스로 시작하면 "눌러야 뭔가 나온다"는
  // 걸 아무도 알려주지 않는다.
  const [openIndex, setOpenIndex] = useState(0);
  // 같은 항목을 다시 열어도 등장 모션이 다시 돌게 하는 리마운트 키.
  const [run, setRun] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const uid = useId();

  // 배경 스크롤 잠금 + 포커스 이동/복귀. MobileDrawer(Header.tsx:299-309)와
  // 같은 방식으로 이전 overflow 값을 복원한다.
  useEffect(() => {
    const restoreFocusTo = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    // 패널 자체로 포커스를 옮긴다(닫기 버튼이 아니라) — 스크린리더가
    // dialog 의 이름(aria-labelledby)부터 읽고 Tab 이 패널 안에서 시작된다.
    panelRef.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      restoreFocusTo?.focus?.();
    };
  }, []);

  // ESC 닫기 — 최초 버전은 이 리스너가 부모(LensPreviewSection)에 있었다.
  // 모달이 자기 생명주기를 소유해야 부모가 열림 상태를 몰라도 된다.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  /** Tab 을 패널 안에 가둔다 — 없으면 모달이 열린 채로 뒤 페이지 링크를 훑는다. */
  function trapTab(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'Tab') return;
    const nodes = panelRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [href]');
    if (!nodes || nodes.length === 0) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === panelRef.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function toggle(i: number) {
    setOpenIndex((cur) => (cur === i ? -1 : i));
    setRun((n) => n + 1);
  }

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${uid}-title`}
      onKeyDown={trapTab}
      style={{ position: 'fixed', inset: 0, zIndex: 200 }}
    >
      <style>{`
        /* ── 모션 ── 전부 1회성. 상태 변화(펼침)와 형식의 성격만 설명한다. */
        @keyframes lfg-in { from { opacity: 0; transform: translateY(16px) scale(.985); } to { opacity: 1; transform: none; } }
        @keyframes lfg-fade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes lfg-lift { from { opacity: 0; transform: translateY(8px) scale(.97); } to { opacity: 1; transform: none; } }
        @keyframes lfg-draw { from { transform: scaleX(0); opacity: 0; } to { transform: scaleX(1); opacity: 1; } }
        @keyframes lfg-pop { from { transform: scale(.76); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        @keyframes lfg-rise { from { transform: scaleY(.1); opacity: 0; } to { transform: scaleY(1); opacity: 1; } }
        @keyframes lfg-grow { from { transform: scaleX(0); } to { transform: scaleX(1); } }

        .lfg-scrim { position: absolute; inset: 0; background: rgba(17,24,39,0.5);
          -webkit-backdrop-filter: blur(3px); backdrop-filter: blur(3px);
          animation: lfg-fade .22s ease both; }

        .lfg-panel { --pad: 20px;
          position: relative; width: 100%; max-width: 480px; max-height: min(88vh, 780px);
          overflow-y: auto; -webkit-overflow-scrolling: touch; overscroll-behavior: contain;
          background: #fff; border-radius: 16px;
          box-shadow: 0 40px 80px -32px rgba(17,24,39,0.45), 0 0 0 1px rgba(17,24,39,0.05);
          animation: lfg-in .3s ${EASE} both; }
        @media (min-width: 480px) { .lfg-panel { --pad: 32px; } }
        /* 프로그램적으로 포커스를 받는 컨테이너다. Tab 순서에 없어서
           (tabindex="-1") 링을 지워도 키보드 사용자가 길을 잃지 않는다 —
           닫기 버튼·형식 4개·하단 버튼은 모두 :focus-visible 링을 갖는다. */
        .lfg-panel:focus { outline: none; }

        .lfg-head { padding: 20px var(--pad) 0; }
        .lfg-title { font-family: "Noto Serif KR", serif; font-size: clamp(20px, 4.6vw, 24px);
          font-weight: 700; color: #111827; letter-spacing: -0.02em; line-height: 1.35; }
        .lfg-lead { margin-top: 8px; font-size: 16px; line-height: 1.65; color: #4b5563; word-break: keep-all; }

        .lfg-close { width: 44px; height: 44px; margin: -8px -8px 0 0; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          border: none; border-radius: 50%; background: none; color: #6b7280; cursor: pointer;
          transition: background .15s ease, color .15s ease; }
        .lfg-close:hover { background: #f3f4f6; color: #111827; }
        .lfg-close:focus-visible { outline: 2px solid #111827; outline-offset: -4px; }

        /* ── 형식 인덱스 ── 박스 없이 전폭 헤어라인으로만 구분한다. */
        .lfg-list { margin-top: 16px; border-top: 1px solid rgba(17,24,39,0.09); }
        .lfg-item { position: relative; transition: box-shadow .26s ease; }
        .lfg-item + .lfg-item { border-top: 1px solid rgba(17,24,39,0.09); }
        /* 열림 표시 = 왼쪽 3px 컬러 룰. */
        .lfg-item[data-open='true'] { box-shadow: inset 3px 0 0 var(--c); }

        .lfg-trig { display: flex; align-items: center; gap: 16px; width: 100%; min-height: 56px;
          padding: 16px var(--pad); border: none; background: none; text-align: left; cursor: pointer;
          transition: background .16s ease; }
        .lfg-trig:hover { background: rgba(17,24,39,0.022); }
        .lfg-trig:focus-visible { outline: 2px solid #111827; outline-offset: -3px; }

        /* 원형 마스크를 걷어냈다 — 40px 원에 갇힌 라인아트는 넷 다 비슷한
           회색 덩어리로 보였다. 닫힌 항목은 불투명도로 물러나고, 열린
           항목만 형식 색 tint 판을 깔아 앵커가 되게 한다(라인아트가 연해서
           흰 배경에서는 무게가 안 실린다). 장식 이미지라 대비 규칙 대상은
           아니다 — alt="" 로 접근성 트리에서 빠진다. */
        .lfg-ill { width: 48px; height: 48px; flex-shrink: 0; overflow: hidden; border-radius: 10px;
          background: transparent; opacity: .5;
          transition: opacity .26s ease, background .26s ease; }
        .lfg-item[data-open='true'] .lfg-ill { opacity: 1; background: var(--tint); }
        .lfg-ill img { width: 100%; height: 100%; object-fit: cover; object-position: center 14%;
          mix-blend-mode: multiply; filter: contrast(1.1); }

        .lfg-txt { min-width: 0; flex: 1; }
        .lfg-name-row { display: flex; align-items: baseline; gap: 8px; }
        .lfg-ord { font-size: 14px; font-weight: 700; color: #6b7280; transition: color .2s ease; }
        .lfg-item[data-open='true'] .lfg-ord { color: #111827; }
        .lfg-name { font-size: 18px; font-weight: 700; color: #111827; letter-spacing: -0.01em; }
        .lfg-tag { display: block; margin-top: 4px; font-size: 14px; line-height: 1.5;
          color: #6b7280; word-break: keep-all; }

        .lfg-chev { flex-shrink: 0; color: #6b7280;
          transition: transform .3s ${EASE}, color .2s ease; }
        /* hover 시 살짝 오른쪽으로 — 누르면 뭔가 열린다는 방향 암시. */
        .lfg-trig:hover .lfg-chev { transform: translateX(3px); color: #374151; }
        .lfg-item[data-open='true'] .lfg-chev,
        .lfg-item[data-open='true'] .lfg-trig:hover .lfg-chev { transform: rotate(90deg); }

        /* 0fr → 1fr 로 열면 내용 높이를 몰라도 부드럽게 펼쳐진다.
           미지원 브라우저에서는 즉시 열림으로 폴백(레이아웃은 안 깨진다). */
        .lfg-pane { display: grid; grid-template-rows: 0fr; transition: grid-template-rows .34s ${EASE}; }
        .lfg-item[data-open='true'] .lfg-pane { grid-template-rows: 1fr; }
        .lfg-pane > div { overflow: hidden; min-height: 0; }
        .lfg-pane-inner { padding: 8px var(--pad) 24px; }
        .lfg-desc { margin-top: 16px; font-size: 16px; line-height: 1.7; color: #374151; word-break: keep-all; }

        /* ── 미니어처 캔버스 ── 넷 다 같은 규격. 형식 색 옅은 그라데이션
           플레이트 위에 흰 카드가 떠 있어 깊이가 생긴다. */
        .lfg-stage { position: relative; display: flex; align-items: center; justify-content: center;
          width: 100%; height: 88px; padding: 8px; border-radius: 12px; overflow: hidden;
          background: linear-gradient(135deg, var(--tint) 0%, var(--tint) 38%, #fcfdfe 100%);
          box-shadow: inset 0 0 0 1px rgba(17,24,39,0.05); }

        .lfg-card { position: relative; box-sizing: border-box; width: 100%; max-width: 300px; height: 72px;
          padding: 10px 12px; border-radius: 8px; background: #fff;
          box-shadow: 0 1px 2px rgba(17,24,39,0.07), 0 8px 18px -8px rgba(17,24,39,0.22);
          animation: lfg-lift .36s ${EASE} both; }

        /* 미니어처 부품 — 실제 크기 글자를 섞지 않는다(스케일 착시 유지). */
        .lfg-chip { height: 5px; width: 26px; border-radius: 3px; flex-shrink: 0;
          transform-origin: left center; animation: lfg-draw .34s ${EASE} both; }
        .lfg-hl { height: 5px; border-radius: 2px; background: #2f3742;
          transform-origin: left center; animation: lfg-draw .34s ${EASE} both; }
        .lfg-bl { height: 3px; border-radius: 2px; background: #d5dae1;
          transform-origin: left center; animation: lfg-draw .34s ${EASE} both; }
        .lfg-rule { height: 1px; width: 100%; background: rgba(17,24,39,0.08);
          transform-origin: left center; animation: lfg-draw .34s ${EASE} both; }
        .lfg-col { display: flex; flex-direction: column; justify-content: center; gap: 5px;
          min-width: 0; flex: 1; }

        /* 레터 — 태그 + 제목 한 줄 + 구분선 + 본문 네 줄. 굵기 차이(6px vs
           3px)로 제목·본문 위계가 읽힌다. 위에서 아래로 순서대로 그려진다. */
        .lfg-doc { display: flex; flex-direction: column; justify-content: center; gap: 4px; }
        .lfg-doc .lfg-hl { height: 6px; }

        /* 웹툰 — 말풍선 든 4컷이 1→2→3→4 로 순차 등장한다. */
        .lfg-strip { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
        .lfg-cut { position: relative; border-radius: 5px; overflow: hidden;
          box-shadow: inset 0 0 0 1px rgba(17,24,39,0.07);
          animation: lfg-pop .34s ${EASE} both; }
        .lfg-bubble { position: absolute; border-radius: 5px; }
        .lfg-bubble::after { content: ''; position: absolute; left: 4px; bottom: -3px;
          width: 5px; height: 4px; background: inherit; clip-path: polygon(0 0, 100% 0, 0 100%); }
        /* 인물 실루엣 — 머리+어깨. 있으면 컷이 패턴 아니라 만화로 읽힌다. */
        .lfg-fig { position: absolute; left: 50%; bottom: 0; transform: translateX(-50%);
          width: 20px; height: 13px; border-radius: 10px 10px 0 0; background: rgba(17,24,39,0.16); }
        .lfg-fig::before { content: ''; position: absolute; left: 50%; top: -7px; transform: translateX(-50%);
          width: 8px; height: 8px; border-radius: 50%; background: rgba(17,24,39,0.16); }

        /* 팟캐스트 — 커버 + 제목 + 파형. 파형이 좌→우로 솟는다. */
        .lfg-pod { display: flex; align-items: center; gap: 10px; }
        .lfg-cover { display: flex; align-items: center; justify-content: center; flex-shrink: 0;
          width: 52px; height: 52px; border-radius: 6px; padding-left: 2px;
          animation: lfg-pop .34s ${EASE} both; }
        /* 막대를 flex 로 늘려 우측 컬럼 폭을 다 쓴다 — 고정 폭이면 파형이
           카드 절반만 채워서 미완성처럼 보였다. */
        .lfg-wave { display: flex; align-items: center; gap: 2px; width: 100%; height: 16px; margin-top: 2px; }
        .lfg-bar { flex: 1 1 0; min-width: 2px; border-radius: 1px; animation: lfg-rise .3s ${EASE} both; }

        /* 영상 — 프레임 + 재생 + 자막 + 진행바. */
        .lfg-vid { display: flex; align-items: center; gap: 10px; }
        .lfg-frame { position: relative; display: flex; align-items: center; justify-content: center;
          flex-shrink: 0; width: 92px; height: 52px; border-radius: 6px; overflow: hidden;
          background: #141b26; animation: lfg-pop .34s ${EASE} both; }
        .lfg-play { display: flex; align-items: center; justify-content: center;
          width: 22px; height: 22px; margin-bottom: 4px; padding-left: 1px;
          border-radius: 50%; background: #fff; }
        .lfg-cap { position: absolute; left: 50%; bottom: 8px; transform: translateX(-50%);
          width: 42px; height: 4px; border-radius: 2px; background: rgba(255,255,255,0.78); }
        .lfg-track { position: absolute; left: 0; right: 0; bottom: 0; height: 3px;
          background: rgba(255,255,255,0.2); }
        .lfg-track-f { display: block; width: 42%; height: 100%; transform-origin: left center;
          animation: lfg-grow .8s ${EASE} .25s both; }

        /* sticky 를 뺐다 — 불투명한 하단 바가 ④ 영상 행을 덮어서 목록이
           잘린 것처럼 보였다. 콘텐츠가 넘칠 때는 마지막 행이 패널 아래
           경계에서 살짝 잘려 보이는 게 "아래에 더 있다"는 정상 신호다.
           상단 X(44px)·ESC·백드롭 탭으로 언제든 닫을 수 있다. */
        .lfg-foot { background: #fff; border-top: 1px solid rgba(17,24,39,0.09); }
        .lfg-done { width: 100%; height: 48px; border: none; background: none;
          font-size: 16px; font-weight: 700; color: #374151; cursor: pointer; transition: color .15s ease; }
        .lfg-done:hover { color: #111827; }
        .lfg-done:focus-visible { outline: 2px solid #111827; outline-offset: -3px; }

        /* 움직임을 줄여 달라고 한 사용자에게는 전부 최종 상태로 보여준다. */
        @media (prefers-reduced-motion: reduce) {
          .lfg-scrim, .lfg-panel, .lfg-card, .lfg-chip, .lfg-hl, .lfg-bl, .lfg-rule,
          .lfg-cut, .lfg-cover, .lfg-bar, .lfg-frame, .lfg-track-f { animation: none !important; }
          .lfg-panel, .lfg-item, .lfg-pane, .lfg-chev, .lfg-trig, .lfg-ill, .lfg-close, .lfg-done {
            transition: none !important; }
        }
      `}</style>

      <div className="lfg-scrim" onClick={onClose} />

      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 'clamp(16px, 4vw, 40px)',
          pointerEvents: 'none',
        }}
      >
        <div ref={panelRef} tabIndex={-1} className="lfg-panel" style={{ pointerEvents: 'auto' }}>
          <div className="lfg-head">
            <div className="flex items-start justify-between" style={{ gap: 16 }}>
              <h2 id={`${uid}-title`} className="lfg-title">
                같은 뉴스, 네 가지 형식
              </h2>
              <button type="button" onClick={onClose} aria-label="닫기" className="lfg-close">
                <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
            <p className="lfg-lead">
              매일 이슈 하나를 네 가지 형식으로 만들어요. 지면을 고른 뒤 원하는 형식을 누르면 돼요.
            </p>
          </div>

          <div className="lfg-list">
            {LENS_PERSPECTIVES.map((p, i) => {
              const open = openIndex === i;
              return (
                <div
                  key={p.short}
                  className="lfg-item"
                  data-open={open}
                  style={{ '--c': p.color, '--tint': p.tint } as React.CSSProperties}
                >
                  <button
                    type="button"
                    className="lfg-trig"
                    id={`${uid}-trig-${i}`}
                    aria-expanded={open}
                    aria-controls={`${uid}-pane-${i}`}
                    onClick={() => toggle(i)}
                  >
                    <span className="lfg-ill">
                      {/* eslint-disable-next-line @next/next/no-img-element -- public 정적 라인아트, LensViewClient.tsx와 동일 패턴 */}
                      <img src={p.illustration} alt="" width={48} height={48} />
                    </span>

                    <span className="lfg-txt">
                      <span className="lfg-name-row">
                        <span className="lfg-ord">{p.ordinal}</span>
                        <span className="lfg-name">{p.short}</span>
                      </span>
                      <span className="lfg-tag">{p.tagline}</span>
                    </span>

                    <svg className="lfg-chev" width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M9 6l6 6-6 6" />
                    </svg>
                  </button>

                  <div
                    className="lfg-pane"
                    id={`${uid}-pane-${i}`}
                    role="region"
                    aria-labelledby={`${uid}-trig-${i}`}
                    aria-hidden={!open}
                  >
                    <div>
                      <div className="lfg-pane-inner">
                        <div className="lfg-stage">
                          {/* 열 때마다 리마운트해서 등장 모션을 다시 돌린다. */}
                          <FormatSample key={open ? `run-${run}` : 'idle'} p={p} />
                        </div>
                        <p className="lfg-desc">{p.content}</p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="lfg-foot">
            <button type="button" onClick={onClose} className="lfg-done">
              닫기
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
