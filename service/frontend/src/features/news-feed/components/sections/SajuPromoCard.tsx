// 사주 안내 카드 — 홈 맨 아래 '쉬어가기'(GamesPreviewSection) 안에서 게임과 함께 보인다.
// 2026-10-19 기능 다이어트: 오른쪽 고정 레일(뉴스 목록 옆을 따라다니던 자리)에서 이리로 옮겼다. 엔터테인먼트는 경제 콘텐츠와 섞지 않고 홈 맨 아래 한 곳에만 둔다.
// 사주는 별도 서비스(saju.sedaily.ai)라 외부 링크로만 연결한다. 카드 문구는 레일에 있던 그대로다.
const CSS = `
  .sc-card { display: block; text-decoration: none; border-radius: 18px; padding: 18px 18px 16px; transition: transform .18s cubic-bezier(.22,.8,.22,1), box-shadow .18s ease, background .18s ease; }
  .sc-card:hover { transform: translateY(-2px); box-shadow: 0 10px 26px -12px rgba(17,24,39,.22); }
  .sc-card:active { transform: scale(.985); }
  .sc-card:focus-visible { outline: 2px solid #059669; outline-offset: 2px; }
  .sc-go { display: inline-flex; align-items: center; gap: 4px; margin-top: 12px; font-size: 13px; font-weight: 700; }
  .sc-go span { transition: transform .18s ease; }
  .sc-card:hover .sc-go span { transform: translateX(3px); }
  @media (prefers-reduced-motion: reduce) { .sc-card, .sc-go span { transition: none; } .sc-card:hover, .sc-card:active { transform: none; } }
`;

export function SajuPromoCard() {
  return (
    <a href="https://saju.sedaily.ai" data-fx="own" className="sc-card" style={{ background: '#f4faf6' }}>
      <style>{CSS}</style>
      <p style={{ margin: 0, fontSize: 15.5, fontWeight: 800, letterSpacing: '-0.02em', color: '#111827' }}>나의 이상형, 사주로 풀어보면?</p>
      <p style={{ margin: '5px 0 0', fontSize: 13, lineHeight: 1.55, color: '#4b5563', wordBreak: 'keep-all' }}>
        생일만 넣으면 나와 결이 잘 맞는 사람, 어울리는 띠와 생월까지 알려 드려요. 재미로 가볍게 봐 주세요.
      </p>
      <span className="sc-go" style={{ color: '#059669' }}>
        내 사주 보러 가기 <span aria-hidden>→</span>
      </span>
    </a>
  );
}
