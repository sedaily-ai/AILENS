// 커스텀 달력 팝오버 — 네이티브 <input type="date">가 브라우저마다 다른
// 기본 캘린더 UI(각지고 사이트 톤과 안 맞는 테두리)를 그대로 띄워서
// "테두리 이상한거 안 되고, 톤앤매너 맞게 예술느낌 나게"라는 피드백으로
// 직접 만들었다(2026-08-17). 인터랙션은 ArchiveTab.tsx의 커스텀 달력과
// 같은 패턴(월 그리드, getMonthDays/isSameDay 재사용)이다.
//
// ══ 2026-08-19 ══
// 크림·골드 톤을 걷고 lib/tone.ts 토큰으로 맞췄다. 파일 이름의 "Vintage" 는
// 이제 톤이 아니라 이 컴포넌트의 정체(앵커형 커스텀 달력)만 가리킨다 —
// 이름을 바꾸면 import 가 흩어지므로 두되, 크림·세리프는 없다.
//
// 고친 것:
//  · 요일 머리글 #b3aa99 → 1.9:1 이었다. 요일은 날짜를 찾는 좌표축인데
//    안 읽혔다.
//  · 월 이동 버튼 ‹ › — 히트 영역이 약 28px 이었다(패딩 6 + 글자 16).
//    44px 로 넓혔다. 화살표 글리프는 aria-hidden, 이름은 aria-label 로.
//  · 날짜 칸 43px → 44px. 칸 간격(gap 2)을 없애고 패딩을 줄여 375px 에서도
//    한 변 46px 이 나온다. 7칸 그리드에서 44px 를 확보하려면 폭이 최소
//    7x44+패딩 이어야 한다.
//  · "오늘로" #8a6d3f 12px → 스케일 안의 14px + 44px 히트 영역.
//  · 오늘 표시가 연한 링(#c9bb98, 1.5:1) 하나뿐이라 안 보였다 → 경계를
//    3:1 넘는 색으로 올리고 굵기를 2px 로.
//  · hover 를 인라인 이벤트에서 CSS 로 옮겼다(키보드 포커스 미반응 문제).
//  · Escape 로 닫기 추가. 바깥 클릭만 있어서 키보드로는 빠져나갈 수 없었다.
import { useEffect, useRef } from 'react';
import { getMonthDays, isSameDay } from '@/shared/utils/dateUtils';
import {
  SURFACE, SURFACE_SUNKEN, TEXT_STRONG, TEXT_BODY, TEXT_MUTED, ACCENT,
  BORDER_HAIRLINE, BORDER_CONTROL, FONT, SPACE, RADIUS, TOUCH_MIN,
} from '../lib/tone';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function toYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 달력 전용 규칙 — 인라인 스타일로는 hover·focus 를 제대로 줄 수 없다. */
const CAL_CSS = `
  .vc-nav { display:inline-flex; align-items:center; justify-content:center;
    width:${TOUCH_MIN}px; height:${TOUCH_MIN}px; border:none; background:none;
    border-radius:${RADIUS.pill}px; color:${TEXT_BODY}; font-size:${FONT.sectionTitle}px;
    cursor:pointer; transition: background .12s ease; }
  .vc-nav:hover { background:${SURFACE_SUNKEN}; color:${TEXT_STRONG}; }
  .vc-day { display:flex; align-items:center; justify-content:center;
    min-height:${TOUCH_MIN}px; border-radius:${RADIUS.pill}px; border:2px solid transparent;
    background:none; color:${TEXT_BODY}; font-size:${FONT.meta}px; font-weight:500;
    font-variant-numeric: tabular-nums; cursor:pointer; font-family:inherit;
    transition: background .12s ease, color .12s ease; }
  .vc-day:hover:not(:disabled):not([aria-pressed="true"]) { background:${SURFACE_SUNKEN}; color:${TEXT_STRONG}; }
  .vc-day:disabled { color:#b8bec7; cursor:default; }
  .vc-day[data-today="true"] { border-color:${BORDER_CONTROL}; }
  .vc-day[aria-pressed="true"] { background:${TEXT_STRONG}; color:${SURFACE}; font-weight:700; border-color:${TEXT_STRONG}; }
  .vc-today-btn { display:inline-flex; align-items:center; justify-content:center;
    min-height:${TOUCH_MIN}px; padding:0 ${SPACE.md}px; border:none; background:none;
    font-size:${FONT.meta}px; font-weight:700; color:${ACCENT}; cursor:pointer;
    font-family:inherit; text-decoration:underline; text-underline-offset:3px; }
  @media (prefers-reduced-motion: reduce) {
    .vc-nav, .vc-day { transition: none; }
  }
`;

