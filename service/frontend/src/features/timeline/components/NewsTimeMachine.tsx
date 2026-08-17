'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TimeMachineRewind } from '@/shared/ui/TimeMachineRewind';
import { VintageCalendar } from './VintageCalendar';
import { kstTodayStr } from '../lib/timelineApi';

// 빅카인즈가 공식 지원하는 최소 날짜(OpenAPI 사용자지침서 V1.5 §4) —
// NewsTimeMachineSection.tsx(홈 위젯)에도 같은 값이 있다. FSD 레이어 간
// import 금지 규칙 때문에 의도적으로 중복.
const MIN_DATE = '1990-01-01';

function kdateLabel(ymd: string): string {
  const [y, m, d] = ymd.split('-');
  return `${y}년 ${parseInt(m, 10)}월 ${parseInt(d, 10)}일`;
}

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

export function NewsTimeMachine() {
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
    <div style={{ minHeight: '100vh', background: '#faf8f3' }}>
      <style>{`
        @keyframes tmRise { from { opacity:0; transform: translateY(14px);} to {opacity:1; transform:none;} }
      `}</style>

      <div style={{ maxWidth: 760, margin: '0 auto', padding: 'clamp(40px, 8vw, 88px) clamp(20px, 5vw, 32px)' }}>

        {/* ── 입력 ───────────────────────────── */}
        {phase === 'input' && (
          <div style={{ textAlign: 'center', animation: 'tmRise .4s ease' }}>
            <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.22em', color: '#b08d57', marginBottom: 18 }}>
              NEWS TIME MACHINE
            </p>
            <h1
              style={{
                fontFamily: '"Noto Serif KR", serif',
                fontSize: 'clamp(26px, 6vw, 38px)',
                fontWeight: 700,
                color: '#2a2622',
                letterSpacing: '-0.025em',
                lineHeight: 1.3,
                marginBottom: 12,
              }}
            >
              그 날의 서울경제로 돌아갑니다
            </h1>
            <p style={{ fontSize: 14, color: '#8a8378', marginBottom: 38, lineHeight: 1.7 }}>
              날짜를 고르면 그 날 신문이 그대로 펼쳐져요.
            </p>

            <div style={{ position: 'relative', display: 'inline-block' }}>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 8px 8px 20px',
                  background: '#fff',
                  border: '1px solid #e6e0d4',
                  borderRadius: 9999,
                  boxShadow: '0 1px 2px rgba(80,60,30,0.04)',
                }}
              >
                <button
                  type="button"
                  onClick={() => setShowCalendar((v) => !v)}
                  style={{
                    border: 'none',
                    outline: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    fontSize: 15,
                    color: date ? '#2a2622' : '#a8a29e',
                    fontFamily: 'inherit',
                    minWidth: 'clamp(140px, 40vw, 180px)',
                    textAlign: 'left',
                  }}
                >
                  {date ? kdateLabel(date) : '날짜 선택'}
                </button>
                <button
                  onClick={start}
                  disabled={!date}
                  style={{
                    padding: '10px 22px',
                    borderRadius: 9999,
                    border: 'none',
                    background: date ? '#2a2622' : '#d9d3c6',
                    color: '#fff',
                    fontSize: 13.5,
                    fontWeight: 700,
                    cursor: date ? 'pointer' : 'default',
                    transition: 'background .2s',
                    whiteSpace: 'nowrap',
                  }}
                >
                  그 날 신문 펼치기
                </button>
              </div>
              {showCalendar && (
                <VintageCalendar
                  value={date}
                  min={MIN_DATE}
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

        {/* ── 되감기 모션 ───────────────────────────── */}
        {phase === 'rewinding' && (
          <TimeMachineRewind fromDate={today} toDate={target} onComplete={() => router.push(`/timeline/${target}`)} />
        )}
      </div>
    </div>
  );
}
