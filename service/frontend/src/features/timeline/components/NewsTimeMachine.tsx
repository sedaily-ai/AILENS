'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TimeMachineRewind } from '@/shared/ui/TimeMachineRewind';
import {
  SURFACE, SURFACE_CHIP, TEXT_STRONG, TEXT_BODY, TEXT_MUTED, ACCENT, ACCENT_HOVER,
  BORDER_CONTROL, FONT, LEADING, SPACE, RADIUS, TOUCH_MIN, CONTAINER_MAX,
} from '../lib/tone';
import { VintageCalendar } from './VintageCalendar';
import { kstTodayStr } from '@/shared/lib/date';
import { kdate } from '@/shared/lib/timelineDates';
import { BIGKINDS_MIN_DATE } from '@/shared/constants/timeline';

/**
 * 뉴스 타임머신 — 날짜를 입력하면 '서울경제' 신문이 그 날짜로 되감기는
 * 모션 그래픽이 재생되고, 해당 일자의 기사가 펼쳐진다.
 * 톤: 활자·신문지 — 미색 종이, 세리프 제호, 절제.
 *
 * 예전엔 되감기가 끝나면 이 컴포넌트 안에서 곧장 결과를 렌더했다(`phase:
 * 'result'`). 날짜별 고유 URL 분리(2026-08-12, GEO 감사 — "실시간 뉴스가
 * 검색엔진에 하나도 안 걸린다, 날짜별 URL이 있어야 한다") 이후로는 이
 * 컴포넌트가 입력+되감기 애니메이션까지만 담당하고, 끝나면
 * `/timeline/{date}`로 실제 이동한다 — 그 페이지가 서버에서 데이터를
 * 미리 가져와 렌더한다(크롤러도 볼 수 있고, 링크로 공유도 된다).
 * 결과 화면 자체(전체 기사/그날의 이슈)는 TimelineResultView.tsx로 옮겼다.
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

  // 홈 "실시간 News" 티저에서 날짜를 미리 고르고 들어온 경우
  // (?date=YYYY-MM-DD) — useSearchParams는 정적 export에서 Suspense
  // 경계가 필요해 대신 window.location.search를 직접 읽는다. 값이 있으면
  // 입력창에 채우는 데서 그치지 않고 곧바로 되감기까지 시작한다.
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

        {/* ── 입력 ───────────────────────────── */}
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
                    // 빈 상태 글자도 4.5:1 을 넘겨야 한다(이전 #a8a29e 는 2.38:1).
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
                  // 왜 비활성인지 알려준다 — 눌러보고 아무 일이 없으면
                  // 다음부터 다른 버튼도 믿지 않는다.
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

        {/* ── 전환 연출 ── 종이비행기가 활강 곡선을 타고 오른쪽 끝에서 왼쪽
            끝까지 날아가, 경로 아래 고정된 연도 눈금을 하나씩 켜며 그날에
            앉는다. 홈 섹션과 같은 연출을 써야 "같은 기능"으로 읽힌다.
            (라벨·날짜·건너뛰기는 컴포넌트가 직접 그린다.) */}
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
