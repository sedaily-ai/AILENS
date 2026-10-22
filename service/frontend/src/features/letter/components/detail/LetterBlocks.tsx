'use client';

import { ChevronDown } from 'lucide-react';
import type { LetterBlock } from '../../data/letterTypes';

/** 이 글자 수 이하인 '더 보기'(fold)는 처음부터 펼쳐 둔다. */
export const FOLD_OPEN_MAX_CHARS = 150;

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
              <span className="lb-stat-v">
                {/* "단체 158곳·개인 321명"이 "개인 / 321명"으로 끊기지 않게 '·' 묶음 단위로만 줄을 바꾼다(피드백 04) */}
                {it.value.split(/\s*·\s*/).map((part, j, all) => (
                  <span key={j} className="lb-stat-vp">{part}{j < all.length - 1 ? '·' : ''}</span>
                ))}
              </span>
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
        // 짧은 보충 설명은 처음부터 펼쳐 스크롤만으로 읽게 한다(피드백 08). 길면 접어 둔다.
        <details className="lb lb-fold" style={style} open={block.text.length <= FOLD_OPEN_MAX_CHARS}>
          <summary><span>{block.title}</span><ChevronDown size={18} aria-hidden /></summary>
          <p>{block.text}</p>
        </details>
      );
    default:
      return <p className="lb lb-call" style={style}>{block.text}</p>;
  }
}