export function VintageCalendar({
  value,
  min,
  max,
  viewMonth,
  onViewMonthChange,
  onSelect,
  onClose,
}: {
  value: string;
  min: string;
  max: string;
  viewMonth: Date;
  onViewMonthChange: (d: Date) => void;
  onSelect: (ymd: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    // 바깥 클릭만 있으면 키보드 사용자는 달력에서 빠져나갈 방법이 없다.
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  const days = getMonthDays(viewMonth.getFullYear(), viewMonth.getMonth());
  const today = new Date();
  const monthLabel = `${viewMonth.getFullYear()}년 ${viewMonth.getMonth() + 1}월`;

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="날짜 고르기"
      style={{
        position: 'absolute',
        top: `calc(100% + ${SPACE.sm}px)`,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 50,
        // 7칸 x 44px + 좌우 패딩. 375px 화면에서도 한 변 46px 이 나온다.
        width: `min(360px, calc(100vw - ${SPACE.xl}px))`,
        background: SURFACE,
        border: `1px solid ${BORDER_HAIRLINE}`,
        borderRadius: RADIUS.card,
        boxShadow: '0 16px 40px rgba(17,24,39,0.12), 0 2px 8px rgba(17,24,39,0.05)',
        padding: SPACE.lg,
      }}
    >
      <style>{CAL_CSS}</style>

      <div
        className="flex items-center justify-between"
        style={{ marginBottom: SPACE.sm }}
      >
        <button
          type="button"
          className="vc-nav tl-focus"
          aria-label="이전 달"
          onClick={() => onViewMonthChange(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))}
        >
          <span aria-hidden>‹</span>
        </button>
        {/* 월이 바뀌면 보조기기에 알린다 — 화살표를 눌렀는데 아무 말이 없으면
            바뀐 줄 모른다. */}
        <span
          aria-live="polite"
          style={{ fontSize: FONT.body, fontWeight: 700, color: TEXT_STRONG, letterSpacing: '-0.01em' }}
        >
          {monthLabel}
        </span>
        <button
          type="button"
          className="vc-nav tl-focus"
          aria-label="다음 달"
          onClick={() => onViewMonthChange(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))}
        >
          <span aria-hidden>›</span>
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: SPACE.xs }}>
        {WEEKDAYS.map((w) => (
          <div
            key={w}
            style={{
              textAlign: 'center',
              fontSize: FONT.caption,
              fontWeight: 600,
              color: TEXT_MUTED,
              padding: `${SPACE.xs}px 0`,
            }}
          >
            {w}
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
        {days.map((day, i) => {
          if (!day) return <div key={i} />;
          const ymd = toYmd(day);
          const disabled = ymd < min || ymd > max;
          const selected = ymd === value;
          const isToday = isSameDay(day, today);
          return (
            <button
              key={i}
              type="button"
              className="vc-day tl-focus"
              disabled={disabled}
              aria-pressed={selected}
              data-today={isToday && !selected ? 'true' : undefined}
              // 화면에는 숫자만 있어서 어느 달의 며칠인지 읽히지 않았다.
              aria-label={`${viewMonth.getFullYear()}년 ${viewMonth.getMonth() + 1}월 ${day.getDate()}일${isToday ? ' (오늘)' : ''}`}
              onClick={() => onSelect(ymd)}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>

      <div
        style={{
          textAlign: 'center',
          marginTop: SPACE.sm,
          paddingTop: SPACE.sm,
          borderTop: `1px solid ${BORDER_HAIRLINE}`,
        }}
      >
        <button
          type="button"
          className="vc-today-btn tl-focus"
          onClick={() => {
            const t = toYmd(today);
            onViewMonthChange(new Date(today.getFullYear(), today.getMonth(), 1));
            if (t >= min && t <= max) onSelect(t);
          }}
        >
          오늘로
        </button>
      </div>
    </div>
  );
}
