/**
 * 손그림 느낌의 라인아트 캐릭터 아이콘 — 토스류 일러스트 톤(단색 스트로크 +
 * 최소한의 플랫 컬러, 그라데이션·이모지 없음). 목업 섹션 카드 썸네일 전용.
 * 각 아이콘은 카드의 accent 컬러 하나만 받아 라인/포인트에 사용한다.
 */

interface IconProps {
  accent: string;
  className?: string;
}

// 증시 — 상승 곡선을 보는 작은 황소 캐릭터
export function StockBullIcon({ accent, className }: IconProps) {
  return (
    <svg viewBox="0 0 96 96" fill="none" className={className}>
      <path
        d="M16 64 L34 48 L46 56 L64 32 L80 20"
        stroke={accent}
        strokeWidth={3.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M80 20 L80 32 M80 20 L68 22" stroke={accent} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" />
      <ellipse cx="34" cy="72" rx="16" ry="12" stroke="#1a1a1a" strokeWidth={2.6} />
      <path d="M22 66 Q17 58 22 54" stroke="#1a1a1a" strokeWidth={2.6} strokeLinecap="round" fill="none" />
      <path d="M46 66 Q51 58 46 54" stroke="#1a1a1a" strokeWidth={2.6} strokeLinecap="round" fill="none" />
      <circle cx="29" cy="70" r="1.8" fill="#1a1a1a" />
      <circle cx="39" cy="70" r="1.8" fill="#1a1a1a" />
      <path d="M31 76 Q34 78 37 76" stroke="#1a1a1a" strokeWidth={2} strokeLinecap="round" fill="none" />
    </svg>
  );
}

// 환율·금리 — 웃는 동전 캐릭터 + 교환 화살표
export function CoinExchangeIcon({ accent, className }: IconProps) {
  return (
    <svg viewBox="0 0 96 96" fill="none" className={className}>
      <circle cx="42" cy="50" r="24" stroke="#1a1a1a" strokeWidth={2.6} />
      <path d="M34 44 Q42 38 50 44" stroke="#1a1a1a" strokeWidth={2} fill="none" strokeLinecap="round" />
      <circle cx="35" cy="48" r="1.8" fill="#1a1a1a" />
      <circle cx="49" cy="48" r="1.8" fill="#1a1a1a" />
      <path d="M36 58 Q42 62 48 58" stroke="#1a1a1a" strokeWidth={2} strokeLinecap="round" fill="none" />
      <path d="M42 34 L42 30 M38 32 L46 30" stroke={accent} strokeWidth={2.6} strokeLinecap="round" />
      <path d="M66 30 Q78 34 78 46" stroke={accent} strokeWidth={3} strokeLinecap="round" fill="none" />
      <path d="M78 46 L74 40 M78 46 L72 44" stroke={accent} strokeWidth={3} strokeLinecap="round" fill="none" />
      <path d="M78 66 Q66 62 66 50" stroke={accent} strokeWidth={3} strokeLinecap="round" fill="none" />
      <path d="M66 50 L70 56 M66 50 L72 52" stroke={accent} strokeWidth={3} strokeLinecap="round" fill="none" />
    </svg>
  );
}

// AI 데이터센터 — 콘센트에 꽂힌 작은 서버 로봇
export function ServerRobotIcon({ accent, className }: IconProps) {
  return (
    <svg viewBox="0 0 96 96" fill="none" className={className}>
      <rect x="30" y="30" width="36" height="44" rx="8" stroke="#1a1a1a" strokeWidth={2.6} />
      <circle cx="41" cy="46" r="2.2" fill="#1a1a1a" />
      <circle cx="55" cy="46" r="2.2" fill="#1a1a1a" />
      <path d="M40 58 Q48 63 56 58" stroke="#1a1a1a" strokeWidth={2} strokeLinecap="round" fill="none" />
      <path d="M48 30 L48 22" stroke="#1a1a1a" strokeWidth={2.4} strokeLinecap="round" />
      <circle cx="48" cy="19" r="2.6" fill={accent} />
      <rect x="36" y="66" width="6" height="8" rx="1.5" stroke="#1a1a1a" strokeWidth={2} />
      <rect x="54" y="66" width="6" height="8" rx="1.5" stroke="#1a1a1a" strokeWidth={2} />
      <path d="M66 52 Q76 52 76 62 L76 70" stroke={accent} strokeWidth={3} strokeLinecap="round" fill="none" />
      <path d="M72 66 L76 70 L80 66" stroke={accent} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

// 재테크 — 동전 넣는 저금통 캐릭터
export function PiggyBankIcon({ accent, className }: IconProps) {
  return (
    <svg viewBox="0 0 96 96" fill="none" className={className}>
      <path
        d="M24 56 Q22 40 40 36 Q46 30 58 34 Q70 32 74 44 Q80 46 78 54 Q76 58 70 58 L68 66 Q66 70 62 68 L60 62 L38 62 L36 68 Q32 70 30 66 L30 58 Q22 58 24 56 Z"
        stroke="#1a1a1a"
        strokeWidth={2.6}
        strokeLinejoin="round"
      />
      <circle cx="60" cy="46" r="1.8" fill="#1a1a1a" />
      <path d="M50 34 L48 26 L54 28" stroke="#1a1a1a" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M50 44 L58 44" stroke={accent} strokeWidth={3} strokeLinecap="round" />
      <circle cx="44" cy="20" r="7" stroke={accent} strokeWidth={2.4} fill="none" />
      <path d="M44 14 L44 20 L48 22" stroke={accent} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
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

// 머니 라이프 — 동전 담긴 유리병 캐릭터
export function CoinJarIcon({ accent, className }: IconProps) {
  return (
    <svg viewBox="0 0 96 96" fill="none" className={className}>
      <path d="M34 30 L34 24 Q34 20 38 20 L58 20 Q62 20 62 24 L62 30" stroke="#1a1a1a" strokeWidth={2.4} strokeLinecap="round" />
      <path
        d="M30 30 L66 30 L64 70 Q64 76 58 76 L38 76 Q32 76 32 70 Z"
        stroke="#1a1a1a"
        strokeWidth={2.6}
        strokeLinejoin="round"
      />
      <circle cx="44" cy="52" r="6" fill={accent} opacity={0.9} />
      <circle cx="56" cy="62" r="6" fill={accent} opacity={0.7} />
      <circle cx="46" cy="66" r="5" fill={accent} opacity={0.5} />
      <path d="M40 46 Q48 42 56 46" stroke="#1a1a1a" strokeWidth={1.8} strokeLinecap="round" fill="none" opacity={0.5} />
    </svg>
  );
}

// 오늘의 시선 — 작은 집과 해 (부동산/도시 이슈)
export function HouseSunIcon({ accent, className }: IconProps) {
  return (
    <svg viewBox="0 0 96 96" fill="none" className={className}>
      <circle cx="68" cy="26" r="9" stroke={accent} strokeWidth={2.6} />
      <path d="M68 12 L68 15 M68 37 L68 40 M54 26 L57 26 M79 26 L82 26 M58 16 L60 18 M76 34 L78 36 M58 36 L60 34 M76 18 L78 16" stroke={accent} strokeWidth={2} strokeLinecap="round" />
      <path d="M22 58 L44 40 L66 58" stroke="#1a1a1a" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M28 54 L28 74 L60 74 L60 54" stroke="#1a1a1a" strokeWidth={2.6} strokeLinejoin="round" fill="none" />
      <rect x="40" y="60" width="10" height="14" stroke="#1a1a1a" strokeWidth={2.2} />
      <path d="M33 62 L37 62 M33 66 L37 66" stroke="#1a1a1a" strokeWidth={1.8} strokeLinecap="round" />
    </svg>
  );
}
