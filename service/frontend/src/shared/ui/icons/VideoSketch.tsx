import { useId } from 'react';

// 형식 스케치 3종(영상·웹툰·팟캐스트). 홈 "오늘 이슈, 어떻게 볼래요?" 안내(LensFormatGuide)의 '눈으로 훑을래요' 손그림을 정지 버전으로 가져왔다.
// 원본은 열릴 때 그려지고 재생 막대가 차는 애니메이션이 붙지만, 구역 제목 옆에서는 움직임 없이 완성된 그림만 쓴다. 선이 살짝 흔들리는 필터(feTurbulence)도 같다.
const INK = '#1f2937';
const TINT = '#eaf1ff';
const BLUE = '#5b8def';
const AMBER = '#FFB020';
const line = { fill: 'none', stroke: INK, strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

export function VideoSketch({ className }: { className?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 96 76" className={className} aria-hidden>
      <filter id={`vs-${id}`} x="-5%" y="-5%" width="110%" height="110%">
        <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="4" result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale="2.4" />
      </filter>
      <g filter={`url(#vs-${id})`}>
        <rect x="19" y="19" width="62" height="40" rx="5" fill={TINT} />
        <path d="M15 14 H73 a4 4 0 0 1 4 4 V52 a4 4 0 0 1 -4 4 H15 a4 4 0 0 1 -4 -4 V18 a4 4 0 0 1 4 -4 Z" {...line} />
        <path d="M36 24 L54 35 L36 46 Z" {...line} fill={AMBER} />
        <path d="M15 63 H73" {...line} strokeWidth={1.4} />
        <path d="M15 63 H40" {...line} stroke={BLUE} strokeWidth={2.6} />
        <path d="M82 20 l5 -5 M84 30 h7 M82 40 l5 5" {...line} strokeWidth={1.4} />
      </g>
    </svg>
  );
}

function Wobble({ id }: { id: string }) {
  return (
    <filter id={id} x="-5%" y="-5%" width="110%" height="110%">
      <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="4" result="n" />
      <feDisplacementMap in="SourceGraphic" in2="n" scale="2.4" />
    </filter>
  );
}

/** 웹툰 — "그림으로 쓱 볼래요": 네 컷 + 말풍선 + 파란 곡선. */
export function WebtoonSketch({ className }: { className?: string }) {
  const id = `ws-${useId().replace(/:/g, '')}`;
  return (
    <svg viewBox="0 0 96 76" className={className} aria-hidden>
      <Wobble id={id} />
      <g filter={`url(#${id})`}>
        <rect x="14" y="14" width="40" height="26" rx="2" fill={TINT} />
        <path d="M10 10 H52 V36 H10 Z" {...line} />
        <path d="M57 10 H86 V36 H57 Z" {...line} />
        <path d="M10 41 H34 V66 H10 Z" {...line} />
        <path d="M39 41 H86 V66 H39 Z" {...line} />
        <path d="M16 16 q9 -4 18 0 q9 4 0 9 q-3 2 -7 2 l-4 4 l0 -4 q-7 -1 -7 -5 q0 -4 0 -6 Z" {...line} fill="#fff" />
        <circle cx="21" cy="21" r="1.3" fill={INK} />
        <circle cx="26" cy="21" r="1.3" fill={INK} />
        <circle cx="31" cy="21" r="1.3" fill={INK} />
        <path d="M62 62 q4 -14 12 -14 q8 0 8 14" {...line} stroke={BLUE} />
      </g>
    </svg>
  );
}

/** 팟캐스트 — "귀로 들을래요": 헤드폰 + 소리 막대. */
export function PodcastSketch({ className }: { className?: string }) {
  const id = `ps-${useId().replace(/:/g, '')}`;
  return (
    <svg viewBox="0 0 96 76" className={className} aria-hidden>
      <Wobble id={id} />
      <g filter={`url(#${id})`}>
        <circle cx="52" cy="40" r="22" fill={TINT} />
        <path d="M20 46 V38 a28 28 0 0 1 56 0 V46" {...line} />
        <path d="M16 42 h8 a2 2 0 0 1 2 2 v14 a2 2 0 0 1 -2 2 h-6 a4 4 0 0 1 -4 -4 Z" {...line} fill="#fff" />
        <path d="M80 42 h-8 a2 2 0 0 0 -2 2 v14 a2 2 0 0 0 2 2 h6 a4 4 0 0 0 4 -4 Z" {...line} fill="#fff" />
        {[38, 44, 50, 56, 62].map((x, i) => (
          <path key={x} d={`M${x} ${[52, 58, 54, 58, 54][i]} V${[42, 36, 40, 32, 38][i]}`} {...line} stroke={BLUE} strokeWidth={2.6} />
        ))}
      </g>
    </svg>
  );
}

/** 타임라인 — "그날로 떠나요": 시계 + 되감기 화살표. */
export function TimelineSketch({ className }: { className?: string }) {
  const id = `ts-${useId().replace(/:/g, '')}`;
  return (
    <svg viewBox="0 0 96 76" className={className} aria-hidden>
      <Wobble id={id} />
      <g filter={`url(#${id})`}>
        <circle cx="50" cy="40" r="24" fill={TINT} />
        <circle cx="50" cy="40" r="20" {...line} fill="#fff" />
        <path d="M50 28 V40 L58 45" {...line} stroke={BLUE} strokeWidth={2.6} />
        <path d="M22 30 a30 30 0 0 1 14 -12" {...line} />
        <path d="M34 14 L37 19 L31 21" {...line} />
        <path d="M14 38 h8 M14 46 h5" {...line} />
      </g>
    </svg>
  );
}
