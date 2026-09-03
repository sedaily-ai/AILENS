'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

// STEP 3(체험) 전용 — 레터 포맷 스토리 카드. 2026-09-03, "레터 부분도 좀
// 더 깔끔하게... 모션그래픽처럼... 동영상처럼 움직이게" 피드백으로 신설.
// 이전엔 LensFormatPanel을 그대로 재사용해서 문단 전체가 스크롤 없는
// 한 화면에 통째로 쏟아졌다(사용자가 실제로 스크린샷으로 지적) — 웹툰/
// 팟캐스트/영상은 이미 시각 매체가 있어서 문제가 없었는데, 레터만 순수
// 텍스트 벽이었다. 문단을 문장 단위로 쪼개 인스타/틱톡 스토리처럼 한
// 문장씩 자동으로 넘어가게 한다(사용자가 고른 방향 — "스토리형 카드").
// 지어낸 문장이 아니라 실제 CMS paragraphs를 그대로 쪼갠 것뿐이라 "원문에
// 없는 걸 만들지 않는다" 원칙과도 안 부딪힌다.
const AUTO_ADVANCE_MS = 4200;

// 문장 끝(.!?) + 공백 뒤에서만 자른다 — "2.6조"·"0.09%포인트"처럼 숫자
// 안의 마침표는 뒤에 공백이 없어 안 걸린다.
function splitIntoSentences(paragraphs: string[]): string[] {
  return paragraphs
    .flatMap((para) => para.split(/(?<=[.!?])\s+/))
    .map((s) => s.trim())
    .filter(Boolean);
}

export function LetterStoryCards({ paragraphs, accentColor }: { paragraphs: string[]; accentColor: string }) {
  const sentences = useMemo(() => splitIntoSentences(paragraphs), [paragraphs]);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 시 1회 읽기, OnboardingHeader류와 같은 관례.
    setReducedMotion(mq.matches);
    const onChange = () => setReducedMotion(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const atLast = index >= sentences.length - 1;
  const atFirst = index === 0;

  useEffect(() => {
    if (reducedMotion || paused || atLast) return;
    const t = setTimeout(() => setIndex((i) => Math.min(i + 1, sentences.length - 1)), AUTO_ADVANCE_MS);
    return () => clearTimeout(t);
  }, [index, paused, reducedMotion, atLast, sentences.length]);

  if (sentences.length === 0) return null;

  const goPrev = () => setIndex((i) => Math.max(0, i - 1));
  const goNext = () => setIndex((i) => Math.min(sentences.length - 1, i + 1));

  return (
    <div
      style={{
        width: '100%',
        background: '#ffffff',
        borderRadius: 20,
        border: '1px solid rgba(0,0,0,0.04)',
        boxShadow: '0 12px 28px rgba(17,24,39,0.06)',
        padding: '26px 24px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
      }}
      onPointerDown={() => setPaused(true)}
      onPointerUp={() => setPaused(false)}
      onPointerLeave={() => setPaused(false)}
    >
      <style>{`
        @keyframes obLetterFade {
          0% { opacity: 0; transform: translateY(8px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes obLetterTimer {
          from { width: 0%; }
          to { width: 100%; }
        }
        .ob-letter-sentence { animation: obLetterFade .35s ease both; }
        .ob-letter-timer-fill { animation: obLetterTimer ${AUTO_ADVANCE_MS}ms linear forwards; }
        @media (prefers-reduced-motion: reduce) {
          .ob-letter-sentence { animation: none; }
          .ob-letter-timer-fill { animation: none; }
        }
        .ob-letter-arrow { transition: background .15s ease, transform .1s ease; }
        .ob-letter-arrow:not(:disabled):hover { background: #f1f5f9; }
        .ob-letter-arrow:not(:disabled):active { transform: scale(.9); }
      `}</style>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>
          {index + 1} / {sentences.length}
        </span>
      </div>

      <div
        role="button"
        tabIndex={0}
        aria-label="탭해서 다음 문장"
        onClick={goNext}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') goNext();
        }}
        style={{ flex: 1, display: 'flex', alignItems: 'center', minHeight: 132, cursor: 'pointer' }}
      >
        <p
          key={index}
          className="ob-letter-sentence"
          style={{
            margin: 0,
            fontFamily: '"Noto Serif KR", serif',
            fontSize: 'clamp(18px, 4.6vw, 22px)',
            fontWeight: 700,
            lineHeight: 1.55,
            letterSpacing: '-0.01em',
            color: '#0f172a',
          }}
        >
          {sentences[index]}
        </p>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          type="button"
          onClick={goPrev}
          disabled={atFirst}
          aria-label="이전 문장"
          className="ob-letter-arrow flex items-center justify-center flex-shrink-0"
          style={{
            width: 30,
            height: 30,
            borderRadius: '50%',
            border: 'none',
            background: 'transparent',
            color: '#64748b',
            cursor: atFirst ? 'default' : 'pointer',
            opacity: atFirst ? 0.3 : 1,
          }}
        >
          <ChevronLeft size={16} strokeWidth={2.4} />
        </button>

        <div style={{ flex: 1, height: 3, borderRadius: 999, background: '#f1f5f9', overflow: 'hidden' }}>
          <div
            key={index}
            className={!reducedMotion && !atLast ? 'ob-letter-timer-fill' : undefined}
            style={{
              height: '100%',
              borderRadius: 999,
              background: accentColor,
              width: reducedMotion || atLast ? '100%' : undefined,
              animationPlayState: paused ? 'paused' : 'running',
            }}
          />
        </div>

        <button
          type="button"
          onClick={goNext}
          disabled={atLast}
          aria-label="다음 문장"
          className="ob-letter-arrow flex items-center justify-center flex-shrink-0"
          style={{
            width: 30,
            height: 30,
            borderRadius: '50%',
            border: 'none',
            background: 'transparent',
            color: '#64748b',
            cursor: atLast ? 'default' : 'pointer',
            opacity: atLast ? 0.3 : 1,
          }}
        >
          <ChevronRight size={16} strokeWidth={2.4} />
        </button>
      </div>
    </div>
  );
}
