// 전역 푸터 — SEO/E-E-A-T 신호 + 발행처 + 소셜.
// 모든 페이지 하단에 마운트 (app/layout.tsx). 클라이언트 인터랙션 없음 → 서버 컴포넌트.

const SOCIAL: { label: string; href: string; icon: React.ReactElement }[] = [
  {
    label: 'Instagram',
    href: 'https://www.instagram.com/moneycut_._/',
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    label: 'YouTube',
    href: 'https://www.youtube.com/channel/UCBjKiKjXZf4aEA3WqicVhGQ',
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="2.5" y="6" width="19" height="12" rx="3" />
        <path d="M10.5 9.5v5l4-2.5-4-2.5z" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
];

export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer
      style={{
        marginTop: 48,
        borderTop: '1px solid #f1f3f5',
        background: '#fafbfc',
        padding: 'clamp(32px, 5vw, 48px) clamp(20px, 5vw, 32px) clamp(28px, 4vw, 40px)',
      }}
    >
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        {/* 상단 — 브랜드 + 한 줄 설명 + 소셜 */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8">
          <div style={{ maxWidth: 480 }}>
            <p style={{ fontSize: 11, color: '#9ca3af', fontWeight: 700, letterSpacing: '0.16em', marginBottom: 6 }}>
              AI LENS
            </p>
            <p style={{ fontFamily: '"Noto Serif KR", serif', fontSize: 15, color: '#374151', lineHeight: 1.7 }}>
              같은 뉴스, 네 가지 시선.<br />
              민철·하은·준서·소율 네 명의 AI 에디터가 같은 사건을 각자의 결로 다시 씁니다.
            </p>
          </div>
          <div className="flex gap-2">
            {SOCIAL.map((s) => (
              <a
                key={s.label}
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={s.label}
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 36, height: 36, borderRadius: 9999,
                  border: '1px solid #e5e7eb', color: '#6b7280',
                  background: '#fff',
                }}
              >
                {s.icon}
              </a>
            ))}
          </div>
        </div>

        {/* 발행처 / E-E-A-T 신호 */}
        <div
          style={{
            borderTop: '1px solid #ececec',
            paddingTop: 20,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            fontSize: 12,
            color: '#6b7280',
            lineHeight: 1.7,
          }}
        >
          <p>
            <strong style={{ color: '#374151', fontWeight: 700 }}>AI LENS</strong>{' · '}
            네 명의 AI 에디터가 같은 사건을 각자의 결로 다시 씁니다
          </p>
          <p style={{ fontSize: 11.5, color: '#9ca3af', marginTop: 4 }}>
            본 서비스는 AI가 생성한 콘텐츠를 제공합니다. 명리학과 결합한 사주 섹션은 재미와 참고용입니다.
          </p>
          <p style={{ fontSize: 11.5, color: '#9ca3af', marginTop: 12 }}>
            © {year} AI LENS
          </p>
        </div>
      </div>
    </footer>
  );
}
