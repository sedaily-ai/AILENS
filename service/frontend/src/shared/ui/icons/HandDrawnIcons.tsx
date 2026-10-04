/**
 * 손그림 느낌의 라인아트 캐릭터 아이콘 — 토스류 일러스트 톤(단색 스트로크 +
 * 최소한의 플랫 컬러, 그라데이션·이모지 없음). 목업 섹션 카드 썸네일 전용.
 * 각 아이콘은 카드의 accent 컬러 하나만 받아 라인/포인트에 사용한다.
 */

interface IconProps {
  accent: string;
  className?: string;
}

// 투자 인사이트 — 반짝이는 전구 + 상승 곡선
export function LightbulbIcon({ accent, className }: IconProps) {
  return (
    <svg viewBox="0 0 96 96" fill="none" className={className}>
      <path
        d="M48 22 Q64 22 64 40 Q64 50 56 56 L56 64 L40 64 L40 56 Q32 50 32 40 Q32 22 48 22 Z"
        stroke="#1a1a1a"
        strokeWidth={2.6}
        strokeLinejoin="round"
      />
      <path d="M42 70 L54 70 M43 76 L53 76" stroke="#1a1a1a" strokeWidth={2.4} strokeLinecap="round" />
      <path d="M40 40 Q46 34 48 40 Q50 46 56 40" stroke={accent} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M48 12 L48 18 M28 22 L33 26 M68 22 L63 26" stroke={accent} strokeWidth={2.6} strokeLinecap="round" />
    </svg>
  );
}

// 히어로 캐러셀 웹툰 슬라이드용. 웹툰 컷 2장을 손으로 두 번 겹쳐 그은 듯한 이중선과 흐르는 모션 라인으로 표현한다.
// 컬러 배경 박스 없이 그대로 떠 있게 써야 일러스트로 읽힌다(HomeHeroCarousel 참고).
// 어두운 배경(히어로)과 밝은 크림 배경(웹툰 목업 카드) 양쪽에서 쓰이므로 뒷장(컷 1) 선 색은 `base`로 넘기며, 기본값은 밝은 배경용 잉크색이다.
export function WebtoonWindIllustration({
  accent,
  className,
  base = '#1c1917',
}: IconProps & { base?: string }) {
  return (
    <svg viewBox="0 0 120 120" fill="none" className={className}>
      <g transform="rotate(-7 55 52)">
        <rect x="26" y="20" width="46" height="58" rx="5" stroke={base} strokeOpacity={0.85} strokeWidth={2} />
        <rect x="27.6" y="21.4" width="42.8" height="55.2" rx="5" stroke={base} strokeOpacity={0.28} strokeWidth={1.1} />
      </g>
      <g transform="rotate(6 68 66)">
        <rect x="46" y="38" width="46" height="58" rx="5" stroke={accent} strokeWidth={2.4} />
        <rect x="47.6" y="39.4" width="42.8" height="55.2" rx="5" stroke={accent} strokeWidth={1} opacity={0.4} />
      </g>
      <path d="M4 44 Q20 37 33 44 T60 41" stroke={accent} strokeWidth={2} strokeLinecap="round" fill="none" opacity={0.85} />
      <path d="M2 58 Q18 53 29 59 T54 55" stroke={base} strokeOpacity={0.5} strokeWidth={1.6} strokeLinecap="round" fill="none" />
      <path d="M8 72 Q22 68 32 73" stroke={accent} strokeWidth={1.6} strokeLinecap="round" fill="none" opacity={0.5} />
      <path d="M97 18 L99.4 24.6 L106 27 L99.4 29.4 L97 36 L94.6 29.4 L88 27 L94.6 24.6 Z" fill={accent} opacity={0.9} />
      <path d="M101 85 L102 88 L105 89 L102 90 L101 93 L100 90 L97 89 L100 88 Z" fill={base} fillOpacity={0.75} />
    </svg>
  );
}
