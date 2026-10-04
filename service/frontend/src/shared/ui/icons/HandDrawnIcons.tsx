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
// 환율·금리 — 웃는 동전 캐릭터 + 교환 화살표
// AI 데이터센터 — 콘센트에 꽂힌 작은 서버 로봇
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
// 레터 — 한 통, 웃는 편지봉투 캐릭터
// 잘했어요 도장 — 살짝 삐뚤빼뚤한 손도장 원 + 체크(퀴즈 정답 피드백용)
// 웹툰 — 웃는 말풍선 캐릭터 + 반짝이(컷/이야기 콘텐츠용)
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
// 영상(숏폼) — 스마트폰 화면 속 웃는 얼굴 + 재생 버튼. "오늘의 이슈, 4가지
// 시선" 형식 4종(레터=LetterMailIcon·웹툰=ComicBubbleIcon·팟캐스트=
// ListeningHeadphoneIllustration) 중 유일하게 빠져 있던 영상 캐릭터
// (2026-09-30, 메인 리디자인 — LensPreviewSection.tsx 형식 타일에서 사진
// 아바타 대신 이 4종을 쓴다). 세로 화면(숏폼 특성)에 얼굴 + 재생 삼각형.
// 발행 도장 — "오늘의 이슈" 신문 지면 리디자인(2026-09-30)의 데이트라인
// 옆에 붙이는 잉크 스탬프. 살짝 삐뚤빼뚤한 원(GoodJobStampIcon과 같은
// 손도장 질감)에 체크마크를 넣어 "오늘 자 발행·검수 완료"를 상징한다 —
// GoodJobStampIcon(퀴즈 정답 피드백)과는 쓰이는 맥락이 달라 별도로 그렸다.
// 오늘의 시선 — 작은 집과 해 (부동산/도시 이슈)
// 하단 오디오 플레이어 재생목록 패널(2026-08-21) — 헤드폰을 쓰고 뉴스를
// 듣는 캐릭터. 다른 아이콘들과 같은 문법: 얼굴은 먹색(#1a1a1a), 사운드
// 웨이브·헤드폰 밴드는 accent 하나만.
