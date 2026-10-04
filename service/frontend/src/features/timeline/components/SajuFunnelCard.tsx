// 사주 퍼널 — 타임머신으로 날짜를 들여다보던 흐름에서 "이 날짜, 누군가의
// 생일이었을까" 자연스럽게 사주로 이어준다. /saju는 이 Next.js 앱이 아니라
// 완전히 다른 앱(zone)이 CloudFront 경로로 붙어있는 구조라
// (HomeHeroCarousel.tsx·SideRail.tsx와 같은 이유) <a> 하드 내비게이션만
// 가능 — 날짜를 쿼리파라미터로 미리 채워 넘기는 건 그쪽 앱 계약을 모르는
// 채로 만들면 조용히 무시될 수 있어(2026-08-17 사용자 확인: 일단은 안 넘기고
// 순수 링크만) 하지 않는다.
//
// 2026-08-19: 크림/골드(#fdfaf3·#ede1c5·#8a6d3f)와 세리프를 걷고 페이지 톤에
// 맞췄다. 이 컴포넌트는 TimelineBigkindsView(과거 날짜)와 TimelineResultView
// (최근 날짜) 양쪽이 쓴다 — 둘 다 같은 톤이라 한 벌로 충분하다.
//
// 사주는 경제 콘텐츠가 아니다. 뉴스와 시각적으로 구분돼야 경제 콘텐츠까지
// 가벼워 보이지 않는다. 그래서 뉴스 영역에 쓰지 않는 **연한 파랑 면**으로
// 성격을 표시한다(강조색은 페이지 전체에서 파랑 하나만 쓰므로 색을 늘리는
// 것은 아니다).
import { ACCENT, ACCENT_SUNKEN, TEXT_STRONG, TEXT_BODY, FONT, LEADING, SPACE, RADIUS, TOUCH_MIN } from '../lib/tone';

export function SajuFunnelCard() {
  return (
    <section
      aria-labelledby="tl-saju-heading"
      style={{
        marginTop: SPACE.xl,
        borderRadius: RADIUS.card,
        background: ACCENT_SUNKEN,
        padding: 'clamp(20px, 4vw, 28px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: SPACE.lg,
        flexWrap: 'wrap',
      }}
    >
      <div>
        <p
          style={{
            fontSize: FONT.caption,
            fontWeight: 700,
            letterSpacing: '0.14em',
            color: ACCENT,
            marginBottom: SPACE.xs,
          }}
        >
          그리고
        </p>
        <p
          id="tl-saju-heading"
          style={{
            fontSize: FONT.body,
            fontWeight: 700,
            color: TEXT_STRONG,
            marginBottom: SPACE.xs,
            letterSpacing: '-0.01em',
          }}
        >
          이 날짜, 누군가의 생일이었을까요?
        </p>
        <p style={{ fontSize: FONT.meta, color: TEXT_BODY, lineHeight: LEADING.body }}>
          생년월일로 사주도 풀어볼 수 있어요
        </p>
      </div>
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- /saju는 다른 Next 앱(zone)이라 하드 내비게이션 */}
      <a
        href="/saju"
        className="tl-focus"
        style={{
          flexShrink: 0,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: SPACE.sm,
          minHeight: TOUCH_MIN,
          padding: `0 ${SPACE.xl}px`,
          borderRadius: RADIUS.pill,
          background: ACCENT,
          color: '#fff',
          fontSize: FONT.meta,
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
