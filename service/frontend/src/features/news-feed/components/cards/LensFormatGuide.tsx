'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LENS_PERSPECTIVES } from '@/shared/constants/lensPerspectives';

/**
 * "지면 특별 코너" 첫 방문자용 가이드 — 같은 이슈가 레터·웹툰·팟캐스트·영상 네 가지로 만들어져 있음을 알려 준다.
 *  - 이미지 파일 없이 인라인 SVG 스케치(어두운 잉크 선 + 거친 필터 + 옅은 파랑 면)로 그린다.
 *  - 네 형식을 3.6초씩 차례로 시연한다. 시연 중인 행만 강조되고 그림이 반복 재생되며, 시연 행에는 "어디서 고르는지"(기사 화면의 형식 탭 이름) 한 줄이 붙는다.
 *  - 사용자가 행을 누르거나 포커스하면 자동 넘김을 멈추고 그 행을 보여 준다. 움직임 줄이기 설정이면 자동 넘김·반복을 끄고 완성된 그림만 보여 준다.
 * 모달 동작(포털, 포커스 이동·복귀, Tab 가두기, ESC, 스크롤 잠금)을 포함하며, FeedPage의 transform 조상 때문에 createPortal을 쓴다.
 */

const EASE = 'cubic-bezier(.22,.8,.22,1)';
const INK = '#1f2937';
const TINT = '#eaf1ff';
const BLUE = '#5b8def';
const AMBER = '#FFB020';
const STEP_MS = 3600;

// 형식별 카피 — 이름은 "하고 싶은 행동", 설명은 "얻는 이점", how는 "어디서 누르는지"로 쓴다.
const COPY: Record<string, { name: string; phrases: string[]; how: string }> = {
  레터: { name: '차근차근 읽을래요', phrases: ['배경부터 전망까지,', '글 한 편으로 풀어드려요'], how: '기사 화면 위 탭에서 ‘레터’를 눌러요' },
  웹툰: { name: '그림으로 쓱 볼래요', phrases: ['대화를 따라가면', '금방 이해돼요'], how: '탭에서 ‘웹툰’을 누르고 아래로 쭉 내려요' },
  팟캐스트: { name: '귀로 들을래요', phrases: ['출퇴근길에 틀어두면', '핵심이 들려요'], how: '탭에서 ‘팟캐스트’를 누르면 바로 재생돼요' },
  영상: { name: '눈으로 훑을래요', phrases: ['핵심 숫자만', '콕 짚어 보여드려요'], how: '탭에서 ‘영상’을 누르면 짧게 보여줘요' },
};

