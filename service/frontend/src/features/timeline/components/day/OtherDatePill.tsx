// 오른쪽 위 '다른 날짜' 이동 — 날짜·연대·시대 화면에서 그날로 떠나요 입구(/timeline)로 돌아가 다른 날을 고르는 길.
// 예전에는 페이지 맨 끝(기사·사건 목록 아래)에 있어 수천 px을 내려야 보였다. 왼쪽 위 ExitPill과 같은 줄·같은 모양으로 첫 화면에 둔다(2026-10-20).
// 넓은 화면에서는 ExitPill과 함께 본문 글 폭의 양 끝에 맞춘다(pillInset).
// ExitPill과 달리 고정하지 않고 페이지와 함께 올라간다 — 둘 다 고정하면 본문 첫 줄을 양쪽에서 가린다.
// 부모는 전체 폭에 position:relative여야 한다. z-index 50은 지면 머리 고정(.tm-head, 40)보다 위, ExitPill(60)보다 아래.
import Link from 'next/link';
import { SPACE } from '@/features/timeline/lib/tone';
import { PILL_COLUMN, TOP_PILL_STYLE, pillInset } from './ExitPill';

export function OtherDatePill({ label = '다른 날짜 보기' }: { label?: string }) {
  return (
    <Link
      href="/timeline"
      className="tl-exit tl-focus"
      style={{ ...TOP_PILL_STYLE, position: 'absolute', top: SPACE.lg, right: pillInset(PILL_COLUMN), zIndex: 50 }}
    >
      {label}
    </Link>
  );
}
