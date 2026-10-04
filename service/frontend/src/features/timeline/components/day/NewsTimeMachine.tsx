'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TimeMachineRewind } from '@/shared/ui/time-machine/TimeMachineRewind';
import {
  SURFACE, SURFACE_CHIP, TEXT_STRONG, TEXT_BODY, TEXT_MUTED, ACCENT, ACCENT_HOVER,
  BORDER_CONTROL, FONT, LEADING, SPACE, RADIUS, TOUCH_MIN, CONTAINER_MAX,
} from '@/features/timeline/lib/tone';
import { VintageCalendar } from './VintageCalendar';
import { kstTodayStr } from '@/shared/lib/date/date';
import { kdate } from '@/shared/lib/date/timelineDates';
import { BIGKINDS_MIN_DATE } from '@/shared/constants/timeline';

/**
 * 뉴스 타임머신 — 날짜를 입력하면 신문이 해당 날짜로 되감기는 모션이 재생된다.
 * 애니메이션이 끝나면 `/timeline/{date}`로 이동하며, 해당 페이지가 서버에서 데이터를 미리 가져와 렌더한다(크롤러 노출·링크 공유 가능).
 * 결과 화면은 TimelineResultView.tsx가 담당한다.
 */

type Phase = 'input' | 'rewinding';

