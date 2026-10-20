// 좌상단 탈출구 — 타임머신은 공용 Header를 숨기는 몰입형 공간이므로(/games·/webtoon과 같은 방식, ConditionalFooter.tsx가 공용 푸터도 숨긴다) 홈으로 나가는 길을 이 필 하나가 담당한다.
// /timeline 아래 모든 화면과 /birthday-market(내 생일 타임머신)이 공유한다. 모두 홈 맨 위가 아니라 이 화면들의 입구인 홈의 그날로 떠나요 구역(#birthday-market)으로 돌려보낸다(2026-10-20).
// 접근성: 테두리는 인터랙티브 요소 경계 대비 3:1 이상(WCAG 1.4.11), 터치 타겟 44px, hover는 키보드 포커스에도 반응하도록 CSS(.tl-exit)로 처리하고, "◀" 글리프는 aria-hidden으로 감싼다.
import type { CSSProperties } from 'react';
import Link from 'next/link';
import { SURFACE, TEXT_BODY, BORDER_CONTROL, FONT, SPACE, RADIUS, TOUCH_MIN, CONTAINER_MAX } from '@/features/timeline/lib/tone';

/** 맨 위 줄 알약 모양 — ExitPill(왼쪽)과 OtherDatePill(오른쪽)이 같은 모양으로 한 줄을 이룬다. */
export const TOP_PILL_STYLE: CSSProperties = {
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
  whiteSpace: 'nowrap',
  boxShadow: '0 2px 10px rgba(17,24,39,0.06)',
};

/**
 * 본문 글 폭(px) — 날짜·연대·시대·그날로 떠나요 화면의 760px 컨테이너에서 좌우 여백 32px을 뺀 값.
 * 맨 위 줄 알약은 넓은 화면에서 화면 끝이 아니라 이 폭의 양 끝에 맞춘다(시선이 가는 본문 바로 위).
 */
export const PILL_COLUMN = CONTAINER_MAX - 2 * SPACE.xxl;

/**
 * 알약의 left/right 값 — 본문 글 폭의 끝에 맞추되, 화면이 좁으면 화면 끝에서 16px.
 * 50%는 fixed면 화면 폭, absolute면 부모(전체 폭) 기준이라 어느 쪽이든 '가운데에서 폭의 절반'이 된다.
 */
export function pillInset(column: number): string {
  return `max(${SPACE.lg}px, calc(50% - ${column / 2}px))`;
}

/** column: 이 화면의 본문 글 폭(px). 연대기(1124)·내 생일 타임머신(1152)처럼 넓은 화면만 넘긴다. */
export function ExitPill({ column = PILL_COLUMN }: { column?: number }) {
  return (
    <Link
      href="/#birthday-market"
      aria-label="AI LENS 홈의 그날로 떠나요로 돌아가기"
      className="tl-exit tl-focus"
      style={{ ...TOP_PILL_STYLE, position: 'fixed', top: SPACE.lg, left: pillInset(column), zIndex: 60 }}
    >
      <span aria-hidden>←</span>
      AI LENS
    </Link>
  );
}
