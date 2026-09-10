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

// 레터 — 한 통, 웃는 편지봉투 캐릭터
export function LetterMailIcon({ accent, className }: IconProps) {
  return (
    <svg viewBox="0 0 96 96" fill="none" className={className}>
      <rect x="18" y="30" width="60" height="42" rx="6" stroke="#1a1a1a" strokeWidth={2.6} strokeLinejoin="round" />
      <path d="M20 34 L48 54 L76 34" stroke="#1a1a1a" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="40" cy="60" r="1.8" fill="#1a1a1a" />
      <circle cx="54" cy="60" r="1.8" fill="#1a1a1a" />
      <path d="M42 66 Q47 69 52 66" stroke="#1a1a1a" strokeWidth={2} strokeLinecap="round" fill="none" />
      <path d="M48 16 L48 24 M40 20 L44 24 M56 20 L52 24" stroke={accent} strokeWidth={2.6} strokeLinecap="round" />
      <circle cx="48" cy="12" r="2.6" fill={accent} />
    </svg>
  );
}

// 잘했어요 도장 — 살짝 삐뚤빼뚤한 손도장 원 + 체크(퀴즈 정답 피드백용)
export function GoodJobStampIcon({ accent, className }: IconProps) {
  return (
    <svg viewBox="0 0 96 96" fill="none" className={className}>
      <path
        d="M48 14 Q68 12 76 30 Q84 46 72 62 Q62 78 44 80 Q24 82 14 64 Q6 48 16 30 Q26 14 48 14 Z"
        stroke="#1a1a1a"
        strokeWidth={3}
        strokeLinejoin="round"
      />
      <path d="M30 48 L43 61 L67 33" stroke={accent} strokeWidth={5.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M14 14 L16 20 L22 22 L16 24 L14 30 L12 24 L6 22 L12 20 Z" fill={accent} opacity={0.85} />
      <path d="M80 58 L81.5 62 L85 63.5 L81.5 65 L80 68.5 L78.5 65 L75 63.5 L78.5 62 Z" fill={accent} opacity={0.7} />
    </svg>
  );
}

// 웹툰 — 웃는 말풍선 캐릭터 + 반짝이(컷/이야기 콘텐츠용)
export function ComicBubbleIcon({ accent, className }: IconProps) {
  return (
    <svg viewBox="0 0 96 96" fill="none" className={className}>
      <path
        d="M20 26 Q20 20 26 20 L70 20 Q76 20 76 26 L76 54 Q76 60 70 60 L42 60 L30 72 L32 60 L26 60 Q20 60 20 54 Z"
        stroke="#1a1a1a"
        strokeWidth={2.6}
        strokeLinejoin="round"
      />
      <circle cx="38" cy="40" r="2" fill="#1a1a1a" />
      <circle cx="58" cy="40" r="2" fill="#1a1a1a" />
      <path d="M38 48 Q48 54 58 48" stroke="#1a1a1a" strokeWidth={2.2} strokeLinecap="round" fill="none" />
      <path d="M80 16 L82 22 L88 24 L82 26 L80 32 L78 26 L72 24 L78 22 Z" fill={accent} />
      <path d="M18 68 L19.5 72 L23 73.5 L19.5 75 L18 78.5 L16.5 75 L13 73.5 L16.5 72 Z" fill={accent} opacity={0.7} />
    </svg>
  );
}

// 히어로 캐러셀 웹툰 슬라이드용 — 기존 ComicBubbleIcon(말풍선+눈코입)이
// "예술적인 연필 스케치" 느낌과는 거리가 멀고 아이콘처럼 밋밋하다는 지적
// (2026-08-06)으로 새로 그렸다. 웹툰의 "컷" 2장을 손으로 두 번 겹쳐 그은
// 듯한 이중선(스케치 특유의 삐뚤빼뚤함)으로 표현하고, "바람처럼" 흐르는
// 모션 라인을 곁들였다. 컬러 배경 박스 없이 그대로 떠 있게 써야
// 일러스트로 읽힌다(HomeHeroCarousel 참고). 어두운 배경(히어로)과 밝은
// 크림 배경(웹툰 목업 카드) 둘 다에서 쓰이므로, 뒷장(컷 1) 선 색은
// `base` 로 배경에 맞춰 넘긴다 — 기본값은 밝은 배경용 잉크색.
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

// 지면 아카이브(홈 "그날의 지면" — NEWS TIME MACHINE 박스, 2026-08-17) —
// 회중시계. "그 날로 돌아간다"는 시간여행 컨셉에 맞춰 다른 캐릭터
// 아이콘들과 달리 얼굴 없이 빈티지 오브젝트 하나로 — 크림·세리프·먹색
// 톤의 옛 신문 박스에 캐릭터가 섞이면 톤이 흐트러진다고 판단.
export function PocketWatchIcon({ accent, className }: IconProps) {
  return (
    <svg viewBox="0 0 96 96" fill="none" className={className}>
      <path d="M48 10 L48 17" stroke="#1a1a1a" strokeWidth={3} strokeLinecap="round" />
      <circle cx="48" cy="8" r="4.2" stroke="#1a1a1a" strokeWidth={2.4} />
      <circle cx="48" cy="53" r="30" stroke="#1a1a1a" strokeWidth={3} />
      <circle cx="48" cy="53" r="23.5" stroke={accent} strokeWidth={2} />
      <path d="M48 53 L48 37 M48 53 L60 59" stroke="#1a1a1a" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="48" cy="53" r="2.6" fill={accent} />
      <path d="M48 25 L48 29 M76 53 L72 53 M48 81 L48 77 M20 53 L24 53" stroke="#1a1a1a" strokeWidth={2} strokeLinecap="round" />
      <path d="M74 20 L76.4 26.6 L83 29 L76.4 31.4 L74 38 L71.6 31.4 L65 29 L71.6 26.6 Z" fill={accent} opacity={0.85} />
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

// 하단 오디오 플레이어 재생목록 패널(2026-08-21) — 헤드폰을 쓰고 뉴스를
// 듣는 캐릭터. 다른 아이콘들과 같은 문법: 얼굴은 먹색(#1a1a1a), 사운드
// 웨이브·헤드폰 밴드는 accent 하나만.
export function ListeningHeadphoneIllustration({ accent, className }: IconProps) {
  return (
    <svg viewBox="0 0 96 96" fill="none" className={className}>
      <ellipse cx="48" cy="50" rx="18" ry="16" stroke="#1a1a1a" strokeWidth={2.6} />
      <circle cx="41" cy="48" r="1.8" fill="#1a1a1a" />
      <circle cx="55" cy="48" r="1.8" fill="#1a1a1a" />
      <path d="M42 57 Q48 61 54 57" stroke="#1a1a1a" strokeWidth={2} strokeLinecap="round" fill="none" />
      {/* 헤드폰 밴드 + 이어컵 */}
      <path d="M28 46 Q30 22 48 22 Q66 22 68 46" stroke={accent} strokeWidth={3} strokeLinecap="round" fill="none" />
      <rect x="22" y="42" width="10" height="16" rx="4" stroke={accent} strokeWidth={2.8} />
      <rect x="64" y="42" width="10" height="16" rx="4" stroke={accent} strokeWidth={2.8} />
      {/* 사운드 웨이브 */}
      <path d="M12 50 Q8 50 8 46 M12 54 Q4 54 4 46" stroke={accent} strokeWidth={2} strokeLinecap="round" opacity={0.75} />
      <path d="M84 50 Q88 50 88 46 M84 54 Q92 54 92 46" stroke={accent} strokeWidth={2} strokeLinecap="round" opacity={0.75} />
    </svg>
  );
}