/** children: 날짜 입력 아래에 이어 붙일 내용(시대 카드 등). 입력 화면이 100vh라 밖에 두면 화면 아래로 밀려 안 보인다. */
export function NewsTimeMachine({ children }: { children?: React.ReactNode }) {
  const router = useRouter();
  const today = kstTodayStr();
  const [phase, setPhase] = useState<Phase>('input');
  const [date, setDate] = useState('');
  const [target, setTarget] = useState('');
  const [showCalendar, setShowCalendar] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => new Date());

  function start() {
    if (!date) return;
    setTarget(date);
    setPhase('rewinding');
  }

  // 홈 "실시간 News" 티저에서 날짜(?date=YYYY-MM-DD)를 미리 고르고 들어온 경우를 처리한다.
  // useSearchParams는 정적 export에서 Suspense 경계가 필요하므로 window.location.search를 직접 읽으며, 값이 있으면 입력창 채움과 함께 되감기를 바로 시작한다.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const q = new URLSearchParams(window.location.search).get('date');
    if (q && /^\d{4}-\d{2}-\d{2}$/.test(q)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 시 1회, URL 쿼리 초기화
      setDate(q);
      setTarget(q);
      setPhase('rewinding');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 마운트 시 1회만
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: SURFACE }}>
      <style>{`
        @keyframes tmRise { from { opacity:0; transform: translateY(14px);} to {opacity:1; transform:none;} }
        .tm-rise { animation: tmRise .4s ease both; }
        /* 날짜를 고르는 버튼 — 겉보기는 인풋이라 포커스가 보여야 한다.
           이전에는 outline:none 만 있고 대체 스타일이 없어서 키보드로
           오면 어디에 있는지 알 수 없었다. */
        .tm-datefield { border:none; background:transparent; cursor:pointer;
          font-family:inherit; text-align:left; border-radius:${RADIUS.pill}px;
          min-height:${TOUCH_MIN}px; padding:0 ${SPACE.sm}px; }
        .tm-datefield:focus-visible { outline:2px solid ${ACCENT}; outline-offset:2px; }
        .tm-go { display:inline-flex; align-items:center; justify-content:center;
          min-height:${TOUCH_MIN}px; padding:0 ${SPACE.xl}px; border:none;
          border-radius:${RADIUS.pill}px; background:${ACCENT}; color:#fff;
          font-size:${FONT.meta}px; font-weight:700; font-family:inherit;
          cursor:pointer; white-space:nowrap; transition: background .15s ease; }
        .tm-go:hover:not(:disabled) { background:${ACCENT_HOVER}; }
        .tm-go:disabled { background:${SURFACE_CHIP}; color:${TEXT_MUTED}; cursor:default; }
        @media (prefers-reduced-motion: reduce) {
          .tm-rise { animation: none; }
          .tm-go { transition: none; }
        }
      `}</style>

      <div style={{ maxWidth: CONTAINER_MAX, margin: '0 auto', padding: 'clamp(40px, 8vw, 88px) clamp(20px, 5vw, 32px)' }}>

        {/* ── 입력 ── */}
        {phase === 'input' && (
          <div className="tm-rise" style={{ textAlign: 'center' }}>
            <p
              style={{
                fontSize: FONT.caption,
                fontWeight: 700,
                letterSpacing: '0.18em',
                color: TEXT_MUTED,
                marginBottom: SPACE.md,
              }}
            >
              NEWS TIME MACHINE
            </p>
            <h1
              style={{
                fontSize: `clamp(${FONT.pageTitle}px, 6vw, ${FONT.pageTitleLg}px)`,
                fontWeight: 800,
                color: TEXT_STRONG,
                letterSpacing: '-0.03em',
                lineHeight: LEADING.tight,
                marginBottom: SPACE.md,
              }}
            >
              그날의 서울경제로 돌아갑니다
            </h1>
            <p
              style={{
                fontSize: FONT.body,
                color: TEXT_BODY,
                marginBottom: SPACE.xxl,
                lineHeight: LEADING.body,
              }}
            >
              1990년부터 오늘까지, 날짜를 고르면 그날의 뉴스를 그대로 펼쳐드려요.
            </p>

            <div style={{ position: 'relative', display: 'inline-block' }}>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: SPACE.sm,
                  padding: SPACE.sm,
                  paddingLeft: SPACE.md,
                  background: SURFACE,
                  border: `1px solid ${BORDER_CONTROL}`,
                  borderRadius: RADIUS.pill,
                }}
              >
                <button
                  type="button"
                  className="tm-datefield"
                  aria-haspopup="dialog"
                  aria-expanded={showCalendar}
                  onClick={() => setShowCalendar((v) => !v)}
                  style={{
                    fontSize: FONT.body,
                    fontWeight: date ? 700 : 500,
                    // 빈 상태 글자도 대비 4.5:1 이상을 유지한다.
                    color: date ? TEXT_STRONG : TEXT_MUTED,
                    minWidth: 'clamp(140px, 40vw, 180px)',
                  }}
                >
                  {date ? kdate(date) : '날짜 선택'}
                </button>
                <button
                  type="button"
                  className="tm-go tl-focus"
                  onClick={start}
                  disabled={!date}
                  // 비활성 이유를 안내해, 눌러도 반응이 없는 상황을 피한다.
                  aria-describedby={!date ? 'tm-go-hint' : undefined}
                >
                  그날로 떠나기
                </button>
              </div>
              {!date && (
                <p
                  id="tm-go-hint"
                  style={{
                    fontSize: FONT.caption,
                    color: TEXT_MUTED,
                    marginTop: SPACE.sm,
                    lineHeight: LEADING.body,
                  }}
                >
                  먼저 날짜를 골라주세요
                </p>
              )}
              {showCalendar && (
                <VintageCalendar
                  value={date}
                  min={BIGKINDS_MIN_DATE}
                  max={today}
                  viewMonth={viewMonth}
                  onViewMonthChange={setViewMonth}
                  onSelect={(ymd) => {
                    setDate(ymd);
                    setShowCalendar(false);
                  }}
                  onClose={() => setShowCalendar(false)}
                />
              )}
            </div>
          </div>
        )}

        {/* ── 전환 연출 ── 종이비행기가 활강 곡선을 따라 오른쪽 끝에서 왼쪽 끝까지 날아가며 연도 눈금을 차례로 켠다. 홈 섹션과 같은 연출을 써서 같은 기능으로 인식되게 한다. (라벨·날짜·건너뛰기는 컴포넌트가 직접 그린다.) */}
        {phase === 'rewinding' && (
          <div style={{ padding: 'clamp(28px, 6vw, 48px) 20px' }}>
            <TimeMachineRewind
              fromDate={today}
              toDate={target}
              onComplete={() => router.push(`/timeline/${target}`)}
            />
          </div>
        )}
        {phase === 'input' && children}
      </div>
    </div>
  );
}
