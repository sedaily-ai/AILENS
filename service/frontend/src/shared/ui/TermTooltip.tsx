'use client';

import { useState, type ReactNode } from 'react';

// letters/[id]/components/TermTooltip.tsx 에서 이전(2026-09-11) — lens
// 4탭 페이지(레터 탭)도 같은 용어 하이라이트를 쓰게 되면서 두 페이지가
// 공유하는 컴포넌트로 승격했다(widgets/HomeSideBar 등과 같은 전례 — 처음엔
// co-locate였다가 두 번째 소비처가 생기면 shared/ui로).
//
// 스타일도 이 이전과 함께 바꿨다 — 원래는 회색 점선 밑줄이었는데, 사용자
// 요청("친근한, 아날로그 형식의... 노란색 형광펜")에 따라 실제 형광펜으로
// 손으로 그은 듯한 노란 마커로 교체했다. 용어별로 각도를 살짝 다르게 줘서
// (hashAngle) 전부 기계적으로 똑같지 않게 — "아날로그" 요청의 핵심.
//
// 본문 안에서 glossary 의 단어들을 형광펜 마커 + 호버/탭 툴팁(term+explain)
// 으로 감싼다. 같은 단락 안의 모든 등장에 적용. 가장 긴 단어 먼저 매칭해
// substring 충돌 방지.

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
  const angle = hashAngle(term);
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
          role="tooltip"
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 8px)',
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '10px 14px',
            background: '#111827',
            color: '#fff',
            fontSize: 12.5,
            fontWeight: 400,
            lineHeight: 1.55,
            borderRadius: 8,
            minWidth: 200,
            maxWidth: 'min(320px, 80vw)',
            width: 'max-content',
            whiteSpace: 'normal',
            zIndex: 20,
            boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
            textAlign: 'left',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Pretendard", "Apple SD Gothic Neo", sans-serif',
            letterSpacing: '-0.005em',
          }}
        >
          <span style={{ fontWeight: 700, color: '#fbbf24', display: 'block', marginBottom: 4 }}>
            {term}
          </span>
          {explain}
          <span
            style={{
              position: 'absolute',
              top: '100%',
              left: '50%',
              transform: 'translateX(-50%)',
              width: 0,
              height: 0,
              borderLeft: '6px solid transparent',
              borderRight: '6px solid transparent',
              borderTop: '6px solid #111827',
            }}
          />
        </span>
      )}
    </span>
  );
}
