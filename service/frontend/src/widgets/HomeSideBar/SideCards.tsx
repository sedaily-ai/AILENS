import Link from 'next/link';

// 우측 레일의 두 카드(지난 지면 / 사주). 사이드바는 "어디로 가면 무엇을 볼 수 있는지"만 알리는 가벼운 안내 카드이며, 실제 사주 풀이는 /saju(별도 서비스)에서 한다.
// 카드는 눌림·호버 반응이 있고 서울경제 파랑·앰버 포인트를 쓴다.
const CSS = `
  .sc-card { display: block; text-decoration: none; border-radius: 18px; padding: 18px 18px 16px; transition: transform .18s cubic-bezier(.22,.8,.22,1), box-shadow .18s ease, background .18s ease; }
  .sc-card:hover { transform: translateY(-2px); box-shadow: 0 10px 26px -12px rgba(17,24,39,.22); }
  .sc-card:active { transform: scale(.985); }
  .sc-chip { display: inline-flex; align-items: center; height: 28px; padding: 0 11px; border-radius: 999px; background: #fff; font-size: 12.5px; font-weight: 600; color: #3d70de; border: 1px solid #dbe6fb; transition: background .15s ease, color .15s ease; }
  .sc-card:hover .sc-chip { background: #5b8def; color: #fff; border-color: #5b8def; }
  .sc-go { display: inline-flex; align-items: center; gap: 4px; margin-top: 12px; font-size: 13px; font-weight: 700; }
  .sc-go span { transition: transform .18s ease; }
  .sc-card:hover .sc-go span { transform: translateX(3px); }
  @media (prefers-reduced-motion: reduce) { .sc-card, .sc-go span { transition: none; } .sc-card:hover, .sc-card:active { transform: none; } }
`;

export function PaperCard() {
  return (
    <Link href="/paper" data-fx="own" className="sc-card" style={{ background: '#f1f5fd' }}>
      <style>{CSS}</style>
      <p style={{ margin: 0, fontSize: 15.5, fontWeight: 800, letterSpacing: '-0.02em', color: '#111827' }}>어제 지면은 뭐였더라?</p>
      <p style={{ margin: '5px 0 12px', fontSize: 13, lineHeight: 1.55, color: '#4b5563', wordBreak: 'keep-all' }}>
        날짜를 골라 그날의 지면 4개를 그대로 다시 볼 수 있어요.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {['지면 1면', '증권 1면', '산업 1면', '시그널 1면'].map((t) => (
          <span key={t} className="sc-chip">
            {t}
          </span>
        ))}
      </div>
      <span className="sc-go" style={{ color: '#3d70de' }}>
        지난 지면 보러 가기 <span aria-hidden>→</span>
      </span>
    </Link>
  );
}

export function SajuCard() {
  return (
    // 사주는 별도 서비스(saju.sedaily.ai)라 외부 링크로만 연결한다.
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
