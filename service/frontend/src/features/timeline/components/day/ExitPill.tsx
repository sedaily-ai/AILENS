// 좌상단 탈출구 — 타임머신은 공용 Header 를 숨기는 "완전 몰입형 공간"이라
// (/games·/webtoon 과 같은 기법, ConditionalFooter.tsx 가 이 경로의 공용
// 푸터도 숨긴다) 홈으로 나가는 길을 이 필 하나가 담당한다.
//
// /timeline(입력)과 /timeline/[date](결과) 두 곳에 30줄쯤 되는 같은 코드가
// 복제돼 있었다. 대비 수정을 한쪽만 하면 티가 안 나게 갈리므로 합쳤다
// (2026-08-19).
//
// 고친 것:
//  · 테두리 #e6e0d4 → 1.24:1 이었다. 링크인데 경계가 안 보였다(WCAG 1.4.11
//    은 인터랙티브 요소 경계에 3:1 을 요구한다). 4.83:1 인 회색으로.
//  · 글자 12.5px → 스케일 안의 14px.
//  · 터치 타겟 세로 ~37px → 44px.
//  · hover 를 인라인 onMouseEnter 에서 CSS(.tl-exit)로 옮겼다. 인라인은
//    키보드 포커스에 반응하지 않아 마우스 사용자만 피드백을 받았다.
//  · "◀" 글리프를 aria-hidden 으로 감쌌다. 보조기기가 문자 이름을 읽었다.
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
