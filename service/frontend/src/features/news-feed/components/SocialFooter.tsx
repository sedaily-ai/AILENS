'use client';

// 페이지 하단 소셜 채널 바로가기 — Instagram / YouTube.
const SOCIAL_ITEMS = [
  {
    key: 'instagram',
    label: 'Instagram',
    href: 'https://www.instagram.com/moneycut_._/',
    icon: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    key: 'youtube',
    label: 'YouTube',
    href: 'https://www.youtube.com/channel/UCBjKiKjXZf4aEA3WqicVhGQ',
    icon: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="2.5" y="6" width="19" height="12" rx="3" />
        <path d="M10.5 9.5v5l4-2.5-4-2.5z" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
];

export function SocialFooter() {
  return (
    <footer
      style={{
        maxWidth: 720,
        margin: '40px auto 0',
        padding: 'clamp(20px, 4vw, 28px) clamp(20px, 5vw, 32px)',
        textAlign: 'center',
      }}
    >
      <p
        style={{
          fontSize: 11,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: '#9ca3af',
          fontWeight: 600,
          marginBottom: 14,
        }}
      >
        Follow AI LENS
      </p>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 10 }}>
        {SOCIAL_ITEMS.map((it) => (
          <a
            key={it.key}
            href={it.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={it.label}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 40,
              height: 40,
              borderRadius: 9999,
              border: '1px solid #e5e7eb',
              color: '#374151',
              transition: 'background 0.15s, border-color 0.15s, color 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#f9fafb';
              e.currentTarget.style.borderColor = '#d1d5db';
              e.currentTarget.style.color = '#111827';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.borderColor = '#e5e7eb';
              e.currentTarget.style.color = '#374151';
            }}
          >
            {it.icon}
          </a>
        ))}
      </div>
    </footer>
  );
}
