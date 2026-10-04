'use client';

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

// 본문 안의 glossary 단어를 형광펜 마커 + 호버/탭 툴팁(term+explain)으로 감싼다. 같은 단락 안의 모든 등장에 적용하며,
// 가장 긴 단어부터 매칭해 substring 충돌을 막는다. 레터 페이지와 lens 레터 탭이 공유하므로 shared/ui에 둔다.
// 마커는 손으로 그은 듯한 노란 형광펜이며, 용어별로 각도를 조금씩 달리해(hashAngle) 기계적으로 똑같아 보이지 않게 한다.

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// term 문자열에서 -3~+3도 사이 각도를 결정론적으로 뽑는다 — 같은 용어는
// 페이지를 새로고침해도 항상 같은 각도(하이드레이션 불일치 방지), 용어마다
// 다른 각도(기계적으로 똑같지 않은 손맛).
function hashAngle(term: string): number {
  let h = 0;
  for (let i = 0; i < term.length; i++) h = (h * 31 + term.charCodeAt(i)) % 997;
  return (h % 7) - 3;
}

export function wrapWithTerms(
  text: string,
  glossary: Array<{ term: string; explain: string }>,
): ReactNode {
  if (!glossary.length) return text;
  const sorted = [...glossary].sort((a, b) => b.term.length - a.term.length);
  const pattern = new RegExp(sorted.map((t) => escapeRegex(t.term)).join('|'), 'g');
  const lookup = new Map(glossary.map((g) => [g.term, g.explain]));

  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    const m = match[0];
    nodes.push(
      <TermTooltip key={`tt-${i++}-${match.index}`} term={m} explain={lookup.get(m) ?? ''}>
        {m}
      </TermTooltip>,
    );
    lastIndex = match.index + m.length;
  }
  if (lastIndex === 0) return text;
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return <>{nodes}</>;
}

export function TermTooltip({
  term,
  explain,
  children,
}: {
  term: string;
  explain: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState({ shift: 0, below: false });
  const cardRef = useRef<HTMLSpanElement>(null);
  const angle = hashAngle(term);

  // 카드가 화면 밖(좌우 가장자리·위쪽 고정 바 아래)으로 나가면 밀어 넣거나 아래로 뒤집는다.
  useLayoutEffect(() => {
    if (!open || !cardRef.current) return;
    const r = cardRef.current.getBoundingClientRect();
    const m = 16;
    const cur = place.shift;
    const left = r.left - cur;
    const right = r.right - cur;
    let shift = 0;
    if (left < m) shift = m - left;
    else if (right > window.innerWidth - m) shift = window.innerWidth - m - right;
    const below = !place.below ? r.top < 150 : place.below;
    if (shift !== cur || below !== place.below) setPlace({ shift, below });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return (
    <span
      role="button"
      tabIndex={0}
      aria-label={`용어 해설: ${term}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onClick={(e) => {
        e.preventDefault();
        setOpen((o) => !o);
      }}
      style={{
        position: 'relative',
        display: 'inline',
        cursor: 'help',
        outline: 'none',
      }}
    >
      <span
        style={{
          // 형광펜으로 손으로 그은 마커 — 살짝 기울인 그라디언트 배경으로
          // 획 끝이 정확히 안 맞물리는 "손맛"을 낸다(각도는 용어별로 다름).
          backgroundImage: `linear-gradient(${100 + angle}deg, transparent 0%, transparent 2%, #ffe066 2%, #ffe066 94%, transparent 98%)`,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: '0 78%',
          backgroundSize: '100% 55%',
          padding: '0 1px',
          boxDecorationBreak: 'clone',
          WebkitBoxDecorationBreak: 'clone',
        }}
      >
        {children}
      </span>
      {open && (
        <span
          ref={cardRef}
          role="tooltip"
          className="term-card"
          style={{
            position: 'absolute',
            [place.below ? 'top' : 'bottom']: 'calc(100% + 10px)',
            left: '50%',
            transform: `translateX(calc(-50% + ${place.shift}px))`,
            width: 'max-content',
            minWidth: 200,
            maxWidth: 'min(300px, calc(100vw - 32px))',
            padding: '12px 14px 13px',
            background: '#fff',
            color: '#111827',
            borderRadius: 14,
            whiteSpace: 'normal',
            wordBreak: 'keep-all',
            textAlign: 'left',
            zIndex: 20,
            boxShadow: '0 12px 32px rgba(15,23,42,0.16), 0 1px 3px rgba(15,23,42,0.08)',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Pretendard", "Apple SD Gothic Neo", sans-serif',
            fontWeight: 400,
            letterSpacing: '-0.005em',
            cursor: 'default',
          }}
        >
          <style>{`
            @keyframes term-in { from { opacity: 0; translate: 0 ${place.below ? '-4px' : '4px'}; } to { opacity: 1; translate: 0 0; } }
            .term-card { animation: term-in .16s ease-out; }
            @media (prefers-reduced-motion: reduce) { .term-card { animation: none; } }
          `}</style>
          <span style={{ display: 'block', fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', color: '#a16207', marginBottom: 4 }}>
            용어
          </span>
          <span style={{ display: 'block', fontSize: 14.5, fontWeight: 800, lineHeight: 1.35 }}>{term}</span>
          <span style={{ display: 'block', marginTop: 4, fontSize: 13.5, lineHeight: 1.6, color: '#4b5563' }}>{explain}</span>
        </span>
      )}
    </span>
  );
}
