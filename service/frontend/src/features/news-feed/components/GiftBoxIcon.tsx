// 토스류 플랫 아이콘 톤 — 그라데이션·이모지·잠금 자물쇠 없이, 단색 스트로크로
// 선물상자 하나만. "선물 포장처럼 패키징, 토스 느낌, AI 티 없이"라는
// 요청(2026-08-06)에 맞춰 MiniHeadlinesSection 전용으로 새로 그렸다.
export function GiftBoxIcon({ accent, wrapped, className }: { accent: string; wrapped: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className}>
      <rect x="5" y="13" width="22" height="14" rx="2.5" stroke={accent} strokeWidth={2} />
      <path d="M5 18 L27 18" stroke={accent} strokeWidth={2} />
      <path d="M16 13 L16 27" stroke={accent} strokeWidth={2} />
      {wrapped ? (
        <>
          <rect x="3" y="9" width="26" height="5" rx="1.5" stroke={accent} strokeWidth={2} fill="none" />
          <path d="M13 9 Q9 2 15 3 Q17 4 13 9 Z" stroke={accent} strokeWidth={1.8} strokeLinejoin="round" fill="none" />
          <path d="M19 9 Q23 2 17 3 Q15 4 19 9 Z" stroke={accent} strokeWidth={1.8} strokeLinejoin="round" fill="none" />
        </>
      ) : (
        <path d="M6 13 Q4 6 9 5 Q13 5 16 13 Q19 5 23 5 Q28 6 26 13" stroke={accent} strokeWidth={2} strokeLinecap="round" fill="none" />
      )}
    </svg>
  );
}
