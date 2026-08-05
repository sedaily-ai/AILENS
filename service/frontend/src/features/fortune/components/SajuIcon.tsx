'use client';

import type { SajuCard } from '../data/exploreContent';

/**
 * 사주 Explore 전용 모노라인 아이콘 세트 — 일본 장인 톤.
 * 규칙: viewBox 24 · stroke 1.5 · round cap/join · 잉크 1톤(currentColor)
 *      + 뒤에 소프트 워시 1톤(accent). 글로스/그라데이션/디테일 과잉 금지.
 * 이모지 대체용. 추후 실제 일러스트 에셋으로 교체 가능(같은 자리).
 */

export type IconKey =
  | 'moon' | 'heart' | 'blossom' | 'coin' | 'path' | 'compass'
  | 'person' | 'spark' | 'hourglass' | 'sun' | 'dice' | 'mind';

type IconProps = { name: IconKey; ink?: string; size?: number };

const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

export function SajuIcon({ name, ink = '#3b3b3b', size = 26 }: IconProps) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', style: { color: ink, display: 'block' } };
  switch (name) {
    case 'moon':
      return (<svg {...common}><path {...S} d="M20 13.2A8 8 0 1 1 10.8 4a6.4 6.4 0 0 0 9.2 9.2Z" /><path {...S} d="M16.5 5.2l.5 1.4 1.4.5-1.4.5-.5 1.4-.5-1.4-1.4-.5 1.4-.5Z" /></svg>);
    case 'heart':
      return (<svg {...common}><path {...S} d="M12 20s-6.6-4.2-8.4-8.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 8.4 4.2C18.6 15.8 12 20 12 20Z" /></svg>);
    case 'blossom':
      return (<svg {...common}><circle {...S} cx="12" cy="12" r="2.4" /><path {...S} d="M12 9.6V5M12 14.4V19M9.6 12H5M14.4 12H19M10.3 10.3 7.4 7.4M13.7 13.7l2.9 2.9M13.7 10.3l2.9-2.9M10.3 13.7 7.4 16.6" /></svg>);
    case 'coin':
      return (<svg {...common}><ellipse {...S} cx="12" cy="8" rx="6.5" ry="3" /><path {...S} d="M5.5 8v8c0 1.7 2.9 3 6.5 3s6.5-1.3 6.5-3V8" /><path {...S} d="M5.5 12c0 1.7 2.9 3 6.5 3s6.5-1.3 6.5-3" /></svg>);
    case 'path':
      return (<svg {...common}><path {...S} d="M7 21c0-4 3-5 3-9S7 6 7 3" /><path {...S} d="M17 3c0 4-3 5-3 9s3 5 3 9" opacity={0.55} /><circle {...S} cx="7" cy="3" r="1.4" /><circle {...S} cx="17" cy="21" r="1.4" /></svg>);
    case 'compass':
      return (<svg {...common}><circle {...S} cx="12" cy="12" r="8.2" /><path {...S} d="M15.2 8.8 13 13l-4.2 2.2L11 11Z" /></svg>);
    case 'person':
      return (<svg {...common}><circle {...S} cx="12" cy="8.4" r="3.4" /><path {...S} d="M5.5 19.5a6.5 6.5 0 0 1 13 0" /></svg>);
    case 'spark':
      return (<svg {...common}><path {...S} d="M12 3.5c.4 4.6 1.9 6.1 6.5 6.5-4.6.4-6.1 1.9-6.5 6.5-.4-4.6-1.9-6.1-6.5-6.5 4.6-.4 6.1-1.9 6.5-6.5Z" /><path {...S} d="M18.5 16.5c.2 1.7.8 2.3 2.5 2.5-1.7.2-2.3.8-2.5 2.5-.2-1.7-.8-2.3-2.5-2.5 1.7-.2 2.3-.8 2.5-2.5Z" opacity={0.55} /></svg>);
    case 'hourglass':
      return (<svg {...common}><path {...S} d="M7 4h10M7 20h10" /><path {...S} d="M7 4c0 4 5 5 5 8s-5 4-5 8M17 4c0 4-5 5-5 8s5 4 5 8" /></svg>);
    case 'sun':
      return (<svg {...common}><circle {...S} cx="12" cy="12" r="4" /><path {...S} d="M12 3v2.4M12 18.6V21M3 12h2.4M18.6 12H21M5.6 5.6l1.7 1.7M16.7 16.7l1.7 1.7M18.4 5.6l-1.7 1.7M7.3 16.7l-1.7 1.7" /></svg>);
    case 'dice':
      return (<svg {...common}><rect {...S} x="4" y="4" width="16" height="16" rx="4" /><circle cx="9" cy="9" r="1.1" fill="currentColor" /><circle cx="15" cy="15" r="1.1" fill="currentColor" /><circle cx="12" cy="12" r="1.1" fill="currentColor" /></svg>);
    case 'mind':
      return (<svg {...common}><path {...S} d="M12 21c-3.5 0-6.5-2.6-6.5-6 0-1.7.5-3 .5-4.5C6 7 8.7 4.5 12 4.5S18 7 18 10.5c0 1.5.5 2.8.5 4.5 0 3.4-3 6-6.5 6Z" /><path {...S} d="M12 14c-1.2 0-2-.8-2-2s.8-2 2-2 2 .8 2 2" opacity={0.55} /></svg>);
    default:
      return (<svg {...common}><circle {...S} cx="12" cy="12" r="8" /></svg>);
  }
}

// 카드 → 아이콘 매핑(카테고리 + 제목 키워드 휴리스틱). 데이터 변경 없이 동작.
export function iconForCard(card: SajuCard): IconKey {
  const t = card.title + card.subtitle;
  if (/로또|부자|돈|재물|투자|월급|연봉|창업|사업/.test(t)) return 'coin';
  if (/재회|연락|환승|전남친|X는/.test(t)) return 'hourglass';
  if (/매력|도화|홍염|설렘|썸|연애|운명의 상대|결혼|애착|사랑/.test(t)) return 'heart';
  if (/귀인|사람|관계|인맥/.test(t)) return 'person';
  if (/이직|취업|직업|천직|퇴사|커리어|성공|로드맵|브랜딩/.test(t)) return 'path';
  if (/오늘|하루|브리핑|점메추/.test(t)) return 'sun';
  if (/가챠|로또|운/.test(t) && /가챠/.test(t)) return 'dice';
  if (/2026|신년|미리보기/.test(t)) return 'spark';
  if (/번아웃|내면|회복|심리|스트레스|경계/.test(t)) return 'mind';
  if (/귀인과 상극|상극|시간대|조심/.test(t)) return 'compass';
  if (card.category === '애정운') return 'blossom';
  if (card.category === '재물운') return 'coin';
  if (card.category === '직업운') return 'path';
  if (card.category === '건강운') return 'mind';
  return 'moon';
}
