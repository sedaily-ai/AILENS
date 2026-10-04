// 좌상단 탈출구 — 타임머신은 공용 Header를 숨기는 몰입형 공간이므로(/games·/webtoon과 같은 방식, ConditionalFooter.tsx가 공용 푸터도 숨긴다) 홈으로 나가는 길을 이 필 하나가 담당한다.
// /timeline(입력)과 /timeline/[date](결과)가 공유한다.
// 접근성: 테두리는 인터랙티브 요소 경계 대비 3:1 이상(WCAG 1.4.11), 터치 타겟 44px, hover는 키보드 포커스에도 반응하도록 CSS(.tl-exit)로 처리하고, "◀" 글리프는 aria-hidden으로 감싼다.
import Link from 'next/link';
import { SURFACE, TEXT_BODY, BORDER_CONTROL, FONT, SPACE, RADIUS, TOUCH_MIN } from '@/features/timeline/lib/tone';

export function ExitPill() {
  return (
    <Link
      href="/"
      aria-label="AI LENS 홈으로 돌아가기"
      className="tl-exit tl-focus"
      style={{
        position: 'fixed',
        top: SPACE.lg,
        left: SPACE.lg,
        zIndex: 60,
        display: 'inline-flex',
        alignItems: 'center',
        gap: SPACE.sm,
        minHeight: TOUCH_MIN,
        padding: `0 ${SPACE.lg}px`,
        background: SURFACE,
        border: `1px solid ${BORDER_CONTROL}`,
        borderRadius: RADIUS.pill,
        color: TEXT_BODY,
        fontSize: FONT.meta,
        fontWeight: 700,
        textDecoration: 'none',
        boxShadow: '0 2px 10px rgba(17,24,39,0.06)',
      }}
    >
      <span aria-hidden>←</span>
      AI LENS
    </Link>
  );
}