type LineProps = { fill: 'none'; stroke: string; strokeWidth: number; strokeLinecap: 'round'; strokeLinejoin: 'round'; pathLength: 1 };
const line: LineProps = { fill: 'none', stroke: INK, strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', pathLength: 1 };

/** 스케치 한 장. 클래스 gs-l = 열릴 때 한 번 그려지는 선, gs-xx = 시연 중(활성 행)에만 반복되는 동작. */
function Sketch({ short, filterId }: { short: string; filterId: string }) {
  const common = { width: '100%', height: '100%', viewBox: '0 0 96 76', 'aria-hidden': true } as const;

  switch (short) {
    case '레터':
      return (
        <svg {...common}>
          <g filter={`url(#${filterId})`}>
            <rect x="21" y="13" width="50" height="56" rx="3" fill={TINT} />
            <path className="gs-l" d="M16 9 H62 a3 3 0 0 1 3 3 V62 a3 3 0 0 1 -3 3 H16 a3 3 0 0 1 -3 -3 V12 a3 3 0 0 1 3 -3 Z" {...line} />
            <path className="gs-l gs-w" style={{ animationDelay: '.15s' }} d="M21 21 H47" {...line} strokeWidth={2.6} />
            <path className="gs-l gs-w" style={{ animationDelay: '.55s' }} d="M21 30 H57" {...line} strokeWidth={1.4} />
            <path className="gs-l gs-w" style={{ animationDelay: '.95s' }} d="M21 37 H55" {...line} strokeWidth={1.4} />
            <path className="gs-l gs-w" style={{ animationDelay: '1.35s' }} d="M21 44 H57" {...line} strokeWidth={1.4} />
            <path className="gs-l gs-w" style={{ animationDelay: '1.75s' }} d="M21 51 H44" {...line} strokeWidth={1.4} />
            <g className="gs-pencil">
              <path d="M70 58 L84 24 L88 26 L75 60 L70 62 Z" {...line} fill="#fff" />
              <path d="M70 58 L75 60" {...line} stroke={BLUE} strokeWidth={2.4} />
            </g>
          </g>
        </svg>
      );
    case '웹툰':
      return (
        <svg {...common}>
          <g filter={`url(#${filterId})`}>
            <rect x="14" y="14" width="40" height="26" rx="2" fill={TINT} />
            <path className="gs-l gs-c1" d="M10 10 H52 V36 H10 Z" {...line} />
            <path className="gs-l gs-c2" style={{ animationDelay: '.12s' }} d="M57 10 H86 V36 H57 Z" {...line} />
            <path className="gs-l gs-c3" style={{ animationDelay: '.24s' }} d="M10 41 H34 V66 H10 Z" {...line} />
            <path className="gs-l gs-c4" style={{ animationDelay: '.36s' }} d="M39 41 H86 V66 H39 Z" {...line} />
            <g className="gs-bubble">
              <path d="M16 16 q9 -4 18 0 q9 4 0 9 q-3 2 -7 2 l-4 4 l0 -4 q-7 -1 -7 -5 q0 -4 0 -6 Z" {...line} fill="#fff" />
              <circle className="gs-dot gs-dot1" cx="21" cy="21" r="1.3" fill={INK} />
              <circle className="gs-dot gs-dot2" cx="26" cy="21" r="1.3" fill={INK} />
              <circle className="gs-dot gs-dot3" cx="31" cy="21" r="1.3" fill={INK} />
            </g>
            <path className="gs-l gs-c4" style={{ animationDelay: '.62s' }} d="M62 62 q4 -14 12 -14 q8 0 8 14" {...line} stroke={BLUE} />
          </g>
        </svg>
      );
    case '팟캐스트':
      return (
        <svg {...common}>
          <g filter={`url(#${filterId})`}>
            <circle cx="52" cy="40" r="22" fill={TINT} />
            <g className="gs-hp">
              <path className="gs-l" d="M20 46 V38 a28 28 0 0 1 56 0 V46" {...line} />
              <path className="gs-l" style={{ animationDelay: '.15s' }} d="M16 42 h8 a2 2 0 0 1 2 2 v14 a2 2 0 0 1 -2 2 h-6 a4 4 0 0 1 -4 -4 Z" {...line} fill="#fff" />
              <path className="gs-l" style={{ animationDelay: '.25s' }} d="M80 42 h-8 a2 2 0 0 0 -2 2 v14 a2 2 0 0 0 2 2 h6 a4 4 0 0 0 4 -4 Z" {...line} fill="#fff" />
            </g>
            {[38, 44, 50, 56, 62].map((x, i) => (
              <path
                key={x}
                className={`gs-bar gs-bar${i + 1}`}
                d={`M${x} ${[52, 58, 54, 58, 54][i]} V${[42, 36, 40, 32, 38][i]}`}
                {...line}
                stroke={BLUE}
                strokeWidth={2.6}
                pathLength={undefined}
              />
            ))}
          </g>
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <g filter={`url(#${filterId})`}>
            <rect x="19" y="19" width="62" height="40" rx="5" fill={TINT} />
            <path className="gs-l" d="M15 14 H73 a4 4 0 0 1 4 4 V52 a4 4 0 0 1 -4 4 H15 a4 4 0 0 1 -4 -4 V18 a4 4 0 0 1 4 -4 Z" {...line} />
            <g className="gs-play">
              <path d="M36 24 L54 35 L36 46 Z" {...line} fill={AMBER} />
            </g>
            <circle className="gs-tap" cx="44" cy="35" r="6" fill="none" stroke={BLUE} strokeWidth={1.6} />
            <path d="M15 63 H73" {...line} strokeWidth={1.4} />
            <path className="gs-prog" d="M15 63 H73" {...line} stroke={BLUE} strokeWidth={2.6} />
            <path className="gs-spark" d="M82 20 l5 -5 M84 30 h7 M82 40 l5 5" {...line} strokeWidth={1.4} pathLength={undefined} />
          </g>
        </svg>
      );
  }
}

// 하단 버튼 카피 — 지금 시연 중인 형식의 "행동"으로 바뀐다.
const CTA: Record<string, string> = {
  레터: '지금 읽으러 갈래요',
  웹툰: '지금 웹툰 보러 갈래요',
  팟캐스트: '지금 들으러 갈래요',
  영상: '지금 영상 보러 갈래요',
};

/**
 * onGo — 하단 버튼을 눌렀을 때 고른 형식(0=레터, 1=웹툰, 2=팟캐스트, 3=영상)으로 오늘 기사를 열게 한다.
 * 없으면 버튼은 그냥 닫기로 동작한다.
 */
export function LensFormatGuide({ onClose, onGo, initialIndex }: { onClose: () => void; onGo?: (formatIndex: number) => void; initialIndex?: number }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const uid = useId().replace(/:/g, '');
  const filterId = `${uid}-rough`;
  // 지금 시연 중인 행. 사용자가 행을 건드리면 자동 넘김을 멈춘다.
  // 헤더의 칩(읽기·웹툰·듣기·영상)에서 열렸으면 그 형식부터 보여 주고, 그 뒤 자동 넘김은 이어간다(사용자가 행을 고르면 멈춘다).
  const [active, setActive] = useState(initialIndex ?? 0);
  const [auto, setAuto] = useState(true);

  useEffect(() => {
    const restoreFocusTo = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      restoreFocusTo?.focus?.();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // 자동 넘김 — 움직임 줄이기면 켜지 않는다. 행을 직접 고르면 멈춘다.
  useEffect(() => {
    if (!auto) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const id = window.setInterval(() => setActive((i) => (i + 1) % LENS_PERSPECTIVES.length), STEP_MS);
    return () => window.clearInterval(id);
  }, [auto]);

  function pick(i: number) {
    setAuto(false);
    setActive(i);
  }

  /** Tab을 패널 안에 가둔다. */
  function trapTab(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'Tab') return;
    const nodes = panelRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [href]');
    if (!nodes || nodes.length === 0) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    const cur = document.activeElement;
    if (e.shiftKey && (cur === first || cur === panelRef.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && cur === last) {
      e.preventDefault();
      first.focus();
    }
  }

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div role="dialog" aria-modal="true" aria-labelledby={`${uid}-title`} onKeyDown={trapTab} style={{ position: 'fixed', inset: 0, zIndex: 200 }}>
      <style>{`
        @keyframes gs-in { from { opacity: 0; transform: translateY(18px) scale(.985); } to { opacity: 1; transform: none; } }
        @keyframes gs-fade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes gs-draw { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
        @keyframes gs-rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }

        .gs-scrim { position: absolute; inset: 0; background: rgba(17,24,39,0.46); -webkit-backdrop-filter: blur(3px); backdrop-filter: blur(3px); animation: gs-fade .22s ease both; }
        .gs-panel { position: relative; width: 100%; max-width: 460px; max-height: min(92vh, 800px); overflow-y: auto; overscroll-behavior: contain; -webkit-overflow-scrolling: touch;
          background: #fff; border-radius: 22px; padding: 28px clamp(16px, 5vw, 26px) 22px;
          box-shadow: 0 40px 80px -32px rgba(17,24,39,0.45); animation: gs-in .32s ${EASE} both; }
        .gs-panel:focus { outline: none; }
        .gs-head { padding: 0 clamp(4px, 1vw, 8px); }

        .gs-close { position: absolute; top: 14px; right: 14px; width: 40px; height: 40px; display: grid; place-items: center; border: none; border-radius: 50%; background: none; color: #6b7280; cursor: pointer; transition: background .15s, color .15s; }
        .gs-close:hover { background: #f3f4f6; color: #111827; }
        .gs-close:focus-visible { outline: 2px solid #111827; outline-offset: -3px; }

        .gs-title { position: relative; display: inline-block; margin: 0; font-size: clamp(24px, 6vw, 28px); font-weight: 800; letter-spacing: -0.03em; line-height: 1.3; color: #111827; word-break: keep-all; }
        .gs-scribble { position: absolute; left: -2px; right: 0; bottom: -4px; width: calc(100% + 4px); height: 10px; overflow: visible; }
        .gs-lead { margin: 14px 0 0; font-size: 16px; line-height: 1.65; color: #4b5563; word-break: keep-all; text-wrap: balance; }
        .gs-ph { display: inline-block; white-space: nowrap; }
        @media (max-width: 340px) { .gs-ph { white-space: normal; } }

        .gs-list { list-style: none; margin: 18px 0 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
        .gs-li { animation: gs-rise .42s ${EASE} both; }
        /* 한 행 = 버튼. 시연 중인 행은 옅은 파랑 판 + 그림이 움직이고, 나머지는 한 걸음 물러난다. */
        .gs-row { display: flex; align-items: center; gap: 14px; width: 100%; padding: 12px 12px; border: none; border-radius: 18px; background: transparent; text-align: left; font-family: inherit; cursor: pointer;
          transition: background .3s ${EASE}; }
        .gs-row[data-active='true'] { background: #f3f7ff; }
        .gs-row:focus-visible { outline: 2px solid #3d70de; outline-offset: -2px; }
        .gs-art { flex: none; width: 96px; height: 76px; opacity: .72; transition: opacity .3s ease; }
        .gs-row[data-active='true'] .gs-art { opacity: 1; }
        .gs-art svg { display: block; overflow: visible; }
        .gs-txt { min-width: 0; flex: 1; }
        .gs-name { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; font-size: 18px; font-weight: 800; letter-spacing: -0.02em; color: #111827; }
        .gs-time { font-size: 13px; font-weight: 600; color: #6b7280; }
        .gs-line { margin: 4px 0 0; font-size: 15px; line-height: 1.55; color: #4b5563; word-break: keep-all; }
        /* 시연 중인 행에만 "어디서 누르는지" 한 줄이 부드럽게 펼쳐진다. */
        .gs-how-wrap { display: grid; grid-template-rows: 0fr; transition: grid-template-rows .32s ${EASE}; }
        .gs-row[data-active='true'] .gs-how-wrap { grid-template-rows: 1fr; }
        .gs-how-wrap > div { overflow: hidden; min-height: 0; }
        .gs-how { margin: 8px 0 0; font-size: 13.5px; font-weight: 700; line-height: 1.5; color: #3d70de; word-break: keep-all; }
        .gs-prog-bar { height: 2px; margin-top: 8px; border-radius: 2px; background: rgba(61,112,222,.16); overflow: hidden; }
        .gs-prog-bar > i { display: block; height: 100%; width: 100%; background: #3d70de; transform-origin: left; transform: scaleX(0); }
        .gs-row[data-active='true'][data-auto='true'] .gs-prog-bar > i { animation: gs-step ${STEP_MS}ms linear forwards; }
        @keyframes gs-step { from { transform: scaleX(0); } to { transform: scaleX(1); } }

        /* ── 그림 ── 열릴 때 한 번 그려지고(gs-l), 시연 중이면 형식마다 다른 동작이 반복된다. */
        .gs-l { stroke-dasharray: 1; stroke-dashoffset: 1; animation: gs-draw .7s ${EASE} .1s forwards; }
        .gs-pencil, .gs-hp, .gs-bubble, .gs-play, .gs-bar, .gs-spark, .gs-dot { transform-box: fill-box; transform-origin: center; }
        .gs-prog { stroke-dasharray: 1; stroke-dashoffset: 0; }
        .gs-tap { opacity: 0; transform-box: fill-box; transform-origin: center; }

        /* 레터 — 연필이 줄을 한 줄씩 쓴다(줄은 지워졌다 다시 쓰이며 반복). */
        .gs-row[data-active='true'] .gs-w { animation: gs-write 4.6s ease-in-out infinite; }
        @keyframes gs-write { 0% { stroke-dashoffset: 1; opacity: 1; } 12% { stroke-dashoffset: 0; } 86% { stroke-dashoffset: 0; opacity: 1; } 94% { stroke-dashoffset: 0; opacity: 0; } 100% { stroke-dashoffset: 1; opacity: 0; } }
        .gs-row[data-active='true'] .gs-pencil { animation: gs-pencil 4.6s ease-in-out infinite; }
        @keyframes gs-pencil { 0% { transform: translate(-23px,-41px); } 10% { transform: translate(-23px,-41px); } 20% { transform: translate(-13px,-32px); } 30% { transform: translate(-15px,-25px); } 40% { transform: translate(-13px,-18px); } 50% { transform: translate(-26px,-11px); } 62% { transform: translate(0,0); } 100% { transform: translate(0,0); } }

        /* 웹툰 — 컷이 1→2→3→4로 나타나고, 말풍선이 뜨며 점이 깜빡인다. */
        .gs-row[data-active='true'] .gs-c1, .gs-row[data-active='true'] .gs-c2, .gs-row[data-active='true'] .gs-c3, .gs-row[data-active='true'] .gs-c4 { animation: gs-cut 4.8s ease-in-out infinite; stroke-dashoffset: 0; }
        .gs-row[data-active='true'] .gs-c1 { animation-delay: 0s !important; }
        .gs-row[data-active='true'] .gs-c2 { animation-delay: .45s !important; }
        .gs-row[data-active='true'] .gs-c3 { animation-delay: .9s !important; }
        .gs-row[data-active='true'] .gs-c4 { animation-delay: 1.35s !important; }
        @keyframes gs-cut { 0% { opacity: 0; transform: translateY(4px); } 10% { opacity: 1; transform: none; } 88% { opacity: 1; } 96%, 100% { opacity: 0; } }
        .gs-row[data-active='true'] .gs-bubble { animation: gs-pop 4.8s ease-in-out infinite; }
        @keyframes gs-pop { 0%, 14% { opacity: 0; transform: scale(.6); } 22% { opacity: 1; transform: scale(1.08); } 28% { transform: scale(1); } 88% { opacity: 1; } 96%, 100% { opacity: 0; } }
        .gs-row[data-active='true'] .gs-dot { animation: gs-blink 1.2s ease-in-out infinite; }
        .gs-row[data-active='true'] .gs-dot2 { animation-delay: .2s; } .gs-row[data-active='true'] .gs-dot3 { animation-delay: .4s; }
        @keyframes gs-blink { 0%, 100% { opacity: .25; } 50% { opacity: 1; } }

        /* 팟캐스트 — 헤드폰이 박자에 맞춰 살짝 들썩이고, 소리 막대가 오르내린다. */
        .gs-row[data-active='true'] .gs-bar { animation: gs-eq 1s ease-in-out infinite; stroke-dashoffset: 0; }
        .gs-row[data-active='true'] .gs-bar1 { animation-duration: .9s; } .gs-row[data-active='true'] .gs-bar2 { animation-duration: 1.15s; animation-delay: .1s; }
        .gs-row[data-active='true'] .gs-bar3 { animation-duration: .8s; animation-delay: .2s; } .gs-row[data-active='true'] .gs-bar4 { animation-duration: 1.05s; animation-delay: .05s; }
        .gs-row[data-active='true'] .gs-bar5 { animation-duration: .95s; animation-delay: .25s; }
        @keyframes gs-eq { 0%, 100% { transform: scaleY(.45); } 50% { transform: scaleY(1.25); } }
        .gs-row[data-active='true'] .gs-hp { animation: gs-bob 1.9s ease-in-out infinite; }
        @keyframes gs-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-1.6px); } }

        /* 영상 — 손가락으로 재생을 누르면(파문) 삼각형이 눌렸다 돌아오고 진행선이 찬다. */
        .gs-row[data-active='true'] .gs-play { animation: gs-press 4.2s ease-in-out infinite; }
        @keyframes gs-press { 0%, 8% { transform: scale(1); } 12% { transform: scale(.82); } 20% { transform: scale(1); } 100% { transform: scale(1); } }
        .gs-row[data-active='true'] .gs-tap { animation: gs-ripple 4.2s ease-out infinite; }
        @keyframes gs-ripple { 0%, 8% { opacity: 0; transform: scale(.4); } 12% { opacity: .9; transform: scale(.8); } 26% { opacity: 0; transform: scale(2.2); } 100% { opacity: 0; } }
        .gs-row[data-active='true'] .gs-prog { animation: gs-fill 4.2s linear infinite; }
        @keyframes gs-fill { 0%, 14% { stroke-dashoffset: 1; } 86% { stroke-dashoffset: 0; } 96% { stroke-dashoffset: 0; opacity: 0; } 100% { stroke-dashoffset: 1; opacity: 0; } }
        .gs-row[data-active='true'] .gs-spark { animation: gs-blink 1.4s ease-in-out infinite; }

        .gs-done { display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; height: 52px; margin-top: 14px; border: none; border-radius: 16px; background: #3d70de; color: #fff; font-size: 16px; font-weight: 700; font-family: inherit; cursor: pointer; transition: background .15s, transform .15s; }
        /* 서울경제 CI 파랑(#5b8def)을 흰 글자 대비 4.5:1이 나오도록 한 단계 깊게 쓴다. */
        .gs-done:hover { background: #3260c8; }
        .gs-done:active { transform: scale(.985); }
        /* 형식이 바뀔 때 글자가 살짝 올라오며 바뀌고, 화살표는 호버 때 앞으로 나아간다. */
        .gs-done-t { animation: gs-rise .26s ${EASE} both; }
        .gs-done-arrow { display: inline-block; transition: transform .2s ${EASE}; }
        .gs-done:hover .gs-done-arrow { transform: translateX(3px); }
        .gs-done:focus-visible { outline: 2px solid #3d70de; outline-offset: 3px; }

        @media (max-width: 380px) { .gs-art { width: 76px; height: 60px; } .gs-row { gap: 10px; padding: 10px 8px; } }
        /* 움직임을 줄여 달라고 한 사용자에게는 반복·자동 넘김 없이 완성된 그림만 보여 준다. */
        @media (prefers-reduced-motion: reduce) {
          .gs-scrim, .gs-panel, .gs-li { animation: none !important; }
          .gs-l { animation: none !important; stroke-dashoffset: 0; }
          .gs-row *, .gs-row[data-active='true'] * { animation: none !important; }
          .gs-prog-bar { display: none; }
          .gs-close, .gs-done, .gs-row, .gs-how-wrap, .gs-done-arrow { transition: none !important; }
          .gs-done-t { animation: none !important; }
        }
      `}</style>

      {/* 선이 살짝 흔들리는 거친 필터 — 컴퓨터로 그은 직선이 아니라 손으로 그은 느낌. 모든 스케치가 공유한다. */}
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
        <filter id={filterId} x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="4" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="2.4" />
        </filter>
      </svg>

      <div className="gs-scrim" onClick={onClose} />

      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'clamp(12px, 4vw, 40px)', pointerEvents: 'none' }}>
        <div ref={panelRef} tabIndex={-1} className="gs-panel" style={{ pointerEvents: 'auto' }}>
          <button type="button" onClick={onClose} aria-label="닫기" className="gs-close">
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>

          <div className="gs-head">
            <h2 id={`${uid}-title`} className="gs-title">
              오늘 이슈, 어떻게 볼래요?
              {/* 손으로 그은 밑줄 — 제목 아래 한 번 그어지는 선. */}
              <svg className="gs-scribble" viewBox="0 0 200 10" preserveAspectRatio="none" aria-hidden>
                <path className="gs-l" style={{ animationDelay: '.35s' }} d="M2 6 C28 2, 60 8, 98 5 S168 3, 198 6" fill="none" stroke={AMBER} strokeWidth={3} strokeLinecap="round" pathLength={1} />
              </svg>
            </h2>
            <p className="gs-lead">
              <span className="gs-ph">같은 뉴스를 네 가지로 만들어 뒀어요.</span> <span className="gs-ph">지금 상황에 맞는 걸 골라 보면 돼요.</span>
            </p>
          </div>

          <ul className="gs-list">
            {LENS_PERSPECTIVES.map((p, i) => {
              const c = COPY[p.short] ?? { name: p.short, phrases: [p.content], how: '' };
              const on = active === i;
              return (
                <li key={p.short} className="gs-li" style={{ animationDelay: `${80 + i * 70}ms` }}>
                  <button
                    type="button"
                    className="gs-row"
                    data-active={on}
                    data-auto={auto}
                    aria-pressed={on}
                    onClick={() => pick(i)}
                    onMouseEnter={() => pick(i)}
                    onFocus={() => setActive(i)}
                  >
                    <div className="gs-art">
                      {/* key로 시연이 시작될 때마다 그림을 처음부터 다시 재생한다. */}
                      <Sketch key={on ? `on-${i}` : `off-${i}`} short={p.short} filterId={filterId} />
                    </div>
                    <div className="gs-txt">
                      <div className="gs-name">
                        <span>{c.name}</span>
                        <span className="gs-time">{p.duration}</span>
                      </div>
                      <p className="gs-line">
                        {c.phrases.map((ph, k) => (
                          <span key={k}>
                            {k > 0 ? ' ' : null}
                            <span className="gs-ph">{ph}</span>
                          </span>
                        ))}
                      </p>
                      <div className="gs-how-wrap" aria-hidden={!on}>
                        <div>
                          <p className="gs-how">{c.how}</p>
                          <div className="gs-prog-bar">
                            <i key={`${on}-${active}-${auto}`} />
                          </div>
                        </div>
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>

          <button type="button" onClick={() => (onGo ? onGo(active) : onClose())} className="gs-done">
            <span key={active} className="gs-done-t">
              {CTA[LENS_PERSPECTIVES[active]?.short ?? ''] ?? '지금 보러 갈래요'}
            </span>
            <span aria-hidden className="gs-done-arrow">
              →
            </span>
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
