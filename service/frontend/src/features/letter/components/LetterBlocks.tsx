'use client';

import type { LetterBlock } from '../data/letterTypes';

/** 레터 본문 안의 시각 블록(타임라인·숫자 카드·막대 비교·양측 카드·접기·강조 박스). 색은 섹션 축 색(tone) 하나만 쓴다. */
export function LetterBlockView({ block, tone }: { block: LetterBlock; tone: string }) {
  const style = { ['--bt' as string]: tone } as React.CSSProperties;
  switch (block.block) {
    case 'timeline':
      return (
        <ol className="lb lb-tl" style={style}>
          {block.items.map((it, i) => (
            <li key={i}>
              <span className="lb-tl-d">{it.label}</span>
              <span className="lb-tl-t">{it.text}</span>
            </li>
          ))}
        </ol>
      );
    case 'stats':
      return (
        <div className="lb lb-stats" style={style}>
          {block.items.map((it, i) => (
            <div key={i} className="lb-stat">
              <span className="lb-stat-l">{it.label}</span>
              <span className="lb-stat-v">{it.value}</span>
              {it.sub && <span className="lb-stat-s">{it.sub}</span>}
            </div>
          ))}
        </div>
      );
    case 'bars': {
      const top = Math.max(1, ...block.items.map((b) => b.value));
      return (
        <div className="lb lb-bars" style={style}>
          {block.title && <p className="lb-bars-t">{block.title}</p>}
          {block.items.map((it, i) => (
            <div key={i} className="lb-bar">
              <span className="lb-bar-l">{it.label}</span>
              <span className="lb-bar-track"><span className="lb-bar-fill" style={{ width: `${Math.max(3, Math.round((it.value / top) * 100))}%` }} /></span>
              <span className="lb-bar-v">{it.value.toLocaleString('ko-KR')}{block.unit ?? ''}</span>
            </div>
          ))}
        </div>
      );
    }
    case 'versus':
      return (
        <div className="lb lb-vs" style={style}>
          {[block.left, block.right].map((s, i) => (
            <div key={i} className="lb-vs-c">
              <span className="lb-vs-l">{s.label}</span>
              <span className="lb-vs-t">{s.text}</span>
            </div>
          ))}
        </div>
      );
    case 'fold':
      return (
        <details className="lb lb-fold" style={style}>
          <summary>{block.title}</summary>
          <p>{block.text}</p>
        </details>
      );
    default:
      return <p className="lb lb-call" style={style}>{block.text}</p>;
  }
}
