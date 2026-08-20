// 전역 푸터 — SEO/E-E-A-T 신호 + 발행처 + 소셜.
// 모든 페이지 하단에 마운트 (app/layout.tsx). 클라이언트 인터랙션 없음 → 서버 컴포넌트.
//
import { ECON_CATEGORIES } from '@/shared/constants/econCategories';
//
// 2026-08-07: en.sedaily.com 실제 footer(About/Contact/Terms/Privacy 링크 +
// 사업자정보 + Copyright)와 대조해 같은 구조로 보강 — 여긴 JSON-LD(구조화
// 데이터)에만 있던 발행처 관계·사업자정보를 화면에 보이는 텍스트로도 노출해야
// E-E-A-T 신호가 실제로 힘을 받는다는 걸 확인하고 반영했다. 또한 MBTI
// 4-페르소나(민철·하은·준서·소율) 폐지(f84fd06) 이후에도 남아있던 그 카피를
// 여기서 마저 제거.

// 아이콘 전부 동일 톤(currentColor 라인아트, rounded-square 컨테이너)으로 통일 —
// 브랜드 원색을 안 쓰는 게 이 사이트에서 이미 확립된 패턴(HandDrawnIcons 등과
// 동일 원칙). 2026-08-07: 서울경제신문 공식 채널(네이버TV·유튜브·페이스북·X·
// 네이버플레이스) + RSS 추가 — 기존엔 JSON-LD sameAs에만 있던 채널들을
// 실제 보이는 링크로도 노출(E-E-A-T).
const SOCIAL: { label: string; href: string; icon: React.ReactElement }[] = [
  {
    // AI LENS 자체 계정(2026-08-11) — 이전엔 서울경제 부계정(머니컷)이 걸려
    // 있었는데, 이 푸터는 AI LENS 제품 페이지용이라 방문자와 가장 관련
    // 있는 계정 하나만 보여주는 게 맞다(sameAs에는 머니컷도 그대로 남아있음).
    label: 'Instagram',
    href: 'https://www.instagram.com/lens.sedaily/',
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
    href: 'https://www.youtube.com/@서울경제신문',
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="2.5" y="6" width="19" height="12" rx="3" />
        <path d="M10.5 9.5v5l4-2.5-4-2.5z" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    label: '네이버TV',
    href: 'https://tv.naver.com/sed.thumb',
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <text x="12" y="15.8" textAnchor="middle" fontSize="10.5" fontWeight={800} fill="currentColor" stroke="none">N</text>
      </svg>
    ),
  },
  {
    label: 'Facebook',
    href: 'https://www.facebook.com/seouleconomydaily/',
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="12" r="9" />
        <text x="12" y="16" textAnchor="middle" fontSize="11" fontWeight={800} fontFamily="Georgia, serif" fill="currentColor" stroke="none">f</text>
      </svg>
    ),
  },
  {
    label: 'X',
    href: 'https://x.com/sedaily_com',
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <path d="M8 8l8 8M16 8l-8 8" />
      </svg>
    ),
  },
  {
    label: '네이버플레이스',
    href: 'https://map.naver.com/p/search/서울경제신문/place/38281793',
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 21s7-7.4 7-12a7 7 0 0 0-14 0c0 4.6 7 12 7 12z" />
        <circle cx="12" cy="9" r="2.3" />
      </svg>
    ),
  },
  {
    label: 'RSS',
    href: '/rss.xml',
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="7.2" cy="16.8" r="1.3" fill="currentColor" stroke="none" />
        <path d="M6.7 11.7a6.1 6.1 0 0 1 5.6 5.6" />
        <path d="M6.7 7.2a10.6 10.6 0 0 1 10.1 10.1" />
      </svg>
    ),
  },
];

// '서비스 소개'(/onboarding, "AI가 매일 아침 그날의 경제 뉴스를 정리해 한 통으로
// 전합니다")는 헤더 상시 노출은 2026-08-06에 의도적으로 뺐지만(위 Header.tsx
// 주석 참조 — 참고 서비스 7곳 중 헤더에 상시 노출하는 곳이 없었음) 사이트
// 어딘가엔 있어야 한다는 지적(2026-08-11)에 따라 푸터에 추가. '회사소개'
// (/about, 발행처·E-E-A-T 공시)와는 다른 페이지 — 실제 "이 서비스가 뭐하는
// 곳인지" 소개는 /onboarding, "누가 만들고 어떻게 운영하는지"는 /about.
const NAV: { label: string; href: string }[] = [
  { label: '서비스 소개', href: '/onboarding' },
  { label: '회사소개', href: '/about' },
  { label: '문의', href: '/contact' },
  { label: '이용약관', href: '/terms' },
  { label: '개인정보처리방침', href: '/privacy' },
];

// 콘텐츠 허브 링크(2026-08-12) — 모든 페이지 하단에 콘텐츠 타입/카테고리
// 페이지로 가는 링크를 심어서, 크롤러가 어느 글에서 출발하든 몇 클릭 안에
// 전체 콘텐츠 구조를 발견할 수 있게 한다(사이트맵과는 별개로 "실제 보이는
// 링크"가 있어야 크롤 우선순위·내부 링크 가중치에 더 잘 잡힌다는 지적).
//
// '딥다이브'(/trend)는 2026-08-17 폐기, '이슈 톡톡'(/issue-talk)은
// 2026-08-19 폐기 — headerTabs.ts 주석 참조. 이 배열이 headerTabs.ts/
// FeedPage.tsx와 별도로 관리되는 세 번째 사본이라는 걸 /trend 때 뒤늦게
// 발견했다(앞의 둘만 고치고 배포했다가 라이브에서 이 푸터 링크만 남아있는
// 걸 확인) — 같은 사고를 또 내지 않도록, 상단 탭 개편(브리핑/인사이트/
// 이슈톡톡 → 주제 6개)에 맞춰 여기도 ECON_CATEGORIES에서 직접 생성한다 —
// 손으로 옮겨 적지 않는다.
const CONTENT_LINKS: { label: string; href: string }[] = [
  ...ECON_CATEGORIES.map((c) => ({ label: c.label, href: `/${c.slug}` })),
  { label: '영상', href: '/video' },
  { label: '웹툰', href: '/webtoon' },
  { label: '전체 콘텐츠', href: '/archive' },
];

