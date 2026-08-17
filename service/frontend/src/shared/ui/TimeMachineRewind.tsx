'use client';

// "신문이 되감기는" 전환 애니메이션 — 원래 features/timeline/components/
// NewsTimeMachine.tsx(/timeline 입력 페이지) 안에만 있었는데, 홈 "그날로
// 떠나요"(features/news-feed/components/NewsTimeMachineSection.tsx)에서
// "펼치기" 눌러도 이 연출이 재생되도록 다시 연결하면서(2026-08-17, 사용자
// 리포트: "종이 애니메이션이 사라졌네요") 두 feature가 같이 쓸 수 있게
// shared/ui로 승격했다 — features 간 직접 import는 이 프로젝트의 FSD
// 규칙 위반이라(HandDrawnIcons를 shared/ui/icons로 승격했던 것과 같은 이유).
import { useEffect, useRef, useState } from 'react';

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function kdate(s: string): string {
  const [y, m, d] = s.split('-');
  return `${y}년 ${parseInt(m, 10)}월 ${parseInt(d, 10)}일`;
}

export function TimeMachineRewind({
  fromDate,
  toDate,
  onComplete,
}: {
  fromDate: string;
  toDate: string;
  onComplete: () => void;
}) {
  const [tick, setTick] = useState(fromDate);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const from = new Date(fromDate).getTime();
    const to = new Date(toDate).getTime();
    const DUR = 2200;
    const t0 = performance.now();

    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / DUR);
      const eased = 1 - Math.pow(1 - p, 3);
      setTick(ymd(new Date(from + (to - from) * eased)));
      if (p < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        onComplete();
      }
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 마운트 시 1회만, fromDate/toDate/onComplete는 이 인스턴스 생애주기 동안 고정 취급
  }, []);

  return (
    <div style={{ textAlign: 'center', position: 'relative', minHeight: 360 }}>
      <style>{`
        @keyframes tmSheet {
          0%   { opacity: 0; transform: translateY(40px) rotate(.6deg) scale(1); }
          12%  { opacity: 1; }
          100% { opacity: 0; transform: translateY(-120%) rotate(-7deg) scale(.92); }
        }
      `}</style>
      <div style={{ position: 'relative', height: 240, marginBottom: 28 }}>
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              inset: 0,
              margin: '0 auto',
              width: 'min(320px, 80%)',
              height: 220,
              background: '#fffdf7',
              border: '1px solid #e6e0d4',
              borderRadius: 6,
              boxShadow: '0 10px 30px rgba(80,60,30,0.10)',
              animation: `tmSheet 1.5s cubic-bezier(.5,0,.7,.4) ${i * 0.28}s infinite`,
            }}
          >
            <div style={{ padding: '18px 22px', textAlign: 'left' }}>
              <p style={{ fontFamily: '"Noto Serif KR", serif', fontSize: 15, fontWeight: 800, color: '#2a2622', letterSpacing: '-0.02em' }}>
                서울經濟
              </p>
              <div style={{ height: 1, background: '#e6e0d4', margin: '10px 0' }} />
              {[88, 70, 80].map((w, k) => (
                <div key={k} style={{ height: 7, width: `${w}%`, background: '#eee7d8', borderRadius: 2, marginBottom: 7 }} />
              ))}
            </div>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 12, letterSpacing: '0.18em', color: '#b08d57', marginBottom: 8 }}>
        REWINDING
      </p>
      <p
        style={{
          fontFamily: '"Noto Serif KR", serif',
          fontSize: 'clamp(22px, 5vw, 30px)',
          fontWeight: 700,
          color: '#2a2622',
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '-0.02em',
        }}
      >
        {kdate(tick)}
      </p>
    </div>
  );
}
