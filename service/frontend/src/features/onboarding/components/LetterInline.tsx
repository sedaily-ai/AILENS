'use client';

import { parseLetterBlocks } from '@/app/(economy)/_shared/components/format/lensBlocks';
import { renderInline } from '@/app/(economy)/_shared/components/format/renderInline';

// 온보딩 결과 화면의 레터 본문 — 기사 페이지의 `.lread` 스타일은 LensViewClient 안에 갇혀 있어 그대로 못 쓴다.
// 같은 파서(parseLetterBlocks)로 블록을 읽고, 읽기 좋은 최소 스타일만 입혀 바로 읽게 한다(카드 슬라이더 대신).
const LEAD = '#5b8def';

export function LetterInline({ paragraphs, headline, keywords }: { paragraphs: string[]; headline: string; keywords: { term: string; explain: string }[] }) {
  const blocks = parseLetterBlocks(paragraphs, { headline });
  const total = blocks.filter((b) => b.type === 'sub').length;
  const p: React.CSSProperties = { margin: '0 0 16px', fontSize: 16, lineHeight: 1.85, color: '#1f2937', wordBreak: 'keep-all' };
  return (
    <article>
      {blocks.map((b, i) => {
        switch (b.type) {
          case 'lead':
            return (
              <p key={i} style={{ ...p, fontSize: 17, fontWeight: 600, color: '#0f172a' }}>
                {renderInline(b.text, keywords)}
              </p>
            );
          case 'sub':
            return (
              <h3 key={i} style={{ margin: '28px 0 10px' }}>
                <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: LEAD }}>
                  {String(b.no + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
                </span>
                <span style={{ display: 'block', marginTop: 2, fontFamily: '"Noto Serif KR", serif', fontSize: 19, fontWeight: 700, lineHeight: 1.45, color: '#0f172a' }}>{renderInline(b.head, keywords)}</span>
                {b.question && <span style={{ display: 'block', marginTop: 4, fontSize: 14, fontWeight: 500, color: '#6b7280' }}>{renderInline(b.question, keywords)}</span>}
              </h3>
            );
          case 'ul':
          case 'ol': {
            const Tag = b.type;
            return (
              <Tag key={i} style={{ ...p, paddingLeft: 20 }}>
                {b.items.map((it, ii) => (
                  <li key={ii}>{renderInline(it, keywords, { numbers: true })}</li>
                ))}
              </Tag>
            );
          }
          case 'quote':
            return (
              <blockquote key={i} style={{ ...p, margin: '0 0 16px', padding: '2px 0 2px 14px', borderLeft: '2px solid #e5e7eb', color: '#4b5563' }}>
                {renderInline(b.text, keywords)}
              </blockquote>
            );
          case 'hr':
            return (
              <div key={i} aria-hidden style={{ textAlign: 'center', color: '#cbd5e1', margin: '8px 0 20px', letterSpacing: '0.4em' }}>
                ···
              </div>
            );
          case 'compare':
            return (
              <p key={i} style={p}>
                {[b.intro, `${b.a.label}: ${b.a.text}`, `${b.b.label}: ${b.b.text}`, b.outro].filter(Boolean).join(' ')}
              </p>
            );
          case 'box':
            // 새 레터 틀의 특별 칸(한 가지만·에디터 노트 등)은 이 요약 화면에서 제목 + 문단으로 풀어 보여 준다.
            return (
              <div key={i}>
                <p style={{ ...p, fontWeight: 700 }}>{[b.head, b.question].filter(Boolean).join(': ')}</p>
                {b.children.map((c, ci) =>
                  c.type === 'p' || c.type === 'lead' ? (
                    <p key={ci} style={p}>
                      {renderInline(c.text, keywords, { numbers: true })}
                    </p>
                  ) : null,
                )}
              </div>
            );
          default:
            return (
              <p key={i} style={p}>
                {renderInline(b.text, keywords, { numbers: true })}
              </p>
            );
        }
      })}
    </article>
  );
}