export function SiteFooter({ reservePlayerSpace = false }: { reservePlayerSpace?: boolean }) {
  const year = new Date().getFullYear();
  return (
    <footer
      style={{
        marginTop: 48,
        borderTop: '1px solid #f1f3f5',
        background: '#fafbfc',
        // 하단 패딩에 TodayNewsPlayer.tsx의 고정 높이(진행바 3px + 본문
        // 60px = 63px)를 더했다(2026-08-17, 사용자 피드백: "하단 오디오
        // 플레이백 떄문에 서울경제 all right reserved 안보여요" — 플레이어가
        // position:fixed bottom:0이라 원래 패딩만으로는 저작권 줄이 항상
        // 가려졌다). 2026-08-19 — 플레이어가 메인 피드('/')에서만 뜨도록
        // 바뀌면서(ConditionalTodayNewsPlayer.tsx) 다른 모든 페이지에 이
        // 여백이 불필요하게 남는 문제가 생겨, ConditionalFooter가 넘겨주는
        // reservePlayerSpace(=pathname==='/')로 그 페이지에서만 여백을 더한다.
        padding: reservePlayerSpace
          ? 'clamp(32px, 5vw, 48px) clamp(20px, 5vw, 32px) calc(clamp(28px, 4vw, 40px) + 64px)'
          : 'clamp(32px, 5vw, 48px) clamp(20px, 5vw, 32px)',
      }}
    >
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        {/* 상단 — 브랜드 + 한 줄 설명 + 소셜 */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
          <div style={{ maxWidth: 480 }}>
            <p style={{ fontSize: 11, color: '#9ca3af', fontWeight: 700, letterSpacing: '0.16em', marginBottom: 6 }}>
              AI LENS
            </p>
            <p style={{ fontFamily: '"Noto Serif KR", serif', fontSize: 15, color: '#374151', lineHeight: 1.7 }}>
              서울경제신문이 만드는 AI 경제 뉴스.<br />
              그날의 핵심 이슈를 매일 정리해 전합니다.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
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

        {/* 콘텐츠 허브 링크 — 크롤러·독자가 어느 글에서 시작하든 전체 콘텐츠
            구조를 몇 클릭 안에 발견할 수 있게(2026-08-12). */}
        <nav
          className="flex flex-wrap"
          style={{ gap: '6px 16px', paddingBottom: 14, marginBottom: 14 }}
        >
          {CONTENT_LINKS.map((n) => (
            <a
              key={n.href}
              href={n.href}
              style={{ fontSize: 13, fontWeight: 600, color: '#374151', textDecoration: 'none' }}
            >
              {n.label}
            </a>
          ))}
        </nav>

        {/* 정책/회사 링크 — en.sedaily.com footer와 동일 구성(About/Contact/Terms/Privacy) */}
        <nav
          className="flex flex-wrap"
          style={{ gap: '6px 16px', paddingBottom: 20, borderBottom: '1px solid #ececec', marginBottom: 20 }}
        >
          {NAV.map((n) => (
            <a
              key={n.href}
              href={n.href}
              style={{ fontSize: 12.5, color: '#6b7280', textDecoration: 'none' }}
            >
              {n.label}
            </a>
          ))}
        </nav>

        {/* 발행처 / E-E-A-T 신호 — JSON-LD(layout.tsx의 NewsMediaOrganization:
            parentOrganization·sameAs·foundingDate)가 주장하는 관계·사업자정보를
            실제 보이는 텍스트로도 노출한다. */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            fontSize: 12,
            color: '#6b7280',
            lineHeight: 1.7,
          }}
        >
          <p style={{ fontSize: 11.5, color: '#9ca3af' }}>
            1960년 창간{' '}
            <a href="https://www.sedaily.com" target="_blank" rel="noopener noreferrer" style={{ color: '#6b7280', textDecoration: 'underline', textUnderlineOffset: 2 }}>
              서울경제신문
            </a>
            {' '}· 대표 손동영 · 사업자등록번호 208-81-10310<br />
            서울특별시 종로구 율곡로 6 트윈트리타워 B동 14~16층 · 대표전화 02-724-8600
            {' · '}
            <a href="https://en.sedaily.com" target="_blank" rel="noopener noreferrer" style={{ color: '#6b7280', textDecoration: 'underline', textUnderlineOffset: 2 }}>
              English Edition
            </a>
          </p>
          <p style={{ fontSize: 11.5, color: '#9ca3af', marginTop: 4 }}>
            본 서비스는 AI가 생성한 콘텐츠를 제공합니다. 명리학과 결합한 사주 섹션은 재미와 참고용입니다.
          </p>
          <p style={{ fontSize: 11.5, color: '#9ca3af', marginTop: 12 }}>
            © {year} 서울경제신문. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
