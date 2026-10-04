// 연대·시대 페이지의 공통 틀 — 상단 제목, 본문, 하단 이동. 몰입형이라 공용 헤더 대신 ExitPill을 쓴다(페이지에서 함께 렌더).
import Link from 'next/link';
import { SURFACE, TEXT_STRONG, TEXT_MUTED, BORDER_CONTROL, BORDER_STRONG, FONT, SPACE, CONTAINER_MAX, TOUCH_MIN } from '../lib/tone';

export function ChronicleFrame({
  kicker, title, subtitle, children,
}: {
  kicker: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <main style={{ background: SURFACE, minHeight: '100vh' }}>
      <div style={{ maxWidth: CONTAINER_MAX, margin: '0 auto', padding: `${SPACE.xxl + TOUCH_MIN}px clamp(20px, 5vw, 32px) clamp(40px, 8vw, 88px)` }}>
        <header style={{ textAlign: 'center', paddingBottom: SPACE.xl, borderBottom: `2px solid ${BORDER_STRONG}`, marginBottom: SPACE.xl }}>
          <p style={{ fontSize: FONT.caption, letterSpacing: '0.2em', color: TEXT_MUTED, marginBottom: SPACE.sm }}>{kicker}</p>
          <h1 style={{ fontSize: `clamp(${FONT.pageTitle}px, 5.4vw, ${FONT.pageTitleLg}px)`, fontWeight: 800, color: TEXT_STRONG, letterSpacing: '-0.02em' }}>{title}</h1>
          {subtitle && <p style={{ fontSize: FONT.meta, color: TEXT_MUTED, marginTop: 8, fontVariantNumeric: 'tabular-nums' }}>{subtitle}</p>}
        </header>
        {children}
        <div style={{ textAlign: 'center', marginTop: SPACE.xl }}>
          <Link
            href="/timeline"
            className="tl-focus"
            style={{
              display: 'inline-block', padding: '10px 22px', borderRadius: 9999, border: `1px solid ${BORDER_CONTROL}`,
              color: TEXT_STRONG, fontSize: FONT.meta, fontWeight: 700, textDecoration: 'none',
            }}
          >
            다른 날짜·연대 보기
          </Link>
        </div>
      </div>
    </main>
  );
}
