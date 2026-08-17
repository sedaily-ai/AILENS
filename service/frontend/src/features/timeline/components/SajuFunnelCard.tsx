// 사주 퍼널(2026-08-17, "여기에서 사주랑 이어지는 퍼널도 필요해요") — 타임머신
// 으로 날짜를 들여다보던 흐름에서 "이 날짜, 누군가의 생일이었을까" 자연스럽게
// 사주로 이어준다. /saju는 이 Next.js 앱이 아니라 완전히 다른 앱(zone)이
// CloudFront 경로로 붙어있는 구조라(HomeHeroCarousel.tsx·SideRail.tsx와 같은
// 이유) <a> 하드 내비게이션만 가능 — 날짜를 쿼리파라미터로 미리 채워 넘기는
// 건 그쪽 앱 계약을 모르는 채로 만들면 조용히 무시될 수 있어(2026-08-17
// 사용자 확인: 일단은 안 넘기고 순수 링크만) 하지 않는다.
export function SajuFunnelCard() {
  return (
    <section
      style={{
        marginTop: 24,
        borderRadius: 14,
        background: '#fdfaf3',
        border: '1px solid #ede1c5',
        padding: 'clamp(18px, 4vw, 26px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        flexWrap: 'wrap',
      }}
    >
      <div>
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', color: '#8a6d3f', textTransform: 'uppercase', marginBottom: 6 }}>
          그리고
        </p>
        <p style={{ fontFamily: '"Noto Serif KR", serif', fontSize: 16, fontWeight: 700, color: '#2a2622', marginBottom: 4 }}>
          이 날짜, 누군가의 생일이었을까요?
        </p>
        <p style={{ fontSize: 12.5, color: '#8a7c66' }}>생년월일로 사주도 풀어볼 수 있어요</p>
      </div>
      <a
        href="/saju"
        style={{
          flexShrink: 0,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '11px 20px',
          borderRadius: 9999,
          background: '#2a2622',
          color: '#fff',
          fontSize: 13,
          fontWeight: 700,
          textDecoration: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        사주 보러 가기
        <span aria-hidden>→</span>
      </a>
    </section>
  );
}
