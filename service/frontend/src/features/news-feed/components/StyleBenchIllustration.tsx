'use client';

import { createAvatar } from '@dicebear/core';
import { openPeeps } from '@dicebear/collection';

// 벤치에 앉아 각자 다른 방식으로 뉴스를 보는 일러스트 — 처음엔 직접 좌표를
// 찍어 그린 SVG였는데 "퀄리티가 낮다, 코드/라이브러리로 더 낫게 할 방법
// 없냐"는 피드백(2026-08-06) — Pablo Stanley의 Open Peeps(CC0, 상업적 사용
// 무료 손그림 벡터 아바타 라이브러리)를 DiceBear 패키징으로 붙였다. 얼굴·머리는
// 라이브러리가 그려주고, 상황을 알려주는 소품(폰/헤드폰/신문)만 직접 얹는다.
const CHARACTERS = [
  { seed: 'ailens-bus-01', face: 'calm', accent: '059669', prop: 'phone' as const },
  { seed: 'ailens-headphones-01', face: 'eyesClosed', accent: '7c3aed', prop: 'headphones' as const },
  { seed: 'ailens-paper-01', face: 'smile', accent: 'd97706', prop: 'paper' as const },
];

function avatarUri(seed: string, face: string, accent: string): string {
  return createAvatar(openPeeps, {
    seed,
    face: [face] as never,
    clothingColor: [accent],
    backgroundColor: ['transparent'],
  }).toDataUri();
}

function PropBadge({ kind, accent }: { kind: 'phone' | 'headphones' | 'paper'; accent: string }) {
  const common = { stroke: '#1c1917', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  return (
    <svg viewBox="0 0 24 24" width={20} height={20}>
      <circle cx="12" cy="12" r="11" fill="#fff" stroke="#1c1917" strokeWidth={1.6} />
      {kind === 'phone' && (
        <>
          <rect x="9" y="6" width="6" height="12" rx="1.2" {...common} />
          <line x1="11" y1="16" x2="13" y2="16" stroke="#1c1917" strokeWidth={1.4} strokeLinecap="round" />
          <rect x="10" y="7.5" width="4" height="6" fill={`#${accent}`} opacity={0.7} />
        </>
      )}
      {kind === 'headphones' && (
        <>
          <path d="M7 13 Q7 6 12 6 Q17 6 17 13" {...common} />
          <rect x="5.5" y="12" width="3" height="5" rx="1.3" fill={`#${accent}`} opacity={0.85} />
          <rect x="15.5" y="12" width="3" height="5" rx="1.3" fill={`#${accent}`} opacity={0.85} />
        </>
      )}
      {kind === 'paper' && (
        <>
          <rect x="6" y="7" width="12" height="10" rx="1" {...common} />
          <line x1="8.5" y1="10" x2="15.5" y2="10" stroke={`#${accent}`} strokeWidth={1.4} />
          <line x1="8.5" y1="12.5" x2="15.5" y2="12.5" stroke={`#${accent}`} strokeWidth={1.4} />
          <line x1="8.5" y1="15" x2="12.5" y2="15" stroke={`#${accent}`} strokeWidth={1.4} />
        </>
      )}
    </svg>
  );
}

export function StyleBenchIllustration({ className }: { className?: string }) {
  return (
    <div className={className} style={{ position: 'relative' }}>
      <div className="flex items-end justify-center" style={{ gap: 6, paddingBottom: 8 }}>
        {CHARACTERS.map((c) => (
          <div key={c.seed} style={{ position: 'relative' }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- Open Peeps SVG data URI, 최적화 대상 아님 */}
            <img src={avatarUri(c.seed, c.face, c.accent)} alt="" width={72} height={72} style={{ display: 'block' }} />
            <span style={{ position: 'absolute', bottom: -4, right: -4 }}>
              <PropBadge kind={c.prop} accent={c.accent} />
            </span>
          </div>
        ))}
      </div>
      {/* 벤치 — 캐릭터가 그 위에 나란히 앉아있는 느낌만 살짝 */}
      <svg viewBox="0 0 260 20" width="100%" height="20" style={{ display: 'block' }}>
        <path d="M6 4 L254 4" stroke="#1c1917" strokeWidth={2.4} strokeLinecap="round" />
        <path d="M16 4 L16 17 M244 4 L244 17" stroke="#1c1917" strokeWidth={2.4} strokeLinecap="round" />
      </svg>
    </div>
  );
}
