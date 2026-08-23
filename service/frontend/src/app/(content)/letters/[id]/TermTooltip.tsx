'use client';

import { useState, type ReactNode } from 'react';

// LetterDetailClient.tsx에서 추출(2026-08-24, God 파일 분해).
// ── 용어 툴팁 ────────────────────────────────────────────────────────
// 본문 안에서 glossary 의 단어들을 dotted underline + 호버 툴팁(term+explain)으로 감싼다.
// 같은 단락 안의 모든 등장에 적용. 가장 긴 단어 먼저 매칭해 substring 충돌 방지.

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function wrapWithTerms(
  text: string,
  glossary: Array<{ term: string; explain: string }>,
): ReactNode {
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
          borderBottom: '1px dotted #9ca3af',
          paddingBottom: 1,
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
