// 손으로 그은 듯 아주 살짝 흔들린 밑줄(2026-10-04, 사용자: "스케치한 느낌으로 친근하게") — 구역 제목 바로 밑에만 쓴다.
// 흔들림은 1~2px로 눈에 띄지 않을 만큼, 색은 회색 계열 — 앰버 손밑줄(홈 온보딩 문구)과 같은 결이지만 더 조용하다. 모든 구분선에 쓰면 어수선해서 "주인공 몇 곳"에만.
export function HandUnderline({ children, color = '#b8bbc2' }: { children: React.ReactNode; color?: string }) {
  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      {children}
      <svg viewBox="0 0 100 6" preserveAspectRatio="none" aria-hidden style={{ position: 'absolute', left: -2, bottom: -7, width: 'calc(100% + 4px)', height: 6, overflow: 'visible' }}>
        <path d="M1 3.4 C14 2, 24 4.6, 38 3.2 S62 2.2, 76 3.6 S92 3.2, 99 2.8" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
    </span>
  );
}
