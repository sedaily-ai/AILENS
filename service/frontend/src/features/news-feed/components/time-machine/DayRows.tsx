'use client';

// 한 날짜의 기사 행 목록 — 최근(시각 열)과 과거(순번 열)가 같은 행을 쓴다. 기본 5개, 나머지는 펼치기.
import { useState } from 'react';
import { BODY, INK, LINE, MUTED } from './tokens';
import type { DayKind, DayRow } from './useTimeMachineDay';

const VISIBLE_COUNT = 5;
const clamp = (lines: number) =>
  ({ display: '-webkit-box', WebkitLineClamp: lines, WebkitBoxOrient: 'vertical', overflow: 'hidden' }) as const;

function RowBody({ row, kind, first }: { row: DayRow; kind: DayKind; first: boolean }) {
  return (
    <>
      <span
        className="flex-shrink-0"
        style={{ width: kind === 'live' ? 44 : 24, fontSize: 13, fontWeight: 600, color: MUTED, fontVariantNumeric: 'tabular-nums' }}
      >
        {row.lead}
      </span>
      <div style={{ minWidth: 0 }}>
        <p
          className="ntm-title"
          style={{ ...clamp(2), fontSize: 14, fontWeight: first ? 700 : 500, lineHeight: 1.55, color: INK, wordBreak: 'keep-all', transition: 'color .14s ease' }}
        >
          {row.title}
        </p>
        {row.snippet && <p style={{ ...clamp(2), fontSize: 13, color: BODY, marginTop: 4, lineHeight: 1.6 }}>{row.snippet}</p>}
        {row.byline && <p style={{ fontSize: 13, color: MUTED, marginTop: 4 }}>{row.byline} 기자</p>}
      </div>
    </>
  );
}

export function DayRows({ rows, kind }: { rows: DayRow[]; kind: DayKind }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? rows : rows.slice(0, VISIBLE_COUNT);
  const hidden = rows.length - VISIBLE_COUNT;

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {shown.map((row, i) => {
          const style = { gap: 12, padding: '12px 8px', borderTop: i === 0 ? 'none' : `1px solid ${LINE}`, cursor: row.href ? 'pointer' : 'default' } as const;
          const body = <RowBody row={row} kind={kind} first={i === 0} />;
          return row.href ? (
            <a key={row.id} href={row.href} target="_blank" rel="noopener noreferrer" className="flex items-baseline ntm-row ntm-focus" style={style}>
              {body}
            </a>
          ) : (
            <div key={row.id} className="flex items-baseline" style={style}>
              {body}
            </div>
          );
        })}
      </div>
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="ntm-focus"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', minHeight: 44, marginTop: 4,
            background: 'none', border: 'none', borderTop: `1px solid ${LINE}`, fontSize: 14, fontWeight: 700, color: MUTED, cursor: 'pointer',
          }}
        >
          {expanded ? '접기' : `${hidden}건 더 보기`}
        </button>
      )}
    </>
  );
}
